import { Button, Card, Checkbox, Form, Input, Select, Space, Tag } from "@arco-design/web-react";
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
  onCancelImport: () => void;
  onRetryImport: () => void;
  isImporting: boolean;
  canRetryImport: boolean;
};

export function SampleImportPanel({
  importFlow,
  onChange,
  onValidateSamples,
  onCompleteImport,
  onCancelImport,
  onRetryImport,
  isImporting,
  canRetryImport
}: SampleImportPanelProps) {
  return (
    <Card className="panel studio-panel" aria-labelledby="evaluation-import-title">
      <div className="toolbar">
        <div>
          <h2 id="evaluation-import-title">Sample Import Flow</h2>
          <p>导入样本文件并跟踪 ground truth 字段匹配状态。</p>
        </div>
        <AppIcon icon={dashboardMetricIcons.taskVolume} tone="purple" tile />
      </div>

      <div className="form-grid">
        <Form.Item label="来源类型">
          <Select
            value={importFlow.sourceType}
            onChange={(value) => onChange("sourceType", String(value) as ImportFlowState["sourceType"])}
          >
            <Select.Option value="CSV">CSV</Select.Option>
            <Select.Option value="JSONL">JSONL</Select.Option>
            <Select.Option value="人工抽样">人工抽样</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="文件名">
          <Input
            value={importFlow.fileName}
            onChange={(value) => onChange("fileName", value)}
          />
        </Form.Item>

        <Form.Item label="样本导入状态">
          <Select
            value={importFlow.sampleImportStatus}
            onChange={(value) => onChange("sampleImportStatus", String(value) as ImportFlowState["sampleImportStatus"])}
          >
            <Select.Option value="未开始">未开始</Select.Option>
            <Select.Option value="校验中">校验中</Select.Option>
            <Select.Option value="已导入">已导入</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="Ground Truth Import Status">
          <Select
            value={importFlow.groundTruthStatusText}
            onChange={(value) => onChange("groundTruthStatusText", String(value) as ImportFlowState["groundTruthStatusText"])}
          >
            <Select.Option value="等待导入">等待导入</Select.Option>
            <Select.Option value="字段匹配中">字段匹配中</Select.Option>
            <Select.Option value="已完成">已完成</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="Ground Truth 字段">
          <Input
            value={importFlow.groundTruthFieldKey}
            onChange={(value) => onChange("groundTruthFieldKey", value)}
          />
        </Form.Item>

        <Form.Item label="期望值">
          <Input
            value={importFlow.groundTruthValue}
            onChange={(value) => onChange("groundTruthValue", value)}
          />
        </Form.Item>

        <Form.Item label="当前预测值">
          <Input
            value={importFlow.predictedValue}
            onChange={(value) => onChange("predictedValue", value)}
          />
        </Form.Item>

        <Form.Item label="复核策略">
          <Checkbox checked={importFlow.expectedNeedsReview} onChange={(checked) => onChange("expectedNeedsReview", checked)}>
            期望进入人工复核
          </Checkbox>
        </Form.Item>
      </div>

      <Space className="toolbar" wrap>
        <Tag color="arcoblue">{importFlow.sampleImportStatus}</Tag>
        <Tag color="green">{importFlow.groundTruthStatusText}</Tag>
        <Button type="outline" onClick={onValidateSamples} disabled={isImporting} icon={<AppIcon icon={actionIcons.viewFlow} size="sm" />}>
          校验样本
        </Button>
        <Button type="primary" onClick={onCompleteImport} disabled={isImporting} loading={isImporting} icon={<AppIcon icon={actionIcons.createRecognition} size="sm" />}>
          {isImporting ? "导入中" : "完成导入"}
        </Button>
        <Button type="outline" onClick={onCancelImport} disabled={!isImporting}>
          取消
        </Button>
        <Button type="outline" onClick={onRetryImport} disabled={isImporting || !canRetryImport}>
          重跑
        </Button>
      </Space>
    </Card>
  );
}
