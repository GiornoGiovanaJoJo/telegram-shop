# Решение проблем при развертывании

## Ошибка 502 Bad Gateway

Эта ошибка означает, что Nginx работает, но не может подключиться к Node.js приложению.

---

## Диагностика проблемы

### 1. Проверьте, запущено ли приложение через PM2

Подключитесь к серверу и выполните:

```bash
pm2 status
```

**Ожидаемый результат:**
```
┌─────┬──────────────────┬─────────┬─────────┬──────────┐
│ id  │ name             │ status  │ restart │ uptime   │
├─────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0   │ telegram-shop    │ online  │ 0       │ 5m       │
└─────┴──────────────────┴─────────┴─────────┴──────────┘
```

**Если приложение не запущено или в статусе "errored":**

```bash
# Посмотрите логи
pm2 logs telegram-shop --lines 50

# Перезапустите приложение
pm2 restart telegram-shop

# Если не помогает, удалите и создайте заново
pm2 delete telegram-shop
cd /root/telegram-shop
pm2 start pm2.config.js
pm2 save
```

---

### 2. Проверьте, слушает ли приложение порт 3000

```bash
sudo netstat -tulpn | grep 3000
# или
sudo ss -tulpn | grep 3000
```

**Ожидаемый результат:**
```
tcp  0  0  127.0.0.1:3000  0.0.0.0:*  LISTEN  12345/node
```

**Если порт не слушается:**

- Проверьте логи приложения: `pm2 logs telegram-shop`
- Убедитесь, что в `.env` файле указан `PORT=3000`
- Проверьте, что приложение запускается без ошибок

---

### 3. Проверьте логи приложения

```bash
# Логи PM2
pm2 logs telegram-shop --lines 100

# Или логи из файлов
tail -f /root/telegram-shop/logs/err.log
tail -f /root/telegram-shop/logs/out.log
```

**Частые ошибки:**

- **"Cannot find module"** - не установлены зависимости:
  ```bash
  cd /root/telegram-shop
  npm install
  pm2 restart telegram-shop
  ```

- **"EADDRINUSE"** - порт уже занят:
  ```bash
  # Найдите процесс, занимающий порт
  sudo lsof -i :3000
  # Убейте процесс или измените PORT в .env
  ```

- **"Missing environment variables"** - не настроен `.env`:
  ```bash
  cd /root/telegram-shop
  cp vps-deploy/env.example .env
  nano .env
  # Заполните все переменные
  pm2 restart telegram-shop
  ```

---

### 4. Проверьте конфигурацию Nginx

```bash
# Проверьте синтаксис
sudo nginx -t

# Проверьте, что Nginx проксирует на правильный порт
cat /etc/nginx/sites-available/telegram-shop | grep proxy_pass

# Должно быть: proxy_pass http://localhost:3000;
```

**Если порт неверный:**

```bash
cd /root/telegram-shop/vps-deploy
nano nginx.conf
# Убедитесь, что: proxy_pass http://localhost:3000;
sudo cp nginx.conf /etc/nginx/sites-available/telegram-shop
sudo nginx -t
sudo systemctl reload nginx
```

---

### 5. Проверьте логи Nginx

```bash
# Логи ошибок
sudo tail -f /var/log/nginx/error.log

# Логи доступа
sudo tail -f /var/log/nginx/access.log
```

**Типичные ошибки в логах:**
- `connect() failed (111: Connection refused)` - приложение не запущено
- `upstream timed out` - приложение зависло или медленно отвечает

---

## Пошаговое исправление

### Шаг 1: Убедитесь, что .env файл настроен

```bash
cd /root/telegram-shop
cat .env
```

Должны быть заполнены:
- `BOT_TOKEN`
- `ADMIN_CHAT_ID`
- `TINKOFF_TERMINAL_KEY`
- `TINKOFF_PASSWORD`
- `BASE_URL` (например: `http://147.45.99.246`)
- `PORT=3000`

---

### Шаг 2: Переустановите зависимости

```bash
cd /root/telegram-shop
rm -rf node_modules package-lock.json
npm install
```

---

### Шаг 3: Перезапустите приложение

```bash
pm2 delete telegram-shop
cd /root/telegram-shop
pm2 start pm2.config.js
pm2 save
pm2 logs telegram-shop
```

