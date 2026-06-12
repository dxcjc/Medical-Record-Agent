import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providersApi } from '../api/client';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list(),
  });
}

export function useProviderHealth(key: string, enabled = false) {
  return useQuery({
    queryKey: ['provider-health', key],
    queryFn: () => providersApi.health(key),
    enabled: enabled && !!key,
  });
}

export function useSetDefaultProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => providersApi.setDefault(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useCheckProviderHealth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => providersApi.health(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-health'] });
    },
  });
}
