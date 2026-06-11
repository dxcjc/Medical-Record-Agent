import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Progress, Select, Space } from "@arco-design/web-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ApiRecognitionJob, ApiRecognitionResult } from "../../api/types";
import {
  normalizeProviderSelectOptions,
  normalizeSchemaSelectOptions,
  type SelectOption
} from "../../api/normalizers";
import { useAuth } from "../../auth/AuthContext";
import { blobSha256Hex, blobToBase64 } from "../../utils/fileContent";
import { AppIcon, actionIcons, commonUiIcons, dashboardMetricIcons, statusIcons } from "../../icons/appIcons";
import {
  adapterOptions,
  schemaOptions,
} from "./components/demoData";
import { EmptyPanel, PageHeader, SectionTitle, StatusPill } from "./components/RecognitionShared";

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; jobId: string; progress: RecognitionAsyncProgress; result?: ApiRecognitionResult }
  | { status: "error"; message: string }
  | { status: "cancelled"; message: string };

type RecognitionAsyncPhase = "queued" | "running" | "completed" | "failed";

export type RecognitionAsyncProgress = {
  jobId: string;
  status: string;
  phase: RecognitionAsyncPhase;
  label: string;
  percent: number;
  message: string;
  statusUrl?: string;
  resultUrl?: string;
  queueSummary?: string;
  workerSummary?: string;
  retrySummary?: string;
  recoveryAction?: string;
  shouldPoll: boolean;
  canOpenResult: boolean;
  resultLoaded?: boolean;
  errorMessage?: string;
};

export type RecognitionAsyncRecoveryHint = {
  tone: "info" | "success" | "warning";
  primaryAction: string;
  secondaryAction: string;
};

type PrivacyOptions = {
  deidentify: boolean;
  keepEvidence: boolean;
  allowWriteBack: boolean;
};

type RecognitionFileInput = Pick<File, "name" | "size" | "type"> & {
  arrayBuffer?: File["arrayBuffer"];
};

type FileValidationResult =
  | { valid: true }
  | { valid: false; message: string };

type LastRecognitionSubmit = {
  file: RecognitionFileInput;
  schemaName: string;
  adapter: (typeof adapterOptions)[number];
  ocrProvider: string;
  provider: string;
  privacy: PrivacyOptions;
};

export function canRerunRecognitionSubmit(
  lastSubmit: LastRecognitionSubmit | null,
  state: SubmitState
) {
  return state.status !== "loading" && !(state.status === "success" && state.progress.shouldPoll) && lastSubmit !== null;
}

type OptionLoadState = "idle" | "loading" | "success" | "error";

const maxRecognitionFileBytes = 20 * 1024 * 1024;
const acceptedRecognitionMimeTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);
const acceptedRecognitionExtensions = [".png", ".jpg", ".jpeg", ".pdf"];

const initialPrivacyOptions: PrivacyOptions = {
  deidentify: true,
  keepEvidence: true,
  allowWriteBack: false,
};

const visiblePrivacyOptionContent = {
  deidentify: {
    icon: actionIcons.privacyPolicy,
    title: "开启患者信息脱敏",
    description: "上传、评测和展示链路默认移除患者身份信息，降低 PHI 暴露风险。"
  },
  keepEvidence: {
    icon: dashboardMetricIcons.decisionPass,
    title: "保留字段证据链",
    description: "保留页码、原文引用和字段来源，便于复核人员追溯模型判断。"
  }
} as const satisfies Record<
  Exclude<keyof PrivacyOptions, "allowWriteBack">,
  {
    icon: LucideIcon;
    title: string;
    description: string;
  }
>;

const fallbackSchemaOptions: SelectOption[] = schemaOptions.map((option) => ({
  value: option,
  label: option,
}));

const fallbackProviderOptions: SelectOption[] = [];

export const LOCAL_PADDLE_OCR_PROVIDER_KEY = "local-paddleocr";

type RecognitionCapabilityStatus = "ready" | "blocked" | "checking";

