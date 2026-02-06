# Исправление ошибки ENOENT при загрузке OMR файлов

## Проблемы
1. ```
   ENOENT: no such file or directory, open '/var/www/resultMA/uploads/omr/omr-1770379631962-921756680.png'
   ```
2. ```
   Python script not found: /var/www/resultMA/python/omr_color.py
   ```

## Причины
1. Директория `uploads/omr` не создавалась автоматически при загрузке файлов через multer
2. Python скрипты искались в неправильной директории (`/var/www/resultMA/python/` вместо `/var/www/resultMA/server/python/`)

## Исправления

Были внесены изменения в следующие файлы:

### 1. `server/src/routes/omr.routes.ts`
**a) Добавлено автоматическое создание директории:**

```typescript
import fsSync from 'fs';

const uploadDir = path.join(process.cwd(), 'uploads', 'omr');

// Создаем директорию если не существует (синхронно)
try {
  fsSync.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
} catch (err) {
  console.error('❌ Failed to create upload directory:', err);
}
```

**b) Исправлены пути к Python скриптам:**

```typescript
// Было:
const qrScriptPath = path.join(process.cwd(), 'python', 'qr_scanner.py');
const pythonScript = path.join(process.cwd(), 'python', 'omr_color.py');

// Стало:
const qrScriptPath = path.join(process.cwd(), 'server', 'python', 'qr_scanner.py');
const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_color.py');
```

### 2. `server/src/routes/test.routes.ts`
Добавлена проверка и создание директории uploads:

```typescript
import fs from 'fs';

const uploadDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
}
```

### 3. `server/src/services/omrQueueHandler.ts`
Исправлен путь к Python скрипту:

```typescript
// Было:
const pythonScript = path.join(process.cwd(), 'python', 'omr_final_v2.py');

// Стало:
const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_final_v2.py');
```

## Деплой на сервер

Выполните следующие команды на сервере:

```bash
# 1. Перейдите в директорию проекта
cd /var/www/resultMA

# 2. Обновите код из репозитория
git pull

# 3. Пересоберите TypeScript
cd server
npm run build

# 4. Перезапустите сервер через PM2
cd ..
pm2 restart mathacademy-server

# 5. Проверьте логи
pm2 logs mathacademy-server --lines 50
```

## Альтернативное решение (если не хотите деплоить сейчас)

Можно вручную создать директорию на сервере:

```bash
cd /var/www/resultMA
mkdir -p uploads/omr
chmod 755 uploads/omr
```

Это временно решит проблему с директорией, но проблема с путями к Python скриптам останется.

## Проверка

После деплоя попробуйте загрузить OMR файл. В логах должно появиться:
```
✅ Upload directory ready: /var/www/resultMA/uploads/omr
🔍 QR scanner command: python3 "/var/www/resultMA/server/python/qr_scanner.py" ...
🐍 Python command: python3 "/var/www/resultMA/server/python/omr_color.py" ...
```

И ошибки ENOENT и "Python script not found" больше не должны возникать.
