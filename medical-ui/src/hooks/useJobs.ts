import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/client';
import type { RecognitionJob } from '../api/types';

export interface UseJobsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  schemaKey?: string;
  search?: string;
}

export function useJobs(limit = 50) {
  return useQuery({
    queryKey: ['jobs', limit],
    queryFn: () => jobsApi.list(limit),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}

export function usePaginatedJobs(params: UseJobsParams = {}) {
  const { page = 1, pageSize = 20, status, schemaKey, search } = params;
  return useQuery({
    queryKey: ['jobs', 'paginated', page, pageSize, status, schemaKey, search],
    queryFn: async () => {
      const res = await jobsApi.listPaginated({ page, pageSize, status, schemaKey, search });
      return {
        items: res.items,
        total: res.total ?? res.items.length,
        page: res.page ?? page,
        pageSize: res.pageSize ?? pageSize,
      };
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
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
