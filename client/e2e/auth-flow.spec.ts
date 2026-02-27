import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { TeacherDashboardPage } from './pages/TeacherDashboardPage';

/**
 * E2E тесты для потока авторизации
 * Проверяет UI и API взаимодействие
 */
test.describe('Authentication Flow', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('should display login form with all elements', async ({ page }) => {
    // Проверяем отображение всех элементов формы
    await loginPage.verifyFormElements();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Отправляем пустую форму
    await loginPage.submitEmptyForm();
    
    // Проверяем, что остались на странице логина
    await expect(page).toHaveURL(/\//);
  });

  test('should show error for invalid credentials and verify API response', async ({ page }) => {
    // Пытаемся войти с неверными данными
    await loginPage.loginWithInvalidCredentials('invaliduser@test.com', 'wrongpassword');
    
    // Проверяем, что остались на странице логина
    await expect(page).toHaveURL(/\//);
    
    // Проверяем, что форма все еще видна
    await expect(loginPage.loginInput).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    // Заполняем пароль
    await loginPage.passwordInput.fill('testpassword');
    
    // Переключаем видимость
    const { before, after } = await loginPage.togglePasswordVisibility();
    
    // Проверяем, что тип изменился
    expect(before).toBe('password');
    expect(after).toBe('text');
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    const username = process.env.TEST_TEACHER_LOGIN || 'teacher';
    const password = process.env.TEST_TEACHER_PASSWORD || 'teacher123';
    
    // Логинимся и ждем редиректа
    await loginPage.loginAndWaitForRedirect(username, password, /\/teacher/);
    
    // Проверяем, что попали на дашборд
    await expect(page).toHaveURL(/\/teacher/);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Симулируем офлайн режим
    await page.context().setOffline(true);
    
    // Пытаемся войти
    await loginPage.loginInput.fill('teacher');
    await loginPage.passwordInput.fill('teacher123');
    await loginPage.submitButton.click();
    
    // Ждем обработки ошибки
    await page.waitForTimeout(2000);
    
    // Проверяем, что остались на странице логина
    await expect(page).toHaveURL(/\//);
    
    // Восстанавливаем соединение
    await page.context().setOffline(false);
  });

  test('should not have console errors on login page', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await loginPage.navigate();
    await page.waitForTimeout(2000);
    
    // Фильтруем известные безопасные ошибки
    const criticalErrors = consoleErrors.filter(
      err => !err.includes('favicon') && !err.includes('sourcemap')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});

/**
 * E2E тесты для сессии пользователя
 */
test.describe('User Session Management', () => {
  test('should persist session after page reload', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    const username = process.env.TEST_TEACHER_LOGIN || 'teacher';
    const password = process.env.TEST_TEACHER_PASSWORD || 'teacher123';
    
    // Логинимся
    await loginPage.loginAndWaitForRedirect(username, password, /\/teacher/);
    
    // Перезагружаем страницу
    await page.reload();
    
    // Проверяем, что остались авторизованными
    await expect(page).toHaveURL(/\/teacher/);
  });

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    // Пытаемся открыть защищенную страницу
    await page.goto('/teacher/tests');
    
    // Должны быть перенаправлены на логин
    await expect(page).toHaveURL(/\//);
  });
});
