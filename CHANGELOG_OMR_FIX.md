# Changelog - Исправление OMR загрузки

## Дата: 2026-02-06

### Исправленные ошибки

#### 1. ENOENT: no such file or directory
**Проблема:** Директория `uploads/omr` не создавалась автоматически при загрузке файлов.

**Решение:** Добавлено автоматическое создание директории при инициализации роутов.

**Измененные файлы:**
- `server/src/routes/omr.routes.ts` - добавлено `fsSync.mkdirSync(uploadDir, { recursive: true })`
- `server/src/routes/test.routes.ts` - добавлена проверка `fs.existsSync(uploadDir)`

#### 2. Python script not found
**Проблема:** Python скрипты искались в `/var/www/resultMA/python/` вместо `/var/www/resultMA/server/python/`

**Решение:** Исправлены пути к Python скриптам, добавлен `'server'` в path.join().

**Измененные файлы:**
- `server/src/routes/omr.routes.ts`
  - `qr_scanner.py`: `path.join(process.cwd(), 'python', ...)` → `path.join(process.cwd(), 'server', 'python', ...)`
  - `omr_color.py`: аналогично
- `server/src/services/omrQueueHandler.ts`
  - `omr_final_v2.py`: аналогично

### Детали изменений

#### server/src/routes/omr.routes.ts
```typescript
// Добавлен импорт
import fsSync from 'fs';

// Добавлено создание директории
const uploadDir = path.join(process.cwd(), 'uploads', 'omr');
try {
  fsSync.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
} catch (err) {
  console.error('❌ Failed to create upload directory:', err);
}

// Исправлены пути (2 места)
const qrScriptPath = path.join(process.cwd(), 'server', 'python', 'qr_scanner.py');
const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_color.py');
```

#### server/src/routes/test.routes.ts
```typescript
// Добавлен импорт
import fs from 'fs';

// Добавлена проверка директории
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Upload directory ready:', uploadDir);
}
```

#### server/src/services/omrQueueHandler.ts
```typescript
// Исправлен путь
const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_final_v2.py');
```

### Инструкции по деплою

```bash
cd /var/www/resultMA
git pull
cd server
npm run build
cd ..
pm2 restart mathacademy-server
pm2 logs mathacademy-server --lines 30
```

### Ожидаемый результат

После деплоя в логах должны появиться:
```
✅ Upload directory ready: /var/www/resultMA/uploads/omr
🔍 QR scanner command: python3 "/var/www/resultMA/server/python/qr_scanner.py" ...
🐍 Python command: python3 "/var/www/resultMA/server/python/omr_color.py" ...
```

Ошибки ENOENT и "Python script not found" должны исчезнуть.

### Тестирование

1. Загрузите OMR файл через интерфейс
2. Проверьте что файл сохранился в `/var/www/resultMA/uploads/omr/`
3. Проверьте что Python скрипты запустились успешно
4. Проверьте что результаты обработки вернулись корректно

### Обратная совместимость

✅ Изменения обратно совместимы
✅ Не требуется миграция данных
✅ Не требуется изменение конфигурации
