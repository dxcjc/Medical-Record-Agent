import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Tag, Tooltip } from "@arco-design/web-react";
import type { ApiProviderHealthResponse, ApiProviderItem } from "../../api/client";
import { normalizeProviderItems } from "../../api/normalizers";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons, providerIcons } from "../../icons/appIcons";
import { InlineNotice, MetricCard, SecretField, SectionHeader, StatusPill } from "./components";

type ProviderKind = "HTTP OCR" | "LangChain" | "OpenAI-compatible" | "OpenAI Responses" | "LIMS REST" | "Object Storage";

type ProviderArea = "OCR" | "LLM" | "storage";

type ProviderConfig = {
  area: ProviderArea;
  kind: ProviderKind;
  endpoint: string;
  modelOrBucket: string;
  secret: string;
  timeoutMs: number;
  enabled: boolean;
};

type HealthResult = {
  status: "healthy" | "degraded" | "unchecked" | "error";
  latencyMs?: number;
  checkedAt?: string;
  message: string;
};

type ProviderApiStatus =
  | { status: "loading"; message: string; count: number }
  | { status: "success"; message: string; count: number }
  | { status: "error"; message: string; count: number };

type LocalProviderActionState = {
  message: string;
  tone: "info" | "warning";
};

type ProviderAsyncAction =
  | { kind: "idle" }
  | { kind: "saving"; pendingCount: number }
  | { kind: "checking"; area: ProviderArea; providerKey: string }
  | { kind: "succeeded"; area?: ProviderArea | undefined; message: string }
  | { kind: "cancelled"; area?: ProviderArea | undefined }
  | { kind: "failed"; area?: ProviderArea | undefined; errorMessage: string };

type ProviderAsyncDescriptor = {
  tone: "info" | "success" | "warning";
  title: string;
  message: string;
  canCancel: boolean;
  canRetry: boolean;
};

export const providerKinds: ProviderKind[] = ["HTTP OCR", "LangChain", "OpenAI-compatible", "OpenAI Responses", "LIMS REST", "Object Storage"];
const providerKeyByArea: Record<ProviderArea, string> = {
  OCR: "http-ocr",
  LLM: "openai-compatible-model",
  storage: "local-storage"
};
const providerKindByArea: Record<ProviderArea, "ocr" | "llm" | "storage"> = {
  OCR: "ocr",
  LLM: "llm",
  storage: "storage"
};

const providerAreaIcons: Record<ProviderArea, (typeof providerIcons)[keyof typeof providerIcons]> = {
  OCR: providerIcons.azureOcr,
  LLM: providerIcons.openaiVision,
  storage: dashboardMetricIcons.dataset
};

const providerKindsByArea: Record<ProviderArea, ProviderKind[]> = {
  OCR: ["HTTP OCR", "OpenAI-compatible"],
  LLM: ["LangChain", "OpenAI-compatible", "OpenAI Responses"],
  storage: []
};

const providerAreaLabels: Record<ProviderArea, string> = {
  OCR: "文字识别 (OCR)",
  LLM: "大语言模型 (LLM)",
  storage: "本地文件存储"
};

const providerAreaDescriptions: Record<ProviderArea, string> = {
  OCR: "医学文档扫描与文字提取",
  LLM: "临床信息提取与推理",
  storage: "文件与影像归档"
};

const STORAGE_PATH = "/data/medical-records";

const initialConfigs: ProviderConfig[] = [
  {
    area: "OCR",
    kind: "HTTP OCR",
    endpoint: "http://localhost:9001",
    modelOrBucket: "",
    secret: "",
    timeoutMs: 30000,
    enabled: true
  },
  {
    area: "LLM",
    kind: "OpenAI-compatible",
    endpoint: "http://110.42.215.22/v1",
    modelOrBucket: "gpt-5.5",
    secret: "sk-433682dc026db1b850cb6f9aadd8708d0474d42e00938a1e7be03c3077982238",
    timeoutMs: 45000,
    enabled: true
  },
  {
    area: "storage",
    kind: "HTTP OCR",
    endpoint: "",
    modelOrBucket: "",
    secret: "",
    timeoutMs: 15000,
    enabled: true
  }
];

