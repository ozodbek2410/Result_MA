import { Page, Locator } from '@playwright/test';

/**
 * Базовый класс для всех Page Objects
 * Содержит общие методы для работы со страницами
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Переход на указанный URL
   */
  async goto(path: string) {
    await this.page.goto(path);
  }

  /**
   * Ожидание загрузки страницы
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Ожидание API ответа с проверкой статуса
   */
  async waitForApiResponse(urlPattern: string | RegExp, expectedStatus = 200) {
    const response = await this.page.waitForResponse(
      (resp) => {
        const url = resp.url();
        const matches = typeof urlPattern === 'string' 
          ? url.includes(urlPattern) 
          : urlPattern.test(url);
        return matches && resp.status() === expectedStatus;
      },
      { timeout: 10000 }
    );
    return response;
  }

  /**
   * Проверка наличия toast уведомления
   */
  async waitForToast(message?: string | RegExp) {
    const toast = message 
      ? this.page.locator('[role="status"]', { hasText: message })
      : this.page.locator('[role="status"]').first();
    
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    return toast;
  }

  /**
   * Клик с ожиданием навигации
   */
  async clickAndWaitForNavigation(locator: Locator, urlPattern?: string | RegExp) {
    await Promise.all([
      urlPattern ? this.page.waitForURL(urlPattern) : this.page.waitForNavigation(),
      locator.click()
    ]);
  }

  /**
   * Заполнение формы
   */
  async fillForm(fields: Record<string, string>) {
    for (const [placeholder, value] of Object.entries(fields)) {
      await this.page.getByPlaceholder(new RegExp(placeholder, 'i')).fill(value);
    }
  }

  /**
   * Проверка наличия ошибки в консоли
   */
  async getConsoleErrors(): Promise<string[]> {
    const errors: string[] = [];
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    return errors;
  }
}
