// ============================================
// ОБЩИЕ ТИПЫ ДЛЯ КЛИЕНТА
// ============================================

// User & Auth
export interface User {
  id: string;
  username: string;
  role: UserRole;
  branchId?: string;
  fullName?: string;
  phone?: string;
  permissions?: string[];
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  FIL_ADMIN = 'FIL_ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  MANAGER = 'MANAGER',
  METHODIST = 'METHODIST',
  OBSERVER = 'OBSERVER',
}

// Student
export interface Student {
  _id: string;
  fullName: string;
  studentCode?: number;
  phone?: string;
  parentPhone?: string;
  classNumber?: number;
  branchId: string;
  directionId?: string;
  subjects?: string[];
  profileToken?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Group
export interface Group {
  _id: string;
  name: string;
  branchId: string;
  subjectId: string;
  teacherId: string;
  classNumber?: number;
  students?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Test
export interface Test {
  _id: string;
  name: string;
  branchId: string;
  createdBy: string;
  subjectId?: string;
  questions: Question[];
  totalQuestions: number;
  createdAt?: string;
  updatedAt?: string;
}

// Question
export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  subjectId?: string;
  points?: number;
}

// BlockTest
export interface BlockTest {
  _id: string;
  name: string;
  branchId: string;
  createdBy: string;
  classNumber: number;
  subjects: BlockTestSubject[];
  totalQuestions: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlockTestSubject {
  subjectId: string;
  subjectName?: string;
  questions: Question[];
  questionCount: number;
}

// Branch
export interface Branch {
  _id: string;
  name: string;
  address?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Subject
export interface Subject {
  _id: string;
  name: string;
  code?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Direction
export interface Direction {
  _id: string;
  name: string;
  subjects: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Assignment
export interface Assignment {
  _id: string;
  groupId: string;
  subjectId: string;
  title: string;
  description?: string;
  dueDate?: string;
  branchId: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

// TestResult
export interface TestResult {
  _id: string;
  studentId: string;
  testId?: string;
  blockTestId?: string;
  assignmentId?: string;
  answers: Record<string, string>;
  score: number;
  totalQuestions: number;
  percentage: number;
  branchId: string;
  createdAt?: string;
  updatedAt?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form Types
export interface LoginForm {
  username: string;
  password: string;
}

export interface CreateUserForm {
  username: string;
  password: string;
  role: UserRole;
  branchId?: string;
  fullName?: string;
  phone?: string;
  parentPhone?: string;
}

// Filter Types
export interface StudentFilter {
  classNumber?: number;
  directionId?: string;
  branchId?: string;
  search?: string;
}

export interface TestFilter {
  subjectId?: string;
  branchId?: string;
  createdBy?: string;
  search?: string;
}

// Statistics Types
export interface Statistics {
  totalStudents: number;
  totalGroups: number;
  totalTests: number;
  totalBlockTests: number;
  recentActivity?: ActivityLog[];
}

export interface ActivityLog {
  _id: string;
  studentId: string;
  action: string;
  details?: any;
  timestamp: string;
}
