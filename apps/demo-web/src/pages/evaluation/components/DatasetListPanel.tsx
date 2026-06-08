import { AppIcon, dashboardMetricIcons, statusIcons } from "../../../icons/appIcons";
import {
  datasetStatusLabel,
  groundTruthStatusLabel,
  type EvaluationDataset
} from "./evaluationData";

type DatasetListPanelProps = {
  datasets: EvaluationDataset[];
  selectedDatasetId: string;
  onSelectDataset: (datasetId: string) => void;
};

export function DatasetListPanel({
  datasets,
  selectedDatasetId,
  onSelectDataset
}: DatasetListPanelProps) {
  return (
    <section className="panel studio-panel" aria-labelledby="evaluation-dataset-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-dataset-title">Dataset 列表</h2>
          <p>按场景查看样本量、ground truth 和脱敏状态。</p>
        </div>
        <AppIcon icon={dashboardMetricIcons.dataset} tone="blue" tile />
      </div>

      <div className="table-scroll">
        <table className="data-table arco-table">
          <thead>
            <tr>
              <th scope="col">数据集</th>
              <th scope="col">场景</th>
              <th scope="col">样本</th>
              <th scope="col">Ground Truth</th>
              <th scope="col">脱敏</th>
              <th scope="col">状态</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((dataset) => {
              const isSelected = dataset.id === selectedDatasetId;

              return (
                <tr className={isSelected ? "is-selected" : undefined} key={dataset.id}>
                  <td>
                    <button
                      type="button"
                      className={isSelected ? "action-button" : "secondary-button"}
                      onClick={() => onSelectDataset(dataset.id)}
                      aria-pressed={isSelected}
                    >
                      {dataset.name}
                    </button>
                  </td>
                  <td>{dataset.scenario}</td>
                  <td>{dataset.sampleCount}</td>
                  <td>{groundTruthStatusLabel[dataset.groundTruthStatus]}</td>
                  <td>
                    <span className={dataset.deidentified ? "status-pill status-pill--success" : "status-pill status-pill--danger"}>
                      {dataset.deidentified ? (
                        <AppIcon icon={statusIcons.success} size="xs" />
                      ) : (
                        <AppIcon icon={statusIcons.danger} size="xs" />
                      )}
                      {dataset.deidentified ? "已标记" : "未标记"}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill status-${dataset.status}`}>
                      {datasetStatusLabel[dataset.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
