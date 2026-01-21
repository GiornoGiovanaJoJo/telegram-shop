// Админ-панель для управления товарами
const API_BASE = window.location.origin;

// Проверка доступа (простая проверка через параметр или localStorage)
const ADMIN_KEY = 'admin_access';
let isAdmin = false;

// Инициализация
function initAdmin() {
    // Проверка доступа через URL параметр или localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const adminKey = urlParams.get('key') || localStorage.getItem(ADMIN_KEY);
    
    // Простая проверка (в продакшене использовать реальную аутентификацию)
    if (adminKey === 'anikin_admin_2026' || localStorage.getItem(ADMIN_KEY) === 'true') {
        isAdmin = true;
        localStorage.setItem(ADMIN_KEY, 'true');
        loadProducts();
        setupEventListeners();
    } else {
        // Показать форму входа
        showLoginForm();
    }
}

// Показать форму входа
function showLoginForm() {
    document.querySelector('.admin-content').innerHTML = `
        <div class="admin-section" style="max-width: 400px; margin: 50px auto;">
            <h2>Вход в админ-панель</h2>
            <form id="login-form">
                <div class="form-group">
                    <label>Ключ доступа</label>
                    <input type="password" id="login-key" placeholder="Введите ключ доступа" required>
                </div>
                <button type="submit" class="admin-btn admin-btn-primary" style="width: 100%;">Войти</button>
            </form>
        </div>
    `;
    
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const key = document.getElementById('login-key').value;
        if (key === 'anikin_admin_2026') {
            localStorage.setItem(ADMIN_KEY, 'true');
            location.reload();
        } else {
            alert('Неверный ключ доступа');
        }
    });
}

// Загрузка товаров
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/products`);
        const products = await response.json();
        renderProducts(products);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        document.getElementById('admin-products-list').innerHTML = 
            '<p style="color: var(--error-color);">Ошибка загрузки товаров</p>';
    }
}

// Отображение товаров
function renderProducts(products) {
    const container = document.getElementById('admin-products-list');
    
    if (products.length === 0) {
        container.innerHTML = '<p>Товаров пока нет. Добавьте первый товар!</p>';
        return;
    }
    
    container.innerHTML = products.map(product => `
        <div class="admin-product-card">
            <img src="${product.image || 'фото/photo_2026-01-21_10-27-35.jpg'}" 
                 alt="${product.name}" 
                 class="admin-product-image"
                 onerror="this.src=''; this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div style="display: none; width: 100%; height: 180px; align-items: center; justify-content: center; font-size: 48px; background: var(--border-color); border-radius: 12px; margin-bottom: 12px;">
                ${product.emoji || '📦'}
            </div>
            <div class="admin-product-info">
                <h3>${product.name}</h3>
                <div class="admin-product-price">${formatPrice(product.price)}</div>
                <div class="admin-product-category">${getCategoryName(product.category)}</div>
                <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 12px;">
                    ${product.description || 'Нет описания'}
                </p>
                <div class="admin-product-actions">
                    <button class="admin-btn admin-btn-primary" onclick="editProduct(${product.id})">
                        Редактировать
                    </button>
                    <button class="admin-btn admin-btn-danger" onclick="deleteProduct(${product.id})">
                        Удалить
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Получить название категории
function getCategoryName(category) {
    const categories = {
        'electronics': 'Электроника',
        'clothing': 'Одежда',
        'books': 'Книги',
        'other': 'Другое'
    };
    return categories[category] || category;
}

// Форматирование цены
function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка добавления товара
    document.getElementById('add-product-btn').addEventListener('click', () => {
        openProductModal();
    });
    
    // Закрытие модального окна
    document.getElementById('modal-close').addEventListener('click', closeProductModal);
    document.getElementById('modal-cancel').addEventListener('click', closeProductModal);
    
    // Обработка формы
    document.getElementById('product-form').addEventListener('submit', handleProductSubmit);
    
    // Выход
    document.getElementById('admin-logout').addEventListener('click', () => {
        localStorage.removeItem(ADMIN_KEY);
        location.reload();
    });
    
    // Закрытие модального окна по клику вне его
    document.getElementById('product-modal').addEventListener('click', (e) => {
        if (e.target.id === 'product-modal') {
            closeProductModal();
        }
    });
}

// Открыть модальное окно для добавления/редактирования
function openProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('modal-title');
    
    if (product) {
        title.textContent = 'Редактировать товар';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-image').value = product.image || '';
        document.getElementById('product-emoji').value = product.emoji || '';
    } else {
        title.textContent = 'Добавить товар';
        form.reset();
        document.getElementById('product-id').value = '';
    }
    
    modal.classList.add('active');
}

// Закрыть модальное окно
function closeProductModal() {
    document.getElementById('product-modal').classList.remove('active');
    document.getElementById('product-form').reset();
}

// Редактировать товар
async function editProduct(id) {
    try {
        const response = await fetch(`${API_BASE}/api/products/${id}`);
        const product = await response.json();
        openProductModal(product);
    } catch (error) {
        console.error('Ошибка загрузки товара:', error);
        alert('Ошибка загрузки товара');
    }
}

// Удалить товар
async function deleteProduct(id) {
    if (!confirm('Вы уверены, что хотите удалить этот товар?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/products/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadProducts();
            alert('Товар удален');
        } else {
            throw new Error('Ошибка удаления');
        }
    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        alert('Ошибка удаления товара');
    }
}

// Обработка отправки формы
async function handleProductSubmit(e) {
    e.preventDefault();
    
    const formData = {
        id: document.getElementById('product-id').value || null,
        name: document.getElementById('product-name').value,
        price: parseFloat(document.getElementById('product-price').value),
        category: document.getElementById('product-category').value,
        description: document.getElementById('product-description').value,
        image: document.getElementById('product-image').value,
        emoji: document.getElementById('product-emoji').value || '📦'
    };
    
    try {
        const url = formData.id 
            ? `${API_BASE}/api/products/${formData.id}`
            : `${API_BASE}/api/products`;
        
        const method = formData.id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            closeProductModal();
            loadProducts();
            alert(formData.id ? 'Товар обновлен' : 'Товар добавлен');
        } else {
            throw new Error('Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка сохранения товара:', error);
        alert('Ошибка сохранения товара');
    }
}

// Глобальные функции
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

// Инициализация при загрузке
initAdmin();
