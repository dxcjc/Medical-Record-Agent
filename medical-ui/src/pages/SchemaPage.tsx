import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
  Message,
  Descriptions,
  Typography,
  Space,
  Drawer,
  Form,
  Input,
  Select,
  Switch,
  Table,
  Popconfirm,
} from '@arco-design/web-react';
import { IconLeft, IconSettings, IconPlus, IconDelete, IconUp, IconDown } from '@arco-design/web-react/icon';
import { useSchemas, useDeactivateSchemaVersion, useRollbackSchemaVersion, useCreateSchemaDraft, usePublishSchemaDraft } from '../hooks/useSchemas';
import { useFieldStats } from '../hooks/useFieldStats';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import Skeleton from '../components/Skeleton';
import StatusTag from '../components/StatusTag';
import FieldCard from '../components/FieldCard';
import { groupSchemaFields } from '../utils/schemaGroups';
import type { SchemaVersion, SchemaField } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;

/** UUID v4 generator (no external dep) */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type FieldType = 'string' | 'number' | 'boolean' | 'date';

const FIELD_TYPE_OPTIONS: { label: string; value: FieldType }[] = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'date', value: 'date' },
];

/** Editable row used inside the drawer field editor table */
interface EditableField {
  _rowId: string;
  key: string;
  type: FieldType;
  description: string;
  required: boolean;
  enumMapStr: string;
}

function fromEditable(rows: EditableField[]): SchemaField[] {
  return rows.map((r) => {
    const field: SchemaField = {
      key: r.key,
      type: r.type,
      description: r.description || undefined,
      required: r.required || undefined,
    };
    if (r.enumMapStr.trim()) {
      const map: Record<string, string> = {};
      for (const part of r.enumMapStr.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          map[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
        } else {
          map[trimmed] = trimmed;
        }
      }
      field.enumMap = map;
    }
    return field;
  });
}

