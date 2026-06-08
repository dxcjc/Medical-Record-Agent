import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ApiClient } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { ConfirmDialog, InlineNotice, MetricCard, PayloadPreview, RowActionButton, SectionHeader, StatusPill } from "./components";

type WritebackStatus = "ready" | "blocked" | "running" | "done";
type WritebackResultTone = "success" | "warning" | "info";
type ApiLoadState = "idle" | "loading" | "success" | "error";
type EligibleLoadState = "idle" | "loading" | "success" | "error";

type WritebackJob = {
  id: string;
  subject: string;
  target: "LIMS" | "EMR" | "Archive";
  extractedFields: number;
  greenRules: string[];
  blockers: string[];
  status: WritebackStatus;
  permission: "allowed" | "readonly";
  payload: Record<string, unknown>;
};

type WritebackReadyField = {
  fieldKey: string;
  targetPath: string;
  value: string | number | boolean | string[] | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown> | undefined, keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isWritebackFieldValue(value: unknown): value is WritebackReadyField["value"] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function getPayloadObject(result: unknown) {
  if (!isRecord(result)) {
    return {};
  }

  const payload = result.payload;
  if (isRecord(payload)) {
    return payload;
  }

  return result;
}

function readNestedArray(record: Record<string, unknown>, path: string[]): unknown[] | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return readArray(current);
}

export function readWritebackApiErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "写回 API 调用失败，请稍后重试或查看审计日志。";
}

function getFieldCount(result: unknown) {
  if (!isRecord(result)) {
    return 0;
  }

  const fields = readArray(result.fields) ?? readNestedArray(result, ["payload", "fields"]);
  const normalizedFields =
    readArray(result.normalizedFields) ??
    readNestedArray(result, ["payload", "normalizedFields"]) ??
    readNestedArray(result, ["payload", "validation", "normalizedCandidates"]);

  return fields?.length ?? normalizedFields?.length ?? 0;
}

function readReadyFields(result: unknown): WritebackReadyField[] {
  if (!isRecord(result)) {
    return [];
  }

  // 写回字段在不同阶段会有三种形状：
  // 1. 后端编排 payload.writeback.readyFields，来自 core WritebackAgent；
  // 2. 页面归一化后的 job.payload.fields，供 /writeback 顶层 fields 直接复用；
  // 3. 兼容未来 API 直接返回 writeback.readyFields 或 readyFields 的扁平结构。
  // 这里只接受同时具备 fieldKey、targetPath 和合法 value 的字段，避免把普通 normalizedCandidates 误当成可执行写回字段。
  const candidates =
    readNestedArray(result, ["payload", "writeback", "readyFields"]) ??
    readArray(result.fields) ??
    readNestedArray(result, ["writeback", "readyFields"]) ??
    readArray(result.readyFields) ??
    [];

  return candidates.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const fieldKey = readString(item, ["fieldKey"]);
    const targetPath = readString(item, ["targetPath"]);

    if (!fieldKey || !targetPath || !isWritebackFieldValue(item.value)) {
      return [];
    }

    return [
      {
        fieldKey,
        targetPath,
        value: item.value
      }
    ];
  });
}

export function normalizeApiJobToWritebackJob(jobId: string, job: unknown, result: unknown): WritebackJob {
  const jobRecord = isRecord(job) ? job : undefined;
  const resultRecord = isRecord(result) ? result : undefined;
  const status = readString(jobRecord, ["status"]) ?? "completed";
  const reviewRequired = resultRecord?.reviewRequired === true;
  const blockers = reviewRequired ? ["识别结果仍标记为需人工复核"] : [];
  const readyFields = readReadyFields(result);

  if (status !== "completed" && status !== "confirmed") {
    blockers.push(`任务状态为 ${status}，服务端写回要求 completed 或 confirmed`);
  }

  // 后端暂未提供 eligible list，这里只把按 jobId 读到的真实任务转换为可写回候选；静态 demo 仍保留在列表下方兜底。
  return {
    id: readString(jobRecord, ["id", "jobId"]) ?? jobId,
    subject: readString(jobRecord, ["subject", "title", "sourceFileId", "schemaKey"]) ?? `真实任务 ${jobId}`,
    target: "LIMS",
    extractedFields: getFieldCount(result),
    greenRules: ["已通过 jobId 加载真实任务", "写回前仍会由服务端校验 confirmed=true 和任务状态"],
    blockers,
    status: blockers.length > 0 ? "blocked" : "ready",
    permission: "allowed",
    payload: {
      jobId,
      source: "api.getJob/getResult",
      fields: readyFields,
      result: getPayloadObject(result),
    },
  };
}

export function createWritebackRequest(job: WritebackJob) {
  const fields = readReadyFields(job.payload);

  return {
    jobId: job.id,
    confirmed: true,
    ...(fields.length > 0 ? { fields } : {}),
    payload: job.payload
  };
}

