import type { AuthContext } from "./auth.service";
export declare const PERMISSIONS: {
    readonly userManage: "user:manage";
    readonly roleManage: "role:manage";
    readonly schemaRead: "schema:read";
    readonly schemaDraft: "schema:draft";
    readonly schemaPublish: "schema:publish";
    readonly jobCreate: "job:create";
    readonly jobRead: "job:read";
    readonly jobReview: "job:review";
    readonly feedbackCreate: "feedback:create";
    readonly feedbackReview: "feedback:review";
    readonly providerManage: "provider:manage";
    readonly writebackExecute: "writeback:execute";
    readonly evaluationManage: "evaluation:manage";
    readonly auditRead: "audit:read";
};
export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export interface PermissionCheckService {
    requirePermission(context: AuthContext | null, permission: PermissionName): void;
}
/**
 * 把高风险动作的权限检查集中命名，后续路由只调用语义化守卫。
 */
export declare function createPermissionGuard(authService: PermissionCheckService): {
    requireSchemaPublish(context: AuthContext | null): void;
    requireWritebackExecute(context: AuthContext | null): void;
};
//# sourceMappingURL=permissions.d.ts.map