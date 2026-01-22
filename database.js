// База данных для хранения товаров, заказов и платежей
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

const DB_PATH = path.join(__dirname, 'database.sqlite');

// Инициализация базы данных
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Ошибка подключения к БД:', err);
                reject(err);
                return;
            }
            console.log('✅ Подключено к SQLite базе данных');
        });

        // Создание таблиц
        db.serialize(() => {
            // Таблица товаров
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT NOT NULL,
                description TEXT,
                images TEXT, -- JSON массив путей к изображениям
                emoji TEXT DEFAULT '📦',
                tags TEXT, -- JSON массив тегов
                sku TEXT,
                inStock INTEGER DEFAULT 1,
                rating REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Ошибка создания таблицы products:', err);
                }
            });

            // Таблица заказов
            db.run(`CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                user_first_name TEXT,
                user_last_name TEXT,
                user_username TEXT,
                items TEXT NOT NULL, -- JSON массив товаров
                total REAL NOT NULL,
                status TEXT DEFAULT 'pending', -- pending, confirmed, completed, cancelled
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Ошибка создания таблицы orders:', err);
                }
            });

            // Таблица платежей (согласно требованиям 152-ФЗ)
            db.run(`CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                payment_system TEXT NOT NULL, -- 'ozon', 'yookassa', 'sberbank', etc.
                payment_id TEXT, -- ID платежа в платежной системе
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'RUB',
                status TEXT DEFAULT 'pending', -- pending, processing, completed, failed, refunded
                payment_method TEXT, -- card, sbp, etc.
                card_last4 TEXT, -- Последние 4 цифры карты (если применимо)
                payer_name TEXT, -- Имя плательщика
                payer_email TEXT, -- Email плательщика
                payer_phone TEXT, -- Телефон плательщика
                ip_address TEXT, -- IP адрес плательщика (для безопасности)
                user_agent TEXT, -- User agent браузера
                metadata TEXT, -- JSON с дополнительными данными
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )`, (err) => {
                if (err) {
                    console.error('Ошибка создания таблицы payments:', err);
                }
            });

            // Таблица для хранения истории изменений платежей (для аудита)
            db.run(`CREATE TABLE IF NOT EXISTS payment_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (payment_id) REFERENCES payments(id)
            )`, (err) => {
                if (err) {
                    console.error('Ошибка создания таблицы payment_history:', err);
                }
            });

            // Индексы для оптимизации запросов
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_products_inStock ON products(inStock)`);

            resolve(db);
        });
    });
}

// Получить экземпляр БД
let dbInstance = null;

async function getDatabase() {
    if (!dbInstance) {
        dbInstance = await initDatabase();
    }
    return dbInstance;
}

// Функции для работы с товарами
async function getAllProducts() {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            // Преобразуем JSON строки в объекты
            const products = rows.map(row => ({
                ...row,
                images: row.images ? JSON.parse(row.images) : [],
                image: row.images ? JSON.parse(row.images)[0] || '' : '',
                tags: row.tags ? JSON.parse(row.tags) : [],
                inStock: row.inStock === 1
            }));
            resolve(products);
        });
    });
}

async function getProductById(id) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            if (!row) {
                resolve(null);
                return;
            }
            const product = {
                ...row,
                images: row.images ? JSON.parse(row.images) : [],
                image: row.images ? JSON.parse(row.images)[0] || '' : '',
                tags: row.tags ? JSON.parse(row.tags) : [],
                inStock: row.inStock === 1
            };
            resolve(product);
        });
    });
}

async function createProduct(productData) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        const { name, price, category, description, images, emoji, tags, sku, inStock, rating } = productData;
        const imagesJson = JSON.stringify(images || []);
        const tagsJson = JSON.stringify(tags || []);
        
        db.run(
            `INSERT INTO products (name, price, category, description, images, emoji, tags, sku, inStock, rating)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, price, category, description || '', imagesJson, emoji || '📦', tagsJson, sku || '', inStock ? 1 : 0, rating || null],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function updateProduct(id, productData) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        const { name, price, category, description, images, emoji, tags, sku, inStock, rating } = productData;
        const imagesJson = JSON.stringify(images || []);
        const tagsJson = JSON.stringify(tags || []);
        
        db.run(
            `UPDATE products 
             SET name = ?, price = ?, category = ?, description = ?, images = ?, emoji = ?, tags = ?, sku = ?, inStock = ?, rating = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [name, price, category, description || '', imagesJson, emoji || '📦', tagsJson, sku || '', inStock ? 1 : 0, rating || null, id],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes > 0);
            }
        );
    });
}

