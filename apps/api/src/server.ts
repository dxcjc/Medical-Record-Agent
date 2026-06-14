import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import type { AuthLayerService } from "./middleware/auth.middleware";
import { createAuthHooks } from "./middleware/auth.middleware";
import type { AuditRecorder } from "./middleware/audit.middleware";
import { createAuditHooks } from "./middleware/audit.middleware";
import { registerSecurityHeaders } from "./middleware/security.middleware";
import { handlePrismaError } from "./middleware/prisma-error.middleware";
import { registerAuditRoutes, type AuditRouteService } from "./routes/audit.routes";
import { registerAuthRoutes, type AuthRouteService } from "./routes/auth.routes";
import { registerEvaluationRoutes, type EvaluationRouteService } from "./routes/evaluation.routes";
import { registerFeedbackRoutes, type FeedbackRouteService } from "./routes/feedback.routes";
import { registerFileRoutes, type FileRouteService } from "./routes/files.routes";
import { registerJobRoutes, type JobRouteService } from "./routes/jobs.routes";
import { registerProviderRoutes, type ProviderRouteService } from "./routes/providers.routes";
import { registerResultRoutes, type ResultRouteService } from "./routes/results.routes";
import { registerSchemaRoutes, type SchemaRouteService } from "./routes/schemas.routes";
import { registerWritebackRoutes, type WritebackRouteService } from "./routes/writeback.routes";
import { registerKnowledgeRoutes, type KnowledgeRouteService } from "./routes/knowledge.routes";
import { registerV1Routes, type V1RouteService } from "./routes/v1.routes";
import { registerStatsRoutes, type StatsRouteService } from "./routes/stats.routes";
import { openApiDocument } from "./openapi";

export interface ApiServerServices {
  authService: AuthLayerService & AuthRouteService;
  auditService: AuditRouteService & {
    record: AuditRecorder;
  };
  schemaService: SchemaRouteService;
  fileService: FileRouteService;
  jobService: JobRouteService;
  resultService: ResultRouteService;
  feedbackService: FeedbackRouteService;
  writebackService: WritebackRouteService;
  providerService: ProviderRouteService;
  evaluationService: EvaluationRouteService;
  knowledgeService?: KnowledgeRouteService;
  statsService?: StatsRouteService;
  v1Service?: V1RouteService;
  jobQueue?: {
    drain(): Promise<void>;
    describe?(): unknown;
  };
}

export interface ApiRuntimeInfo {
  serviceMode: string;
  providers: {
    ocr: string;
    llm: string;
    storage: string;
    writeback: string;
  };
  secretResolver?: unknown;
  sessionInvalidationStore?: unknown;
  queue?: unknown;
}

export interface CreateApiServerOptions {
  services: ApiServerServices;
  logger?: boolean;
  runtimeInfo?: ApiRuntimeInfo;
  rateLimit?: ApiRateLimitOptions;
  rateLimitStore?: RateLimitStore;
}

export interface ApiRateLimitRule {
  max: number;
  windowMs: number;
}

export interface ApiRateLimitOptions {
  login?: ApiRateLimitRule;
  writeback?: ApiRateLimitRule;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export interface RedisRateLimitClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  pttl(key: string): Promise<number>;
}

const defaultRateLimitOptions: Required<ApiRateLimitOptions> = {
  login: {
    max: 20,
    windowMs: 60_000
  },
  writeback: {
    max: 30,
    windowMs: 60_000
  }
};

export function createMemoryRateLimitStore(): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async increment(key: string, windowMs: number) {
      const now = Date.now();
      const current = buckets.get(key);
      const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);

      return { count: bucket.count, resetAt: bucket.resetAt };
    }
  };
}

export function createRedisRateLimitStore(client: RedisRateLimitClient): RateLimitStore {
  return {
    async increment(key: string, windowMs: number) {
      const count = await client.incr(key);
      const ttlMs = await client.pttl(key);

      if (ttlMs < 0) {
        const windowSeconds = Math.ceil(windowMs / 1000);
        await client.expire(key, windowSeconds);
        return { count, resetAt: Date.now() + windowMs };
      }

      return { count, resetAt: Date.now() + ttlMs };
    }
  };
}

function readErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 600) {
      return statusCode;
    }
  }

  return 500;
}

function readErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }

  return "INTERNAL_ERROR";
}

function createSecurityHeaders() {
  return {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    // referrer-policy managed by security.middleware.ts
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "cross-origin-resource-policy": "same-site"
  };
}

function createRateLimitError(retryAfterSeconds: number) {
  return Object.assign(new Error("RATE_LIMITED"), {
    code: "RATE_LIMITED",
    statusCode: 429,
    retryAfterSeconds
  });
}

function readRateLimitRetryAfter(error: unknown) {
  if (error && typeof error === "object" && "retryAfterSeconds" in error) {
    const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.ceil(value);
    }
  }

  return undefined;
}

function readRateLimitSource(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() || request.ip;
  }

  return request.ip;
}

