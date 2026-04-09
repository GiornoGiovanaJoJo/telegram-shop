/**
 * Публичные константы окружения (в репозитории секретов нет).
 * Токены, пароли прокси и ключи Т‑Банка задаются только через переменные окружения.
 */
module.exports = {
  /** Основной публичный URL сайта (вебхуки, редиректы) */
  PUBLIC_BASE_URL: 'https://sera2600.shop',

  LISTEN_PORT: 3000,

  /** Исходящий SOCKS5 для axios (Telegram API и т.д.): только хост/порт */
  SOCKS_HOST: '196.19.10.162',
  SOCKS_PORT: 8000,

  TINKOFF_API_URL: 'https://securepay.tinkoff.ru/v2/',
};
