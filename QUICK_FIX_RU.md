# Быстрое исправление ошибок загрузки OMR

## Что случилось?

### Ошибка 1: Директория не найдена
```
ENOENT: no such file or directory, open '/var/www/resultMA/uploads/omr/...'
```

### Ошибка 2: Python скрипты не найдены
```
Python script not found: /var/www/resultMA/python/omr_color.py
Python script not found: /var/www/resultMA/python/qr_scanner.py
```

## Почему?
1. Директория `uploads/omr` не создавалась автоматически
2. Python скрипты искались в `/var/www/resultMA/python/` вместо `/var/www/resultMA/server/python/`

## Как исправить?

### ⚠️ ВАЖНО: Только деплой полностью решит проблему!

Временное решение создаст только директорию, но Python скрипты всё равно не будут найдены.

### Полное исправление с деплоем (5 минут) ✅ РЕКОМЕНДУЕТСЯ

На сервере выполните:
```bash
cd /var/www/resultMA
chmod +x deploy-fix.sh
./deploy-fix.sh
```

Или вручную:
```bash
cd /var/www/resultMA
git pull
cd server
npm run build
cd ..
pm2 restart mathacademy-server
pm2 logs mathacademy-server --lines 30
```

### Временное решение (только для директории)

⚠️ Это НЕ решит проблему с Python скриптами!

```bash
cd /var/www/resultMA
mkdir -p uploads/omr
chmod 755 uploads/omr
```

## Что было исправлено в коде?

1. **server/src/routes/omr.routes.ts**
   - Добавлено автоматическое создание директории `uploads/omr`
   - Исправлены пути к Python скриптам: `server/python/qr_scanner.py` и `server/python/omr_color.py`

2. **server/src/routes/test.routes.ts**
   - Добавлена проверка существования директории `uploads`

3. **server/src/services/omrQueueHandler.ts**
   - Исправлен путь к Python скрипту: `server/python/omr_final_v2.py`

## Проверка

После деплоя в логах должно появиться:
```
✅ Upload directory ready: /var/www/resultMA/uploads/omr
🔍 QR scanner command: python3 "/var/www/resultMA/server/python/qr_scanner.py" ...
🐍 Python command: python3 "/var/www/resultMA/server/python/omr_color.py" ...
```

Попробуйте загрузить OMR файл - обе ошибки должны исчезнуть.
