# Telegram Mini App - Магазин товаров

Современный магазин товаров для Telegram Mini App с админ-панелью для управления товарами.

## Цветовая схема

- **Основной темный**: `#1F1B20`
- **Основной светлый**: `#FEFEFE`
- **Акцентный желтый**: `#FFED00`

## Структура проекта

```
├── index.html          # Главная страница магазина
├── admin.html          # Админ-панель для управления товарами
├── app.js              # Клиентская логика магазина
├── admin.js            # Логика админ-панели
├── styles.css          # Стили для магазина
├── admin.css           # Стили для админ-панели
├── server.js           # Express сервер с API
├── products.json       # База данных товаров (JSON)
├── package.json        # Зависимости Node.js
└── config.js           # Конфигурация (токен бота, не в Git)
```

## Функциональность

### Магазин
- Просмотр каталога товаров
- Поиск по названию
- Фильтрация по категориям
- Корзина покупок
- Оформление заказов

### Админ-панель
- **Создание товаров** (POST `/api/products`)
- **Редактирование товаров** (PUT `/api/products/:id`)
- **Удаление товаров** (DELETE `/api/products/:id`)
- **Просмотр всех товаров** (GET `/api/products`)

### Платежная система
- Архитектура подготовлена, но пока неактивна
- Endpoints: `/api/payment/create`, `/api/payment/status/:id`

## API Endpoints

### Товары
- `GET /api/products` - Получить все товары
- `GET /api/products/:id` - Получить товар по ID
- `POST /api/products` - Создать товар
- `PUT /api/products/:id` - Обновить товар
- `DELETE /api/products/:id` - Удалить товар

### Заказы
- `POST /api/order` - Оформить заказ

### Платежи (заглушки)
- `POST /api/payment/create` - Создать платеж
- `GET /api/payment/status/:id` - Статус платежа

## Установка и запуск

1. Установите зависимости:
```bash
npm install
```

2. Создайте `config.js` на основе `config.example.js`:
```javascript
module.exports = {
    BOT_TOKEN: 'ВАШ_ТОКЕН_БОТА',
    ADMIN_CHAT_ID: 'ВАШ_CHAT_ID'
};
```

3. Запустите сервер:
```bash
npm start
```

4. Откройте в браузере:
- Магазин: `http://localhost:3000`
- Админ-панель: `http://localhost:3000/admin?key=anikin_admin_2026`

## Доступ к админ-панели

Ключ доступа: `anikin_admin_2026`

Или через URL: `/admin?key=anikin_admin_2026`

## Логотипы

Логотипы находятся в папке `Лого Аникин/`:
- `1.png` - используется в шапке магазина
- Другие варианты доступны для использования

## Деплой на Railway

1. Загрузите код в GitHub репозиторий
2. Подключите репозиторий к Railway
3. Установите переменные окружения:
   - `BOT_TOKEN` - токен Telegram бота
   - `ADMIN_CHAT_ID` - ID чата администратора
4. Railway автоматически определит Node.js проект и запустит сервер

## Файлы для репозитория

### Обязательные файлы:
- `index.html`
- `admin.html`
- `app.js`
- `admin.js`
- `styles.css`
- `admin.css`
- `server.js`
- `products.json`
- `package.json`
- `railway.json` / `railway.toml` / `nixpacks.toml` (для Railway)
- `.gitignore`

### Не загружать в Git:
- `config.js` (содержит токены)
- `node_modules/`
