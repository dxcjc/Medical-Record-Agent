import { Alert, Button, Card, Select, Space, Tag } from "@arco-design/web-react";
import { AppIcon, commonUiIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../../icons/appIcons";
import type { FlowState, SchemaRecord, SchemaVersion } from "./schemaStudioData";

type ApiActionState = {
  isRunning: boolean;
  message: string;
  error: string;
};

type SchemaFlowPanelProps = {
  schema: SchemaRecord;
  versions: SchemaVersion[];
  canPublish: boolean;
  flowState: FlowState;
  actionState: {
    publish: ApiActionState;
    compare: ApiActionState;
    deactivate: ApiActionState;
    rollback: ApiActionState;
  };
  onPublish: () => void;
  onDeactivate: () => void;
  onRollbackTargetChange: (version: string) => void;
  onRollback: () => void;
  onCompareBaseChange: (version: string) => void;
  onCompare: () => void;
};

export function SchemaFlowPanel({
  schema,
  versions,
  canPublish,
  flowState,
  actionState,
  onPublish,
  onDeactivate,
  onRollbackTargetChange,
  onRollback,
  onCompareBaseChange,
  onCompare
}: SchemaFlowPanelProps) {
  const archivedVersions = versions.filter((version) => version.status !== "draft");
  const rollbackOptions = archivedVersions.length > 0 ? archivedVersions : versions;

  return (
    <Card className="panel studio-panel" aria-labelledby="schema-flow-title" data-guide="schema-publish">
      <div className="toolbar">
        <div>
          <h2 id="schema-flow-title">发布与变更流</h2>
          <p>管理 publish、deactivate、rollback、compare 的操作状态。</p>
        </div>
        <Tag color={canPublish ? "green" : "orange"} className={`status-pill ${canPublish ? "status-success" : "status-warning"}`}>
          {canPublish ? "具备发布权限" : "缺少 schema:publish"}
        </Tag>
      </div>

      <Alert
        type="warning"
        showIcon
        title="生产影响 warning"
        content={`${schema.name} 当前影响 ${schema.affectedPipelines.join("、")}。停用风险为${schema.deactivationRisk}，发布前需确认 adapter 兼容与回滚窗口。`}
      />

      <div className="metric-grid">
        <Card className="metric-card">
          <div className="toolbar">
            <AppIcon icon={navigationIcons.brand} tone="green" tile />
            <Tag color={flowState.publishRequested ? "green" : "gray"}>{flowState.publishRequested ? "已请求" : "未请求"}</Tag>
          </div>
          <h3>Publish</h3>
          <p>草稿 {schema.draftVersion} 发布为生产版本。</p>
          <Button
            type="primary"
            onClick={onPublish}
            disabled={!canPublish || actionState.publish.isRunning}
            title={canPublish ? "发布草稿" : "当前登录账号缺少 schema:publish 权限"}
            loading={actionState.publish.isRunning}
            icon={actionState.publish.isRunning ? <AppIcon icon={commonUiIcons.loading} size="sm" /> : <AppIcon icon={navigationIcons.brand} size="sm" />}
          >
            {actionState.publish.isRunning ? "发布中" : "发布"}
          </Button>
          {actionState.publish.error ? (
            <p className="form-error" role="alert">
              发布失败：{actionState.publish.error}
            </p>
          ) : null}
          {actionState.publish.message ? (
            <p>{actionState.publish.message}</p>
          ) : null}
        </Card>

        <Card className="metric-card">
          <div className="toolbar">
            <AppIcon icon={statusIcons.danger} tone="red" tile />
            <Tag color={flowState.deactivateRequested ? "orange" : "gray"}>{flowState.deactivateRequested ? "已进入审批" : "待评估"}</Tag>
          </div>
          <h3>Deactivate</h3>
          <p>停用后生产管道将不再引用此 Schema。</p>
          <Button
            status="danger"
            onClick={onDeactivate}
            disabled={actionState.deactivate.isRunning}
            loading={actionState.deactivate.isRunning}
            icon={<AppIcon icon={statusIcons.danger} size="sm" />}
          >
            {actionState.deactivate.isRunning ? "停用中" : "停用"}
          </Button>
          {actionState.deactivate.error ? (
            <p className="form-error" role="alert">
              停用失败：{actionState.deactivate.error}
            </p>
          ) : null}
          {actionState.deactivate.message ? <p>{actionState.deactivate.message}</p> : null}
        </Card>

        <Card className="metric-card">
          <div className="toolbar">
            <AppIcon icon={dashboardMetricIcons.rollback} tone="orange" tile />
            <Tag color="orange">{flowState.rollbackTarget}</Tag>
          </div>
          <h3>Rollback</h3>
          <p>选择最近稳定版本作为回滚目标。</p>
          <Select
            value={flowState.rollbackTarget}
            onChange={(value) => onRollbackTargetChange(String(value))}
            disabled={actionState.rollback.isRunning}
          >
            {rollbackOptions.map((version) => (
              <Select.Option key={version.id} value={version.version}>
                {version.version}
              </Select.Option>
            ))}
          </Select>
          <Button
            status="danger"
            onClick={onRollback}
            disabled={actionState.rollback.isRunning}
            loading={actionState.rollback.isRunning}
            icon={<AppIcon icon={dashboardMetricIcons.rollback} size="sm" />}
          >
            {actionState.rollback.isRunning ? "回滚中" : "确认回滚"}
          </Button>
          {actionState.rollback.error ? (
            <p className="form-error" role="alert">
              回滚失败：{actionState.rollback.error}
            </p>
          ) : null}
          {actionState.rollback.message ? <p>{actionState.rollback.message}</p> : null}
        </Card>

        <Card className="metric-card">
          <div className="toolbar">
            <AppIcon icon={navigationIcons.schemaStudio} tone="purple" tile />
            <Tag color="arcoblue">比较基线</Tag>
          </div>
          <h3>Compare</h3>
          <p>对比草稿与指定版本的质量指标。</p>
          <Select
            value={flowState.compareBase}
            onChange={(value) => onCompareBaseChange(String(value))}
            disabled={actionState.compare.isRunning}
          >
            {versions.map((version) => (
              <Select.Option key={version.id} value={version.version}>
                {version.version}
              </Select.Option>
            ))}
          </Select>
          <Button
            type="outline"
            onClick={onCompare}
            disabled={actionState.compare.isRunning}
            loading={actionState.compare.isRunning}
            icon={actionState.compare.isRunning ? <AppIcon icon={commonUiIcons.loading} size="sm" /> : <AppIcon icon={navigationIcons.schemaStudio} size="sm" />}
          >
            {actionState.compare.isRunning ? "比较中" : "执行比较"}
          </Button>
          {actionState.compare.error ? (
            <p className="form-error" role="alert">
              比较失败：{actionState.compare.error}
            </p>
          ) : null}
          {actionState.compare.message ? (
            <p>{actionState.compare.message}</p>
          ) : null}
        </Card>
      </div>
    </Card>
  );
}