type RecognitionCapabilitySummaryItem = {
  key: "ocr" | "storage" | "llm";
  label: string;
  value: string;
  status: RecognitionCapabilityStatus;
  description: string;
};

export const parseSchemaOptions = normalizeSchemaSelectOptions;
export const parseProviderOptions = normalizeProviderSelectOptions;

export function getVisibleRecognitionProviderOptions(
  response: Parameters<typeof normalizeProviderSelectOptions>[0],
  kind: "ocr" | "llm"
) {
  const options = parseProviderOptions(response, kind);
  const kindProviders = Array.isArray(response.items) ? response.items.filter((item) => item.kind === kind) : [];

  return {
    options,
    mockOnly: kindProviders.length > 0 && options.length === 0
  };
}

export function getRecognitionCapabilitySummary(llmProviders: SelectOption[]): RecognitionCapabilitySummaryItem[] {
  const currentModel = llmProviders[0];

  return [
    {
      key: "ocr",
      label: "本地 OCR",
      value: "PaddleOCR",
      status: "ready",
      description: "本项目固定使用本机 PaddleOCR，不需要录入 OCR Endpoint。"
    },
    {
      key: "storage",
      label: "文件保存",
      value: "内置本地存储",
      status: "ready",
      description: "识别文件和中间结果先写入项目内置保存策略。"
    },
    {
      key: "llm",
      label: "模型提供商",
      value: currentModel?.label ?? "待配置",
      status: currentModel ? "ready" : "blocked",
      description: currentModel ? "结构化抽取会使用当前选中的模型提供商。" : "请先在识别能力检查中配置一个可用模型。"
    }
  ];
}

export function getRecognitionProviderGate(llmProviders: SelectOption[]) {
  const canCreate = llmProviders.length > 0;

  return {
    canCreate,
    message: canCreate
      ? "本地 PaddleOCR、内置文件保存和模型提供商均已就绪。"
      : "请先配置模型提供商；本地 PaddleOCR 和内置文件保存已作为项目内置能力。"
  };
}

export function createSyntheticRecognitionFile() {
  return new File(["synthetic clinical record\n主诉：咳嗽三天。"], "synthetic-clinical-record.pdf", {
    type: "application/pdf"
  });
}

export function validateRecognitionFile(file: RecognitionFileInput): FileValidationResult {
  // 前端预检只负责给用户即时反馈，后端仍然需要保留完整的安全校验。
  // 这里先挡住空文件、超大文件和明显不支持的类型，避免用户等到上传后才发现问题。
  if (file.size <= 0) {
    return { valid: false, message: "病历文件内容为空，请重新选择文件。" };
  }

  if (file.size > maxRecognitionFileBytes) {
    return { valid: false, message: "单个病历文件不能超过 20MB。" };
  }

  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const hasAcceptedMimeType = acceptedRecognitionMimeTypes.has(mimeType);
  const hasAcceptedExtension = acceptedRecognitionExtensions.some((extension) => fileName.endsWith(extension));
  const canTrustExtensionFallback = mimeType.length === 0 || mimeType === "application/octet-stream";

  if (!hasAcceptedMimeType && !(canTrustExtensionFallback && hasAcceptedExtension)) {
    return { valid: false, message: "仅支持 PNG、JPG 或 PDF 病历文件。" };
  }

  return { valid: true };
}

function readRecordId(value: unknown) {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }

  return undefined;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function createApiRequestOptions(signal: AbortSignal | undefined) {
  return signal ? { signal } : {};
}

