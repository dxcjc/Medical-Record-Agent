import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Spin,
  Form,
  Input,
  Select,
  Message,
  Grid,
  Descriptions,
  Space,
  Typography,
  Tabs,
} from '@arco-design/web-react';
import { useJob } from '../hooks/useJobs';
import { useResult } from '../hooks/useResults';
import { useSchemas } from '../hooks/useSchemas';
import { feedbackApi } from '../api/client';
import StatusTag from '../components/StatusTag';
import FieldGroup from '../components/FieldGroup';
import CheckboxMatrix from '../components/CheckboxMatrix';
import ImageViewer from '../components/ImageViewer';
import ConfidenceDashboard from '../components/ConfidenceDashboard';
import PipelineProgress from '../components/PipelineProgress';
import { buildFieldLabels, groupSchemaFields } from '../utils/schemaGroups';
import {
  IconArrowLeft,
  IconRefresh,
  IconFileText,
  IconEye,
  IconUser,
  IconSend,
  IconCode,
  IconBeaker,
  IconApps,
  IconStorage,
  IconInfoCircle,
  IconGitBranch,
  IconChevronRight,
  IconChevronDown,
  IconCheckCircle,
  IconDatabase,
} from '../icons/appIcons';
import type { TraceStep, EvidenceItem, SchemaField, RecognitionJob, RecognitionResult } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;
const FormItem = Form.Item;
const { Option } = Select;

/* ------------------------------------------------------------------ */
/*  Dynamic field config from Schema definition                        */
/* ------------------------------------------------------------------ */

/** 从 Schema fields 动态构建字段分组 → icon 映射 */
const GROUP_ICON_MAP: Record<string, React.ReactNode> = {
  patientInfo: <IconUser style={{ color: '#3370FF', fontSize: 16 }} />,
  referralInfo: <IconSend style={{ color: '#3370FF', fontSize: 16 }} />,
  clinicalDiagnosis: <IconCode style={{ color: '#3370FF', fontSize: 16 }} />,
  sampleInfo: <IconBeaker style={{ color: '#3370FF', fontSize: 16 }} />,
  testItems: <IconApps style={{ color: '#3370FF', fontSize: 16 }} />,
  testProduct: <IconStorage style={{ color: '#3370FF', fontSize: 16 }} />,
  other: <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />,
};

