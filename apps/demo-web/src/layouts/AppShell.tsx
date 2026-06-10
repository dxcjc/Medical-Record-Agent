import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Breadcrumb, Button, Card, Drawer, Input, Message, Space, Tag, Tooltip } from "@arco-design/web-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { isMockProviderItem } from "../api/normalizers";
import type { ApiProviderItem } from "../api/types";
import { StepGuide } from "../components/StepGuide";
import { useAuth } from "../auth/AuthContext";
import { AppIcon, actionIcons, commonUiIcons, navigationIcons, statusIcons } from "../icons/appIcons";

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

export type NavigationSearchItem = {
  to: string;
  label: string;
  keywords: string[];
};

export type AppNotification = {
  id: string;
  title: string;
  detail: string;
  route: string;
  tone: "success" | "warning" | "danger" | "info";
};

type TopbarProviderBadgeStatus = "success" | "warning" | "default" | "processing" | "error";

type TopbarProviderStatus = {
  badgeStatus: TopbarProviderBadgeStatus;
  text: string;
};

type ProviderStatusLoadState =
  | { status: "loading"; providers: ApiProviderItem[] }
  | { status: "success"; providers: ApiProviderItem[] }
  | { status: "error"; providers: ApiProviderItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { to: "/", label: "识别看板", icon: navigationIcons.dashboard, guide: "environment-status" },
      { to: "/recognition/new", label: "新建识别", icon: navigationIcons.newRecognition, permission: "job:create", guide: "new-recognition" },
      { to: "/recognition/jobs/demo", label: "任务详情", icon: navigationIcons.jobDetail, permission: "job:read", guide: "field-evidence" }
    ]
  },
  {
    label: "Operations",
    items: [
      { to: "/schema", label: "Schema 管理", icon: navigationIcons.schemaStudio, permission: "schema:read", guide: "schema-publish" },
      { to: "/evaluation", label: "评测中心", icon: navigationIcons.evaluation, permission: "evaluation:manage", guide: "evaluation" },
      { to: "/feedback", label: "反馈样本", icon: navigationIcons.feedbackSamples, permission: "feedback:create", guide: "feedback" },
      { to: "/trace", label: "Agent Trace", icon: navigationIcons.agentTrace, permission: "job:read" },
      { to: "/audit", label: "审计日志", icon: navigationIcons.auditLog, permission: "audit:read" },
      { to: "/writeback", label: "写回控制", icon: navigationIcons.writeback, permission: "writeback:execute", guide: "writeback" }
    ]
  },
  {
    label: "Settings",
    items: [
      { to: "/providers", label: "Provider 设置", icon: navigationIcons.providerSettings, permission: "provider:manage" },
      { to: "/docs", label: "数据集规范", icon: navigationIcons.datasetSpec }
    ]
  }
];

const breadcrumbLabels = new Map<string, string>([
  ["/", "识别看板"],
  ["/recognition", "识别任务"],
  ["/recognition/new", "新建识别"],
  ["/recognition/jobs", "任务详情"],
  ["/schema", "Schema 管理"],
  ["/evaluation", "评测中心"],
  ["/feedback", "反馈样本"],
  ["/providers", "Provider 设置"],
  ["/writeback", "写回控制"],
  ["/trace", "Agent Trace"],
  ["/audit", "审计日志"],
  ["/docs", "数据集规范"]
]);

const notificationItems: AppNotification[] = [
  {
    id: "writeback-review",
    title: "写回任务等待确认",
    detail: "存在需要复核人员确认的写回候选，请进入写回控制查看 green 条件。",
    route: "/writeback",
    tone: "warning"
  },
  {
    id: "provider-health",
    title: "Provider 健康检查可用",
    detail: "Provider 设置页已接入真实保存和 health check，可刷新后查看后端状态。",
    route: "/providers",
    tone: "info"
  },
  {
    id: "schema-risk",
    title: "Schema 生产变更需确认",
    detail: "发布、停用、回滚会影响生产识别管道，执行前需要二次确认。",
    route: "/schema",
    tone: "danger"
  }
];

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

export function findNavigationSearchTarget(query: string, items: NavigationSearchItem[]) {
  const keyword = normalizeSearchTerm(query);
  if (!keyword) {
    return null;
  }

  return (
    items.find((item) => item.label.toLowerCase() === keyword || item.keywords.some((candidate) => candidate.toLowerCase() === keyword)) ??
    items.find((item) => item.label.toLowerCase().includes(keyword) || item.keywords.some((candidate) => candidate.toLowerCase().includes(keyword))) ??
    null
  );
}

