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
  validateToken: () => boolean;
}

/** 解码 JWT payload（不做签名验证，仅读取 exp 等声明） */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload === 'object' && payload !== null ? payload : null;
  } catch {
    return null;
  }
}

/** 检查 token 是否过期（含 30s 缓冲） */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') {
    // 无法解析 exp → 视为过期
    return true;
  }
  // exp 是秒级 Unix 时间戳，提前 30s 视为过期
  return payload.exp * 1000 < Date.now() + 30_000;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
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
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }
    if (isTokenExpired(token)) {
      // token 已过期，清理状态并跳转登录
      clearToken();
      set({ isAuthenticated: false, user: null });
      window.location.href = '/login';
      return;
    }
    set({ isAuthenticated: true });
  },

  validateToken: () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return false;
    }
    if (isTokenExpired(token)) {
      clearToken();
      set({ isAuthenticated: false, user: null });
      return false;
    }
    return true;
  },
}));
