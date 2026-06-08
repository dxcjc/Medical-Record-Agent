import { useEffect, useMemo, useState } from "react";
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
  | { status: "error"; message: string };

type SelectOption = {
  value: string;
  label: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readItems(value: unknown) {
  return isRecord(value) && Array.isArray(value.items) ? value.items : [];
}

export function parseEvaluationSchemaOptions(response: unknown): SelectOption[] {
  return readItems(response).flatMap((item): SelectOption[] => {
    if (!isRecord(item)) {
      return [];
    }

    const value = readStringField(item, ["schemaKey", "key", "id"]);
    if (!value) {
      return [];
    }

    const displayName = readStringField(item, ["displayName", "label", "name"]) ?? value;
    const version = typeof item.version === "number" || typeof item.version === "string" ? ` v${item.version}` : "";

    return [
      {
        value,
        label: `${displayName}${version}`
      }
    ];
  });
}

export function parseEvaluationProviderOptions(response: unknown): SelectOption[] {
  return readItems(response).flatMap((item): SelectOption[] => {
    if (!isRecord(item) || item.kind !== "llm") {
      return [];
    }

    const value = readStringField(item, ["key", "id"]);
    if (!value) {
      return [];
    }

    return [
      {
        value,
        label: readStringField(item, ["displayName", "name", "label"]) ?? value
      }
    ];
  });
}

function readNumberField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readBooleanField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function normalizeDatasetStatus(value: string | null) {
  if (value === "ready" || value === "published" || value === "active") {
    return "ready";
  }

  if (value === "importing" || value === "draft") {
    return "importing";
  }

  return "blocked";
}

function normalizeGroundTruthStatus(value: string | null) {
  if (value === "verified" || value === "ready" || value === "completed") {
    return "verified";
  }

  if (value === "partial" || value === "importing" || value === "draft") {
    return "partial";
  }

  return "missing";
}

function mapApiDataset(item: unknown, index: number): EvaluationDataset | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const source = item as Record<string, unknown>;
  const id = readStringField(source, ["id", "key"]);
  if (!id) {
    return null;
  }

  const metadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
    ? (source.metadata as Record<string, unknown>)
    : {};
  const fallback = datasets[index % datasets.length] ?? datasets[0];
  if (!fallback) {
    return null;
  }

  const displayName = readStringField(source, ["displayName", "name", "key"]) ?? fallback.name;
  const scenario =
    readStringField(source, ["scenario", "description"]) ??
    readStringField(metadata, ["scenario", "description"]) ??
    fallback.scenario;
  const sampleCount = readNumberField(source, ["sampleCount", "caseCount", "samplesCount"]) ?? fallback.sampleCount;
  const deidentified = readBooleanField(source, ["deidentified"]) ?? fallback.deidentified;

  return {
    id,
    name: displayName,
    scenario,
    sampleCount,
    status: normalizeDatasetStatus(readStringField(source, ["status"])),
    groundTruthStatus: normalizeGroundTruthStatus(readStringField(source, ["groundTruthStatus"])),
    deidentified,
    owner: readStringField(source, ["owner", "createdBy"]) ?? fallback.owner,
    updatedAt: readStringField(source, ["updatedAt", "createdAt"]) ?? fallback.updatedAt
  };
}

function mapApiDatasets(items: unknown[]) {
  const mapped = items
    .map((item, index) => mapApiDataset(item, index))
    .filter((dataset): dataset is EvaluationDataset => Boolean(dataset));

  return mapped.length > 0 ? mapped : datasets;
}

function mapApiRun(item: unknown, datasetNamesById: Map<string, string>, index: number): EvaluationRun | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const source = item as Record<string, unknown>;
  const id = readStringField(source, ["id", "runId"]);
  if (!id) {
    return null;
  }

  const fallback = completedRuns[index % completedRuns.length] ?? completedRuns[0];
  const datasetId = readStringField(source, ["datasetId"]);
  const providerKey = readStringField(source, ["providerKey", "modelVersion"]) ?? fallback?.modelVersion ?? "真实 provider";
  const schemaVersion = readStringField(source, ["schemaVersion", "schemaKey"]) ?? fallback?.schemaVersion ?? "后端未返回";

  return {
    id,
    name: readStringField(source, ["name", "displayName"]) ?? `评测任务 ${id}`,
    datasetName: datasetId ? datasetNamesById.get(datasetId) ?? datasetId : fallback?.datasetName ?? "后端未返回",
    schemaVersion,
    modelVersion: providerKey,
    status: normalizeRunStatus(readStringField(source, ["status"])),
    createdAt: readStringField(source, ["createdAt", "updatedAt"]) ?? fallback?.createdAt ?? "后端未返回"
  };
}

