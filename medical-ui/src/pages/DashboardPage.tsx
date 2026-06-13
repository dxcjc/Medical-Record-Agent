import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, Table, Button, Spin, Typography } from '@arco-design/web-react';
import {
  IconActivity,
  IconAlertTriangle,
  IconBarChart,
  IconCheckCircle,
  IconClipboardList,
  IconDatabase,
  IconFileUp,
} from '../icons/appIcons';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useJobs } from '../hooks/useJobs';
import { useProviders } from '../hooks/useProviders';
import StatusTag from '../components/StatusTag';
import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob } from '../api/types';

const { Row, Col } = Grid;
const { Text } = Typography;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: statsData, isLoading: statsLoading, error: statsError } = useDashboardStats();
  // Fallback: 用 jobs + providers 端点自行计算
  const { data: jobsData, isLoading: jobsLoading, error: jobsError, refetch } = useJobs(20);
  const { data: providersData, isLoading: providersLoading } = useProviders();

  const jobs = jobsData?.items || [];
  const providers = providersData?.items || [];

  // 优先使用 stats API；如果失败则使用 fallback
  const useStatsApi = !!statsData && !statsError;

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayJobs = useStatsApi
    ? statsData!.todayJobs
    : jobs.filter((j) => j.createdAt && new Date(j.createdAt) >= todayStart).length;
  const needsReview = useStatsApi
    ? statsData!.needsReview
    : jobs.filter((j) => j.status === 'needs_review' || j.status === 'partial_completed').length;
  const completedJobs = useStatsApi
    ? statsData!.completedJobs
    : jobs.filter((j) => j.status === 'completed').length;
  const onlineProviders = useStatsApi
    ? statsData!.onlineProviders
    : providers.filter((p) => p.status === 'active').length;

  const recentJobs = useStatsApi
    ? (statsData!.recentAlerts || [])
    : jobs;

  const isLoading = useStatsApi ? statsLoading : (jobsLoading || providersLoading);
  const hasError = useStatsApi ? !!statsError : !!jobsError;

  if (hasError && !useStatsApi) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button icon={<IconActivity />} onClick={() => refetch()}>重试</Button>
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
        <Text code>{id.slice(0, 16)}...</Text>
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
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: RecognitionJob | Record<string, unknown>) => (
        <Button type="text" size="small" onClick={() => navigate(`/jobs/${record.id}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="工作台"
        title="医疗记录智能识别"
        subtitle="上传医疗文档，AI 自动识别并提取结构化数据"
        action="新建识别"
        onAction={() => navigate('/recognition/new')}
        onRefresh={() => refetch()}
      />

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <MetricCard
            title="今日任务"
            value={todayJobs}
            icon={IconClipboardList}
            tone="blue"
            loading={isLoading}
          />
        </Col>
        <Col span={6}>
          <MetricCard
            title="待复核"
            value={needsReview}
            icon={IconAlertTriangle}
            tone="amber"
            loading={isLoading}
          />
        </Col>
        <Col span={6}>
          <MetricCard
            title="已完成"
            value={completedJobs}
            icon={IconCheckCircle}
            tone="green"
            loading={isLoading}
          />
        </Col>
        <Col span={6}>
          <MetricCard
            title="Provider 在线"
            value={onlineProviders}
            icon={IconDatabase}
            tone="blue"
            loading={isLoading}
          />
        </Col>
      </Row>

      {/* Recent Jobs */}
      <Card title="最近任务" extra={
        <Button type="text" size="small" onClick={() => navigate('/jobs')}>
          查看全部
        </Button>
      }>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : recentJobs.length === 0 ? (
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
            data={recentJobs as Record<string, unknown>[]}
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
    </div>
  );
}
