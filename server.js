// Простой сервер для обработки заказов из Telegram Mini App
const express = require('express');
const axios = require('axios');
(function setupSocksProxy() {
  try {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    const socksUrl = process.env.TELEGRAM_SOCKS_PROXY || process.env.ALL_PROXY;
    if (socksUrl) {
      const agent = new SocksProxyAgent(socksUrl);
      axios.defaults.httpsAgent = agent;
      axios.defaults.httpAgent = agent;
      console.log('[proxy] SOCKS-прокси для исходящих запросов (Telegram API и др.)');
    }
  } catch (e) {
    console.warn('[proxy] Не удалось настроить SOCKS:', e.message);
  }
})();
const path = require('path');
const multer = require('multer');
const db = require('./database');
const tinkoffPayment = require('./tinkoff-payment');

// Поддержка переменных окружения для хостинга
let config;
try {
    config = require('./config');
} catch (e) {
    config = {};
}

// Использование переменных окружения или config.js
const BOT_TOKEN = process.env.BOT_TOKEN || config.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || config.ADMIN_CHAT_ID;

const app = express();
const PORT = process.env.PORT || 3000;
const fs = require('fs').promises;

// Инициализация БД при запуске
db.migrateFromJSON().catch(err => {
    console.error('Ошибка миграции данных:', err);
});

// Настройка multer для загрузки файлов
const uploadsDir = path.join(__dirname, 'фото');
// Создаем папку для загрузок, если её нет
fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя файла: timestamp + оригинальное имя
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, name + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB максимум
    },
    fileFilter: function (req, file, cb) {
        // Разрешаем только изображения
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Разрешены только изображения (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
app.use('/фото', express.static(uploadsDir));

// Функция для отправки сообщения в Telegram
async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
    if (!BOT_TOKEN) {
        console.error('BOT_TOKEN не настроен! Укажите в переменных окружения или config.js');
        return;
    }
    
    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id: chatId,
                text: text,
                parse_mode: parseMode
            }
        );
        return response.data;
    } catch (error) {
        console.error('Ошибка отправки сообщения в Telegram:', error.response?.data || error.message);
        throw error;
    }
}

// Форматирование заказа для отправки
function formatOrderMessage(orderData, userInfo) {
    const { items, total } = orderData;
    
    let message = '<b>🛒 Новый заказ!</b>\n\n';
    
    if (userInfo) {
        message += `<b>Пользователь:</b>\n`;
        if (userInfo.first_name) message += `Имя: ${userInfo.first_name}\n`;
        if (userInfo.last_name) message += `Фамилия: ${userInfo.last_name}\n`;
        if (userInfo.username) message += `Username: @${userInfo.username}\n`;
        if (userInfo.id) message += `ID: ${userInfo.id}\n`;
        message += '\n';
    }
    
    message += '<b>Товары:</b>\n';
    items.forEach((item, index) => {
        message += `${index + 1}. ${item.name}\n`;
        message += `   Количество: ${item.quantity} шт.\n`;
        message += `   Цена: ${formatPrice(item.price)}\n`;
        message += `   Сумма: ${formatPrice(item.price * item.quantity)}\n\n`;
    });
    
    message += `<b>💰 Итого: ${formatPrice(total)}</b>`;
    
    return message;
}

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

// API endpoint для обработки заказов
app.post('/api/order', async (req, res) => {
    try {
        const { orderData, userInfo } = req.body;
        
        if (!orderData || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Некорректные данные заказа' 
            });
        }
        
        // Формируем сообщение о заказе
        const orderMessage = formatOrderMessage(orderData, userInfo);
        
        // Сохраняем заказ в БД с данными доставки
        const orderId = await db.createOrder({
            userInfo: userInfo,
            items: orderData.items,
            total: orderData.total,
            delivery: orderData.delivery || null
        });
        
        // НЕ отправляем уведомление администратору при создании заказа
        // Уведомление будет отправлено только после успешной оплаты через вебхук
        
        // Отправляем подтверждение пользователю (если есть его chat_id)
        if (userInfo && userInfo.id) {
            try {
                await sendTelegramMessage(
                    userInfo.id, 
                    '✅ Ваш заказ принят! Мы свяжемся с вами в ближайшее время.'
                );
            } catch (error) {
                // Если не удалось отправить пользователю, это не критично
                console.log('Не удалось отправить подтверждение пользователю:', error.message);
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Заказ успешно оформлен!',
            orderId: orderId
        });
        
    } catch (error) {
        console.error('Ошибка обработки заказа:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка сервера при обработке заказа' 
        });
    }
});

