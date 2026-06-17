import { useState } from 'react';
import { Card, Tag, Space, Descriptions, Typography } from '@arco-design/web-react';
import {
  IconFileText,
  IconEye,
  IconCode,
  IconCheckCircle,
  IconDatabase,
  IconGitBranch,
  IconChevronRight,
  IconChevronDown,
} from '../icons/appIcons';
import { formatDuration, confidenceColor } from '../utils/jobDetail';
import type { TraceStep, RecognitionJob, RecognitionResult } from '../api/types';

const { Text } = Typography;

export interface TraceNode {
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

export default function TraceView({
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

  const nodes: TraceNode[] = [];

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

  const ocrStep = trace.find((s: TraceStep) => (s.node || s.step) === 'ocr');
  const ocrBlocks = ocr.blocks || [];
  const config = job.providerConfig as Record<string, unknown> | undefined;
  const ocrProviderKey = (config?.ocrProviderKey as string) || '';
  nodes.push({
    id: 'ocr',
    title: 'OCR 识别',
    icon: <IconEye size={16} style={{ color: '#3370FF' }} />,
    status: ocrStep?.status === 'completed' ? 'completed' : ocrStep?.status === 'failed' ? 'failed' : ocrStep?.status === 'running' ? 'running' : 'pending',
    details: [
      { label: 'Provider', value: ocr.provider || ocrProviderKey || '-' },
      { label: '耗时', value: ocrStep?.duration ? formatDuration(ocrStep.duration) : '-' },
      { label: '输出 blocks', value: ocrBlocks.length > 0 ? String(ocrBlocks.length) : '-' },
      ...(ocrStep?.message ? [{ label: '消息', value: String(ocrStep.message) }] : []),
    ],
  });

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

  const extractionStep = trace.find((s: TraceStep) => (s.node || s.step) === 'extraction');
  const tokenUsage = extraction.tokenUsage || {};
  const llmProviderKey = (config?.providerKey as string) || '';
  nodes.push({
    id: 'extraction',
    title: 'LLM 抽取',
    icon: <IconCode size={16} style={{ color: '#3370FF' }} />,
    status: extractionStep?.status === 'completed' ? 'completed' : extractionStep?.status === 'failed' ? 'failed' : 'pending',
    details: [
      { label: 'Provider', value: extraction.provider || llmProviderKey || '-' },
      { label: '模型', value: extraction.model || '-' },
      { label: 'Token 用量', value: tokenUsage.total ? `${tokenUsage.total} (prompt: ${tokenUsage.prompt || '-'}, completion: ${tokenUsage.completion || '-'})` : '-' },
      { label: '耗时', value: extractionStep?.duration ? formatDuration(extractionStep.duration) : '-' },
      ...(extractionStep?.message ? [{ label: '消息', value: String(extractionStep.message) }] : []),
    ],
  });

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
