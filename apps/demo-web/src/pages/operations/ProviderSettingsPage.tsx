import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch, Tag } from "@arco-design/web-react";
import type { ApiProviderHealthResponse, ApiProviderItem } from "../../api/client";
import { normalizeProviderItems } from "../../api/normalizers";
import { useAuth } from "../../auth/AuthContext";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons, providerIcons } from "../../icons/appIcons";
import { InlineNotice, MetricCard, SecretField, SectionHeader, StatusPill } from "./components";

type ProviderKind = "HTTP OCR" | "LangChain" | "OpenAI-compatible" | "OpenAI Responses" | "Object Storage" | "LIMS REST";

type ProviderArea = "OCR" | "LLM" | "storage" | "LIMS";

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
  status: "healthy" | "degraded" | "unchecked";
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

export const providerKinds: ProviderKind[] = ["HTTP OCR", "LangChain", "OpenAI-compatible", "OpenAI Responses", "Object Storage", "LIMS REST"];
const providerKeyByArea: Record<ProviderArea, string> = {
  OCR: "configured-ocr-provider",
  LLM: "configured-llm-provider",
  storage: "configured-storage-provider",
  LIMS: "configured-lims-provider"
};
const providerKindByArea: Record<ProviderArea, "ocr" | "llm" | "storage" | "lims"> = {
  OCR: "ocr",
  LLM: "llm",
  storage: "storage",
  LIMS: "lims"
};

const providerAreaIcons: Record<ProviderArea, (typeof providerIcons)[keyof typeof providerIcons]> = {
  OCR: providerIcons.azureOcr,
  LLM: providerIcons.openaiVision,
  storage: dashboardMetricIcons.dataset,
  LIMS: dashboardMetricIcons.writeback
};

const providerKindsByArea: Record<ProviderArea, ProviderKind[]> = {
  OCR: ["HTTP OCR", "OpenAI-compatible"],
  LLM: ["LangChain", "OpenAI-compatible", "OpenAI Responses"],
  storage: ["Object Storage"],
  LIMS: ["LIMS REST"]
};

const initialConfigs: ProviderConfig[] = [
  {
    area: "OCR",
    kind: "HTTP OCR",
    endpoint: "https://ocr-gateway.internal/v1",
    modelOrBucket: "medical-ocr-v3",
    secret: "ocr_live_********",
    timeoutMs: 30000,
    enabled: true
  },
  {
    area: "LLM",
    kind: "OpenAI Responses",
    endpoint: "https://api.openai.com/v1/responses",
    modelOrBucket: "gpt-4.1",
    secret: "openai_api_key_configured",
    timeoutMs: 45000,
    enabled: true
  },
  {
    area: "storage",
    kind: "Object Storage",
    endpoint: "s3://medical-record-agent-demo",
    modelOrBucket: "record-raw-files",
    secret: "storage_********",
    timeoutMs: 15000,
    enabled: true
  },
  {
    area: "LIMS",
    kind: "LIMS REST",
    endpoint: "https://lims-sandbox.example.com/api/clinical-info/writeback",
    modelOrBucket: "clinical-info-writeback",
    secret: "LIMS_API_TOKEN",
    timeoutMs: 12000,
    enabled: false
  }
];

const initialHealth: Record<ProviderArea, HealthResult> = {
  OCR: { status: "healthy", latencyMs: 186, checkedAt: "09:42:11", message: "OCR 网关可用，队列延迟正常" },
  LLM: { status: "healthy", latencyMs: 412, checkedAt: "09:41:03", message: "Responses API 连通，模型权限正常" },
  storage: { status: "degraded", latencyMs: 1290, checkedAt: "09:39:55", message: "对象存储可写，下载链路偏慢" },
  LIMS: { status: "unchecked", message: "LIMS 写回 provider 待配置后执行健康检查" }
};
const providerConfigStorageKey = "medical-record-agent.provider-configs";

function getHealthTone(status: HealthResult["status"]) {
  if (status === "healthy") {
    return "success";
  }
  if (status === "degraded") {
    return "warning";
  }
  return "neutral";
}

function readProviderKey(value: unknown) {
  if (value && typeof value === "object" && "key" in value) {
    const key = (value as { key?: unknown }).key;
    return typeof key === "string" && key.length > 0 ? key : undefined;
  }

  return undefined;
}