// ============================================
// API для управления товарами (CRUD)
// ============================================

// Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        const products = await db.getAllProducts();
        res.json(products);
    } catch (error) {
        console.error('Ошибка получения товаров:', error);
        res.status(500).json({ error: 'Ошибка получения товаров' });
    }
});

// Получить товар по ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await db.getProductById(parseInt(req.params.id));
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка получения товара:', error);
        res.status(500).json({ error: 'Ошибка получения товара' });
    }
});

// Middleware для обработки ошибок multer
function handleMulterError(err, req, res, next) {
    if (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Размер файла превышает 10MB' });
            }
            return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
        }
        // Обработка других ошибок (например, неподдерживаемый тип файла)
        return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    }
    next();
}

// Endpoint для загрузки изображения товара
app.post('/api/upload', upload.single('image'), handleMulterError, (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не был загружен' });
        }
        
        // Возвращаем путь к файлу относительно корня проекта
        const imagePath = `фото/${req.file.filename}`;
        res.json({ 
            success: true, 
            image: imagePath,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла: ' + error.message });
    }
});

// Создать новый товар (с поддержкой загрузки нескольких файлов)
app.post('/api/products', upload.array('images', 10), handleMulterError, async (req, res) => {
    try {
        // Обработка загруженных файлов
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(file => `фото/${file.filename}`);
        }
        
        // Добавляем существующие изображения, если они есть
        if (req.body.existingImages) {
            try {
                const existingImages = JSON.parse(req.body.existingImages);
                images = [...existingImages, ...images];
            } catch (e) {
                console.error('Ошибка парсинга existingImages:', e);
            }
        }
        
        // Обработка тегов (может быть строкой или массивом)
        let tags = [];
        if (req.body.tags) {
            if (typeof req.body.tags === 'string') {
                try {
                    tags = JSON.parse(req.body.tags);
                } catch {
                    tags = req.body.tags.split(',').map(t => t.trim()).filter(t => t);
                }
            } else if (Array.isArray(req.body.tags)) {
                tags = req.body.tags;
            }
        }
        
        const productId = await db.createProduct({
            name: req.body.name,
            price: parseFloat(req.body.price),
            category: req.body.category,
            description: req.body.description || '',
            images: images,
            emoji: req.body.emoji || '📦',
            tags: tags,
            sku: req.body.sku || '',
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : true,
            rating: req.body.rating ? parseFloat(req.body.rating) : null
        });
        
        const newProduct = await db.getProductById(productId);
        res.status(201).json(newProduct);
    } catch (error) {
        console.error('Ошибка создания товара:', error);
        res.status(500).json({ error: 'Ошибка создания товара: ' + error.message });
    }
});

