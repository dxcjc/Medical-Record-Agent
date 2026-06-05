import { AuditResult, PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuditRepository } from "./audit.repository";
import { createFileRepository } from "./file.repository";
import { createJobsRepository } from "./jobs.repository";
import { createResultsRepository } from "./results.repository";
import { createSchemaRepository } from "./schema.repository";
import { createUserRepository } from "./user.repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeIfDatabase = testDatabaseUrl ? describe : describe.skip;

let prisma: PrismaClient;

beforeAll(async () => {
  if (!testDatabaseUrl) {
    return;
  }

  // 集成测试使用调用方显式提供的测试库连接，不自动连接开发或生产库。
  // 如果使用 `prisma dev` 提供的 TCP 地址，建议在 URL 上加 `pgbouncer=true&connection_limit=1`，
  // 避免 Postgres 代理层复用连接时触发 prepared statement 名称冲突。
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl
      }
    }
  });

  await prisma.$connect();
});

describeIfDatabase("repositories with test database", () => {
  it("能够通过真实 Prisma Client 持久化并查询用户、文件、任务、结果、schema 和审计", async () => {
    const suffix = Date.now().toString(36);
    const email = `repo-${suffix}@example.local`;

    const role = await prisma.role.create({
      data: {
        name: `repo-role-${suffix}`,
        description: "仓库集成测试角色",
        permissions: ["job:create", "audit:read"]
      }
    });

    const user = await prisma.user.create({
      data: {
        email,
        displayName: "仓库集成测试用户",
        passwordHash: "hashed-password",
        roles: {
          connect: [{ id: role.id }]
        }
      }
    });

    const userRepository = createUserRepository(prisma);
    const authUser = await userRepository.findAuthByEmail(email);

    expect(authUser?.id).toBe(user.id);
    expect(authUser?.roles[0]?.name).toBe(role.name);
    expect(authUser).toHaveProperty("passwordHash", "hashed-password");

    const schemaRepository = createSchemaRepository(prisma);
    const schemaVersion = await schemaRepository.createVersion({
      schemaKey: `repo-schema-${suffix}`,
      version: 1,
      displayName: "仓库集成测试 Schema",
      definition: {
        key: "repo-schema",
        fields: []
      },
      changelog: "初始化仓库集成测试版本",
      publishedById: user.id
    });

    const activeSchema = await schemaRepository.findActiveVersionBySchemaKey(schemaVersion.schemaKey);
    expect(activeSchema?.id).toBe(schemaVersion.id);

    const fileRepository = createFileRepository(prisma);
    const storedFile = await fileRepository.create({
      storageKey: `repo/${suffix}/record.pdf`,
      originalName: "record.pdf",
      mimeType: "application/pdf",
      byteSize: BigInt(32),
      checksumSha256: `sha-${suffix}`,
      uploadedById: user.id
    });

    expect(Object.keys(storedFile)).not.toContain("localPath");

    const jobsRepository = createJobsRepository(prisma);
    const job = await jobsRepository.create({
      schemaKey: schemaVersion.schemaKey,
      schemaVersionId: schemaVersion.id,
      sourceFileId: storedFile.id,
      createdById: user.id,
      providerConfig: {
        ocr: "mock",
        llm: "mock"
      }
    });

    await jobsRepository.updateStatus({
      id: job.id,
      status: "completed",
      trace: [{ node: "finalize" }],
      warnings: []
    });

    const resultsRepository = createResultsRepository(prisma);
    const result = await resultsRepository.upsertByJobId({
      jobId: job.id,
      fields: [{ fieldKey: "clinicalDiagnosis", value: "DEMO_DIAGNOSIS_A" }],
      normalizedFields: { clinicalDiagnosis: "DEMO_DIAGNOSIS_A" },
      evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A" }],
      payload: { clinicalInfo: { clinicalDiagnosis: "DEMO_DIAGNOSIS_A" } },
      confidence: 0.96,
      reviewRequired: false
    });

    expect(result.jobId).toBe(job.id);

    const auditRepository = createAuditRepository(prisma);
    await auditRepository.create({
      actorUserId: user.id,
      action: "repository.integration",
      objectType: "recognition-result",
      objectId: result.id,
      result: AuditResult.success,
      metadata: {
        synthetic: true
      }
    });

    const auditLogs = await auditRepository.listRecent({
      actorUserId: user.id,
      action: "repository.integration",
      take: 5
    });

    expect(auditLogs.length).toBeGreaterThan(0);
  });
});
