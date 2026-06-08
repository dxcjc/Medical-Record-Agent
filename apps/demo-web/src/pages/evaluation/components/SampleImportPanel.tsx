import { AppIcon, actionIcons, dashboardMetricIcons } from "../../../icons/appIcons";
import type { ImportFlowState } from "./evaluationData";

type SampleImportPanelProps = {
  importFlow: ImportFlowState;
  onChange: <Key extends keyof ImportFlowState>(
    key: Key,
    value: ImportFlowState[Key]
  ) => void;
  onValidateSamples: () => void;
  onCompleteImport: () => void;
};

export function SampleImportPanel({
  importFlow,
  onChange,
  onValidateSamples,
  onCompleteImport
}: SampleImportPanelProps) {
  return (
    <section className="panel studio-panel" aria-labelledby="evaluation-import-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-import-title">Sample Import Flow</h2>
          <p>导入样本文件并跟踪 ground truth 字段匹配状态。</p>
        </div>
        <AppIcon icon={dashboardMetricIcons.taskVolume} tone="purple" tile />
      </div>

      <div className="form-grid">
        <label>
          来源类型
          <select
            value={importFlow.sourceType}
            onChange={(event) =>
              onChange("sourceType", event.currentTarget.value as ImportFlowState["sourceType"])
            }
          >
            <option value="CSV">CSV</option>
            <option value="JSONL">JSONL</option>
            <option value="人工抽样">人工抽样</option>
          </select>
        </label>

        <label>
          文件名
          <input
            value={importFlow.fileName}
            onChange={(event) => onChange("fileName", event.currentTarget.value)}
          />
        </label>

        <label>
          样本导入状态
          <select
            value={importFlow.sampleImportStatus}
            onChange={(event) =>
              onChange(
                "sampleImportStatus",
                event.currentTarget.value as ImportFlowState["sampleImportStatus"]
              )
            }
          >
            <option value="未开始">未开始</option>
            <option value="校验中">校验中</option>
            <option value="已导入">已导入</option>
          </select>
        </label>

        <label>
          Ground Truth Import Status
          <select
            value={importFlow.groundTruthStatusText}
            onChange={(event) =>
              onChange(
                "groundTruthStatusText",
                event.currentTarget.value as ImportFlowState["groundTruthStatusText"]
              )
            }
          >
            <option value="等待导入">等待导入</option>
            <option value="字段匹配中">字段匹配中</option>
            <option value="已完成">已完成</option>
          </select>
        </label>
      </div>

      <div className="toolbar">
        <span className="status-pill">{importFlow.sampleImportStatus}</span>
        <span className="status-pill">{importFlow.groundTruthStatusText}</span>
        <button type="button" className="secondary-button" onClick={onValidateSamples}>
          <AppIcon icon={actionIcons.viewFlow} size="sm" />
          校验样本
        </button>
        <button type="button" className="action-button" onClick={onCompleteImport}>
          <AppIcon icon={actionIcons.createRecognition} size="sm" />
          完成导入
        </button>
      </div>
    </section>
  );
}