const initialHealth: Record<ProviderArea, HealthResult> = {
  OCR: { status: "unchecked", message: "PaddleOCR 服务已配置 (localhost:9001)，点击健康检查验证连通性" },
  LLM: { status: "unchecked", message: "GPT-5.5 已配置 (110.42.215.22)，点击健康检查验证连通性" },
  storage: { status: "healthy", latencyMs: 5, checkedAt: "09:39:55", message: `本地存储路径 ${STORAGE_PATH} 可用` }
};
const providerConfigStorageKey = "medical-record-agent.provider-configs";

function getHealthTone(status: HealthResult["status"]) {
  if (status === "healthy") return "success";
  if (status === "degraded") return "warning";
  if (status === "error") return "danger";
  return "neutral";
}

function getHealthDotClass(status: HealthResult["status"]) {
  if (status === "healthy") return "health-dot--success";
  if (status === "degraded") return "health-dot--warning";
  if (status === "error") return "health-dot--danger";
  return "health-dot--unchecked";
}

function getHealthLabel(status: HealthResult["status"]) {
  if (status === "healthy") return "健康";
  if (status === "degraded") return "降级";
  if (status === "error") return "异常";
  return "未检查";
}

export function describeProviderAsyncAction(action: ProviderAsyncAction): ProviderAsyncDescriptor {
  if (action.kind === "idle") {
    return {
      tone: "info",
      title: "操作待执行",
      message: "等待保存、健康检查或刷新操作。",
      canCancel: false,
      canRetry: false
    };
  }

  if (action.kind === "saving") {
    return {
      tone: "info",
      title: "Provider 配置保存中",
      message: `正在同步 ${action.pendingCount} 个 Provider 配置，可取消当前请求后重试。`,
      canCancel: true,
      canRetry: false
    };
  }

  if (action.kind === "checking") {
    return {
      tone: "info",
      title: "Provider Health Check 进行中",
      message: `${action.area} 正在调用真实 Provider Health API：${action.providerKey}。`,
      canCancel: true,
      canRetry: false
    };
  }

  if (action.kind === "succeeded") {
    return {
      tone: "success",
      title: "操作完成",
      message: action.message,
      canCancel: false,
      canRetry: true
    };
  }

  if (action.kind === "cancelled") {
    return {
      tone: "warning",
      title: "操作已取消",
      message: `${action.area ?? "Provider"} 操作已取消，页面保留上一次可见状态，可重试。`,
      canCancel: false,
      canRetry: true
    };
  }

  if (action.kind === "failed") {
    const areaLabel = action.area === "storage" ? "LIMS" : action.area ?? "Provider";
    return {
      tone: "warning",
      title: "Provider 操作失败",
      message: `${areaLabel} 操作失败：${action.errorMessage}。请刷新 Provider API 或重试上一次操作。`,
      canCancel: false,
      canRetry: true
    };
  }

  return {
    tone: "info",
    title: "操作待执行",
    message: "等待保存、健康检查或刷新操作。",
    canCancel: false,
    canRetry: false
  };
}

export function matchesProviderArea(provider: ApiProviderItem, area: ProviderArea) {
  const statusParts = typeof provider.status === "string" ? provider.status.split("_") : [];
  const isHiddenInternalStatus = statusParts.length === 2 && statusParts[0] === "development" && statusParts[1] === "placeholder";
  if (provider.isMock === true || provider.enabled === false || isHiddenInternalStatus) {
    return false;
  }

  const kind = provider.kind?.toLowerCase();
  const key = provider.key.toLowerCase();

  if (area === "OCR") {
    return kind === "ocr" || key.includes("ocr");
  }
  if (area === "LLM") {
    return kind === "llm" || key.includes("model") || key.includes("llm") || key.includes("openai");
  }
  if (area === "storage") {
    return kind === "storage" || key.includes("storage");
  }

  return false;
}

function isProviderArea(value: unknown): value is ProviderArea {
  return value === "OCR" || value === "LLM" || value === "storage";
}

function isProviderKind(value: unknown): value is ProviderKind {
  return providerKinds.includes(value as ProviderKind);
}

