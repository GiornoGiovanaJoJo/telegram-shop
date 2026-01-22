# Настройка HTTPS для Telegram Shop

## Вариант 1: С доменом (рекомендуется) - Let's Encrypt

Если у вас есть домен, настроенный на IP `147.45.99.246`, используйте этот вариант.

### Шаг 1: Настройте DNS записи

В панели управления вашего домена добавьте A-записи:
- `@` → `147.45.99.246`
- `www` → `147.45.99.246`

Подождите 5-30 минут, пока DNS записи обновятся. Проверьте:
```bash
ping ваш-домен.com
```

### Шаг 2: Установите Certbot

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

### Шаг 3: Получите SSL сертификат

```bash
# Замените "ваш-домен.com" на ваш реальный домен
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com
```

Certbot автоматически:
- Получит SSL сертификат от Let's Encrypt
- Настроит Nginx для HTTPS
- Настроит автоматическое обновление сертификата

### Шаг 4: Обновите конфигурацию Nginx

Certbot автоматически обновит конфигурацию, но проверьте:

```bash
sudo nano /etc/nginx/sites-available/telegram-shop
```

Убедитесь, что есть:
- `listen 443 ssl;`
- `ssl_certificate` и `ssl_certificate_key`
- Редирект с HTTP на HTTPS

### Шаг 5: Обновите BASE_URL

```bash
cd /root/telegram-shop
nano .env
```

Измените:
```
BASE_URL=https://ваш-домен.com
```

Сохраните и перезапустите:
```bash
pm2 restart telegram-shop
```

### Шаг 6: Проверьте работу

Откройте в браузере: `https://ваш-домен.com`

---

## Вариант 2: Без домена - Самоподписанный сертификат

⚠️ **Внимание:** Браузеры будут показывать предупреждение о безопасности. Подходит только для тестирования.

### Шаг 1: Создайте самоподписанный сертификат

```bash
sudo mkdir -p /etc/nginx/ssl

# Создайте сертификат (действителен 365 дней)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/telegram-shop.key \
  -out /etc/nginx/ssl/telegram-shop.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Telegram Shop/CN=147.45.99.246"
```

### Шаг 2: Обновите конфигурацию Nginx

```bash
sudo nano /etc/nginx/sites-available/telegram-shop
```

Замените содержимое на:

```nginx
# Редирект HTTP на HTTPS
server {
    listen 80;
    server_name 147.45.99.246;
    return 301 https://$server_name$request_uri;
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    server_name 147.45.99.246;

    ssl_certificate /etc/nginx/ssl/telegram-shop.crt;
    ssl_certificate_key /etc/nginx/ssl/telegram-shop.key;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 10M;
}
```

### Шаг 3: Проверьте и перезагрузите Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 4: Обновите BASE_URL

```bash
cd /root/telegram-shop
nano .env
```

Измените:
```
BASE_URL=https://147.45.99.246
```

Сохраните и перезапустите:
```bash
pm2 restart telegram-shop
```

### Шаг 5: Проверьте работу

Откройте в браузере: `https://147.45.99.246`

⚠️ Браузер покажет предупреждение "Небезопасное соединение". Нажмите "Дополнительно" → "Перейти на сайт".

---

## Автоматическое обновление сертификата (только для Let's Encrypt)

Certbot автоматически настроит обновление. Проверьте:

```bash
sudo certbot renew --dry-run
```

Если всё ОК, сертификат будет обновляться автоматически.

---

## Проверка работы HTTPS

### 1. Проверьте сертификат:

```bash
openssl s_client -connect ваш-домен.com:443 -servername ваш-домен.com
```

### 2. Проверьте редирект:

```bash
curl -I http://ваш-домен.com
# Должен вернуть: HTTP/1.1 301 Moved Permanently
```

### 3. Проверьте HTTPS:

```bash
curl -I https://ваш-домен.com
# Должен вернуть: HTTP/1.1 200 OK
```

---

## Решение проблем

### Ошибка: "certbot: command not found"

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

### Ошибка: "Failed to obtain certificate"

- Проверьте, что домен указывает на ваш IP: `ping ваш-домен.com`
- Убедитесь, что порты 80 и 443 открыты в файрволе
- Проверьте, что Nginx не блокирует доступ

### Ошибка: "nginx: [emerg] SSL_CTX_use_certificate"

- Проверьте пути к сертификатам в конфигурации
- Убедитесь, что файлы существуют: `ls -la /etc/nginx/ssl/`
- Проверьте права доступа: `sudo chmod 600 /etc/nginx/ssl/*`

### Браузер показывает "Небезопасное соединение"

**Для самоподписанного сертификата:** Это нормально. Нажмите "Дополнительно" → "Перейти на сайт".

**Для Let's Encrypt:** Проверьте:
- Сертификат действителен: `sudo certbot certificates`
- Nginx использует правильные пути к сертификатам
- Время на сервере синхронизировано: `date`

---

## Настройка файрвола

Убедитесь, что порты 80 и 443 открыты:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

---

## Итог

После настройки HTTPS:

✅ Ваш сайт будет доступен по `https://ваш-домен.com`  
✅ HTTP автоматически перенаправляется на HTTPS  
✅ Сертификат обновляется автоматически (Let's Encrypt)  
✅ Безопасное соединение для платежей  

**Важно:** Обновите `BASE_URL` в `.env` на HTTPS адрес и перезапустите приложение!
