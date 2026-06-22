import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providersApi } from '../api/client';
import type { ProviderKind } from '../api/types';

export interface CreateProviderPayload {
  key: string;
  kind: ProviderKind;
  displayName: string;
  enabled?: boolean;
  isDefault?: boolean;
  config?: Record<string, unknown>;
  secretRefs?: Record<string, string>;
}

export interface UpdateProviderPayload {
  displayName?: string;
  enabled?: boolean;
  isDefault?: boolean;
  config?: Record<string, unknown>;
  secretRefs?: Record<string, string>;
  [key: string]: unknown;
}

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

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProviderPayload) => providersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateProviderPayload }) =>
      providersApi.update(key, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => providersApi.delete(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}
