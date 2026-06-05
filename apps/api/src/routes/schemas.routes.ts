import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";

export interface SchemaRouteService {
  listActive(): Promise<unknown[]>;
  createDraft(input: {
    schemaKey: string;
    displayName: string;
    definition: unknown;
    actor: AuthContext;
  }): Promise<unknown>;
  updateDraft(input: {
    id: string;
    definition: unknown;
    actor: AuthContext;
  }): Promise<unknown>;
  validateDraft(input: {
    id: string;
    definition: unknown;
    actor: AuthContext;
  }): Promise<unknown>;
  publishDraft(input: {
    id: string;
    changelog: string;
    actor: AuthContext;
  }): Promise<unknown>;
  deactivateVersion(input: {
    id: string;
    actor: AuthContext;
  }): Promise<unknown>;
  rollbackVersion(input: {
    id: string;
    actor: AuthContext;
  }): Promise<unknown>;
  compareVersions(input: {
    schemaKey: string;
    leftVersionId: string;
    rightVersionId: string;
    actor: AuthContext;
  }): Promise<unknown>;
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
      return {
        items: await dependencies.schemaService.listActive()
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
      const body = request.body as { schemaKey?: string; displayName?: string; definition?: unknown };
      const draft = await dependencies.schemaService.createDraft({
        schemaKey: body.schemaKey ?? "",
        displayName: body.displayName ?? "",
        definition: body.definition,
        actor: request.auth as AuthContext
      });

      return reply.status(201).send({ draft });
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
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as { definition?: unknown };
      const draft = await dependencies.schemaService.updateDraft({
        id: params.id,
        definition: body.definition,
        actor: request.auth as AuthContext
      });

      return { draft };
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
    async (request) => {
      const params = request.params as { id: string };
      const body = request.body as { definition?: unknown };
      const validation = await dependencies.schemaService.validateDraft({
        id: params.id,
        definition: body.definition,
        actor: request.auth as AuthContext
      });

      return { validation };
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
      const body = request.body as { changelog?: string };
      const version = await dependencies.schemaService.publishDraft({
        id: params.id,
        changelog: body.changelog ?? "",
        actor: request.auth as AuthContext
      });

      return reply.status(201).send({ version });
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

      return { version };
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

      return { version };
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
    async (request) => {
      const params = request.params as { schemaKey: string };
      const query = request.query as { left?: string; right?: string };
      const comparison = await dependencies.schemaService.compareVersions({
        schemaKey: params.schemaKey,
        leftVersionId: query.left ?? "",
        rightVersionId: query.right ?? "",
        actor: request.auth as AuthContext
      });

      return { comparison };
    }
  );
}
