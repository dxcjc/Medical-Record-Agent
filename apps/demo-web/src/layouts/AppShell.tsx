import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  ClipboardList,
  DatabaseZap,
  FileSearch,
  FlaskConical,
  History,
  LogOut,
  MessageSquareText,
  Network,
  PanelLeft,
  ScrollText,
  SendToBack,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { StepGuide } from "../components/StepGuide";
import { useAuth } from "../auth/AuthContext";

type NavItem = {
  to: string;
  label: string;
  permission?: string;
  icon: typeof Activity;
};

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Activity },
  { to: "/recognition/new", label: "New Recognition", icon: FileSearch, permission: "job:create" },
  { to: "/recognition/jobs/demo", label: "Job Detail", icon: ClipboardList, permission: "job:read" },
  { to: "/schema", label: "Schema Studio", icon: DatabaseZap, permission: "schema:read" },
  { to: "/evaluation", label: "Evaluation", icon: FlaskConical, permission: "evaluation:manage" },
  { to: "/feedback", label: "Feedback Samples", icon: MessageSquareText, permission: "feedback:create" },
  { to: "/providers", label: "Provider Settings", icon: Settings2, permission: "provider:manage" },
  { to: "/writeback", label: "Writeback", icon: SendToBack, permission: "writeback:execute" },
  { to: "/trace", label: "Agent Trace", icon: Network, permission: "job:read" },
  { to: "/audit", label: "Audit Log", icon: History, permission: "audit:read" },
  { to: "/docs", label: "Dataset Spec", icon: ScrollText }
];

export function AppShell() {
  const { auth, hasPermission, logout, api } = useAuth();
  const navigate = useNavigate();
  const visibleNavItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" data-guide="navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <div>
            <strong>Medical Record Agent</strong>
            <span>Clinical Studio</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="主导航">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-section">
            <PanelLeft size={18} aria-hidden="true" />
            <div>
              <span className="topbar-label">API</span>
              <strong>{api.baseUrl}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="status-pill status-pill-success">Mock Provider Ready</span>
            <StepGuide />
            <div className="user-chip" aria-label="当前用户">
              <span>{auth?.user.displayName ?? "演示用户"}</span>
              <small>{auth?.roles.join(", ")}</small>
            </div>
            <button className="icon-button" type="button" onClick={handleLogout} aria-label="退出登录">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
