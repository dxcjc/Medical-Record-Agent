import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/client';

export function useAuditLog(take = 20) {
  return useQuery({
    queryKey: ['audit', take],
    queryFn: () => auditApi.list(take),
  });
}

export function usePaginatedAudit(params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  objectType?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['audit-paginated', params?.page, params?.pageSize, params?.action, params?.objectType, params?.startDate, params?.endDate],
    queryFn: () => auditApi.listPaginated(params),
  });
}
