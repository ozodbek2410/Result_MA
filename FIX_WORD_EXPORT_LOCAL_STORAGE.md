# Исправление: Word Export без S3

## Проблема
При попытке экспорта в Word через асинхронную очередь сервер возвращал 503 ошибку:
```
File storage not configured
S3_BUCKET, AWS_ACCESS_KEY, AWS_SECRET_KEY environment variables required
```

## Решение
Добавлено локальное хранилище файлов как fallback, если S3 не настроен.

## Изменения

### 1. Создан LocalFileService
`server/src/services/localFileService.ts` - сервис для локального хранения файлов:
- Сохраняет файлы в `server/exports/`
- Возвращает публичный URL для скачивания
- Поддерживает автоматическую очистку старых файлов

### 2. Обновлен wordExportQueue
`server/src/services/queue/wordExportQueue.ts`:
- Добавлен импорт LocalFileService
- Логика: сначала пытается S3, если не настроен - использует локальное хранилище

### 3. Убрана строгая проверка S3
`server/src/routes/test.routes.ts` и `server/src/routes/blockTest.routes.ts`:
- Удалена проверка `S3Service.isConfigured()` которая возвращала 503
- Теперь роут всегда принимает запросы, а выбор хранилища происходит в worker

### 4. Добавлен статический роут
`server/src/index.ts`:
- Добавлен `app.use('/exports', express.static(...))` для раздачи файлов
- Инициализация LocalFileService при старте сервера

### 5. Обновлен worker
`server/src/worker.ts`:
- Добавлена инициализация LocalFileService

### 6. Добавлен BASE_URL
`server/.env`:
- Добавлена переменная `BASE_URL=http://localhost:9999`

## Как работает

1. Пользователь нажимает "Скачать Word"
2. Фронтенд отправляет POST запрос на `/tests/:id/export-docx-async`
3. Сервер добавляет задачу в очередь BullMQ
4. Worker обрабатывает задачу:
   - Генерирует Word через Pandoc
   - Проверяет: настроен ли S3?
   - Если да → загружает в S3
   - Если нет → сохраняет локально в `server/exports/`
5. Возвращает публичный URL для скачивания
6. Фронтенд скачивает файл по URL

## Тестирование

```bash
# 1. Перезапустить сервер
cd server
npm run dev

# 2. В отдельном терминале запустить worker
cd server
npm run worker

# 3. Открыть фронтенд
cd client
npm run dev

# 4. Попробовать экспорт в Word
```

## Структура файлов

```
server/
├── exports/                    # Локальное хранилище (создается автоматически)
│   └── exports/
│       └── {userId}/
│           └── {jobId}-{timestamp}.docx
├── src/
│   ├── services/
│   │   ├── localFileService.ts  # НОВЫЙ
│   │   ├── s3Service.ts
│   │   └── queue/
│   │       └── wordExportQueue.ts  # ОБНОВЛЕН
│   ├── routes/
│   │   ├── test.routes.ts       # ОБНОВЛЕН
│   │   └── blockTest.routes.ts  # ОБНОВЛЕН
│   ├── index.ts                 # ОБНОВЛЕН
│   └── worker.ts                # ОБНОВЛЕН
└── .env                         # ОБНОВЛЕН
```

## Преимущества

✅ Работает без S3 (для локальной разработки)  
✅ Автоматический fallback  
✅ Простая настройка  
✅ Совместимость с существующим кодом  
✅ Можно легко переключиться на S3 позже (просто добавить переменные окружения)

## Переход на S3 (опционально)

Когда будешь готов использовать S3, просто добавь в `.env`:

```env
# AWS S3
S3_BUCKET=resultma-exports
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_KEY=your_secret_key
AWS_REGION=us-east-1

# Или MinIO (локальный S3)
USE_MINIO=true
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=resultma-exports
AWS_ACCESS_KEY=minioadmin
AWS_SECRET_KEY=minioadmin
```

Worker автоматически начнет использовать S3 вместо локального хранилища.

## Статус
✅ Реализовано  
⏳ Требуется тестирование
