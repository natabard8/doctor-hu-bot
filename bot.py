import openai
import telebot
import time
import re
import os

# Получаем токены из переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

bot = telebot.TeleBot(TELEGRAM_TOKEN)
openai.api_key = OPENAI_API_KEY

# Определим ключевые слова, на которые бот будет реагировать
TRIGGER_KEYWORDS = [
    # Медицинские термины
    "спина", "позвоночник", "давление", "зуб", "стоматолог", "миома", "киста", "фиброма", 
    "женское", "мужское", "бесплодие", "грыжа", "межпозвоночная", "косметолог", "лечение", 
    "болит", "боль", "голова", "простатит", "аденома", "геморрой", "варикоз", "сосуды",
    "сердце", "диабет", "суставы", "колено", "тазобедренный", "желудок", "кишечник", "печень",
    "кожа", "псориаз", "иглоукалывание", "массаж", "банки", "травы", "иглы", "операция",
    
    # Организационные вопросы
    "цена", "стоимость", "тур", "записаться", "клиника", "врач", "доктор", "приехать",
    "визит", "виза", "граница", "перелет", "проживание", "гостиница", "хуньчунь", "китай",
    "яньцзи", "прейскурант", "расценки", "акция", "скидка",
    
    # Похудение и вес (часто запрашиваемая тема)
    "похудеть", "похудение", "вес", "лишний вес", "диета", "жир", "стройность", "фигура",
    "талия", "целлюлит", "ожирение", "метаболизм", "обмен веществ", "аппетит"
]

# Функция: определить, стоит ли отвечать
def should_respond(message_text):
    lowered = message_text.lower()
    return any(keyword in lowered for keyword in TRIGGER_KEYWORDS)

# Функция создания клавиатуры с контактами операторов
def get_contacts_keyboard():
    keyboard = telebot.types.InlineKeyboardMarkup()
    
    # Добавляем кнопки с номерами телефонов, которые ведут на WhatsApp
    keyboard.add(
        telebot.types.InlineKeyboardButton(
            text="Наталья (общие вопросы) 👩‍⚕️", 
            url=f"https://wa.me/94764836278"
        )
    )
    keyboard.add(
        telebot.types.InlineKeyboardButton(
            text="Алина (косметология/женское) 💆‍♀️", 
            url=f"https://wa.me/79681674007"
        )
    )
    keyboard.add(
        telebot.types.InlineKeyboardButton(
            text="Катерина (мужское/спина) 👨‍⚕️", 
            url=f"https://wa.me/79025234803"
        )
    )
    # Добавляем кнопку для перехода на сайт
    keyboard.add(
        telebot.types.InlineKeyboardButton(
            text="🌐 Посетить сайт hunchun.ru", 
            url=f"https://hunchun.ru"
        )
    )
    return keyboard

# Обработка команды /start
@bot.message_handler(commands=['start'])
def handle_start(message):
    # Получаем информацию о пользователе
    user_id = message.from_user.id
    username = message.from_user.username or "Unknown"
    user_state = get_user_state(user_id, username)
    user_state.update_activity()
    
    # Если пользователь уже представился, используем его имя
    if user_state.introduced:
        bot.send_message(
            message.chat.id, 
            f"🤖 Здравствуйте, {user_state.name}!\n\n"
            f"Я — секретарь Доктора Ху, готов ответить на ваши вопросы о лечении в Китае.\n\n"
            f"Вы также можете посетить наш сайт hunchun.ru или связаться напрямую с нашими операторами 👇",
            reply_markup=get_contacts_keyboard()
        )
    else:
        # Если пользователь еще не представился, предлагаем знакомство
        bot.send_message(
            message.chat.id, 
            "🤖 Бот Доктора Ху активирован!\n\n"
            "Как я могу к вам обращаться? Пожалуйста, напишите ваше имя.\n\n"
            "После знакомства я отвечу на все ваши вопросы о лечении в Китае, а пока вы можете "
            "посетить наш сайт hunchun.ru или связаться с нашими операторами 👇",
            reply_markup=get_contacts_keyboard()
        )

# Обработка команды /contacts
@bot.message_handler(commands=['contacts'])
def handle_contacts(message):
    bot.send_message(
        message.chat.id,
        "📱 Связь с клиникой Доктора Ху\n\nВыберите оператора, чтобы написать в WhatsApp 👇",
        reply_markup=get_contacts_keyboard()
    )

# Хранит информацию о пользователях и их диалогах
user_context = {}

