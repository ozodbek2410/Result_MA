import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    
    // Проверяем, что страница загрузилась
    await expect(page).toHaveURL(/\//);
    
    // Проверяем наличие основных элементов
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
  });

  test('should have responsive layout', async ({ page }) => {
    await page.goto('/');
    
    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
    await expect(page.getByAltText(/math academy logo/i).first()).toBeVisible();
    
    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
  });

  test('should display logo and branding', async ({ page }) => {
    await page.goto('/');
    
    // Проверяем логотип (берем первый)
    const logo = page.getByAltText(/math academy logo/i).first();
    await expect(logo).toBeVisible();
    
    // Проверяем название
    await expect(page.getByText(/math academy/i).first()).toBeVisible();
    await expect(page.getByText(/matematika maktabi/i)).toBeVisible();
  });
});
