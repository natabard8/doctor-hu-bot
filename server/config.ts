// Environment variables configuration
export const config = {
  // Telegram Bot Settings
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  
  // OpenAI API Settings
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  
  // Admin Settings
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || "", // Admin's Telegram ID for notifications
  adminTelegramIds: process.env.ADMIN_TELEGRAM_ID?.split(',') || [], // Array of admin Telegram IDs
  adminNotifications: true, // Enable/disable admin notifications
  
  // General Settings
  isDevelopment: process.env.NODE_ENV !== "production",
  
  // Default responses
  defaultWelcomeMessage: "👋 Здравствуйте! Я секретарь Доктора Ху, помогаю организовать лечение в Китае.\n\nПредставьтесь, пожалуйста, как я могу к вам обращаться? 🤗",
  defaultHelpMessage: "Доступные команды:\n\n/start - Начать общение\n/help - Показать эту справку\n/contact - Оставить контактные данные\n/reset - Начать заново\n\nМы организуем лечебные туры в Хуньчунь и Яньцзи! Тысячи пациентов уже вернулись здоровыми. Приезжайте и вы!\n\nРасскажите, что вас беспокоит, и я подберу для вас лучшую клинику в Китае.",
  
  // Bot Settings
  botName: "Секретарь Доктора Ху",
  botDescription: "Виртуальный секретарь медицинского специалиста из Китая",
  
  // Feature Toggles
  googleSheetsEnabled: true,  // Google Sheets integration for saving user data
  googleSheetsId: process.env.GOOGLE_SHEETS_ID || '',  // Spreadsheet ID for saving data
  enableGroupMode: true,     // Support for group chat functionality
  collectUserData: true,     // Collect user data (name, phone)
  customBotAvatar: true,     // Use custom avatar for the bot
  avatarPath: process.env.BOT_AVATAR_PATH || 'client/src/assets/doctor_hu_avatar.jpg', // Path to bot avatar
  
  // Website scraper settings
  websiteScraperEnabled: true, // Enable scraping information from Hunchun website
  websiteUrl: 'https://hunchun.ru', // URL of the website to scrape
  scrapingInterval: 24 * 60 * 60 * 1000, // Interval for refreshing website data in ms (24 hours)
  
  // Error messages
  missingTokenError: "Telegram bot token is missing. Please set the TELEGRAM_BOT_TOKEN environment variable.",
  missingOpenAIKeyError: "OpenAI API key is missing. Please set the OPENAI_API_KEY environment variable.",
  
  // Response templates
  responseTemplates: {
    askForPhone: "Спасибо за предоставленную информацию и мед.описания! Теперь для того, чтобы наш доктор изучил вашу ситуацию и подобрал подходящую клинику в Хуньчуне, пожалуйста, поделитесь вашим номером телефона. Мы перезвоним, рассчитаем точную стоимость лечения и подберем оптимальные сроки для поездки.",
    phoneReceived: "Отлично! Ваши контактные данные сохранены. Доктор получит всю информацию о вашей ситуации и скоро с вами свяжется. В Хуньчуне для вас подберут идеальное решение! Тысячи пациентов уже вернулись домой здоровыми. Приезжайте - и вы почувствуете результат!",
    transferToHuman: "Я передал вашу информацию специалисту. Спасибо за подробное описание вашей проблемы! В ближайшее время с вами свяжутся для консультации о лечении в Хуньчуне. Приезжайте к нам - мы поможем вам вернуть здоровье!",
    priceInquiry: "Цены на лечение в Хуньчуне в 3-5 раз ниже, чем в России! Ориентировочные цены вы можете найти на нашем сайте hunchun.ru. Для расчета точной стоимости нам нужно знать детали вашей проблемы. Расскажите, что вас беспокоит, пришлите результаты обследований если есть. После этого мы свяжемся с вами и подробно обсудим программу лечения.",
    humanTransfer: "Благодарю за подробное описание вашей ситуации! Я передаю вашу информацию нашему специалисту, который изучит ее и подберет для вас индивидуальную программу лечения в Хуньчуне. Тысячи пациентов с похожими проблемами уже получили помощь в наших клиниках. Ждите звонка в ближайшее время!",
    tooManyQuestions: "У вас много интересных вопросов! Тысячи пациентов, как и вы, интересуются лечением в Китае. Расскажите, пожалуйста, о своей главной проблеме со здоровьем? После этого пришлите результаты обследований, и мы подберем для вас подходящую клинику в Хуньчуне.",
    silenceBot: "Я буду ожидать, когда вы снова захотите продолжить общение. Если понадобится информация о лечении в Хуньчуне, используйте ключевые слова 'доктор', 'хуньчунь' или 'лечение'.",
    resetConversation: "Начинаем общение заново! Представьтесь, пожалуйста. Как я могу к вам обращаться? В Хуньчуне мы помогли тысячам пациентов вернуть здоровье!",
    groupChatInvite: "В Хуньчуне и Яньцзи более 30 специализированных клиник! Для подробной информации посетите наш сайт hunchun.ru. Предлагаю продолжить общение в личных сообщениях, где я смогу узнать детали вашей проблемы и подобрать подходящую клинику. Тысячи пациентов уже вернулись домой здоровыми. Приезжайте и вы!",
    alertAdmin: "Мне нужна помощь оператора. Пожалуйста, подключитесь к разговору, чтобы продолжить консультацию о лечении в Китае.",
    adminNotificationNewUser: "🔔 НОВЫЙ ПОЛЬЗОВАТЕЛЬ:\nИмя: {name}\nUsername: {username}\nID: {telegramId}\nСообщение: {message}",
    adminNotificationUserRequest: "⚠️ ЗАПРОС ОПЕРАТОРА:\nИмя: {name}\nUsername: {username}\nID: {telegramId}\nЗапрос: {message}",
    adminHumanTakeoverConfirmation: "✅ Запрос на ручное управление принят. Оператор подключился к диалогу.",
  },
  
  // Bot Conversation Settings
  conversationSettings: {
    maxMessageLength: 500,        // Messages longer than this will trigger transfer to human
    maxQuestionCount: 3,          // Number of questions that will trigger transfer to human
    historyLength: 10,            // Number of messages to keep in conversation history
    silenceTimeout: 60 * 60 * 24, // Time in seconds before silenced bot auto-reactivates (24 hours)
    activationWords: [
      // Города и места
      'доктор', 'хуньчунь', 'яньцзи', 'китай', 'hunchun', 'yanbian', 'yanji', 'china',
      // Медицинские термины
      'медицина', 'клиника', 'лечение', 'врач', 'здоровье', 'больница', 'госпиталь', 'операция', 'диагностика', 'лекарства',
      'medicine', 'clinic', 'doctor', 'treatment', 'hospital', 'health', 'diagnosis', 'therapy', 'surgery',
      // Заболевания
      'болезнь', 'заболевание', 'боль', 'симптомы', 'диабет', 'гипертония', 'артрит', 'спина', 'сустав', 'хронический',
      'disease', 'illness', 'pain', 'symptoms', 'diabetes', 'arthritis', 'spine', 'joint', 'chronic',
      // Обращения
      'подскажите', 'помогите', 'вопрос', 'тур', 'путевка', 'стоимость', 'цена', 'сколько стоит',
      'help', 'question', 'tour', 'cost', 'price', 'how much'
    ],
    negativeWords: ['недоволен', 'плохо', 'ужасно', 'отвратительно', 'обман', 'мошенник', 'развод', 'верну деньги', 'возврат', 'жалоба'],
    stopWords: ['стоп', 'хватит', 'замолчи', 'закончить', 'прекрати', 'не отвечай', 'не пиши', 'отстань', 'пауза'],
  },
  
  // Button Labels
  buttonLabels: {
    appointment: "🏥 Рассказать о своей проблеме",
    question: "📋 Узнать о ценах на лечение",
    learnAboutMedicine: "🌐 Спросить о клиниках Хуньчуня",
    aboutClinic: "🧳 Записаться на лечебный тур",
    sharePhone: "📱 Поделиться номером телефона",
    leaveContact: "📞 Отправить контакт для консультации",
    privateChatButton: "💬 Перейти в личный чат",
  }
};

// Validate required configuration
export function validateConfig() {
  if (!config.telegramToken) {
    throw new Error(config.missingTokenError);
  }
  
  if (!config.openaiApiKey) {
    throw new Error(config.missingOpenAIKeyError);
  }
}
