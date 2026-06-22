export type KnowledgeEntryKind = 
  | "medical-term" | "medical_term"
  | "cancer-alias" | "cancer_alias"
  | "lims-dictionary" | "lims_dictionary"
  | "field-description" | "field_description"
  | "interpretation_match"
  | "staging"
  | "gene_detection"
  | "treatment"
  | "medication"
  | "gender_inference"
  | "ocr_correction"
  | "cancer_tag"
  | "sample_type_mapping"
  | "cancer_category";

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
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-lung-squamous",
        kind: "cancer-alias",
        title: "肺鳞癌别名",
        content: "肺鳞癌、肺鳞状细胞癌、LUSC、lung squamous cell carcinoma，属于非小细胞肺癌亚型。",
        keywords: ["肺鳞癌", "鳞状细胞癌", "LUSC", "lung squamous", "鳞癌"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-small-cell-lung",
        kind: "cancer-alias",
        title: "小细胞肺癌别名",
        content: "小细胞肺癌、SCLC、small cell lung cancer，恶性程度高，约占肺癌15%。",
        keywords: ["小细胞肺癌", "SCLC", "small cell", "小细胞"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-colorectal",
        kind: "cancer-alias",
        title: "结直肠癌别名",
        content: "结直肠癌、CRC、colorectal cancer、大肠癌、直肠癌、结肠癌。常见检测基因为KRAS、NRAS、BRAF、MSI。",
        keywords: ["结直肠癌", "CRC", "colorectal", "大肠癌", "直肠癌", "结肠癌", "肠癌"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-gastric",
        kind: "cancer-alias",
        title: "胃癌别名",
        content: "胃癌、gastric cancer、GC。常见检测靶点包括HER2、PD-L1、MSI。",
        keywords: ["胃癌", "gastric cancer", "GC", "胃腺癌"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-breast",
        kind: "cancer-alias",
        title: "乳腺癌别名",
        content: "乳腺癌、breast cancer、BRCA。常见检测基因为BRCA1/2、HER2、ER/PR。",
        keywords: ["乳腺癌", "breast cancer", "BRCA", "乳癌"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-thyroid",
        kind: "cancer-alias",
        title: "甲状腺癌别名",
        content: "甲状腺癌、thyroid cancer。常见类型包括甲状腺乳头状癌、甲状腺滤泡癌。",
        keywords: ["甲状腺癌", "thyroid cancer", "甲状腺乳头状癌", "甲状腺"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-gist",
        kind: "cancer-alias",
        title: "胃肠道间质瘤别名",
        content: "胃肠间质瘤、胃肠道间质瘤、GIST、gastrointestinal stromal tumor。标准名称为'胃肠道间质瘤'（4字'胃肠道'），不要简写为'胃肠间质瘤'。主要检测基因为C-KIT（CD117）和PDGFRA。",
        keywords: ["胃肠间质瘤", "胃肠道间质瘤", "GIST", "gastrointestinal stromal", "间质瘤"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-bladder",
        kind: "cancer-alias",
        title: "膀胱癌别名",
        content: "膀胱癌、bladder cancer。尿路上皮癌（旧称移行细胞癌/TCC）是最常见的膀胱癌类型（~90%）。高级别尿路上皮癌、低级别尿路上皮癌都应映射为膀胱癌。注意：肾盂/输尿管尿路上皮癌不属于膀胱癌。",
        keywords: ["膀胱癌", "尿路上皮癌", "移行细胞癌", "TCC", "bladder cancer", "高级别尿路上皮癌", "低级别尿路上皮癌"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-rhabdomyosarcoma",
        kind: "cancer-alias",
        title: "横纹肌肉瘤别名",
        content: "横纹肌肉瘤、rhabdomyosarcoma、RMS。是非上皮来源恶性肿瘤（肉瘤），不要归入'癌'。亚型包括胚胎性、腺泡状、多形性、梭形细胞/硬化型。",
        keywords: ["横纹肌肉瘤", "rhabdomyosarcoma", "RMS", "胚胎性", "腺泡状", "肉瘤"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-nhl",
        kind: "cancer-alias",
        title: "非霍奇金淋巴瘤别名",
        content: "非霍奇金淋巴瘤、NHL、non-Hodgkin lymphoma。最常见亚型为弥漫性大B细胞淋巴瘤（DLBCL）。不是'癌'——是淋巴造血系统恶性肿瘤。",
        keywords: ["非霍奇金淋巴瘤", "NHL", "弥漫性大B细胞淋巴瘤", "DLBCL", "淋巴瘤"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-renal",
        kind: "cancer-alias",
        title: "肾癌别名",
        content: "肾癌、肾细胞癌、renal cell carcinoma、RCC。标准名称为'肾癌'。亚型包括透明细胞型（最常见70-80%）、乳头状型、嫌色细胞型、FH缺陷型。注意：肾盂尿路上皮癌不属于肾细胞癌。",
        keywords: ["肾癌", "肾细胞癌", "RCC", "renal cell carcinoma", "透明细胞", "FH缺陷型"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-glioma",
        kind: "cancer-alias",
        title: "胶质瘤别名",
        content: "胶质瘤、脑胶质瘤、glioma、GBM（胶质母细胞瘤）。标准名称为'胶质瘤'。弥漫性胶质瘤也应映射为胶质瘤。不是'癌'——是神经上皮来源肿瘤。",
        keywords: ["胶质瘤", "弥漫性胶质瘤", "glioma", "GBM", "胶质母细胞瘤", "脑胶质瘤"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-esophageal",
        kind: "cancer-alias",
        title: "食管癌别名",
        content: "食管癌、esophageal cancer。中国以鳞状细胞癌为主（~90%）。食管鳞状细胞癌应映射为'食管癌'，不要细化输出亚型。",
        keywords: ["食管癌", "食管鳞状细胞癌", "esophageal cancer", "食管鳞癌", "食道癌"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-anal-colorectal",
        kind: "cancer-alias",
        title: "肛缘肠癌映射",
        content: "肛缘肠癌、肛缘癌、肛管癌属于结直肠肛门区域。'距肛缘15cm处'的腺癌是直肠癌/肠癌，不是肛缘癌（肛缘癌以鳞癌为主）。肛缘部位的肿瘤标准映射为结直肠癌。",
        keywords: ["肛缘肠癌", "肛缘癌", "肛管癌", "距肛缘", "肛缘"],
        fieldKeys: ["tumorType"]
      },
      {
        id: "cancer-alias-melanoma",
        kind: "cancer-alias",
        title: "黑色素瘤别名",
        content: "黑色素瘤、melanoma、黑色素癌。常见检测基因为BRAF、C-KIT、NRAS。",
        keywords: ["黑色素瘤", "melanoma", "黑色素癌", "恶黑"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-liver",
        kind: "cancer-alias",
        title: "肝癌别名",
        content: "肝癌、肝细胞癌、HCC、hepatocellular carcinoma。常见检测靶点包括AFP、VEGF。",
        keywords: ["肝癌", "肝细胞癌", "HCC", "hepatocellular", "肝"],
        fieldKeys: ["tumorType", "tumorCategory"]
      },
      {
        id: "cancer-alias-pancreatic",
        kind: "cancer-alias",
        title: "胰腺癌别名",
        content: "胰腺癌、pancreatic cancer。常见检测基因为KRAS、BRCA1/2。",
        keywords: ["胰腺癌", "pancreatic cancer", "胰腺"],
        fieldKeys: ["tumorType", "tumorCategory"]
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
        content: "肺癌检测区域的勾选项包括：肿瘤9基因（EGFR/ALK/ROS1/BRAF/KRAS/MET/HER2/RET/NTRK）、肿瘤13基因、肺癌11基因、EGFR单基因、肿瘤40基因、188基因、1021基因（大panel）、肿瘤mrd（血液MRD监测）、实体瘤40基因。被勾选的项目加入 detectionItemsLung 数组。",
        keywords: ["肿瘤9基因", "肿瘤13基因", "肺癌11基因", "EGFR", "肿瘤40基因", "188基因", "1021基因", "MRD", "实体瘤40基因", "肺癌检测"],
        fieldKeys: ["detectionItemsLung"]
      },
      {
        id: "test-lung-gene-panels",
        kind: "medical-term",
        title: "肺癌基因Panel说明",
        content: "肿瘤9基因覆盖：EGFR、ALK、ROS1、BRAF、KRAS、MET、HER2、RET、NTRK。肿瘤13基因在9基因基础上增加PIK3CA、DDR2、FGFR1、PTEN。1021基因是全面基因组分析（CGP），覆盖所有已知驱动基因。",
        keywords: ["9基因", "13基因", "1021基因", "CGP", "全面基因组", "驱动基因", "EGFR", "ALK", "ROS1", "BRAF", "KRAS", "MET", "HER2", "RET", "NTRK"],
        fieldKeys: ["detectionItemsLung"]
      },

      // ========== 检测项目 - 消化道 ==========
      {
        id: "test-items-gi-panel",
        kind: "lims-dictionary",
        title: "消化道肿瘤检测项目面板",
        content: "消化道肿瘤检测区域的勾选项包括：肠癌3基因（+MSI）、MSI单检、UGT1A1、C-Kit、PDGFRA、肠癌4基因（+MSI）、胃癌18基因、肿瘤18基因、肿瘤40基因、林奇综合征。被勾选的项目加入 detectionItemsGI 数组。",
        keywords: ["肠癌3基因", "MSI", "UGT1A1", "C-Kit", "PDGFRA", "肠癌4基因", "胃癌18基因", "肿瘤18基因", "林奇综合征", "消化道检测"],
        fieldKeys: ["detectionItemsGI"]
      },
      {
        id: "test-gi-msi",
        kind: "medical-term",
        title: "MSI检测说明",
        content: "MSI（微卫星不稳定性）是结直肠癌免疫治疗的重要生物标志物。MSI-H（高度微卫星不稳定性）患者对PD-1抑制剂响应率高。肠癌3基因+MSI和肠癌4基因+MSI都包含MSI检测。",
        keywords: ["MSI", "微卫星不稳定性", "MSI-H", "免疫治疗", "PD-1", "dMMR"],
        fieldKeys: ["detectionItemsGI"]
      },
      {
        id: "test-gi-lynch",
        kind: "medical-term",
        title: "林奇综合征说明",
        content: "林奇综合征（Lynch syndrome）是遗传性非息肉性结直肠癌（HNPCC），由MMR基因（MLH1/MSH2/MSH6/PMS2）胚系突变引起。检测林奇综合征有助于评估家族遗传风险。",
        keywords: ["林奇综合征", "Lynch", "HNPCC", "遗传性", "MMR", "MLH1", "MSH2"],
        fieldKeys: ["detectionItemsGI"]
      },

      // ========== 检测项目 - 其他 ==========
      {
        id: "test-items-other-panel",
        kind: "lims-dictionary",
        title: "其他检测项目面板",
        content: "其他检测项目区域的勾选项包括：Onco1021-MRD（MRD监测）、OncoD肿瘤用药基因检测、同源重组修复缺陷基因检测（HRD）、OncoMD肿瘤疗效基因监测、脑胶质瘤基因检测、肿瘤临床超级外显子组基因检测、肿瘤融合基因检测、PD-L1 IHC检测、淋巴瘤基因检测。被勾选的项目加入 detectionItemsOther 数组。",
        keywords: ["Onco1021", "MRD", "OncoD", "HRD", "同源重组", "OncoMD", "脑胶质瘤", "超级外显子", "融合基因", "PD-L1", "IHC", "淋巴瘤"],
        fieldKeys: ["detectionItemsOther"]
      },
      {
        id: "test-hrd",
        kind: "medical-term",
        title: "HRD检测说明",
        content: "HRD（同源重组修复缺陷）是PARP抑制剂疗效的预测标志物。HRD阳性患者对PARP抑制剂（如奥拉帕利）响应率高，常见于卵巢癌、乳腺癌、前列腺癌、胰腺癌。",
        keywords: ["HRD", "同源重组", "PARP", "奥拉帕利", "BRCA", "修复缺陷"],
        fieldKeys: ["detectionItemsOther"]
      },
      {
        id: "test-pd-l1",
        kind: "medical-term",
        title: "PD-L1检测说明",
        content: "PD-L1 IHC检测用于评估免疫治疗适应症。PD-L1表达水平（TPS/CPS）是PD-1/PD-L1抑制剂用药的重要参考。常用抗体包括22C3、28-3、SP142、SP263。",
        keywords: ["PD-L1", "IHC", "免疫治疗", "TPS", "CPS", "PD-1", "22C3", "28-3"],
        fieldKeys: ["detectionItemsOther"]
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
      {
        id: "field-description-tumor-category-path",
        kind: "field-description",
        title: "肿瘤分类标准路径模板",
        content: "tumorCategory 输出格式为「器官系统/癌种/亚型」三级路径，不要使用系统级分类路径（如消化系统/结直肠/腺癌）。标准路径映射：结直肠癌→肠道/结直肠腺癌/直肠腺癌 或 肠道/结直肠腺癌/结肠腺癌；胃癌→消化系统/胃癌/胃腺癌；肺癌→呼吸系统/肺癌/肺腺癌 或 呼吸系统/肺癌/肺鳞癌；膀胱癌→泌尿系统/膀胱癌/尿路上皮癌；乳腺癌→乳腺/乳腺癌/浸润性癌。路径末级应为具体亚型名，与 tumorType 保持一致。",
        keywords: ["tumorCategory", "标准路径", "路径模板", "结直肠", "肠道", "分类路径", "亚型"],
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

      // ========== 送检信息 ==========
      {
        id: "field-description-referral",
        kind: "field-description",
        title: "送检信息字段说明",
        content: "送检信息包括：送检日期（referralDate，格式不规范需推断）、样本编号（sampleNo，如FZ2665269）、诊室（clinicRoom）。",
        keywords: ["送检日期", "样本编号", "诊室", "referralDate", "sampleNo", "clinicRoom"],
        fieldKeys: ["referralDate", "sampleNo", "clinicRoom"]
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

      // ========== 临床分期 ==========
      {
        id: "field-description-clinical-stage",
        kind: "field-description",
        title: "临床分期字段说明",
        content: "临床分期（clinicalStage）输出规则：1) 报告中有临床分期（如 IV期、IIIA期）时优先输出临床分期；2) 无临床分期则输出 TNM 分期（如 T2aN1M0）；3) 不要混用 yp 前缀（新辅助治疗后分期），输出标准 TNM 即可。格式二选一：临床分期（罗马数字+期）或 TNM（T数字N数字M数字），不要同时输出两者。归一化时保留原始分期描述。",
        keywords: ["临床分期", "clinicalStage", "TNM", "分期", "IA", "IB", "IIA", "IIB", "IIIA", "IIIB", "IV", "ypT", "新辅助"],
        fieldKeys: ["clinicalStage"]
      },

      // ========== 检测项目 ==========
      {
        id: "field-description-detection-items",
        kind: "field-description",
        title: "检测项目字段说明",
        content: "检测项目（detectionItems）分为三个区域：肺癌检测（detectionItemsLung）、消化道检测（detectionItemsGI）、其他检测（detectionItemsOther）。每个区域有独立的勾选项，需从 OCR 文本中判断哪些项目被勾选。结果以数组形式返回。",
        keywords: ["检测项目", "detectionItems", "基因检测", "勾选", "肺癌检测", "消化道检测"],
        fieldKeys: ["detectionItemsLung", "detectionItemsGI", "detectionItemsOther"]
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
      },

      // ========== interpretationMatch 解读匹配 ==========
      {
        id: "interpretation-match-duodenal",
        kind: "interpretation_match",
        title: "十二指肠癌解读匹配规则",
        content: "十二指肠（duodenum）属于小肠的一部分，不是结直肠。十二指肠癌/十二指肠腺癌的interpretationMatch应为'小肠腺癌'，而不是'结直肠癌'。同理，空肠癌、回肠癌也应匹配为'小肠腺癌'。只有结肠癌和直肠癌才匹配'结直肠癌'。",
        keywords: ["十二指肠", "小肠", "duodenum", "空肠", "回肠", "小肠腺癌", "interpretationMatch"],
        fieldKeys: ["interpretationMatch"]
      },
      {
        id: "interpretation-match-unknown-primary",
        kind: "interpretation_match",
        title: "原发灶不明解读匹配规则",
        content: "当cancerTag为'原发灶不明'时，interpretationMatch应为'实体瘤'。原发灶不明的恶性肿瘤无法确定具体癌种，因此用'实体瘤'作为泛化匹配。常见表述包括：'原发灶待查'、'原发灶不明'、'倾向XX癌，原发灶待查'等。",
        keywords: ["原发灶不明", "原发灶待查", "实体瘤", "unknown primary", "interpretationMatch"],
        fieldKeys: ["interpretationMatch"]
      },
      {
        id: "interpretation-match-small-bowel",
        kind: "interpretation_match",
        title: "小肠癌解读匹配规则",
        content: "小肠腺癌的interpretationMatch为'小肠腺癌'。小肠包括十二指肠、空肠、回肠。当病理诊断涉及十二指肠时，应归类为小肠腺癌而非结直肠癌。消化道肿瘤分类：食管癌→食管癌；胃癌→胃或胃食管交界处肿瘤；小肠癌→小肠腺癌；结直肠癌→结直肠癌。",
        keywords: ["小肠", "十二指肠", "空肠", "回肠", "小肠腺癌", "结直肠", "消化道", "interpretationMatch"],
        fieldKeys: ["interpretationMatch"]
      },

      // ========== cancerTag 癌症标签 ==========
      {
        id: "cancer-tag-metastasis-single",
        kind: "cancer_tag",
        title: "单癌与多癌判断规则",
        content: "cancerTag判断规则：1）单癌：同一器官或相邻器官的同一肿瘤，即使有转移灶（如肝转移、淋巴结转移）仍为单癌；2）多癌：同时存在两个不同器官的原发癌（如肺癌+乳腺癌），或同一器官不同病理类型的独立原发癌；3）原发灶不明：病理报告明确写'原发灶不明/待查'，或仅见转移灶无法确定原发。重要：胃-十二指肠腺癌是一处连续肿瘤，属于单癌；转移性癌（如肝转移）不改变单癌判断。",
        keywords: ["单癌", "多癌", "原发灶不明", "转移", "肝转移", "淋巴结转移", "cancerTag", "多原发"],
        fieldKeys: ["cancerTag"]
      },

      // ========== sampleType 样本类型 ==========
      {
        id: "field-description-sample-type-body-vs-type",
        kind: "field_description",
        title: "样本类型与取材部位区分",
        content: "sampleType字段应填写样本类型（如'组织'、'血液'、'胸水'、'腹水'、'骨髓'等），而非取材部位。取材部位（如'左乳'、'右肺'、'肝脏'）不是样本类型。当病理报告中写'手术标本'、'穿刺标本'、'活检组织'时，sampleType应为'组织'。",
        keywords: ["样本类型", "sampleType", "取材部位", "组织", "手术标本", "穿刺标本", "活检"],
        fieldKeys: ["sampleType"]
      },

      // ========== medication 用药 ==========
      {
        id: "field-description-medication-extraction",
        kind: "field_description",
        title: "用药信息提取规则",
        content: "用药（medication）字段应提取靶向药物和免疫治疗药物名称。提取规则：1）忠实原文，不要添加原文中没有的词语（如原文写'具体不详'不要改为'具体方案不详'）；2）化疗方案归入chemotherapy字段，不归入medication；3）仅提及但未使用的药物（如'可考虑使用XX'）不提取。",
        keywords: ["用药", "medication", "靶向", "免疫治疗", "化疗", "药物", "提取规则"],
        fieldKeys: ["medication"]
      },

      // ========== radiotherapy 放疗 ==========
      {
        id: "field-description-radiotherapy-format",
        kind: "field_description",
        title: "放疗信息提取规则",
        content: "放疗（radiotherapy）字段提取放疗相关信息。提取规则：1）保留放疗部位、剂量、次数等关键信息；2）忠实原文表述，不要改变标点符号格式；3）多程放疗用分号（；）分隔；4）如果报告明确写'无放疗'或'未行放疗'，返回'无'。",
        keywords: ["放疗", "radiotherapy", "放射治疗", "剂量", "次数", "提取规则"],
        fieldKeys: ["radiotherapy"]
      },

      // ========== 以下条目同步自 seed-knowledge.ts (P0#2 知识库同步) ==========

      // ── cancer_category（新增 kind,Prisma enum 已有）──
      {
        id: "cancer-category-malignant-mapping",
        kind: "cancer_category",
        title: "恶性肿瘤cancerCategory映射规则",
        content: "【绝对规则】当病理诊断仅写'恶性肿瘤'而未明确病理类型时，cancerCategory仍需按部位推断具体亚型。标准映射：直肠恶性肿瘤→'肠道/结直肠腺癌/直肠腺癌'；结肠恶性肿瘤→'肠道/结直肠腺癌/结肠腺癌'；胃恶性肿瘤→'胃/胃腺癌'；肺恶性肿瘤→'肺/非小细胞肺癌'。【注意】不能直接输出'结直肠/直肠恶性肿瘤'这样的路径，必须使用标准三级路径格式。",
        keywords: ["恶性肿瘤", "cancerCategory", "直肠恶性肿瘤", "结肠恶性肿瘤", "标准路径", "三级路径"],
        fieldKeys: ["cancerCategory"]
      },
      {
        id: "cancer-category-unknown-primary",
        kind: "cancer_category",
        title: "原发灶不明cancerCategory路径",
        content: "【重要规则】当cancerTag为'原发灶不明'时，cancerCategory必须为'其他/其他/原发灶不明'，不能输出'实体瘤'或其他非标准路径。",
        keywords: ["原发灶不明", "cancerCategory", "其他", "实体瘤"],
        fieldKeys: ["cancerCategory"]
      },
      {
        id: "cancer-category-colorectal-path",
        kind: "cancer_category",
        title: "结直肠癌cancerCategory标准路径",
        content: "【绝对规则】结直肠癌cancerCategory标准路径映射：直肠腺癌→'肠道/结直肠腺癌/直肠腺癌'；结肠腺癌→'肠道/结直肠腺癌/结肠腺癌'。路径格式必须为'肠道/结直肠腺癌/具体亚型'。",
        keywords: ["结直肠癌", "直肠癌", "结肠癌", "cancerCategory", "腺癌", "肠道"],
        fieldKeys: ["cancerCategory"]
      },

      // ── sample_type_mapping（内存版缺失）──
      {
        id: "sample-type-standard-mapping",
        kind: "sample_type_mapping",
        title: "样本类型标准化映射",
        content: "样本类型标准化规则：组织标本→组织；活检组织→组织；手术标本→组织；穿刺活检→穿刺；外周血→血液；全血→血液；血浆→血液；胸水→胸水；胸腔积液→胸水；腹水→腹水；脑脊液→脑脊液。",
        keywords: ["样本", "标本", "组织", "活检", "穿刺", "血液", "胸水", "腹水", "脑脊液"],
        fieldKeys: ["sampleType"]
      },

      // ── gender_inference（内存版缺失）──
      {
        id: "gender-inference-rules",
        kind: "gender_inference",
        title: "性别推断规则",
        content: "性别推断规则：1. 直接标识：男/女、M/F；2. 疾病关联推断：乳腺癌→女性（99%），前列腺癌→男性（100%），宫颈癌/卵巢癌→女性（100%），睾丸癌→男性（100%）；3. 仅在无法直接识别时使用推断，推断结果confidence应降低0.2。",
        keywords: ["性别", "男", "女", "gender", "乳腺", "前列腺", "宫颈", "卵巢", "推断"],
        fieldKeys: ["patientGender"]
      },

      // ── ocr_correction（内存版缺失）──
      {
        id: "ocr-correction-hospital-name",
        kind: "ocr_correction",
        title: "医院名称OCR纠错",
        content: "医院名称常见OCR错误映射：人民医皖→人民医院；肿瘸医院→肿瘤医院；协和医胱→协和医院；匠科大学→医科大学；附属医胱→附属医院。",
        keywords: ["医院", "医皖", "医胱", "肿瘤", "肿瘸", "人民", "协和", "OCR", "纠错", "医院名称"],
        fieldKeys: ["hospitalName"]
      },

      // ── 补充 field-description（内存版缺少的条目）──
      {
        id: "field-description-clinical-diagnosis",
        kind: "field-description",
        title: "临床诊断说明",
        content: "临床诊断（clinicalDiagnosis）：医生给出的诊断描述，如'左肺上叶腺癌'、'右肺下叶鳞状细胞癌'。可能包含部位、病理类型、分期等信息。",
        keywords: ["临床诊断", "clinicalDiagnosis", "诊断", "病理", "分期"],
        fieldKeys: ["clinicalDiagnosis"]
      },
      {
        id: "field-description-patient-age",
        kind: "field-description",
        title: "年龄字段说明",
        content: "年龄（patientAge）：通常以数字+岁表示，如'55岁'。应归一化为数字。注意手写体可能将5识别为S。",
        keywords: ["年龄", "patientAge", "岁"],
        fieldKeys: ["patientAge"]
      },
      {
        id: "field-description-pathological-diagnosis-extract",
        kind: "field-description",
        title: "pathologicalDiagnosis提取规则",
        content: "【绝对规则】pathologicalDiagnosis（病理诊断）字段必须从病理报告中提取，绝对不能为空。即使病理报告内容不完整或OCR质量差，也必须尝试提取可识别的病理诊断信息。",
        keywords: ["pathologicalDiagnosis", "病理诊断", "提取规则", "不能为空"],
        fieldKeys: ["pathologicalDiagnosis"]
      },
      {
        id: "field-description-tumor-type-extract-rule",
        kind: "field-description",
        title: "肿瘤类型提取规则",
        content: "tumorType字段提取规则：从病理诊断中提取简化的癌种名称，而非完整的病理描述。例如：'膀胱高级别尿路上皮癌'→tumorType='膀胱癌'。病理详情应放入pathologicalDiagnosis字段。",
        keywords: ["tumorType", "肿瘤类型", "癌种", "提取规则", "简化"],
        fieldKeys: ["tumorType"]
      },

      // ── 补充 cancer_tag（内存版缺少多癌具体化规则）──
      {
        id: "cancer-tag-multi-cancer-specific",
        kind: "cancer_tag",
        title: "多癌cancerTag具体化规则",
        content: "【重要规则】当cancerTag为'多癌'时，应输出具体的癌种组合名称，而不是泛化的'多癌'。格式：'癌种1,癌种2'（用逗号分隔）。多癌的cancerTag应反映具体的癌种组合，便于后续数据分析和统计。",
        keywords: ["多癌", "cancerTag", "具体化", "癌种组合"],
        fieldKeys: ["cancerTag"]
      },

      // ── 补充 cancer-alias（内存版缺少的 13 个癌种）──
      {
        id: "cancer-alias-prostate",
        kind: "cancer-alias",
        title: "前列腺癌别名",
        content: "前列腺癌、前列腺腺癌、prostate cancer、PCa。病理报告中常写为'前列腺腺癌'、'Gleason评分'相关描述，tumorType应统一提取为'前列腺癌'。",
        keywords: ["前列腺癌", "前列腺腺癌", "prostate cancer", "PCa", "前列腺", "Gleason"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-ovarian",
        kind: "cancer-alias",
        title: "卵巢癌别名",
        content: "卵巢癌、卵巢上皮癌、ovarian cancer、OC。常见检测基因为BRCA1/2、HRD。",
        keywords: ["卵巢癌", "卵巢上皮癌", "ovarian cancer", "OC", "卵巢"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-cervical",
        kind: "cancer-alias",
        title: "宫颈癌别名",
        content: "宫颈癌、宫颈鳞癌、宫颈腺癌、cervical cancer。常见检测靶点包括HPV、PD-L1。",
        keywords: ["宫颈癌", "宫颈鳞癌", "宫颈腺癌", "cervical cancer", "宫颈"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-nasopharyngeal",
        kind: "cancer-alias",
        title: "鼻咽癌别名",
        content: "鼻咽癌、nasopharyngeal carcinoma、NPC。常见检测靶点包括EBV、PD-L1。",
        keywords: ["鼻咽癌", "nasopharyngeal carcinoma", "NPC", "鼻咽"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-laryngeal",
        kind: "cancer-alias",
        title: "喉癌别名",
        content: "喉癌、喉鳞癌、laryngeal cancer。常见检测靶点包括HPV、PD-L1。",
        keywords: ["喉癌", "喉鳞癌", "laryngeal cancer", "喉"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-cholangiocarcinoma",
        kind: "cancer-alias",
        title: "胆管癌别名",
        content: "胆管癌、胆管细胞癌、cholangiocarcinoma。常见检测靶点包括FGFR2融合、IDH1。",
        keywords: ["胆管癌", "胆管细胞癌", "cholangiocarcinoma", "胆管"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-gallbladder",
        kind: "cancer-alias",
        title: "胆囊癌别名",
        content: "胆囊癌、gallbladder cancer。常见检测靶点包括HER2、PD-L1。",
        keywords: ["胆囊癌", "gallbladder cancer", "胆囊"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-sarcoma",
        kind: "cancer-alias",
        title: "肉瘤别名",
        content: "肉瘤、软组织肉瘤、骨肉瘤、sarcoma。常见检测靶点包括MDM2、CDK4、PD-L1。",
        keywords: ["肉瘤", "软组织肉瘤", "骨肉瘤", "sarcoma"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-neuroendocrine",
        kind: "cancer-alias",
        title: "神经内分泌癌别名",
        content: "神经内分泌癌、神经内分泌瘤、NET、neuroendocrine tumor。常见检测靶点包括mTOR、SSTR。",
        keywords: ["神经内分泌癌", "神经内分泌瘤", "NET", "neuroendocrine"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-mesothelioma",
        kind: "cancer-alias",
        title: "间皮瘤别名",
        content: "间皮瘤、胸膜间皮瘤、腹膜间皮瘤、mesothelioma。常见检测靶点包括BAP1、PD-L1。",
        keywords: ["间皮瘤", "胸膜间皮瘤", "mesothelioma", "间皮"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-leukemia",
        kind: "cancer-alias",
        title: "白血病别名",
        content: "白血病、急性白血病、慢性白血病、leukemia。常见检测靶点包括BCR-ABL、FLT3、IDH1/2。",
        keywords: ["白血病", "急性白血病", "慢性白血病", "leukemia", "AML", "ALL"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      },
      {
        id: "cancer-alias-myeloma",
        kind: "cancer-alias",
        title: "骨髓瘤别名",
        content: "骨髓瘤、多发性骨髓瘤、multiple myeloma。常见检测靶点包括BCMA、CD38。",
        keywords: ["骨髓瘤", "多发性骨髓瘤", "multiple myeloma", "myeloma"],
        fieldKeys: ["tumorType", "tumorCategory", "clinicalDiagnosis"]
      }
    ]
  };
}
