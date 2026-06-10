import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Input, Select, Space, Table } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import { useNavigate, useParams } from "react-router-dom";
import type { CreateFeedbackInput } from "../../api/client";
import {
  normalizeRecognitionDetail,
  type RecognitionDetailState
} from "../../api/normalizers";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons, statusIcons } from "../../icons/appIcons";
import {
  decisionCards,
  demoOcrText,
  evidenceItems,
  type EvidenceItem,
  type FieldCandidate,
  fieldCandidates,
  formatPercent,
  payloadPreview,
  type TraceStep,
  traceSteps,
} from "./components/demoData";
import {
  DecisionPill,
  EmptyPanel,
  PageHeader,
  SectionTitle,
  StatusPill,
} from "./components/RecognitionShared";
import { useAuth } from "../../auth/AuthContext";

type FeedbackState = {
  reviewer: string;
  field: string;
  decision: "accept" | "reject" | "needs_more_evidence";
  correctedValue: string;
  note: string;
};

const initialFeedback: FeedbackState = {
  reviewer: "复核员 A",
  field: fieldCandidates[0]?.field ?? "主诉",
  decision: "accept",
  correctedValue: "",
  note: "",
};

type LoadState = "idle" | "loading" | "success" | "error";
type SubmitState = "idle" | "loading" | "success" | "error";

type DocumentPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; url: string; fileName: string; mimeType: string }
  | { status: "error"; message: string };

type DemoModeEnv = {
  readonly [key: string]: string | boolean | undefined;
};

export function isExplicitDemoMode(env: DemoModeEnv = import.meta.env) {
  return env.VITE_DEMO_MODE === "true";
}

