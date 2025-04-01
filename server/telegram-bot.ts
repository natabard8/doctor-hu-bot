import TelegramBot from "node-telegram-bot-api";
import { config, validateConfig } from "./config";
import { storage } from "./storage";
import { log } from "./vite";
import { generateResponse, handleBotCommandWithAI } from "./openai-service";
import { InsertTelegramUser, InsertMessage, TelegramUser } from "@shared/schema";
import { isValidBotCommand, truncateText } from "./utils";
import { saveUserToSheets, logInteractionToSheets, initGoogleSheets } from "./google-sheets";
import fs from "fs";
import path from "path";

// Bot instance
let bot: TelegramBot;

// Track silenced users globally
const silencedUsers = new Set<number>();

// Track manual intervention by admin
const adminManagedChats = new Set<string>();

/**
 * Initialize and start the Telegram bot
 */
export async function initBot(): Promise<TelegramBot> {
  validateConfig();
  
  // Create bot instance with polling
  bot = new TelegramBot(config.telegramToken, { polling: true });
  
  log("Telegram bot initialized", "telegram");
  
  // Initialize Google Sheets integration if enabled
  if (config.googleSheetsEnabled) {
    const sheetsInitialized = await initGoogleSheets();
    if (sheetsInitialized) {
      log("Google Sheets integration initialized successfully", "telegram");
    } else {
      log("Google Sheets integration failed to initialize", "telegram");
    }
  }
  
  // Set custom profile photo if enabled
  if (config.customBotAvatar) {
    try {
      const avatarPath = config.avatarPath;
      if (fs.existsSync(avatarPath)) {
        // Get bot info
        const me = await bot.getMe();
        // Unfortunately, bot.setMyPhoto is not available in this version of the library
        // We can use the Send Photo API endpoint instead or other methods in future updates
        log(`Custom avatar is configured but automatic setting is not available in this version of node-telegram-bot-api`, "telegram");
        log(`To set the bot avatar, please use @BotFather manually with the image at ${avatarPath}`, "telegram");
      } else {
        log(`Avatar file not found at path: ${avatarPath}`, "telegram");
      }
    } catch (error: any) {
      log(`Error with bot avatar configuration: ${error.message}`, "telegram");
    }
  }
  
  // Set bot commands
  await bot.setMyCommands([
    { command: '/start', description: 'Начать или перезапустить бота' },
    { command: '/help', description: 'Показать справку' },
    { command: '/contact', description: 'Оставить контактные данные' },
    { command: '/reset', description: 'Сбросить историю разговора' },
    { command: '/alertadmin', description: 'Связаться с оператором' },
  ]);
  
  // Handle incoming messages
  bot.on("message", async (msg) => {
    try {
      const chatId = msg.chat.id.toString();
      const telegramId = msg.from?.id.toString() || "";
      const messageText = msg.text || "";
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      
      // Обработка изображений (МРТ снимки)
      if (msg.photo && msg.photo.length > 0) {
        await handlePhotoMessage(msg, telegramId, chatId);
        return;
      }
      
      // Обработка документов (могут быть результаты анализов)
      if (msg.document) {
        await handleDocumentMessage(msg, telegramId, chatId);
        return;
      }
      
      // Проверка на медицинский запрос: если пользователь пишет о болезни, боли или проблеме
      const medicalWords = ['болит', 'боль', 'болезнь', 'проблема', 'лечение', 
                            'заболевание', 'вылечить', 'здоровье', 'недуг',
                            'поставить', 'имплант', 'протез', 'зуб', 'мост', 'керамика'];
      const isMedicalRequest = medicalWords.some(word => messageText.toLowerCase().includes(word));
      
      // Получаем пользователя перед проверкой медицинского запроса
      const checkUser = await storage.getTelegramUserByTelegramId(telegramId);
      if (checkUser && !checkUser.isWaitingForUsername && !checkUser.isWaitingForPhone && 
          !checkUser.isWaitingForMedicalInfo && isMedicalRequest) {
        // Если пользователь уже представился, и это медицинский запрос - запрашиваем снимки/документы
        await storage.createMessage({
          telegramUserId: checkUser.id,
          content: messageText,
          isFromUser: true
        });
        
        // Переходим к запросу МРТ снимков или дополнительной информации
        await askForMedicalImages(chatId, checkUser.id);
        
        if (config.adminNotifications) {
          await notifyAdmin(checkUser, `Пользователь описал проблему: ${messageText}. Запрашиваем МРТ/описание.`, 'user_update');
        }
        
        return;
      }
      
      // Handle contact info (phone number)
      if (msg.contact && msg.contact.phone_number) {
        await handleContactMessage(msg, telegramId, chatId);
        return;
      }
      
      if (!telegramId) {
        log("Message received without user ID", "telegram");
        return;
      }
      
      log(`Message received from ${telegramId}: ${truncateText(messageText, 50)}`, "telegram");
      
      // Get or create user
      let user = await storage.getTelegramUserByTelegramId(telegramId);
      
      // First-time user handling
      if (!user) {
        await createNewUser(telegramId, chatId, msg.from);
        // Ask for username with welcome keyboard
        await sendWelcomeMessage(chatId);
        return;
      }
      
      // User is waiting to set username
      if (user.isWaitingForUsername) {
        // Update username
        await storage.updateTelegramUserUsername(user.id, messageText);
        
        // После получения имени сразу спрашиваем о проблеме со здоровьем
        await bot.sendMessage(chatId, `Очень приятно, ${messageText}! Расскажите, что вас беспокоит? С какой проблемой со здоровьем вы хотели бы справиться?`, {
          reply_markup: getMainKeyboard()
        });
        
        // Устанавливаем статус ожидания информации о медицинской проблеме
        await storage.updateMedicalInfoStatus(user.id, true);
        
        // Log this interaction with the username update
        if (config.adminNotifications) {
          await notifyAdmin(user, `Пользователь представился: ${messageText}. Спрашиваем о проблеме со здоровьем.`, 'user_update');
        }
        
        return;
      }
      
      // Пользователь ответил на вопрос о медицинской проблеме
      if (user.isWaitingForMedicalInfo) {
        // Сохраняем информацию о медицинской проблеме
        await storage.createMessage({
          telegramUserId: user.id,
          content: messageText,
          isFromUser: true
        });
        
        // Переходим к следующему шагу - запросу МРТ или описания
        await askForMedicalImages(chatId, user.id);
        
        // Обновляем статус ожидания
        await storage.updateMedicalInfoStatus(user.id, false);
        
        // Log this interaction
        if (config.adminNotifications) {
          await notifyAdmin(user, `Пользователь описал проблему: ${messageText}. Запрашиваем МРТ/описание.`, 'user_update');
        }
        
        return;
      }
      
      // Check if message contains a phone number
      const phoneRegex = /(?:\+|\d)[\d\s\-\(\)]{9,20}/;
      const phoneMatch = messageText.match(phoneRegex);
      
      // Также проверяем WhatsApp формат, который часто выглядит так: +xx xxx xxx-xx-xx
      const whatsappRegex = /\+\d{1,3}\s?\d{1,4}\s?\d{1,4}[-\s]?\d{1,2}[-\s]?\d{1,2}/;
      const whatsappMatch = messageText.match(whatsappRegex);
      
      // User is waiting to provide phone number or user sent a phone-like message
      if ((user.isWaitingForPhone && config.collectUserData) || phoneMatch || whatsappMatch) {
        // If they sent text instead of using the button
        if (messageText && !msg.contact) {
          // If we found a phone number in the message
          if (phoneMatch || whatsappMatch) {
            // Предпочитаем номер телефона WhatsApp формата, если он есть
            const phoneNumber = whatsappMatch ? whatsappMatch[0].trim() : phoneMatch ? phoneMatch[0].trim() : '';
            await storage.updateTelegramUserPhone(user.id, phoneNumber);
            
            // Mark the user as not waiting for phone anymore
            await storage.updateTelegramUserUsername(user.id, user.username || user.firstName || "");
            
            // Форматируем телефон для WhatsApp ссылки
            const whatsappNumber = phoneNumber.replace(/\s+/g, '').replace(/[()-]/g, '');
            const whatsappLink = `https://wa.me/${whatsappNumber.startsWith('+') ? whatsappNumber.substring(1) : whatsappNumber}`;
            
            // Send confirmation с ссылкой на WhatsApp
            await bot.sendMessage(chatId, `${config.responseTemplates.phoneReceived}\n\nВаш телефон для WhatsApp: [${phoneNumber}](${whatsappLink})`, {
              parse_mode: 'Markdown',
              reply_markup: getMainKeyboard()
            });
            
            // Log this phone collection for admin
            if (config.adminNotifications) {
              await notifyAdmin(user, `Пользователь предоставил номер телефона: ${phoneNumber}\nWhatsApp ссылка: ${whatsappLink}`, 'new_user');
            }
            return;
          } else if (user.isWaitingForPhone) {
            // Simple validation for phone format for explicit phone requests
            const strictPhoneRegex = /^(\+?[\d\s\-\(\)]{10,15})$/;
            if (strictPhoneRegex.test(messageText.trim())) {
              const phoneNumber = messageText.trim();
              await storage.updateTelegramUserPhone(user.id, phoneNumber);
              
              // Форматируем телефон для WhatsApp ссылки
              const whatsappNumber = phoneNumber.replace(/\s+/g, '').replace(/[()-]/g, '');
              const whatsappLink = `https://wa.me/${whatsappNumber.startsWith('+') ? whatsappNumber.substring(1) : whatsappNumber}`;
              
              // Send confirmation с ссылкой на WhatsApp
              await bot.sendMessage(chatId, `${config.responseTemplates.phoneReceived}\n\nВаш телефон для WhatsApp: [${phoneNumber}](${whatsappLink})`, {
                parse_mode: 'Markdown',
                reply_markup: getMainKeyboard()
              });
            } else {
              // Invalid phone format
              await askForPhone(chatId, user.id, true); // resend with error message
            }
            return;
          }
        }
      }
      
      // Store user message
      await storage.createMessage({
        telegramUserId: user.id,
        content: messageText,
        isFromUser: true
      });
      
      // Log message to Google Sheets if enabled
      if (config.googleSheetsEnabled) {
        await logInteractionToSheets(
          user.id,
          telegramId,
          messageText,
          true,
          'message'
        );
      }
      
      // Handle commands
      if (messageText.startsWith("/")) {
        await handleBotCommand(messageText, user.id, user.username || "Пользователь", chatId);
        return;
      }
      
      // Handle common keyboard button presses
      if (messageText === config.buttonLabels.appointment) {
        await bot.sendMessage(chatId, "Расскажите, пожалуйста, какая проблема со здоровьем вас беспокоит? Опишите подробно симптомы, как давно они появились, и какие методы лечения вы уже пробовали. Тысячи пациентов с похожими проблемами уже вылечились в Хуньчуне!", {
          reply_markup: getMainKeyboard()
        });
        return;
      }
      
      if (messageText === config.buttonLabels.question) {
        await bot.sendMessage(chatId, "Цены на лечение в Хуньчуне в 3-5 раз ниже, чем в России! Лечение большинства заболеваний стоит от 30 до 200 тысяч рублей с проживанием. Точную стоимость рассчитаем после изучения вашей ситуации. Расскажите, пожалуйста, какая проблема вас беспокоит?", {
          reply_markup: getMainKeyboard()
        });
        return;
      }
      
      if (messageText === config.buttonLabels.learnAboutMedicine) {
        await bot.sendMessage(chatId, "В Хуньчуне и Яньцзи более 30 специализированных клиник! Среди них: Центр ТКМ, Клиника доктора Вана, Международный медцентр, Госпиталь Дружбы и другие. Какое заболевание вас беспокоит? Я подскажу, какая клиника специализируется именно на вашей проблеме.", {
          reply_markup: getMainKeyboard()
        });
        return;
      }
      
      if (messageText === config.buttonLabels.aboutClinic) {
        // Send information about tour booking
        const tourInfo = "🧳 **Лечебный тур в Хуньчунь**\n\nМы организуем всё под ключ: виза + трансфер + проживание + лечение! Тысячи пациентов уже вылечились в наших клиниках.\n\nРасскажите, пожалуйста, какая проблема со здоровьем вас беспокоит? После этого пришлите результаты обследований, и только потом оставьте контакт - наш врач подберет для вас клинику и рассчитает стоимость.";
        
        await bot.sendMessage(chatId, tourInfo, {
          parse_mode: "Markdown",
          reply_markup: getMainKeyboard()
        });
        return;
      }
      
      // Фильтр для групповых чатов - только отвечаем на сообщения с ключевыми словами
      if (isGroup) {
        const lowercaseMsg = messageText.toLowerCase();
        const containsActivationWord = config.conversationSettings.activationWords.some(word => 
          lowercaseMsg.includes(word.toLowerCase())
        );
        
        // В групповых чатах отвечаем только если сообщение содержит ключевые слова
        if (!containsActivationWord) {
          log(`Игнорируем сообщение в группе без ключевых слов: ${truncateText(messageText, 50)}`, "telegram");
          return;
        }
      }
      
      // Check if this chat is being managed by admin
      if (adminManagedChats.has(telegramId)) {
        // If admin is managing, forward message to admin
        try {
          // Send message to admin with user info
          await bot.sendMessage(config.adminTelegramId, `💬 [${user.firstName || 'Пользователь'}]: ${messageText}`);
          
          // Store message but don't generate AI response
          await storage.updateTelegramUserLastActive(user.id);
          return;
        } catch (error) {
          log(`Error forwarding message to admin: ${error}`, "telegram");
          // If failed to forward, proceed with regular bot processing
        }
      }
      
      // Check if user is silenced (unless it's an activation word)
      if (user.isSilenced) {
        const lowercaseMsg = messageText.toLowerCase();
        const activationWords = config.conversationSettings.activationWords;
        const containsActivationWord = activationWords.some(word => lowercaseMsg.includes(word));
        
        if (!containsActivationWord) {
          log(`Ignoring message from silenced user ${user.id}`, "telegram");
          return;
        } else {
          // Activate the bot again for this user
          await storage.updateTelegramUserSilenceStatus(user.id, false);
          await bot.sendMessage(chatId, `Я снова здесь и готов помочь вам! Чем могу быть полезен?`);
        }
      }
      
      // Send "typing" action
      await bot.sendChatAction(chatId, "typing");
      
      // Generate AI response
      const response = await generateResponse(messageText, user.username || "Пользователь", isGroup);
      
      // Store bot message
      await storage.createMessage({
        telegramUserId: user.id,
        content: response,
        isFromUser: false
      });
      
      // Log bot response to Google Sheets if enabled
      if (config.googleSheetsEnabled) {
        await logInteractionToSheets(
          user.id,
          telegramId,
          response,
          false,
          'message'
        );
      }
      
      // Special handling for different response types
      if (response.includes("передаю ваше обращение нашему специалисту") || 
          response.includes("я передаю ваше обращение")) {
        // Transfer to human
        await storage.transferToHuman(user.id);
        await bot.sendMessage(chatId, response, {
          reply_markup: getContactKeyboard()
        });
      } else if (response.includes("буду ожидать, когда вы снова захотите продолжить общение")) {
        // Silence the bot for this user
        await storage.updateTelegramUserSilenceStatus(user.id, true);
        await bot.sendMessage(chatId, response);
      } else if (response.includes("начинаем разговор заново")) {
        // Reset conversation
        await storage.resetConversation(user.id);
        await bot.sendMessage(chatId, response, {
          reply_markup: getMainKeyboard()
        });
      } else if ((response.includes("предлагаю продолжить наше общение в личных сообщениях") || 
                response.includes("напишите мне в личные сообщения") || 
                response.includes("личном чате")) && isGroup) {
        // Invitation to private chat with button
        const botInfo = await bot.getMe();
        await bot.sendMessage(chatId, response, {
          reply_markup: {
            inline_keyboard: [
              [{ text: config.buttonLabels.privateChatButton, url: `https://t.me/${botInfo.username}` }]
            ]
          }
        });
      } else {
        // Regular response
        // For group chats, don't show keyboard
        if (isGroup) {
          await bot.sendMessage(chatId, response);
        } else {
          await bot.sendMessage(chatId, response, {
            reply_markup: getMainKeyboard()
          });
        }
      }
      
      // Update last activity
      await storage.updateTelegramUserLastActive(user.id);
      
    } catch (error: any) {
      log(`Error handling message: ${error.message}`, "telegram");
    }
  });
  
  // Handle callback queries (button clicks)
  bot.on('callback_query', async (query) => {
    if (!query.message || !query.from.id) return;
    
    const chatId = query.message.chat.id.toString();
    const userId = query.from.id.toString();
    const data = query.data || '';
    
    try {
      // Check for takeover request from admin
      if (data.startsWith('takeover_')) {
        const targetUserId = data.replace('takeover_', '');
        const success = await adminTakeOverConversation(userId, targetUserId);
        
        // Answer callback query with appropriate message
        if (success) {
          await bot.answerCallbackQuery(query.id, { text: "Вы подключились к чату с пользователем" });
        } else {
          await bot.answerCallbackQuery(query.id, { text: "Не удалось подключиться к чату" });
        }
        return;
      }
      
      const user = await storage.getTelegramUserByTelegramId(userId);
      if (!user) return;
      
      log(`Received callback query: ${data} from user ${userId}`, "telegram");
      
      switch (data) {
        case 'contact':
          // Check if we've collected enough info about user's problem
          const recentMessages = await storage.getMessages(user.id, 10);
          const userMessages = recentMessages.filter(msg => msg.isFromUser).map(msg => msg.content);
          
          if (userMessages.length < 2 || userMessages.join(' ').length < 50) {
            // Not enough info collected
            await bot.sendMessage(chatId, "Для качественной консультации расскажите сначала о вашей проблеме подробнее. Какое заболевание вас беспокоит? Как давно? Какие методы лечения вы уже пробовали? В Хуньчуне успешно лечат даже хронические заболевания!", {
              reply_markup: getMainKeyboard()
            });
          } else {
            // Запрашиваем МРТ снимки или доп.описание перед получением телефона
            await askForMedicalImages(chatId, user.id);
          }
          break;
          
        case 'appointment':
          await bot.sendMessage(chatId, "Расскажите, пожалуйста, какая проблема со здоровьем вас беспокоит? Опишите подробно симптомы, как давно они появились. После этого пришлите результаты обследований если есть, и только потом мы запросим ваш контакт для связи.", {
            reply_markup: getMainKeyboard()
          });
          break;
          
        case 'reset_conversation':
          await storage.resetConversation(user.id);
          await bot.sendMessage(chatId, "Начинаем разговор заново! Представьтесь, пожалуйста. Как я могу к вам обращаться? В Хуньчуне мы помогли тысячам пациентов вернуть здоровье!", {
            reply_markup: {
              remove_keyboard: true
            }
          });
          break;
          
        case 'join_chat':
          // This would typically lead to a group chat link
          await bot.sendMessage(chatId, "Присоединяйтесь к нашему групповому чату, где уже более 500 пациентов делятся опытом лечения в Хуньчуне! [Ссылка будет добавлена]");
          break;
      }
      
      // Answer callback query to clear the loading state
      await bot.answerCallbackQuery(query.id);
      
    } catch (error: any) {
      log(`Error handling callback query: ${error.message}`, "telegram");
    }
  });
  
  // Handler for admin messages to users
  bot.on("message", async (msg) => {
    try {
      // Skip non-admin messages
      if (!msg.from || msg.from.id.toString() !== config.adminTelegramId) {
        return;
      }
      
      const adminId = msg.from.id.toString();
      const messageText = msg.text || "";
      
      // Check for admin-to-user messages (format: @user_id message)
      if (messageText.startsWith("@") && messageText.includes(" ")) {
        const parts = messageText.split(" ");
        const targetUserId = parts[0].substring(1); // Remove @ symbol
        const responseText = parts.slice(1).join(" ");
        
        log(`Admin attempting to message user ${targetUserId}`, "telegram");
        
        // Forward message to user with error handling
        try {
          // Send message to target user
          await bot.sendMessage(targetUserId, responseText);
          log(`Admin message forwarded to user ${targetUserId}`, "telegram");
          
          // Add to admin-managed chats if not already there
          if (!adminManagedChats.has(targetUserId)) {
            adminManagedChats.add(targetUserId);
            await bot.sendMessage(adminId, `✅ Вы теперь управляете чатом с пользователем ID: ${targetUserId}`);
          }
          
          // Confirm to admin
          await bot.sendMessage(adminId, `✅ Сообщение отправлено пользователю ${targetUserId}`);
        } catch (err) {
          // Handle errors during message sending
          const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
          await bot.sendMessage(adminId, `❌ Ошибка при отправке сообщения пользователю ${targetUserId}: ${errorMessage}`);
          log(`Error sending admin message to user: ${errorMessage}`, "telegram");
        }
      }
    } catch (error) {
      // Handle outer errors
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
      log(`Error in admin message handler: ${errorMessage}`, "telegram");
    }
  });
  
  // Handle bot errors
  bot.on("polling_error", (error) => {
    log(`Polling error: ${error.message}`, "telegram");
  });
  
  return bot;
}

