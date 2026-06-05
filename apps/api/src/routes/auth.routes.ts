import type { FastifyInstance } from "fastify";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthRouteService {
  login(input: LoginInput): Promise<unknown>;
}

export interface AuthRoutesDependencies {
  authService: AuthRouteService;
}

function isLoginInput(value: unknown): value is LoginInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Partial<LoginInput>;
  return typeof input.email === "string" && typeof input.password === "string";
}

/**
 * 注册认证路由。
 * 路由层只负责解析 HTTP 入参和返回认证服务产出的 token payload，
 * 密码校验、JWT 签发等核心逻辑继续留在 auth service 中。
 */
export async function registerAuthRoutes(server: FastifyInstance, dependencies: AuthRoutesDependencies) {
  server.post("/auth/login", async (request, reply) => {
    if (!isLoginInput(request.body)) {
      return reply.status(400).send({
        error: "BAD_REQUEST"
      });
    }

    const payload = await dependencies.authService.login({
      email: request.body.email,
      password: request.body.password
    });

    return reply.send(payload);
  });
}
