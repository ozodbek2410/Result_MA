import { Page } from '@playwright/test';

/**
 * Тестовые credentials для авторизации
 */
const TEST_CREDENTIALS = {
  teacher: {
    username: process.env.TEST_TEACHER_LOGIN || 'teacher',
    password: process.env.TEST_TEACHER_PASSWORD || 'teacher123'
  },
  student: {
    username: process.env.TEST_STUDENT_LOGIN || 'student',
    password: process.env.TEST_STUDENT_PASSWORD || 'student123'
  },
  admin: {
    username: process.env.TEST_ADMIN_LOGIN || 'admin',
    password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
  }
};

/**
 * Авторизация как учитель
 * Используется в большинстве E2E тестов
 */
export async function loginAsTeacher(page: Page) {
  await page.goto('/login');
  
  // Ждем загрузки страницы логина
  await page.waitForLoadState('domcontentloaded');
  
  // Проверяем, что мы на странице логина
  await page.waitForSelector('input[placeholder*="Loginni kiriting"]', { timeout: 5000 });
  
  // Заполняем форму логина
  const loginInput = page.getByPlaceholder(/loginni kiriting/i);
  await loginInput.fill(TEST_CREDENTIALS.teacher.username);
  
  const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
  await passwordInput.fill(TEST_CREDENTIALS.teacher.password);
  
  // Отправляем форму
  const submitButton = page.getByRole('button', { name: /kirish/i });
  await submitButton.click();
  
  // Ждем либо редиректа на teacher страницу, либо ошибки
  try {
    await page.waitForURL(/\/teacher/, { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
  } catch (error) {
    // Если не удалось авторизоваться, выбрасываем понятную ошибку
    const currentUrl = page.url();
    const errorMessage = await page.locator('text=/error|xato/i').textContent().catch(() => null);
    throw new Error(
      `Failed to login as teacher. Current URL: ${currentUrl}. ` +
      `Error message: ${errorMessage || 'No error message found'}. ` +
      `Credentials used: ${TEST_CREDENTIALS.teacher.username}`
    );
  }
}

/**
 * Авторизация как студент
 */
export async function loginAsStudent(page: Page) {
  await page.goto('/');
  
  const loginInput = page.getByPlaceholder(/loginni kiriting/i);
  await loginInput.fill(TEST_CREDENTIALS.student.username);
  
  const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
  await passwordInput.fill(TEST_CREDENTIALS.student.password);
  
  await Promise.all([
    page.waitForURL(/student/, { timeout: 15000 }),
    page.getByRole('button', { name: /kirish/i }).click()
  ]);
  
  await page.waitForLoadState('networkidle');
}

/**
 * Авторизация как администратор
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/');
  
  const loginInput = page.getByPlaceholder(/loginni kiriting/i);
  await loginInput.fill(TEST_CREDENTIALS.admin.username);
  
  const passwordInput = page.getByPlaceholder(/parolni kiriting/i);
  await passwordInput.fill(TEST_CREDENTIALS.admin.password);
  
  await Promise.all([
    page.waitForURL(/admin/, { timeout: 15000 }),
    page.getByRole('button', { name: /kirish/i }).click()
  ]);
  
  await page.waitForLoadState('networkidle');
}

/**
 * Универсальная функция авторизации
 */
export async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  
  await page.getByPlaceholder(/loginni kiriting/i).fill(username);
  await page.getByPlaceholder(/parolni kiriting/i).fill(password);
  await page.getByRole('button', { name: /kirish/i }).click();
  
  // Ждем любого редиректа
  await page.waitForURL(/\/(teacher|student|admin)/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Выход из системы
 */
export async function logout(page: Page) {
  // Ищем кнопку выхода в меню
  const logoutButton = page.getByRole('button', { name: /chiqish|logout/i });
  
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  } else {
    // Если кнопка в dropdown меню
    const userMenu = page.locator('[data-testid="user-menu"]');
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.getByRole('menuitem', { name: /chiqish|logout/i }).click();
    }
  }
  
  // Ждем редиректа на страницу логина
  await page.waitForURL(/\//, { timeout: 5000 });
}

/**
 * Проверка авторизации
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  return /\/(teacher|student|admin)/.test(currentUrl);
}

/**
 * Получение токена из localStorage (для API тестов)
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    return localStorage.getItem('token') || localStorage.getItem('accessToken');
  });
}
