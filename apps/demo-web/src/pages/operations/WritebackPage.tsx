import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Form, Input, Message, Space, Table } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import { useSearchParams } from "react-router-dom";
import type { ApiClient } from "../../api/client";
import {
  normalizeEligibleWritebackJob,
  normalizeRecognitionWritebackJob,
  type WritebackJobView
} from "../../api/normalizers";
import type { ExecuteWritebackInput } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { ConfirmDialog, InlineNotice, MetricCard, PayloadPreview, RowActionButton, SectionHeader, StatusPill } from "./components";

type WritebackStatus = "ready" | "blocked" | "running" | "done";
type WritebackResultTone = "success" | "warning" | "info";
type ApiLoadState = "idle" | "loading" | "success" | "error";
type EligibleLoadState = "idle" | "loading" | "success" | "error";

type WritebackJob = WritebackJobView;

type WritebackExecutionSnapshot =
  | { kind: "idle" }
  | { kind: "running"; jobId: string; target: string }
  | { kind: "succeeded"; jobId: string; target: string }
  | { kind: "cancelled"; jobId: string }
  | { kind: "failed"; jobId: string; errorMessage: string };

type WritebackExecutionDescriptor = {
  tone: "info" | "success" | "warning";
  title: string;
  message: string;
  canCancel: boolean;
  canRetry: boolean;
};

type DemoModeEnv = {
  readonly [key: string]: string | boolean | undefined;
};

const initialJobs: WritebackJob[] = [
  {
    id: "WB-20260605-001",
    subject: "合成样本 A / case-demo-001",
    target: "LIMS",
    extractedFields: 42,
    greenRules: ["医生签名已识别", "检验项目编码已匹配", "患者主索引命中唯一记录"],
    blockers: [],
    status: "ready",
    permission: "allowed",
    payload: {
      sampleNo: "S20260605001",
      subjectCode: "case-demo-001",
      diagnosis: "肺部结节复查",
      panels: ["NGS-肺癌 520 基因", "PD-L1 IHC"],
      source: "agent-extraction-v2"
    }
  },
  {
    id: "WB-20260605-002",
    subject: "合成样本 B / case-demo-002",
    target: "EMR",
    extractedFields: 29,
    greenRules: ["病历页码连续", "关键字段置信度均大于 0.92"],
    blockers: ["缺少出院日期人工确认"],
    status: "blocked",
    permission: "allowed",
    payload: {
      caseCode: "case-demo-002",
      department: "肿瘤内科",
      dischargeDate: null,
      warning: "出院日期字段需人工确认"
    }
  },
  {
    id: "WB-20260605-003",
    subject: "合成样本 C / case-demo-003",
    target: "Archive",
    extractedFields: 35,
    greenRules: ["原始文件 SHA256 已归档", "OCR 文本与结构化字段已绑定"],
    blockers: [],
    status: "ready",
    permission: "readonly",
    payload: {
      archiveBucket: "record-raw-files",
      retentionYears: 10,
      readonlyReason: "当前账号缺少 archive:write 权限"
    }
  }
];

export function isExplicitDemoMode(env: DemoModeEnv = import.meta.env) {
  return env.VITE_DEMO_MODE === "true";
}

const statusToneMap: Record<WritebackStatus, "success" | "warning" | "danger" | "info"> = {
  ready: "success",
  blocked: "danger",
  running: "info",
  done: "success"
};

const statusLabelMap: Record<WritebackStatus, string> = {
  ready: "可写回",
  blocked: "需处理",
  running: "执行中",
  done: "已完成"
};

export function readWritebackApiErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "写回 API 调用失败，请稍后重试或查看审计日志。";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export const normalizeApiJobToWritebackJob = normalizeRecognitionWritebackJob;

export function createWritebackRequest(job: WritebackJob) {
  const request: ExecuteWritebackInput = {
    jobId: job.id,
    confirmed: true
  };

  return request;
}

export const normalizeEligibleWritebackItem = normalizeEligibleWritebackJob;