function mapApiRuns(items: unknown[], displayDatasets: EvaluationDataset[]) {
  const datasetNamesById = new Map(displayDatasets.map((dataset) => [dataset.id, dataset.name]));
  const mapped = items
    .map((item, index) => mapApiRun(item, datasetNamesById, index))
    .filter((run): run is EvaluationRun => Boolean(run));

  return mapped.length > 0 ? mapped : completedRuns;
}

function normalizeRunStatus(status: string | null): EvaluationRun["status"] {
  if (status === "running") {
    return "运行中";
  }

  if (status === "completed" || status === "succeeded") {
    return "已完成";
  }

  return "排队中";
}

function mapApiMetrics(response: unknown): typeof metricCards {
  const metrics =
    response && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>).metrics
      : null;

  if (!Array.isArray(metrics) || metrics.length === 0) {
    return metricCards;
  }

  return metrics.map((metric, index) => {
    const source = metric && typeof metric === "object" && !Array.isArray(metric) ? (metric as Record<string, unknown>) : {};
    const name = readStringField(source, ["name", "label"]) ?? `metric-${index + 1}`;
    const value = readNumberField(source, ["value", "score"]) ?? 0;
    const unit = readStringField(source, ["unit"]) ?? "";
    const displayValue = unit === "ratio" ? `${(value * 100).toFixed(1)}%` : `${value}${unit ? ` ${unit}` : ""}`;

    return {
      id: name,
      label: name,
      value: displayValue,
      delta: "API",
      detail: "来自评估运行 metrics API。"
    };
  });
}

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function extractRunId(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return null;
  }

  const source = response as Record<string, unknown>;
  const directId = readStringField(source, ["id"]);
  if (directId) {
    return directId;
  }

  const run = source.run;
  if (run && typeof run === "object" && !Array.isArray(run)) {
    return readStringField(run as Record<string, unknown>, ["id"]);
  }

  return null;
}

