import { test, expect } from '@playwright/test';

test.describe('Rich Text Editor', () => {
  test.skip('should render TipTap editor', async ({ page }) => {
    // TODO: Открыть страницу с редактором
    // await page.goto('/teacher/tests/create');
    // await expect(page.locator('.ProseMirror')).toBeVisible();
  });

  test.skip('should format text', async ({ page }) => {
    // TODO: Проверка форматирования (bold, italic, underline)
  });

  test.skip('should insert LaTeX formula', async ({ page }) => {
    // TODO: Проверка вставки формул
  });

  test.skip('should render KaTeX', async ({ page }) => {
    // TODO: Проверка рендеринга формул
  });

  test.skip('should insert image', async ({ page }) => {
    // TODO: Проверка вставки изображений
  });
});

test.describe('Formula Editor', () => {
  test.skip('should open formula modal', async ({ page }) => {
    // TODO: Проверка открытия модального окна формул
  });

  test.skip('should validate LaTeX syntax', async ({ page }) => {
    // TODO: Проверка валидации синтаксиса
  });

  test.skip('should preview formula', async ({ page }) => {
    // TODO: Проверка предпросмотра формулы
  });
});