export function describeWritebackExecutionState(snapshot: WritebackExecutionSnapshot): WritebackExecutionDescriptor {
  if (snapshot.kind === "running") {
    return {
      tone: "info",
      title: "写回执行中",
      message: `${snapshot.jobId} 正在写回 ${snapshot.target}，已锁定当前确认任务。`,
      canCancel: true,
      canRetry: false
    };
  }

  if (snapshot.kind === "succeeded") {
    return {
      tone: "success",
      title: "写回已完成",
      message: `${snapshot.jobId} 已完成写回，目标系统 ${snapshot.target} 返回成功。`,
      canCancel: false,
      canRetry: true
    };
  }

  if (snapshot.kind === "cancelled") {
    return {
      tone: "warning",
      title: "写回已取消",
      message: `${snapshot.jobId} 写回已取消，任务状态已恢复，可重新确认后重跑。`,
      canCancel: false,
      canRetry: true
    };
  }

  if (snapshot.kind === "failed") {
    return {
      tone: "warning",
      title: "写回失败",
      message: `${snapshot.jobId} 写回失败：${snapshot.errorMessage}。请检查 LIMS Provider 健康状态后重跑。`,
      canCancel: false,
      canRetry: true
    };
  }

  return {
    tone: "info",
    title: "等待写回",
    message: "选择满足 green 条件的任务后执行写回。",
    canCancel: false,
    canRetry: false
  };
}

export async function loadEligibleWritebackJobs(
  api: Pick<ApiClient, "listEligibleWritebacks">,
  currentJobs: WritebackJob[],
  currentSelectedJobId: string,
  limit = 20
) {
  try {
    const response = await api.listEligibleWritebacks(limit);
    const items = Array.isArray(response.items) ? response.items.map(normalizeEligibleWritebackItem) : [];

    if (items.length === 0) {
      return {
        jobs: currentJobs,
        selectedJobId: currentSelectedJobId,
        state: "success" as const,
        errorMessage: ""
      };
    }

    const nextJobs = [...items, ...currentJobs.filter((job) => !items.some((item) => item.id === job.id))];

    return {
      jobs: nextJobs,
      // 用户已通过手动 jobId 选中的任务仍保留焦点，避免后台 eligible 刷新抢走上下文。
      selectedJobId: nextJobs.some((job) => job.id === currentSelectedJobId)
        ? currentSelectedJobId
        : items[0]?.id ?? currentSelectedJobId,
      state: "success" as const,
      errorMessage: ""
    };
  } catch (error) {
    return {
      jobs: currentJobs,
      selectedJobId: currentSelectedJobId,
      state: "error" as const,
      errorMessage: readWritebackApiErrorMessage(error)
    };
  }
}