function readJobString(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function readJobNumber(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readJobRecord(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function isRecognitionPollingStatus(status: string | undefined) {
  return status === "queued" || status === "running";
}

export function isRecognitionSuccessfulTerminalStatus(status: string | undefined) {
  return (
    status === "completed" ||
    status === "needs_review" ||
    status === "partial_completed" ||
    status === "writeback_completed" ||
    status === "writeback_failed"
  );
}

function isRecognitionFailedTerminalStatus(status: string | undefined) {
  return status === "failed" || status === "cancelled";
}

function normalizeRecognitionAsyncPhase(status: string | undefined): RecognitionAsyncPhase {
  if (status === "running") {
    return "running";
  }

  if (isRecognitionSuccessfulTerminalStatus(status)) {
    return "completed";
  }

  if (isRecognitionFailedTerminalStatus(status)) {
    return "failed";
  }

  return "queued";
}

export function describeRecognitionAsyncProgress(
  job: ApiRecognitionJob,
  resultLoaded = false
): RecognitionAsyncProgress {
  const jobId = readJobString(job, ["id", "jobId"]) ?? "unknown-job";
  const status = readJobString(job, ["status"]) ?? "queued";
  const statusUrl = readJobString(job, ["statusUrl"]);
  const resultUrl = readJobString(job, ["resultUrl"]);
  const phase = normalizeRecognitionAsyncPhase(status);
  const statusSemantics = readJobRecord(job, ["statusSemantics"]);
  const queuePosition = readJobNumber(statusSemantics, ["queuePosition", "position"]);
  const queueDepth = readJobNumber(statusSemantics, ["queueDepth", "pendingCount", "backlog"]);
  const retryAfterSeconds = readJobNumber(statusSemantics, ["retryAfterSeconds", "retryAfter"]);
  const workerId = readJobString(statusSemantics, ["workerId", "worker"]);
  const attempt = readJobNumber(statusSemantics, ["attempt", "attemptCount"]);
  const heartbeatAgeSeconds = readJobNumber(statusSemantics, ["heartbeatAgeSeconds", "heartbeatAge"]);
  const base = {
    jobId,
    status,
    phase,
    ...(resultLoaded ? { resultLoaded } : {}),
    ...(statusUrl ? { statusUrl } : {}),
    ...(resultUrl ? { resultUrl } : {}),
    ...(retryAfterSeconds !== undefined ? { retrySummary: `建议 ${retryAfterSeconds} 秒后重试状态读取。` } : {})
  };

  if (phase === "running") {
    return {
      ...base,
      label: "识别中",
      percent: 65,
      message: "后台 worker 正在执行 OCR、字段抽取、校验和证据生成。",
      ...(workerId
        ? {
            workerSummary: `${workerId} 正在处理${
              attempt !== undefined ? `，第 ${attempt} 次尝试` : ""
            }${heartbeatAgeSeconds !== undefined ? `，心跳 ${heartbeatAgeSeconds} 秒前` : ""}。`
          }
        : {}),
      recoveryAction: "如长时间无心跳，可取消当前轮询并重跑上一次配置。",
      shouldPoll: true,
      canOpenResult: false
    };
  }

  if (phase === "completed") {
    return {
      ...base,
      label: resultLoaded ? "结果已就绪" : "结果可读取",
      percent: 100,
      message: resultLoaded ? "识别结果已读取，可进入任务详情查看字段、证据和 trace。" : "识别已到达 terminal 状态，正在读取结构化结果。",
      recoveryAction: "可打开任务详情继续复核字段、证据和写回状态。",
      shouldPoll: false,
      canOpenResult: true
    };
  }

  if (phase === "failed") {
    const errorMessage = readJobString(job, ["errorMessage"]);

    return {
      ...base,
      label: "识别失败",
      percent: 100,
      message: errorMessage ?? "识别任务执行失败，请查看 Provider 健康状态或稍后重试。",
      recoveryAction: "可检查 Provider 健康状态后重跑上一次识别配置。",
      shouldPoll: false,
      canOpenResult: false,
      ...(errorMessage ? { errorMessage } : {})
    };
  }

  return {
    ...base,
    label: "排队中",
    percent: 25,
    message: "任务已进入后台队列，正在等待识别 worker 接收。",
    ...(queuePosition !== undefined || queueDepth !== undefined
      ? {
          queueSummary:
            queuePosition !== undefined && queueDepth !== undefined
              ? `排队第 ${queuePosition} 位，队列待处理 ${queueDepth} 个任务。`
              : queuePosition !== undefined
                ? `排队第 ${queuePosition} 位。`
                : `队列待处理 ${queueDepth} 个任务。`
        }
      : {}),
    recoveryAction: "可取消当前轮询或稍后重跑上一次配置。",
    shouldPoll: true,
    canOpenResult: false
  };
}

export function getRecognitionAsyncRecoveryHint(progress: RecognitionAsyncProgress): RecognitionAsyncRecoveryHint {
  if (progress.phase === "failed") {
    return {
      tone: "warning",
      primaryAction: "重跑上次配置",
      secondaryAction: "检查 Provider 健康状态"
    };
  }

  if (progress.phase === "completed") {
    return {
      tone: "success",
      primaryAction: "查看任务详情",
      secondaryAction: "重新读取结果"
    };
  }

  return {
    tone: "info",
    primaryAction: "继续轮询",
    secondaryAction: "取消轮询"
  };
}

export async function buildRecognitionFileUploadInput(input: {
  file: RecognitionFileInput;
  adapter: string;
  ocrProvider: string;
  provider: string;
  privacy: PrivacyOptions;
  signal?: AbortSignal | undefined;
}) {
  input.signal?.throwIfAborted();
  const contentBase64 = input.file instanceof Blob ? await blobToBase64(input.file, input.signal) : undefined;
  input.signal?.throwIfAborted();
  const checksumSha256 = input.file instanceof Blob ? await blobSha256Hex(input.file, input.signal).catch(() => "unsupported") : "unknown";
  input.signal?.throwIfAborted();

  return {
    originalName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    byteSize: input.file.size,
    checksumSha256,
    ...(contentBase64 ? { contentBase64 } : {}),
    metadata: {
      adapter: input.adapter,
      ocrProvider: input.ocrProvider,
      provider: input.provider,
      privacy: input.privacy,
      source: "demo-web"
    }
  };
}

export default function NewRecognitionPage() {
  const { api } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [schemaChoices, setSchemaChoices] = useState<SelectOption[]>(fallbackSchemaOptions);
  const [llmProviderChoices, setLlmProviderChoices] = useState<SelectOption[]>(fallbackProviderOptions);
  const [optionLoadState, setOptionLoadState] = useState<OptionLoadState>("idle");
  const [optionLoadError, setOptionLoadError] = useState("");
  const [schemaName, setSchemaName] = useState(fallbackSchemaOptions[0]?.value ?? "lims-clinical-info");
  const [adapter, setAdapter] = useState<(typeof adapterOptions)[number]>(adapterOptions[0]);
  const [provider, setProvider] = useState(fallbackProviderOptions[0]?.value ?? "");
  const [privacy, setPrivacy] = useState<PrivacyOptions>(initialPrivacyOptions);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });
  const submitAbortControllerRef = useRef<AbortController | null>(null);
  const lastSubmitRef = useRef<LastRecognitionSubmit | null>(null);

  useEffect(
    () => () => {
      submitAbortControllerRef.current?.abort();
    },
    []
  );

  const fileSummary = useMemo(() => {
    if (!selectedFile) {
      return "支持 PNG、JPG、PDF，单文件最大 20MB";
    }

    return `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`;
  }, [selectedFile]);

  const uploadZoneClassName = [
    "upload-zone",
    selectedFile ? "is-ready" : "",
    fileError ? "is-danger" : "",
    isDragActive ? "is-dragging" : ""
  ].filter(Boolean).join(" ");

  useEffect(() => {
    let isActive = true;

    async function loadOptions() {
      setOptionLoadState("loading");
      setOptionLoadError("");

      try {
        const [schemaResponse, providerResponse] = await Promise.all([api.listSchemas(), api.listProviders()]);
        const nextSchemas = parseSchemaOptions(schemaResponse);
        const nextLlmProviders = getVisibleRecognitionProviderOptions(providerResponse, "llm").options;

        if (!isActive) {
          return;
        }

        if (nextSchemas.length > 0) {
          setSchemaChoices(nextSchemas);
          setSchemaName((current) => (nextSchemas.some((item) => item.value === current) ? current : nextSchemas[0]?.value ?? current));
        }
        setLlmProviderChoices(nextLlmProviders);
        setProvider((current) =>
          nextLlmProviders.some((item) => item.value === current) ? current : nextLlmProviders[0]?.value ?? ""
        );
        setOptionLoadState("success");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setOptionLoadState("error");
        setLlmProviderChoices([]);
        setProvider("");
        setOptionLoadError(error instanceof Error ? error.message : "识别配置 API 暂不可用，请先配置模型提供商。");
      }
    }

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, [api]);

  function applySelectedFile(file: File | null) {
    // 点击选择和拖拽上传都走同一个入口，保证文件规则、错误文案和页面状态完全一致。
    if (!file) {
      setSelectedFile(null);
      setFileError("");
      setSubmitState({ status: "idle" });
      return true;
    }

    const validation = validateRecognitionFile(file);
    if (!validation.valid) {
      setSelectedFile(null);
      setFileError(validation.message);
      setSubmitState({ status: "idle" });
      return false;
    }

    setSelectedFile(file);
    setFileError("");
    setSubmitState({ status: "idle" });
    return true;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const accepted = applySelectedFile(file);

    if (!accepted) {
      event.currentTarget.value = "";
    }
  }

  function handleUploadDrag(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  }

  function handleUploadDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }

  function handleUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    void applySelectedFile(event.dataTransfer.files?.[0] ?? null);
  }

  function updatePrivacy(key: keyof PrivacyOptions) {
    setPrivacy((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function createRecognitionFromFile(input: LastRecognitionSubmit, signal?: AbortSignal) {
    const fileUploadInput = {
        file: input.file,
        adapter: input.adapter,
        ocrProvider: input.ocrProvider,
        provider: input.provider,
        privacy: input.privacy,
        ...(signal ? { signal } : {})
      };
    const createdFile = await api.createFile(
      await buildRecognitionFileUploadInput(fileUploadInput),
      createApiRequestOptions(signal)
    );
    const fileId = readRecordId(createdFile);

    if (!fileId) {
      throw new Error("后端没有返回文件 ID。");
    }

    const createdJob = await api.createRecognitionJob({
      schemaKey: input.schemaName,
      sourceFileId: fileId,
      document: {
        documentId: fileId,
        fileName: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
      },
      options: {
        adapter: input.adapter,
        privacy: input.privacy,
      },
      providerConfig: {
        ocrProviderKey: input.ocrProvider,
        providerKey: input.provider,
      },
    }, createApiRequestOptions(signal));
    const jobId = readRecordId(createdJob);

    if (!jobId) {
      throw new Error("后端没有返回任务 ID。");
    }

    return createdJob;
  }

  async function waitForRecognitionTerminalJob(initialJob: ApiRecognitionJob, signal?: AbortSignal) {
    let currentJob = initialJob;
    const maxPolls = 30;

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      signal?.throwIfAborted();
      const progress = describeRecognitionAsyncProgress(currentJob);
      setSubmitState({ status: "success", jobId: progress.jobId, progress });

      if (!progress.shouldPoll) {
        return currentJob;
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, Math.min(900 + attempt * 200, 2500));
        signal?.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timeout);
            reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });

      signal?.throwIfAborted();
      currentJob = await api.getJob(progress.jobId, createApiRequestOptions(signal));
    }

    throw new Error("识别任务仍在队列中，请稍后到任务详情页继续查看。");
  }

  async function loadRecognitionResultForTerminalJob(job: ApiRecognitionJob, signal?: AbortSignal) {
    const progress = describeRecognitionAsyncProgress(job);

    if (!progress.canOpenResult) {
      return undefined;
    }

    const result = await api.getResult(progress.jobId, createApiRequestOptions(signal));
    const loadedProgress = describeRecognitionAsyncProgress(job, true);
    setSubmitState({
      status: "success",
      jobId: loadedProgress.jobId,
      progress: loadedProgress,
      result
    });

    return result;
  }

  async function submitRecognition(input: LastRecognitionSubmit) {
    const controller = new AbortController();
    submitAbortControllerRef.current?.abort();
    submitAbortControllerRef.current = controller;
    lastSubmitRef.current = input;
    setFileError("");
    setSubmitState({ status: "loading" });

    try {
      const createdJob = await createRecognitionFromFile(input, controller.signal);
      const createdProgress = describeRecognitionAsyncProgress(createdJob);
      setSubmitState({
        status: "success",
        jobId: createdProgress.jobId,
        progress: createdProgress
      });

      const terminalJob = createdProgress.shouldPoll
        ? await waitForRecognitionTerminalJob(createdJob, controller.signal)
        : createdJob;
      const terminalProgress = describeRecognitionAsyncProgress(terminalJob);
      setSubmitState({
        status: "success",
        jobId: terminalProgress.jobId,
        progress: terminalProgress
      });

      await loadRecognitionResultForTerminalJob(terminalJob, controller.signal);
    } catch (error) {
      if (isAbortError(error)) {
        setSubmitState({
          status: "cancelled",
          message: "识别任务创建已取消，可重跑上一次配置。"
        });
        return;
      }

      const message = error instanceof Error ? error.message : "创建识别任务失败，请稍后重试。";
      setSubmitState({ status: "error", message });
    } finally {
      if (submitAbortControllerRef.current === controller) {
        submitAbortControllerRef.current = null;
      }
    }
  }

  async function submitWithFile(file: File | null) {
    const providerGate = getRecognitionProviderGate(llmProviderChoices);
    if (!providerGate.canCreate) {
      setSubmitState({ status: "error", message: providerGate.message });
      return;
    }

    if (!file) {
      const message = fileError || "请先上传图片或 PDF 文件。";
      setFileError(message);
      setSubmitState({ status: "error", message });
      return;
    }

    const validation = validateRecognitionFile(file);
    if (!validation.valid) {
      setFileError(validation.message);
      setSubmitState({ status: "error", message: validation.message });
      return;
    }

    await submitRecognition({
      file,
      schemaName,
      adapter,
      ocrProvider: LOCAL_PADDLE_OCR_PROVIDER_KEY,
      provider,
      privacy
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitWithFile(selectedFile);
  }

  function handleSyntheticSubmit() {
    void submitWithFile(createSyntheticRecognitionFile());
  }

  function handleCancelSubmit() {
    submitAbortControllerRef.current?.abort();
  }

  function handleRerunSubmit() {
    if (lastSubmitRef.current) {
      void submitRecognition(lastSubmitRef.current);
    }
  }

  const isLoading = submitState.status === "loading" || (submitState.status === "success" && submitState.progress.shouldPoll);
  const providerGate = getRecognitionProviderGate(llmProviderChoices);
  const canSubmitRecognition = providerGate.canCreate && !isLoading;
  const capabilitySummary = getRecognitionCapabilitySummary(llmProviderChoices);

  return (
    <main className="app-page">
      <PageHeader
        eyebrow="Recognition Demo"
        title="新建识别任务"
        description="上传病历图片或 PDF，选择识别模板后创建任务；OCR 使用本地 PaddleOCR，文件使用内置本地保存策略。"
        meta={
          <div className="page-header__meta" aria-label="新建识别配置摘要">
            <span className="page-header__meta-item">
              <strong>上传限制</strong>
              <span>PNG / JPG / PDF，最大 20MB</span>
            </span>
            <span className="page-header__meta-item">
              <strong>隐私默认</strong>
              <span>脱敏与证据链保留已启用</span>
            </span>
            <span className="page-header__meta-item">
              <strong>模型</strong>
              <span>{llmProviderChoices[0]?.label ?? "待配置"}</span>
            </span>
          </div>
        }
      />

      <form className="recognition-form" onSubmit={handleSubmit} data-guide="new-recognition">
        <Card className="panel recognition-capability-card">
          <SectionTitle title="识别能力" />
          <div className="recognition-capability-list">
            {capabilitySummary.map((item) => (
              <article key={item.key} className={`recognition-capability-item is-${item.status}`}>
                <StatusPill label={item.status === "ready" ? "已就绪" : item.status === "checking" ? "检查中" : "待配置"} tone={item.status === "ready" ? "completed" : item.status === "checking" ? "running" : "failed"} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
          {!providerGate.canCreate ? (
            <Alert type="warning" showIcon content={providerGate.message} />
          ) : null}
        </Card>

        <Card className="panel recognition-upload-card">
          <SectionTitle title="上传病历文件" />
          <label
            className={uploadZoneClassName}
            onDragEnter={handleUploadDrag}
            onDragLeave={handleUploadDragLeave}
            onDragOver={handleUploadDrag}
            onDrop={handleUploadDrop}
          >
            <AppIcon icon={actionIcons.createRecognition} size="lg" tone={fileError ? "red" : selectedFile ? "green" : "blue"} tile />
            <strong>{isDragActive ? "释放文件开始校验" : selectedFile ? "文件已选择" : "上传图片或 PDF"}</strong>
            <span>{fileSummary}</span>
            <input
              ref={fileInputRef}
              aria-label="上传识别文件"
              accept="image/png,image/jpeg,application/pdf"
              type="file"
              onChange={handleFileChange}
            />
          </label>
          {fileError ? (
            <Alert type="error" showIcon content={fileError} />
          ) : null}
        </Card>

        <Card className="panel recognition-config-card">
          <SectionTitle title="识别配置" />
          <Alert
            type={optionLoadState === "error" ? "warning" : optionLoadState === "loading" ? "info" : "success"}
            showIcon
            content={
              optionLoadState === "loading"
                ? "正在读取真实 Schema 和 Provider API。"
                : optionLoadState === "error"
                  ? `真实配置读取失败：${optionLoadError}`
                  : providerGate.canCreate
                    ? "本地 PaddleOCR、内置文件保存和模型提供商均已就绪。"
                    : "请先配置模型提供商；本地 PaddleOCR 和内置文件保存已作为项目内置能力。"
            }
          />

          <div className="form-grid recognition-form-grid">
            <Form.Item label="Schema 模板" data-guide="schema-selection">
              <Select
                aria-label="选择 Schema 模板"
                value={schemaName}
                onChange={setSchemaName}
              >
                {schemaChoices.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="文档类型">
              <Select
                aria-label="选择 Adapter"
                value={adapter}
                onChange={(value) => setAdapter(value as typeof adapter)}
              >
                {adapterOptions.map((option) => (
                  <Select.Option key={option} value={option}>
                    {option}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="模型提供商">
              <Select
                aria-label="选择模型提供商"
                value={provider}
                onChange={setProvider}
                placeholder="请先配置真实 LLM Provider"
              >
                {llmProviderChoices.map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
        </Card>

        <Card className="panel recognition-privacy-card" aria-labelledby="privacy-title">
          <h2 id="privacy-title">
            <AppIcon icon={actionIcons.privacyPolicy} size="md" />
            隐私选项
          </h2>
          <div className="privacy-option-list">
            {(Object.keys(visiblePrivacyOptionContent) as Array<keyof typeof visiblePrivacyOptionContent>).map((key) => {
              const option = visiblePrivacyOptionContent[key];
              const checked = privacy[key];

              return (
                <div className={`privacy-option ${checked ? "is-checked" : ""}`} key={key} onClick={() => updatePrivacy(key)}>
                  <span className="privacy-option__checkbox" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onChange={() => updatePrivacy(key)}
                      aria-label={option.title}
                    />
                  </span>
                  <AppIcon icon={option.icon} size="md" tone={checked ? "blue" : "gray"} tile className="privacy-option__icon" />
                  <div className="privacy-option__body">
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </div>
                  <span className={`privacy-option__state ${checked ? "is-enabled" : ""}`}>
                    {checked ? "已启用" : "未启用"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="panel recognition-actions-card">
          <Space className="toolbar" wrap>
            <Button
              type="primary"
              htmlType="submit"
              aria-label="开始识别"
              disabled={!canSubmitRecognition}
              loading={isLoading}
              icon={<AppIcon icon={isLoading ? commonUiIcons.loading : actionIcons.createRecognition} size="sm" className={isLoading ? "is-spinning" : undefined} />}
            >
              {isLoading ? "创建中" : "开始识别"}
            </Button>
            <Button type="outline" aria-label="取消识别任务创建" disabled={!isLoading} onClick={handleCancelSubmit}>
              取消
            </Button>
            <Button type="outline" aria-label="重跑上一次识别任务创建" disabled={!canRerunRecognitionSubmit(lastSubmitRef.current, submitState)} onClick={handleRerunSubmit}>
              重跑
            </Button>
            <Button
              type="outline"
              aria-label="清空当前识别表单"
              onClick={() => {
                setSelectedFile(null);
                setFileError("");
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
                setPrivacy(initialPrivacyOptions);
                setSubmitState({ status: "idle" });
              }}
              icon={<AppIcon icon={commonUiIcons.close} size="sm" />}
            >
              清空
            </Button>
          </Space>
        </Card>
      </form>

      {submitState.status === "success" ? (
        <Card className="panel async-recognition-panel" aria-live="polite">
          <SectionTitle title="识别进度" />
          <div className="async-recognition-status">
            <StatusPill label={submitState.progress.label} tone={submitState.progress.phase === "failed" ? "failed" : submitState.progress.phase} />
            <span className="mono">{submitState.progress.status}</span>
          </div>
          <Progress percent={submitState.progress.percent} />
          <p>{submitState.progress.message}</p>
          {submitState.progress.queueSummary ? <p>{submitState.progress.queueSummary}</p> : null}
          {submitState.progress.workerSummary ? <p>{submitState.progress.workerSummary}</p> : null}
          {submitState.progress.retrySummary ? <p>{submitState.progress.retrySummary}</p> : null}
          {submitState.progress.recoveryAction ? (
            <Alert
              type={getRecognitionAsyncRecoveryHint(submitState.progress).tone === "warning" ? "warning" : "info"}
              showIcon
              content={submitState.progress.recoveryAction}
            />
          ) : null}
          <dl className="async-recognition-links">
            <div>
              <dt>Status URL</dt>
              <dd>{submitState.progress.statusUrl ?? `/jobs/${submitState.jobId}`}</dd>
            </div>
            <div>
              <dt>Result URL</dt>
              <dd>{submitState.progress.resultUrl ?? `/results/${submitState.jobId}`}</dd>
            </div>
          </dl>
          {submitState.progress.phase === "failed" ? (
            <Alert type="error" showIcon content={submitState.progress.errorMessage ?? submitState.progress.message} />
          ) : null}
          {submitState.result ? (
            <Alert type="success" showIcon content="识别结果已读取，任务详情页会展示字段、证据和 LangGraph trace。" />
          ) : null}
          <Space className="toolbar" wrap>
            <Link className="secondary-button" to={`/recognition/jobs/${encodeURIComponent(submitState.jobId)}`}>
              查看任务详情
            </Link>
            {submitState.progress.canOpenResult ? (
              <Button
                type="outline"
                aria-label="重新读取识别结果"
                onClick={() => {
                  void api.getJob(submitState.jobId)
                    .then((job) => loadRecognitionResultForTerminalJob(job))
                    .catch((error: unknown) => {
                      setSubmitState({
                        status: "error",
                        message: error instanceof Error ? error.message : "读取识别结果失败，请稍后重试。"
                      });
                    });
                }}
              >
                读取结果
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {submitState.status === "error" ? (
        <EmptyPanel icon={statusIcons.danger} title="创建失败" description={submitState.message} />
      ) : null}

      {submitState.status === "cancelled" ? (
        <EmptyPanel icon={statusIcons.warning} title="创建已取消" description={submitState.message} />
      ) : null}
    </main>
  );
}
