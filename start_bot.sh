#!/bin/bash

# Проверка наличия переменных окружения
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Ошибка: Переменная TELEGRAM_BOT_TOKEN не установлена"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "Ошибка: Переменная OPENAI_API_KEY не установлена"
  exit 1
fi

# Установка необходимых зависимостей (если они не установлены)
pip install pyTelegramBotAPI openai

# Запуск Python-бота
echo "Запуск бота Доктора Ху..."
python bot.py