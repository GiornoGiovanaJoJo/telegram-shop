// Простой сервер для обработки заказов из Telegram Mini App
const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');

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
            message: 'Заказ успешно оформлен!' 
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
        const products = await loadProducts();
        res.json(products);
    } catch (error) {
        console.error('Ошибка получения товаров:', error);
        res.status(500).json({ error: 'Ошибка получения товаров' });
    }
});

// Получить товар по ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const products = await loadProducts();
        const product = products.find(p => p.id === parseInt(req.params.id));
        
        if (!product) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Ошибка получения товара:', error);
        res.status(500).json({ error: 'Ошибка получения товара' });
    }
});

// Endpoint для загрузки изображения товара
app.post('/api/upload', upload.single('image'), (req, res) => {
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

// Создать новый товар (с поддержкой загрузки файла)
app.post('/api/products', upload.single('image'), async (req, res) => {
    try {
        const products = await loadProducts();
        
        // Если загружен файл, используем его путь
        let imagePath = req.body.image || '';
        if (req.file) {
            imagePath = `фото/${req.file.filename}`;
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
        
        const newProduct = {
            id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
            name: req.body.name,
            price: parseFloat(req.body.price),
            category: req.body.category,
            description: req.body.description || '',
            image: imagePath,
            emoji: req.body.emoji || '📦',
            // ДОБАВЬТЕ ЗДЕСЬ: сохранение ваших новых полей
            tags: tags,
            sku: req.body.sku || '',
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : true,
            rating: req.body.rating ? parseFloat(req.body.rating) : null
        };
        
        products.push(newProduct);
        await saveProducts(products);
        
        res.status(201).json(newProduct);
    } catch (error) {
        console.error('Ошибка создания товара:', error);
        res.status(500).json({ error: 'Ошибка создания товара' });
    }
});

// Обновить товар (с поддержкой загрузки файла)
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        const products = await loadProducts();
        const index = products.findIndex(p => p.id === parseInt(req.params.id));
        
        if (index === -1) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        // Если загружен новый файл, используем его путь
        let imagePath = req.body.image || products[index].image;
        if (req.file) {
            imagePath = `фото/${req.file.filename}`;
            // Опционально: удаляем старое изображение, если оно было загружено ранее
            if (products[index].image && products[index].image.startsWith('фото/')) {
                const oldImagePath = path.join(__dirname, products[index].image);
                fs.unlink(oldImagePath).catch(() => {}); // Игнорируем ошибки удаления
            }
        }
        
        // Обработка тегов (может быть строкой или массивом)
        let tags = products[index].tags || [];
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
        
        products[index] = {
            ...products[index],
            name: req.body.name,
            price: parseFloat(req.body.price),
            category: req.body.category,
            description: req.body.description || '',
            image: imagePath,
            emoji: req.body.emoji || products[index].emoji,
            // ДОБАВЬТЕ ЗДЕСЬ: обновление ваших новых полей
            tags: tags,
            sku: req.body.sku !== undefined ? req.body.sku : products[index].sku || '',
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : products[index].inStock !== false,
            rating: req.body.rating ? parseFloat(req.body.rating) : (products[index].rating || null)
        };
        
        await saveProducts(products);
        res.json(products[index]);
    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        res.status(500).json({ error: 'Ошибка обновления товара' });
    }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
    try {
        const products = await loadProducts();
        const productToDelete = products.find(p => p.id === parseInt(req.params.id));
        
        if (!productToDelete) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        // Удаляем изображение товара, если оно было загружено
        if (productToDelete.image && productToDelete.image.startsWith('фото/')) {
            const imagePath = path.join(__dirname, productToDelete.image);
            fs.unlink(imagePath).catch(() => {}); // Игнорируем ошибки удаления
        }
        
        const filteredProducts = products.filter(p => p.id !== parseInt(req.params.id));
        await saveProducts(filteredProducts);
        res.json({ success: true, message: 'Товар удален' });
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
