import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Typography,
  Space,
  Descriptions,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
  Tabs,
} from '@arco-design/web-react';
import {
  useProviders,
  useSetDefaultProvider,
  useCheckProviderHealth,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
} from '../hooks/useProviders';
import { ApiError, jobsApi } from '../api/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '../components/GlobalToast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Skeleton, { MetricCardSkeleton } from '../components/Skeleton';
import { IconPlus, IconPencil, IconTrash } from '../icons/appIcons';
import type { ProviderConfig, ProviderKind } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;
const FormItem = Form.Item;
const Option = Select.Option;
const TabPane = Tabs.TabPane;

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: 'ocr', label: 'OCR' },
  { value: 'llm', label: 'LLM' },
  { value: 'storage', label: 'Storage' },
  { value: 'lims', label: 'LIMS' },
];

const KIND_COLORS: Record<ProviderKind, string> = {
  ocr: 'blue',
  llm: 'purple',
  storage: 'green',
  lims: 'orange',
};

const KIND_DESCRIPTIONS: Record<ProviderKind, string> = {
  ocr: '用于识别文档中的文字内容',
  llm: '用于智能提取和理解识别结果',
  storage: '用于存储上传的文件和识别结果',
  lims: '用于将识别结果回写到实验室信息系统',
};

interface ProviderFormData {
  key: string;
  kind: ProviderKind;
  displayName: string;
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
}

const EMPTY_FORM: ProviderFormData = {
  key: '',
  kind: 'ocr',
  displayName: '',
  endpoint: '',
  apiKey: '',
  isDefault: false,
};

