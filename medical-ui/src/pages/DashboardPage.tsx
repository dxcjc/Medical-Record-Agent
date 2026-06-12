import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, Statistic, Table, Button, Space, Spin, Typography } from '@arco-design/web-react';
import {
  IconFile,
  IconRefresh,
  IconStorage,
  IconExclamation,
  IconPlus,
} from '@arco-design/web-react/icon';
import { useJobs } from '../hooks/useJobs';
import { useProviders } from '../hooks/useProviders';
import StatusTag from '../components/StatusTag';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob } from '../api/types';

const { Row, Col } = Grid;
const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: jobsData, isLoading: jobsLoading, error: jobsError, refetch } = useJobs(20);
  const { data: providersData, isLoading: providersLoading } = useProviders();

  const jobs = jobsData?.items || [];
  const providers = providersData?.items || [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayJobs = jobs.filter((j) => j.createdAt && new Date(j.createdAt) >= todayStart).length;
  const needsReview = jobs.filter((j) => j.status === 'needs_review' || j.status === 'partial_completed').length;
  const onlineProviders = providers.filter((p) => p.status === 'active').length;

  if (jobsError) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--color-danger-6)', marginBottom: 16 }}>加载失败</p>
          <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  const columns = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      width: 200,
      render: (id: string) => (
        <Typography.Text code copyable={false}>{id.slice(0, 16)}...</Typography.Text>
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
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title heading={5} style={{ margin: 0 }}>工作台</Title>
        <Button type="primary" icon={<IconPlus />} onClick={() => navigate('/recognition/new')}>
          新建识别
        </Button>
      </div>

      {/* KPI Cards */}
      <Row gutter={16}>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="今日任务"
              value={todayJobs}
              loading={jobsLoading}
              prefix={<IconFile style={{ color: 'var(--color-primary-6)' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="待复核"
              value={needsReview}
              loading={jobsLoading}
              prefix={<IconExclamation style={{ color: 'var(--color-warning-6)' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="Provider 在线"
              value={onlineProviders}
              loading={providersLoading}
              prefix={<IconStorage style={{ color: 'var(--color-success-6)' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="总任务数"
              value={jobs.length}
              loading={jobsLoading}
              prefix={<IconFile style={{ color: 'var(--color-link-6)' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Recent Jobs */}
      <Card
        title="最近任务"
        extra={
          <Button type="text" size="small" onClick={() => navigate('/jobs')}>
            查看全部
          </Button>
        }
      >
        {jobsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="暂无识别任务"
            description="上传医疗文档，AI 自动识别并提取结构化数据"
            action={{
              label: '上传文档开始识别',
              onClick: () => navigate('/recognition/new'),
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
      </Card>
    </Space>
  );
};

export default DashboardPage;