Подождите 5-10 секунд и проверьте статус:

```bash
pm2 status
```

---

### Шаг 4: Проверьте, что приложение отвечает локально

```bash
curl http://localhost:3000
```

**Ожидаемый результат:** HTML код страницы или JSON ответ.

**Если ошибка:**
- Проверьте логи: `pm2 logs telegram-shop`
- Убедитесь, что порт правильный: `netstat -tulpn | grep 3000`

---

### Шаг 5: Перезагрузите Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Шаг 6: Проверьте в браузере

Откройте: `http://147.45.99.246`

---

## Быстрое решение (если ничего не помогло)

Выполните все команды по порядку:

```bash
# 1. Перейдите в папку проекта
cd /root/telegram-shop

# 2. Проверьте .env
cat .env

# 3. Установите зависимости
npm install

# 4. Остановите старое приложение
pm2 delete telegram-shop 2>/dev/null || true

# 5. Запустите заново
pm2 start pm2.config.js
pm2 save

# 6. Проверьте статус
pm2 status
pm2 logs telegram-shop --lines 20

# 7. Проверьте порт
sleep 3
netstat -tulpn | grep 3000

# 8. Проверьте локально
curl http://localhost:3000

# 9. Перезагрузите Nginx
sudo nginx -t && sudo systemctl reload nginx
```

---

## Другие частые проблемы

### Проблема: "Cannot find module './config'"

**Решение:**
```bash
cd /root/telegram-shop
# Создайте пустой config.js или используйте только .env
touch config.js
echo "module.exports = {};" > config.js
```

---

### Проблема: "EACCES: permission denied"

**Решение:**
```bash
# Убедитесь, что файлы принадлежат правильному пользователю
sudo chown -R root:root /root/telegram-shop
chmod +x /root/telegram-shop/vps-deploy/*.sh
```

---

### Проблема: База данных не создается

**Решение:**
```bash
cd /root/telegram-shop
# Создайте папку для БД, если нужно
mkdir -p data
chmod 755 data
pm2 restart telegram-shop
```

---

### Проблема: Nginx показывает старую версию

**Решение:**
```bash
# Очистите кеш браузера или используйте приватный режим
# Проверьте, что Nginx перезагружен
sudo systemctl restart nginx
```

---

## Проверка работоспособности

После исправления проверьте:

1. **PM2 статус:**
   ```bash
   pm2 status
   # Должно быть: online
   ```

2. **Порт слушается:**
   ```bash
   netstat -tulpn | grep 3000
   # Должен быть: LISTEN
   ```

3. **Локальный ответ:**
   ```bash
   curl http://localhost:3000
   # Должен вернуть HTML или JSON
   ```

4. **Nginx конфигурация:**
   ```bash
   sudo nginx -t
   # Должно быть: syntax is ok
   ```

5. **Браузер:**
   - Откройте: `http://147.45.99.246`
   - Должна загрузиться страница магазина

---

## Получение помощи

Если проблема не решена, соберите информацию:

```bash
# Соберите диагностическую информацию
echo "=== PM2 Status ===" > /tmp/diagnostic.txt
pm2 status >> /tmp/diagnostic.txt
echo "" >> /tmp/diagnostic.txt

echo "=== PM2 Logs (last 50 lines) ===" >> /tmp/diagnostic.txt
pm2 logs telegram-shop --lines 50 --nostream >> /tmp/diagnostic.txt
echo "" >> /tmp/diagnostic.txt

echo "=== Port 3000 ===" >> /tmp/diagnostic.txt
netstat -tulpn | grep 3000 >> /tmp/diagnostic.txt
echo "" >> /tmp/diagnostic.txt

echo "=== Nginx Error Log (last 20 lines) ===" >> /tmp/diagnostic.txt
sudo tail -20 /var/log/nginx/error.log >> /tmp/diagnostic.txt
echo "" >> /tmp/diagnostic.txt

echo "=== .env file (without secrets) ===" >> /tmp/diagnostic.txt
cat .env | sed 's/=.*/=***/' >> /tmp/diagnostic.txt

cat /tmp/diagnostic.txt
```

Отправьте вывод этой команды для диагностики.
