// Модуль для работы с платежной системой Т-Банк (Tinkoff)
// Прямая интеграция через axios с правильным алгоритмом генерации токена
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

// Логирование для отладки
const DEBUG_MODE = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

/**
 * Рекурсивное преобразование объекта в строку для подписи
 * Согласно документации Т-Банк, вложенные объекты должны быть преобразованы в JSON
 * БЕЗ пробелов и с сортировкой ключей
 */
function valueToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Булевы значения преобразуем в строки
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    
    // Массивы преобразуем в JSON без пробелов
    if (Array.isArray(value)) {
        return JSON.stringify(value);
    }
    
    // Объекты преобразуем в JSON с сортировкой ключей и БЕЗ пробелов
    if (typeof value === 'object') {
        // Рекурсивно сортируем вложенные объекты
        const sortedObj = {};
        const sortedKeys = Object.keys(value).sort();
        for (const key of sortedKeys) {
            const val = value[key];
            if (val !== null && val !== undefined) {
                if (typeof val === 'object' && !Array.isArray(val)) {
                    // Рекурсивно обрабатываем вложенные объекты
                    sortedObj[key] = JSON.parse(valueToString(val));
                } else if (Array.isArray(val)) {
                    // Массивы обрабатываем как есть
                    sortedObj[key] = val;
                } else {
                    sortedObj[key] = val;
                }
            }
        }
        // JSON.stringify без пробелов
        return JSON.stringify(sortedObj);
    }
    
    // Остальные типы преобразуем в строку
    return String(value);
}

/**
 * Формирование подписи запроса для Т-Банк API
 * Алгоритм согласно официальной документации:
 * 1. Удалить поле Token из данных
 * 2. Добавить поле Password со значением SecretKey
 * 3. Отсортировать все поля по ключам (алфавитный порядок)
 * 4. Конкатенировать значения полей в порядке сортировки
 * 5. Вычислить SHA-256 хеш
 */
function generateToken(data, password) {
    // Создаем копию данных без Token
    const dataForSign = { ...data };
    delete dataForSign.Token;
    
    // Добавляем Password в объект данных
    dataForSign.Password = password;
    
    // Сортируем ключи объекта по алфавиту
    const sortedKeys = Object.keys(dataForSign).sort();
    
    // Формируем строку для подписи, конкатенируя значения в порядке сортировки
    let stringToSign = '';
    for (const key of sortedKeys) {
        const value = dataForSign[key];
        // Пропускаем null и undefined
        if (value !== null && value !== undefined) {
            stringToSign += valueToString(value);
        }
    }
    
    // Вычисляем SHA-256 хеш
    const hash = crypto.createHash('sha256').update(stringToSign, 'utf8').digest('hex');
    
    if (DEBUG_MODE) {
        console.log('=== Генерация токена ===');
        console.log('Данные для подписи:', JSON.stringify(dataForSign, null, 2));
        console.log('Строка для подписи:', stringToSign);
        console.log('Сгенерированный токен:', hash);
    }
    
    return hash;
}

/**
 * Проверка подписи ответа от Т-Банк
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
 */
async function createPayment(paymentData) {
    if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
        throw new Error('Т-Банк не настроен. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js');
    }
    
    // Проверяем, что данные не пустые
    if (TINKOFF_TERMINAL_KEY.trim() === '' || TINKOFF_PASSWORD.trim() === '') {
        throw new Error('Т-Банк не настроен. TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD не могут быть пустыми');
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
        const customerEmail = customer?.email || '';
        const customerPhone = customer?.phone || '';
        
        if (customerEmail) {
            requestData.Email = customerEmail;
        }
        if (customerPhone) {
            requestData.Phone = customerPhone;
        }

        // Формируем чек для 54-ФЗ, если есть товары
        // ВАЖНО: Т-Банк требует Email или Phone при передаче чека
        if (items && items.length > 0 && (customerEmail || customerPhone)) {
            // Формируем Items массив
            const receiptItems = items.map(item => {
                const receiptItem = {
                    Name: item.Name || item.name,
                    Price: item.Price || Math.round((item.price || 0) * 100),
                    Quantity: item.Quantity || item.quantity || 1,
                    Amount: item.Amount || Math.round((item.price || 0) * (item.quantity || 1) * 100),
                    Tax: item.Tax || 'none'
                };
                // Добавляем Ean13 только если он есть
                if (item.Ean13 || item.sku) {
                    receiptItem.Ean13 = item.Ean13 || item.sku;
                }
                return receiptItem;
            });
            
            // Формируем объект Receipt
            requestData.Receipt = {
                Taxation: 'usn_income',
                Items: receiptItems
            };
            
            // Добавляем Email или Phone в чек (хотя бы одно обязательно)
            if (customerEmail) {
                requestData.Receipt.Email = customerEmail;
            }
            if (customerPhone) {
                requestData.Receipt.Phone = customerPhone;
            }
        }

        // Генерируем подпись
        requestData.Token = generateToken(requestData, TINKOFF_PASSWORD);
        
        // ВРЕМЕННОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ - всегда включаем
        console.log('=== ОТЛАДКА: Запрос к Т-Банк ===');
        console.log('TerminalKey:', TINKOFF_TERMINAL_KEY);
        console.log('Password установлен:', !!TINKOFF_PASSWORD);
        console.log('Запрос:', JSON.stringify(requestData, null, 2));

        // Отправляем запрос
        const response = await axios.post(`${TINKOFF_API_URL}Init`, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const responseData = response.data;

        // Проверяем подпись ответа (если есть Token)
        if (responseData.Token && !verifyToken(responseData, TINKOFF_PASSWORD)) {
            console.warn('Предупреждение: Неверная подпись ответа от Т-Банк. Продолжаем обработку...');
            if (DEBUG_MODE) {
                console.warn('Ответ от Т-Банк:', JSON.stringify(responseData, null, 2));
            }
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
        
        // Логируем полную информацию об ошибке для отладки
        if (error.response) {
            console.error('Ответ от сервера Т-Банк:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
            
            const errorMessage = error.response.data?.Message || 
                               error.response.data?.ErrorMessage || 
                               error.response.data?.Details ||
                               `HTTP ${error.response.status}: ${error.response.statusText}`;
            throw new Error(errorMessage);
        }
        
        // Если это наша ошибка (уже с сообщением), просто пробрасываем
        if (error.message) {
            throw error;
        }
        
        // Иначе создаем общую ошибку
        throw new Error(`Ошибка связи с Т-Банк: ${error.message || 'Неизвестная ошибка'}`);
    }
}

/**
 * Проверка статуса платежа
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
