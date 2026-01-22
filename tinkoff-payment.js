// Модуль для работы с платежной системой Т-Банк (Tinkoff)
// Использует официальную библиотеку tbank-payments
const TbankPayments = require('tbank-payments');

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
const TINKOFF_API_URL = process.env.TINKOFF_API_URL || config.TINKOFF_API_URL || 'https://securepay.tinkoff.ru/v2/';

// Логирование для отладки
const DEBUG_MODE = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

// Инициализация клиента Т-Банк
let tbank = null;

function getTbankClient() {
    if (!tbank) {
        if (!TINKOFF_TERMINAL_KEY || !TINKOFF_PASSWORD) {
            throw new Error('Т-Банк не настроен. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js');
        }
        
        if (TINKOFF_TERMINAL_KEY.trim() === '' || TINKOFF_PASSWORD.trim() === '') {
            throw new Error('Т-Банк не настроен. TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD не могут быть пустыми');
        }
        
        tbank = new TbankPayments({
            merchantId: TINKOFF_TERMINAL_KEY,
            secret: TINKOFF_PASSWORD,
            apiUrl: TINKOFF_API_URL.replace('/v2/', ''), // Библиотека сама добавляет /v2/
        });
    }
    return tbank;
}

/**
 * Создание платежа в Т-Банк
 */
async function createPayment(paymentData) {
    try {
        const { amount, orderId, description, customer, successUrl, failureUrl, items } = paymentData;
        
        const tbankClient = getTbankClient();
        
        // Получаем данные клиента
        const customerEmail = customer?.email || '';
        const customerPhone = customer?.phone || '';
        
        // Формируем данные для создания платежа
        const paymentParams = {
            Amount: amount, // Сумма уже в копейках
            OrderId: orderId.toString(),
            Description: description || `Заказ #${orderId}`,
            SuccessURL: successUrl,
            FailURL: failureUrl,
            NotificationURL: `${process.env.BASE_URL || config.BASE_URL || 'https://telegram-shop-production.up.railway.app'}/api/payment/webhook`,
            CustomerKey: customer?.id?.toString() || orderId.toString()
        };
        
        // НЕ добавляем Recurrent, Email и Phone на верхний уровень
        // Email и Phone должны быть только в Receipt
        
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
            
            // Формируем объект Receipt с Email/Phone внутри
            paymentParams.Receipt = {
                Taxation: 'usn_income',
                Items: receiptItems
            };
            
            // Добавляем Email или Phone в чек (хотя бы одно обязательно)
            if (customerEmail) {
                paymentParams.Receipt.Email = customerEmail;
            }
            if (customerPhone) {
                paymentParams.Receipt.Phone = customerPhone;
            }
        }
        
        if (DEBUG_MODE) {
            console.log('=== ОТЛАДКА: Запрос к Т-Банк ===');
            console.log('TerminalKey:', TINKOFF_TERMINAL_KEY);
            console.log('Password установлен:', !!TINKOFF_PASSWORD);
            console.log('Параметры платежа:', JSON.stringify(paymentParams, null, 2));
        }
        
        // Создаем платеж через библиотеку
        const response = await tbankClient.initPayment(paymentParams);
        
        if (DEBUG_MODE) {
            console.log('Ответ от Т-Банк:', JSON.stringify(response, null, 2));
        }
        
        // Библиотека возвращает объект с полями PaymentId, PaymentURL и т.д.
        if (response && response.PaymentURL) {
            return {
                success: true,
                paymentId: response.PaymentId,
                paymentUrl: response.PaymentURL,
                orderId: response.OrderId || orderId,
                amount: response.Amount || amount,
                status: response.Status || 'NEW'
            };
        } else {
            throw new Error('Неверный ответ от Т-Банк: отсутствует PaymentURL');
        }
        
    } catch (error) {
        console.error('Ошибка создания платежа Т-Банк:', error);
        
        // Обработка ошибок библиотеки
        if (error.name === 'TbankApiError') {
            const errorMessage = error.message || error.details || 'Ошибка создания платежа';
            console.error('API Error:', error.code, errorMessage);
            throw new Error(errorMessage);
        } else if (error.name === 'TbankValidationError') {
            console.error('Validation Error:', error.message);
            throw new Error(error.message || 'Ошибка валидации данных платежа');
        } else if (error.name === 'TbankNetworkError') {
            console.error('Network Error:', error.message);
            throw new Error('Ошибка связи с Т-Банк: ' + (error.message || 'Неизвестная ошибка'));
        }
        
        // Если это наша ошибка (уже с сообщением), просто пробрасываем
        if (error.message) {
            throw error;
        }
        
        // Иначе создаем общую ошибку
        throw new Error(`Ошибка создания платежа: ${error.message || 'Неизвестная ошибка'}`);
    }
}

/**
 * Проверка статуса платежа
 */
async function getPaymentStatus(paymentId) {
    try {
        const tbankClient = getTbankClient();
        
        const response = await tbankClient.getPaymentState({
            PaymentId: paymentId.toString()
        });
        
        if (response && response.Status) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                status: response.Status,
                amount: response.Amount
            };
        } else {
            throw new Error('Неверный ответ от Т-Банк при получении статуса');
        }
    } catch (error) {
        console.error('Ошибка получения статуса платежа Т-Банк:', error);
        
        if (error.name === 'TbankApiError') {
            throw new Error(error.message || error.details || 'Ошибка получения статуса платежа');
        }
        
        throw error;
    }
}

/**
 * Обработка вебхука от Т-Банк
 */
async function handleWebhook(webhookData) {
    try {
        const tbankClient = getTbankClient();
        
        // Проверяем подпись вебхука через библиотеку
        const isValid = tbankClient.verifyNotificationSignature(webhookData, webhookData.Token);
        
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
    try {
        const tbankClient = getTbankClient();
        
        const cancelParams = {
            PaymentId: paymentId.toString()
        };
        
        if (amount) {
            cancelParams.Amount = Math.round(amount * 100); // Конвертируем в копейки
        }
        
        const response = await tbankClient.cancelPayment(cancelParams);
        
        if (response && response.Status) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                newAmount: response.NewAmount,
                status: response.Status
            };
        } else {
            throw new Error('Неверный ответ от Т-Банк при отмене платежа');
        }
    } catch (error) {
        console.error('Ошибка отмены платежа Т-Банк:', error);
        
        if (error.name === 'TbankApiError') {
            throw new Error(error.message || error.details || 'Ошибка отмены платежа');
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
    return !!(TINKOFF_TERMINAL_KEY && TINKOFF_PASSWORD && 
              TINKOFF_TERMINAL_KEY.trim() !== '' && TINKOFF_PASSWORD.trim() !== '');
}

module.exports = {
    createPayment,
    getPaymentStatus,
    handleWebhook,
    cancelPayment,
    formatReceiptItems,
    isConfigured
};
