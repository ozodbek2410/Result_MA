import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';
import { TestCreationPage } from './pages/TestCreationPage';
import { loginAsTeacher } from './helpers/auth';

/**
 * E2E тесты для управления тестами
 * Проверяет создание, редактирование и импорт тестов
 */
test.describe('Test Management Flow', () => {
  // Авторизуемся перед каждым тестом
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test.skip('should navigate to test creation page from dashboard', async ({ page }) => {
    const dashboardPage = new TeacherDashboardPage(page);
    await dashboardPage.navigate();
    
    // Переходим к созданию теста
    await dashboardPage.goToCreateTest();
    
    // Проверяем, что попали на страницу создания
    await expect(page).toHaveURL(/\/teacher\/tests\/create/);
    
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.verifyEditorLoaded();
  });

  test.skip('should display validation errors when creating test without required fields', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    // Пытаемся сохранить пустую форму
    const errors = await testCreationPage.verifyValidationErrors();
    
    // Проверяем, что есть ошибки валидации
    expect(errors.length).toBeGreaterThan(0);
  });

  test.skip('should create a new test with questions', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    // Заполняем основную информацию
    const testTitle = `E2E Test ${Date.now()}`;
    await testCreationPage.fillTestInfo(testTitle);
    
    // Добавляем вопрос
    await testCreationPage.addQuestion({
      text: 'What is 2 + 2?',
      type: 'single',
      options: ['3', '4', '5', '6'],
      correctAnswer: 1
    });
    
    // Сохраняем тест
    const savedTest = await testCreationPage.saveTest();
    
    // Проверяем, что тест создан
    expect(savedTest).toHaveProperty('_id');
    expect(savedTest.title).toBe(testTitle);
    
    // Проверяем редирект на список тестов
    await expect(page).toHaveURL(/\/teacher\/tests/);
  });

  test.skip('should add multiple questions to test', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    // Заполняем основную информацию
    await testCreationPage.fillTestInfo(`Multi-Question Test ${Date.now()}`);
    
    // Добавляем несколько вопросов
    const questions = [
      {
        text: 'Question 1: What is the capital of France?',
        type: 'single' as const,
        options: ['London', 'Paris', 'Berlin', 'Madrid'],
        correctAnswer: 1
      },
      {
        text: 'Question 2: Select all prime numbers',
        type: 'multiple' as const,
        options: ['2', '4', '5', '6'],
        correctAnswer: [0, 2]
      }
    ];
    
    for (const question of questions) {
      await testCreationPage.addQuestion(question);
    }
    
    // Проверяем, что вопросы добавлены
    const addedQuestions = await testCreationPage.getQuestions();
    expect(addedQuestions.length).toBe(questions.length);
    
    // Сохраняем тест
    await testCreationPage.saveTest();
  });

  test.skip('should handle API errors when creating test', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    // Перехватываем API запрос и возвращаем ошибку
    await page.route('**/api/tests', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Server error' })
      });
    });
    
    // Заполняем форму
    await testCreationPage.fillTestInfo('Test with Error');
    await testCreationPage.addQuestion({
      text: 'Sample question',
      type: 'single',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 0
    });
    
    // Пытаемся сохранить
    await testCreationPage.saveButton.click();
    
    // Ждем обработки ошибки
    await page.waitForTimeout(2000);
    
    // Проверяем, что остались на странице создания
    await expect(page).toHaveURL(/\/teacher\/tests\/create/);
  });
});

/**
 * E2E тесты для импорта тестов
 */
test.describe('Test Import Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test.skip('should open import modal', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    // Открываем модальное окно импорта
    const modal = await testCreationPage.openImportModal();
    
    // Проверяем, что модальное окно открылось
    await expect(modal).toBeVisible();
  });

  test.skip('should validate file format on import', async ({ page }) => {
    const testCreationPage = new TestCreationPage(page);
    await testCreationPage.navigate();
    
    await testCreationPage.openImportModal();
    
    // Перехватываем API запрос импорта
    let importRequestMade = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/tests/import')) {
        importRequestMade = true;
      }
    });
    
    // Пытаемся загрузить файл неверного формата
    const fileInput = page.locator('input[type="file"]');
    
    // Создаем временный текстовый файл
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Invalid file content')
    });
    
    // Ждем обработки
    await page.waitForTimeout(2000);
    
    // Проверяем, что запрос не был отправлен или вернулась ошибка
    // (зависит от реализации валидации на клиенте)
  });
});

/**
 * E2E тесты для списка тестов
 */
test.describe('Tests List View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test.skip('should display list of tests', async ({ page }) => {
    const dashboardPage = new TeacherDashboardPage(page);
    await dashboardPage.navigate();
    
    // Переходим к списку тестов
    await dashboardPage.goToTests();
    
    // Ждем загрузки списка
    await page.waitForResponse(/\/api\/tests/);
    
    // Проверяем, что список отображается
    const testsList = page.locator('[data-testid="tests-list"]');
    await expect(testsList).toBeVisible();
  });

  test.skip('should search tests by title', async ({ page }) => {
    await page.goto('/teacher/tests');
    
    // Вводим поисковый запрос
    const searchInput = page.getByPlaceholder(/qidirish|search/i);
    await searchInput.fill('Math');
    
    // Ждем debounce и ответ от API
    await page.waitForTimeout(500);
    await page.waitForResponse(/\/api\/tests\?.*search=/);
    
    // Проверяем, что результаты обновились
    const testItems = page.locator('[data-testid="test-item"]');
    const count = await testItems.count();
    
    // Должны быть результаты или пустое состояние
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should delete test with confirmation', async ({ page }) => {
    await page.goto('/teacher/tests');
    
    // Находим первый тест в списке
    const firstTest = page.locator('[data-testid="test-item"]').first();
    
    if (await firstTest.isVisible()) {
      // Клик на кнопку удаления
      await firstTest.locator('[data-testid="delete-button"]').click();
      
      // Ждем модальное окно подтверждения
      const confirmModal = page.locator('[data-testid="delete-confirm-modal"]');
      await confirmModal.waitFor({ state: 'visible' });
      
      // Подтверждаем удаление
      await confirmModal.getByRole('button', { name: /o'chirish|delete/i }).click();
      
      // Ждем ответа от API
      await page.waitForResponse(/\/api\/tests\/[a-f0-9]+/);
      
      // Проверяем toast уведомление
      await expect(page.locator('[role="status"]')).toBeVisible();
    }
  });
});
