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
  Grid,
  Descriptions,
  Space,
  Typography,
  Tabs,
  Drawer,
  Modal,
} from '@arco-design/web-react';
import { toast } from '../components/GlobalToast';
import { useJob, useDeleteJob, useRerunJob } from '../hooks/useJobs';
import { useResult } from '../hooks/useResults';
import { useSchemas } from '../hooks/useSchemas';
import { useProviders } from '../hooks/useProviders';
import { useKnowledgeList } from '../hooks/useKnowledge';
import { feedbackApi } from '../api/client';
import StatusTag from '../components/StatusTag';
import FieldGroup from '../components/FieldGroup';
import CheckboxMatrix from '../components/CheckboxMatrix';
import ImageViewer from '../components/ImageViewer';
import ConfidenceDashboard from '../components/ConfidenceDashboard';
import PipelineProgress from '../components/PipelineProgress';
import Skeleton, { MetricCardSkeleton } from '../components/Skeleton';
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
  IconTrash,
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
  sampleInfo: <IconBeaker style={{ color: '#3370FF', fontSize: 16 }} />,
  detectionItems: <IconApps style={{ color: '#3370FF', fontSize: 16 }} />,
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

function extractOcrText(result: import('../api/types').RecognitionResult | null | undefined): string | null {
  if (!result) return null;
  const payload = result.payload;
  if (!payload) return null;

  const ocr = payload.ocr;
  if (ocr) {
    const pages = ocr.pages;
    if (pages && pages.length > 0) {
      return pages.map((p) => p.text).filter(Boolean).join('\n\n');
    }
  }

  const direct = payload.ocrText || payload.text || payload.ocr_text || payload.rawText;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  return null;
}

function extractOcrBlocks(
  result: import('../api/types').RecognitionResult | null | undefined,
): Array<{ text: string; confidence: number; page: number; blockId?: string; coordinates?: { x: number; y: number; width: number; height: number } }> {
  if (!result) return [];
  const payload = result.payload;
  if (!payload) return [];
  const ocr = payload.ocr;
  if (!ocr) return [];
  return ocr.blocks || [];
}

function normalizeFields(result: import('../api/types').RecognitionResult | null | undefined) {
  if (!result) return [];

  // 按 fieldKey 分组 evidence
  const evidenceByField = new Map<string, import('../api/types').EvidenceItem[]>();
  for (const ev of result.evidence || []) {
    if (ev.fieldKey) {
      const list = evidenceByField.get(ev.fieldKey) || [];
      list.push(ev);
      evidenceByField.set(ev.fieldKey, list);
    }
  }

  // 优先使用 normalizedFields（已经过规范化）
  const raw = result.normalizedFields || result.fields;
  if (!raw) return [];

  // 数组格式：[{fieldKey, value, confidence, rawValue, ...}]
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => {
      const key = String(item.fieldKey || item.key || '');
      const rawVal = item.value;
      const strVal = rawVal == null ? '' : String(rawVal);
      // "unknown" 视为空值
      const isUnknown = strVal.toLowerCase() === 'unknown' || strVal === '';
      const isNull = rawVal == null || rawVal === '' || isUnknown;
      
      let displayValue: string;
      if (isNull) {
        displayValue = '-';
      } else if (Array.isArray(rawVal)) {
        displayValue = rawVal.length > 0
          ? rawVal.map((v: unknown) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join('、')
          : '-';
      } else if (typeof rawVal === 'object') {
        displayValue = JSON.stringify(rawVal);
      } else {
        displayValue = strVal;
      }
      return {
        key,
        value: displayValue,
        rawValue: String(item.rawValue || ''),
        originalValue: rawVal, // 保留原始值供 parseTestItems 使用
        confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
        evidence: evidenceByField.get(key) || [],
      };
    });
  }

  // 对象格式 fallback：{key: value, ...}
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([key, val]) => {
      const isNull = val == null || val === '' || (typeof val === 'string' && val.toLowerCase() === 'unknown');
      return {
        key,
        value: val != null ? String(val) : '-',
        rawValue: '',
        originalValue: val,
        confidence: 1.0,
        evidence: evidenceByField.get(key) || [],
      };
    });
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  Checkbox value parser - parse comma/array values into checkbox state */
/* ------------------------------------------------------------------ */

