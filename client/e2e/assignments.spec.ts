import { test, expect } from '@playwright/test';

test.describe('Assignments', () => {
  test('should display assignments list', async ({ page }) => {
    await page.goto('/teacher/assignments');
    await expect(page).toHaveURL(/\//);
  });

  test('should create new assignment', async ({ page }) => {
    // TODO: Проверка создания задания
  });

  test('should assign test to students', async ({ page }) => {
    // TODO: Проверка назначения теста студентам
  });

  test('should set deadline', async ({ page }) => {
    // TODO: Проверка установки дедлайна
  });

  test('should view assignment results', async ({ page }) => {
    // TODO: Проверка просмотра результатов
  });
});

test.describe('Assignment Details', () => {
  test('should display assignment info', async ({ page }) => {
    // TODO: Проверка информации о задании
  });

  test('should show student progress', async ({ page }) => {
    // TODO: Проверка прогресса студентов
  });

  test('should allow grading', async ({ page }) => {
    // TODO: Проверка выставления оценок
  });
});
