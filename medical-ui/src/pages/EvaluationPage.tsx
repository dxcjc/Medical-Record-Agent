import { useState } from 'react';
import {
  Tabs,
  Table,
  Button,
  Spin,
  Modal,
  Tag,
  Card,
} from '@arco-design/web-react';
import { useQuery } from '@tanstack/react-query';
import { evaluationApi } from '../api/client';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import type { EvaluationDataset, EvaluationRun } from '../api/types';

const TabPane = Tabs.TabPane;

function MetricsModal({
  runId,
  visible,
  onClose,
}: {
  runId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['run-metrics', runId],
    queryFn: () => evaluationApi.getRunMetrics(runId),
    enabled: visible && !!runId,
  });

  const metrics = data?.metrics || [];

  const columns = [
    { title: '指标', dataIndex: 'metricName', width: 200 },
    {
      title: '值',
      dataIndex: 'value',
      width: 150,
      render: (v: number) => (typeof v === 'number' ? v.toFixed(4) : String(v)),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
  ];

  return (
    <Modal title="评测指标" visible={visible} onCancel={onClose} footer={null} style={{ width: 600 }}>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : metrics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          暂无指标数据
        </div>
      ) : (
        <Table columns={columns} data={metrics} rowKey="id" pagination={false} size="small" />
      )}
    </Modal>
  );
}

export default function EvaluationPage() {
  const {
    data: datasetsData,
    isLoading: datasetsLoading,
    error: datasetsError,
    refetch: refetchDatasets,
  } = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: () => evaluationApi.listDatasets(),
  });

  const {
    data: runsData,
    isLoading: runsLoading,
    error: runsError,
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ['eval-runs'],
    queryFn: () => evaluationApi.listRuns(),
  });

  const [metricsRunId, setMetricsRunId] = useState<string | null>(null);

  const datasets = datasetsData?.items || [];
  const runs = runsData?.items || [];

  const datasetColumns = [
    { title: '名称', dataIndex: 'displayName', width: 200 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: '样本数',
      width: 100,
      render: (_: unknown, record: EvaluationDataset) => record._count?.samples ?? '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
  ];

  const runColumns = [
    {
      title: '数据集',
      width: 200,
      render: (_: unknown, record: EvaluationRun) =>
        record.dataset?.displayName || record.datasetId,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => <StatusTag status={status} />,
    },
    { title: 'Provider', dataIndex: 'providerKey', width: 150 },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: EvaluationRun) => (
        <Button
          type="text"
          size="small"
          disabled={record.status !== 'completed'}
          onClick={() => setMetricsRunId(record.id)}
        >
          查看指标
        </Button>
      ),
    },
  ];

  const renderError = (err: unknown, retryFn: () => void) => (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
      <Button onClick={retryFn}>重试</Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="质量保障"
        title="评测中心"
        subtitle="管理评测数据集和运行记录"
      />

      <Card>
        <Tabs defaultActiveTab="datasets">
          <TabPane key="datasets" title="数据集">
            <div style={{ padding: '16px 0' }}>
              {datasetsError ? (
                renderError(datasetsError, refetchDatasets)
              ) : datasetsLoading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin />
                </div>
              ) : datasets.length === 0 ? (
                <EmptyState
                  title="暂无评测数据集"
                  description="请联系管理员导入评测数据"
                  action={{ label: '刷新', onClick: refetchDatasets }}
                />
              ) : (
                <Table
                  columns={datasetColumns}
                  data={datasets}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                />
              )}
            </div>
          </TabPane>

          <TabPane key="runs" title="运行记录">
            <div style={{ padding: '16px 0' }}>
              {runsError ? (
                renderError(runsError, refetchRuns)
              ) : runsLoading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <Spin />
                </div>
              ) : runs.length === 0 ? (
                <EmptyState
                  title="暂无运行记录"
                  description="尚未执行过评测任务"
                  action={{ label: '刷新', onClick: refetchRuns }}
                />
              ) : (
                <Table columns={runColumns} data={runs} rowKey="id" pagination={{ pageSize: 20 }} />
              )}
            </div>
          </TabPane>
        </Tabs>

        {metricsRunId && (
          <MetricsModal
            runId={metricsRunId}
            visible={!!metricsRunId}
            onClose={() => setMetricsRunId(null)}
          />
        )}
      </Card>
    </div>
  );
}