/** 从 Schema field 的 comments 中提取选项列表 */
function extractOptionsFromComments(field: SchemaField): string[] {
  const comments = Array.isArray(field.comments) ? field.comments.join(' ') : String(field.comments || '');
  // 匹配 "选项：A、B、C" 模式
  const match = comments.match(/选项[：:]\s*(.+?)(?:[""]|$)/);
  if (match) {
    return match[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  }
  // 匹配逗号分隔的项目列表（如 "肿瘤9基因、肿瘤13基因..."）
  const items = comments.match(/[A-Za-z0-9一-鿿()（）+\-]+(?:[、,，][A-Za-z0-9一-鿿()（）+\-]+)+/g);
  if (items && items.length > 0) {
    // 取最长的匹配，通常是选项列表
    const longest = items.sort((a, b) => b.length - a.length)[0];
    return longest.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

function traceStepStatus(step: TraceStep): 'wait' | 'process' | 'finish' | 'error' {
  if (step.status === 'completed') return 'finish';
  if (step.status === 'failed' || step.error) return 'error';
  if (step.status === 'running') return 'process';
  return 'wait';
}

function traceStepTitle(step: TraceStep): string {
  const nodeNames: Record<string, string> = {
    preprocess: '文档预处理',
    ocr: 'OCR 识别',
    rag: 'RAG 检索',
    extraction: '字段抽取',
    validation: '字段验证',
    autoDecision: '自动决策',
    writeback: '写回',
    evaluation: '评估',
  };
  const key: string = String(step.node || step.step || '');
  return nodeNames[key] || step.node || step.step || '-';
}

function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'orange';
  return 'red';
}

function extractOcrText(result: Record<string, unknown> | null | undefined): string | null {
  if (!result) return null;
  const payload = result.payload as Record<string, unknown> | undefined;
  if (!payload) return null;

  const ocr = payload.ocr as Record<string, unknown> | undefined;
  if (ocr) {
    const pages = ocr.pages as Array<{ page: number; text: string }> | undefined;
    if (pages && pages.length > 0) {
      return pages.map((p) => p.text).filter(Boolean).join('\n\n');
    }
  }

  const direct = payload.ocrText || payload.text || payload.ocr_text || payload.rawText;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  return null;
}

function extractOcrBlocks(
  result: Record<string, unknown> | null | undefined,
): Array<{ text: string; confidence: number; page: number; blockId?: string; coordinates?: { x: number; y: number; width: number; height: number } }> {
  if (!result) return [];
  const payload = result.payload as Record<string, unknown> | undefined;
  if (!payload) return [];
  const ocr = payload.ocr as Record<string, unknown> | undefined;
  if (!ocr) return [];
  const blocks = ocr.blocks as Array<{ text: string; confidence: number; page: number; blockId?: string; coordinates?: { x: number; y: number; width: number; height: number } }> | undefined;
  return blocks || [];
}

function normalizeFields(result: Record<string, unknown> | null | undefined) {
  if (!result) return [];
  const fields = result.fields;

  if (Array.isArray(fields)) {
    return fields.map((f: Record<string, unknown>) => ({
      key: String(f.fieldKey || f.key || '-'),
      value: f.value != null ? String(f.value) : '-',
      rawValue: f.rawValue != null ? String(f.rawValue) : '',
      confidence: typeof f.confidence === 'number' && f.confidence > 0 ? f.confidence : undefined,
      evidence: (Array.isArray(f.evidence) ? f.evidence : []) as EvidenceItem[],
    }));
  }

  if (fields && typeof fields === 'object') {
    return Object.entries(fields).map(([key, val]) => ({
      key,
      value: val != null ? String(val) : '-',
      rawValue: '',
      confidence: undefined,
      evidence: [],
    }));
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  Checkbox value parser - parse comma/array values into checkbox state */
/* ------------------------------------------------------------------ */

function parseTestItems(raw: string | undefined): { all: string[]; checked: string[] } {
  if (!raw) return { all: [], checked: [] };

  // 1) Try to parse as JSON array first (LLM output like ['1021基因'] or ["山肿1021 PLUS-MRD-T"])
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const checked = parsed.map((item: unknown) => String(item).trim()).filter(Boolean);
      return { all: checked, checked };
    }
  } catch {
    // Not valid JSON, fall through to other formats
  }

  // 2) Try checkbox-style format: "☑ item1, ☑ item2, ☐ item3" or just "item1, item2"
  const checked: string[] = [];
  const all: string[] = [];

  const parts = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^[☑✓✔]\s*(.+)/);
    if (match) {
      const name = match[1].trim();
      all.push(name);
      checked.push(name);
    } else {
      const unmatch = part.match(/^[☐✗✘]\s*(.+)/);
      if (unmatch) {
        all.push(unmatch[1].trim());
      } else {
        all.push(part);
      }
    }
  }

  return { all, checked };
}

/* ------------------------------------------------------------------ */
/*  No hardcoded test items - dynamically extracted from Schema         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Calculate display status based on confidence                       */
/* ------------------------------------------------------------------ */

function calculateDisplayStatus(
  backendStatus: string,
  normalizedFields: Array<{ confidence?: number }>
): string {
  // 只在后端状态为 partial_completed 时重新计算
  if (backendStatus !== 'partial_completed') return backendStatus;

  // 计算有效置信度字段
  const fieldsWithConfidence = normalizedFields.filter((f) => f.confidence != null && f.confidence > 0);
  
  // 如果没有有效置信度字段，保持后端状态
  if (fieldsWithConfidence.length === 0) return backendStatus;

  // 检查是否所有有效置信度字段都 >= 80%
  const allHighConfidence = fieldsWithConfidence.every((f) => (f.confidence || 0) >= 0.8);
  
  // 如果所有有效置信度字段都 >= 80%，显示"已完成"
  if (allHighConfidence) return 'completed';

  return backendStatus;
}

/* ------------------------------------------------------------------ */
/*  Build field list from normalized fields map                        */
/* ------------------------------------------------------------------ */

interface NormalizedField {
  key: string;
  value: string;
  rawValue: string;
  confidence?: number;
  evidence: EvidenceItem[];
}

