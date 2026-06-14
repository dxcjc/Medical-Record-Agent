import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Tabs,
  Modal,
  Spin,
  Tooltip,
  Badge,
} from '@arco-design/web-react';
import { IconQuestionCircle, IconSettings } from '@arco-design/web-react/icon';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { writebackApi } from '../api/client';
import { toast } from '../components/GlobalToast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import type { WritebackAttempt } from '../api/types';
import type { ApiError } from '../api/client';

const { Text } = Typography;

/* ------------------------------------------------------------------ */
/*  写回状态中文映射                                                     */
/* ------------------------------------------------------------------ */

const WRITEBACK_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
  skipped: '已跳过',
};

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

function extractErrorMessage(err: unknown): string {
  const apiErr = err as ApiError;
  if (apiErr?.body && typeof apiErr.body === 'object') {
    const body = apiErr.body as Record<string, unknown>;
    return String(body.message || body.error || apiErr.status || '网络错误');
  }
  return String(apiErr?.status || '网络错误');
}

/* ------------------------------------------------------------------ */
/*  回写确认弹窗                                                       */
/* ------------------------------------------------------------------ */

type WritebackConfirmTarget = Pick<import('../api/types').WritebackEligibleItem, 'jobId'> & Partial<import('../api/types').WritebackEligibleItem> & { id?: string };

