import { AppIcon, actionIcons, navigationIcons } from "../../../icons/appIcons";
import type { EvaluationRun, EvaluationRunDraft } from "./evaluationData";

type SelectOption = {
  value: string;
  label: string;
};

type EvaluationRunPanelProps = {
  draft: EvaluationRunDraft;
  runs: EvaluationRun[];
  schemaOptions: SelectOption[];
  providerOptions: SelectOption[];
  mutationState: {
    status: "idle" | "submitting" | "success" | "error";
    message: string | null;
  };
  onChange: <Key extends keyof EvaluationRunDraft>(
    key: Key,
    value: EvaluationRunDraft[Key]
  ) => void;
  onCreateRun: () => void | Promise<void>;
};

export function EvaluationRunPanel({
  draft,
  runs,
  schemaOptions,
  providerOptions,
  mutationState,
  onChange,
  onCreateRun
}: EvaluationRunPanelProps) {
  const isSubmitting = mutationState.status === "submitting";

  return (
    <section className="panel studio-panel" aria-labelledby="evaluation-run-title" data-guide="evaluation">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-run-title">Evaluation Run Creation</h2>
          <p>选择 Schema、模型和样本范围后创建评测任务。</p>
        </div>
        <AppIcon icon={navigationIcons.evaluation} tone="green" tile />
      </div>

      <div className="form-grid">
        <label>
          Run 名称
          <input
            value={draft.name}
            onChange={(event) => onChange("name", event.currentTarget.value)}
          />
        </label>
        <label>
          Schema Version
          <select
            value={draft.schemaVersion}
            onChange={(event) => onChange("schemaVersion", event.currentTarget.value)}
          >
            {schemaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model Version
          <select
            value={draft.modelVersion}
            onChange={(event) => onChange("modelVersion", event.currentTarget.value)}
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sample Scope
          <input
            value={draft.sampleScope}
            onChange={(event) => onChange("sampleScope", event.currentTarget.value)}
          />
        </label>
      </div>

      <div className="toolbar">
        <button type="button" className="action-button" onClick={onCreateRun} disabled={isSubmitting}>
          <AppIcon icon={actionIcons.next} size="sm" />
          {isSubmitting ? "创建中" : "创建评测"}
        </button>
        {mutationState.message ? (
          <span
            className={`status-pill ${mutationState.status === "error" ? "status-pill-danger" : "status-pill-success"}`}
            role={mutationState.status === "error" ? "alert" : "status"}
          >
            {mutationState.message}
          </span>
        ) : null}
      </div>

      <div className="table-scroll">
        <table className="data-table arco-table">
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">数据集</th>
              <th scope="col">Schema</th>
              <th scope="col">模型</th>
              <th scope="col">状态</th>
              <th scope="col">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.name}</td>
                <td>{run.datasetName}</td>
                <td className="mono">{run.schemaVersion}</td>
                <td className="mono">{run.modelVersion}</td>
                <td>
                  <span className="status-pill">{run.status}</span>
                </td>
                <td>{run.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