export function WritebackPage() {
  const { api, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const demoMode = isExplicitDemoMode();
  const routeJobId = searchParams.get("jobId") ?? "";
  const [jobs, setJobs] = useState<WritebackJob[]>(
    () => demoMode ? initialJobs.map((job) => ({ ...job, permission: "readonly" as const })) : []
  );
  const [selectedJobId, setSelectedJobId] = useState<string>(() => (demoMode ? initialJobs[0]?.id ?? "" : ""));
  const [jobIdInput, setJobIdInput] = useState(routeJobId);
  const [apiLoadState, setApiLoadState] = useState<ApiLoadState>("idle");
  const [eligibleLoadState, setEligibleLoadState] = useState<EligibleLoadState>("idle");
  const [apiLoadError, setApiLoadError] = useState("");
  const [eligibleLoadError, setEligibleLoadError] = useState("");
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string>("等待执行写回任务");
  const [resultTone, setResultTone] = useState<WritebackResultTone>("info");
  const [executingJobId, setExecutingJobId] = useState<string | null>(null);
  const [executionSnapshot, setExecutionSnapshot] = useState<WritebackExecutionSnapshot>({ kind: "idle" });
  const writebackAbortControllerRef = useRef<AbortController | null>(null);
  const lastWritebackJobIdRef = useRef<string | null>(null);

  const canExecuteWriteback = hasPermission("writeback:execute");

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0],
    [jobs, selectedJobId]
  );
  const runnableCount = useMemo(
    () =>
      jobs.filter((job) => job.status === "ready" && job.permission === "allowed" && canExecuteWriteback).length,
    [canExecuteWriteback, jobs]
  );
  const executionDescriptor = describeWritebackExecutionState(executionSnapshot);
  const jobColumns: TableColumnProps<WritebackJob>[] = [
    {
      title: "Job",
      dataIndex: "id",
      render: (_, job) => (
        <Button type="text" onClick={() => setSelectedJobId(job.id)}>
          {job.id}
        </Button>
      ),
    },
    { title: "患者", dataIndex: "subject" },
    { title: "目标", dataIndex: "target" },
    { title: "字段", dataIndex: "extractedFields" },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, job) => <StatusPill tone={statusToneMap[job.status]}>{statusLabelMap[job.status]}</StatusPill>,
    },
    {
      title: "操作",
      dataIndex: "operations",
      render: (_, job) => {
        const readonly = job.permission === "readonly";
        const blocked = job.blockers.length > 0 || job.status === "blocked";
        const running = executingJobId === job.id || job.status === "running";
        const disabled = !canExecuteWriteback || readonly || blocked || running || job.status === "done";
        const disabledReason = !canExecuteWriteback
          ? "当前账号缺少 writeback:execute 权限，不能执行真实写回"
          : readonly
            ? "当前账号权限不足，隐藏真实写回能力"
            : blocked
              ? job.blockers.join("；")
              : job.status === "done"
                ? "任务已完成"
                : undefined;

        return readonly ? (
          <Button type="outline" disabled title={disabledReason} icon={<AppIcon icon={actionIcons.privacyPolicy} size="sm" />}>
            只读
          </Button>
        ) : (
          <RowActionButton
            disabled={disabled}
            title={disabledReason}
            onClick={() => {
              setSelectedJobId(job.id);
              setConfirmJobId(job.id);
            }}
          >
            <AppIcon icon={running ? dashboardMetricIcons.rollback : actionIcons.next} size="sm" className={running ? "is-spinning" : undefined} />
            {running ? "写回中" : "写回"}
          </RowActionButton>
        );
      },
    },
  ];

  function readErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return "写回 API 调用失败，请稍后重试或查看审计日志。";
  }

  async function loadJobForWriteback(jobId: string) {
    const trimmedJobId = jobId.trim();
    if (!trimmedJobId) {
      setApiLoadState("error");
      setApiLoadError("请输入要加载的 jobId。");
      return;
    }

    setApiLoadState("loading");
    setApiLoadError("");

    try {
      const [job, result] = await Promise.all([api.getJob(trimmedJobId), api.getResult(trimmedJobId)]);
      const apiJob = normalizeApiJobToWritebackJob(trimmedJobId, job, result);

      setJobs((current) => [apiJob, ...current.filter((item) => item.id !== apiJob.id)]);
      setSelectedJobId(apiJob.id);
      setApiLoadState("success");
      setResultTone("success");
      setResultMessage(`${apiJob.id} 已从真实 API 加载，真实数据优先展示。`);
    } catch (error) {
      Message.error(readErrorMessage(error));
      setApiLoadState("error");
      setApiLoadError(readErrorMessage(error));
      setResultTone("warning");
      setResultMessage(
        demoMode
          ? `真实任务加载失败：${readErrorMessage(error)} 当前仅显示只读演示数据。`
          : `真实任务加载失败：${readErrorMessage(error)}`
      );
    }
  }

  function handleLoadJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadJobForWriteback(jobIdInput);
  }

  async function executeWriteback(jobId: string) {
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      return;
    }

    if (!canExecuteWriteback) {
      setResultTone("warning");
      setResultMessage("当前账号缺少 writeback:execute 权限，不能执行真实写回。");
      setConfirmJobId(null);
      return;
    }

    writebackAbortControllerRef.current?.abort();
    const controller = new AbortController();
    writebackAbortControllerRef.current = controller;
    lastWritebackJobIdRef.current = jobId;
    setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: "running" } : item)));
    const runningDescriptor = describeWritebackExecutionState({ kind: "running", jobId, target: job.target });
    setExecutionSnapshot({ kind: "running", jobId, target: job.target });
    setResultMessage(runningDescriptor.message);
    setResultTone("info");
    setExecutingJobId(jobId);
    setConfirmJobId(null);

    try {
      // 后端会用 confirmed=true 区分二次确认后的危险动作，实际写回字段只从服务端 RecognitionResult 读取。
      await api.executeWriteback(createWritebackRequest(job), {
        signal: controller.signal
      });
      setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: "done" } : item)));
      setResultTone("success");
      const successDescriptor = describeWritebackExecutionState({ kind: "succeeded", jobId, target: job.target });
      setExecutionSnapshot({ kind: "succeeded", jobId, target: job.target });
      setResultMessage(successDescriptor.message);
    } catch (error) {
      if (isAbortError(error)) {
        setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: job.status } : item)));
        setResultTone("warning");
        const cancelledDescriptor = describeWritebackExecutionState({ kind: "cancelled", jobId });
        setExecutionSnapshot({ kind: "cancelled", jobId });
        setResultMessage(cancelledDescriptor.message);
        return;
      }

      setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: job.status } : item)));
      setResultTone("warning");
      const failedDescriptor = describeWritebackExecutionState({
        kind: "failed",
        jobId,
        errorMessage: readErrorMessage(error)
      });
      setExecutionSnapshot({
        kind: "failed",
        jobId,
        errorMessage: readErrorMessage(error)
      });
      setResultMessage(failedDescriptor.message);
    } finally {
      if (writebackAbortControllerRef.current === controller) {
        writebackAbortControllerRef.current = null;
      }
      setExecutingJobId(null);
    }
  }

  function cancelWriteback() {
    writebackAbortControllerRef.current?.abort();
  }

  function rerunWriteback() {
    if (lastWritebackJobIdRef.current) {
      setConfirmJobId(lastWritebackJobIdRef.current);
    }
  }

  useEffect(() => {
    if (!routeJobId) {
      return;
    }

    setJobIdInput(routeJobId);
    void loadJobForWriteback(routeJobId);
    // 只在 URL jobId 变化时自动加载，api 对象变化不应重复触发用户刚完成的写回列表操作。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeJobId]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadEligibleWritebacks() {
      setEligibleLoadState("loading");
      setEligibleLoadError("");

      const result = await loadEligibleWritebackJobs(api, jobs, selectedJobId, 20);
      if (shouldIgnore) {
        return;
      }

      setJobs(result.jobs);
      setSelectedJobId(result.selectedJobId);
      setEligibleLoadState(result.state);
      setEligibleLoadError(result.errorMessage);
    }

    void loadEligibleWritebacks();

    return () => {
      shouldIgnore = true;
    };
    // 初始 eligible list 只跟随 API client 切换加载，避免覆盖用户后续手动 jobId 操作。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(
    () => () => {
      writebackAbortControllerRef.current?.abort();
    },
    []
  );

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 19"
        title="写回中心"
        description="展示可写回任务、结构化 payload、绿色条件和权限约束，危险写回动作必须二次确认。"
        meta={
          <div className="page-header__meta" aria-label="写回队列摘要">
            <span className="page-header__meta-item">
              <strong>可执行</strong>
              <span>{runnableCount} 个任务满足 green 条件</span>
            </span>
            <span className="page-header__meta-item">
              <strong>复核阻断</strong>
              <span>{jobs.filter((job) => job.blockers.length > 0).length} 个任务存在 blocker</span>
            </span>
            <span className="page-header__meta-item">
              <strong>权限</strong>
              <span>{canExecuteWriteback ? "当前账号可执行写回" : "当前账号只读"}</span>
            </span>
          </div>
        }
        actions={
          <>
            <Button type="outline" disabled={executingJobId === null} onClick={cancelWriteback}>
              取消写回
            </Button>
            <Button type="outline" disabled={executingJobId !== null || lastWritebackJobIdRef.current === null} onClick={rerunWriteback}>
              重跑上次写回
            </Button>
          </>
        }
      />

      <section className="metric-grid" aria-label="写回指标">
        <MetricCard label="可执行任务" value={`${runnableCount}`} hint="满足 green 条件且有写权限" tone="success" />
        <MetricCard label="待人工确认" value={`${jobs.filter((job) => job.blockers.length > 0).length}`} hint="存在 blocker 时禁止写回" tone="warning" />
        <MetricCard label="最近状态" value={resultMessage} hint="真实写回 API 返回状态" tone={resultTone} />
      </section>

      <InlineNotice tone={canExecuteWriteback ? "success" : "warning"} title={canExecuteWriteback ? "Green 条件" : "权限受限"}>
        {canExecuteWriteback
          ? "写回按钮只有在患者索引唯一、关键字段置信度达标、目标 provider 健康、当前账号拥有目标系统写权限时才可用。"
          : "当前账号缺少 writeback:execute 权限，页面保留静态列表和 payload 预览，但不会允许执行真实写回。"}
      </InlineNotice>

      <section className="operations-status-strip" aria-label="写回操作状态">
        <article>
          <strong>候选来源</strong>
          <span>{eligibleLoadState === "success" ? "真实候选已读取" : eligibleLoadState === "loading" ? "候选读取中" : "等待候选任务"}</span>
        </article>
        <article>
          <strong>当前目标</strong>
          <span>{selectedJob ? `${selectedJob.target} / ${selectedJob.id}` : "未选择任务"}</span>
        </article>
        <article>
          <strong>执行状态</strong>
          <span>{executingJobId ? `${executingJobId} 写回中` : resultMessage}</span>
        </article>
      </section>

      {executionSnapshot.kind !== "idle" ? (
        <InlineNotice tone={executionDescriptor.tone === "warning" ? "warning" : executionDescriptor.tone === "success" ? "success" : "info"} title={executionDescriptor.title}>
          {executionDescriptor.message}
        </InlineNotice>
      ) : null}

      {demoMode ? (
        <Alert type="warning" showIcon content="当前展示演示数据，不可写回；只有真实 API 返回的任务会进入执行确认。" />
      ) : null}

      <Card className="panel">
      <form onSubmit={handleLoadJob}>
        <div className="panel-header">
          <h2>加载真实 Job</h2>
          <StatusPill tone={apiLoadState === "success" ? "success" : apiLoadState === "error" ? "danger" : "info"}>
            {apiLoadState === "loading"
              ? "加载中"
              : apiLoadState === "success"
                ? "API 已加载"
                : apiLoadState === "error"
                  ? "API 失败"
                  : "等待输入"}
          </StatusPill>
        </div>
        <div className="form-grid">
          <Form.Item label="Job ID">
            <Input
              aria-label="按 Job ID 加载真实写回任务"
              value={jobIdInput}
              onChange={setJobIdInput}
              placeholder="例如 job-demo-1"
            />
          </Form.Item>
          <div className="field-row">
            <span>操作</span>
            <Button type="primary" htmlType="submit" disabled={apiLoadState === "loading"} loading={apiLoadState === "loading"} icon={<AppIcon icon={actionIcons.next} size="sm" />}>
              {apiLoadState === "loading" ? "加载中" : "加载任务"}
            </Button>
          </div>
        </div>
        {apiLoadState === "error" ? <Alert type="error" showIcon content={`真实 API 加载失败：${apiLoadError}`} /> : null}
        {apiLoadState === "success" ? <Alert type="success" showIcon content="已加载真实任务，列表会优先展示该任务。" /> : null}
      </form>
      </Card>

      <section className="operations-split">
        <Card className="panel" data-guide="writeback">
          <div className="panel-header">
            <h2>可写回 Job</h2>
            <StatusPill tone={apiLoadState === "success" ? "success" : "info"}>
              {eligibleLoadState === "success" || apiLoadState === "success"
                ? "真实数据"
                : demoMode
                  ? "演示数据"
                  : "等待真实数据"}
            </StatusPill>
          </div>
          {eligibleLoadState === "error" ? (
            <InlineNotice tone="warning" title="真实候选加载失败">
              {demoMode
                ? `当前仅保留只读演示数据。${eligibleLoadError}`
                : `未展示演示候选，请检查 API 后重试。${eligibleLoadError}`}
            </InlineNotice>
          ) : null}
          {jobs.length > 0 ? (
            <Table columns={jobColumns} data={jobs} rowKey="id" pagination={false} scroll={{ x: 940 }} />
          ) : (
            <InlineNotice tone="warning" title="暂无可写回任务">
              真实 API 未返回可写回候选。请重试或按 Job ID 加载已完成任务。
            </InlineNotice>
          )}
        </Card>

        <div className="stack">
          {selectedJob ? (
            <>
              <Card className="panel">
                <div className="panel-header">
                  <h2>
                    <AppIcon icon={navigationIcons.writeback} size="md" />
                    条件检查
                  </h2>
                  <StatusPill tone={selectedJob.blockers.length === 0 ? "success" : "danger"}>
                    {selectedJob.blockers.length === 0 ? "满足 green" : "存在 blocker"}
                  </StatusPill>
                </div>
                <ul className="check-list">
                  {selectedJob.greenRules.map((rule) => (
                    <li key={rule}>
                      <AppIcon icon={statusIcons.success} size="sm" />
                      {rule}
                    </li>
                  ))}
                  {selectedJob.blockers.map((blocker) => (
                    <li key={blocker} className="is-danger">
                      <AppIcon icon={statusIcons.danger} size="sm" />
                      {blocker}
                    </li>
                  ))}
                </ul>
              </Card>
              <PayloadPreview title="Payload Preview" payload={selectedJob.payload} />
            </>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirmJobId !== null}
        title="确认执行写回"
        description={`将把 ${confirmJobId ?? ""} 的结构化结果写入目标系统。该动作会留下审计记录，请确认 green 条件和 payload 后继续。`}
        confirmLabel="确认写回"
        danger
        onCancel={() => setConfirmJobId(null)}
        onConfirm={() => {
          if (confirmJobId) {
            executeWriteback(confirmJobId);
          }
        }}
      />
    </main>
  );
}

export default WritebackPage;