/**
 * Create a welcome message with keyboard
 */
async function sendWelcomeMessage(chatId: string): Promise<void> {
  console.log(`[telegram] Sending welcome message to chat: ${chatId}`);
  const welcomeMessage = `👋 Здравствуйте! Я секретарь Доктора Ху, помогаю организовать лечение в Китае.\n\nДля получения подробной информации о лечении в Хуньчуне вы можете посетить наш сайт hunchun.ru, где собрана вся важная информация о клиниках и методах лечения.\n\nПредставьтесь, пожалуйста, как я могу к вам обращаться? 🤗`;
  
  try {
    await bot.sendMessage(chatId, welcomeMessage, {
      reply_markup: {
        remove_keyboard: true
      }
    });
    console.log(`[telegram] Welcome message sent successfully to chat: ${chatId}`);
  } catch (error) {
    console.error(`[telegram] Error sending welcome message to chat ${chatId}:`, error);
  }
}

/**
 * Ask user for MRT scans or medical description
 */
async function askForMedicalImages(chatId: string, userId: number): Promise<void> {
  const message = "Спасибо за информацию о вашей проблеме! Для более точной диагностики и подбора клиники, пожалуйста, пришлите снимки МРТ, результаты анализов или подробное описание вашего заболевания. Это поможет нашим специалистам подобрать наиболее эффективное лечение в Хуньчуне.";
  
  try {
    await bot.sendMessage(chatId, message, {
      reply_markup: getMainKeyboard()
    });
    console.log(`[telegram] Asked for medical images/description to chat: ${chatId}`);
  } catch (error) {
    console.error(`[telegram] Error asking for medical images/description to chat ${chatId}:`, error);
  }
}

