import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object для страницы создания теста
 */
export class TestCreationPage extends BasePage {
  // Локаторы элементов
  readonly pageHeading: Locator;
  readonly titleInput: Locator;
  readonly subjectSelect: Locator;
  readonly addQuestionButton: Locator;
  readonly questionsList: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly importButton: Locator;
  readonly richTextEditor: Locator;

  constructor(page: Page) {
    super(page);
    
    // Инициализация локаторов
    this.pageHeading = page.getByRole('heading', { name: /test yaratish|create test/i });
    this.titleInput = page.getByPlaceholder(/test nomi|test title/i);
    this.subjectSelect = page.locator('select[name="subjectId"], [data-testid="subject-select"]');
    this.addQuestionButton = page.getByRole('button', { name: /savol qo'shish|add question/i });
    this.questionsList = page.locator('[data-testid="questions-list"]');
    this.saveButton = page.getByRole('button', { name: /saqlash|save/i });
    this.cancelButton = page.getByRole('button', { name: /bekor qilish|cancel/i });
    this.importButton = page.getByRole('button', { name: /import|yuklash/i });
    this.richTextEditor = page.locator('.tiptap, [data-testid="rich-text-editor"]');
  }

  /**
   * Переход на страницу создания теста
   */
  async navigate() {
    await this.goto('/teacher/tests/create');
    await this.waitForPageLoad();
  }

  /**
   * Заполнение основной информации о тесте
   */
  async fillTestInfo(title: string, subjectId?: string) {
    await this.titleInput.fill(title);
    
    if (subjectId) {
      await this.subjectSelect.selectOption(subjectId);
    }
  }

  /**
   * Добавление вопроса
   */
  async addQuestion(questionData: {
    text: string;
    type: 'single' | 'multiple';
    options: string[];
    correctAnswer: number | number[];
  }) {
    // Клик на кнопку добавления вопроса
    await this.addQuestionButton.click();
    
    // Ждем появления формы вопроса
    const questionForm = this.page.locator('[data-testid="question-form"]').last();
    await questionForm.waitFor({ state: 'visible' });
    
    // Заполняем текст вопроса
    const questionTextInput = questionForm.locator('[data-testid="question-text"]');
    await questionTextInput.fill(questionData.text);
    
    // Выбираем тип вопроса
    const typeSelect = questionForm.locator('[data-testid="question-type"]');
    await typeSelect.selectOption(questionData.type);
    
    // Добавляем варианты ответов
    for (let i = 0; i < questionData.options.length; i++) {
      const optionInput = questionForm.locator(`[data-testid="option-${i}"]`);
      await optionInput.fill(questionData.options[i]);
      
      // Отмечаем правильный ответ
      if (
        (typeof questionData.correctAnswer === 'number' && questionData.correctAnswer === i) ||
        (Array.isArray(questionData.correctAnswer) && questionData.correctAnswer.includes(i))
      ) {
        const correctCheckbox = questionForm.locator(`[data-testid="correct-${i}"]`);
        await correctCheckbox.check();
      }
    }
  }

  /**
   * Сохранение теста
   */
  async saveTest() {
    // Ждем ответ от API
    const responsePromise = this.waitForApiResponse('/api/tests', 201);
    await this.saveButton.click();
    
    const response = await responsePromise;
    const data = await response.json();
    
    // Ждем toast уведомление
    await this.waitForToast(/muvaffaqiyatli|success/i);
    
    return data;
  }

  /**
   * Проверка валидации формы
   */
  async verifyValidationErrors() {
    await this.saveButton.click();
    
    // Ждем появления ошибок валидации
    await this.page.waitForTimeout(1000);
    
    const errors = await this.page.locator('[data-testid="validation-error"]').allTextContents();
    return errors;
  }

  /**
   * Открытие модального окна импорта
   */
  async openImportModal() {
    await this.importButton.click();
    
    const modal = this.page.locator('[data-testid="import-modal"]');
    await modal.waitFor({ state: 'visible' });
    
    return modal;
  }

  /**
   * Импорт теста из файла
   */
  async importTestFromFile(filePath: string) {
    await this.openImportModal();
    
    // Загружаем файл
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    
    // Ждем обработки файла
    await this.waitForApiResponse('/api/tests/import');
    
    // Ждем закрытия модального окна
    await this.page.locator('[data-testid="import-modal"]').waitFor({ state: 'hidden' });
  }

  /**
   * Получение списка вопросов
   */
  async getQuestions() {
    const questions = await this.questionsList.locator('[data-testid="question-item"]').all();
    
    const questionsData = [];
    for (const question of questions) {
      const text = await question.locator('[data-testid="question-text"]').textContent();
      const options = await question.locator('[data-testid="option"]').allTextContents();
      
      questionsData.push({
        text: text?.trim(),
        options: options.map(o => o.trim())
      });
    }
    
    return questionsData;
  }

  /**
   * Проверка отображения редактора
   */
  async verifyEditorLoaded() {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.titleInput).toBeVisible();
    await expect(this.subjectSelect).toBeVisible();
    await expect(this.addQuestionButton).toBeVisible();
  }
}