function extractRunStatus(response: unknown) {
  const fallbackStatus: EvaluationRun["status"] = "排队中";
  const source =
    response && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null;
  const run =
    source?.run && typeof source.run === "object" && !Array.isArray(source.run)
      ? (source.run as Record<string, unknown>)
      : source;
  const status = run ? readStringField(run, ["status"]) : null;

  return status ? normalizeRunStatus(status) : fallbackStatus;
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

        const nextDatasets = mapApiDatasets(response.items);
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

        const nextMetrics = mapApiMetrics(response);
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

  const handleCreateRun = async () => {
    setRunMutationState({ status: "submitting", message: "正在创建评测任务" });

    try {
      const response = await api.createEvaluationRun(buildEvaluationRunRequest(selectedDataset.id, runDraft));
      const runId = extractRunId(response) ?? `run-${runs.length + 1000}`;
      const nextRun: EvaluationRun = {
        id: runId,
        name: runDraft.name,
        datasetName: selectedDataset.name,
        schemaVersion: runDraft.schemaVersion,
        modelVersion: runDraft.modelVersion,
        status: extractRunStatus(response),
        createdAt: new Date().toLocaleString("zh-CN", { hour12: false })
      };

      setRuns((currentRuns) => [nextRun, ...currentRuns]);
      setRunMutationState({
        status: "success",
        message: `评测任务已创建，Run ID：${runId}`
      });
    } catch (error) {
      setRunMutationState({
        status: "error",
        message: formatApiError(error, "创建评测任务失败")
      });
    }
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

  const handleCompleteImport = async () => {
    setImportMutationState({ status: "submitting", message: "正在调用后端样本导入接口" });

    try {
      // Demo 页面先提供一条可编辑的最小字段级 ground truth，避免评估样本落库后无法参与字段指标计算。
      await api.importEvaluationSamples(selectedDataset.id, buildEvaluationSampleImportPayload(importFlow));
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
      setImportFlow((currentFlow) => ({
        ...currentFlow,
        sampleImportStatus: "校验中",
        groundTruthStatusText: "字段匹配中"
      }));
      setImportMutationState({
        status: "error",
        message: formatApiError(error, "样本导入需后端接入或权限放行，当前未写入真实数据。")
      });
    }
  };

  return (
    <main className="app-page">
      <header className="toolbar">
        <div>
          <h1>Evaluation</h1>
          <p>管理医疗抽取评测集、样本导入、ground truth、评测任务和版本对比。</p>
        </div>
        <span className="status-pill">
          <AppIcon icon={navigationIcons.evaluation} size="sm" />
          {selectedDataset.scenario}
        </span>
      </header>

      {!selectedDataset.deidentified ? (
        <section className="warning-box" role="alert">
          <AppIcon icon={statusIcons.danger} tone="red" />
          <div>
            <strong>未标记 deidentified 的 warning</strong>
            <p>
              {selectedDataset.name} 未标记为已脱敏。创建评测前需要完成脱敏确认，
              避免 PHI 数据进入离线评测链路。
            </p>
          </div>
        </section>
      ) : (
        <section className="warning-box" role="note">
          <AppIcon icon={statusIcons.warning} tone="orange" />
          <div>
            <strong>数据治理提示</strong>
            <p>当前数据集已标记脱敏，仍需保留导入批次、ground truth 来源和复核记录。</p>
          </div>
        </section>
      )}

      <div className="metric-grid">
        <article className="metric-card">
          <span className="status-pill">
            <AppIcon icon={dashboardMetricIcons.dataset} size="xs" />
            Dataset
          </span>
          <h2>{displayDatasets.length}</h2>
          <p>{datasetLoadState.status === "loading" ? "正在读取真实数据集" : "评测数据集数量"}</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">Samples</span>
          <h2>{dataQualitySummary.totalSamples}</h2>
          <p>可管理样本总量</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">Ready</span>
          <h2>{dataQualitySummary.readyDatasets}</h2>
          <p>可直接运行评测</p>
        </article>
        <article className="metric-card">
          <span className="status-pill">Risk</span>
          <h2>{dataQualitySummary.unsafeDatasets}</h2>
          <p>未标记脱敏数据集</p>
        </article>
      </div>

      {datasetLoadState.error ? (
        <section className="warning-box" role="alert">
          <AppIcon icon={statusIcons.warning} tone="orange" />
          <div>
            <strong>Evaluation Dataset 接口加载失败</strong>
            <p>{datasetLoadState.error}。当前页面继续展示静态兜底数据，样本导入和数据集创建模拟状态不会影响页面稳定性。</p>
          </div>
        </section>
      ) : null}

      {runLoadState.status === "error" || metricLoadState.status === "error" ? (
        <section className="warning-box" role="alert">
          <AppIcon icon={statusIcons.warning} tone="orange" />
          <div>
            <strong>Evaluation API 读取提示</strong>
            <p>{runLoadState.status === "error" ? runLoadState.message : metricLoadState.message}</p>
          </div>
        </section>
      ) : null}

      {configLoadState.status === "error" ? (
        <section className="warning-box" role="alert">
          <AppIcon icon={statusIcons.warning} tone="orange" />
          <div>
            <strong>评测配置读取提示</strong>
            <p>{configLoadState.message}</p>
          </div>
        </section>
      ) : null}

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
      />

      {importMutationState.message ? (
        <section className="panel" aria-labelledby="evaluation-import-state-title">
          <h2 id="evaluation-import-state-title">样本导入状态</h2>
          <p
            className={importMutationState.status === "error" ? "form-error" : undefined}
            role={importMutationState.status === "error" ? "alert" : "status"}
          >
            {importMutationState.message}
          </p>
        </section>
      ) : null}

      <EvaluationRunPanel
        draft={runDraft}
        runs={runs}
        schemaOptions={schemaOptions}
        providerOptions={providerOptions}
        mutationState={runMutationState}
        onChange={handleRunDraftChange}
        onCreateRun={handleCreateRun}
      />

      <section className="panel" aria-labelledby="evaluation-api-state-title">
        <h2 id="evaluation-api-state-title">真实 API 状态</h2>
        <p>{configLoadState.message}</p>
        <p>{runLoadState.message}</p>
        <p>{metricLoadState.message}</p>
      </section>

      <MetricCardsPanel metrics={displayMetrics} />
      <VersionComparisonPanel rows={versionComparisonRows} />
    </main>
  );
}
