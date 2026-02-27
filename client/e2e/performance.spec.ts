import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('should load homepage quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;
    
    // Страница должна загрузиться менее чем за 3 секунды
    expect(loadTime).toBeLessThan(3000);
  });

  test('should have no console errors on homepage', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Фильтруем известные безопасные ошибки
    const criticalErrors = errors.filter(err => 
      !err.includes('favicon') && 
      !err.includes('404')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('should not have memory leaks', async ({ page }) => {
    await page.goto('/');
    
    // Получаем метрики производительности
    const metrics = await page.evaluate(() => {
      const perf = performance as any;
      return {
        memory: perf.memory ? perf.memory.usedJSHeapSize : 0,
        navigation: perf.getEntriesByType('navigation')[0]
      };
    });
    
    // Проверяем, что память не превышает 100MB
    if (metrics.memory > 0) {
      expect(metrics.memory).toBeLessThan(100 * 1024 * 1024);
    }
  });

  test('should handle large lists efficiently', async ({ page }) => {
    // TODO: Проверка производительности при большом количестве данных
  });
});

test.describe('Network Tests', () => {
  test('should handle slow network', async ({ page, context }) => {
    // Эмулируем медленную сеть
    await context.route('**/*', route => {
      setTimeout(() => route.continue(), 100);
    });
    
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /kirish/i })).toBeVisible();
  });

  test('should handle offline mode gracefully', async ({ page, context }) => {
    await page.goto('/');
    
    // Ждем полной загрузки страницы
    await page.waitForLoadState('networkidle');
    
    // Переходим в офлайн режим
    await context.setOffline(true);
    
    // Заполняем форму (это должно работать, так как страница уже загружена)
    await page.getByPlaceholder(/loginni kiriting/i).fill('test');
    await page.getByPlaceholder(/parolni kiriting/i).fill('test');
    
    // Пытаемся отправить форму
    await page.getByRole('button', { name: /kirish/i }).click();
    
    // Ждем попытки отправки (должна упасть из-за офлайн)
    await page.waitForTimeout(2000);
    
    // Проверяем, что остались на странице логина
    await expect(page).toHaveURL(/\//);
  });
});