export function markNotificationRead(readNotificationIds: string[], id: string) {
  return readNotificationIds.includes(id) ? readNotificationIds : [...readNotificationIds, id];
}

export function markAllNotificationsRead(items: AppNotification[]) {
  return items.map((item) => item.id);
}

export function countUnreadNotifications(items: AppNotification[], readNotificationIds: string[]) {
  return items.filter((item) => !readNotificationIds.includes(item.id)).length;
}

export function openNotificationTarget(item: AppNotification, readNotificationIds: string[]) {
  return {
    route: item.route,
    readNotificationIds: markNotificationRead(readNotificationIds, item.id)
  };
}

function isEnabledRealProvider(provider: ApiProviderItem, kind: "ocr" | "llm") {
  return provider.kind === kind && provider.enabled !== false && !isMockProviderItem(provider);
}

export function describeTopbarProviderStatus(
  providers: ApiProviderItem[],
  loadStatus: ProviderStatusLoadState["status"] = "success"
): TopbarProviderStatus {
  if (loadStatus === "loading") {
    return {
      badgeStatus: "processing",
      text: "Provider 状态读取中"
    };
  }

  const hasRealOcr = providers.some((provider) => isEnabledRealProvider(provider, "ocr"));
  const hasRealLlm = providers.some((provider) => isEnabledRealProvider(provider, "llm"));

  if (hasRealOcr && hasRealLlm) {
    return {
      badgeStatus: "success",
      text: "Provider 已连接"
    };
  }

  return {
    badgeStatus: loadStatus === "error" ? "error" : "warning",
    text: "Provider 待配置"
  };
}

function getNotificationToneColor(tone: AppNotification["tone"]) {
  if (tone === "success") {
    return "green";
  }
  if (tone === "warning") {
    return "orange";
  }
  if (tone === "danger") {
    return "red";
  }

  return "arcoblue";
}