export function sanitizeStoredProviderConfigs(value: unknown): ProviderConfig[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const configs = value.flatMap((item): ProviderConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (!isProviderArea(record.area) || !isProviderKind(record.kind)) {
      return [];
    }

    return [
      {
        area: record.area,
        kind: record.kind,
        endpoint: typeof record.endpoint === "string" ? record.endpoint : "",
        modelOrBucket: typeof record.modelOrBucket === "string" ? record.modelOrBucket : "",
        secret: typeof record.secret === "string" ? record.secret : "",
        timeoutMs: typeof record.timeoutMs === "number" && Number.isFinite(record.timeoutMs) ? record.timeoutMs : 30000,
        enabled: record.enabled === true
      }
    ];
  });

  return configs.length > 0 ? configs : null;
}

function readStoredProviderConfigs() {
  try {
    const raw = window.localStorage.getItem(providerConfigStorageKey);
    return raw ? sanitizeStoredProviderConfigs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeStoredProviderConfigs(configs: ProviderConfig[]) {
  try {
    window.localStorage.setItem(providerConfigStorageKey, JSON.stringify(configs));
  } catch {
    // localStorage 失败不阻塞真实 Provider API 保存。
  }
}

export function buildProviderKeyForArea(area: ProviderArea) {
  return providerKeyByArea[area];
}

function buildProviderSecretRefs(config: ProviderConfig) {
  const secret = config.secret.trim();
  if (!secret) {
    return {};
  }

  return { apiKey: secret };
}

function mapProviderModeForSave(config: ProviderConfig) {
  if (config.area === "OCR") {
    return config.kind === "OpenAI-compatible" ? "openai-compatible" : "http";
  }
  if (config.area === "LLM") {
    if (config.kind === "OpenAI Responses") {
      return "openai-responses";
    }
    if (config.kind === "OpenAI-compatible") {
      return "openai-compatible";
    }

    return "langchain";
  }

  return "local";
}

export function buildProviderConfigSaveRequest(config: ProviderConfig) {
  const secretRefs = buildProviderSecretRefs(config);

  return {
    kind: providerKindByArea[config.area],
    displayName: `${config.area} ${config.kind} Provider`,
    enabled: config.enabled,
    isDefault: config.enabled,
    config: {
      providerKind: mapProviderModeForSave(config),
      displayProviderKind: config.kind,
      endpoint: config.area === "storage" ? STORAGE_PATH : config.endpoint,
      modelOrBucket: config.modelOrBucket,
      timeoutMs: config.timeoutMs
    },
    secretRefs
  };
}


/* ────────────────────────────────────────────
   Provider Area Card
   ──────────────────────────────────────────── */

type ProviderAreaCardProps = {
  config: ProviderConfig;
  health: HealthResult;
  checking: boolean;
  visibleSecret: boolean;
  onUpdate: (area: ProviderArea, patch: Partial<ProviderConfig>) => void;
  onToggleSecret: () => void;
  onHealthCheck: () => void;
  onSave: () => void;
  saving: boolean;
  scrollToId: string;
};

function ProviderAreaCard({ config, health, checking, visibleSecret, onUpdate, onToggleSecret, onHealthCheck, onSave, saving, scrollToId }: ProviderAreaCardProps) {
  const unconfigured = isUnconfigured(config);
  const isStorage = config.area === "storage";
  const [expanded, setExpanded] = useState(!unconfigured || isStorage);

  useEffect(() => {
    if (!unconfigured || isStorage) setExpanded(true);
  }, [unconfigured, isStorage]);

  const handleSetupClick = useCallback(() => {
    setExpanded(true);
    setTimeout(() => {
      const el = document.getElementById(scrollToId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [scrollToId]);

  return (
    <Card
      className={`provider-card ${!config.enabled ? "provider-card--disabled" : ""}`}
      id={scrollToId}
    >
      {/* Card Header */}
      <div className="provider-card__header">
        <div className="provider-card__title-row">
          <span className={`provider-card__icon provider-card__icon--${config.area.toLowerCase()}`}>
            <AppIcon icon={providerAreaIcons[config.area]} size="lg" />
          </span>
          <div className="provider-card__title">
            <h3>{providerAreaLabels[config.area]}</h3>
            <p className="provider-card__subtitle">{providerAreaDescriptions[config.area]}</p>
          </div>
        </div>
        <div className="provider-card__status-row">
          <span className={`health-dot ${getHealthDotClass(health.status)}`} />
          <StatusPill tone={getHealthTone(health.status)}>
            {getHealthLabel(health.status)}
          </StatusPill>
          {health.latencyMs ? (
            <Tag color="gray" className="provider-card__latency">{health.latencyMs}ms</Tag>
          ) : null}
          <Switch
            checked={config.enabled}
            onChange={(checked) => onUpdate(config.area, { enabled: checked })}
          />
        </div>
      </div>

      {/* Health message bar */}
      <div className={`provider-card__health-bar provider-card__health-bar--${getHealthTone(health.status)}`}>
        <span>{health.message}</span>
        {health.checkedAt ? <small>检查于 {health.checkedAt}</small> : null}
      </div>

      {/* Unconfigured placeholder (OCR only) */}
      {unconfigured && !isStorage && !expanded ? (
        <div className="provider-card__empty">
          <div className="provider-card__empty-icon">
            <AppIcon icon={providerAreaIcons[config.area]} size="lg" />
          </div>
          <p className="provider-card__empty-text">请配置 {providerAreaLabels[config.area]} 服务</p>
          <Button
            type="primary"
            onClick={handleSetupClick}
            icon={<AppIcon icon={actionIcons.refresh} size="sm" />}
          >
            点击配置 {providerAreaLabels[config.area]}
          </Button>
        </div>
      ) : null}

      {/* Storage info panel */}
      {isStorage ? (
        <div className="provider-card__body">
          <div className="provider-card__form-grid">
            <Form.Item label="存储路径">
              <Input
                value={STORAGE_PATH}
                disabled
                readOnly
              />
            </Form.Item>
            <Form.Item label="磁盘空间">
              <Input
                value="可用：运行时检测"
                disabled
                readOnly
              />
            </Form.Item>
          </div>
          <div className="provider-card__actions">
            <Button
              type="primary"
              onClick={onHealthCheck}
              loading={checking}
              icon={<AppIcon icon={actionIcons.refresh} size="sm" />}
            >
              检测存储状态
            </Button>
          </div>
        </div>
      ) : null}

      {/* Configuration form (non-storage) */}
      {expanded && !isStorage ? (
        <div className="provider-card__body">
          <div className="provider-card__form-grid">
            <Form.Item label="类型">
              <Select
                value={config.kind}
                onChange={(value) => onUpdate(config.area, { kind: String(value) as ProviderKind })}
              >
                {providerKindsByArea[config.area].map((kind) => (
                  <Select.Option key={kind} value={kind}>
                    {kind}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="服务地址">
              <Input
                value={config.endpoint}
                placeholder="https://api.example.com/v1"
                onChange={(value) => onUpdate(config.area, { endpoint: value })}
              />
            </Form.Item>
            <Form.Item label={config.area === "LLM" ? "模型名称" : "配置名称"}>
              <Input
                value={config.modelOrBucket}
                placeholder={config.area === "LLM" ? "gpt-4.1" : "profile-name"}
                onChange={(value) => onUpdate(config.area, { modelOrBucket: value })}
              />
            </Form.Item>
            <Form.Item label="超时时间（毫秒）">
              <InputNumber
                min={1000}
                step={1000}
                value={config.timeoutMs}
                onChange={(value) => {
                  if (typeof value === "number" && Number.isFinite(value)) {
                    onUpdate(config.area, { timeoutMs: value });
                  }
                }}
              />
            </Form.Item>
            <Form.Item label="API 密钥">
              <SecretField
                label="API 密钥"
                value={config.secret}
                onChange={(value) => onUpdate(config.area, { secret: value })}
                visible={visibleSecret}
                onToggle={onToggleSecret}
              />
            </Form.Item>
          </div>
          <div className="provider-card__actions">
            <Button
              type="primary"
              onClick={onSave}
              loading={saving}
              icon={<AppIcon icon={actionIcons.refresh} size="sm" />}
            >
              保存配置
            </Button>
            <Button
              type="outline"
              onClick={onHealthCheck}
              loading={checking}
              icon={<AppIcon icon={actionIcons.refresh} size="sm" />}
            >
              测试连接
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function isUnconfigured(config: ProviderConfig) {
  return !config.endpoint && !config.secret && !config.modelOrBucket;
}


/* ────────────────────────────────────────────
   Provider Summary Card (top overview)
   ──────────────────────────────────────────── */

type ProviderSummaryCardProps = {
  area: ProviderArea;
  config: ProviderConfig;
  health: HealthResult;
  onClick: () => void;
};

function ProviderSummaryCard({ area, config, health, onClick }: ProviderSummaryCardProps) {
  return (
    <button
      type="button"
      className={`provider-summary-card provider-summary-card--${area.toLowerCase()}`}
      onClick={onClick}
    >
      <div className="provider-summary-card__icon">
        <AppIcon icon={providerAreaIcons[area]} size="md" />
      </div>
      <div className="provider-summary-card__info">
        <span className="provider-summary-card__label">{providerAreaLabels[area]}</span>
        <span className={`health-dot ${getHealthDotClass(health.status)}`} />
      </div>
      <Tag
        color={config.enabled ? "blue" : "gray"}
        size="small"
        className="provider-summary-card__tag"
      >
        {config.enabled ? "已启用" : "未启用"}
      </Tag>
    </button>
  );
}


/* ────────────────────────────────────────────
   Main ProviderSettingsPage
   ──────────────────────────────────────────── */

export function ProviderSettingsPage() {
  const { auth } = useAuth();
  const [configs, setConfigs] = useState<ProviderConfig[]>(() => (readStoredProviderConfigs() ?? initialConfigs).filter((c) => c.area !== "storage"));
  const [health, setHealth] = useState<Record<ProviderArea, HealthResult>>(initialHealth);
  const [asyncAction, setAsyncAction] = useState<ProviderAsyncAction>({ kind: "idle" });
  const [checkingArea, setCheckingArea] = useState<ProviderArea | null>(null);
  const [savingArea, setSavingArea] = useState<ProviderArea | null>(null);
  const [visibleSecretArea, setVisibleSecretArea] = useState<ProviderArea | null>(null);
  const [apiProviders, setApiProviders] = useState<ApiProviderItem[]>([]);
  const [apiStatus, setApiStatus] = useState<ProviderApiStatus>({ status: "loading", message: "正在加载 Provider 列表", count: 0 });
  const [settingDefaultKey, setSettingDefaultKey] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string>("—");

  const providerRefs = useRef<Record<ProviderArea, HTMLDivElement | null>>({
    OCR: null,
    LLM: null,
    storage: null
  });

  useEffect(() => {
    writeStoredProviderConfigs(configs);
  }, [configs]);

  const updateConfig = useCallback((area: ProviderArea, patch: Partial<ProviderConfig>) => {
    setConfigs((prev) => prev.map((c) => (c.area === area ? { ...c, ...patch } : c)));
  }, []);

  const healthyCount = useMemo(() => Object.values(health).filter((h) => h.status === "healthy").length, [health]);
  const enabledCount = useMemo(() => configs.filter((c) => c.enabled).length, [configs]);

  const asyncActionDescriptor = useMemo(() => describeProviderAsyncAction(asyncAction), [asyncAction]);

  async function loadProviders() {
    setApiStatus({ status: "loading", message: "正在加载 Provider 列表", count: 0 });
    try {
      const resp = await fetch("/api/providers", {
        headers: { Authorization: `Bearer ${auth?.token ?? ""}` }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = normalizeProviderItems(data);
      setApiProviders(items);
      setApiStatus({ status: "success", message: `已加载 ${items.length} 个 Provider`, count: items.length });
    } catch (err) {
      setApiStatus({ status: "error", message: `加载失败：${String(err)}`, count: 0 });
    }
  }

  useEffect(() => {
    void loadProviders();
  }, []);

  async function setDefaultProvider(key: string) {
    setSettingDefaultKey(key);
    try {
      const resp = await fetch(`/api/providers/${key}/default`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth?.token ?? ""}` }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await loadProviders();
    } catch (err) {
      setAsyncAction({ kind: "failed", errorMessage: `设置默认失败：${String(err)}` });
    } finally {
      setSettingDefaultKey(null);
    }
  }

  async function runHealthCheck(area: ProviderArea) {
    const config = configs.find((c) => c.area === area);
    if (!config) return;

    const providerKey = providerKeyByArea[area];
    setCheckingArea(area);
    setAsyncAction({ kind: "checking", area, providerKey });

    try {
      const resp = await fetch(`/api/providers/${providerKey}/health`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth?.token ?? ""}` }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: ApiProviderHealthResponse = await resp.json();

      setHealth((prev) => ({
        ...prev,
        [area]: {
          status: data.health.status ?? "unchecked",
          latencyMs: data.health.latencyMs,
          checkedAt: new Date().toLocaleTimeString("zh-CN"),
          message: data.health.message ?? "健康检查完成"
        }
      }));

      setAsyncAction({ kind: "succeeded", area, message: `${providerAreaLabels[area]} 健康检查完成。` });
    } catch (err) {
      setHealth((prev) => ({
        ...prev,
        [area]: { status: "error", message: `健康检查失败：${String(err)}` }
      }));
      setAsyncAction({ kind: "failed", area, errorMessage: String(err) });
    } finally {
      setCheckingArea(null);
    }
  }

  async function saveSingleConfig(area: ProviderArea) {
    const config = configs.find((c) => c.area === area);
    if (!config) return;

    const providerKey = providerKeyByArea[area];
    const body = buildProviderConfigSaveRequest(config);

    setSavingArea(area);
    setAsyncAction({ kind: "saving", pendingCount: 1 });

    try {
      const resp = await fetch(`/api/providers/${providerKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth?.token ?? ""}`
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setSavedAt(new Date().toLocaleTimeString("zh-CN"));
      setAsyncAction({ kind: "succeeded", area, message: `${providerAreaLabels[area]} 配置已保存。` });
    } catch (err) {
      setAsyncAction({ kind: "failed", area, errorMessage: String(err) });
    } finally {
      setSavingArea(null);
    }
  }

  function cancelProviderAction() {
    setAsyncAction((prev) => {
      if (prev.kind === "idle") return prev;
      return { kind: "cancelled", area: prev.kind === "checking" ? prev.area : undefined };
    });
    setCheckingArea(null);
    setSavingArea(null);
  }

  function retryProviderAction() {
    setAsyncAction({ kind: "idle" });
  }

  function scrollToProvider(area: ProviderArea) {
    const el = document.getElementById(`provider-card-${area}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main className="app-page provider-settings-page">
      <SectionHeader
        title="Provider 设置"
        description="集中维护 OCR、LLM 与本地存储 Provider，支持配置、健康检查与启用管理。"
      />

      <div className="page-header__meta" aria-label="Provider 摘要">
        <span className="page-header__meta-item">
          <strong>{enabledCount}</strong> 已启用
        </span>
        <span className="page-header__meta-item">
          <strong>{healthyCount}</strong> 健康
        </span>
        <span className="page-header__meta-item">
          <strong>{apiStatus.count}</strong> API Provider
        </span>
      </div>

      {/* ── Async action banner ── */}
      <InlineNotice
        tone={asyncActionDescriptor.tone === "warning" ? "warning" : asyncActionDescriptor.tone === "success" ? "success" : "info"}
        title={asyncActionDescriptor.title}
      >
        {asyncAction.kind !== "idle" ? (
          <Space style={{ marginTop: 8 }}>
            <Button type="outline" size="small" disabled={!asyncActionDescriptor.canCancel} onClick={cancelProviderAction}>
              取消当前操作
            </Button>
            <Button type="outline" size="small" disabled={!asyncActionDescriptor.canRetry || checkingArea !== null} onClick={retryProviderAction}>
              重试上次操作
            </Button>
          </Space>
        ) : null}
      </InlineNotice>

      {/* ── Top status overview ── */}
      <section className="provider-overview" aria-label="Provider 状态总览">
        {configs.map((config) => (
          <ProviderSummaryCard
            key={config.area}
            area={config.area}
            config={config}
            health={health[config.area]}
            onClick={() => scrollToProvider(config.area)}
          />
        ))}
      </section>

      {/* ── Quick stats ── */}
      <section className="provider-stats-row" aria-label="Provider 统计">
        <div className="provider-stat">
          <span className="provider-stat__label">健康实例</span>
          <span className="provider-stat__value">{healthyCount}/3</span>
        </div>
        <div className="provider-stat">
          <span className="provider-stat__label">已启用</span>
          <span className="provider-stat__value">{enabledCount}/3</span>
        </div>
        <div className="provider-stat">
          <span className="provider-stat__label">API Provider</span>
          <span className="provider-stat__value">{apiStatus.count}</span>
        </div>
        <div className="provider-stat">
          <span className="provider-stat__label">上次保存</span>
          <span className="provider-stat__value">{savedAt}</span>
        </div>
      </section>

      <section className="operations-status-strip" aria-label="Provider 操作状态">
        {configs.map((config) => (
          <div key={config.area} className="operations-status-strip__item">
            <span className="operations-status-strip__label">{providerAreaLabels[config.area]}</span>
            <Tag color={config.enabled ? "green" : "gray"}>{config.enabled ? "已启用" : "未启用"}</Tag>
          </div>
        ))}
      </section>

      {/* ── Status banner (only show when relevant) ── */}
      {asyncAction.kind !== "idle" ? (
        <InlineNotice
          tone={asyncActionDescriptor.tone === "warning" ? "warning" : asyncActionDescriptor.tone === "success" ? "success" : "info"}
          title={asyncActionDescriptor.title}
        >
          {asyncActionDescriptor.message}
        </InlineNotice>
      ) : null}

      {/* ── API Provider list (compact) ── */}
      {apiProviders.length > 0 ? (
        <Card className="panel provider-api-list-card">
          <div className="panel-header">
            <h2>
              <AppIcon icon={dashboardMetricIcons.provider} size="md" />
              后端 Provider 列表
            </h2>
            <Button
              type="outline"
              size="small"
              onClick={() => void loadProviders()}
              loading={apiStatus.status === "loading"}
              icon={<AppIcon icon={actionIcons.refresh} size="sm" />}
            >
              刷新
            </Button>
          </div>
          <div className="provider-api-list">
            {apiProviders.filter((p) => p.kind !== "storage" && p.kind !== "lims").map((provider) => (
              <article className="provider-api-item" key={provider.key}>
                <div>
                  <strong>{provider.displayName ?? provider.key}</strong>
                  <p>
                    {provider.kind} · {String(provider.config?.endpoint ?? '未配置')}
                    {provider.isDefault ? <Tag color="blue" size="small" style={{ marginLeft: 6 }}>默认</Tag> : null}
                  </p>
                </div>
                <Button
                  type="outline"
                  size="small"
                  disabled={provider.isDefault || provider.isMock === true || settingDefaultKey === provider.key}
                  onClick={() => void setDefaultProvider(provider.key)}
                  icon={<AppIcon icon={navigationIcons.providerSettings} size="sm" />}
                >
                  {settingDefaultKey === provider.key ? "设置中" : provider.isDefault ? "默认" : "设为默认"}
                </Button>
              </article>
            ))}
          </div>
        </Card>
      ) : null}

      {apiStatus.status === "error" ? (
        <InlineNotice tone="warning" title="Provider API 提示">
          {apiStatus.message}；下方配置仅做本地草稿编辑和本地预检。
        </InlineNotice>
      ) : null}

      {/* ── Provider Cards (2-column grid) ── */}
      <section className="provider-card-grid" aria-label="Provider 配置">
        {configs.map((config) => (
          <ProviderAreaCard
            key={config.area}
            config={config}
            health={health[config.area]}
            checking={checkingArea === config.area}
            visibleSecret={visibleSecretArea === config.area}
            onUpdate={updateConfig}
            onToggleSecret={() => setVisibleSecretArea((current) => (current === config.area ? null : config.area))}
            onHealthCheck={() => void runHealthCheck(config.area)}
            onSave={() => void saveSingleConfig(config.area)}
            saving={savingArea === config.area}
            scrollToId={`provider-card-${config.area}`}
          />
        ))}
      </section>
    </main>
  );
}

export default ProviderSettingsPage;
