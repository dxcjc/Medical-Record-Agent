import { generateCandidates } from "@medical-record-agent/core";
import type { CandidateDraft, EvaluationSampleResult } from "@medical-record-agent/core";
import type { RuleCandidateRepository } from "../repositories/rule-candidate.repository";
import type { KnowledgeRepository } from "../repositories/knowledge.repository";
import type { RuleCandidateProposal, RuleCandidateStatus } from "@medical-record-agent/shared";

export interface RuleCandidateServiceDependencies {
  ruleCandidateRepository: RuleCandidateRepository;
  knowledgeRepository: KnowledgeRepository;
  evaluationRepository: {
    findRunById: (runId: string, actorUserId?: string) => Promise<any>;
    findLatestCompletedRunBySchema?: (schemaKey: string) => Promise<any>;
  };
}

export interface ReviewOptions {
  proposal?: RuleCandidateProposal;
  proposalHash?: string;
}

export interface ExtractResult {
  created: number;
  skipped: number;
}

export function createRuleCandidateService(deps: RuleCandidateServiceDependencies) {
  const { ruleCandidateRepository: repo, knowledgeRepository: knowledgeRepo, evaluationRepository: evalRepo } = deps;

  async function persistCandidates(drafts: CandidateDraft[], runId: string): Promise<ExtractResult> {
    let created = 0;
    let skipped = 0;
    for (const draft of drafts) {
      const evidence = draft.evidence.map(e => ({ ...e, runId }));
      const exists = await repo.existsSimilar(draft.schemaKey, draft.fieldKey, draft.proposalHash);
      if (exists) {
        skipped++;
        continue;
      }
      await repo.create({
        schemaKey: draft.schemaKey,
        fieldKey: draft.fieldKey,
        ruleType: draft.ruleType,
        proposal: draft.proposal,
        evidence,
        proposalHash: draft.proposalHash
      });
      created++;
    }
    return { created, skipped };
  }

  return {
    async extractFromRun(runId: string): Promise<ExtractResult> {
      const run = await evalRepo.findRunById(runId);
      if (!run) {
        throw Object.assign(new Error("EVALUATION_RUN_NOT_FOUND"), { code: "EVALUATION_RUN_NOT_FOUND", statusCode: 404 });
      }
      const sampleResults: EvaluationSampleResult[] = run.result?.sampleResults ?? [];
      const schemaKey: string = run.schemaVersion?.schemaKey ?? "";
      if (!schemaKey) {
        throw Object.assign(new Error("SCHEMA_KEY_MISSING"), { code: "SCHEMA_KEY_MISSING", statusCode: 400 });
      }
      const drafts = generateCandidates(sampleResults, schemaKey);
      return persistCandidates(drafts, runId);
    },

    async extractFromSchema(schemaKey: string): Promise<ExtractResult> {
      if (!evalRepo.findLatestCompletedRunBySchema) {
        throw Object.assign(new Error("NOT_SUPPORTED"), { code: "NOT_SUPPORTED", statusCode: 500 });
      }
      const run = await evalRepo.findLatestCompletedRunBySchema(schemaKey);
      if (!run) {
        return { created: 0, skipped: 0 };
      }
      const sampleResults: EvaluationSampleResult[] = run.result?.sampleResults ?? [];
      const drafts = generateCandidates(sampleResults, schemaKey);
      return persistCandidates(drafts, run.id);
    },

    async listByField(schemaKey: string, fieldKey: string, status?: RuleCandidateStatus) {
      return repo.findByField(schemaKey, fieldKey, status);
    },

    async review(candidateId: string, status: RuleCandidateStatus, options?: ReviewOptions) {
      const candidate = await repo.findById(candidateId);
      if (!candidate) {
        throw Object.assign(new Error("RULE_CANDIDATE_NOT_FOUND"), { code: "RULE_CANDIDATE_NOT_FOUND", statusCode: 404 });
      }

      // 编辑后接受：先更新 proposal
      if (options?.proposal && options?.proposalHash) {
        await repo.updateProposal(candidateId, options.proposal, options.proposalHash);
      }

      if (status === "accepted") {
        // 先标记为 accepted
        await repo.updateStatus(candidateId, "accepted");
        // 写入知识库
        try {
          const proposal = options?.proposal ?? candidate.proposal;
          const fieldKey = candidate.fieldKey;
          let title: string;
          let content: string;
          if (proposal.type === "correction") {
            title = `纠偏: ${fieldKey}`;
            content = `字段 "${fieldKey}" 从 "${proposal.originalValue}" 纠正为 "${proposal.correctedValue}"`;
          } else {
            title = `规则: ${fieldKey}`;
            content = `${proposal.condition}，期望值为 ${proposal.expectedValue}`;
          }
          await knowledgeRepo.create({
            kind: "field_description",
            title,
            content,
            keywords: [fieldKey],
            fieldKeys: [fieldKey],
            enabled: true,
            sortOrder: 0
          });
        } catch (err) {
          // 知识库写入失败，状态回滚
          await repo.updateStatus(candidateId, "proposed");
          throw Object.assign(new Error("KNOWLEDGE_WRITE_FAILED"), { code: "KNOWLEDGE_WRITE_FAILED", statusCode: 500 });
        }
        return repo.findById(candidateId);
      }

      // rejected / skipped：只更新状态
      return repo.updateStatus(candidateId, status);
    }
  };
}

export type RuleCandidateService = ReturnType<typeof createRuleCandidateService>;
