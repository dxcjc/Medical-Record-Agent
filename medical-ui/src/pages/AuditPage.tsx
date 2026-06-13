import { useState } from 'react';
import { Card, Table, Button, Typography, Space, Tag } from '@arco-design/web-react';
import { useAuditLog } from '../hooks/useAudit';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import type { AuditEntry } from '../api/types';

const { Text } = Typography;

const ACTION_LABELS: Record<string, string> = {
  'auth:login': '登录',
  'auth:logout': '登出',
  'job:create': '创建任务',
  'job:read': '查看任务',
  'job:delete': '删除任务',
  'job:rerun': '重跑任务',
  'result:read': '查看结果',
  'schema:draft': '编辑Schema草稿',
  'schema:publish': '发布Schema',
  'schema:deactivate': '停用Schema',
  'schema:rollback': '回滚Schema',
  'schema:read': '查看Schema',
  'file:upload': '上传文件',
  'file:read': '查看文件',
  'provider:save': '保存Provider',
  'provider:default': '设为默认Provider',
  'provider:health': '检查Provider健康',
  'evaluation:create': '创建评测',
  'evaluation:run': '运行评测',
  'evaluation:read': '查看评测',
  'feedback:create': '提交反馈',
  'feedback:read': '查看反馈',
  'writeback:execute': '执行回写',
  'audit:read': '查看审计日志',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  if (!dateStr) return '-';
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds} 秒前`;
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleString('zh-CN');
}

function getActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // 尝试模糊匹配
  for (const [key, label] of Object.entries(ACTION_LABELS)) {
    if (action.includes(key) || key.includes(action)) return label;
  }
  return action;
}

export default function AuditPage() {
  const { data, isLoading, error, refetch } = useAuditLog(50);

  const entries = data?.items || [];

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => (
        <Text title={new Date(t).toLocaleString('zh-CN')}>
          {formatRelativeTime(t)}
        </Text>
      ),
    },
    {
      title: '操作人',
      width: 150,
      render: (_: unknown, record: AuditEntry) => (
        <span>{record.actorUser?.displayName || record.actorUserId || '-'}</span>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 160,
      render: (action: string) => {
        const label = getActionLabel(action);
        // 如果是翻译后的中文，显示为 Tag
        if (label !== action) {
          return <Tag color="blue" size="small">{label}</Tag>;
        }
        return <span>{action}</span>;
      },
    },
    {
      title: '对象类型',
      dataIndex: 'objectType',
      width: 120,
    },
    {
      title: '对象ID',
      dataIndex: 'objectId',
      width: 140,
      render: (id: string) => id ? <Text code style={{ fontSize: 12 }}>{id.slice(0, 12)}</Text> : '-',
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (result: string) => <StatusTag status={result} />,
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      width: 140,
      render: (ip: string) => ip || '-',
    },
  ];

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="质量保障"
        title="审计日志"
        subtitle="系统操作审计记录"
        onRefresh={() => refetch()}
      />

      <Card>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="暂无审计记录"
            description="系统审计日志为空"
            action={{ label: '刷新', onClick: () => refetch() }}
          />
        ) : (
          <Table columns={columns} data={entries} rowKey="id" pagination={{ pageSize: 20, showTotal: true }} size="small" />
        )}
      </Card>
    </div>
  );
}
