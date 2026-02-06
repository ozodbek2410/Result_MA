# Структура путей в проекте

## Текущая структура на сервере

```
/var/www/resultMA/                    ← PM2 cwd (рабочая директория)
├── package.json
├── ecosystem.config.js               ← PM2 конфигурация
├── client/                           ← React приложение
│   └── ...
└── server/                           ← Node.js сервер
    ├── package.json
    ├── tsconfig.json
    ├── src/                          ← TypeScript исходники
    │   ├── index.ts
    │   ├── routes/
    │   │   ├── omr.routes.ts        ← Основной файл OMR
    │   │   ├── test.routes.ts
    │   │   └── upload.routes.ts
    │   ├── services/
    │   │   └── omrQueueHandler.ts
    │   └── scripts/
    │       └── generateExcelTemplate.ts
    ├── dist/                         ← Скомпилированный JavaScript
    │   ├── index.js                  ← __dirname здесь: /var/www/resultMA/server/dist
    │   ├── routes/
    │   │   ├── omr.routes.js        ← __dirname здесь: /var/www/resultMA/server/dist/routes
    │   │   ├── test.routes.js
    │   │   └── upload.routes.js
    │   ├── services/
    │   │   └── omrQueueHandler.js   ← __dirname здесь: /var/www/resultMA/server/dist/services
    │   └── scripts/
    │       └── generateExcelTemplate.js
    ├── python/                       ← Python скрипты
    │   ├── omr_color.py             ✅ ПРАВИЛЬНЫЙ ПУТЬ
    │   ├── qr_scanner.py            ✅ ПРАВИЛЬНЫЙ ПУТЬ
    │   └── requirements.txt
    └── uploads/                      ← Загруженные файлы
        └── omr/                      ✅ ПРАВИЛЬНЫЙ ПУТЬ
            ├── omr-123456.png
            └── checked_omr-123456.png
```

## Проблема: process.cwd()

### ❌ БЫЛО (неправильно):

```javascript
// В файле: server/dist/routes/omr.routes.js
const pythonScript = path.join(process.cwd(), 'server', 'python', 'omr_color.py');
// process.cwd() = /var/www/resultMA
// Результат: /var/www/resultMA/server/python/omr_color.py ✅ (случайно работало)

// НО! Если PM2 запущен из другой директории:
// process.cwd() = /root или /home/user
// Результат: /root/server/python/omr_color.py ❌ (не существует)
```

### ✅ СТАЛО (правильно):

```javascript
// В файле: server/dist/routes/omr.routes.js
const SERVER_ROOT = path.join(__dirname, '..', '..');
// __dirname = /var/www/resultMA/server/dist/routes
// Поднимаемся на 2 уровня: /var/www/resultMA/server

const pythonScript = path.join(SERVER_ROOT, 'python', 'omr_color.py');
// Результат: /var/www/resultMA/server/python/omr_color.py ✅ (всегда правильно)
```

## Как работает __dirname

### В разных файлах:

```
Файл: server/dist/index.js
__dirname = /var/www/resultMA/server/dist
SERVER_ROOT = path.join(__dirname, '..') = /var/www/resultMA/server

Файл: server/dist/routes/omr.routes.js
__dirname = /var/www/resultMA/server/dist/routes
SERVER_ROOT = path.join(__dirname, '..', '..') = /var/www/resultMA/server

Файл: server/dist/services/omrQueueHandler.js
__dirname = /var/www/resultMA/server/dist/services
SERVER_ROOT = path.join(__dirname, '..', '..') = /var/www/resultMA/server

Файл: server/dist/scripts/generateExcelTemplate.js
__dirname = /var/www/resultMA/server/dist/scripts
SERVER_ROOT = path.join(__dirname, '..', '..') = /var/www/resultMA/server
```

## Все пути в приложении

### Python скрипты:

```javascript
// OMR обработка (цветные бланки)
const omrScript = path.join(SERVER_ROOT, 'python', 'omr_color.py');
// → /var/www/resultMA/server/python/omr_color.py

// QR-код сканер
const qrScript = path.join(SERVER_ROOT, 'python', 'qr_scanner.py');
// → /var/www/resultMA/server/python/qr_scanner.py

// OMR v2 (для очереди)
const omrV2Script = path.join(SERVER_ROOT, 'python', 'omr_final_v2.py');
// → /var/www/resultMA/server/python/omr_final_v2.py
```

### Директории загрузок:

```javascript
// OMR изображения
const omrUploadDir = path.join(SERVER_ROOT, 'uploads', 'omr');
// → /var/www/resultMA/server/uploads/omr

// Общие загрузки
const uploadDir = path.join(SERVER_ROOT, 'uploads');
// → /var/www/resultMA/server/uploads

// Статические файлы (Express)
app.use('/uploads', express.static(path.join(SERVER_ROOT, 'uploads')));
// → http://domain.com/uploads/omr/image.png
//   → /var/www/resultMA/server/uploads/omr/image.png
```

### Excel шаблоны:

```javascript
const templatePath = path.join(SERVER_ROOT, 'uploads', 'student_import_template_example.xlsx');
// → /var/www/resultMA/server/uploads/student_import_template_example.xlsx
```

## Преимущества нового подхода

### ✅ Надежность
- Работает независимо от того, откуда запущен PM2
- Работает при запуске через `npm start`, `node dist/index.js`, или PM2
- Работает при разработке и в продакшене

### ✅ Предсказуемость
- Пути всегда относительно расположения файла
- Не зависит от текущей рабочей директории
- Легко отладить и понять

### ✅ Портативность
- Можно перенести проект в любую директорию
- Можно запустить несколько инстансов в разных папках
- Работает на разных операционных системах

## Проверка правильности путей

### В логах должно быть:

```
✅ Upload directory ready: /var/www/resultMA/server/uploads/omr
✅ Python script exists
🐍 Python command: python3 "/var/www/resultMA/server/python/omr_color.py" ...
🔍 QR scanner command: python3 "/var/www/resultMA/server/python/qr_scanner.py" ...
```

### НЕ должно быть:

```
❌ Python script not found at: /var/www/resultMA/python/omr_color.py
❌ ENOENT: no such file or directory
❌ Error: Cannot find module
```

## Команды для проверки

```bash
# Проверить что файлы существуют
ls -la /var/www/resultMA/server/python/omr_color.py
ls -la /var/www/resultMA/server/python/qr_scanner.py
ls -la /var/www/resultMA/server/uploads/omr/

# Проверить права доступа
stat /var/www/resultMA/server/python/omr_color.py
stat /var/www/resultMA/server/uploads/omr/

# Проверить что Python может импортировать модули
cd /var/www/resultMA/server/python
python3 -c "import cv2, numpy, pyzbar; print('OK')"
```
