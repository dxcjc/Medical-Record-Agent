import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import {
  type ApiRouteResponseObject,
  assertRouteResponseObject,
  assertRouteResponseObjectList,
  compareSchemaVersionsQuerySchema,
  publishSchemaDraftRouteInputSchema,
  schemaDraftRouteInputSchema,
  updateSchemaDraftRouteInputSchema,
  type CreateSchemaDraftRouteInput,
  type UpdateSchemaDraftRouteInput
} from "./route-dtos";

export interface SchemaRouteService {
  listActive(input?: { page?: number; pageSize?: number }): Promise<ApiRouteResponseObject[]>;
  listAll?(input?: { page?: number; pageSize?: number }): Promise<ApiRouteResponseObject[]>;
  createDraft(input: CreateSchemaDraftRouteInput & {
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  updateDraft(input: UpdateSchemaDraftRouteInput & {
    id: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  validateDraft(input: UpdateSchemaDraftRouteInput & {
    id: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  publishDraft(input: {
    id: string;
    changelog: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  deactivateVersion(input: {
    id: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  activateVersion(input: {
    id: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  rollbackVersion(input: {
    id: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
  compareVersions(input: {
    schemaKey: string;
    leftVersionId: string;
    rightVersionId: string;
    actor: AuthContext;
  }): Promise<ApiRouteResponseObject>;
}

export interface SchemaRoutesDependencies {
  schemaService: SchemaRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
}

/**
 * 注册字段 schema 查询路由。
 * 第一版只暴露已发布/激活的 schema 列表，草稿、发布和回滚会在 Schema Studio 后续任务中扩展。
 */
export async function registerSchemaRoutes(server: FastifyInstance, dependencies: SchemaRoutesDependencies) {
  server.get(
    "/schemas",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaRead)
      ]
    },
    async () => {
      const listFn = dependencies.schemaService.listAll ?? dependencies.schemaService.listActive;
      return {
        items: assertRouteResponseObjectList(
          await listFn(),
          "SCHEMA_LIST_RESPONSE_INVALID"
        )
      };
    }
  );

  server.post(
    "/schemas/drafts",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaDraft)
      ]
    },
    async (request, reply) => {
      const parsed = schemaDraftRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid schema draft payload"
        });
      }

      const draft = await dependencies.schemaService.createDraft({
        ...parsed.data,
        actor: request.auth as AuthContext
      });

      return reply.status(201).send({
        draft: assertRouteResponseObject(draft, "SCHEMA_DRAFT_RESPONSE_INVALID")
      });
    }
  );

  server.put(
    "/schemas/drafts/:id",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaDraft)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = updateSchemaDraftRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid schema draft update payload"
        });
      }

      const draft = await dependencies.schemaService.updateDraft({
        id: params.id,
        ...parsed.data,
        actor: request.auth as AuthContext
      });

      return {
        draft: assertRouteResponseObject(draft, "SCHEMA_DRAFT_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/schemas/drafts/:id/validate",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaDraft)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = updateSchemaDraftRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid schema validation payload"
        });
      }

      const validation = await dependencies.schemaService.validateDraft({
        id: params.id,
        ...parsed.data,
        actor: request.auth as AuthContext
      });

      return {
        validation: assertRouteResponseObject(validation, "SCHEMA_VALIDATION_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/schemas/drafts/:id/publish",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaPublish)
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const parsed = publishSchemaDraftRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid schema publish payload"
        });
      }

      const version = await dependencies.schemaService.publishDraft({
        id: params.id,
        changelog: parsed.data.changelog ?? "",
        actor: request.auth as AuthContext
      });

      return reply.status(201).send({
        version: assertRouteResponseObject(version, "SCHEMA_VERSION_RESPONSE_INVALID")
      });
    }
  );

  server.post(
    "/schemas/versions/:id/deactivate",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaPublish)
      ]
    },
    async (request) => {
      const params = request.params as { id: string };
      const version = await dependencies.schemaService.deactivateVersion({
        id: params.id,
        actor: request.auth as AuthContext
      });

      return {
        version: assertRouteResponseObject(version, "SCHEMA_VERSION_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/schemas/versions/:id/activate",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaPublish)
      ]
    },
    async (request) => {
      const params = request.params as { id: string };
      const version = await dependencies.schemaService.activateVersion({
        id: params.id,
        actor: request.auth as AuthContext
      });

      return {
        version: assertRouteResponseObject(version, "SCHEMA_VERSION_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/schemas/versions/:id/rollback",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaPublish)
      ]
    },
    async (request) => {
      const params = request.params as { id: string };
      const version = await dependencies.schemaService.rollbackVersion({
        id: params.id,
        actor: request.auth as AuthContext
      });

      return {
        version: assertRouteResponseObject(version, "SCHEMA_VERSION_RESPONSE_INVALID")
      };
    }
  );

  server.get(
    "/schemas/:schemaKey/compare",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.schemaDraft)
      ]
    },
    async (request, reply) => {
      const params = request.params as { schemaKey: string };
      const parsed = compareSchemaVersionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid schema compare query"
        });
      }

      const comparison = await dependencies.schemaService.compareVersions({
        schemaKey: params.schemaKey,
        leftVersionId: parsed.data.left,
        rightVersionId: parsed.data.right,
        actor: request.auth as AuthContext
      });

      return {
        comparison: assertRouteResponseObject(comparison, "SCHEMA_COMPARE_RESPONSE_INVALID")
      };
    }
  );
}
