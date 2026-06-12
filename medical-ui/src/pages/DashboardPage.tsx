import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Spin, Button, Message } from '@arco-design/web-react';
import { IconFile, IconRefresh, IconStorage, IconExclamation } from '@arco-design/web-react/icon';
import { useJobs } from '../hooks/useJobs';
import { useProviders } from '../hooks/useProviders';
import MetricCard from '../components/MetricCard';
import StatusTag from '../components/StatusTag';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob } from '../api/types';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: jobsData, isLoading: jobsLoading, error: jobsError, refetch } = useJobs(20);
  const { data: providersData, isLoading: providersLoading } = useProviders();

  const jobs = jobsData?.items || [];
  const providers = providersData?.items || [];

  // Compute metrics from real data
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayJobs = jobs.filter((j) => new Date(j.createdAt) >= todayStart).length;
  const needsReview = jobs.filter((j) => j.status === 'needs_review' || j.status === 'partial_completed').length;
  const onlineProviders = providers.filter((p) => p.status === 'active').length;

  if (jobsError) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

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
      width: 100,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: RecognitionJob) => (
        <Button type="text" size="small" onClick={() => navigate(`/jobs/${record.id}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      {/* Metric Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <MetricCard
          title="今日任务"
          value={todayJobs}
          icon={<IconFile style={{ fontSize: 24 }} />}
          color="var(--color-primary)"
          loading={jobsLoading}
        />
        <MetricCard
          title="待复核"
          value={needsReview}
          icon={<IconExclamation style={{ fontSize: 24 }} />}
          color="var(--color-warning)"
          loading={jobsLoading}
        />
        <MetricCard
          title="Provider 在线"
          value={onlineProviders}
          icon={<IconStorage style={{ fontSize: 24 }} />}
          color="var(--color-success)"
          loading={providersLoading}
        />
      </div>

      {/* Recent Jobs */}
      <div style={{
        background: 'var(--color-bg-white)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>最近任务</h3>
          <Button type="text" size="small" onClick={() => navigate('/jobs')}>
            查看全部 →
          </Button>
        </div>

        {jobsLoading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<IconFile style={{ fontSize: 48 }} />}
            title="暂无识别任务"
            description="上传医疗文档，AI 自动识别并提取结构化数据"
            action={{
              label: '上传文档开始识别',
              onClick: () => navigate('/recognition/new'),
              icon: <IconFile />,
            }}
          />
        ) : (
          <Table
            columns={columns}
            data={jobs}
            rowKey="id"
            pagination={false}
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

export default DashboardPage;
