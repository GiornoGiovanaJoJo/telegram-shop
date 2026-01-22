// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Настройка кнопки главного меню (если используется)
if (tg.MainButton) {
    tg.MainButton.setText('Оформить заказ');
    tg.MainButton.onClick(() => {
        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn && !checkoutBtn.disabled) {
            handleCheckout();
        }
    });
}

// Данные товаров (загружаются с сервера)
let products = [];

// Загрузка товаров с сервера
async function loadProducts() {
    try {
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3000/api/products'
            : '/api/products';
        
        const response = await fetch(apiUrl);
        products = await response.json();
        renderProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        // Fallback на пустой массив
        products = [];
        renderProducts();
    }
}

// Состояние приложения
let state = {
    cart: JSON.parse(localStorage.getItem('cart')) || [],
    currentCategory: 'all',
    searchQuery: '',
    currentProduct: null,
    currentQuantity: 1,
    productImages: [],
    currentImageIndex: 0
};

// Элементы DOM
const elements = {
    mainPage: document.getElementById('main-page'),
    productPage: document.getElementById('product-page'),
    cartPage: document.getElementById('cart-page'),
    productsGrid: document.getElementById('products-grid'),
    productDetails: document.getElementById('product-details'),
    cartItems: document.getElementById('cart-items'),
    cartBadge: document.getElementById('cart-badge'),
    cartIcon: document.getElementById('cart-icon'),
    searchInput: document.getElementById('search-input'),
    categorySelect: document.getElementById('category-select'),
    backBtn: document.getElementById('back-btn'),
    cartBackBtn: document.getElementById('cart-back-btn'),
    emptyCart: document.getElementById('empty-cart'),
    cartFooter: document.getElementById('cart-footer'),
    totalPrice: document.getElementById('total-price'),
    checkoutBtn: document.getElementById('checkout-btn')
};

// Инициализация
async function init() {
    await loadProducts();
    updateCartBadge();
    setupEventListeners();
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Поиск
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderProducts();
    });

    // Категории
    elements.categorySelect.addEventListener('change', (e) => {
        state.currentCategory = e.target.value;
        renderProducts();
    });
    
    // Устанавливаем начальное значение
    elements.categorySelect.value = state.currentCategory;

    // Корзина
    elements.cartIcon.addEventListener('click', () => {
        showPage('cart');
    });

    elements.cartBackBtn.addEventListener('click', () => {
        showPage('main');
    });

    // Кнопка оформления заказа
    elements.checkoutBtn.addEventListener('click', handleCheckout);
}

