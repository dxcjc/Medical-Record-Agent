import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Tabs,
  Select,
  DatePicker,
  Grid,
  Spin,
  Tooltip,
} from '@arco-design/web-react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, statsApi, schemasApi } from '../api/client';
import { usePaginatedAudit } from '../hooks/useAudit';
import { useTrendStats } from '../hooks/useTrendStats';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import StatusTag from '../components/StatusTag';
import type { AuditEntry, SchemaVersion, FieldStatItem } from '../api/types';
import {
  IconClipboardList,
  IconCheckCircle,
  IconAlertTriangle,
  IconClock,
  IconBarChart,
} from '../icons/appIcons';

const { Text } = Typography;
const { Option } = Select;
const { Row, Col } = Grid;

/** 将 schemaKey（如 lims-clinical-info）转为可读名称 */
function formatSchemaKey(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  操作类型中文映射                                                     */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  // colon-separated (legacy)
  'auth:login': '登录',
  'auth:logout': '登出',
  'job:create': '创建任务',
  'job:read': '查看任务',
  'job:delete': '删除任务',
  'job:rerun': '重跑任务',
  'result:read': '查看结果',
  'schema:draft': '编辑Schema草稿',
  'schema:publish': '发布Schema',
  'schema:deactivate': '停用Schema',
  'schema:rollback': '回滚Schema',
  'schema:read': '查看Schema',
  'file:upload': '上传文件',
  'file:read': '查看文件',
  'provider:save': '保存Provider',
  'provider:default': '设为默认Provider',
  'provider:health': '检查Provider健康',
  'evaluation:create': '创建评测',
  'evaluation:run': '运行评测',
  'evaluation:read': '查看评测',
  'feedback:create': '提交反馈',
  'feedback:read': '查看反馈',
  'writeback:execute': '执行回写',
  'audit:read': '查看审计日志',
  // dot-separated (task spec)
  'schema.create': '创建 Schema',
  'schema.update': '更新 Schema',
  'schema.deactivate': '停用 Schema',
  'schema.activate': '启用 Schema',
  'schema.rollback': '回滚 Schema',
  'provider.create': '创建 Provider',
  'provider.update': '更新 Provider',
  'provider.delete': '删除 Provider',
  'provider.config.save': '保存 Provider 配置',
  'result.view': '查看识别结果',
  'result.export': '导出识别结果',
  'feedback.submit': '提交反馈',
  'feedback.review': '审核反馈',
  'feedback.batch.review': '批量审核反馈',
  'file.upload': '上传文件',
  'file.download': '下载文件',
  'job.create': '创建识别任务',
  'job.rerun': '重跑识别任务',
  'writeback.execute': '执行回写',
  'auth.login': '用户登录',
};

/* ------------------------------------------------------------------ */
/*  对象类型中文映射                                                     */
/* ------------------------------------------------------------------ */

