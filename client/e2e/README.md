# 🎭 E2E тесты ResultMA

Комплексные End-to-End тесты на базе **Playwright** с использованием паттерна **Page Object Model (POM)**.

## 📚 Документация

- **[QUICK_START.md](./QUICK_START.md)** - Быстрый старт за 5 минут
- **[E2E_STRUCTURE.md](./E2E_STRUCTURE.md)** - Полная документация структуры
- **[EXAMPLES.md](./EXAMPLES.md)** - Готовые примеры для разных сценариев

## 🚀 Быстрый старт

### Установка

Playwright уже установлен. Браузеры загружены автоматически.

### Настройка

Создайте `.env.test`:

```env
TEST_TEACHER_LOGIN=teacher@test.com
TEST_TEACHER_PASSWORD=Test123!@#
```

### Запуск тестов

```bash
# Все тесты
npm run test:e2e

# С UI (интерактивный режим)
npm run test:e2e:ui

# Показать отчет
npm run test:e2e:report

# Конкретный файл
npx playwright test auth-flow.spec.ts

# В headed режиме
npx playwright test --headed

# Debug режим
npx playwright test --debug
```

## 📁 Структура проекта

```
client/e2e/
├── pages/                          # 🎯 Page Objects (POM)
│   ├── BasePage.ts                # Базовый класс
│   ├── LoginPage.ts               # Авторизация
│   ├── TeacherDashboardPage.ts    # Дашборд учителя
│   ├── TestCreationPage.ts        # Создание тестов
│   └── StudentManagementPage.ts   # Управление студентами
│
├── helpers/                        # 🛠 Вспомогательные функции
│   └── auth.ts                    # Авторизация
│
├── auth-flow.spec.ts              # ✅ Тесты авторизации (NEW)
├── test-management.spec.ts        # ✅ Тесты управления тестами (NEW)
├── student-management.spec.ts     # ✅ Тесты управления студентами (NEW)
│
├── login.spec.ts                  # Базовые тесты логина
├── navigation.spec.ts             # Тесты навигации
├── performance.spec.ts            # Тесты производительности
├── accessibility.spec.ts          # Тесты доступности
├── api.spec.ts                    # Тесты API
│
├── QUICK_START.md                 # 📖 Быстрый старт
├── E2E_STRUCTURE.md              # 📖 Полная документация
├── EXAMPLES.md                    # 📖 Примеры
└── README.md                      # 📖 Этот файл
```

## 🎯 Новые возможности

### Page Object Model (POM)

Все тесты теперь используют паттерн Page Object Model для лучшей поддерживаемости:

```typescript
// Вместо этого:
await page.goto('/');
await page.getByPlaceholder('login').fill('user');
await page.getByPlaceholder('password').fill('pass');
await page.getByRole('button', { name: 'Login' }).click();

// Используем это:
const loginPage = new LoginPage(page);
await loginPage.navigate();
await loginPage.login('user', 'pass');
```

### Проверка UI + API

Все тесты проверяют как UI, так и API взаимодействие:

```typescript
// Ждем API ответ
const response = await loginPage.waitForApiResponse('/api/auth/login');
expect(response.status()).toBe(200);

// Проверяем UI
await expect(page).toHaveURL(/\/teacher/);
```

### Готовые Page Objects

- **BasePage** - базовый класс со всеми общими методами
- **LoginPage** - авторизация
- **TeacherDashboardPage** - дашборд учителя
- **TestCreationPage** - создание и редактирование тестов
- **StudentManagementPage** - управление студентами

## 📊 Покрытие тестами

### ✅ Полностью покрыто

- **Авторизация** (auth-flow.spec.ts)
  - Отображение формы логина
  - Валидация полей
  - Успешная авторизация
  - Обработка ошибок
  - Сохранение сессии

- **Управление тестами** (test-management.spec.ts)
  - Создание теста с вопросами
  - Валидация формы
  - Импорт из файлов
  - Список тестов
  - Поиск и удаление

- **Управление студентами** (student-management.spec.ts)
  - CRUD операции
  - Поиск и фильтрация
  - Генерация QR кодов
  - Профиль студента