function readHealthResult(value: ApiProviderHealthResponse): HealthResult {
  const healthRecord = value.health;
  const status = healthRecord.status === "healthy" || healthRecord.status === "degraded" ? healthRecord.status : "unchecked";

  const result: HealthResult = {
    status,
    checkedAt:
      healthRecord.checkedAt
        ? new Date(healthRecord.checkedAt).toLocaleTimeString("zh-CN", { hour12: false })
        : new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    message: healthRecord.message ?? "Provider 健康检查已完成。"
  };
  if (typeof healthRecord.latencyMs === "number") {
    result.latencyMs = healthRecord.latencyMs;
  }

  return result;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function describeProviderAsyncAction(action: ProviderAsyncAction): ProviderAsyncDescriptor {
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
      title: "Provider 操作完成",
      message: action.message,
      canCancel: false,
      canRetry: true
    };
  }

  if (action.kind === "cancelled") {
    return {
      tone: "warning",
      title: "Provider 操作已取消",
      message: `${action.area ?? "Provider"} 操作已取消，页面保留上一次可见状态，可重试。`,
      canCancel: false,
      canRetry: true
    };
  }

  if (action.kind === "failed") {
    return {
      tone: "warning",
      title: "Provider 操作失败",
      message: `${action.area ?? "Provider"} 操作失败：${action.errorMessage}。请刷新 Provider API 或重试上一次操作。`,
      canCancel: false,
      canRetry: true
    };
  }

  return {
    tone: "info",
    title: "Provider 操作待执行",
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
    return kind === "storage" || key.includes("storage") || key.includes("s3");
  }

  return kind === "lims" || key.includes("lims") || key.includes("writeback");
}

function isProviderArea(value: unknown): value is ProviderArea {
  return value === "OCR" || value === "LLM" || value === "storage" || value === "LIMS";
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

  return configs.length === initialConfigs.length ? configs : null;
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

  if (config.area === "LIMS") {
    return { apiToken: secret };
  }
  if (config.area === "storage") {
    return { accessKeyId: secret };
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
  if (config.area === "LIMS") {
    return "lims-rest";
  }

  return "object-storage";
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
      endpoint: config.endpoint,
      modelOrBucket: config.modelOrBucket,
      timeoutMs: config.timeoutMs
    },
    secretRefs
  };
}

