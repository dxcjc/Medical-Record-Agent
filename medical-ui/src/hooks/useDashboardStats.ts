import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/client';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => statsApi.getDashboard(),
    refetchInterval: 30000,
    retry: 1,
  });
}