export const parseApiDetail = normalizeRecognitionDetail;

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { api } = useAuth();
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(evidenceItems[0]?.id ?? "");
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [apiDetail, setApiDetail] = useState<RecognitionDetailState>({});
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState>({ status: "idle" });
  const demoMode = isExplicitDemoMode();
  const routeJobId = jobId ?? "demo";
  const displayJobId = apiDetail.jobId ?? routeJobId;
  const showDemoData = demoMode && routeJobId === "demo";
  const displayFields = apiDetail.fields ?? (showDemoData ? fieldCandidates : []);
  const displayEvidenceItems = apiDetail.evidence ?? (showDemoData ? evidenceItems : []);
  const displayTraceSteps = apiDetail.trace ?? (showDemoData ? traceSteps : []);
  const displayPayload = apiDetail.payload ?? (showDemoData ? { ...payloadPreview, jobId: displayJobId } : {});
  const displayOcrText = apiDetail.ocrText ?? (showDemoData ? demoOcrText : "");
  const fieldColumns: TableColumnProps<FieldCandidate>[] = [
    { title: "字段", dataIndex: "field" },
    { title: "候选值", dataIndex: "value" },
    {
      title: "置信度",
      dataIndex: "confidence",
      render: (_, candidate) => formatPercent(candidate.confidence),
    },
    { title: "来源", dataIndex: "source" },
    {
      title: "自动决策",
      dataIndex: "decision",
      render: (_, candidate) => <DecisionPill decision={candidate.decision} />,
    },
  ];

  useEffect(() => {
    if (routeJobId === "demo") {
      setLoadState("idle");
      setLoadError("");
      setApiDetail({});
      return;
    }

    let isActive = true;

    async function loadDetail() {
      setLoadState("loading");
      setLoadError("");

      try {
        const [job, result] = await Promise.all([api.getJob(routeJobId), api.getResult(routeJobId)]);

        if (!isActive) {
          return;
        }

        setApiDetail(parseApiDetail(job, result));
        setLoadState("success");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setApiDetail({});
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "真实接口暂不可用，请稍后重试。");
      }
    }

    void loadDetail();

    return () => {
      isActive = false;
    };
  }, [api, routeJobId]);

  useEffect(() => {
    return () => {
      if (documentPreview.status === "success") {
        URL.revokeObjectURL(documentPreview.url);
      }
    };
  }, [documentPreview]);

  const selectedEvidence = useMemo(
    () => displayEvidenceItems.find((item) => item.id === selectedEvidenceId) ?? displayEvidenceItems[0],
    [displayEvidenceItems, selectedEvidenceId]
  );

  useEffect(() => {
    setSelectedEvidenceId(displayEvidenceItems[0]?.id ?? "");
  }, [displayEvidenceItems]);

  useEffect(() => {
    if (!displayFields.some((candidate) => candidate.field === feedback.field)) {
      setFeedback((current) => ({ ...current, field: displayFields[0]?.field ?? "主诉" }));
    }
  }, [displayFields, feedback.field]);

  function readErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return "反馈 API 调用失败，请稍后重试。";
  }

  async function handleFeedbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = displayFields.find((item) => item.field === feedback.field) ?? displayFields[0];

    if (!candidate) {
      setSubmitState("error");
      setSubmitError("当前任务没有可提交反馈的字段候选。");
      return;
    }

    setSubmitState("loading");
    setSubmitError("");
    setSubmittedMessage("");

    try {
      const feedbackInput: CreateFeedbackInput = {
        jobId: displayJobId,
        field: candidate.field,
        originalValue: candidate.value,
        correctedValue: feedback.correctedValue.trim() || candidate.value,
        decision: feedback.decision,
        reason: feedback.note.trim() || "页面人工复核提交",
        reviewer: feedback.reviewer.trim() || "未填写复核人",
        confidence: candidate.confidence,
      };

      if (selectedEvidence?.id) {
        feedbackInput.evidenceId = selectedEvidence.id;
      }

      if (selectedEvidence?.quote) {
        feedbackInput.evidenceQuote = selectedEvidence.quote;
      }

      await api.createFeedback(feedbackInput);

      setSubmitState("success");
      setSubmittedMessage(`${candidate.field} 的反馈已提交，决策为 ${feedback.decision}。`);
    } catch (error) {
      setSubmitState("error");
      setSubmitError(readErrorMessage(error));
    }
  }

  function handleGoWriteback() {
    if (showDemoData) {
      return;
    }

    const search = new URLSearchParams({ jobId: displayJobId });
    navigate(`/writeback?${search.toString()}`);
  }

  async function handleOpenDocument() {
    if (!apiDetail.sourceFileId) {
      setDocumentPreview({
        status: "error",
        message: "当前任务没有返回 sourceFileId，无法读取原始文档。"
      });
      return;
    }

    setDocumentPreview((current) => {
      if (current.status === "success") {
        URL.revokeObjectURL(current.url);
      }

      return { status: "loading" };
    });

    try {
      const file = await api.getFileContent(apiDetail.sourceFileId);
      const url = URL.createObjectURL(file.blob);

      setDocumentPreview({
        status: "success",
        url,
        fileName: file.fileName,
        mimeType: file.mimeType
      });
    } catch (error) {
      setDocumentPreview({
        status: "error",
        message: error instanceof Error ? error.message : "原始文档读取失败。"
      });
    }
  }

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title={`任务详情 ${displayJobId}`}
        description="查看文档预览、OCR 文本、字段候选、证据、Payload、LangGraph trace 与人工反馈。"
        actions={
          <>
            <Button
              type="outline"
              aria-label="打开原始文档"
              disabled={documentPreview.status === "loading"}
              onClick={handleOpenDocument}
              icon={<AppIcon icon={actionIcons.createRecognition} size="sm" />}
            >
              {documentPreview.status === "loading" ? "读取中" : "原始文档"}
            </Button>
            <Button type="primary" aria-label="确认绿色字段写回" onClick={handleGoWriteback} icon={<AppIcon icon={dashboardMetricIcons.writeback} size="sm" />}>
              {showDemoData ? "演示不可写回" : "确认写回"}
            </Button>
          </>
        }
      />

      <Alert
        type={loadState === "error" ? "warning" : loadState === "loading" ? "info" : "success"}
        showIcon
        content={
          routeJobId === "demo"
            ? demoMode
              ? "当前为 demo 任务，展示静态识别样例。演示数据，不可写回。"
              : "当前未指定真实任务，请从识别任务列表进入详情页。"
            : loadState === "loading"
              ? `正在加载任务 ${routeJobId} 的真实识别数据。`
              : loadState === "error"
                ? `真实接口读取失败：${loadError}`
                : `已加载任务 ${displayJobId} 的真实数据。`
        }
      />

      {loadState === "error" && !showDemoData ? (
        <Card className="panel">
          <EmptyPanel icon={statusIcons.danger} title="真实接口读取失败" description="当前不会展示静态演示数据，请重试或返回重新选择任务。" />
          <Space className="toolbar" wrap>
            <Button
              type="primary"
              onClick={() => {
                setLoadState("idle");
                setApiDetail({});
                void Promise.resolve().then(() => {
                  window.location.reload();
                });
              }}
            >
              重试
            </Button>
          </Space>
        </Card>
      ) : null}

      <div className="detail-grid">
        <Card className="panel document-preview" aria-label="文档预览占位">
          <SectionTitle title="文档预览" />
          {documentPreview.status === "success" ? (
            <div className="document-preview-frame">
              {documentPreview.mimeType.startsWith("image/") ? (
                <img alt={documentPreview.fileName} src={documentPreview.url} />
              ) : documentPreview.mimeType === "application/pdf" ? (
                <object aria-label={documentPreview.fileName} data={documentPreview.url} type="application/pdf">
                  <a href={documentPreview.url} download={documentPreview.fileName}>
                    下载 {documentPreview.fileName}
                  </a>
                </object>
              ) : (
                <a className="secondary-button" href={documentPreview.url} download={documentPreview.fileName}>
                  下载 {documentPreview.fileName}
                </a>
              )}
            </div>
          ) : (
            <div className="preview-placeholder">
              <AppIcon icon={actionIcons.createRecognition} size="lg" tone="blue" tile />
              <strong>PDF / 图片预览区域</strong>
              <span>
                {documentPreview.status === "error"
                  ? `原始文档读取失败：${documentPreview.message}`
                  : "点击原始文档读取真实上传文件，读取后展示 PDF 或图片预览。"}
              </span>
            </div>
          )}
        </Card>

        <Card className="panel">
          <SectionTitle title="OCR 文本" />
          {displayOcrText ? (
            <pre className="ocr-text">{displayOcrText}</pre>
          ) : (
            <EmptyPanel icon={statusIcons.neutral} title="暂无 OCR 文本" description="当前任务还没有返回 OCR 文本。" />
          )}
        </Card>
      </div>

      <Card className="panel">
        <SectionTitle title="字段候选表" />
        {displayFields.length > 0 ? (
          <div className="table-scroll">
            <Table columns={fieldColumns} data={displayFields} rowKey="field" pagination={false} scroll={{ x: 760 }} />
          </div>
        ) : (
          <EmptyPanel icon={statusIcons.neutral} title="暂无字段候选" description="当前任务还没有返回可复核的字段结果。" />
        )}
      </Card>

      <div className="detail-grid">
        <Card className="evidence-panel u-surface" data-guide="field-evidence">
          <SectionTitle title="证据面板" />
          {displayEvidenceItems.length > 0 ? (
            <>
              <div className="trace-list evidence-tabs" role="list" aria-label="证据列表">
                {displayEvidenceItems.map((item) => (
                  <Button
                    key={item.id}
                    type={item.id === selectedEvidenceId ? "primary" : "outline"}
                    aria-label={`查看 ${item.field} 的证据`}
                    aria-pressed={item.id === selectedEvidenceId}
                    onClick={() => setSelectedEvidenceId(item.id)}
                  >
                    {item.field}
                  </Button>
                ))}
              </div>
              {selectedEvidence ? (
                <article className="evidence-card">
                  <h3>{selectedEvidence.field}</h3>
                  <p>{selectedEvidence.quote}</p>
                  <span>
                    第 {selectedEvidence.page} 页 · 置信度 {formatPercent(selectedEvidence.confidence)}
                  </span>
                </article>
              ) : null}
            </>
          ) : (
            <EmptyPanel icon={actionIcons.createRecognition} title="暂无证据" description="当前任务没有可展示证据。" />
          )}
        </Card>

        <Card className="panel">
          <SectionTitle title="Payload Preview" />
          <pre className="payload-preview">{JSON.stringify(displayPayload, null, 2)}</pre>
        </Card>
      </div>

      <div className="detail-grid">
        <Card className="panel" data-guide="langgraph-workflow">
          <SectionTitle title="LangGraph Trace" />
          {displayTraceSteps.length > 0 ? (
            <ol className="trace-list">
              {displayTraceSteps.map((step) => (
                <li key={step.id}>
                  <div>
                    <strong>{step.node}</strong>
                    <span>{step.durationMs}ms</span>
                  </div>
                  <StatusPill
                    label={step.status === "done" ? "完成" : step.status === "active" ? "运行中" : "阻塞"}
                    tone={step.status === "done" ? "completed" : step.status === "active" ? "running" : "failed"}
                  />
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyPanel icon={statusIcons.neutral} title="暂无 Trace" description="当前任务还没有返回流程节点。" />
          )}
        </Card>

        <Card className="panel" data-guide="auto-decision">
          <SectionTitle title="自动决策" />
          <div className="decision-grid">
            {decisionCards.map((card) => (
              <article key={card.level} className={`decision-card is-${card.level}`}>
                <DecisionPill decision={card.level} />
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <Button type="outline" aria-label={card.action} disabled title="该决策动作需要接入复核策略 API 后启用">
                  {card.action}
                </Button>
              </article>
            ))}
          </div>
        </Card>
      </div>

      <Card className="panel" data-guide="feedback">
      <form onSubmit={handleFeedbackSubmit}>
        <SectionTitle title="反馈提交" />
        <div className="form-grid">
          <Form.Item label="复核人">
            <Input
              aria-label="复核人"
              value={feedback.reviewer}
              onChange={(value) => setFeedback({ ...feedback, reviewer: value })}
            />
          </Form.Item>

          <Form.Item label="字段">
            <Select
              aria-label="选择反馈字段"
              value={feedback.field}
              onChange={(value) => setFeedback({ ...feedback, field: String(value) })}
            >
              {displayFields.map((candidate) => (
                <Select.Option key={candidate.field} value={candidate.field}>
                  {candidate.field}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="反馈结论">
            <Select
              aria-label="选择反馈结论"
              value={feedback.decision}
              onChange={(value) => setFeedback({ ...feedback, decision: String(value) as FeedbackState["decision"] })}
            >
              <Select.Option value="accept">采纳候选值</Select.Option>
              <Select.Option value="reject">驳回候选值</Select.Option>
              <Select.Option value="needs_more_evidence">需要更多证据</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="修正值">
            <Input
              aria-label="修正值"
              placeholder="不填写则沿用候选值"
              value={feedback.correctedValue}
              onChange={(value) => setFeedback({ ...feedback, correctedValue: value })}
            />
          </Form.Item>
        </div>

        <Form.Item label="反馈说明">
          <Input.TextArea
            aria-label="反馈说明"
            rows={4}
            value={feedback.note}
            onChange={(value) => setFeedback({ ...feedback, note: value })}
          />
        </Form.Item>

        <Space className="toolbar" wrap>
          <Button
            type="primary"
            htmlType="submit"
            aria-label="提交复核反馈"
            disabled={submitState === "loading"}
            loading={submitState === "loading"}
            icon={<AppIcon icon={submitState === "loading" ? commonUiIcons.loading : actionIcons.next} size="sm" className={submitState === "loading" ? "is-spinning" : undefined} />}
          >
            {submitState === "loading" ? "提交中" : "提交反馈"}
          </Button>
          <Button
            type="outline"
            aria-label="插入证据说明"
            onClick={() =>
              setFeedback({
                ...feedback,
                note: selectedEvidence ? `参考证据：${selectedEvidence.quote}` : feedback.note,
              })
            }
            icon={<AppIcon icon={dashboardMetricIcons.reviewQueue} size="sm" />}
          >
            引用证据
          </Button>
        </Space>

        {submittedMessage ? <Alert type="success" showIcon content={submittedMessage} /> : null}
        {submitState === "error" ? <Alert type="error" showIcon content={`反馈提交失败：${submitError}`} /> : null}
      </form>
      </Card>
    </main>
  );
}
