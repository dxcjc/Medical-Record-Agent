import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createAuthHooks, type AuthContext, type AuthLayerService } from "../middleware/auth.middleware";
import { registerProviderRoutes, type ProviderRouteService } from "./providers.routes";

function createServer(authService: AuthLayerService, providerService: ProviderRouteService) {
  const server = Fastify();
  const authHooks = createAuthHooks({ authService });

  return registerProviderRoutes(server, {
    providerService,
    authHooks
  }).then(() => server);
}

function createAuthorizedContext(): AuthContext {
  return {
    actorUserId: "user-001",
    authType: "jwt",
    permissions: ["provider:manage"],
    roles: ["admin"]
  };
}

describe("provider routes", () => {
  it("GET /providers 未认证时返回 401 且不调用 provider 服务", async () => {
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(),
      checkProviderHealth: vi.fn()
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "GET",
      url: "/providers"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "UNAUTHORIZED"
    });
    expect(providerService.listProviders).not.toHaveBeenCalled();
  });

  it("GET /providers 已认证但缺少 provider:manage 权限时返回 403", async () => {
    const context: AuthContext = {
      actorUserId: "user-002",
      authType: "jwt",
      permissions: ["evaluation:manage"],
      roles: ["operator"]
    };
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn(() => {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      })
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(),
      checkProviderHealth: vi.fn()
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "GET",
      url: "/providers",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(authService.requirePermission).toHaveBeenCalledWith(context, "provider:manage");
    expect(providerService.listProviders).not.toHaveBeenCalled();
  });

  it("GET /providers 有权限时返回 provider 列表并隐藏 secretRefs 真实值", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(async () => [
        {
          key: "openai",
          name: "OpenAI",
          isDefault: true,
          enabled: true,
          secretRefs: {
            apiKey: "real-openai-secret"
          }
        }
      ]),
      setDefaultProvider: vi.fn(),
      checkProviderHealth: vi.fn()
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "GET",
      url: "/providers",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          key: "openai",
          name: "OpenAI",
          isDefault: true,
          enabled: true,
          secretRefs: {
            apiKey: {
              configured: true
            }
          }
        }
      ]
    });
    expect(response.body).not.toContain("real-openai-secret");
  });

  it("POST /providers/:key/default 有权限时调用服务设置默认 provider", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(async () => ({
        key: "mock",
        isDefault: true
      })),
      checkProviderHealth: vi.fn()
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "POST",
      url: "/providers/mock/default",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(providerService.setDefaultProvider).toHaveBeenCalledWith({
      key: "mock",
      actor: context
    });
    expect(response.json()).toEqual({
      provider: {
        key: "mock",
        isDefault: true
      }
    });
  });

  it("POST /providers/:key/default 服务报错时返回结构化错误且不泄露 secretRefs", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(async () => {
        throw Object.assign(new Error("provider missing secret real-openai-secret"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404,
          secretRefs: {
            apiKey: "real-openai-secret"
          }
        });
      }),
      checkProviderHealth: vi.fn()
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "POST",
      url: "/providers/missing/default",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "PROVIDER_NOT_FOUND"
    });
    expect(response.body).not.toContain("real-openai-secret");
  });

  it("POST /providers/:key/health 有权限时调用健康检查并隐藏 secretRefs", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService: ProviderRouteService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(),
      checkProviderHealth: vi.fn(async () => ({
        key: "openai",
        status: "healthy",
        latencyMs: 123,
        checkedAt: "2026-06-08T10:00:00.000Z",
        message: "provider reachable",
        secretRefs: {
          apiKey: "real-openai-secret"
        }
      }))
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "POST",
      url: "/providers/openai/health",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(providerService.checkProviderHealth).toHaveBeenCalledWith({
      key: "openai",
      actor: context
    });
    expect(response.json()).toEqual({
      health: {
        key: "openai",
        status: "healthy",
        latencyMs: 123,
        checkedAt: "2026-06-08T10:00:00.000Z",
        message: "provider reachable",
        secretRefs: {
          apiKey: {
            configured: true
          }
        }
      }
    });
    expect(response.body).not.toContain("real-openai-secret");
  });

  it("PUT /providers/:key 有权限时保存 provider 配置并返回脱敏后的 secretRefs", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const providerService = {
      listProviders: vi.fn(),
      setDefaultProvider: vi.fn(),
      saveProviderConfig: vi.fn(async () => ({
        key: "openai-responses-prod",
        kind: "llm",
        displayName: "OpenAI Responses 生产模型",
        enabled: true,
        isDefault: true,
        config: {
          model: "gpt-4.1-mini",
          timeoutMs: 45000
        },
        secretRefs: {
          apiKey: "OPENAI_API_KEY"
        }
      })),
      checkProviderHealth: vi.fn()
    } as ProviderRouteService & {
      saveProviderConfig: ReturnType<typeof vi.fn>;
    };
    const server = await createServer(authService, providerService);

    const response = await server.inject({
      method: "PUT",
      url: "/providers/openai-responses-prod",
      headers: {
        authorization: "Bearer valid-jwt"
      },
      payload: {
        kind: "llm",
        displayName: "OpenAI Responses 生产模型",
        enabled: true,
        isDefault: true,
        config: {
          model: "gpt-4.1-mini",
          timeoutMs: 45000
        },
        secretRefs: {
          apiKey: "OPENAI_API_KEY"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(providerService.saveProviderConfig).toHaveBeenCalledWith({
      key: "openai-responses-prod",
      kind: "llm",
      displayName: "OpenAI Responses 生产模型",
      enabled: true,
      isDefault: true,
      config: {
        model: "gpt-4.1-mini",
        timeoutMs: 45000
      },
      secretRefs: {
        apiKey: "OPENAI_API_KEY"
      },
      actor: context
    });
    expect(response.json()).toEqual({
      provider: {
        key: "openai-responses-prod",
        kind: "llm",
        displayName: "OpenAI Responses 生产模型",
        enabled: true,
        isDefault: true,
        config: {
          model: "gpt-4.1-mini",
          timeoutMs: 45000
        },
        secretRefs: {
          apiKey: {
            configured: true
          }
        }
      }
    });
    expect(response.body).not.toContain("OPENAI_API_KEY");
  });
});
