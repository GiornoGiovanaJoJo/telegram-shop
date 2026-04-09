/**
 * Раньше здесь хранились секреты — теперь их нужно задавать только через переменные окружения.
 * Скопируйте список ниже в .env на своей машине или в настройки PM2/systemd (не коммитьте .env).
 *
 * BOT_TOKEN              — токен бота Telegram
 * ADMIN_CHAT_ID          — ваш Telegram ID для уведомлений о заказах
 * TINKOFF_TERMINAL_KEY   — терминал Т‑Банка
 * TINKOFF_PASSWORD       — пароль терминала Т‑Банка
 * SOCKS_USER / SOCKS_PASS — логин и пароль SOCKS5 (см. constants.js: SOCKS_HOST/PORT)
 *
 * Опционально: BASE_URL (по умолчанию см. constants.PUBLIC_BASE_URL), TINKOFF_API_URL
 */
module.exports = {};
