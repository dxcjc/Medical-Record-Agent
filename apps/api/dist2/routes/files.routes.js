import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject, fileUploadRouteInputSchema } from "./route-dtos";
/**
 * 注册文件上传元数据路由。
 * 这里用 job:create 权限保护入口，因为上传病历文件是创建识别任务的前置动作。
 */
export async function registerFileRoutes(server, dependencies) {
    server.post("/files", {
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
    }, async (request, reply) => {
        const parsed = fileUploadRouteInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "Invalid file upload payload"
            });
        }
        const file = await dependencies.fileService.createUpload(parsed.data);
        return assertRouteResponseObject(file, "FILE_UPLOAD_RESPONSE_INVALID");
    });
    server.get("/files/:id/content", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.jobRead),
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "file.download",
                        objectType: "file",
                        objectId: (request) => request.params.id
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const params = request.params;
        const file = await dependencies.fileService.getContent(params.id);
        if (!file) {
            return reply.status(404).send({
                error: "FILE_NOT_FOUND"
            });
        }
        // 下载接口只返回受控存储中的字节内容；文件元数据用于响应头，不把底层 storageKey 或绝对路径暴露给调用方。
        return reply
            .type(file.mimeType)
            .header("content-disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`)
            .send(file.body);
    });
}
//# sourceMappingURL=files.routes.js.map