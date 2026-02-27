import { QueryClient } from '@tanstack/react-query';

// Создаем QueryClient с оптимальными настройками
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные считаются свежими 1 минуту (увеличено)
      staleTime: 60000,
      
      // Кэш хранится 10 минут (увеличено)
      gcTime: 10 * 60 * 1000,
      
      // Автоматический retry при ошибках
      retry: 1, // Уменьшено с 2 до 1
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // ОТКЛЮЧАЕМ рефетч при фокусе окна (экономия ресурсов)
      refetchOnWindowFocus: false,
      
      // Не рефетчить при reconnect
      refetchOnReconnect: false,
      
      // Не рефетчить при mount если данные свежие
      refetchOnMount: false,
    },
    mutations: {
      // Retry для mutations
      retry: 1,
    },
  },
});
