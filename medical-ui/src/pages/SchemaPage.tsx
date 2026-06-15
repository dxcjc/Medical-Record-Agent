import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  Tag,
  Button,
  Spin,
  Grid,
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
  Modal,
  Timeline,
  Divider,
} from '@arco-design/web-react';
import { toast } from '../components/GlobalToast';
import { IconLeft, IconSettings, IconPlus, IconDelete, IconUp, IconDown, IconSwap, IconClockCircle, IconUpload, IconDownload } from '@arco-design/web-react/icon';
import { useSchemas, useDeactivateSchemaVersion, useActivateSchemaVersion, useRollbackSchemaVersion, useCreateSchemaDraft, usePublishSchemaDraft } from '../hooks/useSchemas';
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

// ── Version diff types & helpers ──────────────────────────────────

type DiffKind = 'added' | 'removed' | 'modified' | 'unchanged';

interface FieldDiffRow {
  key: string;
  kind: DiffKind;
  oldField?: SchemaField;
  newField?: SchemaField;
  changes?: string[];
}

/** Compute a side-by-side diff of two fields arrays. */
function computeFieldDiff(oldFields: SchemaField[], newFields: SchemaField[]): FieldDiffRow[] {
  const oldMap = new Map(oldFields.map((f) => [f.key, f]));
  const newMap = new Map(newFields.map((f) => [f.key, f]));

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const rows: FieldDiffRow[] = [];

  for (const key of allKeys) {
    const oldF = oldMap.get(key);
    const newF = newMap.get(key);

    if (!oldF && newF) {
      rows.push({ key, kind: 'added', newField: newF });
    } else if (oldF && !newF) {
      rows.push({ key, kind: 'removed', oldField: oldF });
    } else if (oldF && newF) {
      const changes: string[] = [];
      if (oldF.type !== newF.type) changes.push(`类型: ${oldF.type ?? '-'} -> ${newF.type ?? '-'}`);
      if (oldF.description !== newF.description) changes.push('描述已变更');
      if (!!oldF.required !== !!newF.required) changes.push(`必填: ${oldF.required ? '是' : '否'} -> ${newF.required ? '是' : '否'}`);
      if (oldF.label !== newF.label) changes.push('标签已变更');
      if (JSON.stringify(oldF.enumMap) !== JSON.stringify(newF.enumMap)) changes.push('枚举值已变更');

      rows.push({
        key,
        kind: changes.length > 0 ? 'modified' : 'unchanged',
        oldField: oldF,
        newField: newF,
        changes: changes.length > 0 ? changes : undefined,
      });
    }
  }

  // Sort: modified first, then added, then removed, then unchanged
  const order: Record<DiffKind, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
  rows.sort((a, b) => order[a.kind] - order[b.kind]);
  return rows;
}

const DIFF_KIND_CONFIG: Record<DiffKind, { label: string; color: string; bgColor: string }> = {
  added: { label: '新增', color: '#00b42a', bgColor: '#e6fffb' },
  removed: { label: '删除', color: '#f53f3f', bgColor: '#fff1f0' },
  modified: { label: '修改', color: '#ff7d00', bgColor: '#fffbe6' },
  unchanged: { label: '未变', color: '#86909c', bgColor: 'transparent' },
};

// ── Schema Diff Modal Component ──────────────────────────────────

interface SchemaDiffModalProps {
  visible: boolean;
  onClose: () => void;
  oldVersion: SchemaVersion;
  newVersion: SchemaVersion;
}

