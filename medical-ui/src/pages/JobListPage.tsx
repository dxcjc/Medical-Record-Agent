import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, Button, Typography } from '@arco-design/web-react';
import { IconRefresh, IconSearch, IconFileUp } from '../icons/appIcons';
import { useJobs } from '../hooks/useJobs';
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
  { value: 'needs_review', label: '待复核' },
  { value: 'partial_completed', label: '部分完成' },
  { value: 'failed', label: '失败' },
  { value: 'writeback_completed', label: '已回写' },
  { value: 'writeback_failed', label: '回写失败' },
];

export default function JobListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, error, refetch } = useJobs(100);
  const { data: schemasData } = useSchemas();
  const { data: providersData } = useProviders();

  const jobs = data?.items || [];

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

  const filteredJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter((j) => j.status === statusFilter);
  }, [jobs, statusFilter]);

  const columns = [
    {
      title: 'Schema',
      dataIndex: 'schemaKey',
      width: 160,
      render: (key: string) => schemaNameMap[key] || key,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: 'Provider',
      width: 160,
      render: (_: unknown, record: RecognitionJob) => {
        const cfg = record.providerConfig as Record<string, unknown>;
        const providerKey = (cfg?.providerKey as string) || (cfg?.ocrProviderKey as string) || '';
        return <span>{providerKey ? (providerNameMap[providerKey] || providerKey) : '-'}</span>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (t: string | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 80,
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
        subtitle={`共 ${filteredJobs.length} 条任务`}
        action="新建识别"
        onAction={() => navigate('/recognition/new')}
        onRefresh={() => refetch()}
      />

      <Card
        extra={
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            prefix={<IconSearch size={14} />}
          >
            {STATUS_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
        }
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        ) : filteredJobs.length === 0 ? (
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
            data={filteredJobs}
            rowKey="id"
            pagination={{ pageSize: 20, showTotal: true }}
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
