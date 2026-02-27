import { test, expect } from '@playwright/test';

/**
 * Отладочный тест для проверки авторизации
 * Запустите: npx playwright test debug-auth.spec.ts --headed
 */
test.describe('Debug Authentication', () => {
  test('should check login page and credentials', async ({ page }) => {
    // Переходим на страницу логина
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    
    console.log('Current URL:', page.url());
    
    // Проверяем наличие формы
    const loginInput = page.getByPlaceholder(/loginni kiriting/i);
    const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
    const submitButton = page.getByRole('button', { name: /kirish/i });
    
    await expect(loginInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    console.log('Form elements found');
    
    // Пробуем авторизоваться
    await loginInput.fill('teacher');
    await passwordInput.fill('teacher123');
    
    console.log('Credentials filled');
    
    // Слушаем сетевые запросы
    page.on('response', async (response) => {
      if (response.url().includes('/api/auth/login')) {
        console.log('Login API response:', response.status());
        try {
          const body = await response.json();
          console.log('Response body:', JSON.stringify(body, null, 2));
        } catch (e) {
          console.log('Could not parse response body');
        }
      }
    });
    
    await submitButton.click();
    
    // Ждем 5 секунд и смотрим что произошло
    await page.waitForTimeout(5000);
    
    console.log('After submit URL:', page.url());
    
    // Проверяем наличие ошибок
    const errorElement = page.locator('text=/error|xato/i');
    const hasError = await errorElement.isVisible().catch(() => false);
    
    if (hasError) {
      const errorText = await errorElement.textContent();
      console.log('Error message:', errorText);
    }
    
    // Делаем скриншот
    await page.screenshot({ path: 'debug-login.png', fullPage: true });
    console.log('Screenshot saved to debug-login.png');
  });
});