/**
 * Ask user for phone number
 */
async function askForPhone(chatId: string, userId: number, isRetry: boolean = false): Promise<void> {
  const message = isRetry 
    ? "Пожалуйста, введите корректный номер телефона или воспользуйтесь кнопкой 'Поделиться номером телефона'"
    : config.responseTemplates.askForPhone;
  
  // Update user's status to waiting for phone
  const user = await storage.getTelegramUser(userId);
  if (user) {
    // Apply updates to mark user as waiting for phone
    try {
      // If we have a username, update it to keep the same while flagging for phone
      if (user.username) {
        await storage.updateTelegramUserUsername(userId, user.username);
      }
    } catch (error) {
      log(`Error updating user status: ${error}`, "telegram");
    }
  }
  
  await bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: [
        [{ 
          text: config.buttonLabels.sharePhone, 
          request_contact: true 
        }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

/**
 * Handle received contact information
 */
async function handleContactMessage(
  msg: TelegramBot.Message,
  telegramId: string,
  chatId: string
): Promise<void> {
  try {
    const phone = msg.contact?.phone_number || "";
    
    if (!phone) {
      await bot.sendMessage(chatId, "Не удалось получить номер телефона. Пожалуйста, попробуйте еще раз.");
      return;
    }
    
    const user = await storage.getTelegramUserByTelegramId(telegramId);
    
    if (!user) {
      log(`Contact received but user not found: ${telegramId}`, "telegram");
      return;
    }
    
    // Update user's phone number
    const updatedUser = await storage.updateTelegramUserPhone(user.id, phone);
    
    // Форматируем телефон для WhatsApp ссылки
    const whatsappNumber = phone.replace(/\s+/g, '').replace(/[()-]/g, '');
    const whatsappLink = `https://wa.me/${whatsappNumber.startsWith('+') ? whatsappNumber.substring(1) : whatsappNumber}`;
    
    // Отправляем финальное сообщение с контактами операторов
    const thankYouMessage = "Спасибо за предоставленную информацию! 🙏\n\nМы изучили вашу ситуацию и готовы помочь организовать лечение в клиниках Хуньчуня и Яньцзи.\n\nНаши специалисты свяжутся с вами в ближайшее время для более подробной консультации.\n\nЕсли у вас есть дополнительные вопросы о здоровье или лечении, вы можете задать их прямо сейчас, либо обратиться к одному из наших операторов:";
    
    // Сохраняем ответ бота
    await storage.createMessage({
      telegramUserId: user.id,
      content: thankYouMessage,
      isFromUser: false
    });
    
    // Отправляем сообщение с клавиатурой операторов
    await bot.sendMessage(chatId, thankYouMessage, {
      parse_mode: 'Markdown',
      reply_markup: getOperatorContactsKeyboard()
    });
    
    // Через 2 секунды отправляем уточнение
    setTimeout(async () => {
      const finalQuestion = "Остались ли у вас еще вопросы о лечении или медицинском обслуживании в Китае? Я готов продолжить диалог или мы можем попрощаться и вы получите более подробную консультацию от специалиста.";
      
      // Сохраняем ответ бота
      await storage.createMessage({
        telegramUserId: user.id,
        content: finalQuestion,
        isFromUser: false
      });
      
      await bot.sendMessage(chatId, finalQuestion, {
        reply_markup: getMainKeyboard()
      });
    }, 2000);
    
    // Log interaction
    if (config.googleSheetsEnabled) {
      await logInteractionToSheets(
        user.id,
        telegramId,
        `Пользователь предоставил номер телефона: ${phone}`,
        true,
        'phone'
      );
      
      // Save user data to Google Sheets
      await saveUserToSheets(updatedUser, "Telegram Bot - Contact Button", "Пользователь добавил номер телефона через бота");
    }
    
  } catch (error: any) {
    log(`Error handling contact message: ${error.message}`, "telegram");
  }
}

/**
 * Get main keyboard
 */
function getMainKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "/alertadmin Связаться с оператором" }]
    ],
    resize_keyboard: true
  };
}

