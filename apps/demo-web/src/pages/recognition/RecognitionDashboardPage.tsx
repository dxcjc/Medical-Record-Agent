import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Space, Steps, Table, Tag } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ApiCollectionResponse } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons } from "../../icons/appIcons";
import {
  dashboardActions,
  formatPercent,
  type RecognitionJob,
  type ProviderStatus,
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
  jobs?: RecognitionJob[];
  providers?: ProviderStatus[];
};

type RecentJob = RecognitionJob;

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
  jobs: initialJobs = [],
  providers: initialProviders = [],
}: RecognitionDashboardPageProps) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [refreshToken, setRefreshToken] = useState(0);
  const [jobs, setJobs] = useState(initialJobs);
  const [providers, setProviders] = useState(initialProviders);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => {
    try {
      return localStorage.getItem("hasSeenOnboarding") === "true";
    } catch {
      return false;
    }
  });
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
        const [health, providerList, schemaList, evaluationDatasetList, jobListResponse] = await Promise.all([
          api.health(),
          api.listProviders(),
          api.listSchemas(),
          api.listEvaluationDatasets(),
          api.listJobs(20).catch(() => ({ items: [] })),
        ]);

        if (shouldIgnore) {
          return;
        }

        // 更新任务列表
        if (jobListResponse.items && jobListResponse.items.length > 0) {
          setJobs(jobListResponse.items.map((job: any) => ({
            id: job.id,
            title: job.schemaKey || "识别任务",
            schemaName: job.schemaKey || "lims-clinical-info",
            adapter: job.options?.adapter || "LabReportAdapter",
            provider: job.providerConfig?.ocrProviderKey || "http-ocr",
            status: (job.status === "completed" ? "completed" : job.status === "needs_review" ? "review" : job.status) as any,
            confidence: 0,
            createdAt: new Date(job.createdAt || Date.now()).toLocaleString("zh-CN"),
            owner: "system",
            autoWriteBack: false,
          })));
        }

        // 更新 Provider 列表
        if (providerList.items && providerList.items.length > 0) {
          setProviders(providerList.items.map((p: any) => ({
            name: p.name || p.displayName || p.key || "未知 Provider",
            health: (p.status === "online" ? "online" : p.status === "degraded" ? "degraded" : "online") as any,
            latencyMs: p.latencyMs ?? 0,
            successRate: p.successRate ?? 1,
            activeJobs: p.activeJobs ?? 0,
          })));
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

  // Compute dashboard metrics from real jobs data
  const dashboardMetrics = useMemo<RuntimeMetric[]>(() => {
    const totalJobs = jobs.length;
    const avgConfidence = totalJobs > 0
      ? jobs.reduce((sum, job) => sum + job.confidence, 0) / totalJobs
      : 0;
    const autoWriteBackCount = jobs.filter((job) => job.autoWriteBack).length;
    const reviewCount = jobs.filter((job) => job.status === "review").length;

    return [
      {
        label: "今日任务",
        value: `${totalJobs}`,
        description: totalJobs > 0 ? `共 ${totalJobs} 个识别任务` : "暂无任务",
        icon: dashboardMetricIcons.taskVolume,
        tone: "info",
      },
      {
        label: "平均置信度",
        value: totalJobs > 0 ? `${Math.round(avgConfidence * 1000) / 10}%` : "-",
        description: totalJobs > 0 ? "高风险字段单独复核" : "暂无数据",
        icon: dashboardMetricIcons.confidence,
        tone: totalJobs > 0 ? "success" : "neutral",
      },
      {
        label: "自动写回",
        value: `${autoWriteBackCount}`,
        description: autoWriteBackCount > 0 ? "绿色决策直接进入 HIS 草稿" : "暂无自动写回",
        icon: dashboardMetricIcons.writeback,
        tone: autoWriteBackCount > 0 ? "success" : "neutral",
      },
      {
        label: "待复核",
        value: `${reviewCount}`,
        description: reviewCount > 0 ? "黄色决策等待人工确认" : "暂无待复核任务",
        icon: dashboardMetricIcons.reviewQueue,
        tone: reviewCount > 0 ? "warning" : "success",
      },
    ];
  }, [jobs]);

  // Compute write-back summaries from real jobs data
  const writeBackSummaries = useMemo<RuntimeMetric[]>(() => {
    const totalJobs = jobs.length;
    if (totalJobs === 0) {
      return [
        {
          label: "暂无数据",
          value: "-",
          description: "创建识别任务后，写回统计将在此处展示",
          icon: dashboardMetricIcons.decisionPass,
          tone: "neutral",
        },
      ];
    }

    const completedCount = jobs.filter((j) => j.status === "completed").length;
    const reviewCount = jobs.filter((j) => j.status === "review").length;
    const failedCount = jobs.filter((j) => j.status === "failed").length;

    return [
      {
        label: "已完成任务",
        value: `${completedCount}`,
        description: `${totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 0}%`,
        icon: dashboardMetricIcons.decisionPass,
        tone: "success",
      },
      {
        label: "待复核",
        value: `${reviewCount}`,
        description: "低置信度或字段冲突",
        icon: dashboardMetricIcons.decisionReview,
        tone: reviewCount > 0 ? "warning" : "neutral",
      },
      {
        label: "失败任务",
        value: `${failedCount}`,
        description: "识别失败的任务",
        icon: dashboardMetricIcons.decisionBlock,
        tone: failedCount > 0 ? "danger" : "neutral",
      },
    ];
  }, [jobs]);

  const runtimeTone = runtimeState.status === "error" ? "offline" : runtimeState.status === "loading" ? "degraded" : "online";
  const showOnboarding = jobs.length === 0 && !hasSeenOnboarding;

  function dismissOnboarding() {
    try {
      localStorage.setItem("hasSeenOnboarding", "true");
    } catch {
      // ignore storage errors
    }
    setHasSeenOnboarding(true);
  }


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
          <Alert type="warning" showIcon content={`运行状态加载失败：${runtimeState.error}。`} />
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

      {showOnboarding ? (
        <Card
          className="panel onboarding-card"
          style={{ borderColor: "#3370FF", borderWidth: 2, borderStyle: "solid" }}
          aria-label="首次使用引导"
        >
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <h2 style={{ color: "#3370FF", marginBottom: 8 }}>欢迎使用医疗文档识别系统</h2>
            <p style={{ color: "#666", marginBottom: 24 }}>只需三步，即可完成医疗文档的结构化识别</p>
          </div>
          <Steps
            current={-1}
            style={{ maxWidth: 720, margin: "0 auto 24px" }}
          >
            <Steps.Step title="上传医疗文档" description="支持 PDF、PNG、JPG 格式" />
            <Steps.Step title="自动识别提取" description="系统自动 OCR + 结构化字段抽取" />
            <Steps.Step title="确认并导出" description="复核结果、确认后导出结构化数据" />
          </Steps>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Space>
              <Button
                type="primary"
                size="large"
                onClick={() => {
                  dismissOnboarding();
                  navigate("/recognition/new");
                }}
              >
                开始第一次识别
              </Button>
              <Button
                type="outline"
                onClick={dismissOnboarding}
              >
                跳过引导
              </Button>
            </Space>
          </div>
        </Card>
      ) : null}

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
            <Table
              columns={jobColumns}
              data={jobs}
              rowKey="id"
              pagination={false}
              scroll={{ x: 1120 }}
              onRow={(record) => ({
                onClick: () => navigate(`/recognition/jobs/${record.id}`),
                style: { cursor: "pointer" }
              })}
            />
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
