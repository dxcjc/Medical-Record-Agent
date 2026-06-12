import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Select, Spin, Button, Tag } from '@arco-design/web-react';
import { IconRefresh, IconFile } from '@arco-design/web-react/icon';
import { useJobs } from '../hooks/useJobs';
import StatusTag from '../components/StatusTag';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob, RecognitionJobStatus } from '../api/types';

const Option = Select.Option;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '识别中' },
  { value: 'completed', label: '已完成' },
  { value: 'needs_review', label: '待复核' },
  { value: 'partial_completed', label: '部分完成' },
  { value: 'failed', label: '失败' },
  { value: 'writeback_completed', label: '已回写' },
  { value: 'writeback_failed', label: '回写失败' },
];

const JobListPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, error, refetch } = useJobs(100);

  const jobs = data?.items || [];
  const filteredJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter((j) => j.status === statusFilter);
  }, [jobs, statusFilter]);

  const columns = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      width: 200,
      render: (id: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id.slice(0, 16)}...</span>
      ),
    },
    {
      title: 'Schema',
      dataIndex: 'schemaKey',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: 'Provider',
      width: 150,
      render: (_: unknown, record: RecognitionJob) => {
        const cfg = record.providerConfig as Record<string, unknown>;
        return <span>{(cfg?.providerKey as string) || (cfg?.ocrProviderKey as string) || '-'}</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: RecognitionJob) => (
        <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${record.id}`); }}>
          查看
        </Button>
      ),
    },
  ];

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        background: 'var(--color-bg-white)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>状态筛选：</span>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 160 }}
          size="small"
        >
          {STATUS_OPTIONS.map((opt) => (
            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
          ))}
        </Select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          共 {filteredJobs.length} 条
        </span>
        <Button type="text" size="small" icon={<IconRefresh />} onClick={() => refetch()}>
          刷新
        </Button>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--color-bg-white)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            icon={<IconFile style={{ fontSize: 48 }} />}
            title="暂无任务"
            action={{
              label: '新建识别',
              onClick: () => navigate('/recognition/new'),
            }}
          />
        ) : (
          <Table
            columns={columns}
            data={filteredJobs}
            rowKey="id"
            pagination={{ pageSize: 20, size: 'mini' }}
            size="small"
            onRow={(record) => ({
              onClick: () => navigate(`/jobs/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </div>
  );
};

export default JobListPage;
