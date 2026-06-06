import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons } from "../../icons/appIcons";
import { MetricCard, PayloadPreview, SectionHeader, StatusPill, Timeline } from "./components";
import { useAuth } from "../../auth/AuthContext";

type TraceStatus = "success" | "warning" | "failed";

type TraceSpan = {
  id: string;
  name: string;
  service: string;
  durationMs: number;
  status: TraceStatus;
  detail: string;
};

type TraceRun = {
  id: string;
  subject: string;
  startedAt: string;
  totalMs: number;
  status: TraceStatus;
  spans: TraceSpan[];
  payload: Record<string, unknown>;
};

type TraceLoadState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

const traceRuns: TraceRun[] = [
  {
    id: "TR-20260605-7781",
    subject: "合成样本 A / case-demo-001",
    startedAt: "2026-06-05 09:35:17",
    totalMs: 4812,
    status: "success",
    spans: [
      { id: "s1", name: "file.ingest", service: "demo-web", durationMs: 280, status: "success", detail: "接收 4 页 PDF，完成 SHA256 计算" },
      { id: "s2", name: "ocr.extract", service: "ocr-provider", durationMs: 1420, status: "success", detail: "OCR 返回 37 个文本块，平均置信度 0.94" },
      { id: "s3", name: "llm.extract", service: "responses-provider", durationMs: 2290, status: "success", detail: "结构化抽取 42 个字段，命中病历 schema v2" },
      { id: "s4", name: "writeback.prepare", service: "lims-adapter", durationMs: 822, status: "success", detail: "生成 LIMS payload，等待人工确认写回" }
    ],
    payload: { schema: "medical-record-v2", tokenUsage: 5821, provider: "OpenAI Responses", writebackReady: true }
  },
  {
    id: "TR-20260605-7780",
    subject: "合成样本 B / case-demo-002",
    startedAt: "2026-06-05 09:29:48",
    totalMs: 6320,
    status: "warning",
    spans: [
      { id: "s1", name: "file.ingest", service: "demo-web", durationMs: 310, status: "success", detail: "接收合成住院首页图片 2 页" },
      { id: "s2", name: "ocr.extract", service: "ocr-provider", durationMs: 1880, status: "warning", detail: "第 2 页存在印章遮挡，局部置信度下降" },
      { id: "s3", name: "llm.extract", service: "responses-provider", durationMs: 3480, status: "warning", detail: "出院日期为空，已生成人工复核 blocker" },
      { id: "s4", name: "writeback.prepare", service: "emr-adapter", durationMs: 650, status: "warning", detail: "因 blocker 禁止写回" }
    ],
    payload: { schema: "medical-record-v2", blockers: ["缺少出院日期人工确认"], writebackReady: false }
  }
];

