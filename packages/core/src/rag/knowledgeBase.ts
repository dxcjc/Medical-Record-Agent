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
  return {
    entries: [
      // ========== 肿瘤类型与别名 ==========
      {
        id: "cancer-alias-lung-adenocarcinoma",
        kind: "cancer-alias",
        title: "肺腺癌别名",
        content: "肺腺癌、LUAD、lung adenocarcinoma 通常归入肿瘤类型候选，优先映射到 tumorType。肺腺癌是非小细胞肺癌（NSCLC）最常见的亚型，约占肺癌的40%。",
        keywords: ["肺腺癌", "LUAD", "lung adenocarcinoma", "腺癌", "非小细胞肺癌", "NSCLC", "肿瘤类型", "tumorType"],
        fieldKeys: ["tumorType", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-lung-squamous",
        kind: "cancer-alias",
        title: "肺鳞癌别名",
        content: "肺鳞癌、肺鳞状细胞癌、LUSC、lung squamous cell carcinoma，属于非小细胞肺癌亚型。",
        keywords: ["肺鳞癌", "鳞状细胞癌", "LUSC", "lung squamous", "鳞癌"],
        fieldKeys: ["tumorType", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-small-cell-lung",
        kind: "cancer-alias",
        title: "小细胞肺癌别名",
        content: "小细胞肺癌、SCLC、small cell lung cancer，恶性程度高，约占肺癌15%。",
        keywords: ["小细胞肺癌", "SCLC", "small cell", "小细胞"],
        fieldKeys: ["tumorType", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-colorectal",
        kind: "cancer-alias",
        title: "结直肠癌别名",
        content: "结直肠癌、CRC、colorectal cancer、大肠癌、直肠癌、结肠癌。常见检测基因为KRAS、NRAS、BRAF、MSI。",
        keywords: ["结直肠癌", "CRC", "colorectal", "大肠癌", "直肠癌", "结肠癌", "肠癌"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-gastric",
        kind: "cancer-alias",
        title: "胃癌别名",
        content: "胃癌、gastric cancer、GC。常见检测靶点包括HER2、PD-L1、MSI。",
        keywords: ["胃癌", "gastric cancer", "GC", "胃腺癌"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-breast",
        kind: "cancer-alias",
        title: "乳腺癌别名",
        content: "乳腺癌、breast cancer、BRCA。常见检测基因为BRCA1/2、HER2、ER/PR。",
        keywords: ["乳腺癌", "breast cancer", "BRCA", "乳癌"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-thyroid",
        kind: "cancer-alias",
        title: "甲状腺癌别名",
        content: "甲状腺癌、thyroid cancer。常见类型包括甲状腺乳头状癌、甲状腺滤泡癌。",
        keywords: ["甲状腺癌", "thyroid cancer", "甲状腺乳头状癌", "甲状腺"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-gist",
        kind: "cancer-alias",
        title: "胃肠间质瘤别名",
        content: "胃肠间质瘤、GIST、gastrointestinal stromal tumor。主要检测基因为C-KIT（CD117）和PDGFRA。",
        keywords: ["胃肠间质瘤", "GIST", "gastrointestinal stromal", "间质瘤"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-melanoma",
        kind: "cancer-alias",
        title: "黑色素瘤别名",
        content: "黑色素瘤、melanoma、黑色素癌。常见检测基因为BRAF、C-KIT、NRAS。",
        keywords: ["黑色素瘤", "melanoma", "黑色素癌", "恶黑"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-liver",
        kind: "cancer-alias",
        title: "肝癌别名",
        content: "肝癌、肝细胞癌、HCC、hepatocellular carcinoma。常见检测靶点包括AFP、VEGF。",
        keywords: ["肝癌", "肝细胞癌", "HCC", "hepatocellular", "肝"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-pancreatic",
        kind: "cancer-alias",
        title: "胰腺癌别名",
        content: "胰腺癌、pancreatic cancer。常见检测基因为KRAS、BRCA1/2。",
        keywords: ["胰腺癌", "pancreatic cancer", "胰腺"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },

      // ========== 样本类型 ==========
      {
        id: "lims-dictionary-sample-type",
        kind: "lims-dictionary",
        title: "样本类型 LIMS 字典",
        content: "组织、血液、胸水、石蜡切片是 LIMS 临床信息弹窗中的常见样本类型候选。组织样本包括手术标本、穿刺活检、内镜活检。石蜡切片（FFPE）是最常见的送检形式。",
        keywords: ["样本类型", "组织", "血液", "胸水", "石蜡切片", "sampleType", "FFPE", "活检", "穿刺", "手术标本", "内镜", "全血"],
        fieldKeys: ["sampleType"]
      },
      {
        id: "sample-type-tissue",
        kind: "medical-term",
        title: "组织样本说明",
        content: "组织样本包括：手术标本（surgical specimen）、穿刺活检（biopsy）、内镜活检（endoscopic biopsy）。标本类型字段可能显示为'内镜活检□穿刺活检□手术标本□胸水□全血□其他'。",
        keywords: ["手术标本", "穿刺活检", "内镜活检", "活检", "标本类型", "组织"],
        fieldKeys: ["sampleType"]
      },

      // ========== 检测项目 - 肺癌 ==========
      {
        id: "test-items-lung-panel",
        kind: "lims-dictionary",
        title: "肺癌检测项目面板",
        content: "肺癌检测区域的勾选项包括：肿瘤9基因（EGFR/ALK/ROS1/BRAF/KRAS/MET/HER2/RET/NTRK）、肿瘤13基因、肺癌11基因、EGFR单基因、肿瘤40基因、188基因、1021基因（大panel）、肿瘤mrd（血液MRD监测）、实体瘤40基因。被勾选的项目加入 testItemsLung 数组。",
        keywords: ["肿瘤9基因", "肿瘤13基因", "肺癌11基因", "EGFR", "肿瘤40基因", "188基因", "1021基因", "MRD", "实体瘤40基因", "肺癌检测"],
        fieldKeys: ["testItemsLung"]
      },
      {
        id: "test-lung-gene-panels",
        kind: "medical-term",
        title: "肺癌基因Panel说明",
        content: "肿瘤9基因覆盖：EGFR、ALK、ROS1、BRAF、KRAS、MET、HER2、RET、NTRK。肿瘤13基因在9基因基础上增加PIK3CA、DDR2、FGFR1、PTEN。1021基因是全面基因组分析（CGP），覆盖所有已知驱动基因。",
        keywords: ["9基因", "13基因", "1021基因", "CGP", "全面基因组", "驱动基因", "EGFR", "ALK", "ROS1", "BRAF", "KRAS", "MET", "HER2", "RET", "NTRK"],
        fieldKeys: ["testItemsLung"]
      },

      // ========== 检测项目 - 消化道 ==========
      {
        id: "test-items-gi-panel",
        kind: "lims-dictionary",
        title: "消化道肿瘤检测项目面板",
        content: "消化道肿瘤检测区域的勾选项包括：肠癌3基因（+MSI）、MSI单检、UGT1A1、C-Kit、PDGFRA、肠癌4基因（+MSI）、胃癌18基因、肿瘤18基因、肿瘤40基因、林奇综合征。被勾选的项目加入 testItemsGI 数组。",
        keywords: ["肠癌3基因", "MSI", "UGT1A1", "C-Kit", "PDGFRA", "肠癌4基因", "胃癌18基因", "肿瘤18基因", "林奇综合征", "消化道检测"],
        fieldKeys: ["testItemsGI"]
      },
      {
        id: "test-gi-msi",
        kind: "medical-term",
        title: "MSI检测说明",
        content: "MSI（微卫星不稳定性）是结直肠癌免疫治疗的重要生物标志物。MSI-H（高度微卫星不稳定性）患者对PD-1抑制剂响应率高。肠癌3基因+MSI和肠癌4基因+MSI都包含MSI检测。",
        keywords: ["MSI", "微卫星不稳定性", "MSI-H", "免疫治疗", "PD-1", "dMMR"],
        fieldKeys: ["testItemsGI"]
      },
      {
        id: "test-gi-lynch",
        kind: "medical-term",
        title: "林奇综合征说明",
        content: "林奇综合征（Lynch syndrome）是遗传性非息肉性结直肠癌（HNPCC），由MMR基因（MLH1/MSH2/MSH6/PMS2）胚系突变引起。检测林奇综合征有助于评估家族遗传风险。",
        keywords: ["林奇综合征", "Lynch", "HNPCC", "遗传性", "MMR", "MLH1", "MSH2"],
        fieldKeys: ["testItemsGI"]
      },

      // ========== 检测项目 - 其他 ==========
      {
        id: "test-items-other-panel",
        kind: "lims-dictionary",
        title: "其他检测项目面板",
        content: "其他检测项目区域的勾选项包括：Onco1021-MRD（MRD监测）、OncoD肿瘤用药基因检测、同源重组修复缺陷基因检测（HRD）、OncoMD肿瘤疗效基因监测、脑胶质瘤基因检测、肿瘤临床超级外显子组基因检测、肿瘤融合基因检测、PD-L1 IHC检测、淋巴瘤基因检测。被勾选的项目加入 testItemsOther 数组。",
        keywords: ["Onco1021", "MRD", "OncoD", "HRD", "同源重组", "OncoMD", "脑胶质瘤", "超级外显子", "融合基因", "PD-L1", "IHC", "淋巴瘤"],
        fieldKeys: ["testItemsOther"]
      },
      {
        id: "test-hrd",
        kind: "medical-term",
        title: "HRD检测说明",
        content: "HRD（同源重组修复缺陷）是PARP抑制剂疗效的预测标志物。HRD阳性患者对PARP抑制剂（如奥拉帕利）响应率高，常见于卵巢癌、乳腺癌、前列腺癌、胰腺癌。",
        keywords: ["HRD", "同源重组", "PARP", "奥拉帕利", "BRCA", "修复缺陷"],
        fieldKeys: ["testItemsOther"]
      },
      {
        id: "test-pd-l1",
        kind: "medical-term",
        title: "PD-L1检测说明",
        content: "PD-L1 IHC检测用于评估免疫治疗适应症。PD-L1表达水平（TPS/CPS）是PD-1/PD-L1抑制剂用药的重要参考。常用抗体包括22C3、28-3、SP142、SP263。",
        keywords: ["PD-L1", "IHC", "免疫治疗", "TPS", "CPS", "PD-1", "22C3", "28-3"],
        fieldKeys: ["testItemsOther"]
      },

      // ========== 检测公司 ==========
      {
        id: "test-providers",
        kind: "lims-dictionary",
        title: "常见检测公司",
        content: "国内常见肿瘤基因检测公司包括：燃石医学（Burning Rock）、世和基因（GenomicCare）、吉因加（GenePlus）、思路迪（Simceredx）、臻和科技（Predicine）、泛生子（Genetron）、华大基因（BGI）、贝瑞基因（Berry Oncology）、诺禾致源（Novogene）等。",
        keywords: ["燃石医学", "世和基因", "吉因加", "思路迪", "臻和科技", "泛生子", "华大基因", "贝瑞基因", "诺禾致源", "Burning Rock", "GenePlus", "检测公司"],
        fieldKeys: ["testProvider"]
      },

      // ========== 性别与勾选框 ==========
      {
        id: "field-description-gender",
        kind: "field-description",
        title: "性别字段识别说明",
        content: "性别字段通常显示为'性别：男□ 女□'，需要从勾选框状态判断。OCR 难以区分 □ 和 ☑，应结合上下文（如患者姓名、身份证号末位）推断。身份证号末位奇数为男，偶数为女。",
        keywords: ["性别", "男", "女", "gender", "勾选框", "□", "☑"],
        fieldKeys: ["patientGender"]
      },

      // ========== 肿瘤分类 ==========
      {
        id: "field-description-tumor-category",
        kind: "field-description",
        title: "肿瘤分类字段识别说明",
        content: "肿瘤分类字段通常显示为'□胃肠间质瘤□甲状腺癌 □黑色素癌 □乳腺癌□肺癌□结直肠癌□胃癌□其他'，需要判断哪个被勾选。若临床诊断明确提到某种癌症（如'肺腺癌'），则对应分类应为相应选项（如'肺癌'）。",
        keywords: ["肿瘤分类", "胃肠间质瘤", "甲状腺癌", "黑色素癌", "乳腺癌", "肺癌", "结直肠癌", "胃癌", "其他", "tumorCategory"],
        fieldKeys: ["tumorCategory"]
      },

      // ========== 输血史 ==========
      {
        id: "field-description-transfusion",
        kind: "field-description",
        title: "输血史字段识别说明",
        content: "输血史字段通常显示为'输血史：□无 □有'，需要判断勾选状态。输血史会影响某些基因检测结果（如血液样本中可能存在供体DNA干扰）。",
        keywords: ["输血史", "无", "有", "transfusion", "输血"],
        fieldKeys: ["transfusionHistory"]
      },

      // ========== 样本信息 ==========
      {
        id: "field-description-tumor-cell-percent",
        kind: "field-description",
        title: "肿瘤细胞含量字段说明",
        content: "肿瘤细胞含量通常显示为'肿瘤细胞含量：__%'，为手写百分比。肿瘤细胞含量≥20%时组织检测结果更可靠。含量过低可能导致假阴性。",
        keywords: ["肿瘤细胞含量", "肿瘤含量", "细胞含量", "tumorCellPercent", "百分比", "%"],
        fieldKeys: ["tumorCellPercent"]
      },
      {
        id: "field-description-blood-sample",
        kind: "field-description",
        title: "血液样本信息说明",
        content: "血液样本信息通常显示在'血液：'后，包含采血量、抗凝管类型、特殊处理要求等。手写内容识别质量较低。",
        keywords: ["血液", "采血", "抗凝管", "EDTA", "血液样本", "bloodSample"],
        fieldKeys: ["bloodSample"]
      },

      // ========== 临床诊断 ==========
      {
        id: "field-description-clinical-diagnosis",
        kind: "field-description",
        title: "临床诊断字段说明",
        content: "clinicalDiagnosis 应优先保留病历中诊断段落的原文，不应用归一化值覆盖原始诊断。临床诊断通常包含肿瘤类型、分期、既往治疗等信息。",
        keywords: ["诊断", "临床诊断", "clinicalDiagnosis", "病理诊断", "诊断名称"],
        fieldKeys: ["clinicalDiagnosis"]
      },

      // ========== 送检信息 ==========
      {
        id: "field-description-referral",
        kind: "field-description",
        title: "送检信息字段说明",
        content: "送检信息包括：送检医生（referringDoctor，通常为手写签名）、送检日期（referralDate，格式不规范需推断）、病理号（pathologyNo，如2022-21264）、样本编号（sampleNo，如FZ2665269）、诊室（clinicRoom）。",
        keywords: ["送检医生", "送检日期", "病理号", "样本编号", "诊室", "referringDoctor", "referralDate", "pathologyNo", "sampleNo"],
        fieldKeys: ["referringDoctor", "referralDate", "pathologyNo", "sampleNo", "clinicRoom"]
      },

      // ========== 身份证号 ==========
      {
        id: "field-description-id-number",
        kind: "field-description",
        title: "身份证号识别说明",
        content: "身份证号为18位，OCR对手写身份证号识别质量极差。最后一位可能是X（大写）。不要强行校验格式，保留OCR原始识别结果。可通过身份证号推断性别（倒数第二位奇男偶女）和出生日期。",
        keywords: ["身份证", "身份证号", "idNumber", "ID", "护照", "证件号"],
        fieldKeys: ["idNumber"]
      },

      // ========== 联系电话 ==========
      {
        id: "field-description-phone",
        kind: "field-description",
        title: "联系电话识别说明",
        content: "联系电话通常为11位手机号（1开头），也可能有座机号码。文档中可能显示为'联系电话：'或'联系电话1：'。手写数字可能识别错误。",
        keywords: ["联系电话", "电话", "phone", "手机", "手机号"],
        fieldKeys: ["phone"]
      },

      // ========== 门诊号 ==========
      {
        id: "field-description-outpatient-no",
        kind: "field-description",
        title: "门诊号识别说明",
        content: "门诊号通常为纯数字，长度不定（6-12位）。从'门诊号：'后提取。示例：0001957996。",
        keywords: ["门诊号", "outpatientNo", "门诊", "就诊号"],
        fieldKeys: ["outpatientNo"]
      },

      // ========== 年龄 ==========
      {
        id: "field-description-age",
        kind: "field-description",
        title: "年龄字段识别说明",
        content: "年龄字段通常显示为'年龄：XX岁'，为手写数字。OCR可能将数字识别错误（如5识别为S）。归一化为数字或带'岁'的字符串。",
        keywords: ["年龄", "patientAge", "岁", "年龄："],
        fieldKeys: ["patientAge"]
      },

      // ========== 民族 ==========
      {
        id: "field-description-ethnicity",
        kind: "field-description",
        title: "民族字段识别说明",
        content: "民族字段通常显示为'民族：'后跟手写内容。常见值：汉、回、满、壮、维吾尔等。手写体识别质量一般。",
        keywords: ["民族", "ethnicity", "汉族", "回族", "满族"],
        fieldKeys: ["ethnicity"]
      },

      // ========== 文件编号/版本 ==========
      {
        id: "field-description-document-info",
        kind: "field-description",
        title: "文件编号和版本说明",
        content: "文件编号（documentNo）和文件版本（documentVersion）通常印在表格底部或侧边栏。示例：文件编号GeneTA5-002，文件版本V2.1。这些是检测公司的内部编号。",
        keywords: ["文件编号", "文件版本", "documentNo", "documentVersion", "GeneTA", "V2"],
        fieldKeys: ["documentNo", "documentVersion"]
      }
    ]
  };
}