export default function ProviderPage() {
  const { data, isLoading, error, refetch } = useProviders();
  const setDefaultMutation = useSetDefaultProvider();
  const healthCheckMutation = useCheckProviderHealth();
  const createMutation = useCreateProvider();
  const updateMutation = useUpdateProvider();
  const deleteMutation = useDeleteProvider();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(EMPTY_FORM);
  const [healthResult, setHealthResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [form] = Form.useForm();

  const providers = data?.items || [];

  // 获取任务统计数据以计算 Provider 使用次数
  const { data: jobsData } = useQuery({
    queryKey: ['jobs-for-provider-stats'],
    queryFn: () => jobsApi.list(500),
    staleTime: 30000,
  });

  const providerUsageMap = useMemo(() => {
    const map: Record<string, { total: number; completed: number; failed: number }> = {};
    const jobs = jobsData?.items || [];
    for (const job of jobs) {
      const key = job.providerConfig?.providerKey || job.providerConfig?.ocrProviderKey || '';
      if (!key) continue;
      if (!map[key]) map[key] = { total: 0, completed: 0, failed: 0 };
      map[key].total++;
      if (job.status === 'completed' || job.status === 'partial_completed') map[key].completed++;
      if (job.status === 'failed') map[key].failed++;
    }
    return map;
  }, [jobsData]);

  // Sync formData -> form when modal opens
  useEffect(() => {
    if (modalVisible) {
      form.setFieldsValue(formData);
    }
  }, [modalVisible, formData, form]);

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormData(EMPTY_FORM);
    setHealthResult(null);
    setModalVisible(true);
  };

  const openEditModal = (p: ProviderConfig) => {
    setEditingProvider(p);
    setFormData({
      key: p.key,
      kind: p.kind,
      displayName: p.displayName,
      endpoint: p.config?.endpoint || '',
      apiKey: '',
      isDefault: p.isDefault,
    });
    setHealthResult(null);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingProvider(null);
    setHealthResult(null);
  };

  const handleFormChange = (_values: Partial<ProviderFormData>, allValues: Partial<ProviderFormData>) => {
    setFormData({ ...EMPTY_FORM, ...allValues });
  };

  const handleTestConnection = async () => {
    const values = form.getFieldsValue() as ProviderFormData;
    if (!values.key) {
      toast.warning('请先填写 Key');
      return;
    }
    setHealthLoading(true);
    setHealthResult(null);
    try {
      // For new providers that don't exist yet, we test by saving first then checking
      // For existing providers, directly check health
      if (editingProvider) {
        const res = await healthCheckMutation.mutateAsync(editingProvider.key);
        if (res.health.healthy) {
          setHealthResult({ ok: true, message: `连接正常 (${res.health.latency}ms)` });
        } else {
          setHealthResult({ ok: false, message: res.health.message || '连接异常' });
        }
      } else {
        setHealthResult({ ok: false, message: '请先保存后再测试连接' });
      }
    } catch {
      setHealthResult({ ok: false, message: '健康检查失败' });
    } finally {
      setHealthLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await form.validate();
    } catch {
      return;
    }

    const values = form.getFieldsValue() as ProviderFormData;

    if (editingProvider) {
      // Update existing provider
      const body: Record<string, unknown> = {
        displayName: values.displayName,
        isDefault: values.isDefault,
        config: {
          ...(editingProvider.config || {}),
          endpoint: values.endpoint,
        },
      };
      if (values.apiKey) {
        (body.config as Record<string, unknown>).apiKey = values.apiKey;
      }

      try {
        await updateMutation.mutateAsync({ key: editingProvider.key, body });
        toast.success('更新成功');
        closeModal();
      } catch (err) {
        const apiErr = err as ApiError;
        toast.error(`更新失败：${apiErr.userMessage || '未知错误'}`);
      }
    } else {
      // Create new provider
      try {
        await createMutation.mutateAsync({
          key: values.key,
          kind: values.kind,
          displayName: values.displayName,
          enabled: true,
          isDefault: values.isDefault,
          config: {
            endpoint: values.endpoint,
            ...(values.apiKey ? { apiKey: values.apiKey } : {}),
          },
        });
        toast.success('创建成功');
        closeModal();
      } catch (err) {
        const apiErr = err as ApiError;
        toast.error(`创建失败：${apiErr.userMessage || '未知错误'}`);
      }
    }
  };

  const handleDelete = async (key: string) => {
    try {
      await deleteMutation.mutateAsync(key);
      toast.success('已删除');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 409) {
        toast.error('该 Provider 有关联任务，无法删除');
      } else {
        toast.error(`删除失败：${apiErr.userMessage || '未知错误'}`);
      }
    }
  };

  const handleToggleEnabled = async (provider: ProviderConfig) => {
    const newEnabled = provider.status !== 'active';
    try {
      await updateMutation.mutateAsync({
        key: provider.key,
        body: { enabled: newEnabled },
      });
      toast.success(newEnabled ? '已启用' : '已禁用');
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error(`操作失败：${apiErr.userMessage || '未知错误'}`);
    }
  };

  const handleSetDefault = async (key: string) => {
    try {
      await setDefaultMutation.mutateAsync(key);
      toast.success('已设为默认');
    } catch {
      toast.error('设置失败');
    }
  };

  const handleHealthCheck = async (key: string) => {
    try {
      const res = await healthCheckMutation.mutateAsync(key);
      if (res.health.healthy) {
        toast.success(`${key} 健康 (${res.health.latency}ms)`);
      } else {
        toast.warning(`${key} 异常: ${res.health.message || '未知'}`);
      }
    } catch {
      toast.error('健康检查失败');
    }
  };

  const renderProviderCard = (p: ProviderConfig) => {
    const endpoint = p.config?.endpoint;
    const showEndpoint = endpoint && endpoint !== '-';
    const usage = providerUsageMap[p.key];

    return (
      <Col key={p.id} xs={24} sm={12} lg={8}>
        <Card style={{ height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Space>
              <Title heading={6} style={{ margin: 0 }}>{p.displayName}</Title>
              {p.isDefault && <Tag color="blue">默认</Tag>}
            </Space>
            <Switch
              checked={p.status === 'active'}
              onChange={() => handleToggleEnabled(p)}
              loading={updateMutation.isPending}
              size="small"
              checkedText="启用"
              uncheckedText="禁用"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Tag
              color={KIND_COLORS[p.kind] || 'gray'}
              style={{ marginBottom: 8 }}
            >
              {p.kind.toUpperCase()}
            </Tag>
          </div>

          <Descriptions
            column={1}
            data={[
              { label: 'Key', value: <Text style={{ wordBreak: 'break-all' }}>{p.key}</Text> },
              ...(showEndpoint ? [{
                label: 'Endpoint',
                value: (
                  <Text
                    style={{
                      wordBreak: 'break-all',
                      fontSize: 12,
                      display: 'block',
                      maxWidth: '100%',
                    }}
                    title={endpoint}
                  >
                    {endpoint}
                  </Text>
                )
              }] : []),
              { label: '创建时间', value: p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '-' },
              ...(usage ? [{
                label: '使用统计',
                value: (
                  <Space size={8}>
                    <Tag size="small" color="blue">共 {usage.total} 次</Tag>
                    <Tag size="small" color="green">成功 {usage.completed}</Tag>
                    {usage.failed > 0 && <Tag size="small" color="red">失败 {usage.failed}</Tag>}
                  </Space>
                ),
              }] : []),
            ]}
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size="small">
              {!p.isDefault && (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => handleSetDefault(p.key)}
                  loading={setDefaultMutation.isPending}
                >
                  设为默认
                </Button>
              )}
              <Button
                size="small"
                onClick={() => handleHealthCheck(p.key)}
                loading={healthCheckMutation.isPending}
              >
                健康检查
              </Button>
            </Space>
            <Space size="small">
              <Button size="small" icon={<IconPencil />} onClick={() => openEditModal(p)}>
                编辑
              </Button>
              <Popconfirm
                title="确认删除此 Provider？删除后无法恢复。"
                onOk={() => handleDelete(p.key)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ status: 'danger' }}
              >
                <Button
                  size="small"
                  status="danger"
                  icon={<IconTrash />}
                  loading={deleteMutation.isPending}
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </Card>
      </Col>
    );
  };

  const renderProviderList = (list: ProviderConfig[]) => (
    <Row gutter={[16, 16]}>
      {list.map((p: ProviderConfig) => renderProviderCard(p))}
    </Row>
  );

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Provider 管理"
          subtitle="管理 OCR 和 LLM Provider"
        />
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((i) => (
            <Col key={i} span={8}>
              <Card style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Skeleton width={120} height={20} />
                  <Skeleton variant="rounded" width={48} height={22} />
                </div>
                <Skeleton variant="rounded" width={40} height={20} style={{ marginBottom: 12 }} />
                <Skeleton variant="text" lines={3} style={{ marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Skeleton variant="rounded" width={60} height={28} />
                  <Skeleton variant="rounded" width={60} height={28} />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Provider 管理"
          subtitle="管理 OCR 和 LLM Provider"
          action="新建 Provider"
          onAction={openCreateModal}
          onRefresh={() => refetch()}
        />
        <Card>
          <EmptyState
            title="还没有配置 Provider"
            description="添加 OCR 或 LLM Provider 后即可开始识别"
            action={{ label: '新建 Provider', onClick: openCreateModal }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="配置管理"
        title="Provider 管理"
        subtitle={`共 ${providers.length} 个 Provider`}
        action="新建 Provider"
        onAction={openCreateModal}
        onRefresh={() => refetch()}
      />

      <Tabs defaultActiveTab="all">
        <TabPane
          key="all"
          title="全部"
        >
          <div style={{ paddingTop: 16 }}>
            {renderProviderList(providers)}
          </div>
        </TabPane>
        {KIND_OPTIONS.map((opt) => (
          <TabPane
            key={opt.value}
            title={
              <span>
                {opt.label}
                <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                  {KIND_DESCRIPTIONS[opt.value]}
                </Text>
              </span>
            }
          >
            <div style={{ paddingTop: 16 }}>
              {renderProviderList(providers.filter((p: ProviderConfig) => p.kind === opt.value))}
            </div>
          </TabPane>
        ))}
      </Tabs>

      <Modal
        title={editingProvider ? '编辑 Provider' : '新建 Provider'}
        visible={modalVisible}
        onOk={handleSave}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="保存"
        cancelText="取消"
        style={{ width: 560 }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={formData}
          onChange={handleFormChange}
        >
          <FormItem
            label="Key"
            field="key"
            rules={[{ required: true, message: '请输入 Key' }]}
            disabled={!!editingProvider}
          >
            <Input
              placeholder="唯一标识，如 ocr-baidu"
              disabled={!!editingProvider}
            />
          </FormItem>

          <FormItem
            label="类型"
            field="kind"
            rules={[{ required: true, message: '请选择类型' }]}
            disabled={!!editingProvider}
          >
            <Select placeholder="选择 Provider 类型" disabled={!!editingProvider}>
              {KIND_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </FormItem>

          <FormItem
            label="名称"
            field="displayName"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="显示名称，如百度 OCR" />
          </FormItem>

          <FormItem
            label="Endpoint URL"
            field="endpoint"
          >
            <Input placeholder="https://api.example.com/v1" />
          </FormItem>

          <FormItem
            label="API Key"
            field="apiKey"
            extra={editingProvider ? '留空则保持不变' : undefined}
          >
            <Input.Password placeholder="输入 API Key" />
          </FormItem>

          <FormItem
            label="设为默认"
            field="isDefault"
            triggerPropName="checked"
          >
            <Switch />
          </FormItem>
        </Form>

        {healthResult && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 4,
              backgroundColor: healthResult.ok ? 'var(--color-success-light-1)' : 'var(--color-danger-light-1)',
              color: healthResult.ok ? 'var(--color-success-6)' : 'var(--color-danger-6)',
              fontSize: 13,
            }}
          >
            {healthResult.message}
          </div>
        )}

        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button
            size="small"
            loading={healthLoading}
            onClick={handleTestConnection}
            disabled={!editingProvider}
          >
            测试连接
          </Button>
        </div>
      </Modal>
    </div>
  );
}