/**
 * Get keyboard with operator contacts
 */
function getOperatorContactsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💼 Наталья (общие вопросы)", url: "https://wa.me/94764836278" }],
      [{ text: "💆‍♀️ Алина (косметология/женское здоровье)", url: "https://wa.me/79681674007" }],
      [{ text: "👨‍⚕️ Екатерина (мужское здоровье/спина/суставы)", url: "https://wa.me/79025234803" }],
      [{ text: "🌐 Посетить сайт hunchun.ru", url: "https://hunchun.ru" }]
    ]
  };
}

/**
 * Get contact keyboard
 */
function getContactKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: config.buttonLabels.leaveContact, callback_data: "contact" }]
    ]
  };
}

/**
 * Create a new user record
 */
async function createNewUser(
  telegramId: string, 
  chatId: string, 
  from?: TelegramBot.User
): Promise<InsertTelegramUser & { id: number }> {
  const newUser: InsertTelegramUser = {
    telegramId,
    chatId,
    firstName: from?.first_name || "",
    lastName: from?.last_name || "",
    username: from?.username || "",
    phone: null,
    isWaitingForUsername: true,
    isWaitingForPhone: false,
    isSilenced: false,
    conversationHistory: null
  };
  
  const createdUser = await storage.createTelegramUser(newUser);
  
  // Log new user to Google Sheets if enabled
  if (config.googleSheetsEnabled) {
    await saveUserToSheets(createdUser, "Telegram Bot - New User", "Новый пользователь начал общение с ботом");
    await logInteractionToSheets(
      createdUser.id, 
      telegramId, 
      "Начало взаимодействия с ботом", 
      true,
      'command'
    );
  }
  
  // Notify admin about new user if enabled
  if (config.adminNotifications) {
    await notifyAdmin(createdUser, "Новый пользователь начал общение с ботом", 'new_user');
  }
  
  return createdUser;
}

