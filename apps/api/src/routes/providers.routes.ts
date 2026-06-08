import type { FastifyInstance, FastifyReply } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";

export interface SetDefaultProviderInput {
  key: string;
  actor: AuthContext;
}

export interface SaveProviderConfigInput {
  key: string;
  kind: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  config: unknown;
  secretRefs?: unknown;
  actor: AuthContext;
}

export interface ProviderRouteService {
  listProviders(): Promise<unknown[]>;
  saveProviderConfig?(input: SaveProviderConfigInput): Promise<unknown>;
  setDefaultProvider(input: SetDefaultProviderInput): Promise<unknown>;
  checkProviderHealth(input: SetDefaultProviderInput): Promise<unknown>;
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

function maskSecretRefs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSecretRefs(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(record)) {
    if (key === "secretRefs" && item && typeof item === "object" && !Array.isArray(item)) {
      output.secretRefs = Object.fromEntries(
        Object.entries(item as Record<string, unknown>).map(([secretKey, secretValue]) => [
          secretKey,
          {
            configured: Boolean(secretValue)
          }
        ])
      );
      continue;
    }

    output[key] = maskSecretRefs(item);
  }

  return output;
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
 * 路由层只解析 HTTP 参数、调用注入的 providerService，并统一做 secretRefs 脱敏；
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
        items: maskSecretRefs(providers)
      };
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
          provider: maskSecretRefs(provider)
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
      const body = request.body as {
        kind?: unknown;
        displayName?: unknown;
        enabled?: unknown;
        isDefault?: unknown;
        config?: unknown;
        secretRefs?: unknown;
      };

      try {
        if (!dependencies.providerService.saveProviderConfig) {
          throw Object.assign(new Error("PROVIDER_SAVE_NOT_SUPPORTED"), {
            code: "PROVIDER_SAVE_NOT_SUPPORTED",
            statusCode: 501
          });
        }

        const provider = await dependencies.providerService.saveProviderConfig({
          key: params.key,
          kind: typeof body.kind === "string" ? body.kind : "",
          displayName: typeof body.displayName === "string" ? body.displayName : "",
          enabled: body.enabled === true,
          isDefault: body.isDefault === true,
          config: body.config ?? {},
          secretRefs: body.secretRefs,
          actor: request.auth as AuthContext
        });

        return {
          provider: maskSecretRefs(provider)
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
          health: maskSecretRefs(health)
        };
      } catch (error) {
        return sendStructuredProviderError(reply, error);
      }
    }
  );
}
