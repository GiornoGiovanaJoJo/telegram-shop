// Пример конфигурационного файла
// Скопируйте этот файл в config.js и укажите ваши данные

module.exports = {
    // Telegram Bot настройки
    BOT_TOKEN: 'ВАШ_ТОКЕН_БОТА',
    // ID чата для получения заказов (можно получить через @userinfobot)
    ADMIN_CHAT_ID: null, // Укажите ваш Telegram ID
    
    // Т-Банк (Tinkoff) платежная система
    // Получите эти данные в личном кабинете Т-Банк: https://www.tinkoff.ru/business/acquiring/
    TINKOFF_TERMINAL_KEY: 'ВАШ_TERMINAL_KEY',
    TINKOFF_PASSWORD: 'ВАШ_PASSWORD',
    // URL API (обычно не нужно менять)
    TINKOFF_API_URL: 'https://securepay.tinkoff.ru/v2/',
    
    // Базовый URL вашего приложения (для вебхуков и редиректов)
    // Для локальной разработки: http://localhost:3000
    // Для продакшена: https://telegram-shop-production.up.railway.app
    BASE_URL: process.env.BASE_URL || 'https://telegram-shop-production.up.railway.app'
};