function parseTestItems(raw: string | string[] | undefined | null): { all: string[]; checked: string[] } {
  if (!raw) return { all: [], checked: [] };

  // 数组格式（直接来自 LLM 结果的 originalValue）
  if (Array.isArray(raw)) {
    const checked = raw.map((item: unknown) => String(item).trim()).filter(Boolean);
    return { all: [...checked], checked };
  }

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
  normalizedFields: Array<{ confidence?: number; value?: string }>
): string {
  // 只在后端状态为 partial_completed 时重新计算
  if (backendStatus !== 'partial_completed' && backendStatus !== 'needs_review') return backendStatus;

  // 计算有效置信度字段（排除空值字段）
  const fieldsWithConfidence = normalizedFields.filter(
    (f) => f.value !== '-' && f.confidence != null && f.confidence > 0
  );

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
  originalValue?: unknown; // 原始值（数组/字符串/null），用于 parseTestItems
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
  const payload = result?.payload || {};
  const extraction = payload.extraction || {};
  const validation = payload.validation || {};
  const rag = payload.rag || {};
  const ocr = payload.ocr || {};

  // 如果 trace 为空且没有 payload 数据，显示提示
  const hasPayloadData = Object.keys(payload).length > 0;
  if (trace.length === 0 && !hasPayloadData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-3)' }}>
        <IconGitBranch size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontSize: 14 }}>
          {['queued', 'running'].includes(job.status)
            ? '任务正在执行中，追溯数据将在完成后显示'
            : '暂无追溯链路数据'}
        </div>
      </div>
    );
  }

  // 构建追溯节点
  const nodes: TraceNode[] = [];

  // 1. 原始文件
  const sourceFile = job.sourceFile;
  nodes.push({
    id: 'source',
    title: '原始文件',
    icon: <IconFileText size={16} style={{ color: '#3370FF' }} />,
    status: sourceFile ? 'completed' : job.sourceFileId ? 'completed' : 'pending',
    details: [
      { label: '文件名', value: sourceFile?.originalName || job.sourceFileId || '未指定' },
      { label: '文件大小', value: sourceFile?.byteSize ? `${(Number(sourceFile.byteSize) / 1024).toFixed(1)} KB` : '-' },
      { label: 'MIME类型', value: sourceFile?.mimeType || '-' },
    ],
  });

  // 2. OCR 识别
  const ocrStep = trace.find((s: TraceStep) => (s.node || s.step) === 'ocr');
  const ocrBlocks = ocr.blocks || [];
  nodes.push({
    id: 'ocr',
    title: 'OCR 识别',
    icon: <IconEye size={16} style={{ color: '#3370FF' }} />,
    status: ocrStep?.status === 'completed' ? 'completed' : ocrStep?.status === 'failed' ? 'failed' : ocrStep?.status === 'running' ? 'running' : 'pending',
    details: [
      { label: 'Provider', value: ocr.provider || job.providerConfig?.ocrProviderKey || '-' },
      { label: '耗时', value: ocrStep?.duration ? formatDuration(ocrStep.duration) : '-' },
      { label: '输出 blocks', value: ocrBlocks.length > 0 ? String(ocrBlocks.length) : '-' },
      ...(ocrStep?.message ? [{ label: '消息', value: String(ocrStep.message) }] : []),
    ],
  });

  // 3. RAG 知识检索
  const ragStep = trace.find((s: TraceStep) => (s.node || s.step) === 'rag');
  const ragHits = rag.hits || [];
  const ragMisses = rag.misses || [];
  const ragQuery = rag.query || '';
  nodes.push({
    id: 'rag',
    title: 'RAG 知识检索',
    icon: <IconDatabase size={16} style={{ color: '#3370FF' }} />,
    status: ragStep?.status === 'completed' ? 'completed' : ragStep ? 'pending' : 'pending',
    details: [
      { label: '检索 Query', value: ragQuery || '-' },
      { label: '命中条目', value: ragHits.length > 0 ? `${ragHits.length} 条` : '-' },
      { label: '未命中', value: ragMisses.length > 0 ? `${ragMisses.length} 条` : '0' },
      ...(ragStep?.message ? [{ label: '消息', value: String(ragStep.message) }] : []),
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
  const tokenUsage = extraction.tokenUsage || {};
  nodes.push({
    id: 'extraction',
    title: 'LLM 抽取',
    icon: <IconCode size={16} style={{ color: '#3370FF' }} />,
    status: extractionStep?.status === 'completed' ? 'completed' : extractionStep?.status === 'failed' ? 'failed' : 'pending',
    details: [
      { label: 'Provider', value: extraction.provider || job.providerConfig?.providerKey || '-' },
      { label: '模型', value: extraction.model || '-' },
      { label: 'Token 用量', value: tokenUsage.total ? `${tokenUsage.total} (prompt: ${tokenUsage.prompt || '-'}, completion: ${tokenUsage.completion || '-'})` : '-' },
      { label: '耗时', value: extractionStep?.duration ? formatDuration(extractionStep.duration) : '-' },
      ...(extractionStep?.message ? [{ label: '消息', value: String(extractionStep.message) }] : []),
    ],
  });

  // 5. 校验 & 决策
  const validationStep = trace.find((s: TraceStep) => (s.node || s.step) === 'validation' || (s.node || s.step) === 'autoDecision');
  const fieldResults = validation.fieldResults || [];
  nodes.push({
    id: 'validation',
    title: '校验 & 决策',
    icon: <IconCheckCircle size={16} style={{ color: '#3370FF' }} />,
    status: validationStep?.status === 'completed' ? 'completed' : validationStep?.status === 'failed' ? 'failed' : 'pending',
    details: [
      { label: '字段数', value: fieldResults.length > 0 ? String(fieldResults.length) : '-' },
      { label: '耗时', value: validationStep?.duration ? formatDuration(validationStep.duration) : '-' },
      ...(validationStep?.message ? [{ label: '消息', value: String(validationStep.message) }] : []),
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
  const { data: providersData } = useProviders();
  const deleteJob = useDeleteJob();
  const rerunJob = useRerunJob();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteJob.mutateAsync(id!);
      toast.success('任务已删除');
      navigate('/jobs');
    } catch {
      toast.error('删除失败');
    } finally {
      setShowDeleteModal(false);
    }
  };

  const handleRerun = async () => {
    try {
      await rerunJob.mutateAsync(id!);
      toast.success('任务已重新提交');
      refetch();
    } catch {
      toast.error('重跑失败');
    }
  };

  // Provider 名称映射
  const providerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    providersData?.items?.forEach((p) => {
      map[p.key] = p.displayName || p.key;
    });
    return map;
  }, [providersData]);

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

  // 从 Schema 动态提取 detectionItems 的选项
  const testItemOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const field of schemaFields) {
      if (field.key.startsWith('detectionItems') || field.key.startsWith('detectionItem')) {
        options[field.key] = extractOptionsFromComments(field);
      }
    }
    return options;
  }, [schemaFields]);

  // 获取 detection item 字段 keys
  const testItemKeys = useMemo(() =>
    schemaFields.filter(f => f.key.startsWith('detectionItems') || f.key.startsWith('detectionItem')).map(f => f.key),
    [schemaFields]
  );

  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackField, setFeedbackField] = useState('');
  const [feedbackCorrection, setFeedbackCorrection] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackDrawerVisible, setFeedbackDrawerVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | undefined>(undefined);

  // 字段详情 Drawer 状态
  const [fieldDetailVisible, setFieldDetailVisible] = useState(false);
  const [fieldDetailKey, setFieldDetailKey] = useState<string>('');
  const [fieldReviewLoading, setFieldReviewLoading] = useState(false);

  // Dynamic checkbox state for test items (keyed by field key)
  const [testItemSelections, setTestItemSelections] = useState<Record<string, string[]>>({});

  // 计算派生数据（在 early returns 之前，遵循 Rules of Hooks）
  const normalizedFields = normalizeFields(result);
  const evidence = result?.evidence || [];
  const trace = job?.trace || [];
  const isRunning = job ? ['queued', 'running'].includes(job.status) : false;
  const ocrText = extractOcrText(result);
  const ocrBlocks = extractOcrBlocks(result);
  const confidenceStr = result?.confidence;
  // 只统计有值字段的置信度，空值字段不参与计算（空值 = 识别置信度 100%）
  const fieldsWithConfidence = normalizedFields.filter(
    (f) => f.value !== '-' && f.confidence != null && f.confidence > 0
  );
  const confidenceNum = confidenceStr
    ? parseFloat(confidenceStr)
    : fieldsWithConfidence.length > 0
      ? fieldsWithConfidence.reduce((sum, f) => sum + (f.confidence || 0), 0) / fieldsWithConfidence.length
      : null;
  const displayStatus = job ? calculateDisplayStatus(job.status, normalizedFields) : '';
  const fieldMap = new Map(normalizedFields.map((f) => [f.key, f]));

  // 字段详情 Drawer — 关联知识（hooks 必须在 early returns 前声明）
  const { data: fieldKnowledgeData } = useKnowledgeList(
    fieldDetailKey ? { fieldKey: fieldDetailKey } : undefined
  );
  const fieldKnowledgeEntries = fieldKnowledgeData?.entries || [];

  // Parse test items from fields dynamically（hooks 必须在 early returns 前声明）
  const testItemData = useMemo(() => {
    const data: Record<string, { field?: NormalizedField; parsed: { all: string[]; checked: string[] }; effectiveSelected: string[]; effectiveOptions: string[] }> = {};
    for (const key of testItemKeys) {
      const f = fieldMap.get(key);
      const parsed = parseTestItems(f?.originalValue as string | string[] | null ?? f?.value);
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
      toast.warning('请选择字段');
      return;
    }
    setFeedbackLoading(true);
    try {
      await feedbackApi.submit({
        jobId: id!,
        fieldKey: feedbackField,
        correctedValue: feedbackCorrection,
        comment: feedbackComment,
      });
      toast.success('反馈提交成功');
      setFeedbackField('');
      setFeedbackCorrection('');
      setFeedbackComment('');
    } catch {
      toast.error('反馈提交失败');
    } finally {
      setFeedbackLoading(false);
    }
  };

  // 点击字段值时打开字段详情 Drawer
  const handleFieldClickToImageViewer = (fieldKey: string) => {
    setFieldDetailKey(fieldKey);
    setFieldDetailVisible(true);
  };

  // 字段审核操作 — 通过
  const handleFieldApprove = async () => {
    if (!fieldDetailKey || !id) return;
    const field = fieldMap.get(fieldDetailKey);
    setFieldReviewLoading(true);
    try {
      await feedbackApi.submit({
        jobId: id,
        fieldKey: fieldDetailKey,
        originalValue: field?.rawValue || field?.value || '',
        correctedValue: field?.value || '',
        comment: '字段审核通过',
      });
      toast.success('已通过审核');
      setFieldDetailVisible(false);
    } catch {
      toast.error('审核操作失败');
    } finally {
      setFieldReviewLoading(false);
    }
  };

  // 字段审核操作 — 拒绝（打开反馈抽屉填写修正值）
  const handleFieldReject = () => {
    setFeedbackField(fieldDetailKey);
    setFeedbackCorrection('');
    setFeedbackComment('');
    setFieldDetailVisible(false);
    setFeedbackDrawerVisible(true);
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
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton variant="rounded" width={80} height={32} />
          <Skeleton width={180} height={16} />
          <Skeleton variant="rounded" width={60} height={22} />
        </div>
        <Card style={{ borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} variant="rounded" width="100%" height={40} style={{ flex: 1 }} />
            ))}
          </div>
        </Card>
        <Card style={{ borderRadius: 8 }}>
          <Skeleton width={120} height={16} style={{ marginBottom: 16 }} />
          <Skeleton variant="rounded" width="100%" height={200} />
        </Card>
        <Card style={{ borderRadius: 8 }}>
          <Skeleton width={100} height={16} style={{ marginBottom: 16 }} />
          <Skeleton variant="text" lines={6} />
        </Card>
      </Space>
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
        {['failed', 'completed', 'partial_completed'].includes(job.status) && (
          <Button
            type="outline"
            icon={<IconRefresh />}
            onClick={handleRerun}
            loading={rerunJob.isPending}
            style={{ marginLeft: 'auto' }}
          >
            重跑
          </Button>
        )}
        {job.sourceFileId && (
          <Button
            type="outline"
            icon={<IconEye />}
            onClick={() => setImageViewerVisible(true)}
            style={{ marginLeft: ['failed', 'completed', 'partial_completed'].includes(job.status) ? 8 : 'auto' }}
          >
            查看原图
          </Button>
        )}
        {result && (
          <Button
            type="primary"
            onClick={() => setFeedbackDrawerVisible(true)}
            style={{ marginLeft: 8 }}
          >
            提交反馈
          </Button>
        )}
        <Button
          type="outline"
          icon={<IconBeaker />}
          onClick={() => navigate('/evaluation')}
          style={{ marginLeft: 8 }}
        >
          评测中心
        </Button>
        <Button
          type="outline"
          status="danger"
          icon={<IconTrash size={14} />}
          onClick={handleDelete}
          loading={deleteJob.isPending}
        >
          删除
        </Button>
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
      {/* 失败任务错误提示 */}
      {job.status === 'failed' && (
        <Card
          style={{
            borderRadius: 8,
            border: '1px solid var(--color-danger-light-5)',
            background: 'var(--color-danger-light-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Text style={{ fontWeight: 600, color: 'var(--color-danger-6)' }}>
                识别失败
              </Text>
              <div style={{ marginTop: 4, color: 'var(--color-text-2)' }}>
                {(() => {
                  const err = job.error;
                  if (!err) return '未知错误';
                  if (typeof err === 'string') return err;
                  if (typeof err === 'object' && err !== null) {
                    const e = err as Record<string, unknown>;
                    return String(e.message || e.error || JSON.stringify(err));
                  }
                  return String(err);
                })()}
              </div>
            </div>
            <Button
              type="primary"
              icon={<IconRefresh />}
              onClick={handleRerun}
              loading={rerunJob.isPending}
            >
              重跑
            </Button>
          </div>
        </Card>
      )}

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
              value: (() => {
                const providerKey = job.providerConfig?.providerKey || job.providerConfig?.ocrProviderKey || '';
                if (!providerKey) return '未指定';
                return providerNameMap[providerKey] || providerKey;
              })(),
            },
            { label: '状态', value: <StatusTag status={displayStatus} /> },
            {
              label: '源文件数量',
              value: (() => {
                const sourceFileIds = Array.isArray(job.sourceFileIds)
                  ? job.sourceFileIds
                  : Array.isArray(job.options?.sourceFileIds)
                    ? job.options.sourceFileIds
                    : [];
                const count = sourceFileIds.length || (job.sourceFileId ? 1 : 0);
                return count > 0 ? `${count} 个` : '-';
              })(),
            },
            { label: '创建时间', value: formatTime(job.createdAt) },
            { label: '更新时间', value: formatTime(job.updatedAt) },
            ...(job.startedAt
              ? [{
                  label: '耗时',
                  value: (() => {
                    const start = new Date(job.startedAt).getTime();
                    const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
                    const ms = end - start;
                    if (ms < 1000) return `${ms}ms`;
                    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
                    return `${(ms / 60000).toFixed(1)}min`;
                  })(),
                }]
              : []),
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
      {fieldGroups.filter(g => g.key !== 'detectionItems' && g.fields.length <= 2).map((group) => (
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
        const displayGroups = fieldGroups.filter(g => g.key !== 'detectionItems' && g.fields.length > 2);
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

      {/* Checkbox Matrix: Detection Items (full width, dynamic from Schema) */}
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
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconFileText style={{ color: '#3370FF', fontSize: 16 }} />
              证据片段
              <Tag size="small" color="blue" style={{ borderRadius: 10 }}>{evidence.length}</Tag>
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {evidence.map((item: EvidenceItem, idx: number) => {
              const label = item.fieldKey ? (fieldLabels[item.fieldKey] || item.fieldKey) : '';
              // 从 normalizedFields 中找到对应字段的值和置信度
              const fieldData = item.fieldKey ? fieldMap.get(item.fieldKey) : undefined;
              return (
                <Card
                  key={idx}
                  size="small"
                  style={{
                    borderLeft: '3px solid #3370FF',
                    background: 'var(--color-bg-white)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* 字段标签 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Tag size="small" color="blue" style={{ borderRadius: 10, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label || '未知字段'}
                      </Tag>
                      {item.confidence != null && (
                        <Tag
                          size="small"
                          color={confidenceColor(item.confidence)}
                          style={{ fontWeight: 600, borderRadius: 10 }}
                        >
                          {(item.confidence * 100).toFixed(0)}%
                        </Tag>
                      )}
                    </div>
                    {/* 字段值 */}
                    {fieldData && fieldData.value !== '-' && (
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-title)' }}>
                        {fieldData.value}
                      </div>
                    )}
                    {/* 来源摘要 */}
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)', lineHeight: 1.5 }}>
                      {item.snippet || '-'}
                    </div>
                    {/* 来源页码 */}
                    {item.page && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        来源：第 {item.page} 页
                      </Text>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      )}

      {/* Feedback Drawer */}
      <Drawer
        title="复核反馈"
        visible={feedbackDrawerVisible}
        onCancel={() => setFeedbackDrawerVisible(false)}
        width={400}
        footer={null}
      >
        {result && (
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
        )}
      </Drawer>

      {/* Field Detail Drawer */}
      {fieldDetailKey && (() => {
        const currentField = fieldMap.get(fieldDetailKey);
        const fieldLabel = fieldLabels[fieldDetailKey] || fieldDetailKey;
        const fieldConfidence = currentField?.confidence;
        const fieldRawValue = currentField?.rawValue || '';
        const fieldValue = currentField?.value || '-';
        const fieldEvidence = currentField?.evidence || [];
        const needsReview = (fieldConfidence != null && fieldConfidence < 0.8) || result?.reviewRequired;

        return (
          <Drawer
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />
                字段详情：{fieldLabel}
              </span>
            }
            visible={fieldDetailVisible}
            onCancel={() => {
              setFieldDetailVisible(false);
              setFieldDetailKey('');
            }}
            width={480}
            footer={null}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* 提取值 & 置信度 */}
              <Card size="small" style={{ background: 'var(--color-info-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>提取值</Text>
                  {fieldConfidence != null && (
                    <Tag
                      color={confidenceColor(fieldConfidence)}
                      style={{ fontWeight: 600 }}
                    >
                      置信度 {(fieldConfidence * 100).toFixed(0)}%
                    </Tag>
                  )}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-title)' }}>
                  {fieldValue}
                </div>
              </Card>

              {/* 原始值 */}
              {fieldRawValue && (
                <div>
                  <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                    原始值 (OCR)
                  </Text>
                  <div style={{
                    padding: '8px 12px',
                    background: 'var(--color-bg-2)',
                    borderRadius: 'var(--radius-control)',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--color-text-2)',
                  }}>
                    {fieldRawValue}
                  </div>
                </div>
              )}

              {/* Tabs: OCR 证据 / 关联知识 */}
              <Tabs type="card" style={{ width: '100%' }}>
                <Tabs.TabPane key="evidence" title={`OCR 证据 (${fieldEvidence.length})`}>
                  <div style={{ paddingTop: 12 }}>
                    {fieldEvidence.length > 0 ? (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {fieldEvidence.map((ev, idx) => (
                          <Card
                            key={idx}
                            size="small"
                            style={{ borderLeft: '3px solid #3370FF' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {ev.snippet && (
                                <div style={{
                                  fontSize: 13,
                                  lineHeight: 1.6,
                                  padding: '6px 10px',
                                  background: 'var(--color-info-soft)',
                                  borderRadius: 'var(--radius-control)',
                                  fontStyle: 'italic',
                                }}>
                                  "{ev.snippet}"
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {ev.page && (
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    来源：第 {ev.page} 页
                                  </Text>
                                )}
                                {ev.confidence != null && (
                                  <Tag
                                    size="small"
                                    color={confidenceColor(ev.confidence)}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {(ev.confidence * 100).toFixed(0)}%
                                  </Tag>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-3)' }}>
                        暂无 OCR 证据
                      </div>
                    )}
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key="knowledge" title={`关联知识 (${fieldKnowledgeEntries.length})`}>
                  <div style={{ paddingTop: 12 }}>
                    {fieldKnowledgeEntries.length > 0 ? (
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {fieldKnowledgeEntries.map((entry) => (
                          <Card
                            key={entry.id}
                            size="small"
                            style={{ borderLeft: '3px solid #00B42A' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Text style={{ fontWeight: 600, fontSize: 14 }}>
                                  {entry.title}
                                </Text>
                                <Tag size="small" color="green" style={{ borderRadius: 10 }}>
                                  {entry.kind === 'medical_term' ? '医学术语'
                                    : entry.kind === 'cancer_alias' ? '肿瘤别名'
                                    : entry.kind === 'lims_dictionary' ? 'LIMS 字典'
                                    : entry.kind === 'field_description' ? '字段描述'
                                    : entry.kind}
                                </Tag>
                              </div>
                              <div style={{
                                fontSize: 13,
                                lineHeight: 1.6,
                                color: 'var(--color-text-2)',
                                whiteSpace: 'pre-wrap',
                              }}>
                                {entry.content}
                              </div>
                              {entry.keywords.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {entry.keywords.map((kw, idx) => (
                                    <Tag key={idx} size="small" color="blue" style={{ borderRadius: 10 }}>
                                      {kw}
                                    </Tag>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-3)' }}>
                        暂无关联知识
                      </div>
                    )}
                  </div>
                </Tabs.TabPane>
              </Tabs>

              {/* 审核操作 */}
              {needsReview && (
                <Card
                  size="small"
                  style={{
                    background: 'var(--color-warning-light-1)',
                    border: '1px solid var(--color-warning-light-5)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Text style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-warning-6)' }}>
                      该字段需要复核
                    </Text>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="primary"
                        status="success"
                        loading={fieldReviewLoading}
                        onClick={handleFieldApprove}
                        style={{ flex: 1 }}
                      >
                        ✓ 通过
                      </Button>
                      <Button
                        type="primary"
                        status="danger"
                        onClick={handleFieldReject}
                        style={{ flex: 1 }}
                      >
                        ✗ 拒绝
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </Space>
          </Drawer>
        );
      })()}

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

      {/* 删除确认弹窗 */}
      <Modal
        title="确认删除"
        visible={showDeleteModal}
        onOk={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ status: 'danger' }}
        confirmLoading={deleteJob.isPending}
        closable
        maskClosable
      >
        <p>删除后不可恢复，确定要删除该任务吗？</p>
      </Modal>
    </Space>
  );
}
