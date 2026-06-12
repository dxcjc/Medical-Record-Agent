import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schemasApi } from '../api/client';

export function useSchemas() {
  return useQuery({
    queryKey: ['schemas'],
    queryFn: () => schemasApi.list(),
  });
}

export function useSchemaDrafts() {
  return useQuery({
    queryKey: ['schema-drafts'],
    queryFn: () => schemasApi.listDrafts(),
  });
}

export function useCreateSchemaDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schemasApi.createDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schema-drafts'] });
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
    },
  });
}

export function usePublishSchemaDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changelog }: { id: string; changelog?: string }) =>
      schemasApi.publishDraft(id, changelog),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
      queryClient.invalidateQueries({ queryKey: ['schema-drafts'] });
    },
  });
}

export function useDeactivateSchemaVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schemasApi.deactivateVersion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
    },
  });
}

export function useRollbackSchemaVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schemasApi.rollbackVersion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
    },
  });
}
