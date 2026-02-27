import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hook для автоматического обновления данных при возврате на страницу
 * Используется для обновления списков после создания/импорта
 * 
 * @param refetch - функция для обновления данных
 * 
 * @example
 * const { refetch } = useTests();
 * useRefreshOnReturn(refetch);
 */
export function useRefreshOnReturn(refetch: () => void) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.refresh) {
      console.log('🔄 Refreshing data after navigation...');
      refetch();
      // Очищаем state чтобы не перезагружать при следующем рендере
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, refetch, navigate, location.pathname]);
}
