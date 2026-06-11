import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import type { AuthLayerService } from "./middleware/auth.middleware";
import { createAuthHooks } from "./middleware/auth.middleware";
import type { AuditRecorder } from "./middleware/audit.middleware";
import { createAuditHooks } from "./middleware/audit.middleware";
import { registerSecurityHeaders } from "./middleware/security.middleware";
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
}

export interface ApiRateLimitRule {
  max: number;
  windowMs: number;
}

export interface ApiRateLimitOptions {
  login?: ApiRateLimitRule;
  writeback?: ApiRateLimitRule;
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
    "referrer-policy": "no-referrer",
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

function createFixedWindowRateLimiter(rule: ApiRateLimitRule, scope: string): preHandlerHookHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (request) => {
    const now = Date.now();
    const actor = request.auth?.actorUserId ?? request.auth?.actorApiTokenId;
    const key = `${scope}:${readRateLimitSource(request)}:${actor ?? "anonymous"}`;
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + rule.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > rule.max) {
      throw createRateLimitError(Math.ceil((bucket.resetAt - now) / 1000));
    }
  };
}

/**
 * 创建完整 API server。依赖注入，便于测试和生产启动。
 */
export async function createApiServer(options: CreateApiServerOptions) {
  const server = Fastify({
    logger: options.logger ?? false
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
  const loginRateLimit = createFixedWindowRateLimiter(rateLimitOptions.login, "auth.login");
  const writebackRateLimit = createFixedWindowRateLimiter(rateLimitOptions.writeback, "writeback.execute");

  server.addHook("onRequest", async (_request, reply) => {
    Object.entries(securityHeaders).forEach(([name, value]) => {
      reply.header(name, value);
    });
  });

  server.setErrorHandler((error, _request, reply) => {
    const retryAfter = readRateLimitRetryAfter(error);
    if (retryAfter !== undefined) {
      reply.header("retry-after", String(retryAfter));
    }

    reply.status(readErrorStatus(error)).send({
      error: readErrorCode(error)
    });
  });

  await server.register(cors, {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowedHeaders: ["authorization", "content-type", "x-api-token"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "OPTIONS"]
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

  // 先挂载审计 hook 工厂，后续 Task 13+ 可以给高风险路由添加更精细的 action/object 配置。
  server.decorate("auditHooks", auditHooks);

  return server;
}
