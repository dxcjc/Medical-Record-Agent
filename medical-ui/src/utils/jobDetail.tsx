import type { EvidenceItem, SchemaField, RecognitionResult } from '../api/types';

/** 从 Schema field 的 comments 中提取选项列表 */
export function extractOptionsFromComments(field: SchemaField): string[] {
  const comments = Array.isArray(field.comments) ? field.comments.join(' ') : String(field.comments || '');
  const match = comments.match(/选项[：:]\s*(.+?)(?:[""]|$)/);
  if (match) {
    return match[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  }
  const items = comments.match(/[A-Za-z0-9一-鿿()（）+\-]+(?:[、,，][A-Za-z0-9一-鿿()（）+\-]+)+/g);
  if (items && items.length > 0) {
    const longest = items.sort((a, b) => b.length - a.length)[0];
    return longest.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export function traceStepStatus(step: import('../api/types').TraceStep): 'wait' | 'process' | 'finish' | 'error' {
  if (step.status === 'completed') return 'finish';
  if (step.status === 'failed' || step.error) return 'error';
  if (step.status === 'running') return 'process';
  return 'wait';
}

export function traceStepTitle(step: import('../api/types').TraceStep): string {
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

export function formatTime(t?: string): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN');
}

export function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function confidenceColor(c: number): string {
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'orange';
  return 'red';
}

export function extractOcrText(result: RecognitionResult | null | undefined): string | null {
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

export function extractOcrBlocks(
  result: RecognitionResult | null | undefined,
): Array<{ text: string; confidence: number; page: number; blockId?: string; coordinates?: { x: number; y: number; width: number; height: number } }> {
  if (!result) return [];
  const payload = result.payload;
  if (!payload) return [];
  const ocr = payload.ocr;
  if (!ocr) return [];
  return ocr.blocks || [];
}

export interface NormalizedField {
  key: string;
  value: string;
  rawValue: string;
  originalValue?: unknown;
  confidence?: number;
  evidence: EvidenceItem[];
}

export function normalizeFields(result: RecognitionResult | null | undefined): NormalizedField[] {
  if (!result) return [];
  const evidenceByField = new Map<string, EvidenceItem[]>();
  for (const ev of result.evidence || []) {
    if (ev.fieldKey) {
      const list = evidenceByField.get(ev.fieldKey) || [];
      list.push(ev);
      evidenceByField.set(ev.fieldKey, list);
    }
  }
  const raw = result.normalizedFields || result.fields;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => {
      const key = String(item.fieldKey || item.key || '');
      const rawVal = item.value;
      const strVal = rawVal == null ? '' : String(rawVal);
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
        originalValue: rawVal,
        confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
        evidence: evidenceByField.get(key) || [],
      };
    });
  }
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

export function parseTestItems(raw: string | string[] | undefined | null): { all: string[]; checked: string[] } {
  if (!raw) return { all: [], checked: [] };
  if (Array.isArray(raw)) {
    const checked = raw.map((item: unknown) => String(item).trim()).filter(Boolean);
    return { all: [...checked], checked };
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const checked = parsed.map((item: unknown) => String(item).trim()).filter(Boolean);
      return { all: checked, checked };
    }
  } catch { /* fall through */ }
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

export function calculateDisplayStatus(
  backendStatus: string,
  normalizedFields: Array<{ confidence?: number; value?: string }>
): string {
  if (backendStatus !== 'partial_completed' && backendStatus !== 'needs_review') return backendStatus;
  const fieldsWithConfidence = normalizedFields.filter(
    (f) => f.value !== '-' && f.confidence != null && f.confidence > 0
  );
  if (fieldsWithConfidence.length === 0) return backendStatus;
  const allHighConfidence = fieldsWithConfidence.every((f) => (f.confidence || 0) >= 0.8);
  if (allHighConfidence) return 'completed';
  return backendStatus;
}

export function getFieldData(fields: NormalizedField[], keys: string[], fieldLabels: Record<string, string>) {
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

export const GROUP_ICON_MAP: Record<string, React.ReactNode> = {
  patientInfo: undefined,
  referralInfo: undefined,
  sampleInfo: undefined,
  detectionItems: undefined,
  testProduct: undefined,
  other: undefined,
};