/**
 * Handle bot commands like /start and /help
 */
async function handleBotCommand(
  command: string,
  userId: number,
  username: string,
  chatId: string
): Promise<void> {
  console.log(`[telegram] Handling bot command: ${command} for user ID: ${userId}, chat ID: ${chatId}`);
  try {
    // Handle special commands
    if (command === "/start") {
      console.log(`[telegram] Received /start command - sending welcome message to chat ID: ${chatId}`);
      // Reset user state and ask for username again
      await storage.resetConversation(userId);
      await sendWelcomeMessage(chatId);
      return;
    }
    
    if (command === "/contact") {
      // Check if we've collected enough info about user's problem
      const recentMessages = await storage.getMessages(userId, 10);
      const userMessages = recentMessages.filter(msg => msg.isFromUser).map(msg => msg.content);
      
      if (userMessages.length < 2 || userMessages.join(' ').length < 50) {
        // Not enough info collected
        await bot.sendMessage(chatId, "Для качественной консультации расскажите сначала о вашей проблеме подробнее. Какое заболевание вас беспокоит? Как давно? В Хуньчуне успешно лечат даже хронические заболевания, которые годами беспокоят пациентов!", {
          reply_markup: getMainKeyboard()
        });
      } else {
        // Следуем новой последовательности: сначала запрашиваем МРТ снимки или описание
        await askForMedicalImages(chatId, userId);
      }
      return;
    }
    
    if (command === "/reset") {
      // Reset conversation
      await storage.resetConversation(userId);
      await bot.sendMessage(chatId, "История разговора очищена. Начинаем общение заново!", {
        reply_markup: getMainKeyboard()
      });
      return;
    }
    
    // Handle alert admin command
    if (command.startsWith("/alertadmin")) {
      await handleAlertAdminCommand(userId, chatId, command);
      return;
    }
    
    // Add command to bot commands list during initialization
    if (command === "/help") {
      const helpText = "Доступные команды:\n" +
        "/start - Начать или перезапустить бота\n" +
        "/help - Показать эту справку\n" +
        "/contact - Оставить контактные данные\n" +
        "/reset - Сбросить историю разговора\n" +
        "/alertadmin - Связаться с оператором";
      
      await bot.sendMessage(chatId, helpText, {
        reply_markup: getMainKeyboard()
      });
      return;
    }
    
    // For other commands, use AI to generate response
    const response = await handleBotCommandWithAI(command, username);
    
    // Store bot response
    await storage.createMessage({
      telegramUserId: userId,
      content: response,
      isFromUser: false
    });
    
    // Send response with keyboard for standard commands
    await bot.sendMessage(chatId, response, {
      reply_markup: getMainKeyboard()
    });
  } catch (error: any) {
    log(`Error handling command ${command}: ${error.message}`, "telegram");
  }
}

