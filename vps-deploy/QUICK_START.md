# Быстрый старт - Развертывание на VPS Jino

## Ваши данные сервера

```
Хост: 23b3a0621a6b.vps.myjino.ru
IP: 147.45.99.246
Порт: 22
Логин: root
Пароль: aFJ6t3dVBG^5gh
```

---

## Быстрая команда для копирования

### 1. Подключитесь к серверу:

```bash
ssh root@147.45.99.246
```

Введите пароль: `aFJ6t3dVBG^5gh`

---

### 2. Загрузите проект (выберите один способ):

**Через Git:**
```bash
cd /root
git clone https://github.com/GiornoGiovanaJoJo/telegram-shop.git
cd telegram-shop
```

**Или через SCP из Windows PowerShell:**
```powershell
# Из папки проекта на вашем компьютере
scp -r * root@147.45.99.246:/root/telegram-shop/
```

---

### 3. Настройте и запустите:

```bash
cd /root/telegram-shop
chmod +x vps-deploy/*.sh

# Первоначальная настройка
cd vps-deploy
./setup.sh

# Настройте .env файл
cd /root/telegram-shop
cp vps-deploy/env.example .env
nano .env
# Заполните все переменные, сохраните (Ctrl+O, Enter, Ctrl+X)

# Настройте Nginx
cd vps-deploy
nano nginx.conf
# Замените "ваш-домен.com" на "147.45.99.246" или ваш домен
sudo cp nginx.conf /etc/nginx/sites-available/telegram-shop
sudo ln -s /etc/nginx/sites-available/telegram-shop /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Разверните приложение
cd /root/telegram-shop
./vps-deploy/deploy.sh

# Настройте автозапуск
pm2 startup
# Выполните команду, которую покажет PM2
pm2 save
```

---

### 4. Проверьте работу:

Откройте в браузере: `http://147.45.99.246`

---

## Полезные команды

```bash
pm2 logs telegram-shop      # Логи приложения
pm2 restart telegram-shop  # Перезапуск
sudo systemctl status nginx # Статус Nginx
```

Подробная инструкция: см. `DEPLOYMENT_GUIDE.md`
