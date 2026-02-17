import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 daqiqa - PDF generation uchun
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  // Оптимизации
  maxRedirects: 5,
  maxContentLength: 50 * 1024 * 1024, // 50MB
  maxBodyLength: 50 * 1024 * 1024,
  // Включаем сжатие
  decompress: true,
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Не логируем 404 для student-test-configs и block-tests как ошибку
    const is404ForConfigs = error.response?.status === 404 && 
                           error.config?.url?.includes('/student-test-configs/');
    const is404ForBlockTests = error.response?.status === 404 && 
                              error.config?.url?.includes('/block-tests/');
    
    if (!is404ForConfigs && !is404ForBlockTests && import.meta.env.DEV) {
      const url = error.config?.url || 'unknown';
      const status = error.response?.status || 'no response';
      const data = error.response?.data || error.message || 'unknown error';
      console.error('API Error:', url, status, data);
    }
    
    // Редирект на логин только если пользователь уже был авторизован
    // И только если это НЕ запрос на /auth/login
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      const currentToken = useAuthStore.getState().token;
      // Только если токен был установлен (пользователь был залогинен)
      if (currentToken) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