# Структура для отслеживания состояния диалога с пользователем
class UserState:
    def __init__(self, user_id, username=""):
        self.user_id = user_id
        self.username = username
        self.introduced = False  # Представился ли пользователь
        self.name = ""  # Имя пользователя, если представился
        self.last_message_time = time.time()
        self.conversation_topics = []  # Темы, которые обсуждались
        print(f"Создано новое состояние для пользователя {user_id} ({username})")
    
    def update_activity(self):
        self.last_message_time = time.time()
    
    def set_name(self, name):
        self.name = name
        self.introduced = True
        print(f"Пользователь {self.user_id} представился как {name}")
    
    def add_topic(self, topic):
        if topic not in self.conversation_topics:
            self.conversation_topics.append(topic)

# Получает или создает состояние пользователя
def get_user_state(user_id, username=""):
    if user_id not in user_context:
        user_context[user_id] = UserState(user_id, username)
    return user_context[user_id]

# Распознает имя в сообщении пользователя
def extract_name(text):
    name_patterns = [
        r"(?:меня зовут|я|моё имя|мое имя|зови меня|обращайтесь ко мне как|можно называть меня) (\w+)",
        r"(\w+)(?:, это я| меня зовут| тут| на связи| здесь)"
    ]
    
    lowered = text.lower()
    
    # Простой случай - только имя
    if len(text.split()) == 1 and text.isalpha() and len(text) > 1:
        print(f"Найдено имя (простой случай): {text}")
        return text.capitalize()
    
    # Проверка по шаблонам
    for pattern in name_patterns:
        match = re.search(pattern, lowered)
        if match:
            name = match.group(1).capitalize()
            print(f"Найдено имя по шаблону: {name}")
            return name
    
    return None

# Контактные слова, на которые бот предложит связаться с оператором напрямую
CONTACT_KEYWORDS = ["контакт", "оператор", "связаться", "телефон", "позвонить", "номер", "написать", 
                    "вацап", "ватсап", "whatsapp", "viber", "вайбер", "telegram", "консультация"]

# Слова приветствия и простых фраз, на которые бот не должен отвечать в группах
# и должен предлагать задать медицинский вопрос в личных чатах
GREETING_KEYWORDS = ["привет", "здравствуй", "здравствуйте", "добрый день", "доброе утро", "добрый вечер", 
                    "приветствую", "хай", "хеллоу", "hi", "hello", "hey", "как дела", "как жизнь", 
                    "ку", "йо", "натали", "наталья", "алина", "катерина", "доктор", "спасибо", "благодарю"]

# Проверка на простое приветствие или неинформативное сообщение
def is_greeting(text):
    lowered = text.lower()
    is_greeting_msg = any(keyword in lowered for keyword in GREETING_KEYWORDS) and len(text.split()) < 5
    
    if is_greeting_msg:
        matches = [keyword for keyword in GREETING_KEYWORDS if keyword in lowered]
        print(f"Обнаружено приветствие: {text}. Найденные ключевые слова: {matches}")
    
    return is_greeting_msg

