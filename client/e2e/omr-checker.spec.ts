import { test, expect } from '@playwright/test';

test.describe('OMR Checker', () => {
  test.skip('should open OMR checker page', async ({ page }) => {
    await page.goto('/teacher/omr-checker');
    await expect(page).toHaveURL(/\//);
  });

  test.skip('should upload answer sheet image', async ({ page }) => {
    // TODO: Проверка загрузки изображения
  });

  test.skip('should process OMR', async ({ page }) => {
    // TODO: Проверка обработки OMR
  });

  test.skip('should display recognized answers', async ({ page }) => {
    // TODO: Проверка распознанных ответов
  });

  test.skip('should allow manual correction', async ({ page }) => {
    // TODO: Проверка ручной коррекции
  });

  test.skip('should save results', async ({ page }) => {
    // TODO: Проверка сохранения результатов
  });
});
