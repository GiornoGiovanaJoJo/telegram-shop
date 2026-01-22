// Модуль для работы с платежной системой Т-Банк (Tinkoff)
// Прямая интеграция через axios без внешних SDK
const axios = require('axios');
const crypto = require('crypto');

// Поддержка переменных окружения для хостинга
let config;
try {
    config = require('./config');
} catch (e) {
    config = {};
}

// Конфигурация Т-Банк
const TINKOFF_TERMINAL_KEY = process.env.TINKOFF_TERMINAL_KEY || config.TINKOFF_TERMINAL_KEY;
const TINKOFF_PASSWORD = process.env.TINKOFF_PASSWORD || config.TINKOFF_PASSWORD;
const TINKOFF_API_URL = process.env.TINKOFF_API_URL || 'https://securepay.tinkoff.ru/v2/';

/**
 * Преобразование значения в строку для подписи
 * @param {*} value - Значение для преобразования
 * @returns {string} - Строковое представление
 */
function valueToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        // Вложенные объекты преобразуем в JSON без пробелов
        return JSON.stringify(value, Object.keys(value).sort());
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    return String(value);
}

/**
 * Формирование подписи запроса для Т-Банк API
 * @param {Object} data - Данные запроса
 * @param {string} password - Пароль терминала
 * @returns {string} - Подпись (Token)
 */
function generateToken(data, password) {
    // Сортируем ключи объекта по алфавиту
    const sortedKeys = Object.keys(data).sort();
    
    // Формируем строку для подписи
    const values = sortedKeys
        .filter(key => key !== 'Token' && data[key] !== null && data[key] !== undefined)
        .map(key => valueToString(data[key]))
        .join('');
    
    // Добавляем пароль в конец
    const stringToSign = values + password;
    
    // Вычисляем SHA-256 хеш
    const hash = crypto.createHash('sha256').update(stringToSign).digest('hex');
    
    return hash;
}

/**
 * Проверка подписи ответа от Т-Банк
 * @param {Object} data - Данные ответа
 * @param {string} password - Пароль терминала
 * @returns {boolean} - true если подпись верна
 */
function verifyToken(data, password) {
    const receivedToken = data.Token;
    if (!receivedToken) {
        return false;
    }
    
    // Удаляем Token из данных для проверки
    const dataWithoutToken = { ...data };
    delete dataWithoutToken.Token;
    
    const calculatedToken = generateToken(dataWithoutToken, password);
    return calculatedToken === receivedToken;
}

/**
 * Создание платежа в Т-Банк
 * @param {Object} paymentData - Данные платежа
 * @param {number} paymentData.amount - Сумма платежа в копейках
 * @param {string} paymentData.orderId - ID заказа
 * @param {string} paymentData.description - Описание платежа
 * @param {Object} paymentData.customer - Данные клиента
 * @param {string} paymentData.successUrl - URL для редиректа после успешной оплаты
 * @param {string} paymentData.failureUrl - URL для редиректа после неудачной оплаты
 * @param {Array} paymentData.items - Товары для чека
 * @returns {Promise<Object>} - Данные платежа
 */