export function normalizeEligibleWritebackItem(item: unknown): WritebackJob {
  const record = isRecord(item) ? item : {};
  const id = readString(record, ["id", "jobId"]) ?? "eligible-job";
  const schemaKey = readString(record, ["schemaKey"]) ?? "unknown-schema";
  const sourceFileId = readString(record, ["sourceFileId"]) ?? "unknown-file";
  const blockers = readArray(record.blockers)?.filter((blocker): blocker is string => typeof blocker === "string") ?? [];
  const readyFields = readReadyFields(record);
  const payload = isRecord(record.payload)
    ? record.payload
    : {
        jobId: id,
        source: "writeback.eligible",
        fields: readyFields
      };

  return {
    id,
    subject: `${sourceFileId} / ${schemaKey}`,
    target: "LIMS",
    extractedFields: typeof record.extractedFields === "number" ? record.extractedFields : readyFields.length,
    greenRules: ["来自后端 eligible writeback 列表", "服务端已过滤需复核或无 readyFields 的任务"],
    blockers,
    status: blockers.length > 0 ? "blocked" : "ready",
    permission: "allowed",
    payload
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
  const routeJobId = searchParams.get("jobId") ?? "";
  const [jobs, setJobs] = useState<WritebackJob[]>(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState<string>(initialJobs[0]?.id ?? "");
  const [jobIdInput, setJobIdInput] = useState(routeJobId);
  const [apiLoadState, setApiLoadState] = useState<ApiLoadState>("idle");
  const [eligibleLoadState, setEligibleLoadState] = useState<EligibleLoadState>("idle");
  const [apiLoadError, setApiLoadError] = useState("");
  const [eligibleLoadError, setEligibleLoadError] = useState("");
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string>("等待执行写回任务");
  const [resultTone, setResultTone] = useState<WritebackResultTone>("info");
  const [executingJobId, setExecutingJobId] = useState<string | null>(null);

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
      setApiLoadState("error");
      setApiLoadError(readErrorMessage(error));
      setResultTone("warning");
      setResultMessage(`真实任务加载失败：${readErrorMessage(error)} 静态 demo 列表继续保留。`);
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

    setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: "running" } : item)));
    setResultMessage(`${job.id} 正在写回 ${job.target}`);
    setResultTone("info");
    setExecutingJobId(jobId);
    setConfirmJobId(null);

    try {
      // 后端会用 confirmed=true 区分二次确认后的危险动作，否则会返回 409。
      await api.executeWriteback(createWritebackRequest(job));
      setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: "done" } : item)));
      setResultTone("success");
      setResultMessage(`${job.id} 已完成写回，目标系统 ${job.target} 返回成功`);
    } catch (error) {
      // API 失败时只回滚当前 Job 的本地状态，静态列表和 payload 预览继续保留，方便用户重新确认后再试。
      setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, status: job.status } : item)));
      setResultTone("warning");
      setResultMessage(`${job.id} 写回失败：${readErrorMessage(error)}`);
    } finally {
      setExecutingJobId(null);
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

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 19"
        title="Writeback"
        description="展示可写回任务、结构化 payload、绿色条件和权限约束，危险写回动作必须二次确认。"
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

      <form className="panel" onSubmit={handleLoadJob}>
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
          <label className="field-row">
            <span>Job ID</span>
            <input
              aria-label="按 Job ID 加载真实写回任务"
              value={jobIdInput}
              onChange={(event) => setJobIdInput(event.target.value)}
              placeholder="例如 job-demo-1"
            />
          </label>
          <div className="field-row">
            <span>操作</span>
            <button className="action-button" type="submit" disabled={apiLoadState === "loading"}>
              <AppIcon icon={actionIcons.next} size="sm" />
              {apiLoadState === "loading" ? "加载中" : "加载任务"}
            </button>
          </div>
        </div>
        {apiLoadState === "error" ? <p role="alert">真实 API 加载失败：{apiLoadError}</p> : null}
        {apiLoadState === "success" ? <p role="status">已加载真实任务，列表会优先展示该任务。</p> : null}
      </form>

      <section className="operations-split">
        <section className="panel" data-guide="writeback">
          <div className="panel-header">
            <h2>可写回 Job</h2>
            <StatusPill tone={apiLoadState === "success" ? "success" : "info"}>
              {eligibleLoadState === "success" || apiLoadState === "success" ? "真实数据优先" : "Demo 兜底"}
            </StatusPill>
          </div>
          {eligibleLoadState === "error" ? (
            <InlineNotice tone="warning" title="真实候选加载失败">
              {`已保留 Demo 兜底和手动 Job ID 加载能力。${eligibleLoadError}`}
            </InlineNotice>
          ) : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>患者</th>
                <th>目标</th>
                <th>字段</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
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
                return (
                  <tr key={job.id} className={selectedJob?.id === job.id ? "is-selected" : undefined}>
                    <td>
                      <button className="link-button" type="button" onClick={() => setSelectedJobId(job.id)}>
                        {job.id}
                      </button>
                    </td>
                    <td>{job.subject}</td>
                    <td>{job.target}</td>
                    <td>{job.extractedFields}</td>
                    <td>
                      <StatusPill tone={statusToneMap[job.status]}>{statusLabelMap[job.status]}</StatusPill>
                    </td>
                    <td>
                      {readonly ? (
                        <button className="secondary-button" type="button" disabled title={disabledReason}>
                          <AppIcon icon={actionIcons.privacyPolicy} size="sm" />
                          只读
                        </button>
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
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="stack">
          {selectedJob ? (
            <>
              <section className="panel">
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
              </section>
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
