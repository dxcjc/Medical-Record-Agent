import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Collapse, Form, Input, Select, Space } from "@arco-design/web-react";
import { useNavigate, useParams } from "react-router-dom";
import type { CreateFeedbackInput } from "../../api/client";
import {
  normalizeRecognitionDetail,
  type RecognitionDetailState
} from "../../api/normalizers";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons, statusIcons } from "../../icons/appIcons";
import {
  type EvidenceItem,
  type FieldCandidate,
  formatPercent,
  type TraceStep,
} from "./components/demoData";
import {
  DecisionPill,
  EmptyPanel,
  MetricCard,
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
  field: "主诉",
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

export const parseApiDetail = normalizeRecognitionDetail;

type ReviewFieldStatus = "passed" | "low_confidence" | "missing" | "conflict" | "modified" | "unconfirmed";

type ReviewFieldRow = FieldCandidate & {
  reviewStatus: ReviewFieldStatus;
  originalValue: string;
  confirmedValue: string;
};

type ReviewSummaryInput = {
  status?: string | undefined;
  fields: FieldCandidate[];
  evidence: EvidenceItem[];
  ocrText: string;
};

type TimelineItem = {
  key: string;
  label: string;
  status: "done" | "active" | "pending" | "failed";
  message?: string;
};

function mapFieldStatus(candidate: FieldCandidate): ReviewFieldStatus {
  if (!candidate.value) {
    return "missing";
  }
  if (candidate.decision === "red") {
    return "conflict";
  }
  if (candidate.decision === "yellow" || candidate.confidence < 0.75) {
    return "low_confidence";
  }
  return "passed";
}

export function buildReviewFieldRows(fields: FieldCandidate[]): ReviewFieldRow[] {
  const rank: Record<ReviewFieldStatus, number> = {
    missing: 0,
    conflict: 1,
    low_confidence: 2,
    modified: 3,
    unconfirmed: 4,
    passed: 5
  };

  return fields
    .map((field) => ({
      ...field,
      reviewStatus: mapFieldStatus(field),
      originalValue: field.value,
      confirmedValue: field.value
    }))
    .sort((left, right) => rank[left.reviewStatus] - rank[right.reviewStatus]);
}

export function buildReviewSummary(input: ReviewSummaryInput) {
  const rows = buildReviewFieldRows(input.fields);
  const pendingFieldCount = rows.filter((row) => row.reviewStatus !== "passed").length;
  const highConfidenceFieldCount = rows.filter((row) => row.reviewStatus === "passed").length;

  return {
    statusLabel:
      input.status === "failed"
        ? "识别失败"
        : input.status === "completed"
          ? "已完成"
          : input.status === "needs_review"
            ? "等待复核"
            : "处理中",
    pendingFieldCount,
    highConfidenceFieldCount,
    warningCount: pendingFieldCount,
    evidenceCount: input.evidence.length,
    hasOcrText: input.ocrText.trim().length > 0
  };
}

export function buildTaskTimeline(status: string | undefined, failedMessage?: string): TimelineItem[] {
  if (status === "failed") {
    return [
      { key: "uploaded", label: "上传完成", status: "done" },
      { key: "stored", label: "文件保存完成", status: "done" },
      { key: "failed", label: "识别失败", status: "failed", message: failedMessage ?? "任务执行失败，请检查识别能力后重试。" },
      { key: "review", label: "等待复核", status: "pending" }
    ];
  }

  const activeKey =
    status === "ocr_running"
      ? "ocr"
      : status === "extracting"
        ? "extract"
        : status === "validating"
          ? "validate"
          : status === "needs_review" || status === "completed"
            ? "review"
            : "uploaded";
  const order = ["uploaded", "stored", "ocr", "extract", "validate", "review"];
  const activeIndex = order.indexOf(activeKey);

  return [
    { key: "uploaded", label: "上传完成", status: activeIndex > 0 ? "done" : activeKey === "uploaded" ? "active" : "pending" },
    { key: "stored", label: "文件保存完成", status: activeIndex > 1 ? "done" : activeIndex === 1 ? "active" : "pending" },
    { key: "ocr", label: activeKey === "ocr" ? "PaddleOCR 识别中" : "PaddleOCR 识别完成", status: activeIndex > 2 ? "done" : activeKey === "ocr" ? "active" : "pending" },
    { key: "extract", label: "模型抽取", status: activeIndex > 3 ? "done" : activeKey === "extract" ? "active" : "pending" },
    { key: "validate", label: "字段校验", status: activeIndex > 4 ? "done" : activeKey === "validate" ? "active" : "pending" },
    { key: "review", label: "等待复核", status: status === "completed" ? "done" : activeKey === "review" ? "active" : "pending" }
  ];
}

const REVIEW_STATUS_LABEL: Record<ReviewFieldStatus, string> = {
  passed: "已通过",
  low_confidence: "低置信",
  missing: "缺失",
  conflict: "冲突",
  modified: "已修改",
  unconfirmed: "未确认"
};

const REVIEW_STATUS_TONE: Record<ReviewFieldStatus, "completed" | "failed" | "review"> = {
  passed: "completed",
  low_confidence: "review",
  missing: "failed",
  conflict: "failed",
  modified: "review",
  unconfirmed: "review"
};

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { api } = useAuth();
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [submittedMessage, setSubmittedMessage] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [apiDetail, setApiDetail] = useState<RecognitionDetailState>({});
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState>({ status: "idle" });
  const routeJobId = jobId ?? "";
  const displayJobId = apiDetail.jobId ?? routeJobId;

  // Always use real API data only - no demo/mock fallback
  const displayFields = apiDetail.fields ?? [];
  const displayEvidenceItems = apiDetail.evidence ?? [];
  const displayTraceSteps = apiDetail.trace ?? [];
  const displayPayload = apiDetail.payload ?? {};
  const displayOcrText = apiDetail.ocrText ?? "";

  const reviewRows = buildReviewFieldRows(displayFields);
  const reviewSummary = buildReviewSummary({
    status: apiDetail.status,
    fields: displayFields,
    evidence: displayEvidenceItems,
    ocrText: displayOcrText
  });
  const timelineItems = buildTaskTimeline(apiDetail.status, loadError);

  useEffect(() => {
    if (!routeJobId) {
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
        title="识别结果复核"
        description={`${displayJobId} · 查看原件、OCR 文本、结构化字段和证据，确认后保存复核结果。`}
        actions={
          <Button
            type="outline"
            aria-label="打开原始文档"
            disabled={documentPreview.status === "loading"}
            onClick={handleOpenDocument}
            icon={<AppIcon icon={actionIcons.createRecognition} size="sm" />}
          >
            {documentPreview.status === "loading" ? "读取中" : "原始文档"}
          </Button>
        }
      />

      {!routeJobId ? (
        <Alert
          type="warning"
          showIcon
          content="当前未指定任务 ID，请从识别任务列表进入详情页。"
        />
      ) : (
        <Alert
          type={loadState === "error" ? "warning" : loadState === "loading" ? "info" : "success"}
          showIcon
          content={
            loadState === "loading"
              ? `正在加载任务 ${routeJobId} 的真实识别数据。`
              : loadState === "error"
                ? `真实接口读取失败：${loadError}`
                : `已加载任务 ${displayJobId} 的真实数据。`
          }
        />
      )}

      {loadState === "error" ? (
        <Card className="panel">
          <EmptyPanel icon={statusIcons.danger} title="真实接口读取失败" description="请重试或返回重新选择任务。" />
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

      {displayFields.length === 0 && displayEvidenceItems.length === 0 && !displayOcrText && loadState !== "loading" && routeJobId ? (
        <Card
          className="panel"
          style={{ borderColor: "#3370FF", borderWidth: 2, borderStyle: "solid" }}
          aria-label="空状态引导"
        >
          <EmptyPanel
            icon={dashboardMetricIcons.taskVolume}
            title="暂无识别结果"
            description="请先上传文档进行识别，识别完成后结果将在此处展示。"
            action={
              <Button
                type="primary"
                onClick={() => navigate("/recognition/new")}
              >
                上传文档进行识别
              </Button>
            }
          />
        </Card>
      ) : null}

      <section className="metric-grid" aria-label="识别复核摘要">
        <MetricCard label="任务状态" value={reviewSummary.statusLabel} description="当前识别流程状态" icon={statusIcons.running} tone="info" />
        <MetricCard label="待复核字段" value={`${reviewSummary.pendingFieldCount}`} description="缺失、冲突或低置信字段" icon={dashboardMetricIcons.reviewQueue} tone={reviewSummary.pendingFieldCount > 0 ? "warning" : "success"} />
        <MetricCard label="高置信字段" value={`${reviewSummary.highConfidenceFieldCount}`} description="可直接采纳的字段" icon={dashboardMetricIcons.decisionPass} tone="success" />
        <MetricCard label="质量告警" value={`${reviewSummary.warningCount}`} description="需要人工关注的问题" icon={statusIcons.warning} tone={reviewSummary.warningCount > 0 ? "warning" : "neutral"} />
      </section>

      {displayFields.length > 0 ? (
        <Card className="panel" style={{ marginBottom: 16 }}>
          <SectionTitle title="核心识别结果" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {displayFields
              .filter((f) => {
                const name = f.field.toLowerCase();
                return name.includes("患者") || name.includes("姓名") || name.includes("日期") || name.includes("年龄") || name.includes("性别") || name.includes("主诉") || name.includes("诊断");
              })
              .slice(0, 6)
              .map((f) => {
                const isAbnormal = f.decision === "red";
                const isWarning = f.decision === "yellow";
                const borderColor = isAbnormal ? "#F53F3F" : isWarning ? "#FF7D00" : "#00B42A";
                const bgColor = isAbnormal ? "#FFF2F0" : isWarning ? "#FFF7E6" : "#E8FFEA";
                return (
                  <div
                    key={f.field}
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      borderLeft: `4px solid ${borderColor}`,
                      background: bgColor,
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#86909C", marginBottom: 8 }}>{f.field}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: isAbnormal ? "#F53F3F" : "#1D2129", marginBottom: 8 }}>
                      {f.value || "未识别"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "#86909C" }}>置信度 {formatPercent(f.confidence)}</span>
                      {isAbnormal ? (
                        <span style={{ color: "#F53F3F", fontWeight: 600 }}>异常</span>
                      ) : isWarning ? (
                        <span style={{ color: "#FF7D00", fontWeight: 600 }}>待确认</span>
                      ) : (
                        <span style={{ color: "#00B42A", fontWeight: 600 }}>正常</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      ) : null}

      <Card className="panel recognition-timeline-card">
        <SectionTitle title="识别进度" />
        <ol className="recognition-timeline">
          {timelineItems.map((item) => (
            <li key={item.key} className={`recognition-timeline__item is-${item.status}`}>
              <span>{item.label}</span>
              {item.message ? <p>{item.message}</p> : null}
            </li>
          ))}
        </ol>
      </Card>

      <div className="review-workspace">
        <section className="review-workspace__source">
          <Card className="panel document-preview" aria-label="文档预览占位">
            <SectionTitle title="原件预览" />
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

          {displayEvidenceItems.length > 0 ? (
            <Card className="evidence-panel u-surface" data-guide="field-evidence">
              <SectionTitle title="证据面板" />
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
            </Card>
          ) : null}
        </section>

        <section className="review-workspace__fields">
          <Card className="panel" data-guide="field-review">
            <SectionTitle title="字段复核" />
            {reviewRows.length > 0 ? (
              <div className="review-field-list">
                {reviewRows.map((field) => (
                  <button
                    key={field.field}
                    type="button"
                    className={`review-field-row is-${field.reviewStatus}`}
                    onClick={() => setFeedback((current) => ({ ...current, field: field.field, correctedValue: field.confirmedValue }))}
                  >
                    <span>{field.field}</span>
                    <strong>{field.confirmedValue || "未识别"}</strong>
                    <small>模型值：{field.originalValue || "空"}</small>
                    <StatusPill label={REVIEW_STATUS_LABEL[field.reviewStatus]} tone={REVIEW_STATUS_TONE[field.reviewStatus]} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={statusIcons.neutral} title="暂无字段候选" description="当前任务还没有返回可复核的字段结果。" />
            )}
          </Card>

          <Card className="panel" data-guide="feedback">
            <form onSubmit={handleFeedbackSubmit}>
              <SectionTitle title="字段复核" />
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
                  aria-label="保存复核"
                  disabled={submitState === "loading"}
                  loading={submitState === "loading"}
                  icon={<AppIcon icon={submitState === "loading" ? commonUiIcons.loading : actionIcons.next} size="sm" className={submitState === "loading" ? "is-spinning" : undefined} />}
                >
                  {submitState === "loading" ? "保存中" : "保存复核"}
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

          <div className="detail-grid">
            <Card className="panel" data-guide="auto-decision">
              <SectionTitle title="自动决策" />
              {displayFields.length > 0 ? (
                <div className="decision-grid">
                  {(() => {
                    const greenFields = displayFields.filter((f) => f.decision === "green");
                    const yellowFields = displayFields.filter((f) => f.decision === "yellow");
                    const redFields = displayFields.filter((f) => f.decision === "red");

                    const cards = [];
                    if (greenFields.length > 0) {
                      cards.push({
                        level: "green" as const,
                        title: "绿色：可自动写回",
                        description: `${greenFields.length} 个字段证据清晰，满足自动写回阈值。`,
                        action: "写入草稿",
                      });
                    }
                    if (yellowFields.length > 0) {
                      cards.push({
                        level: "yellow" as const,
                        title: "黄色：需要复核",
                        description: `${yellowFields.length} 个字段置信度较低，需要复核员确认。`,
                        action: "加入复核",
                      });
                    }
                    if (redFields.length > 0) {
                      cards.push({
                        level: "red" as const,
                        title: "红色：阻断",
                        description: `${redFields.length} 个字段缺少明确原文证据，不允许自动写回。`,
                        action: "标记阻断",
                      });
                    }

                    return cards.map((card) => (
                      <article key={card.level} className={`decision-card is-${card.level}`}>
                        <DecisionPill decision={card.level} />
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                        <Button type="outline" aria-label={card.action} disabled title="该决策动作需要接入复核策略 API 后启用">
                          {card.action}
                        </Button>
                      </article>
                    ));
                  })()}
                </div>
              ) : (
                <EmptyPanel icon={statusIcons.neutral} title="暂无决策数据" description="识别完成后，自动决策将在此处展示。" />
              )}
            </Card>
          </div>
        </section>
      </div>

      <Collapse defaultActiveKey={[]} style={{ marginBottom: 16 }}>
        <Collapse.Item header="详细技术信息" name="technical">
          <div className="detail-grid">
            <Card className="panel">
              <SectionTitle title="Payload" />
              <pre className="payload-preview">{JSON.stringify(displayPayload, null, 2)}</pre>
            </Card>

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
          </div>
        </Collapse.Item>
        <Collapse.Item header="OCR 原始文本" name="ocr">
          {displayOcrText ? (
            <pre className="ocr-text">{displayOcrText}</pre>
          ) : (
            <EmptyPanel icon={statusIcons.neutral} title="暂无 OCR 文本" description="当前任务还没有返回 OCR 文本。" />
          )}
        </Collapse.Item>
        <Collapse.Item header="全部字段候选" name="fields">
          {reviewRows.length > 0 ? (
            <div className="review-field-list">
              {reviewRows.map((field) => (
                <div
                  key={field.field}
                  className={`review-field-row is-${field.reviewStatus}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #F2F3F5" }}
                >
                  <span style={{ minWidth: 100 }}>{field.field}</span>
                  <strong>{field.confirmedValue || "未识别"}</strong>
                  <small style={{ color: "#86909C" }}>模型值：{field.originalValue || "空"}</small>
                  <StatusPill label={REVIEW_STATUS_LABEL[field.reviewStatus]} tone={REVIEW_STATUS_TONE[field.reviewStatus]} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={statusIcons.neutral} title="暂无字段候选" description="当前任务还没有返回可复核的字段结果。" />
          )}
        </Collapse.Item>
      </Collapse>

      <Card className="panel" style={{ marginBottom: 16 }}>
        <Space className="toolbar" wrap>
          <Button
            type="primary"
            aria-label="确认并导出"
            icon={<AppIcon icon={actionIcons.next} size="sm" />}
            onClick={() => {
              const exportData = {
                jobId: displayJobId,
                status: apiDetail.status,
                fields: displayFields,
                evidence: displayEvidenceItems,
                ocrText: displayOcrText,
                exportedAt: new Date().toISOString(),
              };
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `recognition-result-${displayJobId}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            确认并导出
          </Button>
          <Button
            type="outline"
            aria-label="返回任务列表"
            onClick={() => navigate("/recognition")}
          >
            返回列表
          </Button>
        </Space>
      </Card>
    </main>
  );
}
