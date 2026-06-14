import { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Select,
  Input,
  Grid,
  Spin,
  Modal,
  Descriptions,
} from '@arco-design/web-react';
import { useQuery } from '@tanstack/react-query';
import { feedbackApi } from '../api/client';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import type { FeedbackSubmission, FeedbackFieldStat } from '../api/types';
import {
  IconMessageSquare,
  IconAlertTriangle,
  IconBarChart,
  IconRefresh,
} from '../icons/appIcons';

const { Text } = Typography;
const { Option } = Select;
const { Row, Col } = Grid;

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function FeedbackPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [fieldKeyFilter, setFieldKeyFilter] = useState<string | undefined>(undefined);
  const [jobIdFilter, setJobIdFilter] = useState<string | undefined>(undefined);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackSubmission | null>(null);

  // 获取反馈列表
  const {
    data: feedbackData,
    isLoading: feedbackLoading,
    error: feedbackError,
    refetch: refetchFeedback,
  } = useQuery({
    queryKey: ['feedback-all', page, pageSize, fieldKeyFilter, jobIdFilter],
    queryFn: () => feedbackApi.listAll({
      page,
      pageSize,
      fieldKey: fieldKeyFilter,
      jobId: jobIdFilter || undefined,
    }),
  });

  // 获取字段统计
  const {
    data: fieldStatsData,
    isLoading: fieldStatsLoading,
    error: fieldStatsError,
  } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => feedbackApi.getFieldStats(),
  });

  const feedbackItems = feedbackData?.items || [];
  const total = feedbackData?.total || 0;
  const fieldStats: FeedbackFieldStat[] = fieldStatsData?.stats || [];

  // KPI 数据
  const totalFeedback = total;
  const topField = fieldStats.length > 0 ? fieldStats[0] : null;

  // 所有字段名（用于筛选下拉）
  const allFieldKeys = useMemo(() => {
    return fieldStats.map(f => f.fieldKey).filter(Boolean);
  }, [fieldStats]);

  // 反馈表格列
  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => formatTime(t),
    },
    {
      title: '任务 ID',
      width: 180,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Text code style={{ fontSize: 12 }}>{record.jobId?.slice(0, 16) || '-'}</Text>
      ),
    },
    {
      title: '字段',
      dataIndex: 'fieldKey',
      width: 140,
      render: (fieldKey?: string) => fieldKey ? (
        <Tag size="small" color="blue">{fieldKey}</Tag>
      ) : '-',
    },
    {
      title: '原始值',
      width: 180,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Text style={{ fontSize: 13 }}>
          {record.originalValue != null ? String(record.originalValue).slice(0, 40) : '-'}
        </Text>
      ),
    },
    {
      title: '修正值',
      width: 180,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Text style={{ fontSize: 13, color: 'var(--color-success)' }}>
          {record.correctedValue != null ? String(record.correctedValue).slice(0, 40) : '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      width: 100,
      render: (_: unknown, record: FeedbackSubmission) => {
        const statusColors: Record<string, string> = {
          pending: 'orange',
          reviewed: 'green',
          rejected: 'red',
        };
        const statusLabels: Record<string, string> = {
          pending: '待审核',
          reviewed: '已审核',
          rejected: '已拒绝',
        };
        return (
          <Tag size="small" color={statusColors[record.status] || 'gray'}>
            {statusLabels[record.status] || record.status}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Button
          type="text"
          size="small"
          onClick={() => setSelectedFeedback(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="质量保障"
        title="反馈管理"
        subtitle="管理识别反馈和字段纠错统计"
      />

      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <MetricCard
            title="总反馈数"
            value={totalFeedback}
            icon={IconMessageSquare}
            tone="blue"
            loading={feedbackLoading}
          />
        </Col>
        <Col xs={12} sm={8}>
          <MetricCard
            title="反馈字段数"
            value={fieldStats.length}
            icon={IconBarChart}
            tone="green"
            loading={fieldStatsLoading}
          />
        </Col>
        <Col xs={12} sm={8}>
          <MetricCard
            title="最常反馈字段"
            value={topField ? topField.fieldKey : '-'}
            icon={IconAlertTriangle}
            tone={topField && topField.count > 5 ? 'amber' : 'blue'}
            hint={topField ? `${topField.count} 次` : undefined}
            loading={fieldStatsLoading}
          />
        </Col>
      </Row>

      {/* 字段反馈统计 */}
      {fieldStats.length > 0 && (
        <Card style={{ marginBottom: 16, borderRadius: 8 }} title="字段反馈统计">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {fieldStats.slice(0, 10).map((stat, idx) => (
              <div
                key={stat.fieldKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 12px',
                  background: idx === 0 ? 'var(--color-danger-soft)' : 'var(--color-info-soft)',
                  borderRadius: 6,
                }}
              >
                <Tag
                  color={idx < 3 ? 'red' : 'orange'}
                  size="small"
                  style={{ minWidth: 24, textAlign: 'center' }}
                >
                  {idx + 1}
                </Tag>
                <Text style={{ flex: 1, fontWeight: 500 }}>{stat.fieldKey}</Text>
                <Tag size="small" color="blue">{stat.count} 次反馈</Tag>
              </div>
            ))}
          </Space>
        </Card>
      )}

      {/* 反馈列表 */}
      <Card>
        {/* 筛选栏 */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            placeholder="按字段筛选"
            value={fieldKeyFilter}
            onChange={setFieldKeyFilter}
            style={{ width: 200 }}
            allowClear
          >
            {allFieldKeys.map(key => (
              <Option key={key} value={key}>{key}</Option>
            ))}
          </Select>
          <Input
            placeholder="按任务 ID 筛选"
            value={jobIdFilter}
            onChange={setJobIdFilter}
            style={{ width: 240 }}
            allowClear
          />
          <Button onClick={() => refetchFeedback()}>刷新</Button>
        </div>

        {feedbackError ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
            <Button icon={<IconRefresh />} onClick={() => refetchFeedback()}>重试</Button>
          </div>
        ) : feedbackLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin />
          </div>
        ) : feedbackItems.length === 0 ? (
          <EmptyState
            title="暂无反馈记录"
            description="尚未收到反馈数据"
            action={{ label: '刷新', onClick: refetchFeedback }}
          />
        ) : (
          <Table
            columns={columns}
            data={feedbackItems}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              showTotal: true,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            size="small"
          />
        )}
      </Card>

      {/* 反馈详情弹窗 */}
      <Modal
        title="反馈详情"
        visible={!!selectedFeedback}
        onCancel={() => setSelectedFeedback(null)}
        footer={
          <Button onClick={() => setSelectedFeedback(null)}>关闭</Button>
        }
        style={{ width: 560 }}
      >
        {selectedFeedback && (
          <Descriptions
            column={1}
            border
            data={[
              { label: '任务 ID', value: selectedFeedback.jobId || '-' },
              { label: '字段', value: selectedFeedback.fieldKey || '-' },
              {
                label: '原始值',
                value: (
                  <div style={{ background: 'var(--color-danger-soft)', padding: '4px 8px', borderRadius: 4 }}>
                    {selectedFeedback.originalValue != null ? String(selectedFeedback.originalValue) : '-'}
                  </div>
                ),
              },
              {
                label: '修正值',
                value: (
                  <div style={{ background: 'var(--color-success-soft)', padding: '4px 8px', borderRadius: 4 }}>
                    {selectedFeedback.correctedValue != null ? String(selectedFeedback.correctedValue) : '-'}
                  </div>
                ),
              },
              { label: '修正原因', value: selectedFeedback.comment || '未填写' },
              { label: '提交时间', value: formatTime(selectedFeedback.createdAt) },
              {
                label: '状态',
                value: (() => {
                  const statusLabels: Record<string, string> = {
                    pending: '待审核',
                    reviewed: '已审核',
                    rejected: '已拒绝',
                  };
                  return statusLabels[selectedFeedback.status] || selectedFeedback.status;
                })(),
              },
              ...(selectedFeedback.reviewedAt
                ? [{ label: '审核时间', value: formatTime(selectedFeedback.reviewedAt) }]
                : []),
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
