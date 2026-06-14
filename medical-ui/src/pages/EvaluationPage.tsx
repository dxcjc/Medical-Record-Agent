import { useState, useMemo } from 'react';
import {
  Tabs,
  Table,
  Button,
  Spin,
  Modal,
  Tag,
  Card,
  Typography,
  Form,
  Input,
  Select,
  Message,
  Space,
  Switch,
  Upload,
  Grid,
} from '@arco-design/web-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluationApi, providersApi, schemasApi } from '../api/client';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import StatusTag from '../components/StatusTag';
import type { EvaluationDataset, EvaluationRun, EvaluationMetric } from '../api/types';
import {
  IconBeaker,
  IconCheckCircle,
  IconBarChart,
  IconDatabase,
} from '../icons/appIcons';

const TabPane = Tabs.TabPane;
const { Text } = Typography;
const { Option } = Select;
const { Row, Col } = Grid;
const FormItem = Form.Item;

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatMetricSummary(metrics: EvaluationMetric[]): string {
  if (!metrics || metrics.length === 0) return '-';
  const accuracy = metrics.find((m) => m.metricName === 'field_accuracy');
  const latency = metrics.find((m) => m.metricName === 'average_latency_ms');
  const parts: string[] = [];
  if (accuracy) parts.push(`准确率 ${(accuracy.value * 100).toFixed(1)}%`);
  if (latency) parts.push(`延迟 ${latency.value.toFixed(0)}ms`);
  if (parts.length === 0) return `${metrics.length} 项指标`;
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/*  创建数据集表单                                                      */
/* ------------------------------------------------------------------ */

function CreateDatasetModal({
  visible,
  onClose,
  onSuccess,
  schemas,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  schemas: Array<{ schemaKey: string; displayName: string }>;
}) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [deidentified, setDeidentified] = useState(false);

  const mutation = useMutation({
    mutationFn: (values: { key: string; displayName: string; description?: string }) =>
      evaluationApi.createDataset({
        key: values.key,
        displayName: values.displayName,
        description: values.description,
        deidentified,
      }),
    onSuccess: () => {
      Message.success('数据集创建成功');
      queryClient.invalidateQueries({ queryKey: ['eval-datasets'] });
      form.resetFields();
      onSuccess();
    },
    onError: () => {
      Message.error('数据集创建失败');
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      const schemaKey = form.getFieldValue('schemaKey');
      await mutation.mutateAsync({
        key: values.key,
        displayName: values.displayName,
        description: values.description,
      });
    } catch {
      // validation error
    }
  };

  return (
    <Modal
      title="创建数据集"
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={mutation.isPending}
      okText="创建"
      cancelText="取消"
      style={{ width: 500 }}
    >
      <Form form={form} layout="vertical">
        <FormItem label="数据集 Key" field="key" required rules={[{ required: true, message: '请输入 Key' }]}>
          <Input placeholder="唯一标识，如 ds-lung-2024" />
        </FormItem>
        <FormItem label="显示名称" field="displayName" required rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="数据集显示名称" />
        </FormItem>
        <FormItem label="描述" field="description">
          <Input.TextArea placeholder="数据集描述（可选）" maxLength={500} showWordLimit />
        </FormItem>
        <FormItem label="关联 Schema" field="schemaKey">
          <Select placeholder="选择关联的 Schema" allowClear>
            {schemas.map(s => (
              <Option key={s.schemaKey} value={s.schemaKey}>{s.displayName || s.schemaKey}</Option>
            ))}
          </Select>
        </FormItem>
        <FormItem label="脱敏数据">
          <Switch checked={deidentified} onChange={setDeidentified} />
          <Text type="secondary" style={{ marginLeft: 8 }}>标记数据是否已脱敏</Text>
        </FormItem>
      </Form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  导入样本弹窗                                                       */
/* ------------------------------------------------------------------ */

function ImportSamplesModal({
  visible,
  datasetId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  datasetId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState('');

  const mutation = useMutation({
    mutationFn: (samples: import('../api/types').FieldExtractionMap[]) =>
      evaluationApi.importSamples(datasetId, samples),
    onSuccess: (data) => {
      const count = data.samples?.length || 0;
      Message.success(`成功导入 ${count} 个样本`);
      queryClient.invalidateQueries({ queryKey: ['eval-datasets'] });
      queryClient.invalidateQueries({ queryKey: ['eval-samples', datasetId] });
      setJsonInput('');
      onSuccess();
    },
    onError: () => {
      Message.error('样本导入失败');
    },
  });

  const handleImport = async () => {
    setParseError('');
    try {
      const parsed = JSON.parse(jsonInput);
      const samples = Array.isArray(parsed) ? parsed : [parsed];
      await mutation.mutateAsync(samples);
    } catch (e) {
      setParseError(`JSON 解析失败: ${(e as Error).message}`);
    }
  };

  return (
    <Modal
      title="导入 Ground Truth 样本"
      visible={visible}
      onCancel={onClose}
      onOk={handleImport}
      confirmLoading={mutation.isPending}
      okText="导入"
      cancelText="取消"
      style={{ width: 600 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          粘贴 JSON 格式的 ground truth 数据。支持单个对象或数组格式。
        </Text>
        <Input.TextArea
          placeholder={`示例：\n[\n  {\n    "externalId": "sample-001",\n    "groundTruth": {\n      "patientName": "张三",\n      "clinicalDiagnosis": "肺腺癌"\n    }\n  }\n]`}
          value={jsonInput}
          onChange={setJsonInput}
          style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
        />
        {parseError && (
          <Text type="error" style={{ fontSize: 12 }}>{parseError}</Text>
        )}
      </Space>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  创建评测运行弹窗                                                    */
/* ------------------------------------------------------------------ */

function CreateRunModal({
  visible,
  datasets,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  datasets: EvaluationDataset[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const { data: providersData } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list(),
  });

  const providers = (providersData?.items || []).filter(p => p.kind === 'llm' || p.kind === 'ocr');

  const mutation = useMutation({
    mutationFn: (values: { datasetId: string; providerKey: string; sampleLimit?: number }) =>
      evaluationApi.createRun(values),
    onSuccess: () => {
      Message.success('评测运行已创建');
      queryClient.invalidateQueries({ queryKey: ['eval-runs'] });
      form.resetFields();
      onSuccess();
    },
    onError: () => {
      Message.error('创建评测运行失败');
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      await mutation.mutateAsync({
        datasetId: values.datasetId,
        providerKey: values.providerKey,
        sampleLimit: values.sampleLimit ? Number(values.sampleLimit) : undefined,
      });
    } catch {
      // validation error
    }
  };

  return (
    <Modal
      title="创建评测运行"
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={mutation.isPending}
      okText="创建"
      cancelText="取消"
      style={{ width: 500 }}
    >
      <Form form={form} layout="vertical">
        <FormItem label="数据集" field="datasetId" required rules={[{ required: true, message: '请选择数据集' }]}>
          <Select placeholder="选择评测数据集">
            {datasets.map(d => (
              <Option key={d.id} value={d.id}>{d.displayName || d.key}</Option>
            ))}
          </Select>
        </FormItem>
        <FormItem label="Provider" field="providerKey" required rules={[{ required: true, message: '请选择 Provider' }]}>
          <Select placeholder="选择 Provider">
            {providers.map(p => (
              <Option key={p.key} value={p.key}>{p.displayName || p.key}</Option>
            ))}
          </Select>
        </FormItem>
        <FormItem label="样本限制" field="sampleLimit">
          <Input placeholder="留空表示全部样本" type="number" />
        </FormItem>
      </Form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  评测结果详情弹窗（字段级指标）                                        */
/* ------------------------------------------------------------------ */

function MetricsDetailModal({
  runId,
  visible,
  onClose,
}: {
  runId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['run-metrics', runId],
    queryFn: () => evaluationApi.getRunMetrics(runId),
    enabled: visible && !!runId,
  });

  const metrics = data?.metrics || [];

  // 解析字段级指标
  const fieldMetrics = useMemo(() => {
    const fieldAccuracy = metrics.find(m => m.metricName === 'field_accuracy');
    const fieldPrecision = metrics.find(m => m.metricName === 'field_precision');
    const fieldRecall = metrics.find(m => m.metricName === 'field_recall');
    const fieldF1 = metrics.find(m => m.metricName === 'field_f1');

    const breakdown = fieldAccuracy?.metadata?.breakdown;

    if (breakdown && Object.keys(breakdown).length > 0) {
      return Object.entries(breakdown).map(([fieldKey, values]) => ({
        fieldKey,
        accuracy: values.accuracy ?? null,
        precision: values.precision ?? null,
        recall: values.recall ?? null,
        f1: values.f1 ?? null,
      }));
    }

    return [];
  }, [metrics]);

  // 导出 JSON
  const handleExport = () => {
    const exportData = {
      runId,
      metrics: metrics.map(m => ({
        name: m.metricName,
        value: m.value,
        metadata: m.metadata,
      })),
      fieldMetrics,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-report-${runId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Message.success('评测报告已导出');
  };

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

  const fieldColumns = [
    { title: '字段', dataIndex: 'fieldKey', width: 180 },
    {
      title: '准确率',
      dataIndex: 'accuracy',
      width: 100,
      render: (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '-',
    },
    {
      title: '精确率',
      dataIndex: 'precision',
      width: 100,
      render: (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '-',
    },
    {
      title: '召回率',
      dataIndex: 'recall',
      width: 100,
      render: (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '-',
    },
    {
      title: 'F1',
      dataIndex: 'f1',
      width: 100,
      render: (v: number | null) => v != null ? (
        <Tag size="small" color={v >= 0.8 ? 'green' : v >= 0.5 ? 'orange' : 'red'}>
          {(v * 100).toFixed(1)}%
        </Tag>
      ) : '-',
    },
  ];

  return (
    <Modal
      title="评测结果详情"
      visible={visible}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" onClick={handleExport}>
            导出 JSON 报告
          </Button>
        </Space>
      }
      style={{ width: 700 }}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>指标数据加载失败</p>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {(error as Error)?.message || '请稍后重试'}
          </Text>
        </div>
      ) : metrics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          暂无指标数据
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 总体指标 */}
          <Card size="small" title="总体指标">
            <Table columns={columns} data={metrics} rowKey="id" pagination={false} size="small" />
          </Card>

          {/* 字段级指标 */}
          {fieldMetrics.length > 0 ? (
            <Card size="small" title="字段级指标">
              <Table
                columns={fieldColumns}
                data={fieldMetrics}
                rowKey="fieldKey"
                pagination={false}
                size="small"
              />
            </Card>
          ) : (
            <Card size="small" title="字段级指标">
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-muted)' }}>
                暂无字段级指标
              </div>
            </Card>
          )}
        </Space>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function EvaluationPage() {
  const queryClient = useQueryClient();
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
  const [showCreateDataset, setShowCreateDataset] = useState(false);
  const [showImportSamples, setShowImportSamples] = useState<string | null>(null);
  const [showCreateRun, setShowCreateRun] = useState(false);

  const datasets = datasetsData?.items || [];
  const runs = runsData?.items || [];

  // 构建数据集名称映射
  const datasetNameMap: Record<string, string> = {};
  datasets.forEach((d) => {
    datasetNameMap[d.id] = d.displayName || d.key;
  });

  // 获取 Schema 列表
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: () => schemasApi.list(),
  });
  const schemas = schemasData?.items || [];

  const handleViewMetrics = (runId: string) => {
    setMetricsRunId(runId);
  };

  const datasetColumns = [
    { title: '名称', dataIndex: 'displayName', width: 200 },
    {
      title: 'Key',
      width: 150,
      render: (_: unknown, record: EvaluationDataset) => (
        <Text code style={{ fontSize: 12 }}>{record.key}</Text>
      ),
    },
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
      title: '关联 Schema',
      width: 150,
      render: (_: unknown, record: EvaluationDataset) => {
        const schemaKey = record.metadata?.schemaKey;
        return schemaKey ? <Tag size="small" color="blue">{schemaKey}</Tag> : <span style={{ color: '#999' }}>-</span>;
      },
    },
    {
      title: '脱敏',
      width: 80,
      render: (_: unknown, record: EvaluationDataset) => (
        <Tag size="small" color={record.deidentified ? 'green' : 'gray'}>
          {record.deidentified ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: EvaluationDataset) => (
        <Button
          type="text"
          size="small"
          onClick={() => setShowImportSamples(record.id)}
        >
          导入样本
        </Button>
      ),
    },
  ];

  const runColumns = [
    {
      title: '数据集',
      width: 200,
      render: (_: unknown, record: EvaluationRun) =>
        record.dataset?.displayName || datasetNameMap[record.datasetId] || record.datasetId,
    },
    {
      title: 'Provider',
      dataIndex: 'providerKey',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: '指标摘要',
      width: 200,
      render: (_: unknown, record: EvaluationRun) => {
        if (record.status !== 'completed') return <span style={{ color: '#999' }}>-</span>;
        return (
          <Button type="text" size="mini" onClick={() => handleViewMetrics(record.id)}>
            查看详情
          </Button>
        );
      },
    },
    {
      title: '开始时间',
      width: 180,
      render: (_: unknown, record: EvaluationRun) => {
        return record.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : '-';
      },
    },
    {
      title: '耗时',
      width: 100,
      render: (_: unknown, record: EvaluationRun) => formatDuration(record.createdAt, record.completedAt),
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: EvaluationRun) => (
        <Button
          type="text"
          size="small"
          disabled={record.status !== 'completed'}
          onClick={() => handleViewMetrics(record.id)}
        >
          查看指标
        </Button>
      ),
    },
  ];

  // KPI 数据
  const totalDatasets = datasets.length;
  const totalRuns = runs.length;
  const completedRuns = runs.filter(r => r.status === 'completed').length;

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
        subtitle="管理评测数据集、运行记录和评测报告"
        action="创建数据集"
        onAction={() => setShowCreateDataset(true)}
      />

      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <MetricCard
            title="数据集"
            value={totalDatasets}
            icon={IconDatabase}
            tone="blue"
            loading={datasetsLoading}
          />
        </Col>
        <Col xs={12} sm={8}>
          <MetricCard
            title="评测运行"
            value={totalRuns}
            icon={IconBeaker}
            tone="green"
            loading={runsLoading}
          />
        </Col>
        <Col xs={12} sm={8}>
          <MetricCard
            title="已完成"
            value={completedRuns}
            icon={IconCheckCircle}
            tone="green"
            loading={runsLoading}
          />
        </Col>
      </Row>

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
                  description="点击右上角创建数据集"
                  action={{ label: '刷新', onClick: refetchDatasets }}
                />
              ) : (
                <Table
                  columns={datasetColumns}
                  data={datasets}
                  rowKey="id"
                  pagination={{ pageSize: 20, showTotal: true }}
                  size="small"
                />
              )}
            </div>
          </TabPane>

          <TabPane key="runs" title="运行记录">
            <div style={{ padding: '16px 0' }}>
              <div style={{ marginBottom: 12 }}>
                <Button type="primary" onClick={() => setShowCreateRun(true)}>
                  创建评测运行
                </Button>
              </div>
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
                <Table columns={runColumns} data={runs} rowKey="id" pagination={{ pageSize: 20, showTotal: true }} size="small" />
              )}
            </div>
          </TabPane>
        </Tabs>

        {/* 评测指标详情弹窗 */}
        {metricsRunId && (
          <MetricsDetailModal
            runId={metricsRunId}
            visible={!!metricsRunId}
            onClose={() => setMetricsRunId(null)}
          />
        )}
      </Card>

      {/* 创建数据集弹窗 */}
      <CreateDatasetModal
        visible={showCreateDataset}
        onClose={() => setShowCreateDataset(false)}
        onSuccess={() => setShowCreateDataset(false)}
        schemas={schemas.map(s => ({ schemaKey: s.schemaKey, displayName: s.displayName }))}
      />

      {/* 导入样本弹窗 */}
      {showImportSamples && (
        <ImportSamplesModal
          visible={!!showImportSamples}
          datasetId={showImportSamples}
          onClose={() => setShowImportSamples(null)}
          onSuccess={() => setShowImportSamples(null)}
        />
      )}

      {/* 创建评测运行弹窗 */}
      <CreateRunModal
        visible={showCreateRun}
        datasets={datasets}
        onClose={() => setShowCreateRun(false)}
        onSuccess={() => setShowCreateRun(false)}
      />
    </div>
  );
}
