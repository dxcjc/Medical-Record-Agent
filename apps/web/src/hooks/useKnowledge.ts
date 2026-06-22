import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '../api/client';
import type { KnowledgeEntry } from '../api/types';

export function useKnowledgeList(filter?: { fieldKey?: string; kind?: string }) {
  return useQuery({
    queryKey: ['knowledge', filter?.fieldKey, filter?.kind],
    queryFn: () => knowledgeApi.list(filter),
    staleTime: 30_000,
  });
}

export function useCreateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<KnowledgeEntry>) => knowledgeApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useUpdateKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<KnowledgeEntry>) =>
      knowledgeApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}

export function useDeleteKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => knowledgeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
    },
  });
}
