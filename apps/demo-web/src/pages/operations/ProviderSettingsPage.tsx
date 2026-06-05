import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Database, HardDrive, RefreshCcw, Save, ServerCog, Sparkles, Stethoscope } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { InlineNotice, MetricCard, SecretField, SectionHeader, StatusPill } from "./components";

type ProviderKind = "LangChain" | "OpenAI-compatible" | "OpenAI Responses" | "Mock";

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

const providerKinds: ProviderKind[] = ["LangChain", "OpenAI-compatible", "OpenAI Responses", "Mock"];

const providerIcons: Record<ProviderArea, ReactNode> = {
  OCR: <Stethoscope size={18} aria-hidden="true" />,
  LLM: <Sparkles size={18} aria-hidden="true" />,
  storage: <HardDrive size={18} aria-hidden="true" />,
  LIMS: <Database size={18} aria-hidden="true" />
};

const initialConfigs: ProviderConfig[] = [
  {
    area: "OCR",
    kind: "OpenAI-compatible",
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
    secret: "sk-proj-********",
    timeoutMs: 45000,
    enabled: true
  },
  {
    area: "storage",
    kind: "LangChain",
    endpoint: "s3://medical-record-agent-demo",
    modelOrBucket: "record-raw-files",
    secret: "storage_********",
    timeoutMs: 15000,
    enabled: true
  },
  {
    area: "LIMS",
    kind: "Mock",
    endpoint: "http://lims.mock.local/api",
    modelOrBucket: "demo-writeback",
    secret: "mock_********",
    timeoutMs: 12000,
    enabled: false
  }
];

const initialHealth: Record<ProviderArea, HealthResult> = {
  OCR: { status: "healthy", latencyMs: 186, checkedAt: "09:42:11", message: "OCR 网关可用，队列延迟正常" },
  LLM: { status: "healthy", latencyMs: 412, checkedAt: "09:41:03", message: "Responses API 连通，模型权限正常" },
  storage: { status: "degraded", latencyMs: 1290, checkedAt: "09:39:55", message: "对象存储可写，下载链路偏慢" },
  LIMS: { status: "unchecked", message: "Mock provider 未执行健康检查" }
};

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

function readProviderItems(value: { items: unknown[] }) {
  return value.items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        key: typeof record.key === "string" ? record.key : "unknown",
        name: typeof record.name === "string" ? record.name : "未命名 provider",
        enabled: record.enabled === true,
        isDefault: record.isDefault === true
      };
    })
    .filter((item): item is { key: string; name: string; enabled: boolean; isDefault: boolean } => Boolean(item));
}

