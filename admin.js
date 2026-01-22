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
                ${product.tags && product.tags.length > 0 ? `
                    <div style="margin-bottom: 8px;">
                        <strong>Теги:</strong> ${product.tags.join(', ')}
                    </div>
                ` : ''}
                ${product.sku ? `
                    <div style="margin-bottom: 8px; font-size: 12px; color: var(--text-secondary);">
                        Артикул: ${product.sku}
                    </div>
                ` : ''}
                ${product.rating ? `
                    <div style="margin-bottom: 8px;">
                        ⭐ Рейтинг: ${product.rating}
                    </div>
                ` : ''}
                <div style="margin-bottom: 8px;">
                    ${product.inStock !== false ? '✅ В наличии' : '❌ Нет в наличии'}
                </div>
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
        'backpack': 'Рюкзак',
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
    
    // Обработка выбора файлов для предпросмотра
    document.getElementById('product-images-file').addEventListener('change', handleImagesPreview);
    
    // Обработка выбора категории
    const categorySelect = document.getElementById('product-category-select');
    const categoryCustom = document.getElementById('product-category-custom');
    const categoryHidden = document.getElementById('product-category');
    
    categorySelect.addEventListener('change', () => {
        const selectedValue = categorySelect.value;
        if (selectedValue === 'custom') {
            categoryCustom.style.display = 'block';
            categoryCustom.required = true;
            categorySelect.required = false;
            categoryHidden.value = '';
        } else if (selectedValue) {
            categoryCustom.style.display = 'none';
            categoryCustom.required = false;
            categorySelect.required = true;
            categoryHidden.value = selectedValue;
        } else {
            categoryCustom.style.display = 'none';
            categoryCustom.required = false;
            categorySelect.required = true;
            categoryHidden.value = '';
        }
    });
    
    // Обработка ввода категории вручную
    categoryCustom.addEventListener('input', () => {
        categoryHidden.value = categoryCustom.value.trim();
    });
    
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

// Предпросмотр нескольких изображений
function handleImagesPreview(e) {
    const files = Array.from(e.target.files);
    const previewContainer = document.getElementById('images-preview-container');
    const previewList = document.getElementById('images-preview-list');
    
    previewList.innerHTML = '';
    
    if (files.length > 0) {
        previewContainer.style.display = 'block';
        
        files.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageDiv = document.createElement('div');
                imageDiv.style.position = 'relative';
                imageDiv.style.display = 'inline-block';
                
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = '100px';
                img.style.height = '100px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.border = '1px solid var(--border-color)';
                img.style.marginBottom = '5px';
                
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.type = 'button';
                removeBtn.style.position = 'absolute';
                removeBtn.style.top = '0';
                removeBtn.style.right = '0';
                removeBtn.style.background = 'var(--error-color)';
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '50%';
                removeBtn.style.width = '24px';
                removeBtn.style.height = '24px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.fontSize = '16px';
                removeBtn.style.lineHeight = '1';
                removeBtn.onclick = () => {
                    // Удаляем файл из input
                    const dt = new DataTransfer();
                    Array.from(document.getElementById('product-images-file').files).forEach((f, i) => {
                        if (i !== index) dt.items.add(f);
                    });
                    document.getElementById('product-images-file').files = dt.files;
                    imageDiv.remove();
                    if (document.getElementById('product-images-file').files.length === 0) {
                        previewContainer.style.display = 'none';
                    }
                };
                
                imageDiv.appendChild(img);
                imageDiv.appendChild(removeBtn);
                previewList.appendChild(imageDiv);
            };
            reader.readAsDataURL(file);
        });
    } else {
        previewContainer.style.display = 'none';
    }
}

