import { PlayCircle } from "lucide-react";
import type { EvaluationRun, EvaluationRunDraft } from "./evaluationData";

type EvaluationRunPanelProps = {
  draft: EvaluationRunDraft;
  runs: EvaluationRun[];
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
  mutationState,
  onChange,
  onCreateRun
}: EvaluationRunPanelProps) {
  const isSubmitting = mutationState.status === "submitting";

  return (
    <section className="panel" aria-labelledby="evaluation-run-title" data-guide="evaluation">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-run-title">Evaluation Run Creation</h2>
          <p>选择 Schema、模型和样本范围后创建评测任务。</p>
        </div>
        <PlayCircle aria-hidden size={20} />
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
          <input
            value={draft.schemaVersion}
            onChange={(event) => onChange("schemaVersion", event.currentTarget.value)}
          />
        </label>
        <label>
          Model Version
          <input
            value={draft.modelVersion}
            onChange={(event) => onChange("modelVersion", event.currentTarget.value)}
          />
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
          <PlayCircle aria-hidden size={16} />
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

      <table className="data-table">
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
              <td>{run.schemaVersion}</td>
              <td>{run.modelVersion}</td>
              <td>
                <span className="status-pill">{run.status}</span>
              </td>
              <td>{run.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
