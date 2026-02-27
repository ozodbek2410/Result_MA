/**
 * Централизованная обработка ошибок
 */

export interface AppError {
  message: string;
  code?: string;
  status?: number;
  details?: any;
}

/**
 * Обработка ошибок API
 */
export function handleApiError(error: any): AppError {
  // Axios error
  if (error.response) {
    return {
      message: error.response.data?.message || 'Xatolik yuz berdi',
      code: error.response.data?.code,
      status: error.response.status,
      details: error.response.data,
    };
  }

  // Network error
  if (error.request) {
    return {
      message: 'Tarmoq xatosi. Internetni tekshiring.',
      code: 'NETWORK_ERROR',
    };
  }

  // Other errors
  return {
    message: error.message || 'Noma\'lum xatolik',
    code: 'UNKNOWN_ERROR',
  };
}

/**
 * Логирование ошибок в development
 */
export function logError(error: any, context?: string) {
  if (import.meta.env.DEV) {
    console.error(`❌ Error${context ? ` in ${context}` : ''}:`, error);
  }
}

/**
 * Форматирование сообщения об ошибке для пользователя
 */
export function formatErrorMessage(error: any): string {
  const appError = handleApiError(error);
  return appError.message;
}
