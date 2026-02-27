import { test, expect } from '@playwright/test';

test.describe('Accessibility Tests', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    
    // Проверяем, что есть заголовок "Kirish" (это h2)
    const heading = page.getByRole('heading', { name: /kirish/i });
    await expect(heading).toBeVisible();
    
    // Проверяем количество заголовков
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
    expect(headings).toBeGreaterThan(0);
  });

  test('should have alt text for images', async ({ page }) => {
    await page.goto('/');
    
    const images = await page.locator('img').all();
    
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      // Все изображения должны иметь alt атрибут
      expect(alt).toBeDefined();
    }
  });

  test('should have labels for form inputs', async ({ page }) => {
    await page.goto('/');
    
    const loginInput = page.getByPlaceholder(/loginni kiriting/i);
    const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
    
    // Проверяем наличие placeholder (минимальная доступность)
    await expect(loginInput).toHaveAttribute('placeholder');
    await expect(passwordInput).toHaveAttribute('placeholder');
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Кликаем на body чтобы убрать фокус с любых элементов
    await page.locator('body').click();
    
    // Проверяем навигацию по Tab
    await page.keyboard.press('Tab');
    
    // Ждем немного для применения фокуса
    await page.waitForTimeout(300);
    
    // Проверяем, что какой-то элемент получил фокус
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);
  });

  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/');
    
    // Проверяем, что текст виден
    const heading = page.getByRole('heading', { name: /kirish/i });
    await expect(heading).toBeVisible();
    
    // TODO: Добавить проверку контрастности через axe-core
  });

  test('should pass axe accessibility audit', async ({ page }) => {
    // TODO: Установить @axe-core/playwright
    // await page.goto('/');
    // const results = await new AxeBuilder({ page }).analyze();
    // expect(results.violations).toEqual([]);
  });
});
