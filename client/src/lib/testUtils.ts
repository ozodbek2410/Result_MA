import {
  TestType,
  UnifiedTestData,
  RegularTestData,
  BlockTestData,
  Question,
  isRegularTest,
  isBlockTest,
} from '@/types/test.types';

/**
 * Utility functions for working with unified test data
 */

/**
 * Get test title based on type
 */
export function getTestTitle(test: UnifiedTestData): string {
  if (isRegularTest(test)) {
    return test.name;
  }
  
  // Block test: format as "Blok test - Month Year"
  const monthNames = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
  ];
  const monthName = monthNames[test.periodMonth - 1] || '';
  return `Blok test - ${monthName} ${test.periodYear}`;
}

/**
 * Get total question count
 */
export function getTotalQuestionCount(test: UnifiedTestData): number {
  if (isRegularTest(test)) {
    return test.questions.length;
  }
  
  // Block test: sum all questions from all subjects
  return test.subjectTests.reduce((total, subject) => {
    return total + subject.questions.length;
  }, 0);
}

/**
 * Get all questions from test (flattened)
 */
export function getAllQuestions(test: UnifiedTestData): Question[] {
  if (isRegularTest(test)) {
    return test.questions;
  }
  
  // Block test: flatten all questions from all subjects
  return test.subjectTests.flatMap((subject) => subject.questions);
}

/**
 * Get subject IDs from test
 */
export function getSubjectIds(test: UnifiedTestData): string[] {
  if (isRegularTest(test)) {
    return test.subjectId ? [test.subjectId] : [];
  }
  
  // Block test: get all subject IDs
  return test.subjectTests.map((subject) => subject.subjectId);
}

/**
 * Calculate total points for test
 */
export function getTotalPoints(test: UnifiedTestData): number {
  const questions = getAllQuestions(test);
  return questions.reduce((total, question) => total + question.points, 0);
}

/**
 * Check if test has any questions
 */
export function hasQuestions(test: UnifiedTestData): boolean {
  return getTotalQuestionCount(test) > 0;
}

/**
 * Get test type label for UI
 */
export function getTestTypeLabel(type: TestType): string {
  return type === 'regular' ? 'Oddiy test' : 'Blok test';
}

/**
 * Get test type badge color
 */
export function getTestTypeBadgeColor(type: TestType): string {
  return type === 'regular' ? 'blue' : 'purple';
}

/**
 * Format test date for display
 */
export function formatTestDate(test: UnifiedTestData): string {
  if (isBlockTest(test)) {
    return new Date(test.date).toLocaleDateString('uz-UZ');
  }
  
  return new Date(test.createdAt).toLocaleDateString('uz-UZ');
}

/**
 * Validate test data before submission
 */
export function validateTestData(test: UnifiedTestData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Common validations
  if (!test.branchId) errors.push('Filial tanlanmagan');
  if (!test.classNumber) errors.push('Sinf raqami kiritilmagan');

  if (isRegularTest(test)) {
    // Regular test validations
    if (!test.name?.trim()) errors.push('Test nomi kiritilmagan');
    if (!test.questions || test.questions.length === 0) {
      errors.push('Savollar mavjud emas');
    }
  } else {
    // Block test validations
    if (!test.date) errors.push('Sana tanlanmagan');
    if (!test.periodMonth || test.periodMonth < 1 || test.periodMonth > 12) {
      errors.push('Oy noto\'g\'ri');
    }
    if (!test.periodYear) errors.push('Yil kiritilmagan');
    if (!test.subjectTests || test.subjectTests.length === 0) {
      errors.push('Fanlar mavjud emas');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create empty regular test template
 */
export function createEmptyRegularTest(
  branchId: string,
  createdBy: string
): RegularTestData {
  return {
    type: 'regular',
    branchId,
    classNumber: 1,
    name: '',
    questions: [],
    createdBy,
    createdAt: new Date(),
  };
}

/**
 * Create empty block test template
 */
export function createEmptyBlockTest(
  branchId: string,
  createdBy: string
): BlockTestData {
  const now = new Date();
  return {
    type: 'block',
    branchId,
    classNumber: 1,
    date: now,
    periodMonth: now.getMonth() + 1,
    periodYear: now.getFullYear(),
    subjectTests: [],
    studentConfigs: [],
    createdBy,
    createdAt: now,
  };
}
