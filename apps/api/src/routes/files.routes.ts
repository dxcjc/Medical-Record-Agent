import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";

export interface FileRouteService {
  createUpload(input: unknown): Promise<unknown>;
}

export interface FileRoutesDependencies {
  fileService: FileRouteService;
  authHooks: ReturnType<typeof createAuthHooks>;
  auditHooks?: ReturnType<typeof createAuditHooks>;
}

/**
 * 注册文件上传元数据路由。
 * 这里用 job:create 权限保护入口，因为上传病历文件是创建识别任务的前置动作。
 */
export async function registerFileRoutes(server: FastifyInstance, dependencies: FileRoutesDependencies) {
  server.post(
    "/files",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobCreate),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "file.upload",
                objectType: "file"
              })
            ]
          : [])
      ]
    },
    async (request) => dependencies.fileService.createUpload(request.body)
  );
}
