/**
 * Константы приложения
 * Централизованное хранение всех констант
 */

// API
export const API_TIMEOUT = 30000; // 30 секунд
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const STUDENTS_PER_PAGE = 50;
export const BATCH_SIZE = 10;

// Cache
export const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// UI
export const TOAST_DURATION = 3000; // 3 секунды
export const DEBOUNCE_DELAY = 300; // 300ms

// Roles
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FIL_ADMIN: 'FIL_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  MANAGER: 'MANAGER',
  METHODIST: 'METHODIST',
  OBSERVER: 'OBSERVER',
} as const;

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  TEACHER: '/teacher',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'token',
  USER_DATA: 'user',
  THEME: 'theme',
} as const;
