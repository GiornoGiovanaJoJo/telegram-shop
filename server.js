// Простой сервер для обработки заказов из Telegram Mini App
const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const db = require('./database');

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

// Функции для работы с товарами
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

async function loadProducts() {
    try {
        const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        return [];
    }
}

async function saveProducts(products) {
    try {
        await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения товаров:', error);
        return false;
    }
}

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
        
        // Сохраняем заказ в БД
        const orderId = await db.createOrder({
            userInfo: userInfo,
            items: orderData.items,
            total: orderData.total
        });
        
        // Отправляем заказ администратору (если указан)
        if (ADMIN_CHAT_ID) {
            await sendTelegramMessage(ADMIN_CHAT_ID, orderMessage);
        }
        
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
        const products = await loadProducts();
        
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
// API для платежей (подготовка, пока неактивно)
// ============================================

// Создать платеж (заглушка)
app.post('/api/payment/create', async (req, res) => {
    // TODO: Интеграция с платежными системами
    // Пока возвращаем заглушку
    res.json({
        success: false,
        message: 'Платежная система пока не активирована',
        paymentEnabled: false
    });
});

// Проверить статус платежа (заглушка)
app.get('/api/payment/status/:id', async (req, res) => {
    res.json({
        success: false,
        message: 'Платежная система пока не активирована'
    });
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
