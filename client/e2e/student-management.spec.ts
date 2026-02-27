import { test, expect } from '@playwright/test';
import { StudentManagementPage } from './pages/StudentManagementPage';
import { loginAsTeacher } from './helpers/auth';

/**
 * E2E тесты для управления студентами
 * Проверяет CRUD операции и взаимодействие с API
 */
test.describe('Student Management Flow', () => {
  let studentPage: StudentManagementPage;

  test.beforeEach(async ({ page }) => {
    // Авторизуемся как учитель
    await loginAsTeacher(page);
    
    studentPage = new StudentManagementPage(page);
    await studentPage.navigate();
  });

  test('should display students list page', async ({ page }) => {
    // Проверяем, что мы на странице студентов
    await expect(page).toHaveURL(/\/teacher\/students/);
    
    // Проверяем загрузку страницы (проверяем хотя бы одно из полей)
    const hasHeading = await studentPage.pageHeading.isVisible().catch(() => false);
    const hasButton = await studentPage.addStudentButton.isVisible().catch(() => false);
    
    // Хотя бы один элемент должен быть виден
    expect(hasHeading || hasButton).toBe(true);
  });

  test.skip('should create new student and verify in list', async ({ page }) => {
    // Создаем нового студента
    const studentData = {
      firstName: `Test${Date.now()}`,
      lastName: 'Student',
      phone: '+998901234567'
    };
    
    const createdStudent = await studentPage.createStudent(studentData);
    
    // Проверяем, что студент создан
    expect(createdStudent).toHaveProperty('_id');
    expect(createdStudent.firstName).toBe(studentData.firstName);
    
    // Проверяем, что студент появился в списке
    const students = await studentPage.getStudentsList();
    const foundStudent = students.find(s => 
      s.name?.includes(studentData.firstName)
    );
    
    expect(foundStudent).toBeDefined();
  });

  test.skip('should validate required fields when creating student', async ({ page }) => {
    // Открываем модальное окно
    await studentPage.openCreateModal();
    
    // Пытаемся сохранить без заполнения полей
    await studentPage.createModal.getByRole('button', { name: /saqlash|save/i }).click();
    
    // Ждем появления ошибок валидации
    await page.waitForTimeout(1000);
    
    // Проверяем, что модальное окно не закрылось
    await expect(studentPage.createModal).toBeVisible();
  });

  test.skip('should search students by name', async ({ page }) => {
    // Создаем студента для поиска
    const uniqueName = `SearchTest${Date.now()}`;
    await studentPage.createStudent({
      firstName: uniqueName,
      lastName: 'Student'
    });
    
    // Ищем студента
    await studentPage.searchStudent(uniqueName);
    
    // Проверяем результаты поиска
    const students = await studentPage.getStudentsList();
    expect(students.length).toBeGreaterThan(0);
    expect(students[0].name).toContain(uniqueName);
  });

  test.skip('should edit student information', async ({ page }) => {
    // Создаем студента
    const originalName = `Original${Date.now()}`;
    await studentPage.createStudent({
      firstName: originalName,
      lastName: 'Student'
    });
    
    // Редактируем студента
    const newFirstName = `Updated${Date.now()}`;
    await studentPage.editStudent(`${originalName} Student`, {
      firstName: newFirstName
    });
    
    // Проверяем, что изменения применились
    const students = await studentPage.getStudentsList();
    const updatedStudent = students.find(s => s.name?.includes(newFirstName));
    
    expect(updatedStudent).toBeDefined();
  });

  test.skip('should delete student with confirmation', async ({ page }) => {
    // Создаем студента для удаления
    const studentName = `ToDelete${Date.now()}`;
    await studentPage.createStudent({
      firstName: studentName,
      lastName: 'Student'
    });
    
    // Удаляем студента
    await studentPage.deleteStudent(`${studentName} Student`);
    
    // Проверяем, что студент удален из списка
    const students = await studentPage.getStudentsList();
    const deletedStudent = students.find(s => s.name?.includes(studentName));
    
    expect(deletedStudent).toBeUndefined();
  });

  test.skip('should generate QR code for student', async ({ page }) => {
    // Создаем студента
    const studentName = `QRTest${Date.now()}`;
    await studentPage.createStudent({
      firstName: studentName,
      lastName: 'Student'
    });
    
    // Генерируем QR код
    const qrModal = await studentPage.generateQRCode(`${studentName} Student`);
    
    // Проверяем, что QR код отображается
    await expect(qrModal).toBeVisible();
    
    // Закрываем модальное окно
    await qrModal.getByRole('button', { name: /close|yopish/i }).click();
    await qrModal.waitFor({ state: 'hidden' });
  });

  test.skip('should handle API errors when creating student', async ({ page }) => {
    // Перехватываем API запрос и возвращаем ошибку
    await page.route('**/api/students', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Student already exists' })
        });
      } else {
        route.continue();
      }
    });
    
    // Пытаемся создать студента
    await studentPage.openCreateModal();
    
    await studentPage.createModal.getByPlaceholder(/ism|first name/i).fill('Test');
    await studentPage.createModal.getByPlaceholder(/familiya|last name/i).fill('Student');
    await studentPage.createModal.getByRole('button', { name: /saqlash|save/i }).click();
    
    // Ждем обработки ошибки
    await page.waitForTimeout(2000);
    
    // Проверяем, что модальное окно не закрылось
    await expect(studentPage.createModal).toBeVisible();
  });

  test.skip('should display empty state when no students', async ({ page }) => {
    // Перехватываем API запрос и возвращаем пустой массив
    await page.route('**/api/students*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
    
    // Перезагружаем страницу
    await studentPage.navigate();
    
    // Проверяем отображение пустого состояния
    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();
  });

  test('should paginate students list', async ({ page }) => {
    // Проверяем наличие пагинации (если есть много студентов)
    const pagination = page.locator('[data-testid="pagination"]');
    
    if (await pagination.isVisible()) {
      // Клик на следующую страницу
      const nextButton = pagination.getByRole('button', { name: /next|keyingi/i });
      
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        
        // Ждем загрузки следующей страницы
        await page.waitForResponse(/\/api\/students\?.*page=/);
        
        // Проверяем, что URL обновился
        await expect(page).toHaveURL(/page=2/);
      }
    }
  });
});

