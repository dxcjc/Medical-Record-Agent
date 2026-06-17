-- AlterEnum
ALTER TYPE "RuleCandidateStatus" ADD VALUE 'skipped';

-- AlterTable
ALTER TABLE "RuleCandidate" ADD COLUMN     "proposalHash" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "RuleCandidate_schemaKey_fieldKey_proposalHash_idx" ON "RuleCandidate"("schemaKey", "fieldKey", "proposalHash");