const OBJECT_TYPE_LABELS: Record<string, string> = {
  job: '任务',
  result: '识别结果',
  schema: 'Schema',
  file: '文件',
  provider: 'Provider',
  feedback: '反馈',
  writeback: '回写',
  evaluation: '评测',
  user: '用户',
  audit: '审计',
  auth: '认证',
};

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function formatRelativeTime(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '-';
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds} 秒前`;
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(dateStr).toLocaleString('zh-CN');
}

function getActionLabel(action: string): string {
  // Exact match
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Try converting between colon and dot formats
  const altKey = action.includes('.') ? action.replace(/\./g, ':') : action.replace(/:/g, '.');
  if (ACTION_LABELS[altKey]) return ACTION_LABELS[altKey];
  // Fuzzy match as fallback
  for (const [key, label] of Object.entries(ACTION_LABELS)) {
    if (action.includes(key) || key.includes(action)) return label;
  }
  return action;
}

function getObjectTypeLabel(objectType: string): string {
  return OBJECT_TYPE_LABELS[objectType] || objectType;
}

/* ------------------------------------------------------------------ */
/*  质量报告 Tab                                                       */
/* ------------------------------------------------------------------ */

function QualityReportTab({ schemas }: { schemas: SchemaVersion[] }) {
  const [schemaKey, setSchemaKey] = useState<string | undefined>(undefined);
  const navigate = useNavigate();

  // 获取 dashboard stats
  const { data: dashboardStats, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => statsApi.getDashboard(),
  });

  // 获取字段统计
  const { data: fieldStatsData, isLoading: fieldStatsLoading } = useQuery({
    queryKey: ['field-stats', schemaKey],
    queryFn: () => statsApi.getFieldStats(schemaKey!, 50),
    enabled: !!schemaKey,
  });

  // 获取趋势数据
  const { data: trendData, isLoading: trendLoading } = useTrendStats(schemaKey, 30);

  const fieldStats: FieldStatItem[] = fieldStatsData?.stats || [];
  const trendPoints = trendData?.trend || [];

  // 计算 KPI 卡片数据
  const totalJobs = dashboardStats?.totalJobs || 0;
  const completedJobs = dashboardStats?.completedJobs || 0;
  const needsReview = dashboardStats?.needsReview || 0;
  const recognitionRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0';
  const reviewRate = totalJobs > 0 ? ((needsReview / totalJobs) * 100).toFixed(1) : '0';

  // 按字段统计反馈 — 最常出错 TOP5
  const topErrorFields = useMemo(() => {
    return fieldStats
      .filter(f => f.correctionCount > 0 || f.reviewCount > 0)
      .sort((a, b) => (b.correctionCount + b.reviewCount) - (a.correctionCount + a.reviewCount))
      .slice(0, 5);
  }, [fieldStats]);

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Schema 选择器 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Text type="secondary">选择 Schema：</Text>
        <Select
          placeholder="选择 Schema 以查看字段统计"
          value={schemaKey}
          onChange={setSchemaKey}
          style={{ width: 240 }}
          allowClear
        >
          {schemas.map(s => (
            <Option key={s.schemaKey} value={s.schemaKey}>
              {s.displayName || formatSchemaKey(s.schemaKey)}
            </Option>
          ))}
        </Select>
      </div>

      {/* 4 个 KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <MetricCard
            title="总任务数"
            value={totalJobs}
            icon={IconClipboardList}
            tone="blue"
            loading={dashboardLoading}
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricCard
            title="识别率"
            value={`${recognitionRate}%`}
            icon={IconCheckCircle}
            tone="green"
            loading={dashboardLoading}
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricCard
            title="需复核率"
            value={`${reviewRate}%`}
            icon={IconAlertTriangle}
            tone={needsReview > 0 ? 'amber' : 'green'}
            loading={dashboardLoading}
          />
        </Col>
        <Col xs={12} sm={6}>
          <MetricCard
            title="完成任务"
            value={completedJobs}
            icon={IconClock}
            tone="blue"
            loading={dashboardLoading}
          />
        </Col>
      </Row>

      {/* 识别率趋势折线图（CSS 实现） */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} title="识别率趋势（近30天）">
        <div style={{ padding: '16px 0' }}>
          {!schemaKey ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
              请先选择 Schema 以查看趋势
            </div>
          ) : trendLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : trendPoints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
              暂无趋势数据
            </div>
          ) : (
            <CssTrendChart
              data={trendPoints.map((p) => ({
                label: p.date.slice(5), // MM-DD
                value: p.total > 0 ? Math.round((p.extracted / p.total) * 100) : 0,
              }))}
            />
          )}
        </div>
      </Card>

      <Row gutter={16}>
        {/* 最常出错字段 TOP5 */}
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 8, minHeight: 300 }} title="最常出错字段 TOP5">
            {fieldStatsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : !schemaKey ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
                请先选择 Schema
              </div>
            ) : topErrorFields.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
                暂无出错数据
              </div>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {topErrorFields.map((field, idx) => (
                  <div
                    key={field.fieldKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      background: idx === 0 ? 'var(--color-danger-soft)' : 'var(--color-info-soft)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/schemas`)}
                  >
                    <Tag
                      color={idx < 3 ? 'red' : 'orange'}
                      size="small"
                      style={{ minWidth: 24, textAlign: 'center' }}
                    >
                      {idx + 1}
                    </Tag>
                    <Text style={{ flex: 1, fontWeight: 500 }}>{field.fieldKey}</Text>
                    <Space size={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        纠正 {field.correctionCount} 次
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        复核 {field.reviewCount} 次
                      </Text>
                      {field.avgConfidence != null && (
                        <Tag size="small" color={field.avgConfidence >= 0.8 ? 'green' : field.avgConfidence >= 0.5 ? 'orange' : 'red'}>
                          置信度 {(field.avgConfidence * 100).toFixed(0)}%
                        </Tag>
                      )}
                    </Space>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        {/* 按 Schema 分布统计 */}
        <Col xs={24} lg={12}>
          <Card style={{ borderRadius: 8, minHeight: 300 }} title="Schema 分布统计">
            {schemas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
                暂无 Schema
              </div>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {schemas.slice(0, 10).map((schema) => (
                  <div
                    key={schema.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      background: 'var(--color-info-soft)',
                      borderRadius: 6,
                    }}
                  >
                    <Tag color="blue" size="small">{schema.schemaKey}</Tag>
                    <Text style={{ flex: 1 }}>{schema.displayName || formatSchemaKey(schema.schemaKey)}</Text>
                    <Tag size="small" color={schema.status === 'active' ? 'green' : 'gray'}>
                      {schema.status === 'active' ? '活跃' : schema.status}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>v{schema.version}</Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CSS 趋势折线图组件                                                   */
/* ------------------------------------------------------------------ */

function CssTrendChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxVal = Math.max(...data.map(d => d.value), 100);
  const minVal = Math.min(...data.map(d => d.value), 0);
  const range = maxVal - minVal || 1;
  const chartHeight = 160;

  return (
    <div>
      {/* Y 轴标签 + 图表区域 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Y 轴 */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: chartHeight, fontSize: 11, color: 'var(--color-text-3)', minWidth: 32, textAlign: 'right' }}>
          <span>{maxVal}%</span>
          <span>{Math.round((maxVal + minVal) / 2)}%</span>
          <span>{minVal}%</span>
        </div>
        {/* 柱状区域 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, height: chartHeight, borderLeft: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', paddingLeft: 8, paddingBottom: 4 }}>
          {data.map((d, idx) => {
            const height = ((d.value - minVal) / range) * (chartHeight - 20);
            return (
              <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11 }}>{d.value}%</Text>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 40,
                    height: Math.max(height, 4),
                    background: `linear-gradient(to top, #3370FF, #5B8FF9)`,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* X 轴标签 */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 40, marginTop: 4 }}>
        {data.map((d, idx) => (
          <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--color-text-3)' }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  操作审计 Tab                                                       */
/* ------------------------------------------------------------------ */

function AuditLogTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [objectTypeFilter, setObjectTypeFilter] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

  const { data, isLoading, error, refetch } = usePaginatedAudit({
    page,
    pageSize,
    action: actionFilter,
    objectType: objectTypeFilter,
    startDate,
    endDate,
  });

  const entries = data?.items || [];
  const total = data?.total || 0;

  // 获取所有操作类型用于筛选
  const actionOptions = useMemo(() => {
    return Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label }));
  }, []);

  // 对象类型选项
  const objectTypeOptions = useMemo(() => {
    return Object.entries(OBJECT_TYPE_LABELS).map(([key, label]) => ({ key, label }));
  }, []);

  // CSV 导出
  const handleExportCsv = () => {
    const token = localStorage.getItem('accessToken');
    const url = auditApi.exportCsv({
      action: actionFilter,
      objectType: objectTypeFilter,
      startDate,
      endDate,
    });
    // 使用带认证的下载
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    // 添加 Authorization header 通过 fetch
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        // 回退到直接链接
        link.click();
      });
  };

  // 重置筛选
  const handleReset = () => {
    setActionFilter(undefined);
    setObjectTypeFilter(undefined);
    setStartDate(undefined);
    setEndDate(undefined);
    setPage(1);
  };

  // 日期范围变更
  const handleDateRangeChange = (dateString: string[]) => {
    setStartDate(dateString[0] || undefined);
    setEndDate(dateString[1] || undefined);
    setPage(1);
  };

  // 跳转函数
  const handleObjectClick = (objectType: string, objectId: string) => {
    if (objectType === 'job') {
      navigate(`/jobs/${objectId}`);
    } else if (objectType === 'schema') {
      navigate('/schemas');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (t: string) => {
        if (!t || typeof t !== 'string') return '-';
        const date = new Date(t);
        if (isNaN(date.getTime())) return '-';
        const formatted = date.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        return <Text title={formatted}>{formatted}</Text>;
      },
    },
    {
      title: '操作人',
      width: 150,
      render: (_: unknown, record: AuditEntry) => (
        <span>{record.actorUser?.displayName || record.actorUserId || '-'}</span>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 160,
      render: (action: string) => {
        const label = getActionLabel(action);
        if (label !== action) {
          return <Tag color="blue" size="small">{label}</Tag>;
        }
        return <span>{action}</span>;
      },
    },
    {
      title: '对象类型',
      dataIndex: 'objectType',
      width: 120,
      render: (objectType: string) => (
        <Tag size="small" color="gray">{getObjectTypeLabel(objectType)}</Tag>
      ),
    },
    {
      title: '对象ID',
      dataIndex: 'objectId',
      width: 160,
      render: (id: string, record: AuditEntry) => {
        if (!id) return '-';
        const truncated = id.length > 12 ? id.slice(0, 12) + '...' : id;
        const canClick = record.objectType === 'job' || record.objectType === 'schema';
        const idEl = canClick ? (
          <Button
            type="text"
            size="mini"
            style={{ fontSize: 12, padding: '0 4px' }}
            onClick={() => handleObjectClick(record.objectType, id)}
          >
            <Text code style={{ fontSize: 12 }}>{truncated}</Text>
          </Button>
        ) : (
          <Text code style={{ fontSize: 12 }}>{truncated}</Text>
        );
        return <Tooltip content={id}>{idEl}</Tooltip>;
      },
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (result: string) => {
        if (result === 'success') return <Tag color="green" size="small">成功</Tag>;
        if (result === 'failure') return <Tag color="red" size="small">失败</Tag>;
        return <Tag size="small">{result || '-'}</Tag>;
      },
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      width: 140,
      render: (ip: string) => ip || '-',
    },
  ];

  // 展开行渲染 metadata JSON
  const expandedRowRender = (record: AuditEntry) => {
    const metadata = record.metadata;
    if (!metadata || Object.keys(metadata).length === 0) {
      return <Text type="secondary" style={{ padding: 16 }}>无附加数据</Text>;
    }
    return (
      <pre
        style={{
          margin: 0,
          padding: 16,
          background: 'var(--color-info-soft)',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: 300,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {JSON.stringify(metadata, null, 2)}
      </pre>
    );
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

  return (
    <div style={{ padding: '16px 0' }}>
      {/* 筛选栏 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <DatePicker.RangePicker
          style={{ width: 280 }}
          placeholder={['开始日期', '结束日期']}
          onChange={handleDateRangeChange}
          value={startDate && endDate ? [startDate, endDate] : undefined}
        />
        <Select
          placeholder="操作类型"
          value={actionFilter}
          onChange={setActionFilter}
          style={{ width: 180 }}
          allowClear
        >
          {actionOptions.map(opt => (
            <Option key={opt.key} value={opt.key}>{opt.label}</Option>
          ))}
        </Select>
        <Select
          placeholder="对象类型"
          value={objectTypeFilter}
          onChange={setObjectTypeFilter}
          style={{ width: 150 }}
          allowClear
        >
          {objectTypeOptions.map(opt => (
            <Option key={opt.key} value={opt.key}>{opt.label}</Option>
          ))}
        </Select>
        <Button onClick={handleReset}>重置</Button>
        <div style={{ flex: 1 }} />
        <Button type="primary" onClick={handleExportCsv}>
          导出 CSV
        </Button>
        <Button onClick={() => refetch()}>刷新</Button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="暂无操作记录"
          description="系统审计日志为空，执行操作后会自动记录"
          action={{ label: '刷新', onClick: () => refetch() }}
        />
      ) : (
        <Table
          columns={columns}
          data={entries}
          rowKey="id"
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          size="small"
          expandedRowRender={expandedRowRender}
          expandedRowKeys={expandedRowKeys}
          onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main AuditPage Component                                           */
/* ------------------------------------------------------------------ */

export default function AuditPage() {
  const { data: schemasData } = useQuery({
    queryKey: ['schemas'],
    queryFn: () => schemasApi.list(),
  });

  const schemas = schemasData?.items || [];

  return (
    <div>
      <PageHeader
        eyebrow="质量保障"
        title="审计中心"
        subtitle="操作审计与质量报告"
      />

      <Card>
        <Tabs defaultActiveTab="audit">
          <Tabs.TabPane key="audit" title="操作审计">
            <AuditLogTab />
          </Tabs.TabPane>
          <Tabs.TabPane key="quality" title="质量报告">
            <QualityReportTab schemas={schemas} />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  );
}
