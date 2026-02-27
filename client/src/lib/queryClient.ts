import { QueryClient } from '@tanstack/react-query';

// Создаем QueryClient с оптимальными настройками
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Данные считаются свежими 1 минуту (увеличено)
      staleTime: 0,

      gcTime: 5 * 60 * 1000,

      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      refetchOnWindowFocus: true,

      refetchOnReconnect: true,

      refetchOnMount: true,
    },
    mutations: {
      // Retry для mutations
      retry: 1,
    },
  },
});
