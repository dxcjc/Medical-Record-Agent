import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS } from "../auth/permissions";
import { createSchemaService, SchemaServiceError, type SchemaServiceRepository } from "./schema.service";

const limsClinicalInfoSchema = {
  key: "lims-clinical-info",
  label: "LIMS 临床信息",
  version: "1.0.0",
  evidencePolicy: {
    required: true,
    minConfidence: 0.78,
    requireSourceText: true,
    requirePageReference: true
  },
  fields: [
    {
      key: "clinicalDiagnosis",
      label: "临床诊断",
      type: "string",
      comments: ["识别临床诊断原文。"],
      adapterHints: {
        limsTargetPath: "clinicalInfo.clinicalDiagnosis"
      }
    }
  ]
};

function createRepository(): SchemaServiceRepository {
  return {
    createDraft: vi.fn(async (input) => ({
      id: "draft-001",
      status: "draft",
      ...input
    })),
    findDraftById: vi.fn(async () => ({
      id: "draft-001",
      schemaKey: "lims-clinical-info",
      displayName: "LIMS 临床信息",
      definition: limsClinicalInfoSchema,
      status: "ready"
    })),
    updateDraftDefinition: vi.fn(async (input) => ({
      id: input.id,
      status: "draft",
      definition: input.definition
    })),
    updateDraftValidation: vi.fn(async (input) => ({
      id: input.id,
      status: input.status,
      validationReport: input.validationReport
    })),
    findActiveVersionBySchemaKey: vi.fn(async () => ({
      id: "version-001",
      schemaKey: "lims-clinical-info",
      version: 1,
      displayName: "LIMS 临床信息",
      definition: limsClinicalInfoSchema,
      status: "active"
    })),
    listActive: vi.fn(async () => ({
      items: [{
        id: "version-001",
        schemaKey: "lims-clinical-info",
        version: 1,
        displayName: "LIMS 临床信息",
        definition: limsClinicalInfoSchema,
        status: "active"
      }],
      total: 1,
      page: 1,
      pageSize: 50
    })),
    listAll: vi.fn(async () => ({
      items: [{
        id: "version-001",
        schemaKey: "lims-clinical-info",
        version: 1,
        displayName: "LIMS 临床信息",
        definition: limsClinicalInfoSchema,
        status: "active"
      }],
      total: 1,
      page: 1,
      pageSize: 50
    })),
    listVersions: vi.fn(async () => [
      {
        id: "version-002",
        schemaKey: "lims-clinical-info",
        version: 2,
        definition: {
          ...limsClinicalInfoSchema,
          version: "2.0.0"
        },
        status: "active"
      },
      {
        id: "version-001",
        schemaKey: "lims-clinical-info",
        version: 1,
        definition: limsClinicalInfoSchema,
        status: "inactive"
      }
    ]),
    createVersion: vi.fn(async (input) => ({
      id: "version-002",
      status: "active",
      ...input
    })),
    deactivateActiveVersions: vi.fn(async () => ({ count: 1 })),
    markDraftPublished: vi.fn(async (input) => ({
      id: input.id,
      status: "published",
      publishedVersionId: input.publishedVersionId
    })),
    setVersionStatus: vi.fn(async (input) => ({
      id: input.id,
      status: input.status
    })),
    findVersionById: vi.fn(async (id) => ({
      id,
      schemaKey: "lims-clinical-info",
      version: id === "version-001" ? 1 : 2,
      definition: limsClinicalInfoSchema,
      status: id === "version-001" ? "inactive" : "active"
    }))
  };
}

function createService(repository = createRepository(), permissions = [PERMISSIONS.schemaDraft, PERMISSIONS.schemaPublish]) {
  const audit = vi.fn(async () => undefined);
  const service = createSchemaService({
    repository,
    audit,
    now: () => new Date("2026-06-05T09:30:00.000Z")
  });
  const actor = {
    actorUserId: "user-001",
    authType: "jwt" as const,
    permissions,
    roles: ["schema-admin"]
  };

  return {
    service,
    repository,
    audit,
    actor
  };
}

