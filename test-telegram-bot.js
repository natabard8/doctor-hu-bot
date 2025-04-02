// Простой тестовый скрипт для проверки работы Telegram Bot API
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

// Получаем токен из переменных окружения
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не найден в переменных окружения');
  process.exit(1);
}

// Создаем нового бота
const bot = new TelegramBot(token, { polling: true });

console.log('Запускаем тестового бота...');

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`Получена команда /start от ${msg.from.username || msg.from.first_name} (ID: ${msg.from.id})`);
  
  try {
    await bot.sendMessage(chatId, '👋 Привет! Я тестовый бот для проверки работы Telegram API. Введите /help для списка команд.');
    console.log(`Отправлено приветственное сообщение в чат ${chatId}`);
  } catch (error) {
    console.error(`Ошибка при отправке сообщения: ${error.message}`);
  }
});

// Обработчик команды /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`Получена команда /help от ${msg.from.username || msg.from.first_name}`);
  
  try {
    await bot.sendMessage(chatId, 'Доступные команды:\n/start - Начать общение\n/help - Показать эту справку\n/info - Информация о чате');
    console.log(`Отправлено сообщение помощи в чат ${chatId}`);
  } catch (error) {
    console.error(`Ошибка при отправке сообщения: ${error.message}`);
  }
});

// Обработчик команды /info
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`Получена команда /info от ${msg.from.username || msg.from.first_name}`);
  
  const chatInfo = `
ID чата: ${msg.chat.id}
Тип чата: ${msg.chat.type}
Ваш ID: ${msg.from.id}
Ваше имя: ${msg.from.first_name || 'Не указано'} ${msg.from.last_name || ''}
Ваш username: ${msg.from.username || 'Не указан'}
  `;
  
  try {
    await bot.sendMessage(chatId, chatInfo);
    console.log(`Отправлена информация о чате ${chatId}`);
  } catch (error) {
    console.error(`Ошибка при отправке сообщения: ${error.message}`);
  }
});

// Обработчик всех остальных сообщений
bot.on('message', async (msg) => {
  // Пропускаем команды, они обрабатываются отдельно
  if (msg.text && msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  console.log(`Получено сообщение от ${msg.from.username || msg.from.first_name}: ${msg.text || '[не текст]'}`);
  
  // Если это не текст, сообщаем что получили медиа
  if (!msg.text) {
    try {
      let mediaType = 'неизвестный тип';
      if (msg.photo) mediaType = 'фото';
      if (msg.video) mediaType = 'видео';
      if (msg.audio) mediaType = 'аудио';
      if (msg.voice) mediaType = 'голосовое сообщение';
      if (msg.document) mediaType = 'документ';
      if (msg.sticker) mediaType = 'стикер';
      
      await bot.sendMessage(chatId, `Я получил ваш ${mediaType}, но пока умею работать только с текстом.`);
      console.log(`Отправлено сообщение о получении медиа в чат ${chatId}`);
    } catch (error) {
      console.error(`Ошибка при отправке сообщения: ${error.message}`);
    }
    return;
  }
  
  // Отвечаем на текстовое сообщение
  try {
    await bot.sendMessage(chatId, `Вы написали: "${msg.text}"`);
    console.log(`Отправлен ответ на сообщение в чат ${chatId}`);
  } catch (error) {
    console.error(`Ошибка при отправке сообщения: ${error.message}`);
  }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error(`Ошибка получения обновлений: ${error.message}`);
});

console.log('Тестовый бот запущен и прослушивает сообщения.');