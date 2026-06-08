import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { StepGuide } from "../components/StepGuide";
import { useAuth } from "../auth/AuthContext";
import { AppIcon, actionIcons, commonUiIcons, navigationIcons } from "../icons/appIcons";

type NavItem = {
  to: string;
  label: string;
  permission?: string;
  icon: LucideIcon;
  guide?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { to: "/", label: "Dashboard", icon: navigationIcons.dashboard, guide: "environment-status" },
      { to: "/recognition/new", label: "New Recognition", icon: navigationIcons.newRecognition, permission: "job:create", guide: "new-recognition" },
      { to: "/recognition/jobs/demo", label: "Job Detail", icon: navigationIcons.jobDetail, permission: "job:read", guide: "field-evidence" }
    ]
  },
  {
    label: "Operations",
    items: [
      { to: "/schema", label: "Schema Studio", icon: navigationIcons.schemaStudio, permission: "schema:read", guide: "schema-publish" },
      { to: "/evaluation", label: "Evaluation", icon: navigationIcons.evaluation, permission: "evaluation:manage", guide: "evaluation" },
      { to: "/feedback", label: "Feedback Samples", icon: navigationIcons.feedbackSamples, permission: "feedback:create", guide: "feedback" },
      { to: "/trace", label: "Agent Trace", icon: navigationIcons.agentTrace, permission: "job:read" },
      { to: "/audit", label: "Audit Log", icon: navigationIcons.auditLog, permission: "audit:read" },
      { to: "/writeback", label: "Writeback", icon: navigationIcons.writeback, permission: "writeback:execute", guide: "writeback" }
    ]
  },
  {
    label: "Settings",
    items: [
      { to: "/providers", label: "Provider Settings", icon: navigationIcons.providerSettings, permission: "provider:manage" },
      { to: "/docs", label: "Dataset Spec", icon: navigationIcons.datasetSpec }
    ]
  }
];

const breadcrumbLabels = new Map<string, string>([
  ["/", "Dashboard"],
  ["/recognition", "Recognition"],
  ["/recognition/new", "New Recognition"],
  ["/recognition/jobs", "Jobs"],
  ["/schema", "Schema Studio"],
  ["/evaluation", "Evaluation"],
  ["/feedback", "Feedback Samples"],
  ["/providers", "Provider Settings"],
  ["/writeback", "Writeback"],
  ["/trace", "Agent Trace"],
  ["/audit", "Audit Log"],
  ["/docs", "Dataset Spec"]
]);

const themeStorageKey = "medical-record-agent.theme";

export function AppShell() {
  const { auth, hasPermission, logout, api } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => window.localStorage.getItem(themeStorageKey) === "dark");
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || hasPermission(item.permission))
    }))
    .filter((group) => group.items.length > 0);
  const breadcrumbs = useMemo(() => {
    if (location.pathname === "/") {
      return [{ label: "Dashboard", to: "/" }];
    }

    const parts = location.pathname.split("/").filter(Boolean);
    return parts.map((part, index) => {
      const path = `/${parts.slice(0, index + 1).join("/")}`;
      return {
        label: breadcrumbLabels.get(path) ?? part.replace(/-/g, " "),
        to: index === parts.length - 1 ? undefined : path
      };
    });
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem(themeStorageKey, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--collapsed" : ""}`}>
      <aside className={`sidebar ${isMobileDrawerOpen ? "is-open" : ""}`} data-guide="navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <AppIcon icon={navigationIcons.brand} size="lg" />
          </div>
          <div className="brand-copy">
            <strong>Medical Record Agent</strong>
            <span>Clinical Studio</span>
          </div>
          <button
            className="icon-button sidebar-close u-only-mobile"
            type="button"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-label="关闭导航菜单"
          >
            <AppIcon icon={commonUiIcons.close} />
          </button>
        </div>

        <nav className="side-nav" aria-label="主导航">
          {visibleNavGroups.map((group) => (
            <div className="side-nav__group" key={group.label}>
              <p className="side-nav__label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} data-guide={item.guide} end={item.to === "/"} title={item.label}>
                    <AppIcon icon={Icon} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span>{auth?.user.displayName ?? "演示用户"}</span>
            <small>{auth?.roles.join(", ")}</small>
          </div>
          <button className="icon-text-button sidebar-logout" type="button" onClick={handleLogout}>
            <AppIcon icon={actionIcons.logout} size="sm" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      <button
        className={`sidebar-backdrop ${isMobileDrawerOpen ? "is-visible" : ""}`}
        type="button"
        onClick={() => setIsMobileDrawerOpen(false)}
        aria-label="关闭导航菜单遮罩"
      />

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-section">
            <button className="icon-button u-only-mobile" type="button" onClick={() => setIsMobileDrawerOpen(true)} aria-label="打开导航菜单">
              <AppIcon icon={commonUiIcons.menu} />
            </button>
            <button
              className="icon-button u-hide-mobile"
              type="button"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              <AppIcon icon={commonUiIcons.collapseSidebar} />
            </button>
            <div>
              <nav className="breadcrumbs" aria-label="面包屑导航">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`}>
                    {crumb.to ? <NavLink to={crumb.to}>{crumb.label}</NavLink> : <strong>{crumb.label}</strong>}
                  </span>
                ))}
              </nav>
              <span className="topbar-label">API {api.baseUrl}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="status-pill status-pill-success">Mock Provider Ready</span>
            <StepGuide />
            <button
              className="icon-button"
              type="button"
              onClick={() => setIsDarkMode((current) => !current)}
              aria-label={isDarkMode ? "切换到浅色模式" : "切换到深色模式"}
            >
              <AppIcon icon={isDarkMode ? commonUiIcons.lightMode : commonUiIcons.darkMode} size="sm" />
            </button>
          </div>
        </header>
        <main className="workspace-main u-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
