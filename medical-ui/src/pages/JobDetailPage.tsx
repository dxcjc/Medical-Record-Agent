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
} from '@arco-design/web-react';
import { useJob } from '../hooks/useJobs';
import { useResult } from '../hooks/useResults';
import { feedbackApi } from '../api/client';
import StatusTag from '../components/StatusTag';
import FieldGroup from '../components/FieldGroup';
import CheckboxMatrix from '../components/CheckboxMatrix';
import ImageViewer from '../components/ImageViewer';
import ConfidenceDashboard from '../components/ConfidenceDashboard';
import PipelineProgress from '../components/PipelineProgress';
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
} from '../icons/appIcons';
import type { TraceStep, EvidenceItem } from '../api/types';

const { Row, Col } = Grid;
const { Title, Text } = Typography;
const FormItem = Form.Item;
const { Option } = Select;

/* ------------------------------------------------------------------ */
/*  Field group mapping keys                                           */
/* ------------------------------------------------------------------ */

const FIELD_GROUPS = {
  patientInfo: ['patientName', 'patientGender', 'patientAge', 'outpatientNo', 'phone', 'idNumber', 'ethnicity'],
  referralInfo: ['referringDoctor', 'referralDate', 'pathologyNo', 'sampleNo', 'clinicRoom'],
  clinicalDiagnosis: ['tumorType', 'tumorCategory'],
  sampleInfo: ['sampleType', 'bloodSample', 'samplePrepTime', 'tumorCellPercent'],
  testItemsLung: ['testItemsLung'],
  testItemsGI: ['testItemsGI'],
  testItemsOther: ['testItemsOther'],
  testProduct: ['testProvider', 'documentNo', 'documentVersion', 'transfusionHistory'],
};

const FIELD_LABELS: Record<string, string> = {
  patientName: '姓名',
  patientGender: '性别',
  patientAge: '年龄',
  outpatientNo: '门诊号',
  phone: '电话',
  idNumber: '身份证号',
  ethnicity: '民族',
  referringDoctor: '送检医生',
  referralDate: '送检日期',
  pathologyNo: '病理号',
  sampleNo: '样本编号',
  clinicRoom: '诊室',
  tumorType: '肿瘤类型',
  tumorCategory: '肿瘤分类',
  sampleType: '标本类型',
  bloodSample: '血液样本',
  samplePrepTime: '制备时间',
  tumorCellPercent: '肿瘤细胞含量',
  testProvider: '检测公司',
  documentNo: '文件编号',
  documentVersion: '文件版本',
  transfusionHistory: '输血史',
};

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
/*  Default test item lists for tumor gene testing                     */
/* ------------------------------------------------------------------ */

const LUNG_TEST_ITEMS = [
  '肿瘤9基因', '肿瘤13基因', '肺癌11基因', 'EGFR',
  '肿瘤40基因', '188基因', '1021基因', '肿瘤mrd(血液)', '实体瘤40基因',
];

const GI_TEST_ITEMS = [
  '肠癌3基因(+MSI)', 'MSI', 'UGT1A1', 'C-Kit',
  'PDGFRA', '肠癌4基因(+MSI)', '胃癌18基因', '肿瘤18基因',
  '肿瘤40基因', '林奇综合征',
];

const OTHER_TEST_ITEMS = [
  'Onco1021-MRD', 'OncoD肿瘤用药基因检测', '同源重组修复缺陷基因检测',
  'OncoMD肿瘤疗效基因监测', '脑胶质瘤基因检测', '肿瘤临床超级外显子组基因检测',
  '肿瘤融合基因检测', 'PD-L1 IHC检测', '淋巴瘤基因检测',
];

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

