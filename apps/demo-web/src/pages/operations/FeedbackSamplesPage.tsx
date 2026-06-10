import { useMemo, useState } from "react";
import { Alert, Button, Card, Space, Table } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import type {
  ApiEvaluationSamplesResponse,
  ApiFeedbackResponse,
  ApiJsonObject,
  CreateFeedbackInput,
  ImportEvaluationSampleInput
} from "../../api/client";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { ConfirmDialog, InlineNotice, MetricCard, PayloadPreview, SectionHeader, StatusPill } from "./components";
import { useAuth } from "../../auth/AuthContext";

type FeedbackStatus = "new" | "triaged" | "golden" | "ignored";

type FeedbackSample = {
  id: string;
  source: string;
  field: string;
  expected: string;
  actual: string;
  label: "字段缺失" | "识别错误" | "结构错位" | "可接受";
  status: FeedbackStatus;
  confidence: number;
  payload: ApiJsonObject;
  apiFeedbackId?: string;
};

type FeedbackApiState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

type FeedbackApiClient = {
  createFeedback(input: CreateFeedbackInput): Promise<ApiFeedbackResponse>;
  importEvaluationSamples(datasetId: string, samples: ImportEvaluationSampleInput[]): Promise<ApiEvaluationSamplesResponse>;
};

type FeedbackSubmitResult = {
  status: "success" | "feedback-error" | "evaluation-import-error";
  apiFeedbackId?: string;
  message: string;
};

export const DEFAULT_FEEDBACK_EVALUATION_DATASET_ID = "ds-admission-0605";

const initialSamples: FeedbackSample[] = [
  {
    id: "FB-1187",
    source: "门诊病历 OCR",
    field: "出院日期",
    expected: "2026-05-28",
    actual: "",
    label: "字段缺失",
    status: "new",
    confidence: 0.61,
    payload: { page: 3, bbox: [120, 356, 220, 388], reviewerNote: "字段被印章遮挡，需加入困难样本集" }
  },
  {
    id: "FB-1186",
    source: "检验申请单",
    field: "检验项目",
    expected: "NGS-肺癌 520 基因",
    actual: "NGS-肺癌 52O 基因",
    label: "识别错误",
    status: "triaged",
    confidence: 0.79,
    payload: { page: 1, confusion: "0/O", suggestedRule: "项目编码优先于 OCR 文本" }
  },
  {
    id: "FB-1185",
    source: "住院首页",
    field: "诊断列表",
    expected: "肺恶性肿瘤；高血压",
    actual: "肺恶性肿瘤高血压",
    label: "结构错位",
    status: "golden",
    confidence: 0.84,
    payload: { splitter: "；", trainingSet: "golden-medical-record-v1", approvedBy: "reviewer-a" }
  }
];

const statusToneMap: Record<FeedbackStatus, "info" | "warning" | "success" | "neutral"> = {
  new: "info",
  triaged: "warning",
  golden: "success",
  ignored: "neutral"
};

