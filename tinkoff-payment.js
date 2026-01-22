// Модуль для работы с платежной системой Т-Банк (Tinkoff)
const { TinkoffPaymentSDK } = require('@sfomin/tinkoff-payment-sdk');
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

// Инициализация SDK
let tinkoffSDK = null;
if (TINKOFF_TERMINAL_KEY && TINKOFF_PASSWORD) {
    tinkoffSDK = new TinkoffPaymentSDK({
        terminalKey: TINKOFF_TERMINAL_KEY,
        password: TINKOFF_PASSWORD,
        apiUrl: TINKOFF_API_URL
    });
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
 * @returns {Promise<Object>} - Данные платежа
 */
async function createPayment(paymentData) {
    if (!tinkoffSDK) {
        throw new Error('Т-Банк SDK не инициализирован. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js');
    }

    try {
        const { amount, orderId, description, customer, successUrl, failureUrl } = paymentData;

        // Формируем данные для создания платежа
        const paymentRequest = {
            Amount: amount, // Сумма в копейках
            OrderId: orderId.toString(),
            Description: description || `Заказ #${orderId}`,
            SuccessURL: successUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/success?orderId=${orderId}`,
            FailURL: failureUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/payment/failure?orderId=${orderId}`,
            NotificationURL: `${process.env.BASE_URL || 'http://localhost:3000'}/api/payment/webhook`,
            Recurrent: 'N',
            CustomerKey: customer?.id?.toString() || orderId.toString(),
            Receipt: {
                Email: customer?.email || '',
                Phone: customer?.phone || '',
                Taxation: 'usn_income',
                Items: paymentData.items || []
            }
        };

        // Добавляем данные клиента, если они есть
        if (customer?.email) {
            paymentRequest.Receipt.Email = customer.email;
        }
        if (customer?.phone) {
            paymentRequest.Receipt.Phone = customer.phone;
        }

        // Создаем платеж через SDK
        const response = await tinkoffSDK.init(paymentRequest);

        if (response.Success) {
            return {
                success: true,
                paymentId: response.PaymentId,
                paymentUrl: response.PaymentURL,
                orderId: response.OrderId,
                amount: response.Amount,
                status: response.Status
            };
        } else {
            throw new Error(response.Message || 'Ошибка создания платежа');
        }
    } catch (error) {
        console.error('Ошибка создания платежа Т-Банк:', error);
        throw error;
    }
}

/**
 * Проверка статуса платежа
 * @param {string} paymentId - ID платежа в Т-Банк
 * @returns {Promise<Object>} - Статус платежа
 */
async function getPaymentStatus(paymentId) {
    if (!tinkoffSDK) {
        throw new Error('Т-Банк SDK не инициализирован');
    }

    try {
        const response = await tinkoffSDK.getState({ PaymentId: paymentId });

        if (response.Success) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                status: response.Status,
                amount: response.Amount
            };
        } else {
            throw new Error(response.Message || 'Ошибка получения статуса платежа');
        }
    } catch (error) {
        console.error('Ошибка получения статуса платежа Т-Банк:', error);
        throw error;
    }
}

/**
 * Обработка вебхука от Т-Банк
 * @param {Object} webhookData - Данные вебхука
 * @returns {Promise<Object>} - Результат обработки
 */
async function handleWebhook(webhookData) {
    if (!tinkoffSDK) {
        throw new Error('Т-Банк SDK не инициализирован');
    }

    try {
        // Проверяем подпись вебхука
        const isValid = tinkoffSDK.verifyWebhook(webhookData);
        
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
    if (!tinkoffSDK) {
        throw new Error('Т-Банк SDK не инициализирован');
    }

    try {
        const cancelData = {
            PaymentId: paymentId
        };

        if (amount) {
            cancelData.Amount = amount;
        }

        const response = await tinkoffSDK.cancel(cancelData);

        if (response.Success) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                newAmount: response.NewAmount,
                status: response.Status
            };
        } else {
            throw new Error(response.Message || 'Ошибка отмены платежа');
        }
    } catch (error) {
        console.error('Ошибка отмены платежа Т-Банк:', error);
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