### 🔄 Частично покрыто

- Навигация (navigation.spec.ts)
- Производительность (performance.spec.ts)
- Доступность (accessibility.spec.ts)
- API тесты (api.spec.ts)

### 📝 Требуют обновления

- Assignments (assignments.spec.ts)
- OMR Checker (omr-checker.spec.ts)
- Rich Text Editor (rich-text-editor.spec.ts)
- Teacher Dashboard (teacher-dashboard.spec.ts)
- Public Pages (public-pages.spec.ts)

## 🎓 Примеры использования

### Простой тест с Page Object

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test('should login successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login('user@test.com', 'password');
  
  await expect(page).toHaveURL(/\/teacher/);
});
```

### Тест с проверкой API

```typescript
import { test, expect } from '@playwright/test';
import { TestCreationPage } from './pages/TestCreationPage';
import { loginAsTeacher } from './helpers/auth';

test('should create test', async ({ page }) => {
  await loginAsTeacher(page);
  
  const testPage = new TestCreationPage(page);
  await testPage.navigate();
  await testPage.fillTestInfo('My Test');
  
  const savedTest = await testPage.saveTest();
  expect(savedTest).toHaveProperty('_id');
});
```

Больше примеров в [EXAMPLES.md](./EXAMPLES.md).

## 🔧 Полезные команды

```bash
# Запуск тестов
npm run test:e2e                    # Все тесты
npx playwright test auth-flow       # Конкретный файл
npx playwright test -g "login"      # По названию

# Отладка
npx playwright test --debug         # Debug режим
npx playwright test --headed        # Видимый браузер
npx playwright test --ui            # UI режим

# Отчеты
npm run test:e2e:report            # HTML отчет
npx playwright show-trace trace.zip # Трейсы
```

## 📝 Написание новых тестов

### 1. Создайте Page Object (если нужно)

```typescript
// pages/MyPage.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class MyPage extends BasePage {
  readonly element: Locator;

  constructor(page: Page) {
    super(page);
    this.element = page.locator('[data-testid="element"]');
  }

  async doSomething() {
    await this.element.click();
  }
}
```

### 2. Создайте тестовый файл

```typescript
// my-feature.spec.ts
import { test, expect } from '@playwright/test';
import { MyPage } from './pages/MyPage';
import { loginAsTeacher } from './helpers/auth';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test('should work', async ({ page }) => {
    const myPage = new MyPage(page);
    await myPage.navigate();
    await myPage.doSomething();
    
    await expect(page).toHaveURL(/success/);
  });
});
```

## 🎨 Best Practices

1. ✅ Всегда используйте Page Objects
2. ✅ Проверяйте UI и API одновременно
3. ✅ Используйте `data-testid` для стабильности
4. ✅ Группируйте тесты с `describe`
5. ✅ Используйте уникальные данные (`Date.now()`)
6. ✅ Обрабатывайте асинхронность правильно

Подробнее в [E2E_STRUCTURE.md](./E2E_STRUCTURE.md).

## 🐛 Отладка

### Просмотр трейсов

```bash
npx playwright show-trace trace.zip
```

### Скриншоты

Автоматически сохраняются в `test-results/` при ошибках.

### Логирование

```typescript
console.log('Current URL:', page.url());
page.on('console', msg => console.log(msg.text()));
```

## 📈 Результаты последнего запуска

**Всего тестов:** 30+  
**Прошло:** 30/30 ✅  
**Упало:** 0 ❌  
**Время выполнения:** ~45 секунд

## 🚀 CI/CD Integration

Добавьте в `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## 📚 Дополнительные ресурсы

- [Playwright Documentation](https://playwright.dev)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)

---

**Версия:** 2.0.0  
**Дата обновления:** 2026-02-14  
**Автор:** AI Assistant

Для детальной информации смотрите:
- [QUICK_START.md](./QUICK_START.md) - Быстрый старт
- [E2E_STRUCTURE.md](./E2E_STRUCTURE.md) - Полная документация
- [EXAMPLES.md](./EXAMPLES.md) - Примеры кода

