import React, { useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import {
  IconDashboard,
  IconList,
  IconFile,
  IconSettings,
  IconStorage,
  IconExperiment,
  IconSafe,
  IconUser,
} from '@arco-design/web-react/icon';
import { useAuthStore } from '../stores/authStore';
import { useLogout } from '../hooks/useAuth';

const NAV_ITEMS = [
  { key: '/', label: '工作台', icon: <IconDashboard /> },
  { key: '/jobs', label: '任务列表', icon: <IconList /> },
  { key: '/recognition/new', label: '新建识别', icon: <IconFile /> },
  { key: '/schemas', label: 'Schema 管理', icon: <IconSettings /> },
  { key: '/providers', label: 'Provider', icon: <IconStorage /> },
  { key: '/evaluation', label: '评测中心', icon: <IconExperiment /> },
  { key: '/audit', label: '审计日志', icon: <IconSafe /> },
];

const PAGE_TITLES: Record<string, string> = {
  '/': '工作台',
  '/jobs': '任务列表',
  '/recognition/new': '新建识别',
  '/schemas': 'Schema 管理',
  '/providers': 'Provider 管理',
  '/evaluation': '评测中心',
  '/audit': '审计日志',
};

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();

  const activeKey = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return '/';
    const match = NAV_ITEMS.find((item) => item.key !== '/' && path.startsWith(item.key));
    return match?.key || '/';
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    if (path.startsWith('/jobs/')) return '任务详情';
    return 'Medical Record Agent';
  }, [location.pathname]);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 'var(--sidebar-width)',
        background: 'var(--color-bg-white)',
        boxShadow: 'var(--shadow-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--color-primary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}>
              M
            </span>
            医疗记录识别
          </div>
        </div>

        {/* Navigation */}
        <div style={{ flex: 1, padding: '12px 8px', overflow: 'auto' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  marginBottom: 2,
                  fontSize: 14,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                  background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 18, display: 'flex' }}>{item.icon}</span>
                {item.label}
              </div>
            );
          })}
        </div>

        {/* User Info */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--color-primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary)',
            flexShrink: 0,
          }}>
            <IconUser />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.displayName || 'Admin'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || 'admin'}
            </div>
          </div>
          <Button
            size="mini"
            type="text"
            onClick={handleLogout}
            style={{ flexShrink: 0 }}
          >
            退出
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <div style={{
          height: 'var(--topbar-height)',
          background: 'var(--color-bg-white)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          flexShrink: 0,
        }}>
          <h1 style={{
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'var(--font-heading)',
            color: 'var(--color-text)',
          }}>
            {pageTitle}
          </h1>
        </div>

        {/* Page Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          background: 'var(--color-bg)',
        }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