// Отображение товаров
function renderProducts() {
    const filtered = products.filter(product => {
        const matchesCategory = state.currentCategory === 'all' || product.category === state.currentCategory;
        const matchesSearch = product.name.toLowerCase().includes(state.searchQuery);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        elements.productsGrid.innerHTML = `
            <div class="empty-products">
                <div class="empty-products-icon">🔍</div>
                <div class="empty-products-title">Товары не найдены</div>
                <div class="empty-products-text">${state.searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Попробуйте выбрать другую категорию'}</div>
            </div>
        `;
        return;
    }

    elements.productsGrid.innerHTML = filtered.map(product => {
        // Получаем первое изображение (поддержка старого формата)
        const productImages = product.images || (product.image ? [product.image] : []);
        const firstImage = productImages[0] || '';
        
        return `
        <div class="product-card" onclick="showProduct(${product.id})">
            <img src="${firstImage}" alt="${product.name}" class="product-image" onerror="this.style.display='none'; this.parentElement.querySelector('.product-image-fallback').style.display='flex';">
            <div class="product-image-fallback" style="display: ${firstImage ? 'none' : 'flex'}; width: 100%; height: 180px; align-items: center; justify-content: center; font-size: 48px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">${product.emoji}</div>
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">${formatPrice(product.price)}</div>
            </div>
        </div>
        `;
    }).join('');
}

// Показать страницу товара
function showProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    state.currentProduct = product;
    state.currentQuantity = 1;

    const quantityInCart = getCartItemQuantity(productId);

    // Получаем массив изображений (поддержка старого формата)
    const productImages = product.images || (product.image ? [product.image] : []);
    const currentImageIndex = 0;
    
    // Создаем галерею изображений
    let galleryHTML = '';
    if (productImages.length > 0) {
        galleryHTML = `
            <div class="product-gallery" style="position: relative; margin-bottom: 20px;">
                <div class="product-gallery-main" style="width: 100%; height: 320px; position: relative; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-lg); background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); display: flex; align-items: center; justify-content: center;">
                    <img id="product-main-image" src="${productImages[0]}" alt="${product.name}" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; padding: 16px; box-sizing: border-box;" onerror="this.style.display='none'; this.parentElement.querySelector('.product-detail-image-fallback').style.display='flex';">
                    <div class="product-detail-image-fallback" style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 96px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">${product.emoji}</div>
                    ${productImages.length > 1 ? `
                        <button class="gallery-nav-btn gallery-prev" onclick="changeProductImage(-1)" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.9); border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">‹</button>
                        <button class="gallery-nav-btn gallery-next" onclick="changeProductImage(1)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.9); border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">›</button>
                        <div class="gallery-indicator" style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: white; padding: 5px 15px; border-radius: 20px; font-size: 14px;">
                            <span id="gallery-current">1</span> / <span id="gallery-total">${productImages.length}</span>
                        </div>
                    ` : ''}
                </div>
                ${productImages.length > 1 ? `
                    <div class="product-gallery-thumbnails" style="display: flex; gap: 10px; margin-top: 10px; overflow-x: auto; padding: 5px 0;">
                        ${productImages.map((img, idx) => `
                            <img src="${img}" alt="Фото ${idx + 1}" class="gallery-thumbnail" onclick="setProductImage(${idx})" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid ${idx === 0 ? 'var(--accent-yellow)' : 'transparent'}; opacity: ${idx === 0 ? '1' : '0.7'};">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        galleryHTML = `
            <div class="product-detail-image-fallback" style="display: flex; width: 100%; height: 320px; align-items: center; justify-content: center; font-size: 96px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border-radius: 20px; margin-bottom: 20px; box-shadow: var(--shadow-lg); border: 2px solid var(--border-color);">${product.emoji}</div>
        `;
    }
    
    // Сохраняем данные галереи в state
    state.productImages = productImages;
    state.currentImageIndex = 0;
    
    elements.productDetails.innerHTML = `
        ${galleryHTML}
        <div class="product-detail-name">${product.name}</div>
        <div class="product-detail-price">${formatPrice(product.price)}</div>
        <div class="product-detail-description">${product.description}</div>
        <div class="quantity-controls">
            <button class="quantity-btn" onclick="changeQuantity(-1)">−</button>
            <span class="quantity-value">${state.currentQuantity}</span>
            <button class="quantity-btn" onclick="changeQuantity(1)">+</button>
        </div>
        <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
            ${quantityInCart > 0 ? `В корзине: ${quantityInCart} шт. | Добавить еще` : 'Добавить в корзину'}
        </button>
    `;

    showPage('product');
}

// Изменение количества
function changeQuantity(delta) {
    state.currentQuantity = Math.max(1, state.currentQuantity + delta);
    const quantityValue = document.querySelector('.quantity-value');
    if (quantityValue) {
        quantityValue.textContent = state.currentQuantity;
    }
}

// Добавить в корзину
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = state.cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += state.currentQuantity;
    } else {
        state.cart.push({
            ...product,
            quantity: state.currentQuantity
        });
    }

    saveCart();
    updateCartBadge();
    
    // Обновить кнопку на странице товара
    const addBtn = document.querySelector('.add-to-cart-btn');
    if (addBtn) {
        const quantityInCart = getCartItemQuantity(productId);
        addBtn.textContent = quantityInCart > 0 
            ? `В корзине: ${quantityInCart} шт. | Добавить еще` 
            : 'Добавить в корзину';
    }

    // Показать уведомление
    tg.showAlert('Товар добавлен в корзину!');
}

// Удалить из корзины
function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.id !== productId);
    saveCart();
    updateCartBadge();
    renderCart();
}

// Изменить количество в корзине
function updateCartQuantity(productId, delta) {
    const item = state.cart.find(item => item.id === productId);
    if (!item) return;

    item.quantity = Math.max(1, item.quantity + delta);
    saveCart();
    renderCart();
}

// Получить количество товара в корзине
function getCartItemQuantity(productId) {
    const item = state.cart.find(item => item.id === productId);
    return item ? item.quantity : 0;
}

// Отображение корзины
function renderCart() {
    if (state.cart.length === 0) {
        elements.emptyCart.style.display = 'block';
        elements.cartItems.innerHTML = '';
        elements.cartFooter.style.display = 'none';
        return;
    }

    elements.emptyCart.style.display = 'none';
    elements.cartFooter.style.display = 'block';

    elements.cartItems.innerHTML = state.cart.map(item => {
        // Получаем первое изображение (поддержка старого формата)
        const itemImages = item.images || (item.image ? [item.image] : []);
        const firstImage = itemImages[0] || '';
        
        return `
        <div class="cart-item">
            <img src="${firstImage}" alt="${item.name}" class="cart-item-image" onerror="this.style.display='none'; this.parentElement.querySelector('.cart-item-image-fallback').style.display='flex';">
            <div class="cart-item-image-fallback" style="display: ${firstImage ? 'none' : 'flex'}; width: 80px; height: 80px; align-items: center; justify-content: center; font-size: 32px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border-radius: 8px; flex-shrink: 0;">${item.emoji}</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
                <div class="cart-item-controls">
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateCartQuantity(${item.id}, -1)">−</button>
                        <span>${item.quantity} шт.</span>
                        <button class="quantity-btn" onclick="updateCartQuantity(${item.id}, 1)">+</button>
                    </div>
                    <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Удалить</button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    elements.totalPrice.textContent = formatPrice(total);
}

// Оформление заказа
async function handleCheckout() {
    if (state.cart.length === 0) return;

    const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderDetails = state.cart.map(item => 
        `${item.name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}`
    ).join('\n');

    const message = `Ваш заказ:\n\n${orderDetails}\n\nИтого: ${formatPrice(total)}`;

    // Получаем информацию о пользователе из Telegram
    const userInfo = tg.initDataUnsafe?.user || null;

    // Показываем индикатор загрузки
    tg.MainButton.showProgress();
    tg.MainButton.setText('Оформление...');

    try {
        // Определяем URL API (для продакшена используйте ваш домен)
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3000/api/order'
            : '/api/order';

        // Отправляем заказ на сервер
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                orderData: {
                    items: state.cart,
                    total: total
                },
                userInfo: userInfo
            })
        });

        const result = await response.json();

        if (result.success) {
            const orderId = result.orderId;

            // Создаем платеж через Т-Банк
            try {
                const paymentApiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? 'http://localhost:3000/api/payment/create'
                    : '/api/payment/create';

                const paymentResponse = await fetch(paymentApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        orderId: orderId,
                        amount: total,
                        description: `Заказ #${orderId}`,
                        items: state.cart,
                        customer: {
                            id: userInfo?.id,
                            email: userInfo?.email || '',
                            phone: userInfo?.phone || ''
                        }
                    })
                });

                const paymentResult = await paymentResponse.json();

                if (paymentResult.success && paymentResult.paymentUrl) {
                    // Перенаправляем на страницу оплаты
                    tg.openLink(paymentResult.paymentUrl);
                    
                    tg.showAlert('✅ Заказ создан! Переходим к оплате...', () => {
                        // Очистить корзину после создания заказа
                        state.cart = [];
                        saveCart();
                        updateCartBadge();
                        renderCart();
                        showPage('main');
                    });
                } else {
                    // Если платеж не создан, используем резервный вариант
                    throw new Error(paymentResult.error || 'Не удалось создать платеж');
                }
            } catch (paymentError) {
                console.error('Ошибка создания платежа:', paymentError);
                
                // Резервный вариант - отправка через Telegram
                tg.sendData(JSON.stringify({
                    type: 'order',
                    items: state.cart,
                    total: total,
                    orderId: orderId
                }));

                tg.showAlert(`✅ Заказ #${orderId} создан!\n\n⚠️ Ошибка создания платежа. Мы свяжемся с вами для оплаты.`, () => {
                    state.cart = [];
                    saveCart();
                    updateCartBadge();
                    renderCart();
                    showPage('main');
                });
            }
        } else {
            throw new Error(result.error || 'Ошибка при оформлении заказа');
        }
    } catch (error) {
        console.error('Ошибка оформления заказа:', error);
        
        // Резервный вариант - отправка через Telegram Web App API
        tg.sendData(JSON.stringify({
            type: 'order',
            items: state.cart,
            total: total
        }));

        tg.showAlert(`⚠️ ${message}\n\nЗаказ отправлен через Telegram. Мы обработаем его вручную.`, () => {
            state.cart = [];
            saveCart();
            updateCartBadge();
            renderCart();
            showPage('main');
        });
    } finally {
        tg.MainButton.hideProgress();
        tg.MainButton.setText('Оформить заказ');
    }
}

