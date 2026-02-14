import { test, expect } from '@playwright/test';

// Helper для логина (нужны реальные credentials для полного теста)
async function loginAsTeacher(page: any) {
  await page.goto('/');
  // TODO: Заполнить реальными тестовыми credentials
  // await page.getByPlaceholder(/loginni kiriting/i).fill('teacher@test.com');
  // await page.getByPlaceholder(/parolni kiriting/i).fill('password');
  // await page.getByRole('button', { name: /kirish/i }).click();
  // await page.waitForURL(/teacher/);
}

test.describe('Teacher Dashboard', () => {
  test.skip('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await expect(page).toHaveURL(/\//);
  });

  test.skip('should display dashboard after login', async ({ page }) => {
    await loginAsTeacher(page);
    await expect(page).toHaveURL(/teacher/);
  });

  test.skip('should show statistics cards', async ({ page }) => {
    await loginAsTeacher(page);
    
    // Проверяем наличие статистики
    await expect(page.getByText(/test|sinov/i)).toBeVisible();
    await expect(page.getByText(/student|o'quvchi/i)).toBeVisible();
  });
});

test.describe('Tests Page', () => {
  test.skip('should load tests list', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/teacher/tests');
    
    // Проверяем заголовок
    await expect(page.getByRole('heading', { name: /test|sinov/i })).toBeVisible();
  });

  test.skip('should have create test button', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/teacher/tests');
    
    const createButton = page.getByRole('button', { name: /yaratish|create/i });
    await expect(createButton).toBeVisible();
  });
});

test.describe('Students Page', () => {
  test.skip('should load students list', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/teacher/students');
    
    await expect(page.getByRole('heading', { name: /student|o'quvchi/i })).toBeVisible();
  });
});

test.describe('Groups Page', () => {
  test.skip('should load groups list', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/teacher/groups');
    
    await expect(page.getByRole('heading', { name: /group|guruh/i })).toBeVisible();
  });
});
