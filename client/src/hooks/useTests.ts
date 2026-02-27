import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// Query keys
export const testKeys = {
  all: ['tests'] as const,
  lists: () => [...testKeys.all, 'list'] as const,
  list: (filters?: string) => [...testKeys.lists(), { filters }] as const,
  details: () => [...testKeys.all, 'detail'] as const,
  detail: (id: string) => [...testKeys.details(), id] as const,
};

// Hook для получения списка тестов
export const useTests = (fields: 'minimal' | 'full' = 'minimal') => {
  return useQuery({
    queryKey: testKeys.list(fields),
    queryFn: async () => {
      const { data } = await api.get(`/tests?fields=${fields}&_t=${Date.now()}`);
      return data;
    },
    staleTime: 30000,
  });
};

// Hook для получения одного теста
export const useTest = (id: string | undefined) => {
  return useQuery({
    queryKey: testKeys.detail(id!),
    queryFn: async () => {
      const { data } = await api.get(`/tests/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 60000,
  });
};

// Hook для создания теста
export const useCreateTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (testData: any) => {
      const { data } = await api.post('/tests', testData);
      return data;
    },
    onSuccess: async () => {
      console.log('✅ Test created, refetching data...');
      await queryClient.refetchQueries({ queryKey: testKeys.all });
      console.log('✅ Tests list refreshed');
    },
  });
};

// Hook для импорта теста
export const useImportTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (importData: any) => {
      const { data } = await api.post('/tests/import/confirm', importData);
      return data;
    },
    onSuccess: async () => {
      console.log('✅ Test imported, refetching data...');
      // Используем refetchQueries вместо invalidateQueries для немедленного обновления
      await queryClient.refetchQueries({ queryKey: testKeys.all });
      console.log('✅ Tests list refreshed');
    },
  });
};

// Hook для удаления теста
export const useDeleteTest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      console.log('🗑️ Deleting test:', id);
      await api.delete(`/tests/${id}`);
      console.log('✅ Test deleted successfully');
    },
    onSuccess: async () => {
      console.log('🔄 Refetching tests...');
      await queryClient.refetchQueries({ queryKey: testKeys.all });
      console.log('✅ Tests list refreshed');
    },
  });
};
