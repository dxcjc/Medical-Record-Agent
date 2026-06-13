import type { SchemaField } from '../api/types';

export interface FieldGroup {
  key: string;
  label: string;
  fields: SchemaField[];
}

/** 分组 key → 中文标题映射 */
const GROUP_LABELS: Record<string, string> = {
  patientInfo: '患者信息',
  referralInfo: '送检信息',
  clinicalDiagnosis: '临床诊断',
  sampleInfo: '样本信息',
  testItems: '检测项目',
  testProduct: '检测产品',
  other: '其他',
};

/** 字段 key → 分组 key 映射 */
const FIELD_TO_GROUP: Record<string, string> = {
  patientName: 'patientInfo',
  patientGender: 'patientInfo',
  patientAge: 'patientInfo',
  outpatientNo: 'patientInfo',
  phone: 'patientInfo',
  idNumber: 'patientInfo',
  ethnicity: 'patientInfo',
  referringDoctor: 'referralInfo',
  referralDate: 'referralInfo',
  pathologyNo: 'referralInfo',
  sampleNo: 'referralInfo',
  clinicRoom: 'referralInfo',
  tumorType: 'clinicalDiagnosis',
  tumorCategory: 'clinicalDiagnosis',
  sampleType: 'sampleInfo',
  bloodSample: 'sampleInfo',
  samplePrepTime: 'sampleInfo',
  tumorCellPercent: 'sampleInfo',
  testItemsLung: 'testItems',
  testItemsGI: 'testItems',
  testItemsOther: 'testItems',
  testProvider: 'testProduct',
  documentNo: 'testProduct',
  documentVersion: 'testProduct',
  transfusionHistory: 'other',
};

/** 分组排序 */
const GROUP_ORDER = ['patientInfo', 'referralInfo', 'clinicalDiagnosis', 'sampleInfo', 'testItems', 'testProduct', 'other'];

/**
 * 从 Schema definition 的 fields 数组按业务归属分组。
 * 未在 FIELD_TO_GROUP 中的字段归入 "other" 组。
 */
export function groupSchemaFields(fields: SchemaField[]): FieldGroup[] {
  const groupMap = new Map<string, SchemaField[]>();

  for (const field of fields) {
    const groupKey = FIELD_TO_GROUP[field.key] || 'other';
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(field);
  }

  // 按预定义顺序排列，未知分组放最后
  const result: FieldGroup[] = [];
  for (const key of GROUP_ORDER) {
    const groupFields = groupMap.get(key);
    if (groupFields && groupFields.length > 0) {
      result.push({
        key,
        label: GROUP_LABELS[key] || key,
        fields: groupFields,
      });
    }
  }

  // 追加未在 GROUP_ORDER 中的未知分组
  for (const [key, groupFields] of groupMap) {
    if (!GROUP_ORDER.includes(key) && groupFields.length > 0) {
      result.push({
        key,
        label: GROUP_LABELS[key] || key,
        fields: groupFields,
      });
    }
  }

  return result;
}

/**
 * 从 Schema fields 构建 fieldKey → label 映射。
 */
export function buildFieldLabels(fields: SchemaField[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const field of fields) {
    if (field.key && field.label) {
      labels[field.key] = field.label;
    }
  }
  return labels;
}

/**
 * 从 Schema fields 中提取枚举字段的选项列表。
 * 返回 fieldKey → 选项字符串数组 的映射。
 */
export function extractEnumOptions(fields: SchemaField[]): Record<string, string[]> {
  const options: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'list' && field.comments) {
      // 尝试从 comments 中提取选项列表（如 "选项：A、B、C"）
      const comment = Array.isArray(field.comments) ? field.comments.join(' ') : String(field.comments);
      const match = comment.match(/选项[：:]\s*(.+)/);
      if (match) {
        options[field.key] = match[1].split(/[、,，]/).map(s => s.trim()).filter(Boolean).join(',');
      }
    }
  }
  return options as unknown as Record<string, string[]>;
}

/**
 * 从 Schema fields 中按分组提取 test items 字段的 key 列表。
 */
export function getTestItemFieldKeys(fields: SchemaField[]): string[] {
  return fields
    .filter(f => f.key.startsWith('testItems') || f.key.startsWith('testItem'))
    .map(f => f.key);
}