const statusLabelMap: Record<FeedbackStatus, string> = {
  new: "新反馈",
  triaged: "已分诊",
  golden: "黄金样本",
  ignored: "已忽略"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readCreatedFeedbackId(response: ApiFeedbackResponse): string | undefined {
  return readString(response, ["id", "feedbackId"]) ?? (isRecord(response.feedback) ? readString(response.feedback, ["id", "feedbackId"]) : undefined);
}

function readReviewer(payload: ApiJsonObject) {
  return readString(payload, ["reviewer", "approvedBy"]) ?? "unknown";
}

function getFeedbackGroundTruthField(sample: FeedbackSample) {
  return sample.field.trim() || "feedbackValue";
}

export function buildFeedbackEvaluationSample(sample: FeedbackSample, apiFeedbackId: string | undefined): ImportEvaluationSampleInput {
  const fieldKey = getFeedbackGroundTruthField(sample);
  const source = sample.source.trim() || "feedback";
  const expected = sample.expected;

  return {
    externalId: `feedback-${sample.id}`,
    input: {
      source,
      field: fieldKey,
      actual: sample.actual
    },
    groundTruth: {
      [fieldKey]: {
        fieldKey,
        value: expected,
        normalizedValue: expected,
        expectedNeedsReview: true
      }
    },
    metadata: {
      feedbackSampleId: sample.id,
      source,
      field: fieldKey,
      reviewer: readReviewer(sample.payload),
      ...(apiFeedbackId ? { feedbackApiId: apiFeedbackId } : {}),
      feedbackLabel: sample.label,
      feedbackStatus: "golden"
    }
  };
}

function errorToMessage(error: unknown) {
  return error instanceof Error && error.message.length > 0 ? error.message : "UNKNOWN_ERROR";
}

export async function submitFeedbackSampleStatus(
  api: FeedbackApiClient,
  sample: FeedbackSample,
  status: FeedbackStatus
): Promise<FeedbackSubmitResult> {
  let apiFeedbackId: string | undefined;

  try {
    const feedbackInput: CreateFeedbackInput = {
      sampleId: sample.id,
      source: sample.source,
      field: sample.field,
      expected: sample.expected,
      actual: sample.actual,
      label: sample.label,
      status,
      payload: sample.payload
    };
    const response = await api.createFeedback(feedbackInput);
    apiFeedbackId = readCreatedFeedbackId(response);
  } catch (error) {
    return {
      status: "feedback-error",
      message: errorToMessage(error)
    };
  }

  if (status !== "golden") {
    return {
      status: "success",
      ...(apiFeedbackId ? { apiFeedbackId } : {}),
      message: apiFeedbackId ? `已保存 feedback ${apiFeedbackId}，页面状态已同步。` : "feedback 已保存，页面状态已同步。"
    };
  }

  try {
    await api.importEvaluationSamples(DEFAULT_FEEDBACK_EVALUATION_DATASET_ID, [buildFeedbackEvaluationSample(sample, apiFeedbackId)]);

    return {
      status: "success",
      ...(apiFeedbackId ? { apiFeedbackId } : {}),
      message: apiFeedbackId ? `已入评估集，feedback ${apiFeedbackId} 已保存。` : "已入评估集，feedback 已保存。"
    };
  } catch (error) {
    return {
      status: "evaluation-import-error",
      ...(apiFeedbackId ? { apiFeedbackId } : {}),
      message: `feedback 已保存，但样本导入失败：${errorToMessage(error)}`
    };
  }
}

export function FeedbackSamplesPage() {
  const { api } = useAuth();
  const [samples, setSamples] = useState<FeedbackSample[]>(initialSamples);
  const [selectedId, setSelectedId] = useState<string>(initialSamples[0]?.id ?? "");
  const [confirmGoldenId, setConfirmGoldenId] = useState<string | null>(null);
  const [apiState, setApiState] = useState<FeedbackApiState>({
    status: "idle",
    message: "当前列表使用本地复核样本兜底；入集和忽略会提交到真实 feedback API。"
  });

  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedId) ?? samples[0],
    [samples, selectedId]
  );
  const goldenCount = samples.filter((sample) => sample.status === "golden").length;
  const sampleColumns: TableColumnProps<FeedbackSample>[] = [
    {
      title: "ID",
      dataIndex: "id",
      render: (_, sample) => (
        <Button type="text" onClick={() => setSelectedId(sample.id)}>
          {sample.id}
        </Button>
      ),
    },
    { title: "来源", dataIndex: "source" },
    { title: "字段", dataIndex: "field" },
    { title: "标签", dataIndex: "label" },
    { title: "置信度", dataIndex: "confidence", render: (_, sample) => `${Math.round(sample.confidence * 100)}%` },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, sample) => <StatusPill tone={statusToneMap[sample.status]}>{statusLabelMap[sample.status]}</StatusPill>,
    },
    {
      title: "操作",
      dataIndex: "operations",
      render: (_, sample) => (
        <Space wrap>
          <Button
            type="outline"
            disabled={sample.status === "golden"}
            onClick={() => {
              setSelectedId(sample.id);
              setConfirmGoldenId(sample.id);
            }}
            icon={<AppIcon icon={statusIcons.success} size="sm" />}
          >
            入集
          </Button>
          <Button
            type="outline"
            disabled={sample.status === "ignored"}
            title={sample.status === "ignored" ? "样本已忽略" : undefined}
            onClick={() => void submitSampleStatus(sample.id, "ignored")}
            icon={<AppIcon icon={statusIcons.warning} size="sm" />}
          >
            忽略
          </Button>
        </Space>
      ),
    },
  ];

  async function submitSampleStatus(id: string, status: FeedbackStatus) {
    const sample = samples.find((item) => item.id === id);
    if (!sample) {
      return;
    }

    setApiState({ status: "submitting", message: `正在提交 ${sample.id} 的反馈状态。` });

    const result = await submitFeedbackSampleStatus(api, sample, status);
    if (result.status === "success" || result.status === "evaluation-import-error") {
      setSamples((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                ...(result.apiFeedbackId ? { apiFeedbackId: result.apiFeedbackId } : {})
              }
            : item
        )
      );
      setApiState({
        status: result.status === "success" ? "success" : "error",
        message: result.message
      });
      return;
    }

    setApiState({
      status: "error",
      message: result.message
    });
  }

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 22"
        title="反馈样本"
        description="沉淀人工反馈样本，支持标注、分诊、加入黄金样本集和忽略低价值反馈。"
      />

      <section className="metric-grid" aria-label="反馈指标">
        <MetricCard label="反馈样本" value={`${samples.length}`} hint="来自人工复核与写回拦截" tone="info" />
        <MetricCard label="黄金样本" value={`${goldenCount}`} hint="可进入回归评测集合" tone="success" />
        <MetricCard label="平均置信度" value={`${Math.round((samples.reduce((sum, item) => sum + item.confidence, 0) / samples.length) * 100)}%`} hint="用于决定复核优先级" tone="warning" />
      </section>

      <InlineNotice tone="warning" title="危险动作说明">
        加入黄金样本会影响后续评测基准，必须由复核人员确认；忽略样本只改变演示状态，不删除原始记录。
      </InlineNotice>

      <InlineNotice tone={apiState.status === "error" ? "warning" : apiState.status === "success" ? "success" : "info"} title="API 状态">
        {apiState.message}
      </InlineNotice>

      <section className="operations-split">
        <Card className="panel" data-guide="feedback">
          <div className="panel-header">
            <h2>
              <AppIcon icon={navigationIcons.feedbackSamples} size="md" />
              样本列表
            </h2>
            <StatusPill tone="info">可标注</StatusPill>
          </div>
          <Table columns={sampleColumns} data={samples} rowKey="id" pagination={false} scroll={{ x: 920 }} />
        </Card>

        <div className="stack">
          {selectedSample ? (
            <>
              <Card className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={dashboardMetricIcons.dataset} size="md" />
                    对比详情
                  </h2>
                  <StatusPill tone={statusToneMap[selectedSample.status]}>{statusLabelMap[selectedSample.status]}</StatusPill>
                </div>
                <dl className="detail-list">
                  <div>
                    <dt>期望值</dt>
                    <dd>{selectedSample.expected}</dd>
                  </div>
                  <div>
                    <dt>实际值</dt>
                    <dd>{selectedSample.actual || "空值"}</dd>
                  </div>
                  <div>
                    <dt>标注建议</dt>
                    <dd>{selectedSample.label}</dd>
                  </div>
                  <div>
                    <dt>API 记录</dt>
                    <dd>{selectedSample.apiFeedbackId ?? "尚未提交到 feedback API"}</dd>
                  </div>
                </dl>
              </Card>
              <PayloadPreview title="反馈上下文" payload={selectedSample.payload} />
            </>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirmGoldenId !== null}
        title="确认加入黄金样本"
        description={`将 ${confirmGoldenId ?? ""} 加入回归评测基准。该动作会影响后续模型质量评估，请确认期望值已经复核。`}
        confirmLabel="确认入集"
        onCancel={() => setConfirmGoldenId(null)}
        onConfirm={() => {
          if (confirmGoldenId) {
            void submitSampleStatus(confirmGoldenId, "golden");
          }
          setConfirmGoldenId(null);
        }}
      />

      {apiState.status === "submitting" ? (
        <Alert type="info" showIcon content={apiState.message} />
      ) : null}
    </main>
  );
}

export default FeedbackSamplesPage;
