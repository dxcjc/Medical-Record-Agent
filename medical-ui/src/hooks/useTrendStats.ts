import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/client';

export function useTrendStats(schemaKey?: string, days = 30) {
  return useQuery({
    queryKey: ['trend-stats', schemaKey, days],
    queryFn: () => statsApi.getTrendStats(schemaKey!, days),
    enabled: !!schemaKey,
  });
}
