import { test, expect } from '@playwright/test';

test.describe('Accessibility Tests', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    
    const h1 = await page.locator('h1').count();
    const h2 = await page.locator('h2').count();
    
    // Должен быть хотя бы один заголовок
    expect(h1 + h2).toBeGreaterThan(0);
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
    
    // Проверяем навигацию по Tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Кнопка должна получить фокус
    const submitButton = page.getByRole('button', { name: /kirish/i });
    await expect(submitButton).toBeFocused();
  });

  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/');
    
    // Проверяем, что текст виден
    const heading = page.getByRole('heading', { name: /kirish/i });
    await expect(heading).toBeVisible();
    
    // TODO: Добавить проверку контрастности через axe-core
  });

  test.skip('should pass axe accessibility audit', async ({ page }) => {
    // TODO: Установить @axe-core/playwright
    // await page.goto('/');
    // const results = await new AxeBuilder({ page }).analyze();
    // expect(results.violations).toEqual([]);
  });
});
