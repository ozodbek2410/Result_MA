/**
 * Unified types for working with both Regular and Block tests
 */

// Test type discriminator
export type TestType = 'regular' | 'block';

// Question types (shared between both test types)
export interface QuestionVariant {
  letter: 'A' | 'B' | 'C' | 'D';
  text: string;
  formula?: string;
  imageUrl?: string;
}

export interface Question {
  text: string;
  contextText?: string;
  contextImage?: string;
  formula?: string;
  imageUrl?: string;
  variants: QuestionVariant[];
  correctAnswer?: 'A' | 'B' | 'C' | 'D' | '';
  points: number;
}

// Base test data (common fields)
export interface BaseTestData {
  _id?: string;
  branchId: string;
  classNumber: number;
  createdBy: string;
  createdAt: Date;
}

// Regular test specific data
export interface RegularTestData extends BaseTestData {
  type: 'regular';
  groupId?: string;
  subjectId?: string;
  name: string;
  questions: Question[];
}

// Block test specific data
export interface StudentConfig {
  studentId: string;
  subjects: {
    subjectId: string;
    questionCount: number;
    pointsConfig?: { from: number; to: number; points: number }[];
  }[];
}

export interface BlockTestData extends BaseTestData {
  type: 'block';
  date: Date;
  periodMonth: number; // 1-12
  periodYear: number;
  subjectTests: {
    subjectId: string;
    questions: Question[];
  }[];
  studentConfigs: StudentConfig[];
}

// Unified test data (discriminated union)
export type UnifiedTestData = RegularTestData | BlockTestData;

// Type guards
export function isRegularTest(test: UnifiedTestData): test is RegularTestData {
  return test.type === 'regular';
}

export function isBlockTest(test: UnifiedTestData): test is BlockTestData {
  return test.type === 'block';
}

// Import/Export types
export interface TestImportOptions {
  type: TestType;
  file: File;
  classNumber: number;
  // Regular test specific
  groupId?: string;
  subjectId?: string;
  name?: string;
  // Block test specific
  date?: Date;
  periodMonth?: number;
  periodYear?: number;
}

export interface TestImportResult {
  success: boolean;
  testId?: string;
  questions?: Question[];
  error?: string;
}
