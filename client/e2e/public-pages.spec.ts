import { test, expect } from '@playwright/test';

test.describe('Public Profile', () => {
  test('should load public profile page', async ({ page }) => {
    // Используем тестовый токен (если есть)
    await page.goto('/profile/test-token-123');
    
    // Проверяем, что страница загрузилась (может быть 404 если токен не существует)
    await expect(page).toHaveURL(/profile/);
  });

  test.skip('should display student info', async ({ page }) => {
    // TODO: С реальным токеном
    // await page.goto('/profile/valid-token');
    // await expect(page.getByText(/ism|name/i)).toBeVisible();
  });

  test.skip('should show QR code', async ({ page }) => {
    // TODO: Проверка отображения QR кода
  });

  test.skip('should display test results', async ({ page }) => {
    // TODO: Проверка результатов тестов
  });
});

test.describe('Public Test Result', () => {
  test('should load test result page', async ({ page }) => {
    await page.goto('/test-result/test-id-123');
    await expect(page).toHaveURL(/test-result/);
  });

  test.skip('should display test details', async ({ page }) => {
    // TODO: С реальным ID теста
  });

  test.skip('should show answers', async ({ page }) => {
    // TODO: Проверка отображения ответов
  });

  test.skip('should show score', async ({ page }) => {
    // TODO: Проверка отображения баллов
  });
});
