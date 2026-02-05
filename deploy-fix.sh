#!/bin/bash

echo "🔧 Исправление ошибок rate limiter и путей к файлам..."

# Переход в директорию сервера
cd server

echo "📦 Установка зависимостей..."
npm install

echo "🏗️  Сборка TypeScript..."
npm run build

echo "🔄 Перезапуск PM2..."
cd ..
pm2 restart mathacademy-server

echo "📊 Статус PM2..."
pm2 status

echo "📝 Последние логи..."
pm2 logs mathacademy-server --lines 20 --nostream

echo "✅ Деплой завершен!"
echo ""
echo "Исправлено:"
echo "  1. ✅ Добавлен keyGenerator для rate limiter (исправлена ошибка X-Forwarded-For)"
echo "  2. ✅ Исправлены пути к файлам (используется process.cwd() вместо __dirname)"
echo ""
echo "Для проверки логов: pm2 logs mathacademy-server"
