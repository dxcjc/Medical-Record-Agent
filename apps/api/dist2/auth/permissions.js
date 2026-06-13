export const PERMISSIONS = {
    userManage: "user:manage",
    roleManage: "role:manage",
    schemaRead: "schema:read",
    schemaDraft: "schema:draft",
    schemaPublish: "schema:publish",
    jobCreate: "job:create",
    jobRead: "job:read",
    jobReview: "job:review",
    feedbackCreate: "feedback:create",
    feedbackReview: "feedback:review",
    providerManage: "provider:manage",
    writebackExecute: "writeback:execute",
    evaluationManage: "evaluation:manage",
    auditRead: "audit:read"
};
/**
 * 把高风险动作的权限检查集中命名，后续路由只调用语义化守卫。
 */
export function createPermissionGuard(authService) {
    return {
        requireSchemaPublish(context) {
            authService.requirePermission(context, PERMISSIONS.schemaPublish);
        },
        requireWritebackExecute(context) {
            authService.requirePermission(context, PERMISSIONS.writebackExecute);
        }
    };
}
//# sourceMappingURL=permissions.js.map