import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ruleCandidateApi } from '../api/client';
import type { RuleCandidateProposal, RuleCandidateStatus } from '../api/types';
import { toast } from '../components/GlobalToast';

export function useRuleCandidates(schemaKey: string | undefined, fieldKey: string | undefined) {
  return useQuery({
    queryKey: ['rule-candidates', schemaKey, fieldKey],
    queryFn: () => ruleCandidateApi.listByField(schemaKey!, fieldKey!),
    enabled: !!schemaKey && !!fieldKey,
    staleTime: 30_000,
  });
}

export function useReviewCandidate(schemaKey: string, fieldKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      status: RuleCandidateStatus;
      proposal?: RuleCandidateProposal;
      proposalHash?: string;
    }) => ruleCandidateApi.review(vars.id, {
      status: vars.status as 'accepted' | 'rejected' | 'skipped',
      proposal: vars.proposal,
      proposalHash: vars.proposalHash,
    }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['rule-candidates', schemaKey, fieldKey] });
      const messages: Record<string, string> = {
        accepted: '已接受，写入知识库',
        rejected: '已拒绝',
        skipped: '已跳过',
      };
      toast.success(messages[vars.status] ?? '操作完成');
    },
    onError: () => {
      // request 函数已自动 toast，这里无需重复
    },
  });
}

export function useExtractCandidates(schemaKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ruleCandidateApi.extract(schemaKey),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rule-candidates', schemaKey] });
      if (data.created === 0 && data.skipped === 0) {
        toast.info('无错误样本，未生成候选');
      } else {
        toast.success(`生成 ${data.created} 条候选${data.skipped > 0 ? `，跳过 ${data.skipped} 条重复` : ''}`);
      }
    },
  });
}
