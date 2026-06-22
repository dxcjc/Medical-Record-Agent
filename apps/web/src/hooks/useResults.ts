import { useQuery } from '@tanstack/react-query';
import { resultsApi } from '../api/client';

export function useResult(jobId: string) {
  return useQuery({
    queryKey: ['result', jobId],
    queryFn: () => resultsApi.getByJob(jobId),
    enabled: !!jobId,
  });
}
