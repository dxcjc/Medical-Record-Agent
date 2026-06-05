import { Loader2, ShieldCheck } from "lucide-react";
import type { ValidationResult } from "./schemaStudioData";
import { validationIcons } from "./schemaStudioData";

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
    <section className="panel" aria-labelledby="schema-validation-title">
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
              <Loader2 aria-hidden size={16} />
            ) : (
              <ShieldCheck aria-hidden size={16} />
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
          <ShieldCheck aria-hidden size={18} />
          <div>
            <strong>验证请求已发送</strong>
            <p>{actionState.message}</p>
          </div>
        </div>
      ) : null}

      <div className="metric-grid">
        {results.map((result) => {
          const ResultIcon = validationIcons[result.level];

          return (
            <article className="metric-card" key={result.id}>
              <div className="toolbar">
                <ResultIcon aria-hidden size={18} />
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
