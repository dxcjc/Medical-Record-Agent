import { useMemo, useState } from "react";
import { Archive, CheckCircle2, Send, Tag, ThumbsDown, ThumbsUp } from "lucide-react";
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
  payload: Record<string, unknown>;
  apiFeedbackId?: string;
};

type FeedbackApiState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

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

function readCreatedFeedbackId(response: unknown): string | undefined {
  if (!isRecord(response)) {
    return undefined;
  }

  return readString(response, ["id", "feedbackId"]) ?? (isRecord(response.feedback) ? readString(response.feedback, ["id", "feedbackId"]) : undefined);
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

  async function submitSampleStatus(id: string, status: FeedbackStatus) {
    const sample = samples.find((item) => item.id === id);
    if (!sample) {
      return;
    }

    setApiState({ status: "submitting", message: `正在提交 ${sample.id} 的反馈状态。` });

    try {
      const response = await api.createFeedback({
        sampleId: sample.id,
        source: sample.source,
        field: sample.field,
        expected: sample.expected,
        actual: sample.actual,
        label: sample.label,
        status,
        payload: sample.payload
      });
      const apiFeedbackId = readCreatedFeedbackId(response);

      setSamples((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                ...(apiFeedbackId ? { apiFeedbackId } : {})
              }
            : item
        )
      );
      setApiState({
        status: "success",
        message: apiFeedbackId ? `已提交真实反馈 ${apiFeedbackId}，页面状态同步更新。` : "反馈 API 已返回成功，页面状态同步更新。"
      });
    } catch (error) {
      setApiState({
        status: "error",
        message: error instanceof Error ? error.message : "反馈 API 提交失败。"
      });
    }
  }

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 22"
        title="Feedback Samples"
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
        <section className="panel" data-guide="feedback">
          <div className="panel-header">
            <h2>
              <Tag size={18} aria-hidden="true" />
              样本列表
            </h2>
            <StatusPill tone="info">可标注</StatusPill>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>来源</th>
                <th>字段</th>
                <th>标签</th>
                <th>置信度</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.id} className={selectedSample?.id === sample.id ? "is-selected" : undefined}>
                  <td>
                    <button className="link-button" type="button" onClick={() => setSelectedId(sample.id)}>
                      {sample.id}
                    </button>
                  </td>
                  <td>{sample.source}</td>
                  <td>{sample.field}</td>
                  <td>{sample.label}</td>
                  <td>{Math.round(sample.confidence * 100)}%</td>
                  <td>
                    <StatusPill tone={statusToneMap[sample.status]}>{statusLabelMap[sample.status]}</StatusPill>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={sample.status === "golden"}
                        onClick={() => {
                          setSelectedId(sample.id);
                          setConfirmGoldenId(sample.id);
                        }}
                      >
                        <ThumbsUp size={15} aria-hidden="true" />
                        入集
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={sample.status === "ignored"}
                        title={sample.status === "ignored" ? "样本已忽略" : undefined}
                        onClick={() => void submitSampleStatus(sample.id, "ignored")}
                      >
                        <ThumbsDown size={15} aria-hidden="true" />
                        忽略
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="stack">
          {selectedSample ? (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    <Archive size={18} aria-hidden="true" />
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
              </section>
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
        <p role="status" className="page-subtle-note">
          <Send size={15} aria-hidden="true" />
          {apiState.message}
        </p>
      ) : null}
    </main>
  );
}

export default FeedbackSamplesPage;
