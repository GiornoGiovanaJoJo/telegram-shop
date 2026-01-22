// Модуль для работы с платежной системой Т-Банк (Tinkoff)
// Используем готовую библиотеку tbank-payments для надежности
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
const TINKOFF_API_URL = process.env.TINKOFF_API_URL || 'https://securepay.tinkoff.ru/v2/';

// Инициализация SDK
let tbankSDK = null;
if (TINKOFF_TERMINAL_KEY && TINKOFF_PASSWORD) {
    tbankSDK = new TbankPayments({
        merchantId: TINKOFF_TERMINAL_KEY,
        secret: TINKOFF_PASSWORD,
        apiUrl: TINKOFF_API_URL.replace('/v2/', '') // Убираем /v2/ так как библиотека добавляет его сама
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
 * @param {Array} paymentData.items - Товары для чека
 * @returns {Promise<Object>} - Данные платежа
 */
async function createPayment(paymentData) {
    if (!tbankSDK) {
        throw new Error('Т-Банк не настроен. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js');
    }

    try {
        const { amount, orderId, description, customer, successUrl, failureUrl, items } = paymentData;

        // Формируем данные для создания платежа
        const initData = {
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
            initData.Email = customerEmail;
        }
        if (customerPhone) {
            initData.Phone = customerPhone;
        }

        // Формируем чек для 54-ФЗ, если есть товары
        // ВАЖНО: Т-Банк требует Email или Phone при передаче чека
        if (items && items.length > 0 && (customerEmail || customerPhone)) {
            initData.Receipt = {
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
            
            // Добавляем Email или Phone в чек (хотя бы одно обязательно)
            if (customerEmail) {
                initData.Receipt.Email = customerEmail;
            }
            if (customerPhone) {
                initData.Receipt.Phone = customerPhone;
            }
        }

        // Создаем платеж через библиотеку
        let response;
        try {
            response = await tbankSDK.initPayment(initData);
        } catch (libError) {
            // Если библиотека выбрасывает ошибку, логируем и пробрасываем
            console.error('Ошибка библиотеки tbank-payments:', libError);
            console.error('Данные запроса:', JSON.stringify(initData, null, 2));
            
            // Если это ошибка API, извлекаем сообщение
            if (libError.response) {
                const apiError = libError.response.data || libError.response;
                throw new Error(apiError.Message || apiError.ErrorMessage || apiError.Details || libError.message);
            }
            
            throw libError;
        }

        // Проверяем формат ответа
        if (!response) {
            throw new Error('Библиотека вернула пустой ответ');
        }

        // Обрабатываем разные форматы ответа
        const success = response.Success === 'true' || response.Success === true || response.success === true;
        
        if (success) {
            return {
                success: true,
                paymentId: response.PaymentId || response.paymentId,
                paymentUrl: response.PaymentURL || response.paymentUrl || response.PaymentUrl,
                orderId: response.OrderId || response.orderId,
                amount: response.Amount || response.amount,
                status: response.Status || response.status
            };
        } else {
            const errorMessage = response.Message || response.ErrorMessage || response.Details || 
                               response.message || response.error || 'Ошибка создания платежа';
            console.error('Ошибка создания платежа. Ответ от Т-Банк:', JSON.stringify(response, null, 2));
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
 * @param {string} paymentId - ID платежа в Т-Банк
 * @returns {Promise<Object>} - Статус платежа
 */
async function getPaymentStatus(paymentId) {
    if (!tbankSDK) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        const response = await tbankSDK.getPaymentState({
            PaymentId: paymentId.toString()
        });

        if (response.Success === 'true' || response.Success === true) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                status: response.Status,
                amount: response.Amount
            };
        } else {
            throw new Error(response.Message || response.ErrorMessage || 'Ошибка получения статуса платежа');
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
    if (!tbankSDK) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        // Проверяем подпись вебхука через библиотеку
        const receivedToken = webhookData.Token;
        const isValid = tbankSDK.verifyNotificationSignature(webhookData, receivedToken);
        
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
    if (!tbankSDK) {
        throw new Error('Т-Банк не настроен');
    }

    try {
        const cancelData = {
            PaymentId: paymentId.toString()
        };

        if (amount) {
            cancelData.Amount = Math.round(amount * 100); // Конвертируем в копейки
        }

        const response = await tbankSDK.cancelPayment(cancelData);

        if (response.Success === 'true' || response.Success === true) {
            return {
                success: true,
                paymentId: response.PaymentId,
                orderId: response.OrderId,
                newAmount: response.NewAmount,
                status: response.Status
            };
        } else {
            throw new Error(response.Message || response.ErrorMessage || 'Ошибка отмены платежа');
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
