import type { PrismaClient, RuleCandidateStatus } from "@prisma/client";
import type {
  RuleCandidate,
  RuleCandidateProposal,
  RuleCandidateEvidence,
  RuleCandidateStatus as DomainStatus
} from "@medical-record-agent/shared";

type RuleCandidateRepositoryDependencies = Pick<PrismaClient, "ruleCandidate">;

export interface CreateRuleCandidateInput {
  schemaKey: string;
  fieldKey: string;
  ruleType: "correction" | "rule";
  proposal: RuleCandidateProposal;
  evidence: RuleCandidateEvidence[];
  proposalHash: string;
}

function mapToDomain(row: any): RuleCandidate {
  return {
    id: row.id,
    schemaKey: row.schemaKey,
    fieldKey: row.fieldKey,
    ruleType: row.ruleType,
    proposal: row.proposal,
    evidence: row.evidence ?? [],
    status: row.status as DomainStatus,
    proposalHash: row.proposalHash ?? null,
    createdAt: row.createdAt?.toISOString() ?? "",
    decidedAt: row.decidedAt?.toISOString() ?? null
  };
}

export function createRuleCandidateRepository(dependencies: RuleCandidateRepositoryDependencies) {
  return {
    async create(input: CreateRuleCandidateInput): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.create({
        data: {
          schemaKey: input.schemaKey,
          fieldKey: input.fieldKey,
          ruleType: input.ruleType,
          proposal: input.proposal as any,
          evidence: input.evidence as any,
          proposalHash: input.proposalHash,
          status: "proposed" as RuleCandidateStatus
        }
      });
      return mapToDomain(row);
    },

    async findByField(schemaKey: string, fieldKey: string, status?: DomainStatus): Promise<RuleCandidate[]> {
      const rows = await dependencies.ruleCandidate.findMany({
        where: {
          schemaKey,
          fieldKey,
          ...(status ? { status: status as RuleCandidateStatus } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return rows.map(mapToDomain);
    },

    async findBySchema(schemaKey: string, status?: DomainStatus): Promise<RuleCandidate[]> {
      const rows = await dependencies.ruleCandidate.findMany({
        where: {
          schemaKey,
          ...(status ? { status: status as RuleCandidateStatus } : {})
        },
        orderBy: { createdAt: "desc" }
      });
      return rows.map(mapToDomain);
    },

    async findById(id: string): Promise<RuleCandidate | null> {
      const row = await dependencies.ruleCandidate.findUnique({ where: { id } });
      return row ? mapToDomain(row) : null;
    },

    async existsSimilar(schemaKey: string, fieldKey: string, proposalHash: string): Promise<boolean> {
      const count = await dependencies.ruleCandidate.count({
        where: {
          schemaKey,
          fieldKey,
          proposalHash,
          status: { in: ["proposed", "skipped"] as RuleCandidateStatus[] }
        }
      });
      return count > 0;
    },

    async updateStatus(id: string, status: DomainStatus): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.update({
        where: { id },
        data: {
          status: status as RuleCandidateStatus,
          decidedAt: new Date()
        }
      });
      return mapToDomain(row);
    },

    async updateProposal(id: string, proposal: RuleCandidateProposal, proposalHash: string): Promise<RuleCandidate> {
      const row = await dependencies.ruleCandidate.update({
        where: { id },
        data: {
          proposal: proposal as any,
          proposalHash
        }
      });
      return mapToDomain(row);
    }
  };
}

export type RuleCandidateRepository = ReturnType<typeof createRuleCandidateRepository>;
