#!/bin/bash

# Скрипт первоначальной настройки VPS сервера для Telegram Shop

set -e

echo "🚀 Настройка VPS сервера для Telegram Shop..."

# Обновление системы
echo "📦 Обновление системы..."
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18+
echo "📦 Установка Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версии Node.js
node_version=$(node -v)
echo "✅ Node.js установлен: $node_version"

# Установка PM2 глобально
echo "📦 Установка PM2..."
sudo npm install -g pm2

# Установка Nginx
echo "📦 Установка Nginx..."
sudo apt install -y nginx

# Создание директории для логов
echo "📁 Создание директорий..."
mkdir -p logs
mkdir -p фото

# Установка зависимостей проекта
echo "📦 Установка зависимостей проекта..."
npm install

# Копирование конфигурации Nginx
echo "⚙️  Настройка Nginx..."
echo "⚠️  ВАЖНО: Отредактируйте nginx.conf и укажите ваш домен!"
echo "⚠️  Затем скопируйте конфигурацию:"
echo "   sudo cp nginx.conf /etc/nginx/sites-available/telegram-shop"
echo "   sudo ln -s /etc/nginx/sites-available/telegram-shop /etc/nginx/sites-enabled/"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"

# Настройка файрвола (если используется UFW)
if command -v ufw &> /dev/null; then
    echo "🔥 Настройка файрвола..."
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    echo "⚠️  Файрвол настроен. Для активации выполните: sudo ufw enable"
fi

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📝 Следующие шаги:"
echo "1. Создайте файл .env из env.example в корне проекта и задайте секреты (см. constants.js для публичных значений)"
echo "2. Настройте Nginx (см. инструкции выше)"
echo "3. Запустите приложение: pm2 start pm2.config.js"
echo "4. Сохраните конфигурацию PM2: pm2 save"
echo "5. Настройте автозапуск PM2: pm2 startup"
