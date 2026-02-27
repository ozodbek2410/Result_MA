import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// Query keys для кэширования
export const blockTestKeys = {
  all: ['blockTests'] as const,
  lists: () => [...blockTestKeys.all, 'list'] as const,
  list: (filters?: string) => [...blockTestKeys.lists(), { filters }] as const,
  details: () => [...blockTestKeys.all, 'detail'] as const,
  detail: (id: string) => [...blockTestKeys.details(), id] as const,
};

// Hook для получения списка блок-тестов
export const useBlockTests = (fields: 'minimal' | 'full' = 'minimal') => {
  return useQuery({
    queryKey: blockTestKeys.list(fields),
    queryFn: async () => {
      const { data } = await api.get(`/block-tests?fields=${fields}&_t=${Date.now()}`);
      return data;
    },
    staleTime: 30000, // 30 секунд
  });
};

// Hook для получения одного блок-теста
export const useBlockTest = (id: string | undefined) => {
  return useQuery({
    queryKey: blockTestKeys.detail(id!),
    queryFn: async () => {
      const { data } = await api.get(`/block-tests/${id}`);
      return data;
    },
    enabled: !!id, // Запрос только если есть id
    staleTime: 60000, // 1 минута
  });
};

// Hook для создания блок-теста
export const useCreateBlockTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (blockTestData: any) => {
      const { data } = await api.post('/block-tests', blockTestData);
      return data;
    },
    onSuccess: async () => {
      console.log('✅ Block test created, refetching data...');
      await queryClient.refetchQueries({ queryKey: blockTestKeys.all });
      console.log('✅ Block tests list refreshed');
    },
  });
};

// Hook для импорта блок-теста
export const useImportBlockTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (importData: any) => {
      const { data } = await api.post('/block-tests/import/confirm', importData);
      return data;
    },
    onSuccess: async () => {
      console.log('✅ Block test imported, refetching data...');
      await queryClient.refetchQueries({ queryKey: blockTestKeys.all });
      console.log('✅ Block tests list refreshed');
    },
  });
};

// Hook для удаления блок-теста
export const useDeleteBlockTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('🗑️ Deleting block test:', id);
      await api.delete(`/block-tests/${id}`);
      console.log('✅ Block test deleted successfully');
    },
    onSuccess: async () => {
      console.log('🔄 Refetching block tests...');
      await queryClient.refetchQueries({ queryKey: blockTestKeys.all });
      console.log('✅ Block tests list refreshed');
    },
  });
};

// Hook для генерации вариантов
export const useGenerateVariants = () => {
  return useMutation({
    mutationFn: async ({ testId, studentIds }: { testId: string; studentIds: string[] }) => {
      const { data } = await api.post(`/block-tests/${testId}/generate-variants`, { studentIds });
      return data;
    },
  });
};