const statusToneMap: Record<TraceStatus, "success" | "warning" | "danger"> = {
  success: "success",
  warning: "warning",
  failed: "danger"
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

function findTraceItems(result: Record<string, unknown>): unknown[] | undefined {
  for (const key of ["trace", "traceSteps", "steps"]) {
    const value = result[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  if (isRecord(result.payload)) {
    return findTraceItems(result.payload);
  }

  return undefined;
}

function normalizeTraceStatus(value: unknown): TraceStatus {
  // 后端 trace 状态来自 LangGraph 编排，当前可能返回 completed、skipped、failed 等不同命名。
  if (value === "failed" || value === "error" || value === "blocked") {
    return "failed";
  }

  if (value === "warning" || value === "skipped" || value === "active" || value === "running") {
    return "warning";
  }

  return "success";
}

export function parseTraceRunsFromResult(jobId: string, result: unknown): TraceRun[] {
  if (!isRecord(result)) {
    return [];
  }

  const traceItems = findTraceItems(result);
  if (!traceItems) {
    return [];
  }

  const spans = traceItems
    .map((item, index): TraceSpan | null => {
      if (!isRecord(item)) {
        return null;
      }

      const name = readString(item, ["node", "name", "step"]);
      if (!name) {
        return null;
      }

      return {
        id: readString(item, ["id", "traceId"]) ?? `API-T-${index + 1}`,
        name,
        service: readString(item, ["service", "provider"]) ?? "LangGraph",
        durationMs: readNumber(item, ["durationMs", "duration", "elapsedMs"]) ?? 0,
        status: normalizeTraceStatus(item.status),
        detail: readString(item, ["detail", "message", "description"]) ?? "真实接口返回的流程节点。"
      };
    })
    .filter((item): item is TraceSpan => Boolean(item));

  if (spans.length === 0) {
    return [];
  }

  const runStatus: TraceStatus = spans.some((span) => span.status === "failed")
    ? "failed"
    : spans.some((span) => span.status === "warning")
      ? "warning"
      : "success";

  return [
    {
      id: readString(result, ["traceId", "id"]) ?? jobId,
      subject: readString(result, ["subject", "caseName", "fileName"]) ?? `识别任务 ${jobId}`,
      startedAt: readString(result, ["startedAt", "createdAt", "updatedAt"]) ?? "真实接口返回",
      totalMs: readNumber(result, ["totalMs", "durationMs", "elapsedMs"]) ?? spans.reduce((sum, span) => sum + span.durationMs, 0),
      status: runStatus,
      spans,
      payload: isRecord(result.payload) ? result.payload : result
    }
  ];
}

export function AgentTracePage() {
  const { api } = useAuth();
  const [traceRunsFromApi, setTraceRunsFromApi] = useState<TraceRun[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [jobIdInput, setJobIdInput] = useState("job-demo-1");
  const [activeJobId, setActiveJobId] = useState("job-demo-1");
  const [loadState, setLoadState] = useState<TraceLoadState>({
    status: "idle",
    message: "等待读取真实结果 Trace。"
  });

  useEffect(() => {
    let isActive = true;

    async function loadTrace() {
      setLoadState({ status: "loading", message: `正在读取 ${activeJobId} 的 results.trace。` });

      try {
        const result = await api.getResult(activeJobId);
        const parsedRuns = parseTraceRunsFromResult(activeJobId, result);

        if (!isActive) {
          return;
        }

        const firstRun = parsedRuns[0];

        setTraceRunsFromApi(parsedRuns);
        setSelectedTraceId(firstRun?.id ?? "");
        setLoadState({
          status: "success",
          message:
            firstRun !== undefined
              ? `已从 results/${activeJobId} 读取到 ${firstRun.spans.length} 个 Trace 节点。`
              : `results/${activeJobId} 暂无 trace 字段，右侧展示清晰空状态。`
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setTraceRunsFromApi([]);
        setSelectedTraceId("");
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Trace 接口读取失败。"
        });
      }
    }

    void loadTrace();

    return () => {
      isActive = false;
    };
  }, [activeJobId, api]);

  function handleTraceSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextJobId = jobIdInput.trim();
    if (nextJobId.length > 0) {
      setActiveJobId(nextJobId);
    }
  }

  const filteredRuns = useMemo(
    () =>
      traceRunsFromApi.filter((trace) => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) {
          return true;
        }
        return `${trace.id} ${trace.subject}`.toLowerCase().includes(keyword);
      }),
    [query, traceRunsFromApi]
  );
  const selectedTrace = traceRunsFromApi.find((trace) => trace.id === selectedTraceId) ?? traceRunsFromApi[0];
  const fallbackTrace = traceRuns[0];
  const slowestSpan = selectedTrace?.spans.reduce<TraceSpan | null>(
    (current, span) => (current === null || span.durationMs > current.durationMs ? span : current),
    null
  );

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 16"
        title="Agent Trace"
        description="补齐 Agent 执行链路观测页，帮助演示 OCR、LLM、写回准备等节点的耗时和状态。"
        actions={
          <>
            <form className="toolbar" onSubmit={handleTraceSearch}>
              <label className="toolbar-control">
                <AppIcon icon={navigationIcons.agentTrace} size="sm" />
                <span>Job</span>
                <input value={jobIdInput} onChange={(event) => setJobIdInput(event.target.value)} />
              </label>
              <button className="secondary-button" type="submit" disabled={loadState.status === "loading"}>
                <AppIcon icon={actionIcons.refresh} size="sm" className={loadState.status === "loading" ? "is-spinning" : undefined} />
                {loadState.status === "loading" ? "读取中" : "读取 Trace"}
              </button>
            </form>
            <label className="toolbar-control">
              <AppIcon icon={navigationIcons.agentTrace} size="sm" />
              <span>搜索</span>
              <input value={query} placeholder="Trace ID 或样本" onChange={(event) => setQuery(event.target.value)} />
            </label>
          </>
        }
      />

      <p role={loadState.status === "error" ? "alert" : "status"} className="page-subtle-note">
        {loadState.status === "error"
          ? `Trace 读取失败：${loadState.message}。下方本地参考样例仍可辅助理解页面结构。`
          : loadState.message}
      </p>

      <section className="metric-grid" aria-label="Trace 指标">
        <MetricCard label="Trace 数" value={`${traceRunsFromApi.length}`} hint="来自 results.trace 的真实记录" tone="info" />
        <MetricCard label="当前耗时" value={selectedTrace ? `${selectedTrace.totalMs}ms` : "-"} hint="端到端执行时间" tone="warning" />
        <MetricCard label="最慢节点" value={slowestSpan?.name ?? "-"} hint={slowestSpan ? `${slowestSpan.durationMs}ms` : "无数据"} tone="danger" />
      </section>

      <section className="operations-split">
        <section className="panel">
          <div className="panel-header">
            <h2>
              <AppIcon icon={dashboardMetricIcons.apiHealth} size="md" />
              Trace Runs
            </h2>
            <StatusPill tone="info">{filteredRuns.length} 条</StatusPill>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Trace</th>
                <th>样本</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.length > 0 ? (
                filteredRuns.map((trace) => (
                  <tr key={trace.id} className={selectedTrace?.id === trace.id ? "is-selected" : undefined}>
                    <td>
                      <button className="link-button" type="button" onClick={() => setSelectedTraceId(trace.id)}>
                        {trace.id}
                      </button>
                    </td>
                    <td>{trace.subject}</td>
                    <td>{trace.startedAt}</td>
                    <td>{trace.totalMs}ms</td>
                    <td>
                      <StatusPill tone={statusToneMap[trace.status]}>
                        {trace.status === "success" ? "成功" : trace.status === "warning" ? "告警" : "失败"}
                      </StatusPill>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>当前真实结果没有可展示 Trace，请换一个 jobId 或先创建识别任务。</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="stack">
          {selectedTrace ? (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={actionIcons.viewFlow} size="md" />
                    Span Timeline
                  </h2>
                  <StatusPill tone={statusToneMap[selectedTrace.status]}>{selectedTrace.id}</StatusPill>
                </div>
                <Timeline
                  items={selectedTrace.spans.map((span) => ({
                    title: span.name,
                    meta: `${span.service} / ${span.durationMs}ms`,
                    detail: span.detail,
                    tone: statusToneMap[span.status]
                  }))}
                />
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={dashboardMetricIcons.reviewQueue} size="md" />
                    耗时分布
                  </h2>
                </div>
                <div className="trace-bars" aria-label="Span 耗时分布">
                  {selectedTrace.spans.map((span) => (
                    <div key={span.id} className="trace-bars__row">
                      <span>{span.name}</span>
                      <meter min={0} max={selectedTrace.totalMs} value={span.durationMs}>
                        {span.durationMs}ms
                      </meter>
                      <strong>{span.durationMs}ms</strong>
                    </div>
                  ))}
                </div>
              </section>
              <PayloadPreview title="Trace Metadata" payload={selectedTrace.payload} />
            </>
          ) : (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={actionIcons.viewFlow} size="md" />
                    Span Timeline
                  </h2>
                  <StatusPill tone="neutral">无真实 Trace</StatusPill>
                </div>
                <p className="page-subtle-note">真实 results 返回中暂未包含 trace 数组，未展示伪造链路。</p>
              </section>
              <PayloadPreview title="本地参考样例" payload={fallbackTrace} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default AgentTracePage;