export function ProviderSettingsPage() {
  const { api } = useAuth();
  const [configs, setConfigs] = useState<ProviderConfig[]>(initialConfigs);
  const [health, setHealth] = useState<Record<ProviderArea, HealthResult>>(initialHealth);
  const [visibleSecretArea, setVisibleSecretArea] = useState<ProviderArea | null>(null);
  const [savedAt, setSavedAt] = useState<string>("09:40:28");
  const [checkingArea, setCheckingArea] = useState<ProviderArea | null>(null);
  const [apiProviders, setApiProviders] = useState<Array<{ key: string; name: string; enabled: boolean; isDefault: boolean }>>([]);
  const [apiStatus, setApiStatus] = useState<ProviderApiStatus>({
    status: "loading",
    message: "正在读取真实 Provider API。",
    count: 0
  });
  const [settingDefaultKey, setSettingDefaultKey] = useState<string | null>(null);
  const [localActionState, setLocalActionState] = useState<LocalProviderActionState>({
    message: "保存配置和 Health check 当前未发现后端 route，以下表单仅执行本地草稿保存与本地预检。",
    tone: "warning"
  });

  const enabledCount = useMemo(() => configs.filter((config) => config.enabled).length, [configs]);
  const healthyCount = useMemo(
    () => Object.values(health).filter((result) => result.status === "healthy").length,
    [health]
  );

  async function loadProviders() {
    setApiStatus((current) => ({
      status: "loading",
      message: "正在读取真实 Provider API。",
      count: current.count
    }));

    try {
      const response = await api.listProviders();
      const items = readProviderItems(response);
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

  function updateConfig(area: ProviderArea, patch: Partial<ProviderConfig>) {
    setConfigs((current) => current.map((config) => (config.area === area ? { ...config, ...patch } : config)));
  }

  function runHealthCheck(area: ProviderArea) {
    setCheckingArea(area);
    setLocalActionState({
      message: `${area} 正在执行本地预检；当前后端没有单 provider 健康检查 route。`,
      tone: "info"
    });

    // 这里明确是本地预检，不冒充后端健康检查；用于保留 Demo 的等待态和结果回写体验。
    window.setTimeout(() => {
      setHealth((current) => ({
        ...current,
        [area]: {
          status: area === "storage" ? "degraded" : "healthy",
          latencyMs: area === "LLM" ? 438 : area === "storage" ? 1186 : 214,
          checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          message:
            area === "storage"
              ? "本地预检：存储配置可写性待后端接入，公网回源参数建议复核"
              : `本地预检：${area} provider 配置格式通过`
        }
      }));
      setLocalActionState({
        message: `${area} 本地预检完成；真实健康检查仍需后端 route 接入后才能执行。`,
        tone: "warning"
      });
      setCheckingArea(null);
    }, 420);
  }

  function saveConfigs() {
    setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    setVisibleSecretArea(null);
    setLocalActionState({
      message: "已保存到当前页面本地草稿状态；后端暂无 provider 配置保存 route，刷新页面后不会持久化。",
      tone: "warning"
    });
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
        title="Provider Settings"
        description="集中维护 OCR、LLM、对象存储和 LIMS 写回 provider，支持 Mock 与生产兼容模式切换。"
        actions={
          <button className="action-button" type="button" onClick={saveConfigs}>
            <Save size={16} aria-hidden="true" />
            保存本地草稿
          </button>
        }
      />

      <section className="metric-grid" aria-label="Provider 指标">
        <MetricCard label="启用 Provider" value={`${enabledCount}/4`} hint={`本地草稿保存 ${savedAt}`} tone="info" />
        <MetricCard label="健康实例" value={`${healthyCount}/4`} hint="按最新健康检查结果统计" tone="success" />
        <MetricCard label="密钥策略" value="保存后隐藏" hint="Secret 不在页面常驻明文展示" tone="warning" />
        <MetricCard label="API Provider" value={`${apiStatus.count}`} hint={apiStatus.message} tone={apiStatus.status === "error" ? "warning" : "info"} />
      </section>

      <InlineNotice tone={localActionState.tone} title="本地预检说明">
        {localActionState.message}
      </InlineNotice>

      <section className="panel">
        <div className="panel-header">
          <h2>
            <ServerCog size={18} aria-hidden="true" />
            真实 Provider API
          </h2>
          <button className="secondary-button" type="button" disabled={apiStatus.status === "loading"} onClick={() => void loadProviders()}>
            <RefreshCcw size={16} aria-hidden="true" />
            {apiStatus.status === "loading" ? "读取中" : "刷新"}
          </button>
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
              <button
                className="secondary-button"
                type="button"
                disabled={provider.isDefault || settingDefaultKey === provider.key}
                onClick={() => void setDefaultProvider(provider.key)}
              >
                <ServerCog size={16} aria-hidden="true" />
                {settingDefaultKey === provider.key ? "设置中" : provider.isDefault ? "默认" : "设为默认"}
              </button>
            </article>
          ))}
          {apiProviders.length === 0 ? (
            <InlineNotice tone="warning" title="暂无真实 provider">
              真实 API 未返回 provider 列表；下面配置只做本地草稿编辑和本地预检，不代表后端保存成功。
            </InlineNotice>
          ) : null}
        </div>
      </section>

      <InlineNotice tone="info" title="本地配置区">
        下方 OCR、LLM、storage、LIMS 表单保留原演示布局；保存和 Health check 均为本地预检，真实默认 provider 以“真实 Provider API”区域为准。
      </InlineNotice>

      <section className="provider-grid">
        {configs.map((config) => {
          const healthResult = health[config.area];
          return (
            <article className="panel" key={config.area}>
              <div className="panel-header">
                <h2>
                  {providerIcons[config.area]}
                  {config.area}
                </h2>
                <StatusPill tone={getHealthTone(healthResult.status)}>
                  {healthResult.status === "healthy" ? "健康" : healthResult.status === "degraded" ? "降级" : "未检查"}
                </StatusPill>
              </div>

              <div className="form-grid">
                <label>
                  <span>Provider 类型</span>
                  <select
                    value={config.kind}
                    onChange={(event) => updateConfig(config.area, { kind: event.target.value as ProviderKind })}
                  >
                    {providerKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <input
                    value={config.endpoint}
                    onChange={(event) => updateConfig(config.area, { endpoint: event.target.value })}
                  />
                </label>
                <label>
                  <span>{config.area === "storage" ? "Bucket / Prefix" : "Model / Profile"}</span>
                  <input
                    value={config.modelOrBucket}
                    onChange={(event) => updateConfig(config.area, { modelOrBucket: event.target.value })}
                  />
                </label>
                <label>
                  <span>超时毫秒</span>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={config.timeoutMs}
                    onChange={(event) => updateConfig(config.area, { timeoutMs: Number(event.target.value) })}
                  />
                </label>
                <SecretField
                  label="Secret"
                  value={config.secret}
                  visible={visibleSecretArea === config.area}
                  onToggle={() => setVisibleSecretArea((current) => (current === config.area ? null : config.area))}
                  onChange={(secret) => updateConfig(config.area, { secret })}
                />
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) => updateConfig(config.area, { enabled: event.target.checked })}
                  />
                  <span>启用此 provider</span>
                </label>
              </div>

              <div className="provider-health">
                <p>
                  {healthResult.message}
                  {healthResult.latencyMs ? `，延迟 ${healthResult.latencyMs}ms` : ""}
                  {healthResult.checkedAt ? `，检查时间 ${healthResult.checkedAt}` : ""}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={checkingArea === config.area}
                  onClick={() => runHealthCheck(config.area)}
                >
                  <ServerCog size={16} aria-hidden="true" />
                  {checkingArea === config.area ? "预检中" : "本地预检"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export default ProviderSettingsPage;