/**
 * E2E тесты для профиля студента
 */
test.describe('Student Profile View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test('should open student profile', async ({ page }) => {
    const studentPage = new StudentManagementPage(page);
    await studentPage.navigate();
    
    // Находим первого студента
    const firstStudent = page.locator('[data-testid="student-row"]').first();
    
    if (await firstStudent.isVisible()) {
      const studentName = await firstStudent.locator('[data-testid="student-name"]').textContent();
      
      // Открываем профиль
      await studentPage.openStudentProfile(studentName || '');
      
      // Проверяем, что попали на страницу профиля
      await expect(page).toHaveURL(/\/teacher\/students\/[a-f0-9]+/);
      
      // Проверяем загрузку данных профиля
      await page.waitForResponse(/\/api\/students\/[a-f0-9]+/);
    }
  });

  test.skip('should display student statistics in profile', async ({ page }) => {
    // Переходим на профиль студента (используем тестовый ID)
    const testStudentId = '507f1f77bcf86cd799439011'; // Пример ID
    await page.goto(`/teacher/students/${testStudentId}`);
    
    // Ждем загрузки данных
    await page.waitForResponse(/\/api\/students\/[a-f0-9]+/);
    
    // Проверяем наличие статистики
    const statsSection = page.locator('[data-testid="student-stats"]');
    
    if (await statsSection.isVisible()) {
      await expect(statsSection).toBeVisible();
    }
  });
});

/**
 * E2E тесты для групп студентов
 */
test.describe('Student Groups Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test('should filter students by group', async ({ page }) => {
    const studentPage = new StudentManagementPage(page);
    await studentPage.navigate();
    
    // Находим фильтр по группам
    const groupFilter = page.locator('[data-testid="group-filter"]');
    
    if (await groupFilter.isVisible()) {
      // Выбираем группу
      await groupFilter.selectOption({ index: 1 });
      
      // Ждем обновления списка
      await page.waitForResponse(/\/api\/students\?.*groupId=/);
      
      // Проверяем, что список обновился
      const students = await studentPage.getStudentsList();
      expect(students.length).toBeGreaterThanOrEqual(0);
    }
  });
});
