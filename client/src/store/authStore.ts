import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  role: string; // Изменено на string для поддержки кастомных ролей
  branchId?: string;
  permissions?: string[];
  roleDisplayName?: string; // Добавлено для отображения названия роли
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      logout: () => {
        set({ user: null, token: null });
        // Redirect to landing page
        window.location.href = '/';
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
