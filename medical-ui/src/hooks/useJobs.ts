import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/client';
import type { RecognitionJob } from '../api/types';

export function useJobs(limit = 50) {
  return useQuery({
    queryKey: ['jobs', limit],
    queryFn: () => jobsApi.list(limit),
    refetchInterval: 10000,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data as RecognitionJob | undefined;
      if (!job) return 5000;
      if (['queued', 'running'].includes(job.status)) return 3000;
      return false;
    },
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
