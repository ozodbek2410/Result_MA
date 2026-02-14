# E2E тесты ResultMA

## Установка

Playwright уже установлен. Браузеры загружены автоматически.

## Запуск тестов

```bash
# Запустить все тесты
npm run test:e2e

# Запустить с UI
npm run test:e2e:ui

# Показать отчет
npm run test:e2e:report
```

## Структура тестов

### Login Page (`login.spec.ts`)
- ✅ Отображение формы логина
- ✅ Валидация пустых полей
- ✅ Ошибка при неверных данных
- ✅ Наличие кнопки "Orqaga"
- ✅ Переключение видимости пароля

### Navigation (`navigation.spec.ts`)
- ✅ Загрузка главной страницы
- ✅ Адаптивный дизайн (Desktop/Tablet/Mobile)
- ✅ Отображение логотипа и брендинга

## Результаты последнего запуска

**Всего тестов:** 8  
**Прошло:** 8 ✅  
**Упало:** 0 ❌  
**Время выполнения:** ~20 секунд

## Конфигурация

- **Браузер:** Chromium
- **Base URL:** http://localhost:9998
- **Скриншоты:** только при ошибках
- **Трейсы:** при первом повторе

## Добавление новых тестов

Создайте файл `e2e/имя-теста.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Название группы', () => {
  test('название теста', async ({ page }) => {
    await page.goto('/');
    // ваши проверки
  });
});
```

## Полезные команды

```bash
# Запустить конкретный файл
npx playwright test login.spec.ts

# Запустить в headed режиме (видимый браузер)
npx playwright test --headed

# Запустить в debug режиме
npx playwright test --debug

# Обновить скриншоты
npx playwright test --update-snapshots
```
