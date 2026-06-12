import { useMemo } from "react";
import { Tabs } from "@arco-design/web-react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";

const settingsTabs = [
  { key: "providers", title: "Provider 设置", path: "/settings/providers" },
];

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const match = settingsTabs.find((tab) => location.pathname.startsWith(tab.path));
    return match?.key ?? "providers";
  }, [location.pathname]);

  function handleTabChange(key: string) {
    const tab = settingsTabs.find((t) => t.key === key);
    if (tab) {
      navigate(tab.path);
    }
  }

  return (
    <main className="app-page">
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>系统设置</h1>
      <Tabs activeTab={activeTab} onChange={handleTabChange} type="card">
        {settingsTabs.map((tab) => (
          <Tabs.TabPane key={tab.key} title={tab.title} />
        ))}
      </Tabs>
      <div style={{ marginTop: 16 }}>
        <Outlet />
      </div>
    </main>
  );
}