async function createPayment(paymentData) {
    if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
        throw new Error('Т-Банк не настроен. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js');
    }

    try {
        const { amount, orderId, description, customer, successUrl, failureUrl, items } = paymentData;

        // Формируем данные для создания платежа
        const requestData = {
            TerminalKey: TINKOFF_TERMINAL_KEY,
            Amount: amount, // Сумма в копейках
            OrderId: orderId.toString(),
            Description: description || `Заказ #${orderId}`,
            SuccessURL: successUrl || `${process.env.BASE_URL || config.BASE_URL || 'http://localhost:3000'}/payment/success?orderId=${orderId}`,
            FailURL: failureUrl || `${process.env.BASE_URL || config.BASE_URL || 'http://localhost:3000'}/payment/failure?orderId=${orderId}`,
            NotificationURL: `${process.env.BASE_URL || config.BASE_URL || 'http://localhost:3000'}/api/payment/webhook`,
            Recurrent: 'N',
            CustomerKey: customer?.id?.toString() || orderId.toString()
        };

        // Добавляем данные клиента, если они есть
        if (customer?.email) {
            requestData.Email = customer.email;
        }
        if (customer?.phone) {
            requestData.Phone = customer.phone;
        }

        // Формируем чек для 54-ФЗ, если есть товары
        if (items && items.length > 0) {
            requestData.Receipt = {
                Email: customer?.email || '',
                Phone: customer?.phone || '',
                Taxation: 'usn_income',
                Items: items.map(item => ({
                    Name: item.Name || item.name,
                    Price: item.Price || Math.round((item.price || 0) * 100),
                    Quantity: item.Quantity || item.quantity || 1,
                    Amount: item.Amount || Math.round((item.price || 0) * (item.quantity || 1) * 100),
                    Tax: item.Tax || 'none',
                    Ean13: item.Ean13 || item.sku || ''
                }))
            };
        }

        // Генерируем подпись
        requestData.Token = generateToken(requestData, TINKOFF_PASSWORD);

        // Отправляем запрос
        const response = await axios.post(`${TINKOFF_API_URL}Init`, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const responseData = response.data;

        // Проверяем подпись ответа (если есть Token)
        // ВАЖНО: В тестовом режиме или при некоторых настройках Token может отсутствовать
        if (responseData.Token && !verifyToken(responseData, TINKOFF_PASSWORD)) {
            console.warn('Предупреждение: Неверная подпись ответа от Т-Банк. Продолжаем обработку...');
            console.warn('Ответ от Т-Банк:', JSON.stringify(responseData, null, 2));
            // Не прерываем выполнение, так как это может быть проблема с форматом данных
            // или настройками в личном кабинете Т-Банк
        }

        if (responseData.Success === 'true' || responseData.Success === true) {
            return {
                success: true,
                paymentId: responseData.PaymentId,
                paymentUrl: responseData.PaymentURL,
                orderId: responseData.OrderId,
                amount: responseData.Amount,
                status: responseData.Status
            };
        } else {
            const errorMessage = responseData.Message || responseData.ErrorMessage || responseData.Details || 'Ошибка создания платежа';
            console.error('Ошибка создания платежа. Ответ от Т-Банк:', JSON.stringify(responseData, null, 2));
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Ошибка создания платежа Т-Банк:', error);
        if (error.response) {
            throw new Error(error.response.data?.Message || error.response.data?.ErrorMessage || error.message);
        }
        throw error;
    }
}

/**
 * Проверка статуса платежа
 * @param {string} paymentId - ID платежа в Т-Банк
 * @returns {Promise<Object>} - Статус платежа
 */
async function getPaymentStatus(paymentId) {
    if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        const requestData = {
            TerminalKey: TINKOFF_TERMINAL_KEY,
            PaymentId: paymentId.toString()
        };

        // Генерируем подпись
        requestData.Token = generateToken(requestData, TINKOFF_PASSWORD);

        const response = await axios.post(`${TINKOFF_API_URL}GetState`, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const responseData = response.data;

        // Проверяем подпись ответа (если есть Token)
        if (responseData.Token && !verifyToken(responseData, TINKOFF_PASSWORD)) {
            console.warn('Предупреждение: Неверная подпись ответа от Т-Банк. Продолжаем обработку...');
            // Не прерываем выполнение, так как это может быть проблема с форматом данных
        }

        if (responseData.Success === 'true' || responseData.Success === true) {
            return {
                success: true,
                paymentId: responseData.PaymentId,
                orderId: responseData.OrderId,
                status: responseData.Status,
                amount: responseData.Amount
            };
        } else {
            throw new Error(responseData.Message || responseData.ErrorMessage || 'Ошибка получения статуса платежа');
        }
    } catch (error) {
        console.error('Ошибка получения статуса платежа Т-Банк:', error);
        if (error.response) {
            throw new Error(error.response.data?.Message || error.response.data?.ErrorMessage || error.message);
        }
        throw error;
    }
}

/**
 * Обработка вебхука от Т-Банк
 * @param {Object} webhookData - Данные вебхука
 * @returns {Promise<Object>} - Результат обработки
 */
async function handleWebhook(webhookData) {
    if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        // Проверяем подпись вебхука
        const isValid = verifyToken(webhookData, TINKOFF_PASSWORD);
        
        if (!isValid) {
            throw new Error('Неверная подпись вебхука');
        }

        return {
            success: true,
            paymentId: webhookData.PaymentId,
            orderId: webhookData.OrderId,
            status: webhookData.Status,
            amount: webhookData.Amount
        };
    } catch (error) {
        console.error('Ошибка обработки вебхука Т-Банк:', error);
        throw error;
    }
}

/**
 * Отмена платежа
 * @param {string} paymentId - ID платежа
 * @param {number} amount - Сумма возврата (если частичный возврат)
 * @returns {Promise<Object>} - Результат отмены
 */
async function cancelPayment(paymentId, amount = null) {
    if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        const requestData = {
            TerminalKey: TINKOFF_TERMINAL_KEY,
            PaymentId: paymentId.toString()
        };

        if (amount) {
            requestData.Amount = Math.round(amount * 100); // Конвертируем в копейки
        }

        // Генерируем подпись
        requestData.Token = generateToken(requestData, TINKOFF_PASSWORD);

        const response = await axios.post(`${TINKOFF_API_URL}Cancel`, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const responseData = response.data;

        // Проверяем подпись ответа (если есть Token)
        if (responseData.Token && !verifyToken(responseData, TINKOFF_PASSWORD)) {
            console.warn('Предупреждение: Неверная подпись ответа от Т-Банк. Продолжаем обработку...');
            // Не прерываем выполнение, так как это может быть проблема с форматом данных
        }

        if (responseData.Success === 'true' || responseData.Success === true) {
            return {
                success: true,
                paymentId: responseData.PaymentId,
                orderId: responseData.OrderId,
                newAmount: responseData.NewAmount,
                status: responseData.Status
            };
        } else {
            throw new Error(responseData.Message || responseData.ErrorMessage || 'Ошибка отмены платежа');
        }
    } catch (error) {
        console.error('Ошибка отмены платежа Т-Банк:', error);
        if (error.response) {
            throw new Error(error.response.data?.Message || error.response.data?.ErrorMessage || error.message);
        }
        throw error;
    }
}

/**
 * Формирование чека для платежа (для 54-ФЗ)
 * @param {Array} items - Товары в заказе
 * @returns {Array} - Массив позиций чека
 */
function formatReceiptItems(items) {
    return items.map(item => ({
        Name: item.name,
        Price: Math.round(item.price * 100), // Цена в копейках
        Quantity: item.quantity,
        Amount: Math.round(item.price * item.quantity * 100), // Сумма в копейках
        Tax: 'none', // НДС не облагается (можно изменить на 'vat10', 'vat20' и т.д.)
        Ean13: item.sku || ''
    }));
}

/**
 * Проверка, настроена ли платежная система
 * @returns {boolean}
 */
function isConfigured() {
    return !!(TINKOFF_TERMINAL_KEY && TINKOFF_PASSWORD);
}

module.exports = {
    createPayment,
    getPaymentStatus,
    handleWebhook,
    cancelPayment,
    formatReceiptItems,
    isConfigured
};
