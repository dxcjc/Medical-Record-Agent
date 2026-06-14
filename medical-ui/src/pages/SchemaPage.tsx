import { useState, useMemo } from 'react';
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
} from '@arco-design/web-react';
import { IconLeft, IconSettings } from '@arco-design/web-react/icon';
import { useSchemas, useDeactivateSchemaVersion, useRollbackSchemaVersion } from '../hooks/useSchemas';
import { useFieldStats } from '../hooks/useFieldStats';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import StatusTag from '../components/StatusTag';
import FieldCard from '../components/FieldCard';
import { groupSchemaFields } from '../utils/schemaGroups';
import type { SchemaVersion, SchemaField } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;

export default function SchemaPage() {
  const { data, isLoading, error, refetch } = useSchemas();
  const deactivateMutation = useDeactivateSchemaVersion();
  const rollbackMutation = useRollbackSchemaVersion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localFields, setLocalFields] = useState<SchemaField[] | null>(null);

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

  if (schemas.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="配置管理"
          title="Schema 管理"
          subtitle="管理识别 Schema 版本"
          onRefresh={() => refetch()}
        />
        <Card>
          <EmptyState
            title="暂无 Schema"
            description="请联系管理员配置识别 Schema"
            action={{ label: '刷新', onClick: () => refetch() }}
          />
        </Card>
      </div>
    );
  }

  // Detail view
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

  // List view - schema cards, 2 per row
  return (
    <div>
      <PageHeader
        eyebrow="配置管理"
        title="Schema 管理"
        subtitle={`共 ${schemas.length} 个 Schema 版本`}
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
    </div>
  );
}