describe("schema service", () => {
  it("创建和更新草稿需要 schema:draft 权限，并把更新后的草稿重置为 draft", async () => {
    const { service, repository, actor } = createService();

    await service.createDraft({
      schemaKey: "lims-clinical-info",
      displayName: "LIMS 临床信息",
      definition: limsClinicalInfoSchema,
      actor
    });
    await service.updateDraft({
      id: "draft-001",
      definition: limsClinicalInfoSchema,
      actor
    });

    expect(repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "lims-clinical-info",
        createdById: "user-001"
      })
    );
    expect(repository.updateDraftDefinition).toHaveBeenCalledWith({
      id: "draft-001",
      definition: limsClinicalInfoSchema,
      status: "draft",
      validationReport: {}
    });
  });

  it("校验无效草稿时保存 invalid 状态并阻止发布", async () => {
    const { service, repository, actor } = createService();
    const invalidDefinition = {
      key: "bad",
      label: "",
      version: "1.0.0",
      evidencePolicy: {
        required: true,
        minConfidence: 2,
        requireSourceText: true,
        requirePageReference: true
      },
      fields: []
    };

    const validation = await service.validateDraft({
      id: "draft-001",
      definition: invalidDefinition,
      actor
    });

    expect(validation.valid).toBe(false);
    expect(repository.updateDraftValidation).toHaveBeenCalledWith({
      id: "draft-001",
      status: "invalid",
      validationReport: validation
    });
    vi.mocked(repository.findDraftById).mockResolvedValueOnce({
      id: "draft-001",
      schemaKey: "bad",
      displayName: "无效 Schema",
      definition: invalidDefinition,
      status: "invalid"
    });

    await expect(
      service.publishDraft({
        id: "draft-001",
        changelog: "发布无效草稿",
        actor
      })
    ).rejects.toBeInstanceOf(SchemaServiceError);
  });

  it("发布有效草稿时停用旧 active 版本、创建新版本、标记草稿 published 并写审计", async () => {
    const { service, repository, audit, actor } = createService();

    const version = await service.publishDraft({
      id: "draft-001",
      changelog: "新增字段",
      actor
    });

    expect(repository.deactivateActiveVersions).toHaveBeenCalledWith("lims-clinical-info");
    expect(repository.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "lims-clinical-info",
        version: 2,
        changelog: "新增字段",
        publishedById: "user-001",
        status: "active"
      })
    );
    expect(repository.markDraftPublished).toHaveBeenCalledWith({
      id: "draft-001",
      publishedVersionId: "version-002"
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "schema.publish",
        objectType: "schema",
        objectId: "version-002",
        actorUserId: "user-001",
        result: "success"
      })
    );
    expect(version).toEqual(expect.objectContaining({ id: "version-002" }));
  });

  it("rollback 会停用当前 active 并重新激活目标版本，compare 返回字段差异", async () => {
    const { service, repository, audit, actor } = createService();

    await service.rollbackVersion({
      id: "version-001",
      actor
    });
    const comparison = await service.compareVersions({
      schemaKey: "lims-clinical-info",
      leftVersionId: "version-001",
      rightVersionId: "version-002",
      actor
    });

    expect(repository.deactivateActiveVersions).toHaveBeenCalledWith("lims-clinical-info");
    expect(repository.setVersionStatus).toHaveBeenCalledWith({
      id: "version-001",
      status: "active"
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "schema.rollback",
        objectType: "schema",
        objectId: "version-001"
      })
    );
    expect(comparison.changedVersion).toEqual({
      left: 1,
      right: 2
    });
  });

  it("缺少 schema publish 权限时拒绝发布并不写仓储", async () => {
    const { service, repository, actor } = createService(createRepository(), [PERMISSIONS.schemaDraft]);

    await expect(
      service.publishDraft({
        id: "draft-001",
        changelog: "权限不足",
        actor
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });

    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});
