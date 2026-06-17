import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, Input, Button, Typography, Space, Badge, Modal } from '@arco-design/web-react';
import { IconRefresh, IconSearch, IconFileUp, IconTrash } from '../icons/appIcons';
import { usePaginatedJobs, useDeleteJob } from '../hooks/useJobs';
import { toast } from '../components/GlobalToast';
import { useSchemas } from '../hooks/useSchemas';
import { useProviders } from '../hooks/useProviders';
import StatusTag from '../components/StatusTag';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeleton';
import type { RecognitionJob } from '../api/types';

const { Option } = Select;
const { Text } = Typography;

/** 将 schemaKey（如 lims-clinical-info）转为可读名称 */
function formatSchemaKey(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '识别中' },
  { value: 'completed', label: '已完成' },
  { value: 'needs_review', label: '需复核' },
  { value: 'partial_completed', label: '部分完成' },
  { value: 'failed', label: '失败' },
  { value: 'writeback_pending', label: '待回写' },
  { value: 'writeback_completed', label: '已回写' },
  { value: 'writeback_failed', label: '回写失败' },
];

export default function JobListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [schemaFilter, setSchemaFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 300ms 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, isLoading, error, refetch } = usePaginatedJobs({
    page,
    pageSize,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    schemaKey: schemaFilter !== 'all' ? schemaFilter : undefined,
    search: debouncedSearch || undefined,
  });
  const { data: schemasData } = useSchemas();
  const { data: providersData } = useProviders();
  const deleteJob = useDeleteJob();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = (id: string, e?: Event) => {
    e?.stopPropagation();
    setDeleteTargetId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteJob.mutateAsync(deleteTargetId);
      toast.success('任务已删除');
    } catch {
      toast.error('删除失败');
    } finally {
      setShowDeleteModal(false);
      setDeleteTargetId(null);
    }
  };

  const jobs = data?.items || [];
  const total = data?.total || 0;

  // 构建 displayName 映射
  const schemaNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    schemasData?.items?.forEach((s) => {
      map[s.schemaKey] = s.displayName || formatSchemaKey(s.schemaKey);
    });
    return map;
  }, [schemasData]);

  const providerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    providersData?.items?.forEach((p) => {
      map[p.key] = p.displayName || p.key;
    });
    return map;
  }, [providersData]);

  // Schema 下拉选项
  const schemaOptions = useMemo(() => {
    const opts = [{ value: 'all', label: '全部 Schema' }];
    schemasData?.items?.forEach((s) => {
      if (!opts.find((o) => o.value === s.schemaKey)) {
        opts.push({ value: s.schemaKey, label: s.displayName || s.schemaKey });
      }
    });
    return opts;
  }, [schemasData]);

  const columns = [
    {
      title: '任务ID',
      dataIndex: 'id',
      width: 120,
      render: (id: string) => <Text code>{id.slice(0, 8)}</Text>,
    },
    {
      title: 'Schema',
      dataIndex: 'schemaKey',
      width: 160,
      sorter: (a: RecognitionJob, b: RecognitionJob) => (a.schemaKey || '').localeCompare(b.schemaKey || ''),
      render: (key: string) => schemaNameMap[key] || formatSchemaKey(key),
    },
    {
      title: '文件名',
      width: 180,
      render: (_: unknown, record: RecognitionJob & { fileName?: string }) => {
        const name = record.fileName || record.sourceFile?.originalName;
        if (!name) return <span style={{ color: '#999' }}>-</span>;
        return (
          <Text
            ellipsis
            style={{ maxWidth: 160 }}
            title={name}
          >
            {name}
          </Text>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      sorter: (a: RecognitionJob, b: RecognitionJob) => (a.status || '').localeCompare(b.status || ''),
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: '整体置信度',
      width: 110,
      render: (_: unknown, record: RecognitionJob & { confidence?: number | null }) => {
        const conf = record.confidence ?? record.result?.confidence;
        if (!conf) return <span style={{ color: '#999' }}>-</span>;
        const confNum = typeof conf === 'number' ? conf : parseFloat(conf);
        const pct = (confNum * 100).toFixed(1);
        const color = confNum >= 0.9 ? '#00B42A' : confNum >= 0.7 ? '#FF7D00' : '#F53F3F';
        return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
      },
    },
    {
      title: '识别字段数',
      width: 100,
      render: (_: unknown, record: RecognitionJob) => {
        const fields = record.result?.fields;
        if (!fields) return <span style={{ color: '#999' }}>-</span>;
        const count = Object.keys(fields).length;
        return <span>{count}</span>;
      },
    },
    {
      title: '需复核',
      width: 80,
      render: (_: unknown, record: RecognitionJob & { needsReviewCount?: number }) => {
        const needsReviewCount = record.needsReviewCount;
        const needsReview = record.result?.reviewRequired;
        if (needsReviewCount !== undefined) {
          if (needsReviewCount > 0) {
            return <Badge count={needsReviewCount} style={{ backgroundColor: '#F53F3F' }} />;
          }
          return <span style={{ color: '#00B42A' }}>0</span>;
        }
        if (needsReview === undefined) return <span style={{ color: '#999' }}>-</span>;
        return needsReview
          ? <span style={{ color: '#F53F3F', fontWeight: 600 }}>是</span>
          : <span style={{ color: '#00B42A' }}>否</span>;
      },
    },
    {
      title: 'Provider',
      width: 140,
      render: (_: unknown, record: RecognitionJob & { provider?: string }) => {
        const config = record.providerConfig as Record<string, unknown> | undefined;
        const llmKey = config?.providerKey as string | undefined;
        const ocrKey = config?.ocrProviderKey as string | undefined;

        // 优先显示 LLM Provider，如果没有则显示 OCR Provider
        const displayKey = record.provider || llmKey || ocrKey;

        if (!displayKey) {
          return <span style={{ color: '#999' }}>未指定</span>;
        }

        const displayName = providerNameMap[displayKey] || displayKey;

        // 如果同时有 LLM 和 OCR，显示两个
        if (llmKey && ocrKey && llmKey !== ocrKey) {
          const llmName = providerNameMap[llmKey] || llmKey;
          const ocrName = providerNameMap[ocrKey] || ocrKey;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text style={{ fontSize: 12 }} title={`LLM: ${llmName}`}>{llmName}</Text>
              <Text type="secondary" style={{ fontSize: 11 }} title={`OCR: ${ocrName}`}>
                OCR: {ocrName}
              </Text>
            </div>
          );
        }

        return <span title={displayName}>{displayName}</span>;
      },
    },
    {
      title: '耗时',
      width: 100,
      render: (_: unknown, record: RecognitionJob) => {
        if (!record.startedAt) return <span style={{ color: '#999' }}>-</span>;
        const start = new Date(record.startedAt).getTime();
        const end = record.completedAt ? new Date(record.completedAt).getTime() : Date.now();
        const durationMs = end - start;
        if (durationMs < 1000) return <span>{durationMs}ms</span>;
        if (durationMs < 60000) return <span>{(durationMs / 1000).toFixed(1)}s</span>;
        return <span>{(durationMs / 60000).toFixed(1)}min</span>;
      },
    },
    {
      title: '创建人',
      width: 100,
      render: (_: unknown, record: RecognitionJob) => {
        const name = record.createdByName || record.createdById;
        if (!name) return <span style={{ color: '#999' }}>-</span>;
        return <span>{name}</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      sorter: (a: RecognitionJob, b: RecognitionJob) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      },
      defaultSortOrder: 'descend' as const,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 130,
      fixed: 'right' as const,
      render: (_: unknown, record: RecognitionJob) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/jobs/${record.id}`);
            }}
          >
            查看
          </Button>
          <Button
            type="text"
            size="small"
            status="danger"
            icon={<IconTrash size={14} />}
            onClick={(e) => handleDelete(record.id, e)}
          />
        </Space>
      ),
    },
  ];

  // Filter out columns where all rows show '-'
  const visibleColumns = useMemo(() => {
    const HIDE_IF_EMPTY = ['整体置信度', '需复核'];
    if (jobs.length === 0) return columns;
    return columns.filter(col => {
      if (!HIDE_IF_EMPTY.includes(col.title as string)) return true;
      // Check if any row has non-empty data for this column
      if (col.title === '整体置信度') {
        return jobs.some(j => {
          const conf = (j as any).confidence ?? j.result?.confidence;
          return conf != null;
        });
      }
      if (col.title === '需复核') {
        return jobs.some(j => {
          const nr = (j as any).needsReviewCount;
          const rr = j.result?.reviewRequired;
          return nr !== undefined || rr !== undefined;
        });
      }
      return true;
    });
  }, [columns, jobs]);

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>加载失败</Text>
          <Button icon={<IconRefresh />} onClick={() => refetch()}>重试</Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="识别管理"
        title="任务列表"
        subtitle={`共 ${total} 条任务`}
        action="新建识别"
        onAction={() => navigate('/recognition/new')}
        onRefresh={() => refetch()}
      />

      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size={12} wrap>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            style={{ width: 150 }}
            placeholder="状态筛选"
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
          <Select
            value={schemaFilter}
            onChange={(v) => { setSchemaFilter(v); setPage(1); }}
            style={{ width: 200 }}
            placeholder="Schema 筛选"
          >
            {schemaOptions.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
          <Input.Search
            value={searchText}
            onChange={setSearchText}
            onSearch={() => { setDebouncedSearch(searchText); setPage(1); refetch(); }}
            placeholder="搜索任务ID / Schema..."
            style={{ width: 240 }}
            allowClear
            prefix={<IconSearch size={14} />}
          />
        </Space>
      </Card>

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="还没有识别任务"
            description="上传医疗文档，AI 将自动识别并提取结构化数据"
            action={{
              label: '新建识别',
              onClick: () => navigate('/recognition/new'),
            }}
          />
        ) : (
          <Table
            columns={visibleColumns}
            data={jobs}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              showTotal: true,
              showJumper: true,
              sizeCanChange: true,
              sizeOptions: [10, 20, 50],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            scroll={{ x: 1500 }}
            size="small"
            onRow={(record) => ({
              onClick: () => navigate(`/jobs/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>

      {/* 删除确认弹窗 */}
      <Modal
        title="确认删除"
        visible={showDeleteModal}
        onOk={confirmDelete}
        onCancel={() => { setShowDeleteModal(false); setDeleteTargetId(null); }}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ status: 'danger' }}
        confirmLoading={deleteJob.isPending}
        closable
        maskClosable
      >
        <p>删除后不可恢复，确定要删除该任务吗？</p>
      </Modal>
    </div>
  );
}
