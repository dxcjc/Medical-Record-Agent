import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ClipboardCheck,
  FileText,
  MessageSquarePlus,
  PanelRightOpen,
  Send,
} from "lucide-react";
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

type ApiDetailState = {
  jobId?: string;
  ocrText?: string;
  fields?: FieldCandidate[];
  evidence?: EvidenceItem[];
  trace?: TraceStep[];
  payload?: unknown;
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

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function normalizeDecision(value: unknown): FieldCandidate["decision"] {
  return value === "green" || value === "yellow" || value === "red" ? value : "yellow";
}

function normalizeTraceStatus(value: unknown): TraceStep["status"] {
  return value === "done" || value === "active" || value === "blocked" ? value : "done";
}

function findFirstArray(record: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = readArray(record[key]);
    if (value && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function parseFieldCandidates(result: unknown): FieldCandidate[] | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const sourceItems =
    findFirstArray(result, ["fields", "fieldCandidates", "candidates"]) ??
    (isRecord(result.payload) ? findFirstArray(result.payload, ["fields", "fieldCandidates", "candidates"]) : undefined);

  const parsed = sourceItems
    ?.map((item): FieldCandidate | null => {
      if (!isRecord(item)) {
        return null;
      }

      const field = readString(item, ["field", "name", "label"]);
      const value = readString(item, ["value", "candidateValue", "text"]);

      if (!field || !value) {
        return null;
      }

      return {
        field,
        value,
        confidence: readNumber(item, ["confidence", "score"]) ?? 0,
        source: readString(item, ["source", "evidenceSource", "location"]) ?? "真实接口返回",
        decision: normalizeDecision(item.decision),
      };
    })
    .filter((item): item is FieldCandidate => Boolean(item));

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function parseEvidenceItems(result: unknown): EvidenceItem[] | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const sourceItems =
    findFirstArray(result, ["evidence", "evidenceItems"]) ??
    (isRecord(result.payload) ? findFirstArray(result.payload, ["evidence", "evidenceItems"]) : undefined);

  const parsed = sourceItems
    ?.map((item, index): EvidenceItem | null => {
      if (!isRecord(item)) {
        return null;
      }

      const field = readString(item, ["field", "fieldName", "label"]);
      const quote = readString(item, ["quote", "text", "snippet"]);

      if (!field || !quote) {
        return null;
      }

      return {
        id: readString(item, ["id", "evidenceId"]) ?? `API-E-${index + 1}`,
        field,
        quote,
        page: readNumber(item, ["page", "pageNumber"]) ?? 1,
        confidence: readNumber(item, ["confidence", "score"]) ?? 0,
      };
    })
    .filter((item): item is EvidenceItem => Boolean(item));

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function parseTraceSteps(result: unknown): TraceStep[] | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const sourceItems =
    findFirstArray(result, ["trace", "traceSteps", "steps"]) ??
    (isRecord(result.payload) ? findFirstArray(result.payload, ["trace", "traceSteps", "steps"]) : undefined);

  const parsed = sourceItems
    ?.map((item, index): TraceStep | null => {
      if (!isRecord(item)) {
        return null;
      }

      const node = readString(item, ["node", "name", "step"]);

      if (!node) {
        return null;
      }

      return {
        id: readString(item, ["id", "traceId"]) ?? `API-T-${index + 1}`,
        node,
        status: normalizeTraceStatus(item.status),
        durationMs: readNumber(item, ["durationMs", "duration", "elapsedMs"]) ?? 0,
        detail: readString(item, ["detail", "message", "description"]) ?? "真实接口返回的流程节点。",
      };
    })
    .filter((item): item is TraceStep => Boolean(item));

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function parseOcrText(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const directText = readString(result, ["ocrText", "text", "rawText"]);
  if (directText) {
    return directText;
  }

  if (isRecord(result.payload)) {
    return readString(result.payload, ["ocrText", "text", "rawText"]);
  }

  return undefined;
}

function parseApiDetail(job: unknown, result: unknown): ApiDetailState {
  const jobRecord = isRecord(job) ? job : undefined;
  const resultRecord = isRecord(result) ? result : undefined;
  const detail: ApiDetailState = {};
  const jobId = jobRecord ? readString(jobRecord, ["id", "jobId"]) : undefined;
  const ocrText = parseOcrText(result);
  const fields = parseFieldCandidates(result);
  const evidence = parseEvidenceItems(result);
  const trace = parseTraceSteps(result);
  const payload = resultRecord && "payload" in resultRecord ? resultRecord.payload : undefined;

  // 后端当前仍可能调整返回结构，所以这里只做宽松读取；读不到的部分继续使用静态 demo 数据兜底。
  if (jobId) {
    detail.jobId = jobId;
  }

  if (ocrText) {
    detail.ocrText = ocrText;
  }

  if (fields) {
    detail.fields = fields;
  }

  if (evidence) {
    detail.evidence = evidence;
  }

  if (trace) {
    detail.trace = trace;
  }

  if (payload !== undefined) {
    detail.payload = payload;
  }

  return detail;
}

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
  const [apiDetail, setApiDetail] = useState<ApiDetailState>({});
  const routeJobId = jobId ?? "demo";
  const displayJobId = apiDetail.jobId ?? routeJobId;
  const displayFields = apiDetail.fields ?? fieldCandidates;
  const displayEvidenceItems = apiDetail.evidence ?? evidenceItems;
  const displayTraceSteps = apiDetail.trace ?? traceSteps;
  const displayPayload = apiDetail.payload ?? { ...payloadPreview, jobId: displayJobId };

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
        setLoadError(error instanceof Error ? error.message : "真实接口暂不可用，已展示 demo 兜底数据。");
      }
    }

    void loadDetail();

    return () => {
      isActive = false;
    };
  }, [api, routeJobId]);

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
      await api.createFeedback({
        jobId: displayJobId,
        field: candidate.field,
        originalValue: candidate.value,
        correctedValue: feedback.correctedValue.trim() || candidate.value,
        decision: feedback.decision,
        reason: feedback.note.trim() || "页面人工复核提交",
        reviewer: feedback.reviewer.trim() || "未填写复核人",
        confidence: candidate.confidence,
        evidenceId: selectedEvidence?.id,
        evidenceQuote: selectedEvidence?.quote,
      });

      setSubmitState("success");
      setSubmittedMessage(`${candidate.field} 的反馈已提交，决策为 ${feedback.decision}。`);
    } catch (error) {
      setSubmitState("error");
      setSubmitError(readErrorMessage(error));
    }
  }

  function handleGoWriteback() {
    const search = new URLSearchParams({ jobId: displayJobId });
    navigate(`/writeback?${search.toString()}`);
  }

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title={`任务详情 ${displayJobId}`}
        description="查看文档预览、OCR 文本、字段候选、证据、Payload、LangGraph trace 与人工反馈。"
        actions={
          <>
            <button className="secondary-button" type="button" aria-label="打开原始文档">
              <FileText size={16} aria-hidden="true" />
              原始文档
            </button>
            <button className="action-button" type="button" aria-label="确认绿色字段写回" onClick={handleGoWriteback}>
              <ClipboardCheck size={16} aria-hidden="true" />
              确认写回
            </button>
          </>
        }
      />

      <p role="status" className="page-subtle-note">
        {routeJobId === "demo"
          ? "当前为 demo 任务，展示静态识别样例。"
          : loadState === "loading"
            ? `正在加载任务 ${routeJobId} 的真实识别数据，静态样例会作为兜底保留。`
            : loadState === "error"
              ? `真实接口读取失败：${loadError} 当前继续展示 demo 兜底数据。`
              : `已尝试加载任务 ${displayJobId} 的真实数据，缺失部分继续使用 demo 兜底。`}
      </p>

      <div className="detail-grid">
        <section className="panel document-preview" aria-label="文档预览占位">
          <SectionTitle title="文档预览" />
          <div className="preview-placeholder">
            <PanelRightOpen size={40} aria-hidden="true" />
            <strong>PDF / 图片预览区域</strong>
            <span>主线程接入文件渲染器后，这里展示页码、缩放、框选证据坐标。</span>
          </div>
        </section>

        <section className="panel">
          <SectionTitle title="OCR 文本" />
          <pre className="ocr-text">{apiDetail.ocrText ?? demoOcrText}</pre>
        </section>
      </div>

      <section className="panel">
        <SectionTitle title="字段候选表" />
        <table className="data-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>候选值</th>
              <th>置信度</th>
              <th>来源</th>
              <th>自动决策</th>
            </tr>
          </thead>
          <tbody>
            {displayFields.map((candidate) => (
              <tr key={candidate.field}>
                <td>{candidate.field}</td>
                <td>{candidate.value}</td>
                <td>{formatPercent(candidate.confidence)}</td>
                <td>{candidate.source}</td>
                <td>
                  <DecisionPill decision={candidate.decision} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="detail-grid">
        <section className="evidence-panel">
          <SectionTitle title="证据面板" />
          <div className="trace-list" role="list" aria-label="证据列表">
            {displayEvidenceItems.map((item) => (
              <button
                key={item.id}
                className="secondary-button"
                type="button"
                aria-label={`查看 ${item.field} 的证据`}
                aria-pressed={item.id === selectedEvidenceId}
                onClick={() => setSelectedEvidenceId(item.id)}
              >
                {item.field}
              </button>
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
          ) : (
            <EmptyPanel icon={FileText} title="暂无证据" description="当前任务没有可展示证据。" />
          )}
        </section>

        <section className="panel">
          <SectionTitle title="Payload Preview" />
          <pre className="payload-preview">{JSON.stringify(displayPayload, null, 2)}</pre>
        </section>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <SectionTitle title="LangGraph Trace" />
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
        </section>

        <section className="panel">
          <SectionTitle title="自动决策" />
          <div className="decision-grid">
            {decisionCards.map((card) => (
              <article key={card.level} className={`decision-card is-${card.level}`}>
                <DecisionPill decision={card.level} />
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <button className="secondary-button" type="button" aria-label={card.action}>
                  {card.action}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      <form className="panel" onSubmit={handleFeedbackSubmit}>
        <SectionTitle title="反馈提交" />
        <div className="form-grid">
          <label className="field-row">
            <span>复核人</span>
            <input
              aria-label="复核人"
              value={feedback.reviewer}
              onChange={(event) => setFeedback({ ...feedback, reviewer: event.target.value })}
            />
          </label>

          <label className="field-row">
            <span>字段</span>
            <select
              aria-label="选择反馈字段"
              value={feedback.field}
              onChange={(event) => setFeedback({ ...feedback, field: event.target.value })}
            >
              {displayFields.map((candidate) => (
                <option key={candidate.field} value={candidate.field}>
                  {candidate.field}
                </option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>反馈结论</span>
            <select
              aria-label="选择反馈结论"
              value={feedback.decision}
              onChange={(event) =>
                setFeedback({ ...feedback, decision: event.target.value as FeedbackState["decision"] })
              }
            >
              <option value="accept">采纳候选值</option>
              <option value="reject">驳回候选值</option>
              <option value="needs_more_evidence">需要更多证据</option>
            </select>
          </label>

          <label className="field-row">
            <span>修正值</span>
            <input
              aria-label="修正值"
              placeholder="不填写则沿用候选值"
              value={feedback.correctedValue}
              onChange={(event) => setFeedback({ ...feedback, correctedValue: event.target.value })}
            />
          </label>
        </div>

        <label className="field-row">
          <span>反馈说明</span>
          <textarea
            aria-label="反馈说明"
            rows={4}
            value={feedback.note}
            onChange={(event) => setFeedback({ ...feedback, note: event.target.value })}
          />
        </label>

        <div className="toolbar">
          <button className="action-button" type="submit" aria-label="提交复核反馈" disabled={submitState === "loading"}>
            <Send size={16} aria-hidden="true" />
            {submitState === "loading" ? "提交中" : "提交反馈"}
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="插入证据说明"
            onClick={() =>
              setFeedback({
                ...feedback,
                note: selectedEvidence ? `参考证据：${selectedEvidence.quote}` : feedback.note,
              })
            }
          >
            <MessageSquarePlus size={16} aria-hidden="true" />
            引用证据
          </button>
        </div>

        {submittedMessage ? <p role="status">{submittedMessage}</p> : null}
        {submitState === "error" ? <p role="alert">反馈提交失败：{submitError}</p> : null}
      </form>
    </main>
  );
}