/**
 * Send notification to admin
 */
async function notifyAdmin(
  telegramUser: TelegramUser, 
  message: string, 
  notificationType: 'new_user' | 'alert_admin' | 'human_takeover' = 'new_user'
): Promise<boolean> {
  try {
    // Check if admin notifications are enabled and admin ID is set
    if (!config.adminNotifications || !config.adminTelegramId) {
      log('Admin notifications disabled or admin ID not set', 'telegram');
      return false;
    }
    
    // Format the notification message based on type
    let notificationText = '';
    
    if (notificationType === 'new_user') {
      notificationText = `🆕 НОВЫЙ ПОЛЬЗОВАТЕЛЬ\nИмя: ${telegramUser.firstName || 'Неизвестно'}\nUsername: ${telegramUser.username || 'Не указан'}\nID: ${telegramUser.telegramId}\nПервое сообщение: ${message || 'Начал общение с ботом'}`;
    } 
    else if (notificationType === 'alert_admin') {
      notificationText = `🔔 ЗАПРОС ОТ ПОЛЬЗОВАТЕЛЯ\nИмя: ${telegramUser.firstName || 'Неизвестно'}\nUsername: ${telegramUser.username || 'Не указан'}\nID: ${telegramUser.telegramId}\nСообщение: ${message}`;
    }
    else if (notificationType === 'human_takeover') {
      notificationText = `🔴 ЗАПРОС НА РУЧНОЕ УПРАВЛЕНИЕ\nИмя: ${telegramUser.firstName || 'Неизвестно'}\nUsername: ${telegramUser.username || 'Не указан'}\nID: ${telegramUser.telegramId}\nЗапрос: ${message}`;
    }

    // Get recent messages from user (last 5)
    const recentMessages = await storage.getMessages(telegramUser.id, 5);
    if (recentMessages && recentMessages.length > 0) {
      notificationText += "\n\n📝 Последние сообщения:";
      for (const msg of recentMessages) {
        const fromLabel = msg.isFromUser ? "👤 Пользователь" : "🤖 Бот";
        notificationText += `\n${fromLabel}: ${truncateText(msg.content, 100)}`;
      }
    }
    
    // Add take over button for admin
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { 
            text: '✅ Взять на себя разговор', 
            callback_data: `takeover_${telegramUser.telegramId}` 
          }
        ]
      ]
    };
    
    // Send notification to admin
    try {
      await bot.sendMessage(config.adminTelegramId, notificationText, {
        reply_markup: inlineKeyboard
      });
    } catch (adminError: any) {
      log(`Failed to notify admin: ${adminError.message}`, 'telegram');
    }
    
    log(`Admin notification sent: ${notificationType}`, 'telegram');
    return true;
  } catch (error: any) {
    log(`Error sending admin notification: ${error.message}`, 'telegram');
    return false;
  }
}

