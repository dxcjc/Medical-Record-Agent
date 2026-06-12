import React, { useMemo } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Layout as ArcoLayout, Menu, Breadcrumb, Avatar, Button, Dropdown, Typography } from '@arco-design/web-react';
import {
  IconDashboard,
  IconList,
  IconFile,
  IconSettings,
  IconStorage,
  IconExperiment,
  IconSafe,
  IconUser,
  IconPoweroff,
} from '@arco-design/web-react/icon';
import { useAuthStore } from '../stores/authStore';
import { useLogout } from '../hooks/useAuth';

const { Header, Sider, Content } = ArcoLayout;
const { Text } = Typography;

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

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();

  const selectedKey = useMemo(() => {
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

  const dropList = (
    <Menu>
      <Menu.Item key="logout" onClick={handleLogout}>
        <IconPoweroff style={{ marginRight: 8 }} />
        退出登录
      </Menu.Item>
    </Menu>
  );

  return (
    <ArcoLayout style={{ height: '100vh' }}>
      <Sider
        width={240}
        style={{
          background: '#fff',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderBottom: '1px solid var(--color-border)',
            fontWeight: 700,
            fontSize: 16,
            color: 'var(--color-primary)',
            gap: 10,
          }}
        >
          <Avatar size={32} style={{ backgroundColor: 'var(--color-primary)', fontSize: 14 }}>
            M
          </Avatar>
          医疗记录识别
        </div>

        {/* Menu */}
        <Menu
          selectedKeys={[selectedKey]}
          onClickMenuItem={(key) => navigate(key)}
          style={{ width: '100%', borderRight: 'none' }}
        >
          {NAV_ITEMS.map((item) => (
            <Menu.Item key={item.key}>
              {item.icon}
              {item.label}
            </Menu.Item>
          ))}
        </Menu>
      </Sider>

      <ArcoLayout>
        <Header
          style={{
            height: 56,
            background: '#fff',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <Breadcrumb>
            <Breadcrumb.Item>首页</Breadcrumb.Item>
            <Breadcrumb.Item>{pageTitle}</Breadcrumb.Item>
          </Breadcrumb>

          <Dropdown droplist={dropList} position="br">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size={28} style={{ backgroundColor: 'var(--color-primary-light-3)', color: 'var(--color-primary)' }}>
                <IconUser />
              </Avatar>
              <Text style={{ fontSize: 13 }}>{user?.displayName || 'Admin'}</Text>
            </div>
          </Dropdown>
        </Header>

        <Content
          style={{
            padding: 24,
            background: '#F7F8FA',
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </ArcoLayout>
    </ArcoLayout>
  );
};

export default AppLayout;