async function deleteProduct(id) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this.changes > 0);
        });
    });
}

// Функции для работы с заказами
async function createOrder(orderData) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        const { userInfo, items, total } = orderData;
        const itemsJson = JSON.stringify(items);
        
        db.run(
            `INSERT INTO orders (user_id, user_first_name, user_last_name, user_username, items, total)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userInfo?.id || null,
                userInfo?.first_name || null,
                userInfo?.last_name || null,
                userInfo?.username || null,
                itemsJson,
                total
            ],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function getAllOrders() {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            const orders = rows.map(row => ({
                ...row,
                items: JSON.parse(row.items)
            }));
            resolve(orders);
        });
    });
}

// Функции для работы с платежами
async function createPayment(paymentData) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        const {
            order_id, payment_system, payment_id, amount, currency, payment_method,
            card_last4, payer_name, payer_email, payer_phone, ip_address, user_agent, metadata
        } = paymentData;
        
        db.run(
            `INSERT INTO payments (order_id, payment_system, payment_id, amount, currency, payment_method, 
             card_last4, payer_name, payer_email, payer_phone, ip_address, user_agent, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                order_id, payment_system, payment_id || null, amount, currency || 'RUB',
                payment_method || null, card_last4 || null, payer_name || null,
                payer_email || null, payer_phone || null, ip_address || null,
                user_agent || null, metadata ? JSON.stringify(metadata) : null
            ],
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            }
        );
    });
}

async function updatePaymentStatus(paymentId, status, message = null) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Обновляем статус платежа
            db.run(
                `UPDATE payments 
                 SET status = ?, updated_at = CURRENT_TIMESTAMP, 
                     completed_at = ${status === 'completed' ? 'CURRENT_TIMESTAMP' : 'completed_at'}
                 WHERE id = ?`,
                [status, paymentId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Добавляем запись в историю
                    db.run(
                        `INSERT INTO payment_history (payment_id, status, message)
                         VALUES (?, ?, ?)`,
                        [paymentId, status, message || null],
                        (err) => {
                            if (err) {
                                console.error('Ошибка добавления в историю платежа:', err);
                            }
                            resolve(this.changes > 0);
                        }
                    );
                }
            );
        });
    });
}

async function getPaymentByPaymentId(paymentSystem, paymentId) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM payments WHERE payment_system = ? AND payment_id = ?',
            [paymentSystem, paymentId],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!row) {
                    resolve(null);
                    return;
                }
                const payment = {
                    ...row,
                    metadata: row.metadata ? JSON.parse(row.metadata) : null
                };
                resolve(payment);
            }
        );
    });
}

// Миграция данных из JSON в БД (однократно)
async function migrateFromJSON() {
    const fs = require('fs').promises;
    const productsFile = path.join(__dirname, 'products.json');
    
    try {
        const data = await fs.readFile(productsFile, 'utf8');
        const products = JSON.parse(data);
        
        const db = await getDatabase();
        const existingProducts = await getAllProducts();
        
        if (existingProducts.length === 0 && products.length > 0) {
            console.log('Миграция товаров из JSON в БД...');
            for (const product of products) {
                const images = product.images || (product.image ? [product.image] : []);
                await createProduct({
                    name: product.name,
                    price: product.price,
                    category: product.category,
                    description: product.description || '',
                    images: images,
                    emoji: product.emoji || '📦',
                    tags: product.tags || [],
                    sku: product.sku || '',
                    inStock: product.inStock !== false,
                    rating: product.rating || null
                });
            }
            console.log(`✅ Мигрировано ${products.length} товаров`);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Ошибка миграции:', error);
        }
    }
}

module.exports = {
    getDatabase,
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    getAllOrders,
    createPayment,
    updatePaymentStatus,
    getPaymentByPaymentId,
    migrateFromJSON
};
