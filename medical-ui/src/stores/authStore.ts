import { create } from 'zustand';
import { authApi, setToken, clearToken } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login(email, password);
      setToken(res.accessToken);
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout errors
    }
    clearToken();
    set({ user: null, isAuthenticated: false });
  },

  restore: () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      set({ isAuthenticated: true });
    }
  },
}));
