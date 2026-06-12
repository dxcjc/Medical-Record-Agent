import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/client';

export function useAuditLog(take = 20) {
  return useQuery({
    queryKey: ['audit', take],
    queryFn: () => auditApi.list(take),
  });
}
