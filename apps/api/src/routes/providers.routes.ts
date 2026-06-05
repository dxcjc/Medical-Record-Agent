import type { FastifyInstance, FastifyReply } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";

export interface SetDefaultProviderInput {
  key: string;
  actor: AuthContext;
}

export interface ProviderRouteService {
  listProviders(): Promise<unknown[]>;
  setDefaultProvider(input: SetDefaultProviderInput): Promise<unknown>;
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
}
