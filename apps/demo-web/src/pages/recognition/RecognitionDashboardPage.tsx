import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ApiCollectionResponse } from "../../api/client";
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

type RecentJob = (typeof recentJobs)[number];

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

function countItems<TItem>(response: ApiCollectionResponse<TItem>) {
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
  const navigate = useNavigate();
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

  const jobColumns: TableColumnProps<RecentJob>[] = [
    {
      title: "任务",
      dataIndex: "title",
      width: 300,
      render: (_, job) => (
        <div className="recent-task-cell">
          <strong className="recent-task-cell__title">{job.title}</strong>
          <span className="recent-task-cell__meta">
            <span className="mono">{job.id}</span>
            <span>{job.createdAt}</span>
          </span>
        </div>
      ),
    },
    {
      title: "模板",
      dataIndex: "schemaName",
      width: 220,
      render: (_, job) => (
        <div className="recent-template-cell">
          <strong>{job.schemaName}</strong>
          <span>{job.adapter}</span>
        </div>
      ),
    },
    {
      title: "Provider",
      dataIndex: "provider",
      width: 150,
      render: (_, job) => <span className="recent-provider-cell">{job.provider}</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (_, job) => <JobStatusPill status={job.status} />,
    },
    {
      title: "置信度",
      dataIndex: "confidence",
      align: "right",
      width: 104,
      render: (_, job) => formatPercent(job.confidence),
    },
    {
      title: "写回",
      dataIndex: "autoWriteBack",
      width: 132,
      render: (_, job) => <Tag color={job.autoWriteBack ? "green" : "orange"}>{job.autoWriteBack ? "自动写回" : "等待确认"}</Tag>,
    },
    {
      title: "负责人 / 负载",
      dataIndex: "owner",
      width: 150,
      render: (_, job) => (
        <div className="recent-owner-cell">
          <strong>{job.owner}</strong>
          <span>{job.status === "running" ? "处理中" : job.status === "review" ? "复核负载" : job.autoWriteBack ? "低负载" : "待调度"}</span>
        </div>
      ),
    },
  ];

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title="识别任务看板"
        description="集中查看识别吞吐、Provider 健康度、自动写回与复核队列状态。"
        meta={
          <div className="page-header__meta" aria-label="识别看板摘要">
            <span className="page-header__meta-item">
              <strong>证据链</strong>
              <span>页码、原文引用、字段来源</span>
            </span>
            <span className="page-header__meta-item">
              <strong>复核状态</strong>
              <span>{jobs.filter((job) => job.status === "review").length} 个任务等待人工确认</span>
            </span>
            <span className="page-header__meta-item">
              <strong>Provider</strong>
              <span>{runtimeState.data?.providerCount ?? providers.length} 个实例参与调度</span>
            </span>
          </div>
        }
        actions={
          <>
            {dashboardActions.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                type="outline"
                aria-label={label}
                onClick={() => {
                  if (label === "新建识别") {
                    navigate("/recognition/new");
                  } else if (label === "查看流程") {
                    navigate("/trace");
                  } else {
                    navigate("/providers");
                  }
                }}
                icon={<AppIcon icon={Icon} size="sm" />}
              >
                {label}
              </Button>
            ))}
            <Button
              type="primary"
              aria-label="刷新任务看板"
              disabled={runtimeState.status === "loading"}
              onClick={() => setRefreshToken((current) => current + 1)}
              icon={
                <AppIcon
                  icon={runtimeState.status === "loading" ? commonUiIcons.loading : actionIcons.refresh}
                  size="sm"
                  className={runtimeState.status === "loading" ? "is-spinning" : undefined}
                />
              }
            >
              {runtimeState.status === "loading" ? "刷新中" : "刷新"}
            </Button>
          </>
        }
      />

      <Card className="panel" aria-label="运行状态" data-guide="environment-status">
        <SectionTitle title="运行状态" />
        <div className="provider-health" aria-live="polite">
          <StatusPill label={runtimeState.status === "loading" ? "检查中" : runtimeState.status === "error" ? "接口异常" : "接口可用"} tone={runtimeTone} />
          <span className="mono">{api.baseUrl}</span>
        </div>
        {runtimeState.error ? (
          <Alert type="warning" showIcon content={`运行状态加载失败：${runtimeState.error}。下方业务演示数据仍可正常查看。`} />
        ) : null}
        <div className="metric-grid compact">
          {runtimeMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </Card>

      <section className="metric-grid" aria-label="任务指标">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <Card className="panel data-table-card">
        <SectionTitle
          title="最近任务"
          action={
            <Button type="outline" aria-label="查看全部任务" onClick={() => navigate("/trace")}>
              查看全部任务
              <AppIcon icon={actionIcons.next} size="sm" />
            </Button>
          }
        />
        {jobs.length > 0 ? (
          <div className="table-scroll">
            <Table columns={jobColumns} data={jobs} rowKey="id" pagination={false} scroll={{ x: 1120 }} />
          </div>
        ) : (
          <EmptyPanel icon={dashboardMetricIcons.taskVolume} title="暂无识别任务" description="新建任务后，最近任务会显示在这里。" />
        )}
      </Card>

      <div className="dashboard-grid">
        <Card className="panel">
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
        </Card>

        <Card className="panel">
          <SectionTitle title="写回与复核概览" />
          <div className="metric-grid compact">
            {writeBackSummaries.map((summary) => (
              <MetricCard key={summary.label} {...summary} />
            ))}
          </div>
          <Button type="outline" aria-label="打开复核队列" onClick={() => navigate("/feedback")}>
            打开复核队列
            <AppIcon icon={actionIcons.next} size="sm" />
          </Button>
        </Card>
      </div>
    </main>
  );
}
