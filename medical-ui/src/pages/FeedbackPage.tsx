import { useState, useMemo, useCallback } from 'react';
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
  Checkbox,
  Message,
} from '@arco-design/web-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi, ApiError } from '../api/client';
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
const { TextArea } = Input;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type StatusTab = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_TABS: { key: StatusTab; label: string; badge?: string }[] = [
  { key: 'pending', label: '待审核', badge: 'blue' },
  { key: 'approved', label: '已批准', badge: 'green' },
  { key: 'rejected', label: '已拒绝', badge: 'red' },
  { key: 'all', label: '全部' },
];

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

/** Map status tab to API status query parameter. Returns undefined for 'all'. */
function statusTabToApiParam(tab: StatusTab): string | undefined {
  if (tab === 'all') return undefined;
  if (tab === 'approved') return 'reviewed';
  return tab; // 'pending' or 'rejected'
}

/** Render status tag for a feedback item */
function StatusTag({ status }: { status: string }) {
  if (status === 'pending') {
    return <Tag size="small" color="blue">待审核</Tag>;
  }
  if (status === 'reviewed' || status === 'accepted') {
    return <Tag size="small" color="green">已批准</Tag>;
  }
  if (status === 'rejected') {
    return <Tag size="small" color="red">已拒绝</Tag>;
  }
  return <Tag size="small" color="gray">{status}</Tag>;
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function FeedbackPage() {
  const queryClient = useQueryClient();

  // --- Filters ---
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [fieldKeyFilter, setFieldKeyFilter] = useState<string | undefined>(undefined);
  const [jobIdFilter, setJobIdFilter] = useState<string | undefined>(undefined);

  // --- Selection ---
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // --- Detail modal ---
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackSubmission | null>(null);

  // --- Reject modal ---
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<FeedbackSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [batchRejectMode, setBatchRejectMode] = useState(false);

  const apiStatusParam = statusTabToApiParam(statusTab);

  /* ------------------------------------------------------------------ */
  /*  Queries                                                            */
  /* ------------------------------------------------------------------ */

  const {
    data: feedbackData,
    isLoading: feedbackLoading,
    error: feedbackError,
    refetch: refetchFeedback,
  } = useQuery({
    queryKey: ['feedback-all', page, pageSize, fieldKeyFilter, jobIdFilter, apiStatusParam],
    queryFn: () => feedbackApi.listAll({
      page,
      pageSize,
      fieldKey: fieldKeyFilter,
      jobId: jobIdFilter || undefined,
      status: apiStatusParam,
    }),
  });

  const {
    data: fieldStatsData,
    isLoading: fieldStatsLoading,
  } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: () => feedbackApi.getFieldStats(),
  });

  const feedbackItems: FeedbackSubmission[] = feedbackData?.items || [];
  const total = feedbackData?.total || 0;
  const fieldStats: FeedbackFieldStat[] = fieldStatsData?.stats || [];

  // KPI 数据
  const totalFeedback = total;
  const topField = fieldStats.length > 0 ? fieldStats[0] : null;

  // 所有字段名（用于筛选下拉）
  const allFieldKeys = useMemo(() => {
    return fieldStats.map(f => f.fieldKey).filter(Boolean);
  }, [fieldStats]);

  /* ------------------------------------------------------------------ */
  /*  Mutations                                                          */
  /* ------------------------------------------------------------------ */

  const approveMutation = useMutation({
    mutationFn: (id: string) => feedbackApi.updateStatus(id, 'approved'),
    onSuccess: () => {
      Message.success('已批准，将写入知识库');
      queryClient.invalidateQueries({ queryKey: ['feedback-all'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      Message.error(`批准失败：${apiErr.userMessage || '未知错误'}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      feedbackApi.updateStatus(id, 'rejected', reason),
    onSuccess: () => {
      Message.success('已拒绝');
      setRejectModalVisible(false);
      setRejectTarget(null);
      setRejectReason('');
      setBatchRejectMode(false);
      queryClient.invalidateQueries({ queryKey: ['feedback-all'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      Message.error(`拒绝失败：${apiErr.userMessage || '未知错误'}`);
    },
  });

  const batchApproveMutation = useMutation({
    mutationFn: (ids: string[]) => feedbackApi.batchUpdateStatus(ids, 'approved'),
    onSuccess: (data) => {
      Message.success(`已批量批准 ${data.updated} 条反馈`);
      setSelectedRowKeys([]);
      queryClient.invalidateQueries({ queryKey: ['feedback-all'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      Message.error(`批量批准失败：${apiErr.userMessage || '未知错误'}`);
    },
  });

  const batchRejectMutation = useMutation({
    mutationFn: (ids: string[]) => feedbackApi.batchUpdateStatus(ids, 'rejected'),
    onSuccess: (data) => {
      Message.success(`已批量拒绝 ${data.updated} 条反馈`);
      setSelectedRowKeys([]);
      setRejectModalVisible(false);
      setRejectReason('');
      setBatchRejectMode(false);
      queryClient.invalidateQueries({ queryKey: ['feedback-all'] });
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] });
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      Message.error(`批量拒绝失败：${apiErr.userMessage || '未知错误'}`);
    },
  });

  /* ------------------------------------------------------------------ */
    /*  Handlers                                                         */
  /* ------------------------------------------------------------------ */

  const handleApprove = useCallback((record: FeedbackSubmission) => {
    Modal.confirm({
      title: '确认批准',
      content: '确认批准此反馈？批准后将写入知识库',
      okText: '确认批准',
      cancelText: '取消',
      onOk: () => approveMutation.mutateAsync(record.id),
    });
  }, [approveMutation]);

  const handleReject = useCallback((record: FeedbackSubmission) => {
    setRejectTarget(record);
    setBatchRejectMode(false);
    setRejectReason('');
    setRejectModalVisible(true);
  }, []);

  const handleBatchApprove = useCallback(() => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: '批量批准',
      content: `确认批量批准选中的 ${selectedRowKeys.length} 条反馈？批准后将写入知识库`,
      okText: '确认批准',
      cancelText: '取消',
      onOk: () => batchApproveMutation.mutateAsync(selectedRowKeys),
    });
  }, [selectedRowKeys, batchApproveMutation]);

  const handleBatchReject = useCallback(() => {
    if (selectedRowKeys.length === 0) return;
    setBatchRejectMode(true);
    setRejectTarget(null);
    setRejectReason('');
    setRejectModalVisible(true);
  }, [selectedRowKeys]);

  const handleRejectConfirm = useCallback(() => {
    if (batchRejectMode) {
      batchRejectMutation.mutate(selectedRowKeys);
    } else if (rejectTarget) {
      rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason || undefined });
    }
  }, [batchRejectMode, rejectTarget, rejectReason, selectedRowKeys, rejectMutation, batchRejectMutation]);

  const handleTabChange = useCallback((tab: StatusTab) => {
    setStatusTab(tab);
    setPage(1);
    setSelectedRowKeys([]);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Column definitions                                                 */
  /* ------------------------------------------------------------------ */

  const columns = [
    {
      title: (
        <Checkbox
          checked={selectedRowKeys.length > 0 && selectedRowKeys.length === feedbackItems.filter(r => r.status === 'pending').length}
          indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < feedbackItems.filter(r => r.status === 'pending').length}
          onChange={(checked) => {
            if (checked) {
              setSelectedRowKeys(feedbackItems.filter(r => r.status === 'pending').map(r => r.id));
            } else {
              setSelectedRowKeys([]);
            }
          }}
        />
      ),
      width: 48,
      render: (_: unknown, record: FeedbackSubmission) => {
        if (record.status !== 'pending') return null;
        return (
          <Checkbox
            checked={selectedRowKeys.includes(record.id)}
            onChange={(checked) => {
              if (checked) {
                setSelectedRowKeys(prev => [...prev, record.id]);
              } else {
                setSelectedRowKeys(prev => prev.filter(k => k !== record.id));
              }
            }}
          />
        );
      },
    },
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
      width: 160,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Text style={{ fontSize: 13 }}>
          {record.originalValue != null ? String(record.originalValue).slice(0, 40) : '-'}
        </Text>
      ),
    },
    {
      title: '修正值',
      width: 160,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Text style={{ fontSize: 13, color: 'var(--color-success)' }}>
          {record.correctedValue != null ? String(record.correctedValue).slice(0, 40) : '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      width: 120,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={record.status} />
          {record.status === 'rejected' && record.reviewNote && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              原因: {record.reviewNote}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record: FeedbackSubmission) => (
        <Space size={4}>
          {record.status === 'pending' && (
            <>
              <Button
                type="text"
                size="small"
                status="success"
                loading={approveMutation.isPending && approveMutation.variables === record.id}
                onClick={() => handleApprove(record)}
              >
                批准
              </Button>
              <Button
                type="text"
                size="small"
                status="danger"
                onClick={() => handleReject(record)}
              >
                拒绝
              </Button>
            </>
          )}
          <Button
            type="text"
            size="small"
            onClick={() => setSelectedFeedback(record)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const isRejectConfirmLoading = batchRejectMode
    ? batchRejectMutation.isPending
    : rejectMutation.isPending;

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
        {/* 状态筛选 Tabs */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)' }}>
          {STATUS_TABS.map(tab => (
            <Button
              key={tab.key}
              type="text"
              style={{
                padding: '8px 16px',
                borderRadius: 0,
                borderBottom: statusTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: statusTab === tab.key ? 'var(--color-primary)' : undefined,
                fontWeight: statusTab === tab.key ? 600 : 400,
                marginBottom: -1,
              }}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* 筛选栏 */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            placeholder="按字段筛选"
            value={fieldKeyFilter}
            onChange={(val) => { setFieldKeyFilter(val); setPage(1); }}
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
            onChange={(val) => { setJobIdFilter(val); setPage(1); }}
            style={{ width: 240 }}
            allowClear
          />
          <Button icon={<IconRefresh />} onClick={() => refetchFeedback()}>刷新</Button>
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
            description="当前筛选条件下没有反馈数据"
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

      {/* 批量操作浮动栏 */}
      {selectedRowKeys.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-5)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            zIndex: 1000,
          }}
        >
          <Text style={{ fontWeight: 500 }}>
            已选 {selectedRowKeys.length} 条
          </Text>
          <Button
            type="primary"
            status="success"
            size="small"
            loading={batchApproveMutation.isPending}
            onClick={handleBatchApprove}
          >
            批量批准
          </Button>
          <Button
            type="primary"
            status="danger"
            size="small"
            loading={batchRejectMutation.isPending}
            onClick={handleBatchReject}
          >
            批量拒绝
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() => setSelectedRowKeys([])}
          >
            取消选择
          </Button>
        </div>
      )}

      {/* 拒绝原因弹窗 */}
      <Modal
        title={batchRejectMode ? `批量拒绝 (${selectedRowKeys.length} 条)` : '拒绝反馈'}
        visible={rejectModalVisible}
        onCancel={() => {
          setRejectModalVisible(false);
          setRejectTarget(null);
          setRejectReason('');
          setBatchRejectMode(false);
        }}
        onOk={handleRejectConfirm}
        confirmLoading={isRejectConfirmLoading}
        okText="确认拒绝"
        cancelText="取消"
        okButtonProps={{ status: 'danger' }}
        style={{ width: 480 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {!batchRejectMode && rejectTarget && (
            <div style={{ padding: '8px 12px', background: 'var(--color-info-soft)', borderRadius: 6 }}>
              <Text style={{ fontSize: 13 }}>
                字段: <Tag size="small" color="blue">{rejectTarget.fieldKey || '-'}</Tag>
                {' | '}
                修正值: {String(rejectTarget.correctedValue ?? '-')}
              </Text>
            </div>
          )}
          {batchRejectMode && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              将拒绝选中的 {selectedRowKeys.length} 条反馈记录
            </Text>
          )}
          <div>
            <Text style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              拒绝原因 <Text type="secondary" style={{ fontWeight: 400 }}>(可选)</Text>
            </Text>
            <TextArea
              placeholder="请输入拒绝原因..."
              value={rejectReason}
              onChange={setRejectReason}
              maxLength={500}
              showWordLimit
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </div>
        </Space>
      </Modal>

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
                  const map: Record<string, string> = {
                    pending: '待审核',
                    reviewed: '已批准',
                    accepted: '已批准',
                    rejected: '已拒绝',
                  };
                  return map[selectedFeedback.status] || selectedFeedback.status;
                })(),
              },
              ...(selectedFeedback.status === 'rejected' && selectedFeedback.reviewNote
                ? [{ label: '拒绝原因', value: selectedFeedback.reviewNote }]
                : []),
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
