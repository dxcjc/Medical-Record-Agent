import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/client';

export function useFieldStats(schemaKey: string | undefined) {
  return useQuery({
    queryKey: ['fieldStats', schemaKey],
    queryFn: () => statsApi.getFieldStats(schemaKey!),
    enabled: !!schemaKey,
    staleTime: 60_000,
  });
}
