import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  return useMutation({ mutationFn: () => logout() });
}
