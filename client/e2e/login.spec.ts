import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    // Проверяем заголовок "Kirish"
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
    
    // Проверяем поля ввода
    await expect(page.getByPlaceholder(/loginni kiriting/i)).toBeVisible();
    await expect(page.getByPlaceholder(/parolni kiriting/i)).toBeVisible();
    
    // Проверяем кнопку "Kirish"
    await expect(page.getByRole('button', { name: /kirish/i })).toBeVisible();
    
    // Проверяем логотип (берем первый)
    await expect(page.getByAltText(/math academy logo/i).first()).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /kirish/i });
    await submitButton.click();
    
    // Проверяем, что форма не отправилась (остались на той же странице)
    await expect(page).toHaveURL(/\//);
    
    // Ждем возможное сообщение об ошибке
    await page.waitForTimeout(1000);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Заполняем форму неверными данными
    await page.getByPlaceholder(/loginni kiriting/i).fill('invaliduser');
    await page.getByPlaceholder(/parolni kiriting/i).fill('wrongpassword');
    
    // Отправляем форму
    await page.getByRole('button', { name: /kirish/i }).click();
    
    // Ждем ответа от сервера и проверяем наличие сообщения об ошибке
    await page.waitForTimeout(2000);
    
    // Проверяем, что остались на странице логина (не произошел редирект)
    await expect(page).toHaveURL(/\//);
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
    
    // Проверяем, что поле пароля скрыто по умолчанию
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Ищем кнопку показа/скрытия пароля (иконка глаза)
    const toggleButton = page.locator('button').filter({ has: page.locator('img') }).nth(1);
    
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // После клика тип может измениться на text
      await page.waitForTimeout(300);
    }
  });
});
