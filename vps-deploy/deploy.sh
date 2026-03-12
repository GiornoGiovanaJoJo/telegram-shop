#!/bin/bash

# Скрипт развертывания Telegram Shop на VPS (используется GitHub Actions)

set -e

echo "🚀 Обновление Telegram Shop..."

# Переход в директорию проекта (если скрипт запущен не из корня)
cd "$(dirname "$0")/.."

# Обновление кода уже выполнено через git pull в GitHub Actions,
# но на случай ручного запуска:
if [ -d ".git" ]; then
    echo "🔄 Синхронизация кода..."
    git pull origin main
fi

# Обновление зависимостей
echo "📦 Обновление зависимостей..."
npm install --production

# Создание необходимых папок
mkdir -p logs
mkdir -p фото

# Проверка наличия .env
if [ ! -f .env ]; then
    echo "⚠️  Внимание: файл .env не найден!"
    if [ -f vps-deploy/env.example ]; then
        echo "Создаю .env на основе env.example (не забудьте отредактировать его!)"
        cp vps-deploy/env.example .env
    fi
fi

# Перезапуск приложения через PM2
echo "▶️  Перезапуск приложения..."
if pm2 show telegram-shop > /dev/null 2>&1; then
    pm2 restart telegram-shop
else
    pm2 start pm2.config.js
fi

# Сохранение конфигурации PM2
pm2 save

echo "✅ Обновление успешно завершено!"
pm2 status telegram-shop
