import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object для дашборда учителя
 */
export class TeacherDashboardPage extends BasePage {
  // Локаторы элементов
  readonly pageHeading: Locator;
  readonly statsCards: Locator;
  readonly testsCard: Locator;
  readonly studentsCard: Locator;
  readonly assignmentsCard: Locator;
  readonly navigationMenu: Locator;
  readonly createTestButton: Locator;
  readonly testsLink: Locator;
  readonly studentsLink: Locator;

  constructor(page: Page) {
    super(page);
    
    // Инициализация локаторов
    this.pageHeading = page.getByRole('heading', { name: /dashboard|boshqaruv paneli/i });
    this.statsCards = page.locator('[data-testid="stats-card"]');
    this.testsCard = page.locator('[data-testid="tests-card"]');
    this.studentsCard = page.locator('[data-testid="students-card"]');
    this.assignmentsCard = page.locator('[data-testid="assignments-card"]');
    this.navigationMenu = page.locator('nav');
    this.createTestButton = page.getByRole('button', { name: /test yaratish|create test/i });
    this.testsLink = page.getByRole('link', { name: /^testlar$|^tests$/i }).first();
    this.studentsLink = page.getByRole('link', { name: /o'quvchilar|students/i }).first();
  }

  /**
   * Переход на дашборд
   */
  async navigate() {
    await this.goto('/teacher');
    await this.waitForPageLoad();
  }

  /**
   * Проверка загрузки дашборда
   */
  async verifyDashboardLoaded() {
    // Ждем загрузки статистики
    await this.waitForApiResponse('/api/teacher/stats');
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Получение статистики с карточек
   */
  async getStatsFromCards() {
    const cards = await this.statsCards.all();
    const stats: Record<string, string> = {};
    
    for (const card of cards) {
      const title = await card.locator('h3, p').first().textContent();
      const value = await card.locator('[data-testid="stat-value"]').textContent();
      if (title && value) {
        stats[title.trim()] = value.trim();
      }
    }
    
    return stats;
  }

  /**
   * Переход к созданию теста
   */
  async goToCreateTest() {
    await this.clickAndWaitForNavigation(
      this.createTestButton,
      /\/teacher\/tests\/create/
    );
  }

  /**
   * Переход к списку тестов
   */
  async goToTests() {
    await this.clickAndWaitForNavigation(
      this.testsLink,
      /\/teacher\/tests/
    );
  }

  /**
   * Переход к списку студентов
   */
  async goToStudents() {
    await this.clickAndWaitForNavigation(
      this.studentsLink,
      /\/teacher\/students/
    );
  }

  /**
   * Проверка наличия навигационного меню
   */
  async verifyNavigationMenu() {
    await expect(this.navigationMenu).toBeVisible();
    await expect(this.testsLink).toBeVisible();
    await expect(this.studentsLink).toBeVisible();
  }
}
