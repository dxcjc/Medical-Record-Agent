import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, Button, Space, Typography } from '@arco-design/web-react';
import { IconRefresh, IconSearch } from '@arco-design/web-react/icon';
import { useJobs } from '../hooks/useJobs';
import StatusTag from '../components/StatusTag';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob } from '../api/types';

const { Option } = Select;
const { Title, Text } = Typography;

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
        <Typography.Text code>{id.slice(0, 16)}...</Typography.Text>
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
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: RecognitionJob) => (
        <Button
          type="text"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/jobs/${record.id}`);
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--color-danger-6)', marginBottom: 16 }}>加载失败</p>
          <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="任务列表"
      extra={
        <Space>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            prefix={<IconSearch />}
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
          <Text type="secondary" style={{ fontSize: 13 }}>
            共 {filteredJobs.length} 条
          </Text>
          <Button type="text" icon={<IconRefresh />} onClick={() => refetch()}>
            刷新
          </Button>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span style={{ color: 'var(--color-text-3)' }}>加载中...</span>
        </div>
      ) : filteredJobs.length === 0 ? (
        <EmptyState
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
          pagination={{ pageSize: 20 }}
          size="small"
          onRow={(record) => ({
            onClick: () => navigate(`/jobs/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      )}
    </Card>
  );
};

export default JobListPage;
