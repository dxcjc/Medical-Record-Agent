import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuthHooks } from "../middleware/auth.middleware";
import { registerProviderRoutes } from "./providers.routes";
function createServer(authService, providerService) {
    const server = Fastify();
    const authHooks = createAuthHooks({ authService });
    return registerProviderRoutes(server, {
        providerService,
        authHooks
    }).then(() => server);
}
function createAuthorizedContext() {
    return {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["provider:manage"],
        roles: ["admin"]
    };
}
describe("provider routes", () => {
    it("GET /providers 未认证时返回 401 且不调用 provider 服务", async () => {
        const authService = {
            authenticateJwt: vi.fn(),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
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
        const context = {
            actorUserId: "user-002",
            authType: "jwt",
            permissions: ["evaluation:manage"],
            roles: ["operator"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn(() => {
                throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
            })
        };
        const providerService = {
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
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
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
    it("GET /providers 会深度脱敏 service 响应中的明文密钥、认证头和 Bearer 字符串", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(async () => [
                {
                    key: "http-ocr",
                    name: "HTTP OCR",
                    enabled: true,
                    config: {
                        endpoint: "https://ocr.example.test",
                        apiKey: "real-config-secret",
                        headers: {
                            Authorization: "Bearer real-authorization-token",
                            "x-api-token": "real-header-token",
                            region: "cn-test"
                        },
                        nested: {
                            clientSecret: "real-client-secret"
                        }
                    },
                    secretDiagnostics: {
                        apiKey: {
                            secretRef: "OCR_VENDOR_TOKEN",
                            resolved: true,
                            value: "resolved-ocr-secret"
                        }
                    },
                    message: "provider ready with Bearer real-message-token",
                    secretRefs: {
                        apiKey: "OCR_VENDOR_TOKEN"
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
                    key: "http-ocr",
                    name: "HTTP OCR",
                    enabled: true,
                    config: {
                        endpoint: "https://ocr.example.test",
                        apiKey: {
                            redacted: true
                        },
                        headers: {
                            Authorization: {
                                redacted: true
                            },
                            "x-api-token": {
                                redacted: true
                            },
                            region: "cn-test"
                        },
                        nested: {
                            clientSecret: {
                                redacted: true
                            }
                        }
                    },
                    secretDiagnostics: {
                        apiKey: {
                            secretRef: "OCR_VENDOR_TOKEN",
                            resolved: true,
                            value: {
                                redacted: true
                            }
                        }
                    },
                    message: "provider ready with [redacted]",
                    secretRefs: {
                        apiKey: {
                            configured: true
                        }
                    }
                }
            ]
        });
        expect(response.body).not.toContain("real-config-secret");
        expect(response.body).not.toContain("real-authorization-token");
        expect(response.body).not.toContain("real-header-token");
        expect(response.body).not.toContain("real-client-secret");
        expect(response.body).not.toContain("resolved-ocr-secret");
        expect(response.body).not.toContain("real-message-token");
    });
    it("POST /providers/:key/default 有权限时调用服务设置默认 provider", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
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
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
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
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
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
    it("POST /providers/:key/health 会脱敏 provider health 中的 resolved secret 和认证 header", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(),
            setDefaultProvider: vi.fn(),
            checkProviderHealth: vi.fn(async () => ({
                key: "http-ocr",
                status: "healthy",
                checkedAt: "2026-06-08T10:00:00.000Z",
                latencyMs: 88,
                probe: {
                    method: "HEAD",
                    url: "https://ocr.example.test/health",
                    headers: {
                        Authorization: "Bearer resolved-ocr-secret"
                    }
                },
                secretDiagnostics: {
                    apiKey: {
                        secretRef: "OCR_VENDOR_TOKEN",
                        resolved: true,
                        value: "resolved-ocr-secret"
                    }
                },
                secretRefs: {
                    apiKey: "OCR_VENDOR_TOKEN"
                }
            }))
        };
        const server = await createServer(authService, providerService);
        const response = await server.inject({
            method: "POST",
            url: "/providers/http-ocr/health",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            health: {
                key: "http-ocr",
                status: "healthy",
                checkedAt: "2026-06-08T10:00:00.000Z",
                latencyMs: 88,
                probe: {
                    method: "HEAD",
                    url: "https://ocr.example.test/health",
                    headers: {
                        Authorization: {
                            redacted: true
                        }
                    }
                },
                secretDiagnostics: {
                    apiKey: {
                        secretRef: "OCR_VENDOR_TOKEN",
                        resolved: true,
                        value: {
                            redacted: true
                        }
                    }
                },
                secretRefs: {
                    apiKey: {
                        configured: true
                    }
                }
            }
        });
        expect(response.body).not.toContain("resolved-ocr-secret");
    });
    it("PUT /providers/:key 有权限时保存 provider 配置并返回脱敏后的 secretRefs", async () => {
        const context = createAuthorizedContext();
        const authService = {
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
    it("PUT /providers/:key 只把 provider DTO 允许字段交给 service，剥离客户端伪造 actor/createdById 字段", async () => {
        const context = createAuthorizedContext();
        const authService = {
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
                displayName: "OpenAI Responses",
                enabled: true,
                isDefault: false,
                config: {},
                secretRefs: {
                    apiKey: "OPENAI_API_KEY"
                }
            })),
            checkProviderHealth: vi.fn()
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
                displayName: "OpenAI Responses",
                enabled: true,
                isDefault: false,
                config: {
                    model: "gpt-4.1-mini"
                },
                secretRefs: {
                    apiKey: "OPENAI_API_KEY"
                },
                actor: {
                    actorUserId: "client-spoof"
                },
                createdById: "client-spoof",
                health: {
                    status: "healthy"
                }
            }
        });
        expect(response.statusCode).toBe(200);
        expect(providerService.saveProviderConfig).toHaveBeenCalledWith({
            key: "openai-responses-prod",
            kind: "llm",
            displayName: "OpenAI Responses",
            enabled: true,
            isDefault: false,
            config: {
                model: "gpt-4.1-mini"
            },
            secretRefs: {
                apiKey: "OPENAI_API_KEY"
            },
            actor: context
        });
    });
    it("PUT /providers/:key 非法 DTO 返回 400 且不调用 service", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(),
            setDefaultProvider: vi.fn(),
            saveProviderConfig: vi.fn(),
            checkProviderHealth: vi.fn()
        };
        const server = await createServer(authService, providerService);
        const response = await server.inject({
            method: "PUT",
            url: "/providers/openai-responses-prod",
            headers: {
                authorization: "Bearer valid-jwt"
            },
            payload: {
                kind: "",
                displayName: 123,
                enabled: "yes",
                config: "not-object",
                secretRefs: "OPENAI_API_KEY"
            }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: "BAD_REQUEST",
            message: "Invalid provider config payload"
        });
        expect(providerService.saveProviderConfig).not.toHaveBeenCalled();
    });
    it("PUT /providers/:key 拒绝 config 中的明文密钥和 Authorization header", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(),
            setDefaultProvider: vi.fn(),
            saveProviderConfig: vi.fn(),
            checkProviderHealth: vi.fn()
        };
        const server = await createServer(authService, providerService);
        const apiKeyResponse = await server.inject({
            method: "PUT",
            url: "/providers/openai-responses-prod",
            headers: {
                authorization: "Bearer valid-jwt"
            },
            payload: {
                kind: "llm",
                displayName: "OpenAI Responses",
                config: {
                    model: "gpt-4.1-mini",
                    apiKey: "sk-real-secret"
                },
                secretRefs: {
                    apiKey: "OPENAI_API_KEY"
                }
            }
        });
        const authorizationHeaderResponse = await server.inject({
            method: "PUT",
            url: "/providers/http-ocr",
            headers: {
                authorization: "Bearer valid-jwt"
            },
            payload: {
                kind: "ocr",
                displayName: "HTTP OCR",
                config: {
                    endpoint: "https://ocr.example.test",
                    headers: {
                        Authorization: "Bearer real-ocr-token"
                    }
                },
                secretRefs: {
                    apiKey: "OCR_VENDOR_TOKEN"
                }
            }
        });
        expect(apiKeyResponse.statusCode).toBe(400);
        expect(authorizationHeaderResponse.statusCode).toBe(400);
        expect(providerService.saveProviderConfig).not.toHaveBeenCalled();
    });
    it("PUT /providers/:key 要求 secretRefs 为非空字符串引用", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(),
            setDefaultProvider: vi.fn(),
            saveProviderConfig: vi.fn(),
            checkProviderHealth: vi.fn()
        };
        const server = await createServer(authService, providerService);
        const objectRefResponse = await server.inject({
            method: "PUT",
            url: "/providers/openai-responses-prod",
            headers: {
                authorization: "Bearer valid-jwt"
            },
            payload: {
                kind: "llm",
                displayName: "OpenAI Responses",
                config: {
                    model: "gpt-4.1-mini"
                },
                secretRefs: {
                    apiKey: {
                        env: "OPENAI_API_KEY"
                    }
                }
            }
        });
        const emptyRefResponse = await server.inject({
            method: "PUT",
            url: "/providers/openai-responses-prod",
            headers: {
                authorization: "Bearer valid-jwt"
            },
            payload: {
                kind: "llm",
                displayName: "OpenAI Responses",
                config: {
                    model: "gpt-4.1-mini"
                },
                secretRefs: {
                    apiKey: ""
                }
            }
        });
        expect(objectRefResponse.statusCode).toBe(400);
        expect(emptyRefResponse.statusCode).toBe(400);
        expect(providerService.saveProviderConfig).not.toHaveBeenCalled();
    });
    it("provider 路由拒绝 service 返回 scalar 被包装成成功响应", async () => {
        const context = createAuthorizedContext();
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const providerService = {
            listProviders: vi.fn(async () => ["not-object"]),
            setDefaultProvider: vi.fn(async () => "not-object"),
            checkProviderHealth: vi.fn(async () => "not-object")
        };
        const server = await createServer(authService, providerService);
        const listResponse = await server.inject({
            method: "GET",
            url: "/providers",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        const defaultResponse = await server.inject({
            method: "POST",
            url: "/providers/mock/default",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        const healthResponse = await server.inject({
            method: "POST",
            url: "/providers/mock/health",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(listResponse.statusCode).toBe(500);
        expect(defaultResponse.statusCode).toBe(500);
        expect(healthResponse.statusCode).toBe(500);
    });
});
//# sourceMappingURL=providers.routes.test.js.map