function SchemaDiffModal({ visible, onClose, oldVersion, newVersion }: SchemaDiffModalProps) {
  const oldFields = oldVersion.definition?.fields || [];
  const newFields = newVersion.definition?.fields || [];
  const diffRows = useMemo(() => computeFieldDiff(oldFields, newFields), [oldFields, newFields]);

  const addedCount = diffRows.filter((r) => r.kind === 'added').length;
  const removedCount = diffRows.filter((r) => r.kind === 'removed').length;
  const modifiedCount = diffRows.filter((r) => r.kind === 'modified').length;

  return (
    <Modal
      title="Schema 版本对比"
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 880 }}
    >
      {/* Header: version info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Card size="small" style={{ flex: 1, marginRight: 8, borderRadius: 8 }}>
          <Space direction="vertical" size={4}>
            <Text bold>旧版本</Text>
            <Text type="secondary">v{oldVersion.version} · {oldVersion.displayName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {oldVersion.publishedAt ? new Date(oldVersion.publishedAt).toLocaleString('zh-CN') : '-'}
            </Text>
          </Space>
        </Card>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          <IconSwap style={{ fontSize: 20, color: '#86909c' }} />
        </div>
        <Card size="small" style={{ flex: 1, marginLeft: 8, borderRadius: 8 }}>
          <Space direction="vertical" size={4}>
            <Text bold>新版本</Text>
            <Text type="secondary">v{newVersion.version} · {newVersion.displayName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {newVersion.publishedAt ? new Date(newVersion.publishedAt).toLocaleString('zh-CN') : '-'}
            </Text>
          </Space>
        </Card>
      </div>

      {/* Summary tags */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Tag color="green">新增 {addedCount}</Tag>
        <Tag color="red">删除 {removedCount}</Tag>
        <Tag color="orange">修改 {modifiedCount}</Tag>
        <Tag>未变 {diffRows.length - addedCount - removedCount - modifiedCount}</Tag>
      </div>

      {/* Diff table */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <Table
          data={diffRows.map((r, i) => ({ ...r, _idx: i }))}
          rowKey="_idx"
          border
          size="small"
          pagination={false}
          columns={[
            {
              title: '状态',
              width: 70,
              align: 'center',
              render: (_: unknown, record: FieldDiffRow) => (
                <Tag color={DIFF_KIND_CONFIG[record.kind].color} size="small">
                  {DIFF_KIND_CONFIG[record.kind].label}
                </Tag>
              ),
            },
            {
              title: '字段名',
              dataIndex: 'key',
              width: 140,
            },
            {
              title: '旧版本',
              width: 140,
              render: (_: unknown, record: FieldDiffRow) => (
                record.oldField ? (
                  <Text style={record.kind === 'removed' ? { textDecoration: 'line-through' } : undefined}>
                    {record.oldField.type || '-'}
                  </Text>
                ) : <Text type="secondary">-</Text>
              ),
            },
            {
              title: '新版本',
              width: 140,
              render: (_: unknown, record: FieldDiffRow) => (
                record.newField ? <Text>{record.newField.type || '-'}</Text> : <Text type="secondary">-</Text>
              ),
            },
            {
              title: '变更说明',
              render: (_: unknown, record: FieldDiffRow) => (
                record.changes && record.changes.length > 0
                  ? <Text type="secondary" style={{ fontSize: 12 }}>{record.changes.join('; ')}</Text>
                  : <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
              ),
            },
          ]}
          rowClassName={(record: FieldDiffRow) => ''}
          onRow={(record: FieldDiffRow) => ({
            style: { backgroundColor: DIFF_KIND_CONFIG[record.kind].bgColor },
          })}
        />
      </div>
    </Modal>
  );
}

