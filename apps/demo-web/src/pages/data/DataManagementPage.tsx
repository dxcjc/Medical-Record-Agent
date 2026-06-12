import { useEffect, useMemo, useState } from "react";
import { Tabs } from "@arco-design/web-react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";

const dataTabs = [
  { key: "schema", title: "Schema 管理", path: "/data/schema" },
  { key: "evaluation", title: "评测中心", path: "/data/evaluation" },
  { key: "feedback", title: "反馈样本", path: "/data/feedback" },
  { key: "trace", title: "Agent Trace", path: "/data/trace" },
  { key: "audit", title: "审计日志", path: "/data/audit" },
  { key: "writeback", title: "写回控制", path: "/data/writeback" },
  { key: "docs", title: "数据集规范", path: "/data/docs" },
];

export default function DataManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const match = dataTabs.find((tab) => location.pathname.startsWith(tab.path));
    return match?.key ?? "schema";
  }, [location.pathname]);

  function handleTabChange(key: string) {
    const tab = dataTabs.find((t) => t.key === key);
    if (tab) {
      navigate(tab.path);
    }
  }

  return (
    <main className="app-page">
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>数据管理</h1>
      <Tabs activeTab={activeTab} onChange={handleTabChange} type="card">
        {dataTabs.map((tab) => (
          <Tabs.TabPane key={tab.key} title={tab.title} />
        ))}
      </Tabs>
      <div style={{ marginTop: 16 }}>
        <Outlet />
      </div>
    </main>
  );
}
