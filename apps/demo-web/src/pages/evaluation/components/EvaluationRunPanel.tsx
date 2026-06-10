import { Button, Card, Form, Input, Select, Space, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
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
    status: "idle" | "submitting" | "success" | "error" | "cancelled";
    message: string | null;
  };
  onChange: <Key extends keyof EvaluationRunDraft>(
    key: Key,
    value: EvaluationRunDraft[Key]
  ) => void;
  onCreateRun: () => void | Promise<void>;
  onCancelRun: () => void;
  onRerun: () => void | Promise<void>;
};

export function EvaluationRunPanel({
  draft,
  runs,
  schemaOptions,
  providerOptions,
  mutationState,
  onChange,
  onCreateRun,
  onCancelRun,
  onRerun
}: EvaluationRunPanelProps) {
  const isSubmitting = mutationState.status === "submitting";
  const columns: TableColumnProps<EvaluationRun>[] = [
    { title: "Run", dataIndex: "name" },
    { title: "数据集", dataIndex: "datasetName" },
    { title: "Schema", dataIndex: "schemaVersion", render: (_, run) => <span className="mono">{run.schemaVersion}</span> },
    { title: "模型", dataIndex: "modelVersion", render: (_, run) => <span className="mono">{run.modelVersion}</span> },
    { title: "状态", dataIndex: "status", render: (_, run) => <Tag color={run.status === "已完成" ? "green" : run.status === "运行中" ? "arcoblue" : run.status === "已失败" ? "red" : "orange"}>{run.status}</Tag> },
    { title: "创建时间", dataIndex: "createdAt" },
  ];

  return (
    <Card className="panel studio-panel" aria-labelledby="evaluation-run-title" data-guide="evaluation">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-run-title">Evaluation Run Creation</h2>
          <p>选择 Schema、模型和样本范围后创建评测任务。</p>
        </div>
        <AppIcon icon={navigationIcons.evaluation} tone="green" tile />
      </div>

      <div className="form-grid">
        <Form.Item label="Run 名称">
          <Input
            value={draft.name}
            onChange={(value) => onChange("name", value)}
          />
        </Form.Item>
        <Form.Item label="Schema Version">
          <Select
            value={draft.schemaVersion}
            onChange={(value) => onChange("schemaVersion", String(value))}
          >
            {schemaOptions.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="Model Version">
          <Select
            value={draft.modelVersion}
            onChange={(value) => onChange("modelVersion", String(value))}
          >
            {providerOptions.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="Sample Scope">
          <Input
            value={draft.sampleScope}
            onChange={(value) => onChange("sampleScope", value)}
          />
        </Form.Item>
      </div>

      <Space className="toolbar" wrap>
        <Button type="primary" onClick={onCreateRun} disabled={isSubmitting} loading={isSubmitting} icon={<AppIcon icon={actionIcons.next} size="sm" />}>
          {isSubmitting ? "创建中" : "创建评测"}
        </Button>
        <Button type="outline" onClick={onCancelRun} disabled={!isSubmitting}>
          取消
        </Button>
        <Button type="outline" onClick={onRerun} disabled={isSubmitting || mutationState.status === "idle"}>
          重跑
        </Button>
        {mutationState.message ? (
          <Tag color={mutationState.status === "error" ? "red" : mutationState.status === "cancelled" ? "orange" : "green"} role={mutationState.status === "error" ? "alert" : "status"}>
            {mutationState.message}
          </Tag>
        ) : null}
      </Space>

      <div className="table-scroll">
        <Table columns={columns} data={runs} rowKey="id" pagination={false} scroll={{ x: 900 }} />
      </div>
    </Card>
  );
}
