import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Database, ShieldAlert } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
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

type RunMutationState =
  | { status: "idle"; message: string | null }
  | { status: "submitting"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function readStringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
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

  if (status === "running") {
    return "运行中";
  }

  if (status === "completed") {
    return "已完成";
  }

  return fallbackStatus;
}

function parseProviderKey(modelVersion: string) {
  const providerKey = modelVersion.split("-")[0]?.trim();

  return providerKey && providerKey.length > 0 ? providerKey : "mock";
}

function parseSampleLimit(sampleScope: string) {
  const matchedNumber = sampleScope.match(/\d+/u)?.[0];
  if (!matchedNumber) {
    return undefined;
  }

  const value = Number(matchedNumber);
  return Number.isFinite(value) && value > 0 ? value : undefined;
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
  const [runs, setRuns] = useState<EvaluationRun[]>(completedRuns);
  const [runMutationState, setRunMutationState] = useState<RunMutationState>({
    status: "idle",
    message: null
  });

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
      const sampleLimit = parseSampleLimit(runDraft.sampleScope);
      const response = await api.createEvaluationRun({
        datasetId: selectedDataset.id,
        providerKey: parseProviderKey(runDraft.modelVersion),
        ...(sampleLimit === undefined ? {} : { sampleLimit })
      });
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

  return (
    <main className="app-page">
      <header className="toolbar">
        <div>
          <h1>Evaluation</h1>
          <p>管理医疗抽取评测集、样本导入、ground truth、评测任务和版本对比。</p>
        </div>
        <span className="status-pill">
          <ClipboardCheck aria-hidden size={16} />
          {selectedDataset.scenario}
        </span>
      </header>

      {!selectedDataset.deidentified ? (
        <section className="warning-box" role="alert">
          <ShieldAlert aria-hidden size={18} />
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
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>数据治理提示</strong>
            <p>当前数据集已标记脱敏，仍需保留导入批次、ground truth 来源和复核记录。</p>
          </div>
        </section>
      )}

      <div className="metric-grid">
        <article className="metric-card">
          <span className="status-pill">
            <Database aria-hidden size={14} />
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
          <AlertTriangle aria-hidden size={18} />
          <div>
            <strong>Evaluation Dataset 接口加载失败</strong>
            <p>{datasetLoadState.error}。当前页面继续展示静态兜底数据，样本导入和数据集创建模拟状态不会影响页面稳定性。</p>
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
        onValidateSamples={() =>
          setImportFlow((currentFlow) => ({
            ...currentFlow,
            sampleImportStatus: "校验中",
            groundTruthStatusText: "字段匹配中"
          }))
        }
        onCompleteImport={() =>
          setImportFlow((currentFlow) => ({
            ...currentFlow,
            sampleImportStatus: "已导入",
            groundTruthStatusText: "已完成"
          }))
        }
      />

      <EvaluationRunPanel
        draft={runDraft}
        runs={runs}
        mutationState={runMutationState}
        onChange={handleRunDraftChange}
        onCreateRun={handleCreateRun}
      />

      <MetricCardsPanel metrics={metricCards} />
      <VersionComparisonPanel rows={versionComparisonRows} />
    </main>
  );
}