function WritebackConfirmModal({
  visible,
  job,
  isRetry,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  job: WritebackConfirmTarget | null;
  isRetry?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (jobId: string) =>
      writebackApi.execute({ jobId, confirmed: true, idempotencyKey: `manual:${jobId}:${Date.now()}` }),
    onSuccess: () => {
      toast.success(isRetry ? '回写重试成功' : '回写执行成功');
      queryClient.invalidateQueries({ queryKey: ['writeback-eligible'] });
      queryClient.invalidateQueries({ queryKey: ['writeback-history'] });
      onSuccess();
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      const serverMsg = apiErr.body && typeof apiErr.body === 'object'
        ? (apiErr.body as Record<string, unknown>).message || (apiErr.body as Record<string, unknown>).error
        : undefined;
      const msg = serverMsg
        ? `回写失败：${serverMsg}`
        : `回写执行失败（${apiErr.status || '网络错误'}）`;
      toast.error(String(msg));
    },
  });

  if (!job) return null;

  const jobId = job.jobId || job.id || '';
  const readyFields = job.readyFields || [];

  return (
    <Modal
      title="确认回写"
      visible={visible}
      onCancel={onClose}
      onOk={() => mutation.mutateAsync(String(jobId))}
      confirmLoading={mutation.isPending}
      okText="确认回写"
      cancelText="取消"
      style={{ width: 520 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text type="secondary">任务 ID：</Text>
          <Text code>{String(jobId)}</Text>
        </div>
        <div>
          <Text type="secondary">将推送以下字段值：</Text>
        </div>
        {readyFields.length > 0 ? (
          <div style={{ background: 'var(--color-info-soft)', borderRadius: 6, padding: 12 }}>
            {readyFields.map((field, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <Tag size="small" color="blue">{field.fieldKey}</Tag>
                <Text style={{ fontSize: 13 }}>{field.value != null ? String(field.value) : '-'}</Text>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">无可用字段</Text>
        )}
      </Space>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function WritebackPage() {
  const navigate = useNavigate();
  const [confirmJob, setConfirmJob] = useState<WritebackConfirmTarget | null>(null);
  const [isRetry, setIsRetry] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(20);

  // 可回写任务列表
  const {
    data: eligibleData,
    isLoading: eligibleLoading,
    error: eligibleError,
    refetch: refetchEligible,
  } = useQuery({
    queryKey: ['writeback-eligible'],
    queryFn: () => writebackApi.eligible(50),
  });

  // 回写历史列表
  const {
    data: historyData,
    isLoading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['writeback-history', historyPage, historyPageSize],
    queryFn: () => writebackApi.history({ page: historyPage, pageSize: historyPageSize }),
  });

  const eligibleJobs = eligibleData?.items || [];
  const historyItems = historyData?.items || [];
  const historyTotal = historyData?.total || 0;

  // Build a map of last error per jobId from history for retry tooltip
  const lastErrorMap: Record<string, string> = {};
  historyItems.forEach((item) => {
    if (item.status === 'failed' && item.error) {
      const msg = typeof item.error === 'string' ? item.error : JSON.stringify(item.error);
      lastErrorMap[item.jobId] = msg;
    }
  });

  // 可回写任务表格列
  const eligibleColumns = [
    {
      title: '任务 ID',
      width: 180,
      render: (_: unknown, record: import('../api/types').WritebackEligibleItem) => (
        <Button
          type="text"
          size="small"
          onClick={() => navigate(`/jobs/${record.jobId || record.id}`)}
        >
          <Text code style={{ fontSize: 12 }}>{String(record.jobId || record.id || '').slice(0, 16)}</Text>
        </Button>
      ),
    },
    {
      title: 'Schema',
      width: 130,
      render: (_: unknown, record: import('../api/types').WritebackEligibleItem) => (
        <Space size={4}>
          <Tag size="small" color="blue">{String(record.schemaKey || '-')}</Tag>
        </Space>
      ),
    },
    {
      title: '完成时间',
      width: 180,
      render: (_: unknown, record: import('../api/types').WritebackEligibleItem) => (
        <Text style={{ fontSize: 13 }}>{formatTime(record.createdAt)}</Text>
      ),
    },
    {
      title: '识别结果摘要',
      width: 280,
      render: (_: unknown, record: import('../api/types').WritebackEligibleItem) => {
        const readyFields = record.readyFields || [];
        if (readyFields.length === 0) return <Text type="secondary">-</Text>;
        return (
          <Space size={4} wrap>
            {readyFields.slice(0, 3).map((f, idx) => (
              <Tag key={idx} size="small">{f.fieldKey}: {String(f.value).slice(0, 20)}</Tag>
            ))}
            {readyFields.length > 3 && <Tag size="small">+{readyFields.length - 3}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, record: import('../api/types').WritebackEligibleItem) => (
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => { setConfirmJob(record); setIsRetry(false); }}
          >
            回写
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() => navigate(`/jobs/${record.jobId || record.id}`)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  // 历史表格列
  const historyColumns = [
    {
      title: '任务 ID',
      width: 180,
      render: (_: unknown, record: WritebackAttempt) => (
        <Button
          type="text"
          size="small"
          onClick={() => navigate(`/jobs/${record.jobId}`)}
        >
          <Text code style={{ fontSize: 12 }}>{(record.jobId || '').slice(0, 16)}</Text>
        </Button>
      ),
    },
    {
      title: '状态',
      width: 100,
      render: (_: unknown, record: WritebackAttempt) => {
        const label = WRITEBACK_STATUS_LABELS[record.status] || record.status;
        const colorMap: Record<string, string> = {
          succeeded: 'green',
          failed: 'red',
          running: 'blue',
          pending: 'orange',
          skipped: 'gray',
        };
        return <Tag size="small" color={colorMap[record.status] || 'gray'}>{label}</Tag>;
      },
    },
    {
      title: '目标系统',
      dataIndex: 'targetSystem',
      width: 120,
    },
    {
      title: '幂等键',
      width: 200,
      render: (_: unknown, record: WritebackAttempt) => (
        <Text code style={{ fontSize: 11 }}>{record.idempotencyKey?.slice(0, 24) || '-'}</Text>
      ),
    },
    {
      title: '发起时间',
      dataIndex: 'attemptedAt',
      width: 180,
      render: (t: string) => formatTime(t),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      width: 180,
      render: (t?: string) => formatTime(t),
    },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, record: WritebackAttempt) => {
        if (record.status !== 'failed') return null;
        const errorMsg = record.error
          ? (typeof record.error === 'string' ? record.error : JSON.stringify(record.error))
          : '未知错误';
        return (
          <Tooltip
            content={
              <div style={{ maxWidth: 320 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>失败原因：{errorMsg}</Text>
              </div>
            }
            position="left"
          >
            <Button
              type="text"
              size="small"
              status="warning"
              onClick={() => {
                setConfirmJob({ jobId: record.jobId, id: record.id });
                setIsRetry(true);
              }}
            >
              重试
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  // Eligible tab title with badge
  const eligibleTabTitle = (
    <Space size={6}>
      <span>可回写任务</span>
      {eligibleJobs.length > 0 && (
        <Badge
          count={eligibleJobs.length}
          style={{ backgroundColor: 'var(--color-primary-6)' }}
        />
      )}
    </Space>
  );

  const renderError = (err: unknown, retryFn: () => void) => (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
      <Button onClick={retryFn}>重试</Button>
    </div>
  );

  // Empty state for eligible tab with configuration guidance
  const renderEligibleEmpty = () => (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <IconQuestionCircle style={{ fontSize: 48, color: 'var(--color-text-4)' }} />
      </div>
      <Typography.Title heading={5} style={{ marginBottom: 8 }}>
        暂无可回写任务
      </Typography.Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
        已完成的识别任务将在此显示。请确保已完成识别任务且配置了回写目标。
      </Text>
      <Space>
        <Button
          type="primary"
          icon={<IconSettings />}
          onClick={() => navigate('/providers')}
        >
          前往 Provider 配置
        </Button>
        <Button onClick={() => refetchEligible()}>
          刷新列表
        </Button>
      </Space>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="质量保障"
        title="回写管理"
        subtitle="管理识别结果回写和历史记录"
      />

      <Card>
        <Tabs defaultActiveTab="eligible">
          <Tabs.TabPane key="eligible" title={eligibleTabTitle}>
            <div style={{ padding: '16px 0' }}>
              {eligibleError ? (
                renderError(eligibleError, () => refetchEligible())
              ) : eligibleLoading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin />
                </div>
              ) : eligibleJobs.length === 0 ? (
                renderEligibleEmpty()
              ) : (
                <Table
                  columns={eligibleColumns}
                  data={eligibleJobs}
                  rowKey={(r) => String(r.jobId || r.id)}
                  pagination={{ pageSize: 20, showTotal: true }}
                  size="small"
                />
              )}
            </div>
          </Tabs.TabPane>

          <Tabs.TabPane key="history" title="回写历史">
            <div style={{ padding: '16px 0' }}>
              {historyError ? (
                renderError(historyError, refetchHistory)
              ) : historyLoading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin />
                </div>
              ) : historyItems.length === 0 ? (
                <EmptyState
                  title="暂无回写记录"
                  description="尚未执行过回写操作"
                  action={{ label: '刷新', onClick: refetchHistory }}
                />
              ) : (
                <Table
                  columns={historyColumns}
                  data={historyItems}
                  rowKey="id"
                  pagination={{
                    current: historyPage,
                    pageSize: historyPageSize,
                    total: historyTotal,
                    showTotal: true,
                    onChange: (p, ps) => {
                      setHistoryPage(p);
                      setHistoryPageSize(ps);
                    },
                  }}
                  size="small"
                />
              )}
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* 回写确认弹窗 */}
      <WritebackConfirmModal
        visible={!!confirmJob}
        job={confirmJob}
        isRetry={isRetry}
        onClose={() => setConfirmJob(null)}
        onSuccess={() => setConfirmJob(null)}
      />
    </div>
  );
}
