import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import {
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie
} from "../auth/session-cookie";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthRouteService {
  login(input: LoginInput): Promise<unknown>;
  invalidateSessionToken?(token: string): Promise<void>;
  /** 验证 JWT token（含签名验证） */
  verifySessionToken?(token: string): Promise<{ sub: string; permissions: string[]; roles: string[] } | null>;
  /** 签发新 JWT token */
  signSessionToken?(payload: { sub: string; permissions: string[]; roles: string[] }): Promise<string>;
}

export interface AuthRoutesDependencies {
  authService: AuthRouteService;
  rateLimit?: preHandlerHookHandler;
}

function isLoginInput(value: unknown): value is LoginInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Partial<LoginInput>;
  return typeof input.email === "string" && typeof input.password === "string";
}

function readAccessToken(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const accessToken = (payload as { accessToken?: unknown }).accessToken;
  return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
}

/**
 * 注册认证路由。
 * 路由层只负责解析 HTTP 入参和返回认证服务产出的 token payload，
 * 密码校验、JWT 签发等核心逻辑继续留在 auth service 中。
 */
export async function registerAuthRoutes(server: FastifyInstance, dependencies: AuthRoutesDependencies) {
  server.post(
    "/auth/login",
    {
      preHandler: dependencies.rateLimit ? [dependencies.rateLimit] : []
    },
    async (request, reply) => {
      if (!isLoginInput(request.body)) {
        return reply.status(400).send({
          error: "BAD_REQUEST"
        });
      }

      try {
        const payload = await dependencies.authService.login({
          email: request.body.email,
          password: request.body.password
        });
        const oldSessionToken = readSessionCookie(request.headers.cookie);
        if (oldSessionToken) {
          await dependencies.authService.invalidateSessionToken?.(oldSessionToken);
        }

        const accessToken = readAccessToken(payload);
        if (accessToken) {
          reply.header("set-cookie", serializeSessionCookie(accessToken));
        }

        return reply.send(payload);
      } catch (error: unknown) {
        const err = error as { code?: string; statusCode?: number; message?: string };
        const status = err.statusCode === 401 || err.code === "UNAUTHORIZED" || err.code === "INVALID_CREDENTIALS" ? 401
          : err.statusCode === 403 || err.code === "FORBIDDEN" ? 403
          : typeof err.statusCode === "number" ? err.statusCode
          : 500;
        return reply.status(status).send({
          error: err.code ?? "UNAUTHORIZED",
          message: err.message
        });
      }
    }
  );

  server.post("/auth/logout", async (request, reply) => {
    const sessionToken = readSessionCookie(request.headers.cookie);
    if (sessionToken) {
      await dependencies.authService.invalidateSessionToken?.(sessionToken);
    }

    reply.header("set-cookie", serializeClearedSessionCookie());
    return reply.send({ ok: true });
  });

  /**
   * Token 静默续期端点。
   * 前端在收到 401 后尝试调用此端点，用当前（可能已接近过期的）token 换取新 token。
   * 仅当后端实现了 verifySessionToken 和 signSessionToken 时才生效，
   * 否则返回 501 NOT_IMPLEMENTED，前端据此跳转登录页。
   */
  server.post("/auth/refresh", async (request, reply) => {
    if (!dependencies.authService.verifySessionToken || !dependencies.authService.signSessionToken) {
      return reply.status(501).send({ error: "NOT_IMPLEMENTED" });
    }

    // 从 Authorization header 或 cookie 读取 token
    const authHeader = request.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const tokenFromCookie = readSessionCookie(request.headers.cookie);
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return reply.status(401).send({ error: "NO_TOKEN" });
    }

    try {
      const payload = await dependencies.authService.verifySessionToken(token);
      if (!payload) {
        return reply.status(401).send({ error: "INVALID_TOKEN" });
      }

      const newAccessToken = await dependencies.authService.signSessionToken(payload);
      reply.header("set-cookie", serializeSessionCookie(newAccessToken));

      return reply.send({
        accessToken: newAccessToken,
        tokenType: "Bearer",
      });
    } catch {
      return reply.status(401).send({ error: "TOKEN_EXPIRED" });
    }
  });
}
