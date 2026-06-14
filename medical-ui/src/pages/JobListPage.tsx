import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, Input, Button, Typography, Space, Spin, Badge } from '@arco-design/web-react';
import { IconRefresh, IconSearch, IconFileUp } from '../icons/appIcons';
import { usePaginatedJobs } from '../hooks/useJobs';
import { useSchemas } from '../hooks/useSchemas';
import { useProviders } from '../hooks/useProviders';
import StatusTag from '../components/StatusTag';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import type { RecognitionJob } from '../api/types';

const { Option } = Select;
const { Text } = Typography;

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

  const jobs = data?.items || [];
  const total = data?.total || 0;

  // 构建 displayName 映射
  const schemaNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    schemasData?.items?.forEach((s) => {
      map[s.schemaKey] = s.displayName || s.schemaKey;
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
      render: (key: string) => schemaNameMap[key] || key,
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
        const providerKey = record.provider || record.providerConfig?.providerKey || record.providerConfig?.ocrProviderKey || '';
        return <span>{providerKey ? (providerNameMap[providerKey] || providerKey) : <span style={{ color: '#999' }}>-</span>}</span>;
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
        // Try to extract from metadata or fallback to createdById
        const createdBy = record.createdById;
        if (!createdBy) return <span style={{ color: '#999' }}>-</span>;
        return <span>{createdBy.slice(0, 8)}</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: RecognitionJob) => (
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
      ),
    },
  ];

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
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="暂无任务"
            description="上传医疗文档开始识别"
            action={{
              label: '新建识别',
              onClick: () => navigate('/recognition/new'),
            }}
          />
        ) : (
          <Table
            columns={columns}
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
    </div>
  );
}