export function AppShell() {
  const { auth, hasPermission, logout, api } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [providerStatusLoadState, setProviderStatusLoadState] = useState<ProviderStatusLoadState>({
    status: "loading",
    providers: []
  });
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
  const navigationSearchItems = useMemo<NavigationSearchItem[]>(
    () =>
      visibleNavGroups.flatMap((group) =>
        group.items.map((item) => ({
          to: item.to,
          label: item.label,
          keywords: [group.label, item.label, item.to, item.permission ?? ""].filter(Boolean)
        }))
      ),
    [visibleNavGroups]
  );
  const unreadNotificationCount = countUnreadNotifications(notificationItems, readNotificationIds);

  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let isActive = true;

    async function loadProviderStatus() {
      setProviderStatusLoadState((current) => ({
        status: "loading",
        providers: current.providers
      }));

      try {
        const response = await api.listProviders();
        if (!isActive) {
          return;
        }
        setProviderStatusLoadState({
          status: "success",
          providers: response.items
        });
      } catch {
        if (!isActive) {
          return;
        }
        setProviderStatusLoadState((current) => ({
          status: "error",
          providers: current.providers
        }));
      }
    }

    void loadProviderStatus();

    return () => {
      isActive = false;
    };
  }, [api]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function handleTopbarSearch(value: string) {
    const target = findNavigationSearchTarget(value, navigationSearchItems);
    if (!target) {
      Message.warning(value.trim().length > 0 ? `未找到与“${value}”匹配的页面` : "请输入搜索关键词");
      return;
    }

    setSearchTerm("");
    navigate(target.to);
    Message.success(`已打开 ${target.label}`);
  }

  function markNotificationAsRead(id: string) {
    setReadNotificationIds((current) => markNotificationRead(current, id));
  }

  function openNotification(item: AppNotification) {
    const target = openNotificationTarget(item, readNotificationIds);
    setReadNotificationIds(target.readNotificationIds);
    setIsNotificationDrawerOpen(false);
    navigate(target.route);
  }

  const userName = auth?.user.displayName ?? "演示用户";
  const userRoles = auth?.roles.join(", ") || "临床审核";
  const topbarProviderStatus = describeTopbarProviderStatus(
    providerStatusLoadState.providers,
    providerStatusLoadState.status
  );

  const sidebarContent = (
    <>
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <AppIcon icon={navigationIcons.brand} size="md" />
        </div>
        <div className="brand-copy">
          <strong>病历识别 Agent</strong>
          <span>Clinical AI Studio</span>
        </div>
        <Button
          className="sidebar-close u-only-mobile"
          type="text"
          icon={<AppIcon icon={commonUiIcons.close} />}
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-label="关闭导航菜单"
        />
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
          <Avatar size={32}>{userName.slice(0, 1)}</Avatar>
          <div>
            <span>{userName}</span>
            <small>{userRoles}</small>
          </div>
        </div>
        <Button className="sidebar-logout" type="text" icon={<AppIcon icon={actionIcons.logout} size="sm" />} onClick={handleLogout}>
          退出
        </Button>
      </div>
    </>
  );

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        跳到主内容
      </a>
      <aside className="app-sidebar sidebar" data-guide="navigation">
        {sidebarContent}
      </aside>
      <Drawer
        className="mobile-sidebar-drawer"
        width={292}
        placement="left"
        footer={null}
        closable={false}
        visible={isMobileDrawerOpen}
        onCancel={() => setIsMobileDrawerOpen(false)}
      >
        <aside className="app-sidebar sidebar mobile-sidebar" data-guide="navigation">
          {sidebarContent}
        </aside>
      </Drawer>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-main">
            <Tooltip content="打开导航">
              <Button className="u-only-mobile topbar-icon-button" type="text" icon={<AppIcon icon={commonUiIcons.menu} />} onClick={() => setIsMobileDrawerOpen(true)} aria-label="打开导航菜单" />
            </Tooltip>
            <Tooltip content={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}>
              <Button
                className="u-hide-mobile topbar-icon-button"
                type="text"
                icon={<AppIcon icon={commonUiIcons.collapseSidebar} />}
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                aria-label={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              />
            </Tooltip>
            <div className="topbar-title-stack">
              <Breadcrumb className="breadcrumbs" aria-label="面包屑导航">
                {breadcrumbs.map((crumb, index) => (
                  <Breadcrumb.Item key={`${crumb.label}-${index}`}>
                    {crumb.to ? <NavLink to={crumb.to}>{crumb.label}</NavLink> : crumb.label}
                  </Breadcrumb.Item>
                ))}
              </Breadcrumb>
              <span className="topbar-label topbar-meta">API {api.baseUrl}</span>
            </div>
          </div>
          <Input.Search
            className="topbar-search u-hide-mobile"
            aria-label="全局页面搜索"
            placeholder="搜索任务、字段、Schema"
            searchButton="搜索"
            value={searchTerm}
            onChange={setSearchTerm}
            onSearch={handleTopbarSearch}
          />
          <Space className="topbar-actions" size={12}>
            <Tooltip content="查看通知">
              <Badge count={unreadNotificationCount} dot={false}>
                <Button
                  className="topbar-icon-button"
                  type="text"
                  icon={<AppIcon icon={statusIcons.info} />}
                  aria-label="查看通知"
                  onClick={() => setIsNotificationDrawerOpen(true)}
                />
              </Badge>
            </Tooltip>
            <Badge className="topbar-provider-status" status={topbarProviderStatus.badgeStatus} text={topbarProviderStatus.text} />
            <Tag className="topbar-product-tag" color="arcoblue">医疗 AI 工作台</Tag>
            <span className="topbar-guide">
              <StepGuide />
            </span>
            <Avatar className="topbar-user-avatar" size={32}>{userName.slice(0, 1)}</Avatar>
          </Space>
        </header>
        <main id="main-content" className="workspace-main u-container">
          <Outlet />
        </main>
      </div>
      <Drawer
        width={360}
        title="通知中心"
        footer={null}
        visible={isNotificationDrawerOpen}
        onCancel={() => setIsNotificationDrawerOpen(false)}
      >
        <Space className="notification-actions" direction="vertical" size={12}>
          <Button type="outline" disabled={unreadNotificationCount === 0} onClick={() => setReadNotificationIds(markAllNotificationsRead(notificationItems))}>
            全部标记已读
          </Button>
          {notificationItems.map((item) => {
            const isRead = readNotificationIds.includes(item.id);
            return (
              <Card className="notification-card" key={item.id}>
                <Space direction="vertical" size={8}>
                  <Space>
                    <Tag color={getNotificationToneColor(item.tone)}>{isRead ? "已读" : "未读"}</Tag>
                    <strong>{item.title}</strong>
                  </Space>
                  <p>{item.detail}</p>
                  <Button type="primary" onClick={() => openNotification(item)}>
                    打开相关页面
                  </Button>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Drawer>
    </div>
  );
}
