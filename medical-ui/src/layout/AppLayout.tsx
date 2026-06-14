import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, Breadcrumb, Button, Layout, Message } from '@arco-design/web-react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  IconBeaker,
  IconClipboardList,
  IconDashboard,
  IconDatabase,
  IconFileText,
  IconFileUp,
  IconLogOut,
  IconMenu,
  IconMessageSquare,
  IconMoon,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconRepeat,
  IconShield,
  IconSun,
  IconUserRound,
} from '../icons/appIcons';
import { useAppTheme } from '../theme/AppThemeProvider';
import { useAuthStore } from '../stores/authStore';
import { useLogout } from '../hooks/useAuth';
import type { AppIcon } from '../icons/appIcons';

const { Sider, Header, Content } = Layout;

type NavItem = {
  key: string;
  label: string;
  icon: AppIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: '概览',
    items: [
      { key: '/', label: '工作台', icon: IconDashboard },
    ],
  },
  {
    label: '识别管理',
    items: [
      { key: '/jobs', label: '任务列表', icon: IconClipboardList },
      { key: '/recognition/new', label: '新建识别', icon: IconFileUp },
    ],
  },
  {
    label: '配置管理',
    items: [
      { key: '/schemas', label: 'Schema 管理', icon: IconFileText },
      { key: '/providers', label: 'Provider', icon: IconDatabase },
    ],
  },
  {
    label: '质量保障',
    items: [
      { key: '/evaluation', label: '评测中心', icon: IconBeaker },
      { key: '/audit', label: '审计日志', icon: IconShield },
      { key: '/feedback', label: '反馈管理', icon: IconMessageSquare },
      { key: '/writeback', label: '回写管理', icon: IconRepeat },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/': '工作台',
  '/jobs': '任务列表',
  '/recognition/new': '新建识别',
  '/schemas': 'Schema 管理',
  '/providers': 'Provider',
  '/evaluation': '评测中心',
  '/audit': '审计日志',
  '/feedback': '反馈管理',
  '/writeback': '回写管理',
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();
  const { mode, toggleMode } = useAppTheme();

  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [message, messageContextHolder] = Message.useMessage();

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const syncViewport = (matches: boolean) => {
      setIsMobile(matches);
      if (matches) {
        setCollapsed(false);
      } else {
        setMobileNavOpen(false);
      }
    };
    syncViewport(mql.matches);
    const handler = (e: MediaQueryListEvent) => syncViewport(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const activeKey = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return '/';
    const allItems = navGroups.flatMap((g) => g.items);
    const match = allItems.find((item) => item.key !== '/' && path.startsWith(item.key));
    return match?.key || '/';
  }, [location.pathname]);

  const activeLabel = useMemo(() => {
    const allItems = navGroups.flatMap((g) => g.items);
    return allItems.find((item) => item.key === activeKey)?.label;
  }, [activeKey]);

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    if (path.startsWith('/jobs/')) return '任务详情';
    return '医疗记录识别';
  }, [location.pathname]);

  // 根据当前路由匹配导航分组，作为面包屑第一级
  const breadcrumbScope = useMemo(() => {
    const path = location.pathname;
    for (const group of navGroups) {
      if (group.items.some((item) => item.key !== '/' && path.startsWith(item.key))) {
        return group.label;
      }
    }
    return '概览';
  }, [location.pathname]);

  // 动态设置浏览器标签页标题
  useEffect(() => {
    document.title = `${pageTitle} - 医疗记录智能识别`;
  }, [pageTitle]);

  function handleNavClick(key: string) {
    navigate(key);
    setMobileNavOpen(false);
  }

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    navigate('/login');
  };

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      {messageContextHolder}
      {isMobile && mobileNavOpen && (
        <button
          type="button"
          aria-label="关闭导航菜单"
          className="app-sider-backdrop"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sider
        className={`app-sider${!isMobile ? ' app-sider-tablet' : ''}${collapsed && !isMobile ? ' app-sider-collapsed' : ''}${isMobile ? ` app-sider-overlay${mobileNavOpen ? ' app-sider-overlay-open' : ''}` : ''}`}
        collapsed={isMobile ? false : collapsed}
        width={240}
        collapsedWidth={64}
        collapsible={false}
      >
        <div className={`brand-block${collapsed && !isMobile ? ' brand-block-collapsed' : ''}`}>
          <div className="brand-logo" aria-hidden="true">
            M
          </div>
          {(!collapsed || isMobile) && (
            <div className="brand-copy">
              <strong>Medical Agent</strong>
              <span>医疗记录智能识别</span>
            </div>
          )}
        </div>
        <nav className={`nav-group-list${collapsed && !isMobile ? ' nav-group-list-collapsed' : ''}`} aria-label="主导航">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              {(!collapsed || isMobile) && <div className="nav-group-title">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    title={collapsed ? item.label : undefined}
                    className={`nav-item-button${isActive ? ' nav-item-button-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleNavClick(item.key)}
                  >
                    <Icon size={17} />
                    {(!collapsed || isMobile) && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sider-footer">
          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
            title={collapsed && !isMobile ? '退出登录' : undefined}
          >
            <IconLogOut size={17} />
            {(!collapsed || isMobile) && <span>退出登录</span>}
          </button>
          {!isMobile && (
            <button
              type="button"
              className="collapse-button"
              aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <IconPanelLeftOpen size={17} /> : <IconPanelLeftClose size={17} />}
              {!collapsed && <span>收起侧栏</span>}
            </button>
          )}
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-left">
            {isMobile && (
              <button
                type="button"
                className="mobile-menu-button"
                aria-label="打开导航菜单"
                onClick={() => setMobileNavOpen(true)}
              >
                <IconMenu size={20} />
              </button>
            )}
            <Breadcrumb className="app-breadcrumb">
              <Breadcrumb.Item key="scope">{breadcrumbScope}</Breadcrumb.Item>
              <Breadcrumb.Item key="page">{pageTitle}</Breadcrumb.Item>
            </Breadcrumb>
          </div>
          <div className="app-header-actions">
            <Button
              className="topbar-icon-button"
              icon={mode === 'dark' ? <IconSun size={17} /> : <IconMoon size={17} />}
              aria-label={mode === 'dark' ? '切换浅色主题' : '切换暗色主题'}
              onClick={toggleMode}
            />
            <Avatar className="topbar-avatar">{user?.displayName?.charAt(0) ?? 'A'}</Avatar>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
