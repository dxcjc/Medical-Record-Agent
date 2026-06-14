import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, Table, Button, Spin, Typography, Select, Space } from '@arco-design/web-react';
import { useState } from 'react';
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
import { useSchemas } from '../hooks/useSchemas';
import { useTrendStats } from '../hooks/useTrendStats';
import StatusTag from '../components/StatusTag';
import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import Skeleton, { ChartSkeleton, TableSkeleton, QuickActionCardSkeleton } from '../components/Skeleton';
import type { RecognitionJob } from '../api/types';

const { Row, Col } = Grid;
const { Text } = Typography;
const { Option } = Select;

/* ------------------------------------------------------------------ */
/*  SVG 折线图组件                                                       */
/* ------------------------------------------------------------------ */

interface LineData {
  label: string;
  completed: number;
  failed: number;
}

function SimpleLineChart({ data }: { data: LineData[] }) {
  const width = 800;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.completed, d.failed]);
  const maxVal = Math.max(...allValues, 1);

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const yCompleted = padding.top + chartH - (d.completed / maxVal) * chartH;
    const yFailed = padding.top + chartH - (d.failed / maxVal) * chartH;
    return { x, yCompleted, yFailed, label: d.label, completed: d.completed, failed: d.failed };
  });

  const completedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yCompleted}`).join(' ');
  const failedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yFailed}`).join(' ');

  // Y 轴刻度
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxVal / yTicks) * i));

  return (
    <div style={{ width: '100%', height: 200, overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
        {/* Y 轴网格线和标签 */}
        {yTickValues.map((val, i) => {
          const y = padding.top + chartH - (val / maxVal) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#999">
                {val}
              </text>
            </g>
          );
        })}

        {/* X 轴标签 */}
        {points.map((p, i) => (
          <text key={i} x={p.x} y={height - 10} textAnchor="middle" fontSize={11} fill="#999">
            {p.label}
          </text>
        ))}

        {/* 完成线（绿色） */}
        {points.length > 1 && (
          <path d={completedPath} fill="none" stroke="#00B42A" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* 失败线（红色） */}
        {points.length > 1 && (
          <path d={failedPath} fill="none" stroke="#F53F3F" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3" />
        )}

        {/* 数据点 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.yCompleted} r={4} fill="#00B42A" stroke="#fff" strokeWidth={1.5} />
            <circle cx={p.x} cy={p.yFailed} r={3} fill="#F53F3F" stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}

        {/* 图例 */}
        <line x1={width - 160} y1={12} x2={width - 140} y2={12} stroke="#00B42A" strokeWidth={2.5} />
        <text x={width - 135} y={16} fontSize={11} fill="#666">已完成</text>
        <line x1={width - 90} y1={12} x2={width - 70} y2={12} stroke="#F53F3F" strokeWidth={2} strokeDasharray="4 2" />
        <text x={width - 65} y={16} fontSize={11} fill="#666">失败</text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  快捷操作卡片                                                         */
/* ------------------------------------------------------------------ */

interface QuickAction {
  title: string;
  description: string;
  icon: typeof IconFileUp;
  color: string;
  path: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { title: '新建识别', description: '上传医疗文档开始 AI 识别', icon: IconFileUp, color: '#3370FF', path: '/recognition/new' },
  { title: '查看待复核', description: '查看需要人工复核的识别结果', icon: IconAlertTriangle, color: '#FF7D00', path: '/jobs' },
  { title: '查看最新反馈', description: '查看用户提交的反馈和纠正', icon: IconClipboardList, color: '#722ED1', path: '/feedback' },
];

/* ------------------------------------------------------------------ */
/*  DashboardPage 主组件                                                 */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const [trendSchemaKey, setTrendSchemaKey] = useState<string | undefined>(undefined);
  const { data: statsData, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: jobsData, isLoading: jobsLoading, error: jobsError, refetch } = useJobs(20);
  const { data: providersData, isLoading: providersLoading } = useProviders();
  const { data: schemasData } = useSchemas();
  const { data: trendData, isLoading: trendLoading } = useTrendStats(trendSchemaKey, 7);

  const jobs = jobsData?.items || [];
  const providers = providersData?.items || [];
  const schemas = schemasData?.items || [];

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

  // 趋势图数据
  const trendPoints = useMemo(() => {
    const raw = trendData?.trend || [];
    return raw.map(p => ({
      label: p.date.slice(5), // MM-DD
      completed: p.extracted,
      failed: p.failed,
    }));
  }, [trendData]);

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
        <Col xs={12} sm={12} lg={6}>
          <MetricCard
            title="今日任务"
            value={todayJobs}
            icon={IconClipboardList}
            tone="blue"
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <MetricCard
            title="待复核"
            value={needsReview}
            icon={IconAlertTriangle}
            tone="amber"
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <MetricCard
            title="已完成"
            value={completedJobs}
            icon={IconCheckCircle}
            tone="green"
            loading={isLoading}
          />
        </Col>
        <Col xs={12} sm={12} lg={6}>
          <MetricCard
            title="Provider 在线"
            value={onlineProviders}
            icon={IconDatabase}
            tone="blue"
            loading={isLoading}
          />
        </Col>
      </Row>

      {/* 快速上手引导 */}
      {!isLoading && jobs.length <= 5 && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: 600 }}>🚀 快速上手</Text>
            <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>3 步开始使用医疗记录识别系统</Text>
          </div>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <div style={{
                padding: '20px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--color-primary-light-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <IconFileUp size={20} style={{ color: '#3370FF' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>步骤 1：上传文档</div>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
                  上传医疗文档图片或 PDF 文件
                </Text>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => navigate('/recognition/new')}
                >
                  开始上传
                </Button>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{
                padding: '20px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--color-success-light-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <IconActivity size={20} style={{ color: '#00B42A' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>步骤 2：AI 识别</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  AI 自动识别并提取结构化数据
                </Text>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{
                padding: '20px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--color-warning-light-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <IconClipboardList size={20} style={{ color: '#FF7D00' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>步骤 3：人工复核</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  审核 AI 识别结果，确保数据准确
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* 趋势图 */}
      <Card
        title="任务趋势（近 7 天）"
        style={{ marginBottom: 24 }}
        extra={
          <Space size={8} align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>Schema：</Text>
            <Select
              value={trendSchemaKey}
              onChange={setTrendSchemaKey}
              placeholder="选择 Schema"
              style={{ width: 200 }}
              size="small"
              allowClear
            >
              {schemas.map(s => (
                <Option key={s.schemaKey} value={s.schemaKey}>
                  {s.displayName || s.schemaKey}
                </Option>
              ))}
            </Select>
          </Space>
        }
      >
        {!trendSchemaKey ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-3)' }}>
            <IconBarChart size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>请先选择 Schema 以查看趋势</div>
          </div>
        ) : trendLoading ? (
          <ChartSkeleton />
        ) : trendPoints.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-3)' }}>
            暂无趋势数据
          </div>
        ) : (
          <SimpleLineChart data={trendPoints} />
        )}
      </Card>

      {/* Recent Jobs */}
      <Card title="最近任务" extra={
        <Button type="text" size="small" onClick={() => navigate('/jobs')}>
          查看全部
        </Button>
      }>
        {isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : recentJobs.length === 0 ? (
          <EmptyState
            title="还没有识别任务"
            description="上传医疗文档，AI 自动识别并提取结构化数据"
            action={{
              label: '新建识别',
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

      {/* 快捷操作 */}
      <div style={{ marginTop: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'block' }}>快捷操作</Text>
        {isLoading ? (
          <Row gutter={16}>
            {[0, 1, 2].map((i) => (
              <Col key={i} xs={24} sm={12} lg={8}>
                <Card hoverable style={{ cursor: 'default' }}>
                  <QuickActionCardSkeleton />
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
        <Row gutter={16}>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Col key={action.path} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  style={{ cursor: 'pointer', textAlign: 'center' }}
                  onClick={() => navigate(action.path)}
                >
                  <div style={{ marginBottom: 12 }}>
                    <Icon size={32} style={{ color: action.color }} />
                  </div>
                  <Text style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {action.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {action.description}
                  </Text>
                </Card>
              </Col>
            );
          })}
        </Row>
        )}
      </div>
    </div>
  );
}
