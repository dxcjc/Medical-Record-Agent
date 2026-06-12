import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Input, Table } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import {
  normalizeTraceRunsFromRecognitionResult,
  type TraceRunView,
  type TraceSpanView,
  type TraceStatusView
} from "../../api/normalizers";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons } from "../../icons/appIcons";
import { MetricCard, PayloadPreview, SectionHeader, StatusPill, Timeline } from "./components";
import { useAuth } from "../../auth/AuthContext";

type TraceStatus = TraceStatusView;
type TraceSpan = TraceSpanView;
type TraceRun = TraceRunView;

type TraceLoadState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

const traceRuns: TraceRun[] = [];

const statusToneMap: Record<TraceStatus, "success" | "warning" | "danger"> = {
  success: "success",
  warning: "warning",
  failed: "danger"
};

export const parseTraceRunsFromResult = normalizeTraceRunsFromRecognitionResult;

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
  const traceColumns: TableColumnProps<TraceRun>[] = [
    {
      title: "Trace",
      dataIndex: "id",
      render: (_, trace) => (
        <Button type="text" onClick={() => setSelectedTraceId(trace.id)}>
          {trace.id}
        </Button>
      ),
    },
    { title: "样本", dataIndex: "subject" },
    { title: "开始时间", dataIndex: "startedAt" },
    { title: "耗时", dataIndex: "totalMs", render: (_, trace) => `${trace.totalMs}ms` },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, trace) => (
        <StatusPill tone={statusToneMap[trace.status]}>
          {trace.status === "success" ? "成功" : trace.status === "warning" ? "告警" : "失败"}
        </StatusPill>
      ),
    },
  ];

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 16"
        title="Agent Trace 追踪"
        description="补齐 Agent 执行链路观测页，帮助演示 OCR、LLM、写回准备等节点的耗时和状态。"
        actions={
          <>
            <form className="toolbar" onSubmit={handleTraceSearch}>
              <Form.Item label="Job">
                <Input value={jobIdInput} onChange={setJobIdInput} prefix={<AppIcon icon={navigationIcons.agentTrace} size="sm" />} />
              </Form.Item>
              <Button type="outline" htmlType="submit" disabled={loadState.status === "loading"} loading={loadState.status === "loading"} icon={<AppIcon icon={actionIcons.refresh} size="sm" className={loadState.status === "loading" ? "is-spinning" : undefined} />}>
                {loadState.status === "loading" ? "读取中" : "读取 Trace"}
              </Button>
            </form>
            <Form.Item label="搜索">
              <Input value={query} placeholder="Trace ID 或样本" onChange={setQuery} prefix={<AppIcon icon={navigationIcons.agentTrace} size="sm" />} />
            </Form.Item>
          </>
        }
      />

      <Alert type={loadState.status === "error" ? "warning" : "info"} showIcon content={loadState.status === "error" ? `Trace 读取失败：${loadState.message}。下方本地参考样例仍可辅助理解页面结构。` : loadState.message} />

      <section className="metric-grid" aria-label="Trace 指标">
        <MetricCard label="Trace 数" value={`${traceRunsFromApi.length}`} hint="来自 results.trace 的真实记录" tone="info" />
        <MetricCard label="当前耗时" value={selectedTrace ? `${selectedTrace.totalMs}ms` : "-"} hint="端到端执行时间" tone="warning" />
        <MetricCard label="最慢节点" value={slowestSpan?.name ?? "-"} hint={slowestSpan ? `${slowestSpan.durationMs}ms` : "无数据"} tone="danger" />
      </section>

      <section className="operations-split">
        <Card className="panel">
          <div className="panel-header">
            <h2>
              <AppIcon icon={dashboardMetricIcons.apiHealth} size="md" />
              Trace Runs
            </h2>
            <StatusPill tone="info">{filteredRuns.length} 条</StatusPill>
          </div>
          <Table columns={traceColumns} data={filteredRuns} rowKey="id" pagination={false} scroll={{ x: 820 }} />
        </Card>

        <div className="stack">
          {selectedTrace ? (
            <>
              <Card className="panel">
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
              </Card>
              <Card className="panel">
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
              </Card>
              <PayloadPreview title="Trace Metadata" payload={selectedTrace.payload} />
            </>
          ) : (
            <>
              <Card className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={actionIcons.viewFlow} size="md" />
                    Span Timeline
                  </h2>
                  <StatusPill tone="neutral">无真实 Trace</StatusPill>
                </div>
                <p className="page-subtle-note">真实 results 返回中暂未包含 trace 数组，未展示伪造链路。</p>
              </Card>
              <PayloadPreview title="本地参考样例" payload={fallbackTrace} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default AgentTracePage;
