import { AlertTriangle, GitCompare, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { FlowState, SchemaRecord, SchemaVersion } from "./schemaStudioData";

type ApiActionState = {
  isRunning: boolean;
  message: string;
  error: string;
};

type SchemaFlowPanelProps = {
  schema: SchemaRecord;
  versions: SchemaVersion[];
  isAdmin: boolean;
  flowState: FlowState;
  actionState: {
    publish: ApiActionState;
    compare: ApiActionState;
  };
  onToggleAdmin: () => void;
  onPublish: () => void;
  onDeactivate: () => void;
  onRollbackTargetChange: (version: string) => void;
  onCompareBaseChange: (version: string) => void;
  onCompare: () => void;
};

export function SchemaFlowPanel({
  schema,
  versions,
  isAdmin,
  flowState,
  actionState,
  onToggleAdmin,
  onPublish,
  onDeactivate,
  onRollbackTargetChange,
  onCompareBaseChange,
  onCompare
}: SchemaFlowPanelProps) {
  const archivedVersions = versions.filter((version) => version.status !== "draft");
  const rollbackOptions = archivedVersions.length > 0 ? archivedVersions : versions;

  return (
    <section className="panel" aria-labelledby="schema-flow-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-flow-title">发布与变更流</h2>
          <p>管理 publish、deactivate、rollback、compare 的操作状态。</p>
        </div>
        <label>
          管理员
          <input type="checkbox" checked={isAdmin} onChange={onToggleAdmin} />
        </label>
      </div>

      <div className="warning-box" role="note">
        <AlertTriangle aria-hidden size={18} />
        <div>
          <strong>生产影响 warning</strong>
          <p>
            {schema.name} 当前影响 {schema.affectedPipelines.join("、")}。
            停用风险为{schema.deactivationRisk}，发布前需确认 adapter 兼容与回滚窗口。
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <div className="toolbar">
            <ShieldCheck aria-hidden size={18} />
            <span className="status-pill">
              {flowState.publishRequested ? "已请求" : "未请求"}
            </span>
          </div>
          <h3>Publish</h3>
          <p>草稿 {schema.draftVersion} 发布为生产版本。</p>
          <button
            type="button"
            className="action-button"
            onClick={onPublish}
            disabled={!isAdmin || actionState.publish.isRunning}
            title={isAdmin ? "发布草稿" : "非管理员不能发布"}
          >
            {actionState.publish.isRunning ? (
              <Loader2 aria-hidden size={16} />
            ) : (
              <ShieldCheck aria-hidden size={16} />
            )}
            {actionState.publish.isRunning ? "发布中" : "发布"}
          </button>
          {actionState.publish.error ? (
            <p className="form-error" role="alert">
              发布失败：{actionState.publish.error}
            </p>
          ) : null}
          {actionState.publish.message ? (
            <p>{actionState.publish.message}</p>
          ) : null}
        </article>

        <article className="metric-card">
          <div className="toolbar">
            <XCircle aria-hidden size={18} />
            <span className="status-pill">
              {flowState.deactivateRequested ? "已进入审批" : "待评估"}
            </span>
          </div>
          <h3>Deactivate</h3>
          <p>停用后生产管道将不再引用此 Schema。</p>
          <button type="button" className="danger-button" onClick={onDeactivate}>
            <XCircle aria-hidden size={16} />
            停用
          </button>
        </article>

        <article className="metric-card">
          <div className="toolbar">
            <RotateCcw aria-hidden size={18} />
            <span className="status-pill">{flowState.rollbackTarget}</span>
          </div>
          <h3>Rollback</h3>
          <p>选择最近稳定版本作为回滚目标。</p>
          <select
            value={flowState.rollbackTarget}
            onChange={(event) => onRollbackTargetChange(event.currentTarget.value)}
          >
            {rollbackOptions.map((version) => (
              <option key={version.id} value={version.version}>
                {version.version}
              </option>
            ))}
          </select>
        </article>

        <article className="metric-card">
          <div className="toolbar">
            <GitCompare aria-hidden size={18} />
            <span className="status-pill">比较基线</span>
          </div>
          <h3>Compare</h3>
          <p>对比草稿与指定版本的质量指标。</p>
          <select
            value={flowState.compareBase}
            onChange={(event) => onCompareBaseChange(event.currentTarget.value)}
            disabled={actionState.compare.isRunning}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.version}>
                {version.version}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            onClick={onCompare}
            disabled={actionState.compare.isRunning}
          >
            {actionState.compare.isRunning ? (
              <Loader2 aria-hidden size={16} />
            ) : (
              <GitCompare aria-hidden size={16} />
            )}
            {actionState.compare.isRunning ? "比较中" : "执行比较"}
          </button>
          {actionState.compare.error ? (
            <p className="form-error" role="alert">
              比较失败：{actionState.compare.error}
            </p>
          ) : null}
          {actionState.compare.message ? (
            <p>{actionState.compare.message}</p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
