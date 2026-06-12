export type SchemaStatus = "draft" | "active" | "inactive" | "archived";

export type ValidationLevel = "success" | "warning" | "error";

export type SchemaFieldDraft = {
  id: string;
  name: string;
  metadata: string;
  aliases: string;
  enumMap: string;
  validators: string;
  normalizers: string;
  adapterHints: string;
};

export type SchemaVersion = {
  id: string;
  version: string;
  status: SchemaStatus;
  author: string;
  updatedAt: string;
  coverage: number;
  errorRate: number;
  changeSummary: string;
};

export type SchemaRecord = {
  id: string;
  name: string;
  domain: string;
  owner: string;
  activeVersion: string;
  draftVersion: string;
  affectedPipelines: string[];
  deactivationRisk: "低" | "中" | "高";
};

export type ValidationResult = {
  id: string;
  level: ValidationLevel;
  title: string;
  target: string;
  detail: string;
};

export type FlowState = {
  publishRequested: boolean;
  deactivateRequested: boolean;
  rollbackTarget: string;
  compareBase: string;
};

export const schemaRecords: SchemaRecord[] = [];

export const schemaVersionsById: Record<string, SchemaVersion[]> = {};

export const initialDraftFields: SchemaFieldDraft[] = [
  {
    id: "chief-complaint",
    name: "chiefComplaint",
    metadata: "主诉；字符串；必填；用于识别患者本次就诊核心原因。",
    aliases: "主诉, 就诊原因, 主要症状",
    enumMap: "无",
    validators: "required; maxLength: 200; 禁止输出检查建议。",
    normalizers: "trim; 去除句末多余标点；中文全角空格转半角。",
    adapterHints: "OCR 文本优先取病史区块首段；LLM adapter 保留原文证据片段。"
  },
  {
    id: "allergy-history",
    name: "allergyHistory",
    metadata: "过敏史；枚举或自由文本；用于临床风险提醒。",
    aliases: "药物过敏史, 过敏反应, allergen",
    enumMap: "青霉素=>penicillin; 头孢=>cephalosporin; 无=>none",
    validators: "若 enumMap 命中 none，则 evidence 不能为空；疑似过敏需标记低置信度。",
    normalizers: "同义药品名归并；保留未知药物原文。",
    adapterHints: "表格式病历优先按字段名匹配；自由文本按冒号后内容抽取。"
  },
  {
    id: "past-history",
    name: "pastHistory",
    metadata: "既往史；数组；包含疾病名称、起病时间、当前状态。",
    aliases: "既往病史, 疾病史, past medical history",
    enumMap: "高血压=>hypertension; 糖尿病=>diabetes; 冠心病=>coronary_heart_disease",
    validators: "疾病名称必填；时间不可晚于入院日期；状态限定为现患、已治愈、未知。",
    normalizers: "疾病简称展开；多个疾病按顿号、逗号、分号切分。",
    adapterHints: "遇到否认句时输出 empty array 并记录 negatedEvidence。"
  }
];

export const validationResults: ValidationResult[] = [];

export const statusLabels: Record<SchemaStatus, string> = {
  draft: "草稿",
  active: "生产中",
  inactive: "已停用",
  archived: "已归档"
};