/**
 * Take over conversation as admin
 */
async function adminTakeOverConversation(adminId: string, userTelegramId: string): Promise<boolean> {
  try {
    // Verify this is really the admin
    if (!config.adminTelegramId || adminId !== config.adminTelegramId) {
      log(`Unauthorized takeover attempt by ${adminId}`, 'telegram');
      return false;
    }
    
    // Get user
    const user = await storage.getTelegramUserByTelegramId(userTelegramId);
    if (!user) {
      log(`Takeover failed: User ${userTelegramId} not found`, 'telegram');
      return false;
    }
    
    // Mark this chat as managed by admin
    adminManagedChats.add(userTelegramId);
    
    // Notify user that an operator has joined
    await bot.sendMessage(userTelegramId, "👨‍💼 Оператор подключился к разговору и скоро ответит на ваши вопросы. Спасибо за ожидание!");
    
    // Notify admin
    await bot.sendMessage(adminId, `✅ Вы подключились к разговору с пользователем ${user.username || user.firstName || 'Неизвестно'} (ID: ${userTelegramId})`);
    
    log(`Admin ${adminId} took over conversation with user ${userTelegramId}`, 'telegram');
    return true;
  } catch (error: any) {
    log(`Error in admin takeover: ${error.message}`, 'telegram');
    return false;
  }
}

/**
 * Handle alert admin command
 */
async function handleAlertAdminCommand(userId: number, chatId: string, message: string): Promise<void> {
  try {
    // Get user
    const user = await storage.getTelegramUser(userId);
    if (!user) {
      log(`Alert admin failed: User ${userId} not found`, 'telegram');
      return;
    }
    
    // Extract message content (remove command part)
    let alertMessage = message.replace('/alertadmin', '').trim();
    if (!alertMessage) {
      alertMessage = "Пользователь запросил оператора (без дополнительной информации)";
    }
    
    // Notify admin
    const notified = await notifyAdmin(user, alertMessage, 'alert_admin');
    
    // Respond to user
    if (notified) {
      await bot.sendMessage(chatId, "Ваш запрос передан оператору. Ожидайте ответа, обычно это занимает не более 10-15 минут в рабочее время.");
    } else {
      await bot.sendMessage(chatId, "К сожалению, сейчас невозможно связаться с оператором. Пожалуйста, попробуйте позже или продолжите общение с ботом.");
    }
  } catch (error: any) {
    log(`Error handling alert admin command: ${error.message}`, 'telegram');
  }
}

