import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons } from "../../icons/appIcons";
import {
  dashboardActions,
  dashboardMetrics,
  formatPercent,
  providerStatuses,
  recentJobs,
  writeBackSummaries,
} from "./components/demoData";
import {
  JobStatusPill,
  EmptyPanel,
  type MetricTone,
  MetricCard,
  PageHeader,
  ProviderHealthPill,
  SectionTitle,
  StatusPill,
} from "./components/RecognitionShared";

export type RecognitionDashboardPageProps = {
  jobs?: typeof recentJobs;
  providers?: typeof providerStatuses;
};

type RuntimeStatus = {
  apiStatus: string;
  service: string;
  providerCount: number;
  schemaCount: number;
  evaluationDatasetCount: number;
  checkedAt: string;
};

type RuntimeLoadState =
  | { status: "loading"; data: RuntimeStatus | null; error: null }
  | { status: "success"; data: RuntimeStatus; error: null }
  | { status: "error"; data: RuntimeStatus | null; error: string };

type RuntimeMetric = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: MetricTone;
};

function countItems(response: { items: unknown[] }) {
  return response.items.length;
}

function formatRuntimeError(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "运行状态接口暂时不可用，请稍后重试。";
}

export default function RecognitionDashboardPage({
  jobs = recentJobs,
  providers = providerStatuses,
}: RecognitionDashboardPageProps) {
  const { api } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [runtimeState, setRuntimeState] = useState<RuntimeLoadState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadRuntimeStatus() {
      setRuntimeState((current) => ({
        status: "loading",
        data: current.data,
        error: null,
      }));

      try {
        // Dashboard 运行状态来自真实 API；静态业务指标继续作为演示兜底独立展示。
        const [health, providerList, schemaList, evaluationDatasetList] = await Promise.all([
          api.health(),
          api.listProviders(),
          api.listSchemas(),
          api.listEvaluationDatasets(),
        ]);

        if (shouldIgnore) {
          return;
        }

        setRuntimeState({
          status: "success",
          data: {
            apiStatus: health.status,
            service: health.service,
            providerCount: countItems(providerList),
            schemaCount: countItems(schemaList),
            evaluationDatasetCount: countItems(evaluationDatasetList),
            checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          },
          error: null,
        });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setRuntimeState((current) => ({
          status: "error",
          data: current.data,
          error: formatRuntimeError(error),
        }));
      }
    }

    void loadRuntimeStatus();

    return () => {
      shouldIgnore = true;
    };
  }, [api, refreshToken]);

  const runtimeMetrics = useMemo<RuntimeMetric[]>(
    () => [
      {
        label: "API 健康状态",
        value: runtimeState.data?.apiStatus ?? (runtimeState.status === "loading" ? "检查中" : "未知"),
        description: runtimeState.data
          ? `${runtimeState.data.service} · ${runtimeState.data.checkedAt}`
          : "等待健康检查返回",
        icon: dashboardMetricIcons.apiHealth,
        tone: runtimeState.status === "error" ? "danger" : runtimeState.status === "loading" ? "warning" : "success",
      },
      {
        label: "Provider",
        value: runtimeState.data ? `${runtimeState.data.providerCount}` : "-",
        description: "来自 /providers 实时返回",
        icon: dashboardMetricIcons.provider,
        tone: runtimeState.status === "error" ? "warning" : "info",
      },
      {
        label: "Schema",
        value: runtimeState.data ? `${runtimeState.data.schemaCount}` : "-",
        description: "来自 /schemas 实时返回",
        icon: dashboardMetricIcons.schema,
        tone: "success",
      },
      {
        label: "Evaluation Dataset",
        value: runtimeState.data ? `${runtimeState.data.evaluationDatasetCount}` : "-",
        description: "来自 /evaluations/datasets 实时返回",
        icon: dashboardMetricIcons.dataset,
        tone: "neutral",
      },
    ] satisfies RuntimeMetric[],
    [runtimeState]
  );

  const runtimeTone = runtimeState.status === "error" ? "offline" : runtimeState.status === "loading" ? "degraded" : "online";

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title="识别任务看板"
        description="集中查看识别吞吐、Provider 健康度、自动写回与复核队列状态。"
        actions={
          <>
            {dashboardActions.map(({ label, icon: Icon }) => (
              <button key={label} className="secondary-button" type="button" aria-label={label}>
                <AppIcon icon={Icon} size="sm" />
                {label}
              </button>
            ))}
            <button
              className="action-button"
              type="button"
              aria-label="刷新任务看板"
              disabled={runtimeState.status === "loading"}
              onClick={() => setRefreshToken((current) => current + 1)}
            >
              <AppIcon
                icon={runtimeState.status === "loading" ? commonUiIcons.loading : actionIcons.refresh}
                size="sm"
                className={runtimeState.status === "loading" ? "is-spinning" : undefined}
              />
              {runtimeState.status === "loading" ? "刷新中" : "刷新"}
            </button>
          </>
        }
      />

      <section className="panel" aria-label="运行状态" data-guide="environment-status">
        <SectionTitle title="运行状态" />
        <div className="provider-health" aria-live="polite">
          <StatusPill label={runtimeState.status === "loading" ? "检查中" : runtimeState.status === "error" ? "接口异常" : "接口可用"} tone={runtimeTone} />
          <span className="mono">{api.baseUrl}</span>
        </div>
        {runtimeState.error ? (
          <div className="form-error" role="alert">
            运行状态加载失败：{runtimeState.error}。下方业务演示数据仍可正常查看。
          </div>
        ) : null}
        <div className="metric-grid compact">
          {runtimeMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="metric-grid" aria-label="任务指标">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="panel">
        <SectionTitle title="最近任务" actionLabel="查看全部任务" />
        {jobs.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>模板</th>
                  <th>Provider</th>
                  <th>状态</th>
                  <th>置信度</th>
                  <th>写回</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.title}</strong>
                      <span>{job.id} · {job.createdAt}</span>
                    </td>
                    <td>{job.schemaName}</td>
                    <td>{job.provider}</td>
                    <td>
                      <JobStatusPill status={job.status} />
                    </td>
                    <td>{formatPercent(job.confidence)}</td>
                    <td>{job.autoWriteBack ? "自动写回" : "等待确认"}</td>
                    <td>{job.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel icon={dashboardMetricIcons.taskVolume} title="暂无识别任务" description="新建任务后，最近任务会显示在这里。" />
        )}
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <SectionTitle title="Provider 状态" />
          {providers.length > 0 ? (
            <div className="provider-list">
              {providers.map((provider) => (
                <article key={provider.name} className="provider-row">
                  <div>
                    <h3>{provider.name}</h3>
                    <p>
                      延迟 {provider.latencyMs}ms · 成功率 {formatPercent(provider.successRate)} ·
                      活跃 {provider.activeJobs}
                    </p>
                  </div>
                  <ProviderHealthPill health={provider.health} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={dashboardMetricIcons.provider} title="暂无 Provider" description="Provider 接入后会显示健康状态与调用概览。" />
          )}
        </section>

        <section className="panel">
          <SectionTitle title="写回与复核概览" />
          <div className="metric-grid compact">
            {writeBackSummaries.map((summary) => (
              <MetricCard key={summary.label} {...summary} />
            ))}
          </div>
          <button className="secondary-button" type="button" aria-label="打开复核队列">
            打开复核队列
            <AppIcon icon={actionIcons.next} size="sm" />
          </button>
        </section>
      </div>
    </main>
  );
}
