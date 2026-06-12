import React from 'react';
import { Table, Button, Tag } from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import { useAuditLog } from '../hooks/useAudit';
import EmptyState from '../components/EmptyState';
import type { AuditEntry } from '../api/types';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
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

const AuditPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useAuditLog(50);

  const entries = data?.items || [];

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => (
        <span title={new Date(t).toLocaleString('zh-CN')}>
          {formatRelativeTime(t)}
        </span>
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
      title: '操作',
      dataIndex: 'action',
      width: 180,
    },
    {
      title: '对象类型',
      dataIndex: 'objectType',
      width: 120,
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (result: string) => (
        <Tag
          color={result === 'success' ? 'green' : 'red'}
          size="small"
        >
          {result === 'success' ? '成功' : '失败'}
        </Tag>
      ),
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
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--color-bg-white)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          共 {entries.length} 条记录
        </span>
        <Button icon={<IconRefresh />} onClick={() => refetch()} size="small">
          刷新
        </Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>加载中...</span>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="暂无审计记录"
          description="系统审计日志为空"
          action={{ label: '刷新', onClick: () => refetch() }}
        />
      ) : (
        <Table
          columns={columns}
          data={entries}
          rowKey="id"
          pagination={{ pageSize: 20, size: 'mini' }}
          size="small"
        />
      )}
    </div>
  );
};

export default AuditPage;