export default function SchemaPage() {
  const { data, isLoading, error, refetch } = useSchemas();
  const deactivateMutation = useDeactivateSchemaVersion();
  const rollbackMutation = useRollbackSchemaVersion();
  const createDraftMutation = useCreateSchemaDraft();
  const publishDraftMutation = usePublishSchemaDraft();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localFields, setLocalFields] = useState<SchemaField[] | null>(null);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [form] = Form.useForm();
  const [fieldRows, setFieldRows] = useState<EditableField[]>([]);
  const [saving, setSaving] = useState(false);

  const schemas = data?.items || [];
  const selected = schemas.find((s) => s.id === selectedId) || null;
  const schemaKey = selected?.schemaKey;

  const { data: statsData } = useFieldStats(schemaKey);
  const statsMap = useMemo(() => {
    const map = new Map<string, typeof statsData extends { stats: infer S } ? S extends Array<infer T> ? T : never : never>();
    if (statsData?.stats) {
      for (const s of statsData.stats) {
        map.set(s.fieldKey, s as never);
      }
    }
    return map;
  }, [statsData]);

  const fields: SchemaField[] = localFields || selected?.definition?.fields || [];
  const fieldGroups = useMemo(() => groupSchemaFields(fields), [fields]);

  const handleFieldUpdate = (key: string, updates: Partial<SchemaField>) => {
    const updatedFields = fields.map((f) =>
      f.key === key ? { ...f, ...updates } : f
    );
    setLocalFields(updatedFields);
  };

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateMutation.mutateAsync(id);
      Message.success('已停用');
    } catch {
      Message.error('操作失败');
    }
  };

  const handleRollback = async (id: string) => {
    try {
      await rollbackMutation.mutateAsync(id);
      Message.success('已回滚');
    } catch {
      Message.error('操作失败');
    }
  };

  // ── Drawer helpers ──────────────────────────────────────────────

  const openDrawer = useCallback(() => {
    form.resetFields();
    setFieldRows([]);
    setDrawerVisible(true);
  }, [form]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    form.resetFields();
    setFieldRows([]);
  }, [form]);

  const addFieldRow = useCallback(() => {
    setFieldRows((prev) => [
      ...prev,
      { _rowId: uuid(), key: '', type: 'string', description: '', required: false, enumMapStr: '' },
    ]);
  }, []);

  const removeFieldRow = useCallback((rowId: string) => {
    setFieldRows((prev) => prev.filter((r) => r._rowId !== rowId));
  }, []);

  const moveFieldRow = useCallback((rowId: string, direction: 'up' | 'down') => {
    setFieldRows((prev) => {
      const idx = prev.findIndex((r) => r._rowId === rowId);
      if (idx < 0) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const updateFieldRow = useCallback((rowId: string, field: keyof EditableField, value: unknown) => {
    setFieldRows((prev) =>
      prev.map((r) => (r._rowId === rowId ? { ...r, [field]: value } : r))
    );
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await form.validate();
    } catch {
      return;
    }

    const values = form.getFieldsValue() as { schemaKey: string; displayName: string; description?: string };

    // Validate field keys are non-empty
    const emptyKeyRow = fieldRows.find((r) => !r.key.trim());
    if (emptyKeyRow) {
      Message.warning('所有字段的"字段名"不能为空');
      return;
    }

    // Check for duplicate field keys
    const keys = fieldRows.map((r) => r.key.trim());
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) {
      Message.warning(`字段名 "${dupKey}" 重复，请修改`);
      return;
    }

    setSaving(true);
    try {
      const definition = { fields: fromEditable(fieldRows) };
      const { draft } = await createDraftMutation.mutateAsync({
        schemaKey: values.schemaKey,
        displayName: values.displayName,
        definition,
      });

      // Auto-publish the draft
      await publishDraftMutation.mutateAsync({
        id: draft.id,
        changelog: values.description || `初始版本 - ${values.displayName}`,
      });

      Message.success('Schema 创建并发布成功');
      closeDrawer();
      refetch();
    } catch {
      Message.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [form, fieldRows, createDraftMutation, publishDraftMutation, closeDrawer, refetch]);

  // ── Loading / Error / Empty states ─────────────────────────────

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
          title="Schema 管理"
          subtitle="管理识别 Schema 版本"
        />
        <Row gutter={[16, 16]}>
          {[0, 1].map((i) => (
            <Col key={i} xs={24} lg={12}>
              <Card style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <Skeleton width={150} height={20} style={{ marginBottom: 4 }} />
                    <Skeleton width={100} height={14} />
                  </div>
                  <Skeleton variant="rounded" width={50} height={20} />
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Skeleton variant="rounded" width={80} height={22} />
                  <Skeleton width={120} height={14} />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Schema 管理"
          subtitle="管理识别 Schema 版本"
          action="新建 Schema"
          onAction={openDrawer}
          onRefresh={() => refetch()}
        />
        <Card>
          <EmptyState
            title="还没有 Schema 定义"
            description="Schema 定义了识别任务的字段结构，创建后即可使用"
            action={{ label: '新建 Schema', onClick: openDrawer }}
          />
        </Card>
        <CreateSchemaDrawer
          visible={drawerVisible}
          onClose={closeDrawer}
          onSave={handleSave}
          form={form}
          fieldRows={fieldRows}
          addFieldRow={addFieldRow}
          removeFieldRow={removeFieldRow}
          moveFieldRow={moveFieldRow}
          updateFieldRow={updateFieldRow}
          saving={saving}
        />
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────

  if (selected) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Schema 详情"
          subtitle={`${selected.displayName} · v${selected.version}`}
          onRefresh={() => refetch()}
        />

        {/* Back button + actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Button
            icon={<IconLeft />}
            onClick={() => { setSelectedId(null); setLocalFields(null); }}
          >
            返回列表
          </Button>
          <Space>
            <Button
              size="small"
              status="warning"
              loading={deactivateMutation.isPending}
              onClick={() => handleDeactivate(selected.id)}
              disabled={selected.status === 'inactive'}
            >
              停用
            </Button>
            <Button
              size="small"
              loading={rollbackMutation.isPending}
              onClick={() => handleRollback(selected.id)}
            >
              回滚
            </Button>
          </Space>
        </div>

        {/* Schema info card */}
        <Card
          style={{
            marginBottom: 20,
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          <Descriptions
            column={3}
            data={[
              { label: 'Schema Key', value: selected.schemaKey },
              { label: '版本', value: String(selected.version) },
              { label: '状态', value: <StatusTag status={selected.status} /> },
              {
                label: '发布时间',
                value: selected.publishedAt
                  ? new Date(selected.publishedAt).toLocaleString('zh-CN')
                  : '-',
              },
              { label: '字段数', value: String(fields.length) },
              ...(selected.changelog
                ? [{ label: '变更说明', value: selected.changelog }]
                : []),
            ]}
          />
        </Card>

        {/* Field cards - 2 per row */}
        <div>
          <Title heading={6} style={{ marginBottom: 16 }}>字段定义</Title>
          {fields.length === 0 ? (
            <Text type="secondary">暂无字段定义</Text>
          ) : (
            <Space direction="vertical" size={24} style={{ width: '100%' }}>
              {fieldGroups.map((group) => (
                <div key={group.key}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: '2px solid var(--color-border-2)',
                  }}>
                    <Tag color="blue" size="small">{group.fields.length}</Tag>
                    <Text bold style={{ fontSize: 15 }}>{group.label}</Text>
                  </div>
                  <Row gutter={[16, 16]}>
                    {group.fields.map((field) => (
                      <Col key={field.key} xs={24} lg={12}>
                        <FieldCard
                          field={field}
                          stats={statsMap.get(field.key)}
                          onUpdate={handleFieldUpdate}
                        />
                      </Col>
                    ))}
                  </Row>
                </div>
              ))}
            </Space>
          )}
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        eyebrow="配置管理"
        title="Schema 管理"
        subtitle={`共 ${schemas.length} 个 Schema 版本`}
        action="新建 Schema"
        onAction={openDrawer}
        onRefresh={() => refetch()}
      />

      <Row gutter={[16, 16]}>
        {schemas.map((s) => {
          const fieldCount = s.definition?.fields?.length || 0;
          return (
            <Col key={s.id} xs={24} lg={12}>
              <Card
                hoverable
                onClick={() => {
                  setSelectedId(s.id);
                  setLocalFields(null);
                }}
                style={{
                  borderRadius: 12,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  border: '1px solid var(--color-border-2)',
                  transition: 'all 0.2s',
                }}
                bodyStyle={{ padding: '20px 24px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <Title heading={5} style={{ marginBottom: 4 }}>{s.displayName}</Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {s.schemaKey} · v{s.version}
                    </Text>
                  </div>
                  <StatusTag status={s.status} />
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <Tag color="blue" icon={<IconSettings />}>
                    {fieldCount} 个字段
                  </Tag>
                  {s.publishedAt && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      发布于 {new Date(s.publishedAt).toLocaleString('zh-CN')}
                    </Text>
                  )}
                </div>

                {s.changelog && (
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, marginTop: 8, display: 'block' }}
                  >
                    {s.changelog}
                  </Text>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      <CreateSchemaDrawer
        visible={drawerVisible}
        onClose={closeDrawer}
        onSave={handleSave}
        form={form}
        fieldRows={fieldRows}
        addFieldRow={addFieldRow}
        removeFieldRow={removeFieldRow}
        moveFieldRow={moveFieldRow}
        updateFieldRow={updateFieldRow}
        saving={saving}
      />
    </div>
  );
}

// ── Drawer sub-component ────────────────────────────────────────

interface CreateSchemaDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  form: ReturnType<typeof Form.useForm>[0];
  fieldRows: EditableField[];
  addFieldRow: () => void;
  removeFieldRow: (rowId: string) => void;
  moveFieldRow: (rowId: string, dir: 'up' | 'down') => void;
  updateFieldRow: (rowId: string, field: keyof EditableField, value: unknown) => void;
  saving: boolean;
}

function CreateSchemaDrawer({
  visible,
  onClose,
  onSave,
  form,
  fieldRows,
  addFieldRow,
  removeFieldRow,
  moveFieldRow,
  updateFieldRow,
  saving,
}: CreateSchemaDrawerProps) {
  return (
    <Drawer
      title="新建 Schema"
      visible={visible}
      onCancel={onClose}
      width={780}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={onSave}>
            保存
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          field="schemaKey"
          label="Schema Key"
          rules={[{ required: true, message: '请输入 Schema Key（英文标识符）' }]}
        >
          <Input placeholder="例: cbc_report" />
        </Form.Item>
        <Form.Item
          field="displayName"
          label="Display Name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="例: 血常规报告" />
        </Form.Item>
        <Form.Item field="description" label="Description">
          <Input.TextArea placeholder="Schema 描述（可选）" rows={2} />
        </Form.Item>
      </Form>

      {/* Field editor section */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Title heading={6} style={{ margin: 0 }}>字段定义</Title>
          <Button type="outline" size="small" icon={<IconPlus />} onClick={addFieldRow}>
            添加字段
          </Button>
        </div>

        {fieldRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-3)' }}>
            暂无字段，点击"添加字段"开始定义
          </div>
        ) : (
          <Table
            data={fieldRows}
            rowKey="_rowId"
            border
            size="small"
            pagination={false}
            scroll={{ x: 640 }}
            columns={[
              {
                title: '排序',
                width: 70,
                align: 'center',
                render: (_: unknown, _record: EditableField, idx: number) => (
                  <Space size={2}>
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconUp />}
                      disabled={idx === 0}
                      onClick={() => moveFieldRow(_record._rowId, 'up')}
                    />
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconDown />}
                      disabled={idx === fieldRows.length - 1}
                      onClick={() => moveFieldRow(_record._rowId, 'down')}
                    />
                  </Space>
                ),
              },
              {
                title: '字段名 (key)',
                dataIndex: 'key',
                width: 140,
                render: (_: unknown, record: EditableField) => (
                  <Input
                    size="small"
                    value={record.key}
                    placeholder="english_key"
                    onChange={(val) => updateFieldRow(record._rowId, 'key', val)}
                  />
                ),
              },
              {
                title: '类型',
                dataIndex: 'type',
                width: 110,
                render: (_: unknown, record: EditableField) => (
                  <Select
                    size="small"
                    value={record.type}
                    options={FIELD_TYPE_OPTIONS}
                    onChange={(val) => updateFieldRow(record._rowId, 'type', val as FieldType)}
                  />
                ),
              },
              {
                title: '描述',
                dataIndex: 'description',
                width: 180,
                render: (_: unknown, record: EditableField) => (
                  <Input
                    size="small"
                    value={record.description}
                    placeholder="字段描述"
                    onChange={(val) => updateFieldRow(record._rowId, 'description', val)}
                  />
                ),
              },
              {
                title: '必填',
                dataIndex: 'required',
                width: 60,
                align: 'center',
                render: (_: unknown, record: EditableField) => (
                  <Switch
                    size="small"
                    checked={record.required}
                    onChange={(val) => updateFieldRow(record._rowId, 'required', val)}
                  />
                ),
              },
              {
                title: '枚举值',
                dataIndex: 'enumMapStr',
                width: 160,
                render: (_: unknown, record: EditableField) => (
                  <Input
                    size="small"
                    value={record.enumMapStr}
                    placeholder="k1:v1, k2:v2"
                    onChange={(val) => updateFieldRow(record._rowId, 'enumMapStr', val)}
                  />
                ),
              },
              {
                title: '操作',
                width: 50,
                align: 'center',
                render: (_: unknown, record: EditableField) => (
                  <Popconfirm
                    title="确定删除该字段？"
                    onOk={() => removeFieldRow(record._rowId)}
                  >
                    <Button type="text" size="mini" status="danger" icon={<IconDelete />} />
                  </Popconfirm>
                ),
              },
            ]}
          />
        )}
      </div>
    </Drawer>
  );
}
