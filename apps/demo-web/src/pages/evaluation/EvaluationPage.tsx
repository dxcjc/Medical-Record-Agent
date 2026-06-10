import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Card, Tag } from "@arco-design/web-react";
import {
  normalizeEvaluationDatasets,
  normalizeEvaluationMetrics,
  normalizeEvaluationRuns,
  normalizeProviderSelectOptions,
  normalizeSchemaSelectOptions,
  readEvaluationRunId,
  readEvaluationRunStatus,
  type SelectOption
} from "../../api/normalizers";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, dashboardMetricIcons, navigationIcons, statusIcons } from "../../icons/appIcons";
import { DatasetListPanel } from "./components/DatasetListPanel";
import { EvaluationRunPanel } from "./components/EvaluationRunPanel";
import { MetricCardsPanel } from "./components/MetricCardsPanel";
import { SampleImportPanel } from "./components/SampleImportPanel";
import { VersionComparisonPanel } from "./components/VersionComparisonPanel";
import {
  completedRuns,
  datasets,
  initialImportFlow,
  initialRunDraft,
  metricCards,
  versionComparisonRows,
  type EvaluationDataset,
  type EvaluationRun,
  type EvaluationRunDraft,
  type ImportFlowState
} from "./components/evaluationData";

function getFallbackDataset(): EvaluationDataset {
  const dataset = datasets[0];
  if (!dataset) {
    throw new Error("Evaluation 页面缺少演示数据集");
  }

  return dataset;
}

const fallbackDataset = getFallbackDataset();

type DatasetLoadState =
  | { status: "loading"; error: null }
  | { status: "success"; error: null }
  | { status: "error"; error: string };

type ApiListLoadState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type RunMutationState =
  | { status: "idle"; message: string | null }
  | { status: "submitting"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "cancelled"; message: string };

type AsyncUxTone = "info" | "success" | "warning";

type EvaluationMutationDescriptor = {
  title: string;
  tone: AsyncUxTone;
  canCancel: boolean;
  canRetry: boolean;
  message: string;
};

type EvaluationQueueDescriptor = {
  tone: AsyncUxTone;
  label: string;
  message: string;
};

const fallbackSchemaOptions: SelectOption[] = [
  {
    value: initialRunDraft.schemaVersion,
    label: initialRunDraft.schemaVersion
  }
];

const fallbackProviderOptions: SelectOption[] = [
  {
    value: initialRunDraft.modelVersion,
    label: initialRunDraft.modelVersion
  }
];

export const parseEvaluationSchemaOptions = normalizeSchemaSelectOptions;
export const parseEvaluationProviderOptions = (response: Parameters<typeof normalizeProviderSelectOptions>[0]) =>
  normalizeProviderSelectOptions(response, "llm");