function getFieldData(fields: NormalizedField[], keys: string[]) {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  return keys.map((key) => {
    const f = fieldMap.get(key);
    return {
      key,
      label: FIELD_LABELS[key] || key,
      value: f?.value ?? null,
      confidence: f?.confidence,
      source: f?.evidence?.[0]?.page ? `第${f.evidence[0].page}页` : undefined,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, error, refetch } = useJob(id!);
  const { data: result, isLoading: resultLoading } = useResult(id!);

  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackField, setFeedbackField] = useState('');
  const [feedbackCorrection, setFeedbackCorrection] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [highlightedField, setHighlightedField] = useState<string | undefined>(undefined);

  // Local checkbox state for test items
  const [lungSelected, setLungSelected] = useState<string[]>([]);
  const [giSelected, setGiSelected] = useState<string[]>([]);
  const [otherSelected, setOtherSelected] = useState<string[]>([]);

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

  const normalizedFields = normalizeFields(result as Record<string, unknown> | null | undefined);
  const evidence = result?.evidence || [];
  const trace = job.trace || [];
  const isRunning = ['queued', 'running'].includes(job.status);
  const ocrText = extractOcrText(result as Record<string, unknown> | null | undefined);
  const ocrBlocks = extractOcrBlocks(result as Record<string, unknown> | null | undefined);
  const confidenceStr = result?.confidence;
  // 如果 API 没有返回整体置信度，从字段置信度计算平均值（排除空值字段）
  const fieldsWithConfidence = normalizedFields.filter((f) => f.confidence != null && f.confidence > 0);
  const confidenceNum = confidenceStr
    ? parseFloat(confidenceStr)
    : fieldsWithConfidence.length > 0
      ? fieldsWithConfidence.reduce((sum, f) => sum + (f.confidence || 0), 0) / fieldsWithConfidence.length
      : null;

  // 根据置信度重新计算显示状态（置信度0=空值=通过，≥80%=完成）
  const displayStatus = calculateDisplayStatus(job.status, normalizedFields);

  // Build field data for each group
  const fieldMap = new Map(normalizedFields.map((f) => [f.key, f]));

  // Parse test items from fields to determine initial selected state
  const lungField = fieldMap.get('testItemsLung');
  const giField = fieldMap.get('testItemsGI');
  const otherField = fieldMap.get('testItemsOther');

  const lungParsed = parseTestItems(lungField?.value);
  const giParsed = parseTestItems(giField?.value);
  const otherParsed = parseTestItems(otherField?.value);

  // Use parsed selections as initial if local state is empty
  const effectiveLungSelected = lungSelected.length > 0 ? lungSelected : lungParsed.checked;
  const effectiveGiSelected = giSelected.length > 0 ? giSelected : giParsed.checked;
  const effectiveOtherSelected = otherSelected.length > 0 ? otherSelected : otherParsed.checked;

  // 合并硬编码选项和 LLM 识别到的项目（去重）
  const effectiveLungOptions = Array.from(new Set([...LUNG_TEST_ITEMS, ...effectiveLungSelected]));
  const effectiveGiOptions = Array.from(new Set([...GI_TEST_ITEMS, ...effectiveGiSelected]));
  const effectiveOtherOptions = Array.from(new Set([...OTHER_TEST_ITEMS, ...effectiveOtherSelected]));

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
            nodes={trace.map((step) => ({
              key: step.node || step.step || String(Math.random()),
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
            label: FIELD_LABELS[f.key] || f.key,
            value: f.value === '-' ? null : f.value,
            confidence: f.confidence,
          }))}
          overallConfidence={confidenceNum}
        />
      )}

      {/* 2-column grid: Patient + Referral */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <FieldGroup
            title="患者信息"
            icon={<IconUser style={{ color: '#3370FF', fontSize: 16 }} />}
            fields={getFieldData(normalizedFields, FIELD_GROUPS.patientInfo)}
            columns={2}
            onFieldClick={handleFieldClickToImageViewer}
          />
        </Col>
        <Col xs={24} lg={12}>
          <FieldGroup
            title="送检信息"
            icon={<IconSend style={{ color: '#3370FF', fontSize: 16 }} />}
            fields={getFieldData(normalizedFields, FIELD_GROUPS.referralInfo)}
            columns={2}
            onFieldClick={handleFieldClickToImageViewer}
          />
        </Col>
      </Row>

      {/* 2-column grid: Clinical Diagnosis + Sample Info */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <FieldGroup
            title="临床诊断"
            icon={<IconCode style={{ color: '#3370FF', fontSize: 16 }} />}
            fields={getFieldData(normalizedFields, FIELD_GROUPS.clinicalDiagnosis)}
            columns={2}
            onFieldClick={handleFieldClickToImageViewer}
          />
        </Col>
        <Col xs={24} lg={12}>
          <FieldGroup
            title="样本信息"
            icon={<IconBeaker style={{ color: '#3370FF', fontSize: 16 }} />}
            fields={getFieldData(normalizedFields, FIELD_GROUPS.sampleInfo)}
            columns={2}
            onFieldClick={handleFieldClickToImageViewer}
          />
        </Col>
      </Row>

      {/* Checkbox Matrix: Test Items (full width) */}
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
          <CheckboxMatrix
            title="肺癌检测项目"
            options={effectiveLungOptions}
            selected={effectiveLungSelected}
            confidence={lungField?.confidence}
            source={lungField?.evidence?.[0]?.page ? `第${lungField.evidence[0].page}页` : undefined}
            onChange={setLungSelected}
          />
          <CheckboxMatrix
            title="消化道肿瘤检测项目"
            options={effectiveGiOptions}
            selected={effectiveGiSelected}
            confidence={giField?.confidence}
            source={giField?.evidence?.[0]?.page ? `第${giField.evidence[0].page}页` : undefined}
            onChange={setGiSelected}
          />
          <CheckboxMatrix
            title="其他检测项目"
            options={effectiveOtherOptions}
            selected={effectiveOtherSelected}
            confidence={otherField?.confidence}
            source={otherField?.evidence?.[0]?.page ? `第${otherField.evidence[0].page}页` : undefined}
            onChange={setOtherSelected}
          />
        </Space>
      </Card>

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
              {(effectiveLungSelected.length > 0 || effectiveGiSelected.length > 0 || effectiveOtherSelected.length > 0) ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>已选检测项目</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {effectiveLungSelected.map((item) => (
                      <Tag key={`lung-${item}`} color="blue" size="small">{item}</Tag>
                    ))}
                    {effectiveGiSelected.map((item) => (
                      <Tag key={`gi-${item}`} color="green" size="small">{item}</Tag>
                    ))}
                    {effectiveOtherSelected.map((item) => (
                      <Tag key={`other-${item}`} color="orange" size="small">{item}</Tag>
                    ))}
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
                    {FIELD_LABELS[f.key] || f.key}
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
            label: FIELD_LABELS[f.key] || f.key,
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