// Обновить товар (с поддержкой загрузки нескольких файлов)
app.put('/api/products/:id', upload.array('images', 10), handleMulterError, async (req, res) => {
    try {
        const existingProduct = await db.getProductById(parseInt(req.params.id));
        
        if (!existingProduct) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        // Получаем текущие изображения
        let currentImages = existingProduct.images || [];
        
        // Добавляем существующие изображения, если они переданы
        if (req.body.existingImages) {
            try {
                currentImages = JSON.parse(req.body.existingImages);
            } catch (e) {
                console.error('Ошибка парсинга existingImages:', e);
            }
        }
        
        // Добавляем новые загруженные файлы
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => `фото/${file.filename}`);
            currentImages = [...currentImages, ...newImages];
        }
        
        // Обработка тегов (может быть строкой или массивом)
        let tags = existingProduct.tags || [];
        if (req.body.tags !== undefined) {
            if (typeof req.body.tags === 'string') {
                try {
                    tags = JSON.parse(req.body.tags);
                } catch {
                    tags = req.body.tags.split(',').map(t => t.trim()).filter(t => t);
                }
            } else if (Array.isArray(req.body.tags)) {
                tags = req.body.tags;
            }
        }
        
        await db.updateProduct(parseInt(req.params.id), {
            name: req.body.name,
            price: parseFloat(req.body.price),
            category: req.body.category,
            description: req.body.description || '',
            images: currentImages,
            emoji: req.body.emoji || existingProduct.emoji,
            tags: tags,
            sku: req.body.sku !== undefined ? req.body.sku : existingProduct.sku || '',
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : existingProduct.inStock !== false,
            rating: req.body.rating ? parseFloat(req.body.rating) : (existingProduct.rating || null)
        });
        
        const updatedProduct = await db.getProductById(parseInt(req.params.id));
        res.json(updatedProduct);
    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        res.status(500).json({ error: 'Ошибка обновления товара: ' + error.message });
    }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productToDelete = await db.getProductById(parseInt(req.params.id));
        
        if (!productToDelete) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        // Удаляем изображения товара, если они были загружены
        const imagesToDelete = productToDelete.images || [];
        for (const imagePath of imagesToDelete) {
            if (imagePath && imagePath.startsWith('фото/')) {
                const fullPath = path.join(__dirname, imagePath);
                fs.unlink(fullPath).catch(() => {}); // Игнорируем ошибки удаления
            }
        }
        
        const deleted = await db.deleteProduct(parseInt(req.params.id));
        if (deleted) {
            res.json({ success: true, message: 'Товар удален' });
        } else {
            res.status(404).json({ error: 'Товар не найден' });
        }
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        res.status(500).json({ error: 'Ошибка удаления товара' });
    }
});

// ============================================
// API для платежей Т-Банк
// ============================================

