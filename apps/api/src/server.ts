import Fastify from "fastify";
import cors from "@fastify/cors";

import type { AuthLayerService } from "./middleware/auth.middleware";
import { createAuthHooks } from "./middleware/auth.middleware";
import type { AuditRecorder } from "./middleware/audit.middleware";
import { createAuditHooks } from "./middleware/audit.middleware";
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
}

export interface ApiRuntimeInfo {
  serviceMode: string;
  providers: {
    ocr: string;
    llm: string;
    storage: string;
    writeback: string;
  };
}

export interface CreateApiServerOptions {
  services: ApiServerServices;
  logger?: boolean;
  runtimeInfo?: ApiRuntimeInfo;
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

/**
 * 创建完整 API server。这里保持依赖注入，便于测试、demo 和生产启动分别接入不同 provider。
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

  server.setErrorHandler((error, _request, reply) => {
    reply.status(readErrorStatus(error)).send({
      error: readErrorCode(error)
    });
  });

  await server.register(cors, {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowedHeaders: ["authorization", "content-type", "x-api-token"],
    methods: ["GET", "POST", "PUT", "OPTIONS"]
  });

  server.get("/health", async () => ({
    status: "ok",
    service: "medical-record-agent-api"
  }));

  server.get("/status", async () => ({
    status: "ok",
    service: "medical-record-agent-api",
    runtime:
      options.runtimeInfo ?? {
        serviceMode: "demo",
        providers: {
          ocr: "mock",
          llm: "mock",
          storage: "memory",
          writeback: "demo"
        }
      }
  }));

  await registerAuthRoutes(server, { authService: options.services.authService });
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
    auditHooks
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
