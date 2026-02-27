import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object для страницы управления студентами
 */
export class StudentManagementPage extends BasePage {
  // Локаторы элементов
  readonly pageHeading: Locator;
  readonly addStudentButton: Locator;
  readonly searchInput: Locator;
  readonly studentsTable: Locator;
  readonly studentRows: Locator;
  readonly createModal: Locator;
  readonly editModal: Locator;
  readonly deleteConfirmModal: Locator;

  constructor(page: Page) {
    super(page);
    
    // Инициализация локаторов
    this.pageHeading = page.getByRole('heading', { name: /o'quvchilar|students/i });
    this.addStudentButton = page.getByRole('button', { name: /o'quvchi qo'shish|add student/i });
    this.searchInput = page.getByPlaceholder(/qidirish|search/i);
    this.studentsTable = page.locator('[data-testid="students-table"]');
    this.studentRows = page.locator('[data-testid="student-row"]');
    this.createModal = page.locator('[data-testid="create-student-modal"]');
    this.editModal = page.locator('[data-testid="edit-student-modal"]');
    this.deleteConfirmModal = page.locator('[data-testid="delete-confirm-modal"]');
  }

  /**
   * Переход на страницу управления студентами
   */
  async navigate() {
    await this.goto('/teacher/students');
    await this.waitForPageLoad();
  }

  /**
   * Проверка загрузки списка студентов
   */
  async verifyPageLoaded() {
    await this.waitForApiResponse('/api/students');
    await expect(this.pageHeading).toBeVisible();
    await expect(this.addStudentButton).toBeVisible();
  }

  /**
   * Открытие модального окна создания студента
   */
  async openCreateModal() {
    await this.addStudentButton.click();
    await this.createModal.waitFor({ state: 'visible' });
  }

  /**
   * Создание нового студента
   */
  async createStudent(studentData: {
    firstName: string;
    lastName: string;
    groupId?: string;
    phone?: string;
  }) {
    await this.openCreateModal();
    
    // Заполняем форму
    await this.createModal.getByPlaceholder(/ism|first name/i).fill(studentData.firstName);
    await this.createModal.getByPlaceholder(/familiya|last name/i).fill(studentData.lastName);
    
    if (studentData.groupId) {
      await this.createModal.locator('select[name="groupId"]').selectOption(studentData.groupId);
    }
    
    if (studentData.phone) {
      await this.createModal.getByPlaceholder(/telefon|phone/i).fill(studentData.phone);
    }
    
    // Сохраняем
    const responsePromise = this.waitForApiResponse('/api/students', 201);
    await this.createModal.getByRole('button', { name: /saqlash|save/i }).click();
    
    const response = await responsePromise;
    const data = await response.json();
    
    // Ждем закрытия модального окна
    await this.createModal.waitFor({ state: 'hidden' });
    
    // Ждем toast уведомление
    await this.waitForToast(/muvaffaqiyatli|success/i);
    
    return data;
  }

  /**
   * Поиск студента
   */
  async searchStudent(query: string) {
    await this.searchInput.fill(query);
    
    // Ждем debounce и ответ от API
    await this.page.waitForTimeout(500);
    await this.waitForApiResponse(/\/api\/students\?.*search=/);
  }

  /**
   * Получение списка студентов из таблицы
   */
  async getStudentsList() {
    const rows = await this.studentRows.all();
    
    const students = [];
    for (const row of rows) {
      const name = await row.locator('[data-testid="student-name"]').textContent();
      const group = await row.locator('[data-testid="student-group"]').textContent();
      
      students.push({
        name: name?.trim(),
        group: group?.trim()
      });
    }
    
    return students;
  }

  /**
   * Редактирование студента
   */
  async editStudent(studentName: string, newData: { firstName?: string; lastName?: string }) {
    // Находим строку студента
    const studentRow = this.page.locator('[data-testid="student-row"]', {
      hasText: studentName
    });
    
    // Клик на кнопку редактирования
    await studentRow.locator('[data-testid="edit-button"]').click();
    await this.editModal.waitFor({ state: 'visible' });
    
    // Обновляем данные
    if (newData.firstName) {
      const firstNameInput = this.editModal.getByPlaceholder(/ism|first name/i);
      await firstNameInput.clear();
      await firstNameInput.fill(newData.firstName);
    }
    
    if (newData.lastName) {
      const lastNameInput = this.editModal.getByPlaceholder(/familiya|last name/i);
      await lastNameInput.clear();
      await lastNameInput.fill(newData.lastName);
    }
    
    // Сохраняем
    const responsePromise = this.waitForApiResponse(/\/api\/students\/[a-f0-9]+/, 200);
    await this.editModal.getByRole('button', { name: /saqlash|save/i }).click();
    
    await responsePromise;
    await this.editModal.waitFor({ state: 'hidden' });
    await this.waitForToast(/muvaffaqiyatli|success/i);
  }

  /**
   * Удаление студента
   */
  async deleteStudent(studentName: string) {
    // Находим строку студента
    const studentRow = this.page.locator('[data-testid="student-row"]', {
      hasText: studentName
    });
    
    // Клик на кнопку удаления
    await studentRow.locator('[data-testid="delete-button"]').click();
    await this.deleteConfirmModal.waitFor({ state: 'visible' });
    
    // Подтверждаем удаление
    const responsePromise = this.waitForApiResponse(/\/api\/students\/[a-f0-9]+/, 200);
    await this.deleteConfirmModal.getByRole('button', { name: /o'chirish|delete/i }).click();
    
    await responsePromise;
    await this.deleteConfirmModal.waitFor({ state: 'hidden' });
    await this.waitForToast(/o'chirildi|deleted/i);
  }

  /**
   * Открытие профиля студента
   */
  async openStudentProfile(studentName: string) {
    const studentRow = this.page.locator('[data-testid="student-row"]', {
      hasText: studentName
    });
    
    await this.clickAndWaitForNavigation(
      studentRow.locator('[data-testid="view-profile-button"]'),
      /\/teacher\/students\/[a-f0-9]+/
    );
  }

  /**
   * Генерация QR кода для студента
   */
  async generateQRCode(studentName: string) {
    const studentRow = this.page.locator('[data-testid="student-row"]', {
      hasText: studentName
    });
    
    await studentRow.locator('[data-testid="qr-button"]').click();
    
    // Ждем появления модального окна с QR кодом
    const qrModal = this.page.locator('[data-testid="qr-modal"]');
    await qrModal.waitFor({ state: 'visible' });
    
    // Проверяем наличие QR кода
    const qrImage = qrModal.locator('canvas, img[alt*="QR"]');
    await expect(qrImage).toBeVisible();
    
    return qrModal;
  }
}
