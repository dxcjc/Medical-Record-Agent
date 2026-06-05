import type { ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitCompare,
  RotateCcw,
  ShieldCheck
} from "lucide-react";

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

export type FlowAction = {
  id: string;
  label: string;
  description: string;
  statusText: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
};

export const schemaRecords: SchemaRecord[] = [
  {
    id: "medical-history",
    name: "病史结构化 Schema",
    domain: "入院记录",
    owner: "临床信息组",
    activeVersion: "v3.4.1",
    draftVersion: "v3.5.0-draft",
    affectedPipelines: ["住院病历抽取", "质控规则预审", "报告摘要生成"],
    deactivationRisk: "高"
  },
  {
    id: "lab-result",
    name: "检验结果 Schema",
    domain: "检验单",
    owner: "检验运营组",
    activeVersion: "v2.8.0",
    draftVersion: "v2.9.0-draft",
    affectedPipelines: ["检验 OCR 归一化", "异常值预警"],
    deactivationRisk: "中"
  },
  {
    id: "discharge",
    name: "出院小结 Schema",
    domain: "出院记录",
    owner: "病案运营组",
    activeVersion: "v1.9.6",
    draftVersion: "v2.0.0-draft",
    affectedPipelines: ["随访任务生成", "医保编码辅助"],
    deactivationRisk: "中"
  }
];

export const schemaVersionsById: Record<string, SchemaVersion[]> = {
  "medical-history": [
    {
      id: "mh-v350",
      version: "v3.5.0-draft",
      status: "draft",
      author: "配置管理员 A",
      updatedAt: "2026-06-05 09:12",
      coverage: 96.4,
      errorRate: 1.8,
      changeSummary: "新增既往史别名和药物过敏枚举映射"
    },
    {
      id: "mh-v341",
      version: "v3.4.1",
      status: "active",
      author: "配置管理员 B",
      updatedAt: "2026-06-01 17:20",
      coverage: 94.7,
      errorRate: 2.4,
      changeSummary: "修复家族史空值归一化"
    },
    {
      id: "mh-v333",
      version: "v3.3.3",
      status: "archived",
      author: "质控角色 A",
      updatedAt: "2026-05-18 11:06",
      coverage: 91.2,
      errorRate: 3.9,
      changeSummary: "旧版抽取规则，保留回滚引用"
    }
  ],
  "lab-result": [
    {
      id: "lab-v290",
      version: "v2.9.0-draft",
      status: "draft",
      author: "配置管理员 C",
      updatedAt: "2026-06-04 15:40",
      coverage: 97.8,
      errorRate: 1.2,
      changeSummary: "补充单位换算和参考区间验证"
    },
    {
      id: "lab-v280",
      version: "v2.8.0",
      status: "active",
      author: "配置管理员 C",
      updatedAt: "2026-05-29 10:22",
      coverage: 96.1,
      errorRate: 1.9,
      changeSummary: "稳定生产版本"
    }
  ],
  discharge: [
    {
      id: "dc-v200",
      version: "v2.0.0-draft",
      status: "draft",
      author: "病案专员",
      updatedAt: "2026-06-03 18:04",
      coverage: 89.6,
      errorRate: 4.7,
      changeSummary: "拆分诊疗经过和出院医嘱字段"
    },
    {
      id: "dc-v196",
      version: "v1.9.6",
      status: "active",
      author: "病案专员",
      updatedAt: "2026-05-25 14:35",
      coverage: 88.9,
      errorRate: 5.1,
      changeSummary: "现网版本"
    }
  ]
};

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

export const validationResults: ValidationResult[] = [
  {
    id: "vr-1",
    level: "success",
    title: "字段覆盖率通过",
    target: "病史结构化 Schema / v3.5.0-draft",
    detail: "最近 120 条样本中核心字段覆盖率 96.4%，高于发布阈值 95%。"
  },
  {
    id: "vr-2",
    level: "warning",
    title: "别名存在潜在冲突",
    target: "pastHistory.aliases",
    detail: "疾病史与家族史样本中都出现“既往情况”，发布前建议确认 adapter 路由优先级。"
  },
  {
    id: "vr-3",
    level: "error",
    title: "枚举映射缺少兜底",
    target: "allergyHistory.enumMap",
    detail: "未知药物过敏输入未声明 fallback 策略，生产发布前必须补充。"
  }
];

export const flowActions: FlowAction[] = [
  {
    id: "publish",
    label: "发布草稿",
    description: "将草稿版本提升为生产可用版本。",
    statusText: "等待管理员确认",
    Icon: ShieldCheck
  },
  {
    id: "compare",
    label: "比较版本",
    description: "对比草稿与当前生产版本的字段和指标差异。",
    statusText: "可执行",
    Icon: GitCompare
  },
  {
    id: "rollback",
    label: "回滚版本",
    description: "将生产版本切回最近稳定快照。",
    statusText: "需要影响评估",
    Icon: RotateCcw
  },
  {
    id: "deactivate",
    label: "停用 Schema",
    description: "停止生产管道继续引用当前 Schema。",
    statusText: "高风险操作",
    Icon: AlertTriangle
  }
];

export const statusLabels: Record<SchemaStatus, string> = {
  draft: "草稿",
  active: "生产中",
  inactive: "已停用",
  archived: "已归档"
};

export const validationIcons: Record<
  ValidationLevel,
  ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: Clock
};