function createFixedWindowRateLimiter(rule: ApiRateLimitRule, scope: string, store?: RateLimitStore): preHandlerHookHandler {
  const memoryStore = store ?? createMemoryRateLimitStore();

  return async (request) => {
    const actor = request.auth?.actorUserId ?? request.auth?.actorApiTokenId;
    const key = `${scope}:${readRateLimitSource(request)}:${actor ?? "anonymous"}`;
    const { count, resetAt } = await memoryStore.increment(key, rule.windowMs);

    if (count > rule.max) {
      throw createRateLimitError(Math.ceil((resetAt - Date.now()) / 1000));
    }
  };
}

/**
 * 创建完整 API server。依赖注入，便于测试和生产启动。
 */
export async function createApiServer(options: CreateApiServerOptions) {
  const server = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 104857600 // 100MB
  });
  const authHooks = createAuthHooks({
    authService: options.services.authService
  });
  const auditHooks = createAuditHooks({
    recordAudit: options.services.auditService.record
  });
  const securityHeaders = createSecurityHeaders();
  const rateLimitOptions = {
    ...defaultRateLimitOptions,
    ...(options.rateLimit ?? {})
  };
  const rateLimitStore = options.rateLimitStore;
  const loginRateLimit = createFixedWindowRateLimiter(rateLimitOptions.login, "auth.login", rateLimitStore);
  const writebackRateLimit = createFixedWindowRateLimiter(rateLimitOptions.writeback, "writeback.execute", rateLimitStore);

  server.addHook("onRequest", async (_request, reply) => {
    Object.entries(securityHeaders).forEach(([name, value]) => {
      reply.header(name, value);
    });
  });

  server.setErrorHandler((error, _request, reply) => {
    // Prisma 数据库错误优先处理
    const prismaHttpError = handlePrismaError(error);
    if (prismaHttpError !== null) {
      reply.status(prismaHttpError.statusCode).send({
        error: prismaHttpError.code,
        message: prismaHttpError.message
      });
      return;
    }

    const retryAfter = readRateLimitRetryAfter(error);
    if (retryAfter !== undefined) {
      reply.header("retry-after", String(retryAfter));
    }

    reply.status(readErrorStatus(error)).send({
      error: readErrorCode(error)
    });
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

  await server.register(cors, {
    origin: corsOrigins,
    allowedHeaders: ["authorization", "content-type", "x-api-token"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  // Swagger / OpenAPI 文档
  await server.register(swagger, {
    openapi: openApiDocument as any
  });
  await server.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list" as const,
      deepLinking: true
    }
  });

  await registerSecurityHeaders(server);

  server.get("/health", async () => ({
    status: "ok",
    service: "medical-record-agent-api"
  }));

  server.get("/status", async () => {
    const runtime = options.runtimeInfo;
    if (!runtime) {
      throw new Error("runtimeInfo is required");
    }
    const queue = options.services.jobQueue?.describe?.();
    const sessionInvalidationStore =
      runtime.sessionInvalidationStore ?? options.services.authService.describeSessionInvalidationStore?.();
    const runtimeWithSession =
      sessionInvalidationStore === undefined ? runtime : { ...runtime, sessionInvalidationStore };

    return {
      status: "ok",
      service: "medical-record-agent-api",
      runtime: queue === undefined ? runtimeWithSession : { ...runtimeWithSession, queue }
    };
  });

  await registerAuthRoutes(server, {
    authService: options.services.authService,
    rateLimit: loginRateLimit
  });
  await registerAuditRoutes(server, {
    auditService: options.services.auditService,
    authHooks
  });

  await registerSchemaRoutes(server, {
    schemaService: options.services.schemaService,
    authHooks
  });
  await registerFileRoutes(server, {
    fileService: options.services.fileService,
    authHooks,
    auditHooks
  });
  await registerJobRoutes(server, {
    jobService: options.services.jobService,
    authHooks
  });
  await registerResultRoutes(server, {
    resultService: options.services.resultService,
    authHooks,
    auditHooks
  });
  await registerFeedbackRoutes(server, {
    feedbackService: options.services.feedbackService,
    authHooks,
    auditHooks
  });
  await registerWritebackRoutes(server, {
    writebackService: options.services.writebackService,
    jobService: options.services.jobService,
    authHooks,
    auditHooks,
    rateLimit: writebackRateLimit
  });
  await registerProviderRoutes(server, {
    providerService: options.services.providerService,
    authHooks,
    auditHooks
  });

  await registerEvaluationRoutes(server, {
    evaluationService: options.services.evaluationService,
    authHooks
  });

  if (options.services.knowledgeService) {
    await registerKnowledgeRoutes(server, options.services.knowledgeService, authHooks);
  }

  if (options.services.statsService) {
    await registerStatsRoutes(server, options.services.statsService, authHooks);
  }

  if (options.services.v1Service) {
    await registerV1Routes(server, {
      v1Service: options.services.v1Service,
      authHooks
    });
  }

  // 先挂载审计 hook 工厂，后续 Task 13+ 可以给高风险路由添加更精细的 action/object 配置。
  server.decorate("auditHooks", auditHooks);

  return server;
}