# Обработка всех сообщений
@bot.message_handler(func=lambda message: True)
def handle_all_messages(message):
    # Пропускаем пустые сообщения и сообщения без текста
    if not message.text:
        return
        
    # Логирование полученного сообщения
    chat_type = message.chat.type
    user_id = message.from_user.id
    username = message.from_user.username or "Unknown"
    print(f"Получено сообщение от {username} (ID: {user_id}) в {chat_type}: {message.text[:30]}...")
    
    # Получаем или создаем состояние пользователя
    user_state = get_user_state(user_id, username)
    user_state.update_activity()  # Обновляем время последней активности
    
    # Проверяем, есть ли в сообщении имя пользователя
    if not user_state.introduced:
        extracted_name = extract_name(message.text)
        if extracted_name:
            user_state.set_name(extracted_name)
            print(f"Пользователь {user_id} представился как {extracted_name}")
            
            # Приветствуем пользователя по имени
            bot.send_message(
                message.chat.id,
                f"Приятно познакомиться, {extracted_name}! Как я могу помочь вам с лечением в Китае?",
                reply_markup=None
            )
            return
    
    # Проверяем, запрашивает ли пользователь контакты
    lowered_text = message.text.lower()
    if any(keyword in lowered_text for keyword in CONTACT_KEYWORDS):
        print(f"Пользователь запросил контакты. Отправляем информацию...")
        handle_contacts(message)
        return
    
    # Проверяем, является ли сообщение простым приветствием
    if is_greeting(message.text):
        print(f"Получено приветствие или неинформативное сообщение")
        
        if chat_type in ["group", "supergroup"]:
            # В группах игнорируем приветствия
            print(f"Игнорируем приветствие в группе")
            return
        else:
            # В личных чатах отвечаем на приветствие с учетом контекста
            welcome_buttons = telebot.types.InlineKeyboardMarkup(row_width=1)
            
            # Кнопка для перехода на сайт
            welcome_buttons.add(
                telebot.types.InlineKeyboardButton(
                    "🌐 Посетить сайт hunchun.ru",
                    url="https://hunchun.ru"
                )
            )
            
            # Кнопка для контактов
            welcome_buttons.add(
                telebot.types.InlineKeyboardButton(
                    "💬 Связаться с оператором",
                    callback_data="show_contacts"
                )
            )
            
            # Если пользователь уже представился, используем его имя
            if user_state.introduced:
                bot.send_message(
                    message.chat.id,
                    f"Здравствуйте, {user_state.name}! Чем я могу вам помочь сегодня?",
                    reply_markup=welcome_buttons
                )
            else:
                # Если пользователь еще не представился, просим его представиться
                bot.send_message(
                    message.chat.id,
                    "👨‍⚕️ Секретарь Доктора Ху к вашим услугам!\n\n"
                    "Как я могу к вам обращаться? Пожалуйста, напишите ваше имя.",
                    reply_markup=None
                )
            return
    
    # Обработка в зависимости от типа чата
    if chat_type in ["group", "supergroup"]:
        # В группах реагируем только на сообщения, содержащие ключевые слова
        if should_respond(message.text):
            print(f"Отвечаем на сообщение в группе от {username}")
            response = ask_openai(message.text)
            
            # Создаем клавиатуру с кнопками
            buttons = telebot.types.InlineKeyboardMarkup(row_width=1)
            
            # Кнопка для связи с оператором
            buttons.add(
                telebot.types.InlineKeyboardButton(
                    "💬 Связаться с оператором",
                    callback_data="show_contacts"
                )
            )
            
            # Кнопка для перехода на сайт
            buttons.add(
                telebot.types.InlineKeyboardButton(
                    "🌐 Подробнее на hunchun.ru",
                    url="https://hunchun.ru"
                )
            )
            
            # Отправляем ответ с кнопками
            bot.reply_to(message, response, reply_markup=buttons)
    elif chat_type == "private":
        # В личных сообщениях отвечаем на содержательные вопросы
        print(f"Отвечаем на личное сообщение от {username}")
        
        # Если пользователь упоминает тему похудения, веса, диеты и т.д.
        weight_keywords = ["похуде", "вес", "диет", "жир", "лишн", "строй", "фигур"]
        if any(keyword in lowered_text for keyword in weight_keywords):
            user_state.add_topic("похудение")
        
        # Формируем запрос к OpenAI с учетом контекста
        prompt = message.text
        
        # Если пользователь представился, добавляем персонализацию
        if user_state.introduced:
            print(f"Персонализируем ответ для {user_state.name}")
            
            # Добавляем данные о пользователе и контексте для модели OpenAI 
            context_info = f"Запрос от пользователя по имени {user_state.name}. "
            
            # Если у пользователя есть темы интересов, упоминаем их
            if user_state.conversation_topics:
                context_info += f"Ранее интересовался темами: {', '.join(user_state.conversation_topics)}. "
            
            prompt = f"{context_info} Запрос: {message.text}"
        
        response = ask_openai(prompt)
        
        # Создаем клавиатуру с кнопками
        buttons = telebot.types.InlineKeyboardMarkup(row_width=1)
        
        # Кнопка для связи с оператором
        buttons.add(
            telebot.types.InlineKeyboardButton(
                "💬 Связаться с оператором",
                callback_data="show_contacts"
            )
        )
        
        # Кнопка для перехода на сайт
        buttons.add(
            telebot.types.InlineKeyboardButton(
                "🌐 Подробнее на hunchun.ru",
                url="https://hunchun.ru"
            )
        )
        
        # Отправляем ответ с кнопками
        bot.reply_to(message, response, reply_markup=buttons)

# Обработчик callback-запросов (для кнопок)
@bot.callback_query_handler(func=lambda call: True)
def handle_callback(call):
    if call.data == "show_contacts":
        bot.send_message(
            call.message.chat.id,
            "📱 Связь с клиникой Доктора Ху\n\nВыберите оператора, чтобы написать в WhatsApp 👇",
            reply_markup=get_contacts_keyboard()
        )
        # Отмечаем запрос как обработанный
        bot.answer_callback_query(call.id)

