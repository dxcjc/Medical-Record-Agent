import { AppIcon, commonUiIcons, navigationIcons, statusIcons } from "../../../icons/appIcons";
import type { ValidationResult } from "./schemaStudioData";

type ValidationResultsPanelProps = {
  results: ValidationResult[];
  actionState: {
    isRunning: boolean;
    message: string;
    error: string;
  };
  onValidate: () => void;
};

export function ValidationResultsPanel({
  results,
  actionState,
  onValidate
}: ValidationResultsPanelProps) {
  return (
    <section className="panel studio-panel" aria-labelledby="schema-validation-title">
      <div className="toolbar">
        <div>
          <h2 id="schema-validation-title">验证结果</h2>
          <p>发布前的字段覆盖、规则冲突与生产准入检查。</p>
        </div>
        <div className="toolbar">
          <span className="status-pill">{results.length} 项检查</span>
          <button
            type="button"
            className="secondary-button"
            onClick={onValidate}
            disabled={actionState.isRunning}
          >
            {actionState.isRunning ? (
              <AppIcon icon={commonUiIcons.loading} size="sm" />
            ) : (
              <AppIcon icon={navigationIcons.brand} size="sm" />
            )}
            {actionState.isRunning ? "验证中" : "验证草稿"}
          </button>
        </div>
      </div>

      {actionState.error ? (
        <div className="form-error" role="alert">
          验证接口失败：{actionState.error}
        </div>
      ) : null}
      {actionState.message ? (
        <div className="warning-box" role="status">
          <AppIcon icon={statusIcons.success} tone="green" />
          <div>
            <strong>验证请求已发送</strong>
            <p>{actionState.message}</p>
          </div>
        </div>
      ) : null}

      <div className="metric-grid">
        {results.map((result) => {
          const resultIcon =
            result.level === "success"
              ? statusIcons.success
              : result.level === "warning"
                ? statusIcons.warning
                : statusIcons.danger;
          const resultTone =
            result.level === "success" ? "green" : result.level === "warning" ? "orange" : "red";

          return (
            <article className="metric-card" key={result.id}>
              <div className="toolbar">
                <AppIcon icon={resultIcon} tone={resultTone} tile />
                <span className={`status-pill status-${result.level}`}>
                  {result.level === "success"
                    ? "通过"
                    : result.level === "warning"
                      ? "警告"
                      : "阻断"}
                </span>
              </div>
              <h3>{result.title}</h3>
              <p>{result.target}</p>
              <p>{result.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