// Создать платеж
app.post('/api/payment/create', async (req, res) => {
    try {
        if (!tinkoffPayment.isConfigured()) {
            return res.status(400).json({
                success: false,
                error: 'Платежная система Т-Банк не настроена. Проверьте TINKOFF_TERMINAL_KEY и TINKOFF_PASSWORD в config.js'
            });
        }

        const { orderId, amount, description, items, customer } = req.body;

        if (!orderId || !amount || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Необходимо указать orderId, amount и items'
            });
        }

        // Формируем позиции чека
        const receiptItems = tinkoffPayment.formatReceiptItems(items);

        // Создаем платеж
        const paymentData = {
            amount: Math.round(amount * 100), // Конвертируем в копейки
            orderId: orderId.toString(),
            description: description || `Заказ #${orderId}`,
            items: receiptItems,
            customer: customer || {},
            successUrl: `${req.protocol}://${req.get('host')}/payment/success?orderId=${orderId}`,
            failureUrl: `${req.protocol}://${req.get('host')}/payment/failure?orderId=${orderId}`
        };

        let payment;
        try {
            payment = await tinkoffPayment.createPayment(paymentData);
        } catch (paymentError) {
            console.error('Ошибка создания платежа Т-Банк:', paymentError);
            
            // Обработка ошибки "Заказ с таким order_id уже существует" (код '8')
            if (paymentError.code === '8' || (paymentError.details && paymentError.details.includes('уже существует'))) {
                console.log(`Платеж с orderId ${orderId} уже существует, создаем новый с уникальным orderId...`);
                
                // Создаем новый платеж с уникальным orderId (добавляем timestamp)
                const uniqueOrderId = `${orderId}-${Date.now()}`;
                paymentData.orderId = uniqueOrderId;
                paymentData.description = `${description || `Заказ #${orderId}`}`;
                
                try {
                    payment = await tinkoffPayment.createPayment(paymentData);
                    console.log(`Платеж успешно создан с уникальным orderId: ${uniqueOrderId}`);
                } catch (retryError) {
                    console.error('Ошибка создания платежа с уникальным orderId:', retryError);
                    return res.status(500).json({
                        success: false,
                        error: retryError.message || 'Ошибка создания платежа в Т-Банк',
                        details: process.env.NODE_ENV === 'development' ? retryError.stack : undefined
                    });
                }
            } else {
                // Для других ошибок возвращаем стандартный ответ
                return res.status(500).json({
                    success: false,
                    error: paymentError.message || 'Ошибка создания платежа в Т-Банк',
                    details: process.env.NODE_ENV === 'development' ? paymentError.stack : undefined,
                    code: paymentError.code,
                    errorDetails: paymentError.details
                });
            }
        }

        // Проверяем, что платеж создан успешно
        if (!payment || !payment.success || !payment.paymentId) {
            console.error('Платеж не создан. Ответ:', payment);
            return res.status(500).json({
                success: false,
                error: 'Не удалось создать платеж. Платежная система вернула некорректный ответ.',
                details: payment
            });
        }

        // Сохраняем платеж в БД
        let paymentId;
        try {
            paymentId = await db.createPayment({
                orderId: orderId,
                paymentSystem: 'tinkoff',
                paymentId: payment.paymentId,
                amount: amount,
                currency: 'RUB',
                status: 'pending',
                customer: customer
            });
        } catch (dbError) {
            console.error('Ошибка сохранения платежа в БД:', dbError);
            // Платеж создан в Т-Банк, но не сохранен в БД - это не критично
            // Возвращаем успешный ответ, но без dbPaymentId
        }

        res.json({
            success: true,
            paymentId: payment.paymentId,
            paymentUrl: payment.paymentUrl,
            orderId: payment.orderId || orderId,
            dbPaymentId: paymentId || null
        });

    } catch (error) {
        console.error('Неожиданная ошибка при создании платежа:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Внутренняя ошибка сервера при создании платежа',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Проверить статус платежа
app.get('/api/payment/status/:paymentId', async (req, res) => {
    try {
        if (!tinkoffPayment.isConfigured()) {
            return res.status(400).json({
                success: false,
                error: 'Платежная система Т-Банк не настроена'
            });
        }

        const { paymentId } = req.params;
        const status = await tinkoffPayment.getPaymentStatus(paymentId);

        // Обновляем статус в БД
        if (status.success) {
            await db.updatePaymentStatus(paymentId, status.status);
            
            // Если платеж успешен, обновляем статус заказа
            if (status.status === 'CONFIRMED' || status.status === 'COMPLETED') {
                await db.updateOrderStatus(status.orderId, 'confirmed');
            }
        }

        res.json(status);

    } catch (error) {
        console.error('Ошибка получения статуса платежа:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Ошибка получения статуса платежа'
        });
    }
});

// Вебхук для получения уведомлений от Т-Банк
app.post('/api/payment/webhook', express.json(), async (req, res) => {
    try {
        console.log('=== ВЕБХУК ОТ Т-БАНК ===');
        console.log('Получены данные:', JSON.stringify(req.body, null, 2));
        
        if (!tinkoffPayment.isConfigured()) {
            console.error('Платежная система не настроена');
            return res.status(400).json({ error: 'Платежная система не настроена' });
        }

        const webhookData = req.body;
        
        if (!webhookData) {
            console.error('Пустое тело запроса');
            return res.status(400).json({ error: 'Пустое тело запроса' });
        }
        
        // Обрабатываем вебхук
        const result = await tinkoffPayment.handleWebhook(webhookData);
        console.log('Результат обработки вебхука:', JSON.stringify(result, null, 2));

        // Обновляем статус платежа в БД
        await db.updatePaymentByPaymentId(result.paymentId, {
            status: result.status === 'CONFIRMED' || result.status === 'COMPLETED' ? 'completed' : 
                   result.status === 'REJECTED' || result.status === 'CANCELED' ? 'failed' : 'processing'
        });

        // Обновляем статус заказа
        if (result.status === 'CONFIRMED' || result.status === 'COMPLETED') {
            // Извлекаем оригинальный orderId (может быть формат "2-1769094387607", нужен "2")
            const originalOrderId = result.orderId.toString().split('-')[0];
            console.log(`Обработка успешной оплаты. OrderId из вебхука: ${result.orderId}, оригинальный: ${originalOrderId}`);
            
            await db.updateOrderStatus(originalOrderId, 'confirmed');
            
            // Отправляем полную информацию администратору только после успешной оплаты
            if (ADMIN_CHAT_ID) {
                console.log(`ADMIN_CHAT_ID установлен: ${ADMIN_CHAT_ID}`);
                try {
                    // Получаем полную информацию о заказе по оригинальному ID
                    const order = await db.getOrderById(originalOrderId);
                    console.log('Заказ найден:', order ? `ID ${order.id}` : 'не найден');
                    
                    if (order) {
                        // Формируем сообщение с полной информацией
                        let message = `✅ <b>НОВЫЙ ОПЛАЧЕННЫЙ ЗАКАЗ</b>\n\n`;
                        message += `📦 <b>Заказ #${order.id}</b>\n`;
                        message += `💰 Сумма: <b>${formatPrice(order.total)}</b>\n\n`;
                        
                        // Информация о доставке
                        if (order.delivery_data) {
                            const delivery = order.delivery_data;
                            message += `👤 <b>Данные получателя:</b>\n`;
                            message += `ФИО: ${delivery.fio || 'Не указано'}\n`;
                            message += `Телефон: ${delivery.phone || 'Не указано'}\n`;
                            if (delivery.email) {
                                message += `Email: ${delivery.email}\n`;
                            }
                            message += `\n📍 <b>Адрес доставки:</b>\n`;
                            message += `Город: ${delivery.city || 'Не указано'}\n`;
                            message += `Адрес: ${delivery.address || 'Не указано'}\n`;
                            if (delivery.postal) {
                                message += `Индекс: ${delivery.postal}\n`;
                            }
                            message += `\n`;
                        }
                        
                        // Товары в заказе
                        if (order.items && order.items.length > 0) {
                            message += `🛍️ <b>Товары:</b>\n`;
                            order.items.forEach((item, index) => {
                                message += `${index + 1}. ${item.name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
                            });
                            message += `\n`;
                        }
                        
                        // Информация о пользователе Telegram
                        if (order.user_first_name || order.user_last_name || order.user_username) {
                            message += `👤 <b>Пользователь Telegram:</b>\n`;
                            if (order.user_first_name || order.user_last_name) {
                                message += `Имя: ${order.user_first_name || ''} ${order.user_last_name || ''}\n`;
                            }
                            if (order.user_username) {
                                message += `Username: @${order.user_username}\n`;
                            }
                            if (order.user_id) {
                                message += `ID: ${order.user_id}\n`;
                            }
                        }
                        
                        message += `\n⏰ Дата: ${new Date(order.created_at).toLocaleString('ru-RU')}\n`;
                        message += `💳 ID платежа: ${result.paymentId}`;
                        
                        await sendTelegramMessage(ADMIN_CHAT_ID, message);
                        console.log('Уведомление администратору отправлено успешно');
                    } else {
                        console.error('Заказ не найден в БД');
                    }
                } catch (orderError) {
                    console.error('Ошибка получения данных заказа для уведомления:', orderError);
                    console.error('Stack trace:', orderError.stack);
                    // Отправляем базовое уведомление в случае ошибки
                    try {
                        await sendTelegramMessage(
                            ADMIN_CHAT_ID,
                            `✅ <b>ЗАКАЗ ОПЛАЧЕН</b>\n\nЗаказ: #${originalOrderId}\nСумма: ${formatPrice(result.amount / 100)}\nПлатеж: ${result.paymentId}`
                        );
                        console.log('Базовое уведомление отправлено');
                    } catch (sendError) {
                        console.error('Ошибка отправки базового уведомления:', sendError);
                    }
                }
            } else {
                console.warn('ADMIN_CHAT_ID не установлен! Уведомление не будет отправлено.');
            }
        } else if (result.status === 'REJECTED' || result.status === 'CANCELED') {
            // Отправляем уведомление об отклонении
            if (ADMIN_CHAT_ID) {
                const originalOrderId = result.orderId.toString().split('-')[0];
                await sendTelegramMessage(
                    ADMIN_CHAT_ID,
                    `❌ <b>ПЛАТЕЖ ОТКЛОНЕН</b>\n\nЗаказ: #${originalOrderId}\nСтатус: ${result.status}\nСумма: ${formatPrice(result.amount / 100)}`
                );
                console.log('Уведомление об отклонении отправлено');
            }
        } else {
            console.log(`Статус платежа: ${result.status} - уведомление не требуется`);
        }

        // Т-Банк требует ответ "OK" заглавными буквами
        console.log('Отправляем ответ OK в Т-Банк');
        res.status(200).send('OK');

    } catch (error) {
        console.error('Ошибка обработки вебхука:', error);
        console.error('Stack trace:', error.stack);
        // Всегда возвращаем 200 OK, чтобы Т-Банк не повторял запрос
        res.status(200).send('OK');
    }
});

// Страницы успешной и неудачной оплаты
app.get('/payment/success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Оплата успешна</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }
                .success-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                h1 { color: #10b981; margin-bottom: 10px; }
                p { color: #666; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✅</div>
                <h1>Оплата успешна!</h1>
                <p>Ваш заказ принят в обработку. Мы свяжемся с вами в ближайшее время.</p>
                <p>Вы можете закрыть это окно.</p>
            </div>
        </body>
        </html>
    `);
});

app.get('/payment/failure', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ошибка оплаты</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }
                .error-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                h1 { color: #ef4444; margin-bottom: 10px; }
                p { color: #666; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="error-icon">❌</div>
                <h1>Ошибка оплаты</h1>
                <p>К сожалению, произошла ошибка при обработке платежа.</p>
                <p>Пожалуйста, попробуйте еще раз или свяжитесь с поддержкой.</p>
            </div>
        </body>
        </html>
    `);
});

// ============================================
// Проверка здоровья сервера
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Обработка ошибок для API маршрутов
// ============================================

// Общий обработчик ошибок для API
app.use('/api', (err, req, res, next) => {
    console.error('Ошибка API:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({ 
        error: err.message || 'Внутренняя ошибка сервера' 
    });
});

// ============================================
// Страницы
// ============================================

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Админ-панель
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Страницы с документами
app.get('/offer', (req, res) => {
    res.sendFile(path.join(__dirname, 'offer.html'));
});

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/delivery', (req, res) => {
    res.sendFile(path.join(__dirname, 'delivery.html'));
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('===================================');
    console.log('🚀 Сервер запущен!');
    console.log(`📡 Порт: ${PORT}`);
    console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
    console.log('===================================');
    
    if (!BOT_TOKEN || BOT_TOKEN === 'ВАШ_ТОКЕН_БОТА') {
        console.warn('⚠️  ВНИМАНИЕ: Токен бота не настроен!');
        console.warn('   Укажите токен в файле config.js или переменной окружения BOT_TOKEN');
    }
    
    if (!ADMIN_CHAT_ID) {
        console.warn('⚠️  ВНИМАНИЕ: ADMIN_CHAT_ID не указан!');
        console.warn('   Заказы не будут отправляться администратору');
        console.warn('   Узнайте свой ID через @userinfobot и укажите в config.js или ADMIN_CHAT_ID');
    }
    
    // Дополнительная проверка для Railway
    console.log('✅ Express сервер готов принимать запросы');
    console.log(`✅ Переменная PORT: ${PORT}`);
    console.log(`✅ BOT_TOKEN настроен: ${BOT_TOKEN ? 'Да' : 'Нет'}`);
});
