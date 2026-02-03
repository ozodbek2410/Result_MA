import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
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
  
  // Логируем только в development
  if (import.meta.env.DEV) {
    console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
  }
  
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Логируем только в development
    if (import.meta.env.DEV) {
      console.log('API Response:', response.config.url, response.status);
    }
    return response;
  },
  (error) => {
    // Не логируем 404 для student-test-configs как ошибку
    const is404ForConfigs = error.response?.status === 404 && 
                           error.config?.url?.includes('/student-test-configs/');
    
    if (!is404ForConfigs && import.meta.env.DEV) {
      console.error('API Error:', error.config?.url, error.response?.status, error.response?.data);
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
