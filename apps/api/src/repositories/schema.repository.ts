import type {
  Prisma,
  PrismaClient,
  SchemaDraftStatus,
  SchemaVersionStatus
} from "@prisma/client";

type SchemaRepositoryDependencies = Pick<PrismaClient, "schemaDraft" | "schemaVersion">;

export interface CreateSchemaDraftInput {
  schemaKey: string;
  displayName: string;
  definition: Prisma.InputJsonValue;
  createdById?: string | null;
}

export interface UpdateSchemaDraftValidationInput {
  id: string;
  status: SchemaDraftStatus;
  validationReport: Prisma.InputJsonValue;
}

export interface UpdateSchemaDraftDefinitionInput {
  id: string;
  definition: Prisma.InputJsonValue;
  status: SchemaDraftStatus;
  validationReport: Prisma.InputJsonValue;
}

export interface CreateSchemaVersionInput {
  schemaKey: string;
  version: number;
  displayName: string;
  definition: Prisma.InputJsonValue;
  changelog: string;
  publishedById?: string | null;
  status?: SchemaVersionStatus;
}

/**
 * schema 仓库把草稿和发布版本的持久化集中在一起。
 * 这样后续 schema 在线编辑、校验、发布时可以共享同一套查询与写入入口。
 */
export function createSchemaRepository(dependencies: SchemaRepositoryDependencies) {
  return {
    async createDraft(input: CreateSchemaDraftInput) {
      return dependencies.schemaDraft.create({
        data: {
          schemaKey: input.schemaKey,
          displayName: input.displayName,
          definition: input.definition,
          createdById: input.createdById ?? null,
          status: "draft",
          validationReport: {}
        }
      });
    },

    async findDraftById(id: string) {
      return dependencies.schemaDraft.findUnique({
        where: { id }
      });
    },

    async updateDraftValidation(input: UpdateSchemaDraftValidationInput) {
      return dependencies.schemaDraft.update({
        where: { id: input.id },
        data: {
          status: input.status,
          validationReport: input.validationReport
        }
      });
    },

    async updateDraftDefinition(input: UpdateSchemaDraftDefinitionInput) {
      return dependencies.schemaDraft.update({
        where: { id: input.id },
        data: {
          definition: input.definition,
          status: input.status,
          validationReport: input.validationReport
        }
      });
    },

    async markDraftPublished(input: { id: string; publishedVersionId: string }) {
      return dependencies.schemaDraft.update({
        where: { id: input.id },
        data: {
          status: "published",
          publishedVersionId: input.publishedVersionId
        }
      });
    },

    async findActiveVersionBySchemaKey(schemaKey: string) {
      return dependencies.schemaVersion.findFirst({
        where: {
          schemaKey,
          status: "active"
        },
        orderBy: {
          version: "desc"
        }
      });
    },

    async listVersions(schemaKey: string) {
      return dependencies.schemaVersion.findMany({
        where: { schemaKey },
        orderBy: {
          version: "desc"
        }
      });
    },

    async findVersionById(id: string) {
      return dependencies.schemaVersion.findUnique({
        where: { id }
      });
    },

    async createVersion(input: CreateSchemaVersionInput) {
      return dependencies.schemaVersion.create({
        data: {
          schemaKey: input.schemaKey,
          version: input.version,
          displayName: input.displayName,
          status: input.status ?? "active",
          definition: input.definition,
          changelog: input.changelog,
          publishedById: input.publishedById ?? null
        }
      });
    },

    async deactivateActiveVersions(schemaKey: string) {
      return dependencies.schemaVersion.updateMany({
        where: {
          schemaKey,
          status: "active"
        },
        data: {
          status: "inactive"
        }
      });
    },

    async setVersionStatus(input: { id: string; status: SchemaVersionStatus }) {
      return dependencies.schemaVersion.update({
        where: { id: input.id },
        data: {
          status: input.status
        }
      });
    }
  };
}