/**
 * Handle received photo message (MRI scans)
 */
async function handlePhotoMessage(
  msg: TelegramBot.Message,
  telegramId: string,
  chatId: string
): Promise<void> {
  try {
    if (!msg.photo || msg.photo.length === 0) {
      return;
    }
    
    const user = await storage.getTelegramUserByTelegramId(telegramId);
    if (!user) {
      log(`Photo received but user not found: ${telegramId}`, "telegram");
      return;
    }
    
    // Сохраняем информацию о полученном фото
    await storage.createMessage({
      telegramUserId: user.id,
      content: "Прислал фото/МРТ снимок",
      isFromUser: true
    });
    
    const caption = msg.caption || "МРТ снимок без описания";
    
    // Уведомляем админа
    if (config.adminNotifications) {
      // Пересылаем фото админу
      try {
        // Получаем ID самого большого фото
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        await bot.sendPhoto(config.adminTelegramId, photoId, {
          caption: `📷 Пользователь ${user.username || user.firstName || 'ID:' + user.telegramId} прислал МРТ/фото: ${caption}`
        });
      } catch (err) {
        log(`Ошибка при пересылке фото админу: ${err}`, "telegram");
      }
    }
    
    // Получим историю сообщений для анализа
    const userMessages = await storage.getMessages(user.id, 10);
    const photoCount = userMessages.filter(m => 
      m.isFromUser && (m.content.includes("МРТ снимок") || m.content.includes("фото"))
    ).length;
    
    // Получить информацию о документах
    const docCount = userMessages.filter(m => 
      m.isFromUser && m.content.includes("документ")
    ).length;
    
    const totalMediaCount = photoCount + docCount;
    
    if (totalMediaCount === 1) {
      // Это первый снимок/документ - сразу просим номер телефона
      await bot.sendMessage(chatId, "Спасибо за предоставленные материалы! Теперь, чтобы наш доктор мог детально изучить вашу ситуацию и подобрать подходящую клинику в Хуньчуне, пожалуйста, поделитесь своим номером телефона:");
      await askForPhone(chatId, user.id);
    } else {
      // Это дополнительный снимок - сразу просим телефон
      await bot.sendMessage(chatId, "Спасибо за дополнительные материалы! У нас достаточно информации для первичной консультации. Пожалуйста, оставьте ваш номер телефона, и наш специалист свяжется с вами для подробной консультации:");
      await askForPhone(chatId, user.id);
    }
    
    // Log this interaction
    if (config.googleSheetsEnabled) {
      await logInteractionToSheets(
        user.id,
        telegramId,
        `Пользователь прислал МРТ/фото: ${caption}`,
        true,
        'photo'
      );
    }
    
  } catch (error: any) {
    log(`Error handling photo message: ${error.message}`, "telegram");
  }
}

/**
 * Handle received document message (medical results)
 */
async function handleDocumentMessage(
  msg: TelegramBot.Message,
  telegramId: string,
  chatId: string
): Promise<void> {
  try {
    if (!msg.document) {
      return;
    }
    
    const user = await storage.getTelegramUserByTelegramId(telegramId);
    if (!user) {
      log(`Document received but user not found: ${telegramId}`, "telegram");
      return;
    }
    
    const fileName = msg.document.file_name || "Документ без имени";
    
    // Сохраняем информацию о полученном документе
    await storage.createMessage({
      telegramUserId: user.id,
      content: `Прислал документ: ${fileName}`,
      isFromUser: true
    });
    
    // Уведомляем админа
    if (config.adminNotifications) {
      // Пересылаем документ админу
      try {
        await bot.sendDocument(config.adminTelegramId, msg.document.file_id, {
          caption: `📄 Пользователь ${user.username || user.firstName || 'ID:' + user.telegramId} прислал документ: ${fileName}`
        });
      } catch (err) {
        log(`Ошибка при пересылке документа админу: ${err}`, "telegram");
      }
    }
    
    // Получаем историю сообщений
    const userMessages = await storage.getMessages(user.id, 10);
    const docCount = userMessages.filter(m => 
      m.isFromUser && m.content.includes("документ")
    ).length;
    
    // Подсчитываем общее количество фото и документов
    const photoCount = userMessages.filter(m => 
      m.isFromUser && (m.content.includes("МРТ снимок") || m.content.includes("фото"))
    ).length;
    
    const totalMediaCount = docCount + photoCount;
    
    // В любом случае просим номер телефона после получения документа
    await bot.sendMessage(chatId, "Спасибо за предоставленные медицинские документы! Наши специалисты изучат их и подготовят для вас индивидуальные рекомендации по лечению в Хуньчуне. Пожалуйста, оставьте ваш номер телефона для связи:");
    await askForPhone(chatId, user.id);
    
    // Log this interaction
    if (config.googleSheetsEnabled) {
      await logInteractionToSheets(
        user.id,
        telegramId,
        `Пользователь прислал документ: ${fileName}`,
        true,
        'document'
      );
    }
    
  } catch (error: any) {
    log(`Error handling document message: ${error.message}`, "telegram");
  }
}

export function stopBot(): void {
  if (bot) {
    bot.stopPolling();
    log("Telegram bot stopped", "telegram");
  }
}
