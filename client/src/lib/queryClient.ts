import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 минут - данные считаются свежими
      gcTime: 30 * 60 * 1000, // 30 минут - кэш хранится дольше
      retry: 2, // Увеличено количество попыток
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Не перезагружать при монтировании если данные свежие
      refetchOnReconnect: true, // Перезагрузить при восстановлении соединения
      networkMode: 'online', // Запросы только онлайн
    },
    mutations: {
      retry: 1,
      networkMode: 'online',
    },
  },
});
