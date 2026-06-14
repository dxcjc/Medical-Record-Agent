import { useState, useEffect } from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Message,
  Typography,
  Space,
  Descriptions,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
} from '@arco-design/web-react';
import {
  useProviders,
  useSetDefaultProvider,
  useCheckProviderHealth,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
} from '../hooks/useProviders';
import { ApiError } from '../api/client';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { IconPlus, IconPencil, IconTrash } from '../icons/appIcons';
import type { ProviderConfig, ProviderKind } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;
const FormItem = Form.Item;
const Option = Select.Option;

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
      Message.warning('请先填写 Key');
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
        Message.success('更新成功');
        closeModal();
      } catch (err) {
        const apiErr = err as ApiError;
        Message.error(`更新失败：${apiErr.userMessage || '未知错误'}`);
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
        Message.success('创建成功');
        closeModal();
      } catch (err) {
        const apiErr = err as ApiError;
        Message.error(`创建失败：${apiErr.userMessage || '未知错误'}`);
      }
    }
  };

  const handleDelete = async (key: string) => {
    try {
      await deleteMutation.mutateAsync(key);
      Message.success('已删除');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 409) {
        Message.error('该 Provider 有关联任务，无法删除');
      } else {
        Message.error(`删除失败：${apiErr.userMessage || '未知错误'}`);
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
      Message.success(newEnabled ? '已启用' : '已禁用');
    } catch (err) {
      const apiErr = err as ApiError;
      Message.error(`操作失败：${apiErr.userMessage || '未知错误'}`);
    }
  };

  const handleSetDefault = async (key: string) => {
    try {
      await setDefaultMutation.mutateAsync(key);
      Message.success('已设为默认');
    } catch {
      Message.error('设置失败');
    }
  };

  const handleHealthCheck = async (key: string) => {
    try {
      const res = await healthCheckMutation.mutateAsync(key);
      if (res.health.healthy) {
        Message.success(`${key} 健康 (${res.health.latency}ms)`);
      } else {
        Message.warning(`${key} 异常: ${res.health.message || '未知'}`);
      }
    } catch {
      Message.error('健康检查失败');
    }
  };

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
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size={40} />
        </div>
      </Card>
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
            title="暂无 Provider"
            description="点击上方按钮创建第一个 Provider"
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

      <Row gutter={[16, 16]}>
        {providers.map((p: ProviderConfig) => (
          <Col key={p.id} span={8}>
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
                  { label: 'Key', value: p.key },
                  { label: 'Endpoint', value: p.config?.endpoint || '-' },
                  { label: '创建时间', value: new Date(p.createdAt).toLocaleString('zh-CN') },
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
                  <Button
                    size="small"
                    icon={<IconPencil />}
                    onClick={() => openEditModal(p)}
                  >
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
        ))}
      </Row>

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