// Открыть модальное окно для добавления/редактирования
function openProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('modal-title');
    const imagesPreviewContainer = document.getElementById('images-preview-container');
    const imagesPreviewList = document.getElementById('images-preview-list');
    const imagesFileInput = document.getElementById('product-images-file');
    
    const categorySelect = document.getElementById('product-category-select');
    const categoryCustom = document.getElementById('product-category-custom');
    const categoryHidden = document.getElementById('product-category');
    
    if (product) {
        title.textContent = 'Редактировать товар';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-emoji').value = product.emoji || '';
        // ДОБАВЬТЕ ЗДЕСЬ: заполнение ваших новых полей
        document.getElementById('product-tags').value = product.tags || '';
        document.getElementById('product-sku').value = product.sku || '';
        document.getElementById('product-in-stock').checked = product.inStock !== false; // по умолчанию true
        document.getElementById('product-rating').value = product.rating || '';
        
        // Обработка изображений (поддержка старого формата image и нового images)
        const productImages = product.images || (product.image ? [product.image] : []);
        document.getElementById('product-images').value = JSON.stringify(productImages);
        
        // Обработка категории
        const categoryValue = product.category || '';
        const standardCategories = ['electronics', 'clothing', 'books', 'backpack', 'other'];
        if (standardCategories.includes(categoryValue)) {
            categorySelect.value = categoryValue;
            categoryCustom.style.display = 'none';
            categoryCustom.required = false;
            categorySelect.required = true;
            categoryCustom.value = '';
            categoryHidden.value = categoryValue;
        } else if (categoryValue) {
            // Кастомная категория
            categorySelect.value = 'custom';
            categoryCustom.style.display = 'block';
            categoryCustom.required = true;
            categorySelect.required = false;
            categoryCustom.value = categoryValue;
            categoryHidden.value = categoryValue;
        } else {
            categorySelect.value = '';
            categoryCustom.style.display = 'none';
            categoryCustom.required = false;
            categorySelect.required = true;
            categoryCustom.value = '';
            categoryHidden.value = '';
        }
        
        // Показываем текущие изображения
        if (productImages.length > 0) {
            imagesPreviewList.innerHTML = '';
            productImages.forEach((imgSrc, index) => {
                const imageDiv = document.createElement('div');
                imageDiv.style.position = 'relative';
                imageDiv.style.display = 'inline-block';
                
                const img = document.createElement('img');
                img.src = imgSrc;
                img.style.width = '100px';
                img.style.height = '100px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '8px';
                img.style.border = '1px solid var(--border-color)';
                img.style.marginBottom = '5px';
                
                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.type = 'button';
                removeBtn.style.position = 'absolute';
                removeBtn.style.top = '0';
                removeBtn.style.right = '0';
                removeBtn.style.background = 'var(--error-color)';
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '50%';
                removeBtn.style.width = '24px';
                removeBtn.style.height = '24px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.fontSize = '16px';
                removeBtn.style.lineHeight = '1';
                removeBtn.onclick = () => {
                    const currentImages = JSON.parse(document.getElementById('product-images').value || '[]');
                    currentImages.splice(index, 1);
                    document.getElementById('product-images').value = JSON.stringify(currentImages);
                    imageDiv.remove();
                    if (currentImages.length === 0) {
                        imagesPreviewContainer.style.display = 'none';
                    }
                };
                
                imageDiv.appendChild(img);
                imageDiv.appendChild(removeBtn);
                imagesPreviewList.appendChild(imageDiv);
            });
            imagesPreviewContainer.style.display = 'block';
        } else {
            imagesPreviewContainer.style.display = 'none';
        }
        imagesFileInput.value = ''; // Сбрасываем выбор файла
    } else {
        title.textContent = 'Добавить товар';
        form.reset();
        document.getElementById('product-id').value = '';
        categorySelect.value = '';
        categoryCustom.style.display = 'none';
        categoryCustom.required = false;
        categorySelect.required = true;
        categoryCustom.value = '';
        categoryHidden.value = '';
        imagesPreviewContainer.style.display = 'none';
        imagesFileInput.value = '';
        document.getElementById('product-images').value = '';
    }
    
    modal.classList.add('active');
}