// Показать страницу
function showPage(page) {
    elements.mainPage.classList.remove('active');
    elements.productPage.classList.remove('active');
    elements.cartPage.classList.remove('active');

    if (page === 'main') {
        elements.mainPage.classList.add('active');
        renderProducts();
    } else if (page === 'product') {
        elements.productPage.classList.add('active');
        elements.backBtn.onclick = () => showPage('main');
    } else if (page === 'cart') {
        elements.cartPage.classList.add('active');
        renderCart();
    }
}

// Обновить бейдж корзины
function updateCartBadge() {
    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    elements.cartBadge.textContent = totalItems;
    elements.cartBadge.style.display = totalItems > 0 ? 'flex' : 'none';
}

// Сохранить корзину
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(state.cart));
}

// Форматирование цены
function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

// Функции для галереи изображений
function changeProductImage(direction) {
    if (!state.productImages || state.productImages.length <= 1) return;
    
    state.currentImageIndex += direction;
    if (state.currentImageIndex < 0) {
        state.currentImageIndex = state.productImages.length - 1;
    } else if (state.currentImageIndex >= state.productImages.length) {
        state.currentImageIndex = 0;
    }
    
    updateProductImage();
}

function setProductImage(index) {
    if (!state.productImages || index < 0 || index >= state.productImages.length) return;
    state.currentImageIndex = index;
    updateProductImage();
}