export function ProviderSettingsPage() {
  const { api } = useAuth();
  const [configs, setConfigs] = useState<ProviderConfig[]>(() => readStoredProviderConfigs() ?? initialConfigs);
  const [health, setHealth] = useState<Record<ProviderArea, HealthResult>>(initialHealth);
  const [visibleSecretArea, setVisibleSecretArea] = useState<ProviderArea | null>(null);
  const [savedAt, setSavedAt] = useState<string>("09:40:28");
  const [checkingArea, setCheckingArea] = useState<ProviderArea | null>(null);
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [apiProviders, setApiProviders] = useState<ApiProviderItem[]>([]);
  const [apiStatus, setApiStatus] = useState<ProviderApiStatus>({
    status: "loading",
    message: "正在读取真实 Provider API。",
    count: 0
  });
  const [settingDefaultKey, setSettingDefaultKey] = useState<string | null>(null);
  const [localActionState, setLocalActionState] = useState<LocalProviderActionState>({
    message: "Provider 配置会保存到后端 Provider API；Secret 字段只作为密钥引用名保存，不保存真实密钥明文。",
    tone: "info"
  });
  const [asyncAction, setAsyncAction] = useState<ProviderAsyncAction>({ kind: "idle" });
  const providerActionAbortControllerRef = useRef<AbortController | null>(null);
  const lastProviderActionRef = useRef<{ kind: "save" } | { kind: "health"; area: ProviderArea } | null>(null);

  const enabledCount = useMemo(() => configs.filter((config) => config.enabled).length, [configs]);
  const healthyCount = useMemo(
    () => Object.values(health).filter((result) => result.status === "healthy").length,
    [health]
  );
  const asyncActionDescriptor = describeProviderAsyncAction(asyncAction);

  async function loadProviders() {
    setApiStatus((current) => ({
      status: "loading",
      message: "正在读取真实 Provider API。",
      count: current.count
    }));

    try {
      const response = await api.listProviders();
      const items = normalizeProviderItems(response);
      setApiProviders(items);
      setApiStatus({
        status: "success",
        message: `已从 Provider API 读取 ${items.length} 个 provider。`,
        count: items.length
      });
    } catch (error) {
      setApiStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Provider API 暂不可用，继续显示本地草稿配置。",
        count: apiProviders.length
      });
    }
  }

  useEffect(() => {
    void loadProviders();
    // apiProviders 不能进入依赖，否则错误分支会因 count 回写导致重复加载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(
    () => () => {
      providerActionAbortControllerRef.current?.abort();
    },
    []
  );

  function updateConfig(area: ProviderArea, patch: Partial<ProviderConfig>) {
    setConfigs((current) => {
      const nextConfigs = current.map((config) => (config.area === area ? { ...config, ...patch } : config));
      writeStoredProviderConfigs(nextConfigs);
      return nextConfigs;
    });
  }

  async function runHealthCheck(area: ProviderArea) {
    const provider = apiProviders.find((item) => matchesProviderArea(item, area));
    if (!provider) {
      setHealth((current) => ({
        ...current,
        [area]: {
          status: "unchecked",
          checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          message: `未找到 ${area} 对应的真实 provider，请先刷新 Provider API。`
        }
      }));
      setLocalActionState({
        message: `${area} 没有匹配到真实 provider key，未执行健康检查。`,
        tone: "warning"
      });
      return;
    }

    providerActionAbortControllerRef.current?.abort();
    const controller = new AbortController();
    providerActionAbortControllerRef.current = controller;
    lastProviderActionRef.current = { kind: "health", area };
    setCheckingArea(area);
    setAsyncAction({ kind: "checking", area, providerKey: provider.key });
    setLocalActionState({
      message: `${area} 正在调用真实 Provider Health API：${provider.key}。`,
      tone: "info"
    });

    try {
      const response = await api.checkProviderHealth(provider.key, { signal: controller.signal });
      setHealth((current) => ({
        ...current,
        [area]: readHealthResult(response)
      }));
      setAsyncAction({ kind: "succeeded", area, message: `${area} 健康检查完成，来源 provider：${provider.key}。` });
      setLocalActionState({
        message: `${area} 健康检查完成，来源 provider：${provider.key}。`,
        tone: "info"
      });
    } catch (error) {
      if (isAbortError(error)) {
        setHealth((current) => ({
          ...current,
          [area]: {
            status: "unchecked",
            checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
            message: `${area} 健康检查已取消。`
          }
        }));
        setAsyncAction({ kind: "cancelled", area });
        setLocalActionState({
          message: `${area} 健康检查已取消，可重试上一次操作。`,
          tone: "warning"
        });
        return;
      }

      setHealth((current) => ({
        ...current,
        [area]: {
          status: "degraded",
          checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          message: error instanceof Error ? error.message : `${area} 健康检查失败。`
        }
      }));
      setAsyncAction({
        kind: "failed",
        area,
        errorMessage: error instanceof Error ? error.message : `${area} 健康检查失败`
      });
      setLocalActionState({
        message: `${area} 健康检查失败，请检查权限、后端 route 或 provider 配置。`,
        tone: "warning"
      });
    } finally {
      if (providerActionAbortControllerRef.current === controller) {
        providerActionAbortControllerRef.current = null;
        setCheckingArea(null);
      }
    }
  }

  async function saveConfigs() {
    providerActionAbortControllerRef.current?.abort();
    const controller = new AbortController();
    providerActionAbortControllerRef.current = controller;
    lastProviderActionRef.current = { kind: "save" };
    setSavingConfigs(true);
    setAsyncAction({ kind: "saving", pendingCount: configs.length });
    setLocalActionState({
      message: "正在保存 OCR、LLM、Storage 和 LIMS provider 配置。",
      tone: "info"
    });

    try {
      await Promise.all(
        configs.map((config) =>
          api.saveProviderConfig(buildProviderKeyForArea(config.area), buildProviderConfigSaveRequest(config), {
            signal: controller.signal
          })
        )
      );
      writeStoredProviderConfigs(configs);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      setVisibleSecretArea(null);
      setAsyncAction({ kind: "succeeded", message: "Provider 配置已保存到后端，并会参与真实 Provider 列表、默认值和健康检查展示。" });
      setLocalActionState({
        message: "Provider 配置已保存到后端，并会参与真实 Provider 列表、默认值和健康检查展示。",
        tone: "info"
      });
      await loadProviders();
    } catch (error) {
      if (isAbortError(error)) {
        setAsyncAction({ kind: "cancelled" });
        setLocalActionState({
          message: "Provider 配置保存已取消，后端状态未被标记为保存成功。",
          tone: "warning"
        });
        return;
      }

      setAsyncAction({
        kind: "failed",
        errorMessage: error instanceof Error ? error.message : "Provider 配置保存失败"
      });
      setLocalActionState({
        message: error instanceof Error ? `Provider 配置保存失败：${error.message}` : "Provider 配置保存失败，请检查后端服务。",
        tone: "warning"
      });
    } finally {
      if (providerActionAbortControllerRef.current === controller) {
        providerActionAbortControllerRef.current = null;
      }
      setSavingConfigs(false);
    }
  }

  function cancelProviderAction() {
    providerActionAbortControllerRef.current?.abort();
  }

  function retryProviderAction() {
    const lastAction = lastProviderActionRef.current;
    if (!lastAction) {
      return;
    }

    if (lastAction.kind === "save") {
      void saveConfigs();
      return;
    }

    void runHealthCheck(lastAction.area);
  }

  async function setDefaultProvider(key: string) {
    setSettingDefaultKey(key);

    try {
      const response = await api.setDefaultProvider(key);
      const responseKey = readProviderKey((response as { provider?: unknown }).provider) ?? key;
      setApiProviders((current) =>
        current.map((provider) => ({
          ...provider,
          isDefault: provider.key === responseKey
        }))
      );
      setApiStatus((current) => ({
        ...current,
        status: "success",
        message: `已将 ${responseKey} 设置为默认 provider。`
      }));
    } catch (error) {
      setApiStatus((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "设置默认 provider 失败。"
      }));
    } finally {
      setSettingDefaultKey(null);
    }
  }

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 18"
        title="Provider 设置"
        description="集中维护真实 OCR、LLM、对象存储和 LIMS 写回 provider，支持生产与沙箱环境配置、默认值和健康检查。"
        meta={
          <div className="page-header__meta" aria-label="Provider 运维摘要">
            <span className="page-header__meta-item">
              <strong>健康实例</strong>
              <span>{healthyCount}/4 最新检查正常</span>
            </span>
            <span className="page-header__meta-item">
              <strong>API Provider</strong>
              <span>{apiStatus.count} 个后端配置可见</span>
            </span>
            <span className="page-header__meta-item">
              <strong>密钥策略</strong>
              <span>Secret 仅保存引用名</span>
            </span>
          </div>
        }
        actions={
          <>
            <Button type="outline" disabled={!asyncActionDescriptor.canCancel} onClick={cancelProviderAction}>
              取消当前操作
            </Button>
            <Button type="outline" disabled={!asyncActionDescriptor.canRetry || savingConfigs || checkingArea !== null} onClick={retryProviderAction}>
              重试上次操作
            </Button>
            <Button type="primary" disabled={savingConfigs} loading={savingConfigs} onClick={() => void saveConfigs()} icon={<AppIcon icon={dashboardMetricIcons.decisionPass} size="sm" />}>
              {savingConfigs ? "保存中" : "保存到 Provider API"}
            </Button>
          </>
        }
      />

      <section className="metric-grid" aria-label="Provider 指标">
        <MetricCard label="启用 Provider" value={`${enabledCount}/4`} hint={`API 配置保存 ${savedAt}`} tone="info" />
        <MetricCard label="健康实例" value={`${healthyCount}/4`} hint="按最新健康检查结果统计" tone="success" />
        <MetricCard label="密钥策略" value="保存后隐藏" hint="Secret 不在页面常驻明文展示" tone="warning" />
        <MetricCard label="API Provider" value={`${apiStatus.count}`} hint={apiStatus.message} tone={apiStatus.status === "error" ? "warning" : "info"} />
      </section>

      <InlineNotice tone={localActionState.tone} title="本地预检说明">
        {localActionState.message}
      </InlineNotice>

      <InlineNotice tone={asyncActionDescriptor.tone === "warning" ? "warning" : asyncActionDescriptor.tone === "success" ? "success" : "info"} title={asyncActionDescriptor.title}>
        {asyncActionDescriptor.message}
      </InlineNotice>

      <section className="operations-status-strip" aria-label="Provider 操作状态">
        <article>
          <strong>Provider API</strong>
          <span>{apiStatus.status === "loading" ? "读取中" : apiStatus.message}</span>
        </article>
        <article>
          <strong>健康检查</strong>
          <span>{checkingArea ? `${checkingArea} 检查中` : `${healthyCount} 个 provider 健康`}</span>
        </article>
        <article>
          <strong>保存状态</strong>
          <span>{savingConfigs ? "正在同步配置" : `上次保存 ${savedAt}`}</span>
        </article>
      </section>

      <Card className="panel">
        <div className="panel-header">
          <h2>
            <AppIcon icon={navigationIcons.providerSettings} size="md" />
            真实 Provider API
          </h2>
          <Button type="outline" disabled={apiStatus.status === "loading"} loading={apiStatus.status === "loading"} onClick={() => void loadProviders()} icon={<AppIcon icon={actionIcons.refresh} size="sm" className={apiStatus.status === "loading" ? "is-spinning" : undefined} />}>
            {apiStatus.status === "loading" ? "读取中" : "刷新"}
          </Button>
        </div>
        <InlineNotice tone={apiStatus.status === "error" ? "warning" : "info"} title="API 状态">
          {apiStatus.message}
        </InlineNotice>
        <div className="provider-list">
          {apiStatus.status === "loading" ? (
            <InlineNotice tone="info" title="正在读取">
              正在读取真实 provider list/default 状态，读取完成后会优先展示后端返回。
            </InlineNotice>
          ) : null}
          {apiProviders.map((provider) => (
            <article key={provider.key} className="provider-row">
              <div>
                <h3>{provider.name}</h3>
                <p>
                  key: {provider.key} · {provider.enabled ? "已启用" : "未启用"} · {provider.isDefault ? "当前默认" : "非默认"}
                </p>
              </div>
              <Button
                type="outline"
                disabled={provider.isDefault || provider.isMock === true || settingDefaultKey === provider.key}
                onClick={() => void setDefaultProvider(provider.key)}
                icon={<AppIcon icon={navigationIcons.providerSettings} size="sm" />}
              >
                {settingDefaultKey === provider.key ? "设置中" : provider.isDefault ? "默认" : "设为默认"}
              </Button>
            </article>
          ))}
          {apiProviders.length === 0 ? (
            <InlineNotice tone="warning" title="暂无真实 provider">
              真实 API 未返回 provider 列表；下面配置只做本地草稿编辑和本地预检，不代表后端保存成功。
            </InlineNotice>
          ) : null}
        </div>
      </Card>

      <InlineNotice tone="info" title="Provider 配置区">
        下方 OCR、LLM、Storage、LIMS 表单会保存到后端 Provider API；Health Check 会按 provider kind/key 调用真实 API。
      </InlineNotice>

      <section className="provider-grid">
        {configs.map((config) => {
          const healthResult = health[config.area];
          return (
            <Card className="panel" key={config.area}>
              <div className="panel-header">
                <h2>
                  <AppIcon icon={providerAreaIcons[config.area]} size="md" />
                  {config.area}
                </h2>
                <StatusPill tone={getHealthTone(healthResult.status)}>
                  {healthResult.status === "healthy" ? "健康" : healthResult.status === "degraded" ? "降级" : "未检查"}
                </StatusPill>
              </div>

              <div className="form-grid">
                <Form.Item label="Provider 类型">
                  <Select
                    value={config.kind}
                    onChange={(value) => updateConfig(config.area, { kind: String(value) as ProviderKind })}
                  >
                    {providerKindsByArea[config.area].map((kind) => (
                      <Select.Option key={kind} value={kind}>
                        {kind}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label="Endpoint">
                  <Input
                    value={config.endpoint}
                    onChange={(value) => updateConfig(config.area, { endpoint: value })}
                  />
                </Form.Item>
                <Form.Item label={config.area === "storage" ? "Bucket / Prefix" : "Model / Profile"}>
                  <Input
                    value={config.modelOrBucket}
                    onChange={(value) => updateConfig(config.area, { modelOrBucket: value })}
                  />
                </Form.Item>
                <Form.Item label="超时毫秒">
                  <InputNumber
                    min={1000}
                    step={1000}
                    value={config.timeoutMs}
                    onChange={(value) => updateConfig(config.area, { timeoutMs: Number(value) })}
                  />
                </Form.Item>
                <SecretField
                  label="Secret"
                  value={config.secret}
                  visible={visibleSecretArea === config.area}
                  onToggle={() => setVisibleSecretArea((current) => (current === config.area ? null : config.area))}
                  onChange={(secret) => updateConfig(config.area, { secret })}
                />
                <Form.Item label="启用状态">
                  <Space>
                    <Switch checked={config.enabled} onChange={(checked) => updateConfig(config.area, { enabled: checked })} />
                    <Tag color={config.enabled ? "green" : "gray"}>{config.enabled ? "已启用" : "未启用"}</Tag>
                  </Space>
                </Form.Item>
              </div>

              <div className="provider-health">
                <p>
                  {healthResult.message}
                  {healthResult.latencyMs ? `，延迟 ${healthResult.latencyMs}ms` : ""}
                  {healthResult.checkedAt ? `，检查时间 ${healthResult.checkedAt}` : ""}
                </p>
                <Button
                  type="outline"
                  disabled={checkingArea === config.area}
                  loading={checkingArea === config.area}
                  onClick={() => void runHealthCheck(config.area)}
                  icon={<AppIcon icon={navigationIcons.providerSettings} size="sm" className={checkingArea === config.area ? "is-spinning" : undefined} />}
                >
                  {checkingArea === config.area ? "检查中" : "Health Check"}
                </Button>
              </div>
            </Card>
          );
        })}
      </section>
    </main>
  );
}

export default ProviderSettingsPage;
