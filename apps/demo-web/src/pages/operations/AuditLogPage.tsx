import { useEffect, useMemo, useState } from "react";
import { Button, Card, Message, Select, Table } from "@arco-design/web-react";
import type { TableColumnProps } from "@arco-design/web-react";
import type { ApiAuditEntry, ApiJsonObject } from "../../api/client";
import { AppIcon, actionIcons, dashboardMetricIcons, navigationIcons } from "../../icons/appIcons";
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
  detail: ApiAuditEntry;
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

function normalizeRisk(entry: ApiAuditEntry): AuditEntry["risk"] {
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

function parseAuditEntries(items: ApiAuditEntry[]): AuditEntry[] {
  return items
    .map((item, index): AuditEntry | null => {
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

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildAuditCsv(entries: AuditEntry[]) {
  const header = ["id", "time", "actor", "action", "target", "risk", "ip", "detail"];
  const rows = entries.map((entry) => [
    entry.id,
    entry.time,
    entry.actor,
    entry.action,
    entry.target,
    entry.risk,
    entry.ip,
    JSON.stringify(entry.detail)
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
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
  const canExportCsv = filteredEntries.length > 0 && loadState.status !== "loading";
  const columns: TableColumnProps<AuditEntry>[] = [
    {
      title: "时间",
      dataIndex: "time",
      render: (_, entry) => (
        <Button type="text" onClick={() => setSelectedId(entry.id)}>
          {entry.time}
        </Button>
      ),
    },
    { title: "操作者", dataIndex: "actor" },
    { title: "动作", dataIndex: "action" },
    { title: "对象", dataIndex: "target" },
    {
      title: "风险",
      dataIndex: "risk",
      render: (_, entry) => (
        <StatusPill tone={riskToneMap[entry.risk]}>
          {entry.risk === "high" ? "高" : entry.risk === "medium" ? "中" : "低"}
        </StatusPill>
      ),
    },
    { title: "IP", dataIndex: "ip" },
  ];

  function exportAuditCsv() {
    if (!canExportCsv) {
      Message.warning("当前没有可导出的审计记录。");
      return;
    }

    const csv = buildAuditCsv(filteredEntries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    Message.success(`已导出 ${filteredEntries.length} 条审计记录。`);
  }

  return (
    <main className="app-page">
      <SectionHeader
        eyebrow="Operations / Task 16 19 22"
        title="审计日志"
        description="补齐运维导航中的审计视图，集中展示 provider、写回、反馈标注和 Trace 查看记录。"
        actions={
          <>
            <label className="toolbar-control">
              <AppIcon icon={dashboardMetricIcons.decisionReview} size="sm" />
              <span>风险</span>
              <Select value={riskFilter} onChange={(value) => setRiskFilter(String(value) as AuditEntry["risk"] | "all")} style={{ width: 112 }}>
                <Select.Option value="all">全部</Select.Option>
                <Select.Option value="high">高</Select.Option>
                <Select.Option value="medium">中</Select.Option>
                <Select.Option value="low">低</Select.Option>
              </Select>
            </label>
            <Button
              type="outline"
              disabled={!canExportCsv}
              title={canExportCsv ? "导出当前筛选结果" : "无审计记录可导出"}
              onClick={exportAuditCsv}
              icon={<AppIcon icon={navigationIcons.auditLog} size="sm" />}
            >
              导出 CSV
            </Button>
            <Button type="outline" disabled={loadState.status === "loading"} loading={loadState.status === "loading"} onClick={() => void loadAuditEntries()} icon={<AppIcon icon={actionIcons.refresh} size="sm" className={loadState.status === "loading" ? "is-spinning" : undefined} />}>
              {loadState.status === "loading" ? "读取中" : "刷新"}
            </Button>
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
        <Card className="panel">
          <div className="panel-header">
            <h2>
              <AppIcon icon={navigationIcons.auditLog} size="md" />
              审计流水
            </h2>
            <StatusPill tone="info">{filteredEntries.length} 条</StatusPill>
          </div>
          <Table columns={columns} data={filteredEntries} rowKey="id" pagination={false} scroll={{ x: 860 }} />
        </Card>

        {selectedEntry ? <PayloadPreview title={`审计详情 ${selectedEntry.id}`} payload={selectedEntry.detail as ApiJsonObject} /> : <PayloadPreview title="审计详情" payload={{ empty: "当前没有可展示审计详情" }} />}
      </section>
    </main>
  );
}

export default AuditLogPage;
