export type KnowledgeEntryKind = "medical-term" | "cancer-alias" | "lims-dictionary" | "field-description";

export interface KnowledgeEntry {
  id: string;
  kind: KnowledgeEntryKind;
  title: string;
  content: string;
  keywords: string[];
  fieldKeys: string[];
}

export interface KnowledgeBase {
  entries: KnowledgeEntry[];
}

export function createDefaultMedicalKnowledgeBase(): KnowledgeBase {
  // 这里先放少量可审计的内置知识，用于演示轻量 RAG 的边界。
  // 生产环境接入真实知识库或向量库时，应沿用 KnowledgeEntry 契约，而不是让 agent 自由访问任意外部资料。
  return {
    entries: [
      {
        id: "cancer-alias-lung-adenocarcinoma",
        kind: "cancer-alias",
        title: "肺腺癌别名",
        content: "肺腺癌、LUAD、lung adenocarcinoma 通常归入肿瘤类型候选，优先映射到 tumorType。",
        keywords: ["肺腺癌", "LUAD", "lung adenocarcinoma", "肿瘤类型", "tumorType"],
        fieldKeys: ["tumorType", "clinicalDiagnosis"]
      },
      {
        id: "lims-dictionary-sample-type",
        kind: "lims-dictionary",
        title: "样本类型 LIMS 字典",
        content: "组织、血液、胸水、石蜡切片是 LIMS 临床信息弹窗中的常见样本类型候选。",
        keywords: ["样本类型", "组织", "血液", "胸水", "石蜡切片", "sampleType"],
        fieldKeys: ["sampleType"]
      },
      {
        id: "medical-term-smoking-history",
        kind: "medical-term",
        title: "吸烟史表达",
        content: "吸烟、抽烟、戒烟、否认吸烟等表达用于辅助判断 smokingHistory。",
        keywords: ["吸烟", "抽烟", "戒烟", "否认吸烟", "smokingHistory"],
        fieldKeys: ["smokingHistory"]
      },
      {
        id: "field-description-clinical-diagnosis",
        kind: "field-description",
        title: "临床诊断字段说明",
        content: "clinicalDiagnosis 应优先保留病历中诊断段落的原文，不应用归一化值覆盖原始诊断。",
        keywords: ["诊断", "临床诊断", "clinicalDiagnosis"],
        fieldKeys: ["clinicalDiagnosis"]
      }
    ]
  };
}