// Закрыть модальное окно
function closeProductModal() {
    document.getElementById('product-modal').classList.remove('active');
    document.getElementById('product-form').reset();
    document.getElementById('images-preview-container').style.display = 'none';
    document.getElementById('product-images-file').value = '';
    
    // Сброс полей категории
    const categorySelect = document.getElementById('product-category-select');
    const categoryCustom = document.getElementById('product-category-custom');
    const categoryHidden = document.getElementById('product-category');
    categorySelect.value = '';
    categoryCustom.style.display = 'none';
    categoryCustom.required = false;
    categorySelect.required = true;
    categoryCustom.value = '';
    categoryHidden.value = '';
    document.getElementById('product-images').value = '';
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
    
    const productId = document.getElementById('product-id').value || null;
    const imageFiles = Array.from(document.getElementById('product-images-file').files);
    const currentImages = JSON.parse(document.getElementById('product-images').value || '[]');
    
    // Получаем категорию из скрытого поля (которое обновляется через обработчики событий)
    const categoryValue = document.getElementById('product-category').value.trim();
    if (!categoryValue) {
        alert('Пожалуйста, выберите или введите категорию');
        return;
    }
    
    try {
        const url = productId 
            ? `${API_BASE}/api/products/${productId}`
            : `${API_BASE}/api/products`;
        
        const method = productId ? 'PUT' : 'POST';
        
        // Используем FormData если есть файлы, иначе JSON
        let requestBody;
        let headers = {};
        
        if (imageFiles.length > 0) {
            // Используем FormData для отправки файлов
            const formData = new FormData();
            imageFiles.forEach((file, index) => {
                formData.append('images', file);
            });
            formData.append('name', document.getElementById('product-name').value);
            formData.append('price', document.getElementById('product-price').value);
            formData.append('category', categoryValue);
            formData.append('description', document.getElementById('product-description').value);
            formData.append('emoji', document.getElementById('product-emoji').value || '📦');
            
            // Добавляем существующие изображения
            if (currentImages.length > 0) {
                formData.append('existingImages', JSON.stringify(currentImages));
            }
            
            const tagsValue = document.getElementById('product-tags').value;
            if (tagsValue) {
                const tags = tagsValue.split(',').map(t => t.trim()).filter(t => t);
                formData.append('tags', JSON.stringify(tags));
            }
            
            formData.append('sku', document.getElementById('product-sku').value || '');
            formData.append('inStock', document.getElementById('product-in-stock').checked);
            
            const ratingValue = document.getElementById('product-rating').value;
            if (ratingValue) {
                formData.append('rating', ratingValue);
            }
            
            requestBody = formData;
            // Не устанавливаем Content-Type для FormData, браузер сделает это сам
        } else {
            // Для создания или обновления без файлов используем JSON
            const productData = {
                id: productId,
                name: document.getElementById('product-name').value,
                price: parseFloat(document.getElementById('product-price').value),
                category: categoryValue,
                description: document.getElementById('product-description').value,
                images: currentImages,
                emoji: document.getElementById('product-emoji').value || '📦',
                tags: document.getElementById('product-tags').value.split(',').map(t => t.trim()).filter(t => t),
                sku: document.getElementById('product-sku').value || '',
                inStock: document.getElementById('product-in-stock').checked,
                rating: parseFloat(document.getElementById('product-rating').value) || null
            };
            
            requestBody = JSON.stringify(productData);
            headers['Content-Type'] = 'application/json';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: requestBody
        });
        
        // Проверяем тип ответа перед парсингом
        const contentType = response.headers.get('content-type');
        let responseData;
        
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
        } else {
            // Если сервер вернул не JSON (например, HTML с ошибкой), читаем как текст
            const text = await response.text();
            console.error('Сервер вернул не JSON:', text.substring(0, 200));
            throw new Error('Сервер вернул некорректный ответ. Проверьте консоль сервера.');
        }
        
        if (response.ok) {
            closeProductModal();
            loadProducts();
            alert(productId ? 'Товар обновлен' : 'Товар добавлен');
        } else {
            throw new Error(responseData.error || 'Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка сохранения товара:', error);
        alert('Ошибка сохранения товара: ' + error.message);
    }
}

// Глобальные функции
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

// Инициализация при загрузке
initAdmin();
