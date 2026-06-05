import { useEffect, useMemo, useState } from "react";
import { Download, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import { InlineNotice, MetricCard, PayloadPreview, SectionHeader, StatusPill } from "./components";
import { useAuth } from "../../auth/AuthContext";

type AuditAction = "provider.updated" | "writeback.confirmed" | "feedback.tagged" | "trace.opened";

type AuditEntry = {
  id: string;
  time: string;
  actor: string;
  action: AuditAction;
  target: string;
  risk: "low" | "medium" | "high";
  ip: string;
  detail: Record<string, unknown>;
};

type AuditLoadState = {
  status: "loading" | "success" | "error";
  message: string;
};

const auditEntries: AuditEntry[] = [
  {
    id: "AUD-90021",
    time: "2026-06-05 09:51:22",
    actor: "ops-admin",
    action: "writeback.confirmed",
    target: "WB-20260605-001",
    risk: "high",
    ip: "10.0.8.21",
    detail: { confirmDialog: true, targetSystem: "LIMS", fields: 42, result: "accepted" }
  },
  {
    id: "AUD-90020",
    time: "2026-06-05 09:46:10",
    actor: "ops-admin",
    action: "provider.updated",
    target: "LLM / OpenAI Responses",
    risk: "medium",
    ip: "10.0.8.21",
    detail: { secretVisibleAfterSave: false, timeoutMs: 45000, healthCheck: "healthy" }
  },
  {
    id: "AUD-90019",
    time: "2026-06-05 09:43:38",
    actor: "reviewer-a",
    action: "feedback.tagged",
    target: "FB-1187",
    risk: "low",
    ip: "10.0.12.9",
    detail: { label: "字段缺失", sampleField: "出院日期", queue: "golden-set-candidate" }
  },
  {
    id: "AUD-90018",
    time: "2026-06-05 09:38:45",
    actor: "developer-demo",
    action: "trace.opened",
    target: "TR-20260605-7781",
    risk: "low",
    ip: "127.0.0.1",
    detail: { spanCount: 11, slowestNode: "llm.extract", durationMs: 4812 }
  }
];

const riskToneMap: Record<AuditEntry["risk"], "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function normalizeRisk(entry: Record<string, unknown>): AuditEntry["risk"] {
  const action = readString(entry, ["action"]) ?? "";
  const result = readString(entry, ["result", "status"]) ?? "";
  const explicitRisk = readString(entry, ["risk", "level"]);

  if (explicitRisk === "high" || action.includes("writeback") || result === "failed") {
    return "high";
  }

  if (explicitRisk === "medium" || action.includes("provider") || action.includes("schema")) {
    return "medium";
  }

  return "low";
}

function parseAuditEntries(items: unknown[]): AuditEntry[] {
  return items
    .map((item, index): AuditEntry | null => {
      if (!isRecord(item)) {
        return null;
      }

      const action = readString(item, ["action", "event"]) ?? "audit.event";

      return {
        id: readString(item, ["id", "auditId"]) ?? `API-AUD-${index + 1}`,
        time: readString(item, ["time", "createdAt", "timestamp"]) ?? "真实接口返回",
        actor: readString(item, ["actor", "actorUserId", "userId"]) ?? "system",
        action: action as AuditAction,
        target: readString(item, ["target", "objectId", "resourceId"]) ?? readString(item, ["objectType", "resourceType"]) ?? "-",
        risk: normalizeRisk(item),
        ip: readString(item, ["ip", "ipAddress"]) ?? "-",
        detail: item
      };
    })
    .filter((item): item is AuditEntry => Boolean(item));
}

export function AuditLogPage() {
  const { api } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [riskFilter, setRiskFilter] = useState<AuditEntry["risk"] | "all">("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadState, setLoadState] = useState<AuditLoadState>({
    status: "loading",
    message: "正在读取审计接口。"
  });

  async function loadAuditEntries() {
    setLoadState({ status: "loading", message: "正在读取 api.listAudit()。" });

    try {
      const response = await api.listAudit();
      const parsedEntries = parseAuditEntries(response.items);

      setEntries(parsedEntries);
      setSelectedId(parsedEntries[0]?.id ?? "");
      setLoadState({
        status: "success",
        message: parsedEntries.length > 0 ? `已读取 ${parsedEntries.length} 条真实审计事件。` : "审计接口可用，但当前没有审计事件。"
      });
    } catch (error) {
      setEntries([]);
      setSelectedId("");
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "审计接口读取失败。"
      });
    }
  }

  useEffect(() => {
    void loadAuditEntries();
  }, [api]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => riskFilter === "all" || entry.risk === riskFilter),
    [entries, riskFilter]
  );
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 16 19 22"
        title="Audit Log"
        description="补齐运维导航中的审计视图，集中展示 provider、写回、反馈标注和 Trace 查看记录。"
        actions={
          <>
            <label className="toolbar-control">
              <Filter size={15} aria-hidden="true" />
              <span>风险</span>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as AuditEntry["risk"] | "all")}>
                <option value="all">全部</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <button className="secondary-button" type="button">
              <Download size={16} aria-hidden="true" />
              导出 CSV
            </button>
            <button className="secondary-button" type="button" disabled={loadState.status === "loading"} onClick={() => void loadAuditEntries()}>
              <RefreshCw size={16} aria-hidden="true" />
              {loadState.status === "loading" ? "读取中" : "刷新"}
            </button>
          </>
        }
      />

      <section className="metric-grid" aria-label="审计指标">
        <MetricCard label="审计事件" value={`${entries.length}`} hint="来自 api.listAudit()" tone="info" />
        <MetricCard label="高风险" value={`${entries.filter((entry) => entry.risk === "high").length}`} hint="写回、密钥、权限类动作" tone="danger" />
        <MetricCard label="留痕策略" value="不可删除" hint="危险动作必须可追溯" tone="warning" />
      </section>

      <InlineNotice tone={loadState.status === "error" ? "warning" : "info"} title="API 状态">
        {loadState.status === "error" ? `审计列表加载失败：${loadState.message}` : loadState.message}
      </InlineNotice>

      <section className="operations-split">
        <section className="panel">
          <div className="panel-header">
            <h2>
              <ShieldCheck size={18} aria-hidden="true" />
              审计流水
            </h2>
            <StatusPill tone="info">{filteredEntries.length} 条</StatusPill>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作者</th>
                <th>动作</th>
                <th>对象</th>
                <th>风险</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className={entry.id === selectedEntry?.id ? "is-selected" : undefined}>
                    <td>
                      <button className="link-button" type="button" onClick={() => setSelectedId(entry.id)}>
                        {entry.time}
                      </button>
                    </td>
                    <td>{entry.actor}</td>
                    <td>{entry.action}</td>
                    <td>{entry.target}</td>
                    <td>
                      <StatusPill tone={riskToneMap[entry.risk]}>
                        {entry.risk === "high" ? "高" : entry.risk === "medium" ? "中" : "低"}
                      </StatusPill>
                    </td>
                    <td>{entry.ip}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{loadState.status === "loading" ? "正在加载审计事件。" : "暂无符合条件的审计事件。"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {selectedEntry ? <PayloadPreview title={`审计详情 ${selectedEntry.id}`} payload={selectedEntry.detail} /> : <PayloadPreview title="审计详情" payload={{ empty: "当前没有可展示审计详情" }} />}
      </section>
    </main>
  );
}

export default AuditLogPage;