function updateProductImage() {
    const mainImage = document.getElementById('product-main-image');
    const currentIndicator = document.getElementById('gallery-current');
    const thumbnails = document.querySelectorAll('.gallery-thumbnail');
    
    if (mainImage && state.productImages[state.currentImageIndex]) {
        mainImage.src = state.productImages[state.currentImageIndex];
        // Убеждаемся, что стили применяются правильно
        mainImage.style.maxWidth = '100%';
        mainImage.style.maxHeight = '100%';
        mainImage.style.width = 'auto';
        mainImage.style.height = 'auto';
        mainImage.style.objectFit = 'contain';
        mainImage.style.padding = '16px';
        mainImage.style.boxSizing = 'border-box';
    }
    
    if (currentIndicator) {
        currentIndicator.textContent = state.currentImageIndex + 1;
    }
    
    thumbnails.forEach((thumb, idx) => {
        if (idx === state.currentImageIndex) {
            thumb.style.borderColor = 'var(--accent-yellow)';
            thumb.style.opacity = '1';
        } else {
            thumb.style.borderColor = 'transparent';
            thumb.style.opacity = '0.7';
        }
    });
}

// Глобальные функции для onclick
window.showProduct = showProduct;
window.changeQuantity = changeQuantity;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.changeProductImage = changeProductImage;
window.setProductImage = setProductImage;

// Запуск приложения
init();