function mapApiRuns(items: Parameters<typeof normalizeEvaluationRuns>[0], displayDatasets: EvaluationDataset[]) {
  const datasetNamesById = new Map(displayDatasets.map((dataset) => [dataset.id, dataset.name]));
  const mapped = normalizeEvaluationRuns(items, datasetNamesById);

  return mapped.length > 0 ? mapped : completedRuns;
}

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function parseSampleLimit(sampleScope: string) {
  const matchedNumber = sampleScope.match(/\d+/u)?.[0];
  if (!matchedNumber) {
    return undefined;
  }

  const value = Number(matchedNumber);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function buildEvaluationRunRequest(datasetId: string, draft: EvaluationRunDraft) {
  const sampleLimit = parseSampleLimit(draft.sampleScope);

  return {
    datasetId,
    schemaKey: draft.schemaVersion,
    providerKey: draft.modelVersion,
    ...(sampleLimit === undefined ? {} : { sampleLimit })
  };
}

export function buildEvaluationSampleImportPayload(importFlow: ImportFlowState) {
  const fieldKey = importFlow.groundTruthFieldKey.trim() || "feedbackValue";
  const value = importFlow.groundTruthValue;

  return [
    {
      externalId: importFlow.fileName,
      input: {
        sourceType: importFlow.sourceType,
        fileName: importFlow.fileName,
        predictedValue: importFlow.predictedValue
      },
      groundTruth: {
        [fieldKey]: {
          value,
          normalizedValue: value,
          expectedNeedsReview: importFlow.expectedNeedsReview
        }
      },
      metadata: {
        sourceType: importFlow.sourceType,
        fileName: importFlow.fileName,
        groundTruthFieldKey: fieldKey
      }
    }
  ];
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function describeEvaluationMutationState(
  target: "run" | "import",
  state: RunMutationState
): EvaluationMutationDescriptor {
  const targetLabel = target === "run" ? "评测任务" : "样本导入";

  if (state.status === "submitting") {
    return {
      title: target === "run" ? "评测任务提交中" : "样本导入提交中",
      tone: "info",
      canCancel: true,
      canRetry: false,
      message:
        target === "run"
          ? "正在创建评测任务，后端会把 run 放入评测队列。"
          : "正在导入样本，后端会校验脱敏状态和字段级 ground truth。"
    };
  }

  if (state.status === "success") {
    return {
      title: `${targetLabel}已完成`,
      tone: "success",
      canCancel: false,
      canRetry: true,
      message: state.message
    };
  }

  if (state.status === "cancelled") {
    return {
      title: `${targetLabel}已取消`,
      tone: "warning",
      canCancel: false,
      canRetry: true,
      message: state.message
    };
  }

  if (state.status === "error") {
    return {
      title: `${targetLabel}创建失败`,
      tone: "warning",
      canCancel: false,
      canRetry: true,
      message: state.message
    };
  }

  return {
    title: `${targetLabel}待提交`,
    tone: "info",
    canCancel: false,
    canRetry: false,
    message: "等待用户提交。"
  };
}

export function describeEvaluationRunQueueState(status: EvaluationRun["status"]): EvaluationQueueDescriptor {
  if (status === "运行中") {
    return {
      tone: "info",
      label: "处理中",
      message: "评测 worker 正在运行，可稍后刷新 metrics。"
    };
  }

  if (status === "已完成") {
    return {
      tone: "success",
      label: "已完成",
      message: "评测 run 已完成，可查看 metrics 和版本对比。"
    };
  }

  if (status === "已失败") {
    return {
      tone: "warning",
      label: "需要重试",
      message: "评测 run 失败，请检查 Provider、Schema 和样本脱敏状态后重跑。"
    };
  }

  return {
    tone: "info",
    label: "队列等待",
    message: "评测 run 已创建，等待 worker 读取样本并执行识别评估。"
  };
}

export default function EvaluationPage() {
  const { api } = useAuth();

  const [selectedDatasetId, setSelectedDatasetId] = useState(fallbackDataset.id);
  const [displayDatasets, setDisplayDatasets] = useState<EvaluationDataset[]>(datasets);
  const [datasetLoadState, setDatasetLoadState] = useState<DatasetLoadState>({
    status: "loading",
    error: null
  });
  const [importFlow, setImportFlow] = useState<ImportFlowState>(initialImportFlow);
  const [runDraft, setRunDraft] = useState<EvaluationRunDraft>(initialRunDraft);
  const [schemaOptions, setSchemaOptions] = useState<SelectOption[]>(fallbackSchemaOptions);
  const [providerOptions, setProviderOptions] = useState<SelectOption[]>(fallbackProviderOptions);
  const [configLoadState, setConfigLoadState] = useState<ApiListLoadState>({
    status: "loading",
    message: "正在读取真实 Schema 和 Provider 配置。"
  });
  const [runs, setRuns] = useState<EvaluationRun[]>(completedRuns);
  const [runLoadState, setRunLoadState] = useState<ApiListLoadState>({
    status: "loading",
    message: "正在读取真实评测运行。"
  });
  const [displayMetrics, setDisplayMetrics] = useState(metricCards);
  const [metricLoadState, setMetricLoadState] = useState<ApiListLoadState>({
    status: "loading",
    message: "正在读取真实评测指标。"
  });
  const [runMutationState, setRunMutationState] = useState<RunMutationState>({
    status: "idle",
    message: null
  });
  const [importMutationState, setImportMutationState] = useState<RunMutationState>({
    status: "idle",
    message: null
  });
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const importAbortControllerRef = useRef<AbortController | null>(null);
  const lastRunDraftRef = useRef<EvaluationRunDraft>(initialRunDraft);
  const lastImportFlowRef = useRef<ImportFlowState>(initialImportFlow);

  useEffect(
    () => () => {
      runAbortControllerRef.current?.abort();
      importAbortControllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    let shouldIgnore = false;

    async function loadEvaluationConfig() {
      setConfigLoadState({ status: "loading", message: "正在读取真实 Schema 和 Provider 配置。" });

      try {
        const [schemaResponse, providerResponse] = await Promise.all([api.listSchemas(), api.listProviders()]);
        if (shouldIgnore) {
          return;
        }

        const nextSchemaOptions = parseEvaluationSchemaOptions(schemaResponse);
        const nextProviderOptions = parseEvaluationProviderOptions(providerResponse);

        if (nextSchemaOptions.length > 0) {
          setSchemaOptions(nextSchemaOptions);
          setRunDraft((currentDraft) => ({
            ...currentDraft,
            schemaVersion: nextSchemaOptions.some((option) => option.value === currentDraft.schemaVersion)
              ? currentDraft.schemaVersion
              : nextSchemaOptions[0]?.value ?? currentDraft.schemaVersion
          }));
        }

        if (nextProviderOptions.length > 0) {
          setProviderOptions(nextProviderOptions);
          setRunDraft((currentDraft) => ({
            ...currentDraft,
            modelVersion: nextProviderOptions.some((option) => option.value === currentDraft.modelVersion)
              ? currentDraft.modelVersion
              : nextProviderOptions[0]?.value ?? currentDraft.modelVersion
          }));
        }

        setConfigLoadState({
          status: "success",
          message: "评测创建已使用真实 Schema/Provider key。"
        });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setSchemaOptions(fallbackSchemaOptions);
        setProviderOptions(fallbackProviderOptions);
        setConfigLoadState({
          status: "error",
          message: formatApiError(error, "Schema/Provider 配置接口暂时不可用，继续使用静态兜底选项。")
        });
      }
    }

    void loadEvaluationConfig();

    return () => {
      shouldIgnore = true;
    };
  }, [api]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadEvaluationDatasets() {
      setDatasetLoadState({ status: "loading", error: null });

      try {
        // Evaluation 页面优先读取真实数据集，接口异常时保留本地演示数据作为兜底。
        const response = await api.listEvaluationDatasets();
        if (shouldIgnore) {
          return;
        }

        const nextDatasets = normalizeEvaluationDatasets(response.items, datasets);
        setDisplayDatasets(nextDatasets);
        setSelectedDatasetId((currentId) => {
          const stillExists = nextDatasets.some((dataset) => dataset.id === currentId);
          return stillExists ? currentId : nextDatasets[0]?.id ?? fallbackDataset.id;
        });
        setDatasetLoadState({ status: "success", error: null });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setDisplayDatasets(datasets);
        setSelectedDatasetId((currentId) => {
          const stillExists = datasets.some((dataset) => dataset.id === currentId);
          return stillExists ? currentId : fallbackDataset.id;
        });
        setDatasetLoadState({
          status: "error",
          error: formatApiError(error, "Evaluation Dataset 接口暂时不可用")
        });
      }
    }

    void loadEvaluationDatasets();

    return () => {
      shouldIgnore = true;
    };
  }, [api]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadEvaluationRuns() {
      setRunLoadState({ status: "loading", message: "正在读取真实评测运行。" });

      try {
        const response = await api.listEvaluationRuns();
        if (shouldIgnore) {
          return;
        }

        const nextRuns = mapApiRuns(response.items, displayDatasets);
        setRuns(nextRuns);
        setRunLoadState({ status: "success", message: `已读取 ${nextRuns.length} 条真实评测运行。` });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setRuns(completedRuns);
        setRunLoadState({
          status: "error",
          message: formatApiError(error, "Evaluation Run 接口暂时不可用，继续展示静态运行。")
        });
      }
    }

    void loadEvaluationRuns();

    return () => {
      shouldIgnore = true;
    };
  }, [api, displayDatasets]);

  useEffect(() => {
    let shouldIgnore = false;
    const firstRun = runs[0];

    async function loadEvaluationMetrics() {
      if (!firstRun) {
        setDisplayMetrics([]);
        setMetricLoadState({ status: "success", message: "暂无评测运行，无法读取 metrics。" });
        return;
      }

      setMetricLoadState({ status: "loading", message: `正在读取 ${firstRun.id} 的真实 metrics。` });

      try {
        const response = await api.listEvaluationRunMetrics(firstRun.id);
        if (shouldIgnore) {
          return;
        }

        const nextMetrics = normalizeEvaluationMetrics(response, metricCards);
        setDisplayMetrics(nextMetrics);
        setMetricLoadState({ status: "success", message: `已读取 ${firstRun.id} 的真实 metrics。` });
      } catch (error) {
        if (shouldIgnore) {
          return;
        }

        setDisplayMetrics(metricCards);
        setMetricLoadState({
          status: "error",
          message: formatApiError(error, "Evaluation Metrics 接口暂时不可用，继续展示静态指标。")
        });
      }
    }

    void loadEvaluationMetrics();

    return () => {
      shouldIgnore = true;
    };
  }, [api, runs]);

  const selectedDataset = displayDatasets.find((dataset) => dataset.id === selectedDatasetId) ?? displayDatasets[0] ?? fallbackDataset;
  const runMutationDescriptor = describeEvaluationMutationState("run", runMutationState);
  const importMutationDescriptor = describeEvaluationMutationState("import", importMutationState);
  const latestRun = runs[0];
  const latestRunQueueDescriptor = latestRun ? describeEvaluationRunQueueState(latestRun.status) : null;

  const dataQualitySummary = useMemo(() => {
    const totalSamples = displayDatasets.reduce((sum, dataset) => sum + dataset.sampleCount, 0);
    const unsafeDatasets = displayDatasets.filter((dataset) => !dataset.deidentified).length;
    const readyDatasets = displayDatasets.filter((dataset) => dataset.status === "ready").length;

    return {
      totalSamples,
      unsafeDatasets,
      readyDatasets
    };
  }, [displayDatasets]);

  const handleImportChange = <Key extends keyof ImportFlowState>(
    key: Key,
    value: ImportFlowState[Key]
  ) => {
    setImportFlow((currentFlow) => ({
      ...currentFlow,
      [key]: value
    }));
  };

  const handleRunDraftChange = <Key extends keyof EvaluationRunDraft>(
    key: Key,
    value: EvaluationRunDraft[Key]
  ) => {
    setRunDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value
    }));
  };

  const runEvaluationWithDraft = async (draft: EvaluationRunDraft) => {
    runAbortControllerRef.current?.abort();
    const controller = new AbortController();
    runAbortControllerRef.current = controller;
    lastRunDraftRef.current = draft;
    setRunMutationState({ status: "submitting", message: "正在创建评测任务" });

    try {
      const response = await api.createEvaluationRun(buildEvaluationRunRequest(selectedDataset.id, draft), {
        signal: controller.signal
      });
      const runId = readEvaluationRunId(response) ?? `run-${runs.length + 1000}`;
      const nextRun: EvaluationRun = {
        id: runId,
        name: draft.name,
        datasetName: selectedDataset.name,
        schemaVersion: draft.schemaVersion,
        modelVersion: draft.modelVersion,
        status: readEvaluationRunStatus(response),
        createdAt: new Date().toLocaleString("zh-CN", { hour12: false })
      };

      setRuns((currentRuns) => [nextRun, ...currentRuns]);
      setRunMutationState({
        status: "success",
        message: `评测任务已创建，Run ID：${runId}`
      });
    } catch (error) {
      if (isAbortError(error)) {
        setRunMutationState({
          status: "cancelled",
          message: "评测创建已取消，可重跑上一次配置。"
        });
        return;
      }

      setRunMutationState({
        status: "error",
        message: formatApiError(error, "创建评测任务失败")
      });
    } finally {
      if (runAbortControllerRef.current === controller) {
        runAbortControllerRef.current = null;
      }
    }
  };

  const handleCreateRun = async () => {
    await runEvaluationWithDraft(runDraft);
  };

  const handleCancelRun = () => {
    runAbortControllerRef.current?.abort();
  };

  const handleRerun = async () => {
    await runEvaluationWithDraft(lastRunDraftRef.current);
  };

  const handleValidateSamples = () => {
    setImportFlow((currentFlow) => ({
      ...currentFlow,
      sampleImportStatus: "校验中",
      groundTruthStatusText: "字段匹配中"
    }));
    setImportMutationState({
      status: "idle",
      message: "仅完成本地字段预检，提交导入时会调用后端 samples API。"
    });
  };

  const importSamplesWithFlow = async (flow: ImportFlowState) => {
    importAbortControllerRef.current?.abort();
    const controller = new AbortController();
    importAbortControllerRef.current = controller;
    lastImportFlowRef.current = flow;
    setImportMutationState({ status: "submitting", message: "正在调用后端样本导入接口" });

    try {
      // Demo 页面先提供一条可编辑的最小字段级 ground truth，避免评估样本落库后无法参与字段指标计算。
      await api.importEvaluationSamples(selectedDataset.id, buildEvaluationSampleImportPayload(flow), {
        signal: controller.signal
      });
      setImportFlow((currentFlow) => ({
        ...currentFlow,
        sampleImportStatus: "已导入",
        groundTruthStatusText: "已完成"
      }));
      setImportMutationState({
        status: "success",
        message: "样本已通过后端 samples API 导入。"
      });
    } catch (error) {
      if (isAbortError(error)) {
        setImportMutationState({
          status: "cancelled",
          message: "样本导入已取消，可重跑上一次导入配置。"
        });
        return;
      }

      setImportFlow((currentFlow) => ({
        ...currentFlow,
        sampleImportStatus: "校验中",
        groundTruthStatusText: "字段匹配中"
      }));
      setImportMutationState({
        status: "error",
        message: formatApiError(error, "样本导入需后端接入或权限放行，当前未写入真实数据。")
      });
    } finally {
      if (importAbortControllerRef.current === controller) {
        importAbortControllerRef.current = null;
      }
    }
  };

  const handleCompleteImport = async () => {
    await importSamplesWithFlow(importFlow);
  };

  const handleCancelImport = () => {
    importAbortControllerRef.current?.abort();
  };

  const handleRetryImport = async () => {
    await importSamplesWithFlow(lastImportFlowRef.current);
  };

  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Evaluation Center</p>
          <h1>评测中心</h1>
          <p>管理医疗抽取评测集、样本导入、ground truth、评测任务和版本对比。</p>
          <div className="page-header__meta" aria-label="Evaluation 数据治理摘要">
            <span className="page-header__meta-item">
              <strong>数据集</strong>
              <span>{displayDatasets.length} 个评测集合</span>
            </span>
            <span className="page-header__meta-item">
              <strong>样本总量</strong>
              <span>{dataQualitySummary.totalSamples} 条可管理样本</span>
            </span>
            <span className="page-header__meta-item">
              <strong>脱敏风险</strong>
              <span>{dataQualitySummary.unsafeDatasets} 个数据集需确认</span>
            </span>
          </div>
        </div>
        <Tag color="arcoblue" className="status-pill">
          <AppIcon icon={navigationIcons.evaluation} size="sm" />
          {selectedDataset.scenario}
        </Tag>
      </header>

      {!selectedDataset.deidentified ? (
        <Alert
          type="error"
          showIcon
          title="未标记 deidentified 的 warning"
          content={`${selectedDataset.name} 未标记为已脱敏。创建评测前需要完成脱敏确认，避免 PHI 数据进入离线评测链路。`}
        />
      ) : (
        <Alert type="warning" showIcon title="数据治理提示" content="当前数据集已标记脱敏，仍需保留导入批次、ground truth 来源和复核记录。" />
      )}

      <div className="metric-grid">
        <Card className="metric-card">
          <Tag color="arcoblue">
            <AppIcon icon={dashboardMetricIcons.dataset} size="xs" />
            Dataset
          </Tag>
          <h2>{displayDatasets.length}</h2>
          <p>{datasetLoadState.status === "loading" ? "正在读取真实数据集" : "评测数据集数量"}</p>
        </Card>
        <Card className="metric-card">
          <Tag color="green">Samples</Tag>
          <h2>{dataQualitySummary.totalSamples}</h2>
          <p>可管理样本总量</p>
        </Card>
        <Card className="metric-card">
          <Tag color="green">Ready</Tag>
          <h2>{dataQualitySummary.readyDatasets}</h2>
          <p>可直接运行评测</p>
        </Card>
        <Card className="metric-card">
          <Tag color={dataQualitySummary.unsafeDatasets > 0 ? "red" : "gray"}>Risk</Tag>
          <h2>{dataQualitySummary.unsafeDatasets}</h2>
          <p>未标记脱敏数据集</p>
        </Card>
      </div>

      {datasetLoadState.error ? (
        <Alert type="warning" showIcon title="Evaluation Dataset 接口加载失败" content={`${datasetLoadState.error}。当前页面继续展示静态兜底数据，样本导入和数据集创建模拟状态不会影响页面稳定性。`} />
      ) : null}

      {runLoadState.status === "error" || metricLoadState.status === "error" ? (
        <Alert type="warning" showIcon title="Evaluation API 读取提示" content={runLoadState.status === "error" ? runLoadState.message : metricLoadState.message} />
      ) : null}

      {configLoadState.status === "error" ? (
        <Alert type="warning" showIcon title="评测配置读取提示" content={configLoadState.message} />
      ) : null}

      <Card className="panel" aria-labelledby="evaluation-async-recovery-title">
        <h2 id="evaluation-async-recovery-title">异步任务恢复</h2>
        <section className="operations-status-strip" aria-label="Evaluation 异步任务状态">
          <article>
            <strong>{runMutationDescriptor.title}</strong>
            <span>{runMutationDescriptor.message}</span>
          </article>
          <article>
            <strong>{importMutationDescriptor.title}</strong>
            <span>{importMutationDescriptor.message}</span>
          </article>
          <article>
            <strong>{latestRunQueueDescriptor ? latestRunQueueDescriptor.label : "暂无 run"}</strong>
            <span>{latestRunQueueDescriptor ? `${latestRun?.id ?? ""}：${latestRunQueueDescriptor.message}` : "还没有可跟踪的评测 run。"}</span>
          </article>
        </section>
        {runMutationState.status === "error" || importMutationState.status === "error" ? (
          <Alert type="warning" showIcon content="失败后可使用重跑按钮复用上一次配置；取消只中断当前前端请求，不会把真实外部集成标记为通过。" />
        ) : null}
      </Card>

      <DatasetListPanel
        datasets={displayDatasets}
        selectedDatasetId={selectedDatasetId}
        onSelectDataset={setSelectedDatasetId}
      />

      <SampleImportPanel
        importFlow={importFlow}
        onChange={handleImportChange}
        onValidateSamples={handleValidateSamples}
        onCompleteImport={handleCompleteImport}
        onCancelImport={handleCancelImport}
        onRetryImport={handleRetryImport}
        isImporting={importMutationState.status === "submitting"}
        canRetryImport={importMutationState.status !== "idle"}
      />

      {importMutationState.message ? (
        <Card className="panel" aria-labelledby="evaluation-import-state-title">
          <h2 id="evaluation-import-state-title">样本导入状态</h2>
          <Alert type={importMutationState.status === "error" ? "error" : "info"} showIcon content={importMutationState.message} />
        </Card>
      ) : null}

      <EvaluationRunPanel
        draft={runDraft}
        runs={runs}
        schemaOptions={schemaOptions}
        providerOptions={providerOptions}
        mutationState={runMutationState}
        onChange={handleRunDraftChange}
        onCreateRun={handleCreateRun}
        onCancelRun={handleCancelRun}
        onRerun={handleRerun}
      />

      <Card className="panel" aria-labelledby="evaluation-api-state-title">
        <h2 id="evaluation-api-state-title">真实 API 状态</h2>
        <p>{configLoadState.message}</p>
        <p>{runLoadState.message}</p>
        <p>{metricLoadState.message}</p>
      </Card>

      <MetricCardsPanel metrics={displayMetrics} />
      <VersionComparisonPanel rows={versionComparisonRows} />
    </main>
  );
}
