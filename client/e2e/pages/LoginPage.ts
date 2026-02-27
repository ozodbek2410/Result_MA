import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object для страницы авторизации
 */
export class LoginPage extends BasePage {
  // Локаторы элементов
  readonly heading: Locator;
  readonly loginInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly logo: Locator;
  readonly passwordToggle: Locator;

  constructor(page: Page) {
    super(page);
    
    // Инициализация локаторов
    this.heading = page.getByRole('heading', { name: /kirish/i });
    this.loginInput = page.getByPlaceholder(/loginni kiriting/i);
    this.passwordInput = page.getByPlaceholder(/parolni kiriting/i);
    this.submitButton = page.getByRole('button', { name: /kirish/i });
    this.logo = page.getByAltText(/math academy logo/i).first();
    this.passwordToggle = page.locator('button').filter({ has: page.locator('svg') }).nth(1);
  }

  /**
   * Переход на страницу логина
   */
  async navigate() {
    await this.goto('/login');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Авторизация пользователя
   */
  async login(username: string, password: string) {
    await this.loginInput.fill(username);
    await this.passwordInput.fill(password);
    
    // Ждем ответ от API и клик
    const responsePromise = this.waitForApiResponse('/api/auth/login');
    await this.submitButton.click();
    
    const response = await responsePromise;
    return response;
  }

  /**
   * Авторизация с ожиданием редиректа
   */
  async loginAndWaitForRedirect(username: string, password: string, expectedUrl: RegExp) {
    await this.loginInput.fill(username);
    await this.passwordInput.fill(password);
    
    await this.submitButton.click();
    await this.page.waitForURL(expectedUrl, { timeout: 15000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Попытка логина с невалидными данными
   */
  async loginWithInvalidCredentials(username: string, password: string) {
    await this.loginInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    
    // Ждем ответ с ошибкой
    await this.waitForApiResponse('/api/auth/login', 401);
  }

  /**
   * Переключение видимости пароля
   */
  async togglePasswordVisibility() {
    const typeBefore = await this.passwordInput.getAttribute('type');
    await this.passwordToggle.click();
    await this.page.waitForTimeout(300);
    const typeAfter = await this.passwordInput.getAttribute('type');
    
    return { before: typeBefore, after: typeAfter };
  }

  /**
   * Проверка отображения всех элементов формы
   */
  async verifyFormElements() {
    await expect(this.heading).toBeVisible();
    await expect(this.loginInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
    await expect(this.logo).toBeVisible();
  }

  /**
   * Отправка пустой формы
   */
  async submitEmptyForm() {
    await this.submitButton.click();
    await this.page.waitForTimeout(1000);
  }
}