export default function SchemaPage() {
  const { data, isLoading, error, refetch } = useSchemas();
  const deactivateMutation = useDeactivateSchemaVersion();
  const activateMutation = useActivateSchemaVersion();
  const rollbackMutation = useRollbackSchemaVersion();
  const createDraftMutation = useCreateSchemaDraft();
  const publishDraftMutation = usePublishSchemaDraft();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localFields, setLocalFields] = useState<SchemaField[] | null>(null);

  // Version compare state
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [form] = Form.useForm();
  const [fieldRows, setFieldRows] = useState<EditableField[]>([]);
  const [saving, setSaving] = useState(false);

  // Import state
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');

  // Deactivate confirm modal state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; displayName: string } | null>(null);

  const schemas = data?.items || [];
  const selected = schemas.find((s) => s.id === selectedId) || null;
  const schemaKey = selected?.schemaKey;

  // Derive version history for the selected schema's schemaKey
  const versionHistory = useMemo(() => {
    if (!schemaKey) return [];
    return schemas
      .filter((s) => s.schemaKey === schemaKey)
      .sort((a, b) => b.version - a.version);
  }, [schemas, schemaKey]);

  // Compare modal state
  const compareVersion = schemas.find((s) => s.id === compareVersionId) || null;
  const diffModalVisible = !!compareVersion && !!selected;
  const handleOpenCompare = useCallback((versionId: string) => {
    setCompareVersionId(versionId);
  }, []);
  const handleCloseCompare = useCallback(() => {
    setCompareVersionId(null);
  }, []);

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

  const handleDeactivate = (id: string, displayName?: string) => {
    setDeactivateTarget({ id, displayName: displayName || '此 Schema' });
    setShowDeactivateModal(true);
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivateMutation.mutateAsync(deactivateTarget.id);
      toast.success('已停用');
    } catch {
      toast.error('操作失败');
    } finally {
      setShowDeactivateModal(false);
      setDeactivateTarget(null);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activateMutation.mutateAsync(id);
      toast.success('已启用');
    } catch {
      toast.error('操作失败');
    }
  };

  const handleRollback = async (id: string) => {
    try {
      await rollbackMutation.mutateAsync(id);
      toast.success('已回滚');
    } catch {
      toast.error('操作失败');
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
      toast.warning('所有字段的"字段名"不能为空');
      return;
    }

    // Check for duplicate field keys
    const keys = fieldRows.map((r) => r.key.trim());
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) {
      toast.warning(`字段名 "${dupKey}" 重复，请修改`);
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

      toast.success('Schema 创建并发布成功');
      closeDrawer();
      refetch();
    } catch {
      toast.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [form, fieldRows, createDraftMutation, publishDraftMutation, closeDrawer, refetch]);

  // ── Export handler ─────────────────────────────────────────────
  const handleExport = useCallback((schema: SchemaVersion) => {
    const exportData = {
      schemaKey: schema.schemaKey,
      displayName: schema.displayName,
      version: schema.version,
      definition: schema.definition,
      changelog: schema.changelog,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema-${schema.schemaKey}-v${schema.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Schema 已导出');
  }, []);

  // ── Import handler ─────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setImportError('');
    try {
      const parsed = JSON.parse(importJson);
      const schemaKey = parsed.schemaKey;
      const displayName = parsed.displayName;
      const definition = parsed.definition;
      if (!schemaKey || !displayName || !definition?.fields) {
        setImportError('JSON 格式不正确，需要包含 schemaKey、displayName 和 definition.fields');
        return;
      }
      const { draft } = await createDraftMutation.mutateAsync({
        schemaKey,
        displayName,
        definition,
      });
      await publishDraftMutation.mutateAsync({
        id: draft.id,
        changelog: parsed.changelog || `导入 - ${displayName}`,
      });
      toast.success('Schema 导入成功');
      setImportModalVisible(false);
      setImportJson('');
      refetch();
    } catch (e) {
      if (e instanceof SyntaxError) {
        setImportError('JSON 解析失败，请检查格式');
      } else {
        setImportError(`导入失败：${(e as Error).message || '未知错误'}`);
      }
    }
  }, [importJson, createDraftMutation, publishDraftMutation, refetch]);

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
              type="outline"
              icon={<IconDownload />}
              onClick={() => handleExport(selected)}
            >
              导出
            </Button>
            {selected.status === 'active' ? (
              <Button
                size="small"
                status="warning"
                loading={deactivateMutation.isPending}
                onClick={() => handleDeactivate(selected.id, selected.displayName)}
              >
                停用
              </Button>
            ) : (
              <Button
                size="small"
                type="primary"
                loading={activateMutation.isPending}
                onClick={() => handleActivate(selected.id)}
              >
                启用
              </Button>
            )}
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

        {/* Version History */}
        {versionHistory.length > 1 && (
          <div style={{ marginTop: 32 }}>
            <Title heading={6} style={{ marginBottom: 16 }}>版本历史</Title>
            <Timeline style={{ marginBottom: 16 }}>
              {versionHistory.map((v) => (
                <Timeline.Item
                  key={v.id}
                  dotColor={v.id === selected.id ? '#165dff' : v.status === 'active' ? '#00b42a' : '#c9cdd4'}
                  label={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <IconClockCircle style={{ marginRight: 4 }} />
                        {v.publishedAt ? new Date(v.publishedAt).toLocaleString('zh-CN') : '-'}
                      </Text>
                    </div>
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Text bold style={{ marginRight: 8 }}>
                        v{v.version}
                        {v.id === selected.id && (
                          <Tag color="blue" size="small" style={{ marginLeft: 8 }}>当前</Tag>
                        )}
                      </Text>
                      <StatusTag status={v.status} />
                      {v.changelog && (
                        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                          {v.changelog}
                        </Text>
                      )}
                    </div>
                    {v.id !== selected.id && (
                      <Button
                        type="outline"
                        size="mini"
                        icon={<IconSwap />}
                        onClick={() => handleOpenCompare(v.id)}
                      >
                        对比
                      </Button>
                    )}
                  </div>
                </Timeline.Item>
              ))}
            </Timeline>
          </div>
        )}

        {/* Diff Modal */}
        {diffModalVisible && compareVersion && (
          <SchemaDiffModal
            visible={diffModalVisible}
            onClose={handleCloseCompare}
            oldVersion={compareVersion}
            newVersion={selected}
          />
        )}

        {/* 停用确认弹窗 */}
        <Modal
          title="确认停用"
          visible={showDeactivateModal}
          onOk={confirmDeactivate}
          onCancel={() => { setShowDeactivateModal(false); setDeactivateTarget(null); }}
          okText="停用"
          cancelText="取消"
          okButtonProps={{ status: 'warning' }}
          confirmLoading={deactivateMutation.isPending}
        >
          <p>确定要停用「{deactivateTarget?.displayName || '此 Schema'}」吗？停用后该版本将不再用于新任务的识别。</p>
        </Modal>
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

      {/* 操作栏：导入/导出 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
        <Button
          type="outline"
          icon={<IconUpload />}
          onClick={() => { setImportJson(''); setImportError(''); setImportModalVisible(true); }}
        >
          导入 Schema
        </Button>
      </div>

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

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button
                    size="mini"
                    type="outline"
                    icon={<IconDownload />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(s);
                    }}
                  >
                    导出
                  </Button>
                  {s.status === 'active' ? (
                    <Button
                      size="mini"
                      status="warning"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeactivate(s.id, s.displayName);
                      }}
                      loading={deactivateMutation.isPending}
                    >
                      停用
                    </Button>
                  ) : (
                    <Button
                      size="mini"
                      type="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivate(s.id);
                      }}
                      loading={activateMutation.isPending}
                    >
                      启用
                    </Button>
                  )}
                </div>
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

      {/* 导入 Schema 弹窗 */}
      <Modal
        title="导入 Schema"
        visible={importModalVisible}
        onCancel={() => { setImportModalVisible(false); setImportJson(''); setImportError(''); }}
        onOk={handleImport}
        confirmLoading={createDraftMutation.isPending || publishDraftMutation.isPending}
        okText="导入"
        cancelText="取消"
        style={{ width: 600 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            粘贴导出的 JSON 数据，包含 schemaKey、displayName、definition.fields 等字段。
          </Text>
          <Input.TextArea
            placeholder={`{\n  "schemaKey": "example",\n  "displayName": "示例 Schema",\n  "definition": {\n    "fields": [\n      { "key": "field1", "type": "string", "description": "字段1" }\n    ]\n  }\n}`}
            value={importJson}
            onChange={setImportJson}
            style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
          />
          {importError && (
            <Text type="error" style={{ fontSize: 12 }}>{importError}</Text>
          )}
        </Space>
      </Modal>

      {/* 停用确认弹窗 */}
      <Modal
        title="确认停用"
        visible={showDeactivateModal}
        onOk={confirmDeactivate}
        onCancel={() => { setShowDeactivateModal(false); setDeactivateTarget(null); }}
        okText="停用"
        cancelText="取消"
        okButtonProps={{ status: 'warning' }}
        confirmLoading={deactivateMutation.isPending}
      >
        <p>确定要停用「{deactivateTarget?.displayName || '此 Schema'}」吗？停用后该版本将不再用于新任务的识别。</p>
      </Modal>
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
