import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

export interface AuthContext {
  actorUserId: string;
  actorApiTokenId?: string;
  authType: "jwt" | "api-token";
  permissions: string[];
  roles: string[];
}

export interface AuthLayerService {
  authenticateJwt(token: string): Promise<AuthContext>;
  authenticateApiToken(token: string): Promise<AuthContext>;
  requirePermission(context: AuthContext | null, permission: string): void;
}

export interface AuthHooksDependencies {
  authService: AuthLayerService;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

type AuthErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

function getAuthErrorCode(error: unknown): AuthErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "FORBIDDEN") {
      return "FORBIDDEN";
    }
  }

  return "UNAUTHORIZED";
}

async function sendAuthError(reply: FastifyReply, code: AuthErrorCode) {
  const statusCode = code === "FORBIDDEN" ? 403 : 401;
  await reply.status(statusCode).send({
    error: code
  });
}

function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function readApiToken(request: FastifyRequest) {
  const headerToken = request.headers["x-api-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    return headerToken;
  }

  const authorization = request.headers.authorization;
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "apitoken" || !token) {
    return null;
  }

  return token;
}

/**
 * 创建 Fastify 认证钩子。
 * 这里不直接实例化 auth service，而是只依赖 verifyJwt、verifyApiToken、requirePermission
 * 这类入口能力，方便后续主代理把真实服务实现接进来。
 */
export function createAuthHooks(dependencies: AuthHooksDependencies) {
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    const bearerToken = readBearerToken(request);
    const apiToken = readApiToken(request);

    if (!bearerToken && !apiToken) {
      await sendAuthError(reply, "UNAUTHORIZED");
      return;
    }

    try {
      request.auth = bearerToken
        ? await dependencies.authService.authenticateJwt(bearerToken)
        : await dependencies.authService.authenticateApiToken(apiToken as string);
    } catch (error) {
      await sendAuthError(reply, getAuthErrorCode(error));
    }
  };

  const requirePermission = (permission: string): preHandlerHookHandler => {
    return async (request, reply) => {
      try {
        dependencies.authService.requirePermission(request.auth ?? null, permission);
      } catch (error) {
        await sendAuthError(reply, getAuthErrorCode(error));
      }
    };
  };

  return {
    authenticate,
    requirePermission
  };
}
