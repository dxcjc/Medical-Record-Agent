import React, { useState } from 'react';
import {
  Button,
  Tag,
  Spin,
  Message,
  Grid,
  Table,
} from '@arco-design/web-react';
import { IconRefresh } from '@arco-design/web-react/icon';
import { useSchemas, useDeactivateSchemaVersion, useRollbackSchemaVersion } from '../hooks/useSchemas';
import EmptyState from '../components/EmptyState';
import type { SchemaVersion, SchemaField } from '../api/types';

const { Row, Col } = Grid;

function StatusTag({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active: { color: 'green', label: '激活' },
    inactive: { color: 'gray', label: '未激活' },
    deprecated: { color: 'orange', label: '已废弃' },
  };
  const cfg = map[status] || { color: 'gray', label: status };
  return <Tag color={cfg.color} size="small">{cfg.label}</Tag>;
}

const SchemaPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useSchemas();
  const deactivateMutation = useDeactivateSchemaVersion();
  const rollbackMutation = useRollbackSchemaVersion();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const schemas = data?.items || [];
  const selected = schemas.find((s) => s.id === selectedId) || null;

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
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>加载失败</p>
        <Button icon={<IconRefresh />} onClick={() => refetch()}>
          重试
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size={40} />
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <EmptyState
        title="暂无 Schema"
        description="请联系管理员配置识别 Schema"
        action={{ label: '刷新', onClick: () => refetch() }}
      />
    );
  }

  const fields: SchemaField[] = selected?.definition?.fields || [];

  const fieldColumns = [
    { title: 'Key', dataIndex: 'key', width: 150 },
    { title: '标签', dataIndex: 'label', width: 150 },
    { title: '类型', dataIndex: 'type', width: 100 },
    {
      title: '必填',
      dataIndex: 'required',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="red" size="small">是</Tag> : <Tag size="small">否</Tag>),
    },
  ];

  return (
    <Row gutter={24} style={{ height: 'calc(100vh - 120px)' }}>
      {/* Left Panel - Schema List */}
      <Col span={7}>
        <div
          style={{
            background: 'var(--color-bg-white)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-card)',
            height: '100%',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Schema 列表
          </div>
          {schemas.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--color-border)',
                background:
                  selectedId === s.id
                    ? 'var(--color-primary-light)'
                    : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 13 }}>
                  {s.displayName}
                </span>
                <StatusTag status={s.status} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  marginTop: 4,
                }}
              >
                v{s.version} · {s.schemaKey}
              </div>
            </div>
          ))}
        </div>
      </Col>

      {/* Right Panel - Detail */}
      <Col span={17}>
        <div
          style={{
            background: 'var(--color-bg-white)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-card)',
            height: '100%',
            overflow: 'auto',
            padding: 24,
          }}
        >
          {!selected ? (
            <div
              style={{
                textAlign: 'center',
                padding: 60,
                color: 'var(--color-text-secondary)',
              }}
            >
              请在左侧选择一个 Schema 查看详情
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 24,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {selected.displayName}
                  </h3>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {selected.schemaKey} · v{selected.version}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
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
                </div>
              </div>

              {/* Version Info */}
              <div
                style={{
                  background: 'var(--color-bg)',
                  borderRadius: 8,
                  padding: '16px 20px',
                  marginBottom: 24,
                  fontSize: 13,
                }}
              >
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>版本</div>
                    <div style={{ fontWeight: 500 }}>{selected.version}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>状态</div>
                    <div>
                      <StatusTag status={selected.status} />
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>发布时间</div>
                    <div style={{ fontWeight: 500 }}>
                      {selected.publishedAt
                        ? new Date(selected.publishedAt!).toLocaleString('zh-CN')
                        : '-'}
                    </div>
                  </Col>
                </Row>
                {selected.changelog && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                      变更说明
                    </div>
                    <div>{selected.changelog}</div>
                  </div>
                )}
              </div>

              {/* Fields Table */}
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                字段定义
              </h4>
              {fields.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: 40,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  暂无字段定义
                </div>
              ) : (
                <Table
                  columns={fieldColumns}
                  data={fields.map((f, i) => ({ ...f, _key: f.key || i }))}
                  rowKey="_key"
                  pagination={false}
                  size="small"
                  border={false}
                />
              )}
            </div>
          )}
        </div>
      </Col>
    </Row>
  );
};

export default SchemaPage;
