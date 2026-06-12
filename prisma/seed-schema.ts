const limsClinicalInfoDefinition = {
  key: "lims-clinical-info",
  name: "LIMS 临床信息",
  label: "LIMS 临床信息",
  locale: "zh-CN",
  version: "1.0.0",
  description: "肿瘤临床信息病历识别 Schema，用于识别患者临床诊断、样本类型、肿瘤分期等信息。",
  adapter: {
    type: "lims-clinical-info",
    targetSystem: "LIMS",
    targetEndpointKey: "limsClinicalInfoWriteback"
  },
  evidencePolicy: {
    required: true,
    minConfidence: 0.78,
    requireSourceText: true,
    requirePageReference: true
  },
  fields: [
    {
      key: "smokingHistory",
      label: "吸烟史",
      type: "enum",
      comments: [
        "识别病历中吸烟、戒烟、否认吸烟等描述，必须保留原文证据，不能只输出归一化枚举。",
        "当原文包含年限、每日支数、戒烟年限时交给 smoking normalizer 补充结构化值。"
      ],
      enumMap: {
        never: "从不吸烟",
        current: "目前吸烟",
        former: "既往吸烟或已戒烟",
        unknown: "未提及或无法判断"
      },
      adapterHints: {
        limsTargetPath: "clinicalInfo.smokingHistory",
        normalizer: "smoking",
        writebackMode: "preview"
      }
    },
    {
      key: "hypertensionHistory",
      label: "高血压病史",
      type: "boolean",
      comments: [
        "识别是否存在高血压病史；否认、无、未见等否定表达应归一化为 false。",
        "存在年限或治疗描述时仍需要保留原始文本，供人工审核判断。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.hypertensionHistory",
        normalizer: "booleanHistory",
        writebackMode: "preview"
      }
    },
    {
      key: "diagnosisDate",
      label: "诊断日期",
      type: "date",
      comments: [
        "识别明确日期文本并归一化为 ISO 日期；不确定日期只保留原文，不强行写回。",
        "日期来源可以来自入院记录、病理报告或临床诊断段落。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.diagnosisDate",
        normalizer: "dateText",
        writebackMode: "preview"
      }
    },
    {
      key: "familyTumorHistory",
      label: "家族肿瘤史",
      type: "list",
      comments: [
        "识别家族史中列举的肿瘤或疾病名称，按常见中文分隔符拆成列表。",
        "若原文为否认家族史，应保留原文并由上游 evidence 决策判断是否写回空列表。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.familyTumorHistory",
        normalizer: "listField",
        writebackMode: "preview"
      }
    },
    {
      key: "clinicalDiagnosis",
      label: "临床诊断",
      type: "string",
      required: true,
      comments: [
        "识别病历首页、入院记录或临床诊断段落中的主要诊断原文。",
        "诊断文本通常需要作为 LIMS 写回和人工复核的核心证据，不能用归一化值覆盖原文。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.clinicalDiagnosis",
        writebackMode: "preview"
      }
    },
    {
      key: "sampleType",
      label: "样本类型",
      type: "enum",
      comments: [
        "识别送检样本类型，例如组织、血液、胸水或石蜡切片。",
        "枚举只用于写回候选值，原始样本描述仍需作为 evidence 保留。"
      ],
      enumMap: {
        tissue: "组织",
        blood: "血液",
        pleuralEffusion: "胸水",
        paraffinSection: "石蜡切片",
        unknown: "未提及或无法判断"
      },
      adapterHints: {
        limsTargetPath: "clinicalInfo.sampleType",
        normalizer: "sampleType",
        writebackMode: "preview"
      }
    },
    {
      key: "tumorType",
      label: "肿瘤类型",
      type: "string",
      comments: [
        "识别病理诊断或临床诊断中的肿瘤类型，例如肺腺癌、胃癌、结直肠癌。",
        "如存在多个诊断，应保留原文并交由后续证据策略判断主诊断。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.tumorType",
        writebackMode: "preview"
      }
    },
    {
      key: "tumorStage",
      label: "肿瘤分期",
      type: "string",
      comments: [
        "识别 TNM 分期、临床分期或病理分期文本，例如 IV 期、T2N1M0。",
        "分期表达差异较大，当前阶段只做原文保留和候选写回。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.tumorStage",
        writebackMode: "preview"
      }
    },
    {
      key: "reportDate",
      label: "报告日期",
      type: "date",
      comments: [
        "识别病理报告、检查报告或出院记录中的报告日期。",
        "日期归一化必须经过真实日历校验，非法日期只保留原文。"
      ],
      adapterHints: {
        limsTargetPath: "clinicalInfo.reportDate",
        normalizer: "dateText",
        writebackMode: "preview"
      }
    }
  ]
};
