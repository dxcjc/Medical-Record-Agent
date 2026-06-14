import type { FastifyInstance, FastifyReply } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import {
  type ApiRouteResponseObject,
  assertRouteResponseObject,
  assertRouteResponseObjectList,
  providerConfigRouteInputSchema,
  redactSensitiveRouteValue,
  type ProviderConfigRouteInput
} from "./route-dtos";

export interface SetDefaultProviderInput {
  key: string;
  actor: AuthContext;
}

export interface SaveProviderConfigInput {
  key: string;
  kind: ProviderConfigRouteInput["kind"];
  displayName: ProviderConfigRouteInput["displayName"];
  enabled: ProviderConfigRouteInput["enabled"];
  isDefault: ProviderConfigRouteInput["isDefault"];
  config: ProviderConfigRouteInput["config"];
  secretRefs?: ProviderConfigRouteInput["secretRefs"];
  actor: AuthContext;
}

export interface ProviderRouteService {
  listProviders(): Promise<ApiRouteResponseObject[]>;
  saveProviderConfig?(input: SaveProviderConfigInput): Promise<ApiRouteResponseObject>;
  setDefaultProvider(input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
  checkProviderHealth(input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
  deleteProvider?(input: SetDefaultProviderInput): Promise<{ deleted: boolean }>;
}

export interface ProviderRoutesDependencies {
  providerService: ProviderRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
}

type StructuredRouteError = {
  code?: unknown;
  statusCode?: unknown;
};

function readErrorStatus(error: StructuredRouteError) {
  return typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;
}

function readErrorCode(error: StructuredRouteError) {
  return typeof error.code === "string" && error.code.length > 0 ? error.code : "PROVIDER_ERROR";
}

async function sendStructuredProviderError(reply: FastifyReply, error: unknown) {
  const structured = error && typeof error === "object" ? (error as StructuredRouteError) : {};

  // 错误响应只返回稳定 code，不返回 Error.message，避免 secretRefs 明文被异常消息带出。
  return reply.status(readErrorStatus(structured)).send({
    error: readErrorCode(structured)
  });
}

/**
 * 注册 Provider 管理路由。
 * 路由层只解析 HTTP 参数、调用注入的 providerService，并统一做密钥响应脱敏；
 * provider 配置的持久化与默认值切换逻辑由上层注入的 service/repository 实现承接。
 */
export async function registerProviderRoutes(server: FastifyInstance, dependencies: ProviderRoutesDependencies) {
  const preHandler = [
    dependencies.authHooks.authenticate,
    dependencies.authHooks.requirePermission(PERMISSIONS.providerManage)
  ];

  server.get(
    "/providers",
    {
      preHandler
    },
    async () => {
      const providers = await dependencies.providerService.listProviders();

      return {
        items: redactSensitiveRouteValue(
          assertRouteResponseObjectList(providers, "PROVIDER_LIST_RESPONSE_INVALID")
        )
      };
    }
  );

  server.post(
    "/providers",
    {
      preHandler: [
        ...preHandler,
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "provider.create",
                objectType: "provider"
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const parsed = providerConfigRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid provider config payload"
        });
      }

      const body = request.body as Record<string, unknown>;
      const key = typeof body.key === 'string' && body.key.length > 0
        ? body.key
        : (typeof parsed.data.displayName === 'string'
          ? parsed.data.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
          : '');

      if (!key) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "key is required"
        });
      }

      try {
        if (!dependencies.providerService.saveProviderConfig) {
          throw Object.assign(new Error("PROVIDER_SAVE_NOT_SUPPORTED"), {
            code: "PROVIDER_SAVE_NOT_SUPPORTED",
            statusCode: 501
          });
        }

        const provider = await dependencies.providerService.saveProviderConfig({
          key,
          ...parsed.data,
          actor: request.auth as AuthContext
        });

        return reply.status(201).send({
          provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
        });
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );

  server.post(
    "/providers/:key/default",
    {
      preHandler: [
        ...preHandler,
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "provider.default.set",
                objectType: "provider",
                objectId: (request) => (request.params as { key?: string }).key
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { key: string };

      try {
        const provider = await dependencies.providerService.setDefaultProvider({
          key: params.key,
          actor: request.auth as AuthContext
        });

        return {
          provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
        };
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );

  server.put(
    "/providers/:key",
    {
      preHandler: [
        ...preHandler,
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "provider.config.save",
                objectType: "provider",
                objectId: (request) => (request.params as { key?: string }).key
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { key: string };
      const body = request.body as Record<string, unknown>;

      // Support partial update (toggle enabled): { enabled: boolean }
      const isToggleOnly = typeof body.enabled === 'boolean'
        && !body.kind && !body.displayName && !body.config;

      if (isToggleOnly) {
        // Toggle endpoint: PATCH-like behavior on PUT
        if (!dependencies.providerService.saveProviderConfig) {
          return reply.status(501).send({ error: "PROVIDER_SAVE_NOT_SUPPORTED" });
        }
        try {
          // Read existing provider to get required fields
          const allProviders = await dependencies.providerService.listProviders();
          const existing = allProviders.find((p: Record<string, unknown>) => p.key === params.key);
          if (!existing) {
            return reply.status(404).send({ error: "NOT_FOUND", message: "Provider not found" });
          }

          const provider = await dependencies.providerService.saveProviderConfig({
            key: params.key,
            kind: (existing.kind ?? "llm") as string,
            displayName: (existing.displayName ?? existing.key ?? params.key) as string,
            enabled: body.enabled as boolean,
            isDefault: (existing.isDefault ?? false) as boolean,
            config: (existing.config ?? {}) as Record<string, unknown>,
            secretRefs: (existing.secretRefs ?? {}) as Record<string, string>,
            actor: request.auth as AuthContext
          });
          return {
            provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
          };
        } catch (error) {
          return sendStructuredProviderError(reply, error);
        }
      }

      // Full update: validate with schema
      const parsed = providerConfigRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid provider config payload"
        });
      }

      try {
        if (!dependencies.providerService.saveProviderConfig) {
          throw Object.assign(new Error("PROVIDER_SAVE_NOT_SUPPORTED"), {
            code: "PROVIDER_SAVE_NOT_SUPPORTED",
            statusCode: 501
          });
        }

        const provider = await dependencies.providerService.saveProviderConfig({
          key: params.key,
          ...parsed.data,
          actor: request.auth as AuthContext
        });

        return {
          provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
        };
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );

  server.post(
    "/providers/:key/health",
    {
      preHandler: [
        ...preHandler,
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "provider.health.check",
                objectType: "provider",
                objectId: (request) => (request.params as { key?: string }).key
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { key: string };

      try {
        const health = await dependencies.providerService.checkProviderHealth({
          key: params.key,
          actor: request.auth as AuthContext
        });

        return {
          health: redactSensitiveRouteValue(assertRouteResponseObject(health, "PROVIDER_HEALTH_RESPONSE_INVALID"))
        };
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );

  server.delete(
    "/providers/:key",
    {
      preHandler: [
        ...preHandler,
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "provider.delete",
                objectType: "provider",
                objectId: (request) => (request.params as { key?: string }).key
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { key: string };

      try {
        if (!dependencies.providerService.deleteProvider) {
          throw Object.assign(new Error("PROVIDER_DELETE_NOT_SUPPORTED"), {
            code: "PROVIDER_DELETE_NOT_SUPPORTED",
            statusCode: 501
          });
        }

        const result = await dependencies.providerService.deleteProvider({
          key: params.key,
          actor: request.auth as AuthContext
        });

        return result;
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );
}
