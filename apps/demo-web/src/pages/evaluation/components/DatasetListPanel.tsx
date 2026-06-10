import { Button, Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
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
  const columns: TableColumnProps<EvaluationDataset>[] = [
    {
      title: "数据集",
      dataIndex: "name",
      render: (_, dataset) => {
        const isSelected = dataset.id === selectedDatasetId;
        return (
          <Button type={isSelected ? "primary" : "outline"} onClick={() => onSelectDataset(dataset.id)} aria-pressed={isSelected}>
            {dataset.name}
          </Button>
        );
      },
    },
    { title: "场景", dataIndex: "scenario" },
    { title: "样本", dataIndex: "sampleCount" },
    {
      title: "Ground Truth",
      dataIndex: "groundTruthStatus",
      render: (_, dataset) => groundTruthStatusLabel[dataset.groundTruthStatus],
    },
    {
      title: "脱敏",
      dataIndex: "deidentified",
      render: (_, dataset) => (
        <Tag color={dataset.deidentified ? "green" : "red"}>
          {dataset.deidentified ? <AppIcon icon={statusIcons.success} size="xs" /> : <AppIcon icon={statusIcons.danger} size="xs" />}
          {dataset.deidentified ? "已标记" : "未标记"}
        </Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, dataset) => <Tag color={dataset.status === "ready" ? "green" : dataset.status === "importing" ? "orange" : "red"}>{datasetStatusLabel[dataset.status]}</Tag>,
    },
  ];

  return (
    <Card className="panel studio-panel" aria-labelledby="evaluation-dataset-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-dataset-title">Dataset 列表</h2>
          <p>按场景查看样本量、ground truth 和脱敏状态。</p>
        </div>
        <AppIcon icon={dashboardMetricIcons.dataset} tone="blue" tile />
      </div>

      <div className="table-scroll">
        <Table columns={columns} data={datasets} rowKey="id" pagination={false} scroll={{ x: 860 }} />
      </div>
    </Card>
  );
}