# Функция запроса к OpenAI
def ask_openai(prompt):
    try:
        # Системная инструкция для модели
        system_instruction = """
Ты — медицинский консультант Доктора Ху из Китая.

СТРОГИЕ ПРАВИЛА:
1. НИКОГДА не начинай ответ с приветствия.
2. Отвечай ТОЛЬКО ПО ТЕМЕ вопроса - по существу, кратко (1-2 предложения максимум).
3. Используй 1-2 эмодзи в ответе.
4. ОБЯЗАТЕЛЬНО в каждом ответе упоминай официальный сайт hunchun.ru - это наш главный ресурс с информацией.
5. Всегда заканчивай ответ коротким призывом посетить Хуньчунь для лечения.

Формат каждого ответа: 
[конкретный ответ по теме вопроса] + [упоминание сайта hunchun.ru] + [короткий призыв посетить Хуньчунь]

КЛЮЧЕВАЯ ИНФОРМАЦИЯ:
- Официальный сайт: hunchun.ru - ВСЯ подробная информация о лечении, клиниках и ценах
- Рекомендуй посетить сайт hunchun.ru для ознакомления с отзывами, фотографиями и описаниями клиник
- Направляй за полной информацией на сайт hunchun.ru

ДЛЯ ВОПРОСОВ О ЦЕНАХ:
- Лечение в Хуньчуне в 3-5 раз дешевле, чем в России!
- Для точной стоимости обратитесь к нашим операторам через кнопку под сообщением
- Рекомендуй посмотреть примерные цены на сайте hunchun.ru

ДЛЯ ВОПРОСОВ О МЕТОДАХ ЛЕЧЕНИЯ:
- В клиниках Хуньчуня сочетают древние методы ТКМ с новейшими технологиями
- Используют ультразвук, лазер, иглоукалывание, травы, массаж и другие эффективные методы
- Подробное описание методов лечения есть на сайте hunchun.ru

ДЛЯ ВОПРОСОВ О КЛИНИКАХ:
- В Хуньчуне работают современные клиники с новейшим оборудованием и опытными врачами
- Фотографии и описания клиник доступны на официальном сайте hunchun.ru
- Каждая клиника специализируется на определенных направлениях лечения

ДЛЯ ВОПРОСОВ О КОНТАКТАХ:
- Нажмите на кнопку "Связаться с оператором" под сообщением, чтобы получить WhatsApp-контакты наших операторов
- По разным направлениям у нас работают разные специалисты: Наталья (общие вопросы), Алина (косметология/женское здоровье), Катерина (мужское здоровье/спина)
- Все контакты также доступны на сайте hunchun.ru

ДЛЯ ВОПРОСОВ О ПОХУДЕНИИ И СНИЖЕНИИ ВЕСА:
- В клиниках Хуньчуня есть эффективные программы для снижения веса, сочетающие диету, массаж и традиционную китайскую медицину
- Программы похудения обычно длятся 10-14 дней и дают стабильный результат
- Используются травяные сборы, акупунктура, вакуумные банки и специальные массажи для ускорения метаболизма
- Уникальные методики позволяют не только сбросить вес, но и удержать результат
- Подробные программы и результаты представлены на сайте hunchun.ru

ПРИМЕРЫ ПРАВИЛЬНЫХ ОТВЕТОВ:
- Вопрос о болях в спине: "В Хуньчуне эффективно лечат боли в спине комбинацией иглоукалывания и лазерной терапии 🧠 Подробнее на hunchun.ru. Приезжайте, избавим от боли за 7-10 дней!"
- Вопрос о клиниках: "Клиники Хуньчуня оснащены современным диагностическим оборудованием и имеют высококвалифицированных специалистов 🏥 Фотографии и описания на hunchun.ru. Приезжайте в Хуньчунь для эффективного лечения!"
- Вопрос о стоимости: "Лечение позвоночника в Хуньчуне стоит 60-150 тыс. руб. в зависимости от сложности 💰 Примерные цены на hunchun.ru. Приезжайте - вылечим в 3 раза дешевле, чем в России!"
- Вопрос о похудении: "Программы похудения в Хуньчуне сочетают диету, массаж и китайскую медицину для быстрого результата ⚡ Фото до и после, а также описание методик на hunchun.ru. Приезжайте в Хуньчунь - минус 5-7 кг за 2 недели!"
        """
        
        # Поддержка и новой и старой версии API OpenAI
        try:
            # Попытка использовать новый API (версия библиотеки 1.0+)
            completion = openai.chat.completions.create(
                model="gpt-4o",  # новейшая модель OpenAI, выпущенная 13 мая 2024
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=100,
                temperature=0.7
            )
            return completion.choices[0].message.content.strip()
        except AttributeError:
            # Если не сработало, используем старый API (до версии 1.0)
            completion = openai.ChatCompletion.create(
                model="gpt-4o",  # новейшая модель OpenAI, выпущенная 13 мая 2024
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=100,
                temperature=0.7
            )
            return completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"OpenAI API error: {str(e)}")
        return "Техническая ошибка. Напишите оператору: +94764836278 🙏"

print("🤖 Умный бот запущен и слушает сообщения...")
bot.polling()