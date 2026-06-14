import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import {
  assertRouteResponseObject,
  fileUploadRouteInputSchema,
  type ApiRouteResponseObject,
  type CreateFileUploadRouteInput
} from "./route-dtos";

export interface FileRouteService {
  createUpload(input: CreateFileUploadRouteInput): Promise<ApiRouteResponseObject>;
  getContent(id: string): Promise<{
    id: string;
    originalName: string;
    mimeType: string;
    body: Buffer;
  } | null>;
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
    async (request, reply) => {
      const parsed = fileUploadRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST",
          message: "Invalid file upload payload"
        });
      }

      const file = await dependencies.fileService.createUpload(parsed.data);

      return assertRouteResponseObject(file, "FILE_UPLOAD_RESPONSE_INVALID");
    }
  );

  server.get(
    "/files/:id/content",
    {
      preHandler: [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.jobRead),
        ...(dependencies.auditHooks
          ? [
              dependencies.auditHooks.audit({
                action: "file.download",
                objectType: "file",
                objectId: (request) => (request.params as { id?: string }).id
              })
            ]
          : [])
      ]
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const file = await dependencies.fileService.getContent(params.id);

      if (!file) {
        return reply.status(404).send({
          error: "FILE_NOT_FOUND"
        });
      }

      // 下载接口只返回受控存储中的字节内容；文件元数据用于响应头，不把底层 storageKey 或绝对路径暴露给调用方。
      // 清理控制字符（\r, \n, \t 等），防止 Content-Disposition header 注入。
      const safeName = file.originalName.replace(/[\x00-\x1f\x7f\\"]/g, "_");
      return reply
        .type(file.mimeType)
        .header("content-disposition", `attachment; filename="${encodeURIComponent(safeName)}"`)
        .send(file.body);
    }
  );
}