function getFieldData(fields: NormalizedField[], keys: string[], fieldLabels: Record<string, string>) {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  return keys.map((key) => {
    const f = fieldMap.get(key);
    return {
      key,
      label: fieldLabels[key] || key,
      value: f?.value ?? null,
      confidence: f?.confidence,
      source: f?.evidence?.[0]?.page ? `第${f.evidence[0].page}页` : undefined,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Trace View Component (追溯链路)                                     */
/* ------------------------------------------------------------------ */

interface TraceNode {
  id: string;
  title: string;
  icon: React.ReactNode;
  status: 'completed' | 'running' | 'failed' | 'pending';
  details: Array<{ label: string; value: React.ReactNode }>;
  children?: Array<{ label: string; value: React.ReactNode }>;
}

function TraceNodeCard({ node, defaultExpanded = false }: { node: TraceNode; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusColors: Record<string, string> = {
    completed: 'green',
    running: 'blue',
    failed: 'red',
    pending: 'gray',
  };
  const statusLabels: Record<string, string> = {
    completed: '完成',
    running: '运行中',
    failed: '失败',
    pending: '等待',
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 8, cursor: 'pointer', borderLeft: `3px solid var(--color-${node.status === 'completed' ? 'success' : node.status === 'failed' ? 'danger' : node.status === 'running' ? 'primary' : 'disabled'})` }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        {node.icon}
        <Text style={{ fontWeight: 600, flex: 1 }}>{node.title}</Text>
        <Tag size="small" color={statusColors[node.status] || 'gray'}>{statusLabels[node.status] || node.status}</Tag>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingLeft: 28 }}>
          {node.details.length > 0 && (
            <Descriptions
              column={2}
              size="small"
              data={node.details.map((d) => ({ label: d.label, value: d.value }))}
              style={{ marginBottom: node.children && node.children.length > 0 ? 12 : 0 }}
            />
          )}
          {node.children && node.children.length > 0 && (
            <div style={{ background: 'var(--color-info-soft)', borderRadius: 6, padding: 12 }}>
              {node.children.map((child, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13 }}>
                  <Text type="secondary" style={{ flexShrink: 0, minWidth: 80 }}>{child.label}:</Text>
                  <span>{child.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TraceView({
  job,
  result,
}: {
  job: RecognitionJob;
  result: RecognitionResult | null | undefined;
}) {
  const trace = job.trace || [];
  const payload = (result?.payload as Record<string, unknown>) || {};
  const extraction = (payload.extraction as Record<string, unknown>) || {};
  const validation = (payload.validation as Record<string, unknown>) || {};
  const rag = (payload.rag as Record<string, unknown>) || {};
  const ocr = (payload.ocr as Record<string, unknown>) || {};

  // 构建追溯节点
  const nodes: TraceNode[] = [];

  // 1. 原始文件
  const sourceFile = job.sourceFile;
  nodes.push({
    id: 'source',
    title: '原始文件',
    icon: <IconFileText size={16} style={{ color: '#3370FF' }} />,
    status: sourceFile ? 'completed' : 'pending',
    details: [
      { label: '文件名', value: sourceFile?.originalName || job.sourceFileId || '-' },
      { label: '文件大小', value: sourceFile?.byteSize ? `${(Number(sourceFile.byteSize) / 1024).toFixed(1)} KB` : '-' },
      { label: 'MIME类型', value: sourceFile?.mimeType || '-' },
    ],
  });

  // 2. OCR 识别
  const ocrStep = trace.find((s: TraceStep) => (s.node || s.step) === 'ocr');
  const ocrBlocks = (ocr.blocks as unknown[]) || [];
  nodes.push({
    id: 'ocr',
    title: 'OCR 识别',
    icon: <IconEye size={16} style={{ color: '#3370FF' }} />,
    status: ocrStep?.status === 'completed' ? 'completed' : ocrStep?.status === 'failed' ? 'failed' : ocrStep?.status === 'running' ? 'running' : 'pending',
    details: [
      { label: 'Provider', value: (ocr.provider as string) || (job.providerConfig?.ocrProviderKey as string) || '-' },
      { label: '耗时', value: ocrStep?.duration ? formatDuration(ocrStep.duration) : '-' },
      { label: '输出 blocks', value: ocrBlocks.length > 0 ? String(ocrBlocks.length) : '-' },
    ],
  });

  // 3. RAG 知识检索
  const ragStep = trace.find((s: TraceStep) => (s.node || s.step) === 'rag');
  const ragHits = (rag.hits as Array<{ title?: string; score?: number; content?: string }>) || [];
  const ragMisses = (rag.misses as string[]) || [];
  const ragQuery = (rag.query as string) || '';
  nodes.push({
    id: 'rag',
    title: 'RAG 知识检索',
    icon: <IconDatabase size={16} style={{ color: '#3370FF' }} />,
    status: ragStep?.status === 'completed' ? 'completed' : ragStep ? 'pending' : 'pending',
    details: [
      { label: '检索 Query', value: ragQuery || '-' },
      { label: '命中条目', value: ragHits.length > 0 ? `${ragHits.length} 条` : '-' },
      { label: '未命中', value: ragMisses.length > 0 ? `${ragMisses.length} 条` : '0' },
    ],
    children: ragHits.length > 0
      ? ragHits.map((hit, idx) => ({
          label: `命中 ${idx + 1}`,
          value: <span>{hit.title || '-'} <Tag size="small" color="blue" style={{ marginLeft: 4 }}>{((hit.score || 0) * 100).toFixed(0)}%</Tag></span>,
        }))
      : ragMisses.length > 0
        ? ragMisses.map((miss, idx) => ({
            label: `未命中 ${idx + 1}`,
            value: miss,
          }))
        : undefined,
  });

  // 4. LLM 抽取
  const extractionStep = trace.find((s: TraceStep) => (s.node || s.step) === 'extraction');
  const tokenUsage = (extraction.tokenUsage as Record<string, unknown>) || {};
  nodes.push({
    id: 'extraction',
    title: 'LLM 抽取',
    icon: <IconCode size={16} style={{ color: '#3370FF' }} />,
    status: extractionStep?.status === 'completed' ? 'completed' : extractionStep?.status === 'failed' ? 'failed' : 'pending',
    details: [
      { label: 'Provider', value: (extraction.provider as string) || (job.providerConfig?.providerKey as string) || '-' },
      { label: '模型', value: (extraction.model as string) || '-' },
      { label: 'Token 用量', value: tokenUsage.total ? `${tokenUsage.total} (prompt: ${tokenUsage.prompt || '-'}, completion: ${tokenUsage.completion || '-'})` : '-' },
      { label: '耗时', value: extractionStep?.duration ? formatDuration(extractionStep.duration) : '-' },
    ],
  });

  // 5. 校验 & 决策
  const validationStep = trace.find((s: TraceStep) => (s.node || s.step) === 'validation' || (s.node || s.step) === 'autoDecision');
  const fieldResults = (validation.fieldResults as Array<{
    fieldKey?: string;
    decision?: string;
    issues?: string[];
    confidence?: number;
  }>) || [];
  nodes.push({
    id: 'validation',
    title: '校验 & 决策',
    icon: <IconCheckCircle size={16} style={{ color: '#3370FF' }} />,
    status: validationStep?.status === 'completed' ? 'completed' : validationStep?.status === 'failed' ? 'failed' : 'pending',
    details: [
      { label: '字段数', value: fieldResults.length > 0 ? String(fieldResults.length) : '-' },
      { label: '耗时', value: validationStep?.duration ? formatDuration(validationStep.duration) : '-' },
    ],
    children: fieldResults.length > 0
      ? fieldResults.slice(0, 20).map((fr) => ({
          label: fr.fieldKey || '-',
          value: (
            <span>
              {fr.decision || '-'}
              {fr.confidence != null && (
                <Tag size="small" color={confidenceColor(fr.confidence)} style={{ marginLeft: 4 }}>
                  {(fr.confidence * 100).toFixed(0)}%
                </Tag>
              )}
              {fr.issues && fr.issues.length > 0 && (
                <Text type="error" style={{ marginLeft: 8, fontSize: 12 }}>
                  ⚠ {fr.issues.join('; ')}
                </Text>
              )}
            </span>
          ),
        }))
      : undefined,
  });

  return (
    <Space direction="vertical" size={0} style={{ width: '100%' }}>
      {nodes.map((node, idx) => (
        <div key={node.id} style={{ position: 'relative' }}>
          <TraceNodeCard node={node} defaultExpanded={idx < 2} />
          {idx < nodes.length - 1 && (
            <div style={{ position: 'absolute', left: 24, bottom: -8, width: 2, height: 16, background: 'var(--color-border)' }} />
          )}
        </div>
      ))}
    </Space>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, error, refetch } = useJob(id!);
  const { data: result, isLoading: resultLoading } = useResult(id!);
  const { data: schemasData } = useSchemas();

  // 从 Schema definition 动态构建字段配置
  const schemas = schemasData?.items || [];
  const currentSchema = useMemo(() =>
    schemas.find((s) => s.schemaKey === job?.schemaKey && s.status === 'active') || schemas[0],
    [schemas, job?.schemaKey]
  );
  const schemaFields: SchemaField[] = currentSchema?.definition?.fields || [];
  const fieldLabels = useMemo(() => buildFieldLabels(schemaFields), [schemaFields]);
  const fieldGroups = useMemo(() => groupSchemaFields(schemaFields), [schemaFields]);

  // 从 Schema 动态构建 FIELD_GROUPS 映射 (groupKey → fieldKey[])
  const dynamicFieldGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const group of fieldGroups) {
      groups[group.key] = group.fields.map(f => f.key);
    }
    return groups;
  }, [fieldGroups]);

  // 从 Schema 动态提取 testItems 的选项
  const testItemOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of schemaFields) {
      if (field.key.startsWith('testItems') || field.key.startsWith('testItem')) {
        options[field.key] = extractOptionsFromComments(field);
      }
    }
    return options;
  }, [schemaFields]);

  // 获取 test item 字段 keys
  const testItemKeys = useMemo(() =>
    schemaFields.filter(f => f.key.startsWith('testItems') || f.key.startsWith('testItem')).map(f => f.key),
    [schemaFields]
  );

  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackField, setFeedbackField] = useState('');
  const [feedbackCorrection, setFeedbackCorrection] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | undefined>(undefined);

  // Dynamic checkbox state for test items (keyed by field key)
  const [testItemSelections, setTestItemSelections] = useState<Record<string, string[]>>({});

  // 计算派生数据（在 early returns 之前，遵循 Rules of Hooks）
  const normalizedFields = normalizeFields(result as Record<string, unknown> | null | undefined);
  const evidence = result?.evidence || [];
  const trace = job?.trace || [];
  const isRunning = job ? ['queued', 'running'].includes(job.status) : false;
  const ocrText = extractOcrText(result as Record<string, unknown> | null | undefined);
  const ocrBlocks = extractOcrBlocks(result as Record<string, unknown> | null | undefined);
  const confidenceStr = result?.confidence;
  const fieldsWithConfidence = normalizedFields.filter((f) => f.confidence != null && f.confidence > 0);
  const confidenceNum = confidenceStr
    ? parseFloat(confidenceStr)
    : fieldsWithConfidence.length > 0
      ? fieldsWithConfidence.reduce((sum, f) => sum + (f.confidence || 0), 0) / fieldsWithConfidence.length
      : null;
  const displayStatus = job ? calculateDisplayStatus(job.status, normalizedFields) : '';
  const fieldMap = new Map(normalizedFields.map((f) => [f.key, f]));

  // Parse test items from fields dynamically（hooks 必须在 early returns 前声明）
  const testItemData = useMemo(() => {
    const data: Record<string, { field?: NormalizedField; parsed: { all: string[]; checked: string[] }; effectiveSelected: string[]; effectiveOptions: string[] }> = {};
    for (const key of testItemKeys) {
      const f = fieldMap.get(key);
      const parsed = parseTestItems(f?.value);
      const localSel = testItemSelections[key] || [];
      const effectiveSelected = localSel.length > 0 ? localSel : parsed.checked;
      const schemaOptions = testItemOptions[key] || [];
      const effectiveOptions = Array.from(new Set([...schemaOptions, ...effectiveSelected]));
      data[key] = { field: f, parsed, effectiveSelected, effectiveOptions };
    }
    return data;
  }, [testItemKeys, testItemSelections, testItemOptions, normalizedFields]);

  const handleFeedback = async () => {
    if (!feedbackField) {
      Message.warning('请选择字段');
      return;
    }
    setFeedbackLoading(true);
    try {
      await feedbackApi.submit({
        jobId: id,
        fieldKey: feedbackField,
        correction: feedbackCorrection,
        comment: feedbackComment,
      });
      Message.success('反馈提交成功');
      setFeedbackField('');
      setFeedbackCorrection('');
      setFeedbackComment('');
    } catch {
      Message.error('反馈提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  };

  // 点击字段值时打开图片查看器并高亮对应区域
  const handleFieldClickToImageViewer = (fieldKey: string) => {
    setHighlightedField(fieldKey);
    setImageViewerVisible(true);
  };

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            加载失败
          </Text>
          <Button icon={<IconRefresh />} onClick={() => refetch()}>
            重试
          </Button>
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

  if (!job) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p>任务不存在</p>
          <Button onClick={() => navigate('/jobs')}>返回列表</Button>
        </div>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          type="text"
          icon={<IconArrowLeft size={16} />}
          onClick={() => navigate('/jobs')}
        >
          返回
        </Button>
        <Text code style={{ fontSize: 14 }}>
          {job.id}
        </Text>
        <StatusTag status={displayStatus} />
        {job.sourceFileId && (
          <Button
            type="outline"
            icon={<IconEye />}
            onClick={() => setImageViewerVisible(true)}
            style={{ marginLeft: 'auto' }}
          >
            查看原图
          </Button>
        )}
      </div>

      {/* Recognition Progress (at top, horizontal) */}
      {trace.length > 0 && (
        <Card
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />
              识别进度
            </span>
          }
        >
          <PipelineProgress
            nodes={trace.map((step, idx) => ({
              key: step.node || step.step || `step-${idx}`,
              label: traceStepTitle(step),
              status: traceStepStatus(step),
              message: step.message ? String(step.message) : undefined,
              duration: step.duration,
              error: step.error ? String(step.error) : undefined,
            }))}
          />
        </Card>
      )}

      {/* Card 1: Task Info (full width) */}
      <Tabs defaultActiveTab="results" type="card" style={{ width: '100%' }}>
        <Tabs.TabPane key="results" title="识别结果">
          <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 16 }}>
      <Card
        style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />
            任务信息
          </span>
        }
      >
        <Descriptions
          column={3}
          data={[
            { label: 'Schema', value: job.schemaKey },
            {
              label: 'Provider',
              value:
                (job.providerConfig?.providerKey as string) ||
                (job.providerConfig?.ocrProviderKey as string) ||
                '-',
            },
            { label: '状态', value: <StatusTag status={displayStatus} /> },
            { label: '创建时间', value: formatTime(job.createdAt) },
            { label: '更新时间', value: formatTime(job.updatedAt) },
            ...(confidenceNum != null
              ? [
                  {
                    label: '整体置信度',
                    value: (
                      <Tag
                        color={confidenceColor(confidenceNum)}
                        style={{ fontWeight: 600 }}
                      >
                        {(confidenceNum * 100).toFixed(0)}%
                      </Tag>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {/* Confidence Dashboard */}
      {normalizedFields.length > 0 && confidenceNum != null && (
        <ConfidenceDashboard
          fields={normalizedFields.map((f) => ({
            key: f.key,
            label: fieldLabels[f.key] || f.key,
            value: f.value === '-' ? null : f.value,
            confidence: f.confidence,
          }))}
          overallConfidence={confidenceNum}
        />
      )}

      {/* Small field groups (<=2 fields) rendered full-width */}
      {fieldGroups.filter(g => g.key !== 'testItems' && g.fields.length <= 2).map((group) => (
        <Row gutter={16} key={group.key}>
          <Col xs={24} lg={24}>
            <FieldGroup
              title={group.label}
              icon={GROUP_ICON_MAP[group.key] || <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />}
              fields={getFieldData(normalizedFields, dynamicFieldGroups[group.key] || [], fieldLabels)}
              columns={2}
              onFieldClick={handleFieldClickToImageViewer}
            />
          </Col>
        </Row>
      ))}

      {/* Larger field groups (>2 fields) in two-column layout */}
      {(() => {
        const displayGroups = fieldGroups.filter(g => g.key !== 'testItems' && g.fields.length > 2);
        const rows: typeof displayGroups[] = [];
        for (let i = 0; i < displayGroups.length; i += 2) {
          rows.push(displayGroups.slice(i, i + 2));
        }
        return rows.map((row, rowIdx) => (
          <Row gutter={16} key={rowIdx}>
            {row.map((group) => (
              <Col xs={24} lg={12} key={group.key}>
                <FieldGroup
                  title={group.label}
                  icon={GROUP_ICON_MAP[group.key] || <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />}
                  fields={getFieldData(normalizedFields, dynamicFieldGroups[group.key] || [], fieldLabels)}
                  columns={2}
                  onFieldClick={handleFieldClickToImageViewer}
                />
              </Col>
            ))}
          </Row>
        ));
      })()}

      {/* Checkbox Matrix: Test Items (full width, dynamic from Schema) */}
      {testItemKeys.length > 0 && (
        <Card
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconApps style={{ color: '#3370FF', fontSize: 16 }} />
              检测项目
            </span>
          }
        >
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {testItemKeys.map((key) => {
              const data = testItemData[key];
              if (!data) return null;
              const label = fieldLabels[key] || key;
              return (
                <CheckboxMatrix
                  key={key}
                  title={label}
                  options={data.effectiveOptions}
                  selected={data.effectiveSelected}
                  confidence={data.field?.confidence}
                  source={data.field?.evidence?.[0]?.page ? `第${data.field.evidence[0].page}页` : undefined}
                  onChange={(selected) => setTestItemSelections(prev => ({ ...prev, [key]: selected }))}
                />
              );
            })}
          </Space>
        </Card>
      )}

      {/* 2-column grid: Test Product + Other Info */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minHeight: '100%' }}
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <IconStorage style={{ color: '#3370FF', fontSize: 16 }} />
                检测产品
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 检测公司 */}
              {fieldMap.get('testProvider')?.value && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>检测公司</Text>
                  <div style={{ marginTop: 4 }}>{fieldMap.get('testProvider')?.value}</div>
                </div>
              )}
              {/* 已选检测项目 */}
              {testItemKeys.some(key => (testItemData[key]?.effectiveSelected.length ?? 0) > 0) ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>已选检测项目</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {testItemKeys.map((key, idx) =>
                      (testItemData[key]?.effectiveSelected || []).map((item) => (
                        <Tag key={`${key}-${item}`} color={['blue', 'green', 'orange'][idx % 3]} size="small">{item}</Tag>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <Text type="secondary" style={{ fontSize: 13 }}>暂无已选检测项目</Text>
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minHeight: '100%' }}
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />
                其他信息
              </span>
            }
          >
            <Descriptions
              column={1}
              data={[
                {
                  label: '输血史',
                  value: fieldMap.get('transfusionHistory')?.value || '-',
                },
                ...(result?.reviewRequired
                  ? [
                      {
                        label: '复核状态',
                        value: <Tag color="orange" style={{ fontWeight: 600 }}>需复核</Tag>,
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* OCR Text */}
      <Card
        style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        title={
          <span>
            <IconFileText size={16} style={{ marginRight: 8, verticalAlign: -3 }} />
            OCR 原始文本
          </span>
        }
      >
        {resultLoading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin />
          </div>
        ) : ocrText ? (
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: 'var(--color-info-soft)',
              borderRadius: 'var(--radius-control)',
              fontSize: 13,
              lineHeight: 1.7,
              maxHeight: 500,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: "'SF Mono', 'Menlo', 'Consolas', 'Noto Sans SC', monospace",
            }}
          >
            {ocrText}
          </pre>
        ) : ocrBlocks.length > 0 ? (
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            {ocrBlocks.map((block, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
                  {block.text}
                </div>
                <Tag
                  size="small"
                  color={confidenceColor(block.confidence)}
                  style={{ flexShrink: 0 }}
                >
                  {(block.confidence * 100).toFixed(0)}%
                </Tag>
              </div>
            ))}
          </div>
        ) : result ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)' }}>
            暂无 OCR 文本
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)' }}>
            {isRunning ? '识别中，暂无文本...' : '暂无结果'}
          </div>
        )}
      </Card>

      {/* Evidence */}
      {evidence.length > 0 && (
        <Card
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          title="证据片段"
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {evidence.map((item: EvidenceItem, idx: number) => (
              <Card
                key={idx}
                size="small"
                style={{ background: 'var(--color-info-soft)' }}
              >
                {item.fieldKey && (
                  <Tag size="small" style={{ marginBottom: 4 }}>
                    {item.fieldKey}
                  </Tag>
                )}
                <div style={{ fontSize: 13 }}>{item.snippet || '-'}</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {item.page && `第 ${item.page} 页`}
                  {item.confidence != null &&
                    ` · 置信度 ${(item.confidence * 100).toFixed(0)}%`}
                </Text>
              </Card>
            ))}
          </Space>
        </Card>
      )}

      {/* Feedback */}
      {result && (
        <Card
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          title="复核反馈"
        >
          <Form layout="vertical">
            <FormItem label="字段" required>
              <Select
                placeholder="选择要复核的字段"
                value={feedbackField || undefined}
                onChange={(v) => setFeedbackField(v)}
                style={{ width: '100%' }}
              >
                {normalizedFields.map((f) => (
                  <Option key={f.key} value={f.key}>
                    {fieldLabels[f.key] || f.key}
                  </Option>
                ))}
              </Select>
            </FormItem>
            <FormItem label="修正值">
              <Input
                placeholder="输入正确值"
                value={feedbackCorrection}
                onChange={setFeedbackCorrection}
              />
            </FormItem>
            <FormItem label="备注">
              <Input.TextArea
                placeholder="补充说明（可选）"
                value={feedbackComment}
                onChange={setFeedbackComment}
                maxLength={500}
                showWordLimit
              />
            </FormItem>
            <Button
              type="primary"
              loading={feedbackLoading}
              onClick={handleFeedback}
              long
            >
              提交反馈
            </Button>
          </Form>
        </Card>
      )}

      {/* Running indicator */}
      {isRunning && !result && (
        <Card style={{ borderRadius: 8 }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size={40} />
            <p style={{ marginTop: 16, color: 'var(--color-muted)' }}>识别中...</p>
          </div>
        </Card>
      )}

          </Space>
        </Tabs.TabPane>
        <Tabs.TabPane key="trace" title="追溯链路">
          <div style={{ paddingTop: 16 }}>
            <TraceView job={job} result={result as RecognitionResult | null | undefined} />
          </div>
        </Tabs.TabPane>
      </Tabs>

      {/* Image Viewer Drawer */}
      <ImageViewer
        visible={imageViewerVisible}
        onClose={() => { setImageViewerVisible(false); setHighlightedField(undefined); }}
        imageUrl={job.sourceFileId ? `/api/files/${job.sourceFileId}/content` : ''}
        highlightedField={highlightedField}
        fields={normalizedFields.map((f) => {
          // 尝试从 OCR blocks 映射坐标：优先用 evidence.blockId 匹配
          let coordinates: { x: number; y: number; width: number; height: number } | undefined;
          const firstEvidence = f.evidence?.[0];
          if (firstEvidence?.blockId && ocrBlocks.length > 0) {
            const matchedBlock = ocrBlocks.find((b) => b.blockId === firstEvidence.blockId);
            if (matchedBlock?.coordinates) {
              coordinates = matchedBlock.coordinates;
            }
          }
          // 如果 blockId 没匹配到，尝试用 snippet 文本匹配 OCR block
          if (!coordinates && firstEvidence?.snippet && ocrBlocks.length > 0) {
            const snippet = String(firstEvidence.snippet).trim().substring(0, 20);
            const matchedBlock = ocrBlocks.find((b) => b.text.includes(snippet));
            if (matchedBlock?.coordinates) {
              coordinates = matchedBlock.coordinates;
            }
          }
          return {
            key: f.key,
            label: fieldLabels[f.key] || f.key,
            value: f.value,
            confidence: f.confidence,
            confirmed: false,
            coordinates,
          };
        })}
        onFieldClick={(fieldKey) => {
          setFeedbackField(fieldKey);
        }}
      />
    </Space>
  );
}
