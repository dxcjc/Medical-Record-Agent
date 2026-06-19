import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_ENTRIES = [
  // ========== 肿瘤类型与别名 ==========
  { kind: "cancer_alias", title: "肺腺癌别名", content: "肺腺癌、LUAD、lung adenocarcinoma 通常归入肿瘤类型候选，优先映射到 tumorType。肺腺癌是非小细胞肺癌（NSCLC）最常见的亚型，约占肺癌的40%。", keywords: ["肺腺癌","LUAD","lung adenocarcinoma","腺癌","非小细胞肺癌","NSCLC","肿瘤类型","tumorType"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 1 },
  { kind: "cancer_alias", title: "肺鳞癌别名", content: "肺鳞癌、肺鳞状细胞癌、LUSC、lung squamous cell carcinoma，属于非小细胞肺癌亚型。", keywords: ["肺鳞癌","鳞状细胞癌","LUSC","lung squamous","鳞癌"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 2 },
  { kind: "cancer_alias", title: "小细胞肺癌别名", content: "小细胞肺癌、SCLC、small cell lung cancer，恶性程度高，约占肺癌15%。", keywords: ["小细胞肺癌","SCLC","small cell","小细胞"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 3 },
  { kind: "cancer_alias", title: "结直肠癌别名", content: "结直肠癌、CRC、colorectal cancer、大肠癌、直肠癌、结肠癌。常见检测基因为KRAS、NRAS、BRAF、MSI。", keywords: ["结直肠癌","CRC","colorectal","大肠癌","直肠癌","结肠癌","肠癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 4 },
  { kind: "cancer_alias", title: "胃癌别名", content: "胃癌、gastric cancer、GC。病理报告中常写为'胃腺癌'、'胃中分化腺癌'、'胃低分化腺癌'、'胃印戒细胞癌'等，tumorType应统一提取为'胃癌'。常见检测靶点包括HER2、PD-L1、MSI。", keywords: ["胃癌","gastric cancer","GC","胃腺癌","胃印戒细胞癌","中分化腺癌","低分化腺癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 5 },
  { kind: "cancer_alias", title: "乳腺癌别名", content: "乳腺癌、breast cancer、BRCA。常见检测基因为BRCA1/2、HER2、ER/PR。", keywords: ["乳腺癌","breast cancer","BRCA","乳癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 6 },
  { kind: "cancer_alias", title: "甲状腺癌别名", content: "甲状腺癌、thyroid cancer。常见类型包括甲状腺乳头状癌、甲状腺滤泡癌。", keywords: ["甲状腺癌","thyroid cancer","甲状腺乳头状癌","甲状腺"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 7 },
  { kind: "cancer_alias", title: "胃肠间质瘤别名", content: "胃肠间质瘤、GIST、gastrointestinal stromal tumor。病理报告中常写为'胃肠道间质瘤'、'胃间质瘤'、'肠间质瘤'等，tumorType应统一提取为'胃肠间质瘤'。主要检测基因为C-KIT（CD117）和PDGFRA。", keywords: ["胃肠间质瘤","GIST","gastrointestinal stromal","间质瘤","胃肠道间质瘤"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 8 },
  { kind: "cancer_alias", title: "黑色素瘤别名", content: "黑色素瘤、melanoma、黑色素癌。常见检测基因为BRAF、C-KIT、NRAS。", keywords: ["黑色素瘤","melanoma","黑色素癌","恶黑"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 9 },
  { kind: "cancer_alias", title: "肝癌别名", content: "肝癌、肝细胞癌、HCC、hepatocellular carcinoma。常见检测靶点包括AFP、VEGF。", keywords: ["肝癌","肝细胞癌","HCC","hepatocellular","肝"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 10 },
  { kind: "cancer_alias", title: "胰腺癌别名", content: "胰腺癌、pancreatic cancer、PDAC。病理报告中常写为'胰腺导管腺癌'、'胰腺中分化导管腺癌'、'胰腺腺癌'等，tumorType应统一提取为'胰腺癌'。常见检测基因为KRAS、BRCA1/2。", keywords: ["胰腺癌","pancreatic","PDAC","胰腺","导管腺癌","胰腺腺癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 11 },
  { kind: "cancer_alias", title: "膀胱癌别名", content: "膀胱癌、尿路上皮癌、膀胱尿路上皮癌、bladder cancer、UC。病理报告中常写为'高级别尿路上皮癌'、'低级别尿路上皮癌'、'膀胱移行细胞癌'，tumorType应统一提取为'膀胱癌'。常见检测靶点包括FGFR3、PD-L1。", keywords: ["膀胱癌","尿路上皮癌","bladder cancer","UC","膀胱","尿路上皮","bladder","移行细胞癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 12 },
  { kind: "cancer_alias", title: "前列腺癌别名", content: "前列腺癌、前列腺腺癌、prostate cancer、PCa。病理报告中常写为'前列腺腺癌'、'Gleason评分'相关描述，tumorType应统一提取为'前列腺癌'。常见检测靶点包括AR、PTEN、BRCA2。", keywords: ["前列腺癌","前列腺腺癌","prostate cancer","PCa","前列腺","prostate","Gleason"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 13 },
  { kind: "cancer_alias", title: "卵巢癌别名", content: "卵巢癌、卵巢上皮癌、ovarian cancer、OC。常见检测基因为BRCA1/2、HRD。", keywords: ["卵巢癌","卵巢上皮癌","ovarian cancer","OC","卵巢","ovarian"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 14 },
  { kind: "cancer_alias", title: "宫颈癌别名", content: "宫颈癌、宫颈鳞癌、宫颈腺癌、cervical cancer。常见检测靶点包括HPV、PD-L1。", keywords: ["宫颈癌","宫颈鳞癌","宫颈腺癌","cervical cancer","宫颈","cervical"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 15 },
  { kind: "cancer_alias", title: "食管癌别名", content: "食管癌、食管鳞癌、食管腺癌、esophageal cancer。病理报告中常写为'食管鳞状细胞癌'、'食管腺癌'等，tumorType应统一提取为'食管癌'。常见检测靶点包括HER2、PD-L1。", keywords: ["食管癌","食管鳞癌","食管腺癌","esophageal cancer","食管","esophageal","鳞状细胞癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 16 },
  { kind: "cancer_alias", title: "肾癌别名", content: "肾癌、肾细胞癌、renal cell carcinoma、RCC。病理报告中常写为'肾细胞癌'、'透明细胞癌'、'乳头状肾细胞癌'、'嫌色细胞癌'、'FH缺陷型肾细胞癌'等，tumorType应统一提取为'肾癌'。常见检测靶点包括VHL、MET、PD-L1。", keywords: ["肾癌","肾细胞癌","renal cell carcinoma","RCC","肾","renal","透明细胞癌","嫌色细胞癌","乳头状肾细胞癌","FH缺陷型"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 17 },
  { kind: "cancer_alias", title: "鼻咽癌别名", content: "鼻咽癌、nasopharyngeal carcinoma、NPC。常见检测靶点包括EBV、PD-L1。", keywords: ["鼻咽癌","nasopharyngeal carcinoma","NPC","鼻咽","nasopharyngeal"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 18 },
  { kind: "cancer_alias", title: "喉癌别名", content: "喉癌、喉鳞癌、laryngeal cancer。常见检测靶点包括HPV、PD-L1。", keywords: ["喉癌","喉鳞癌","laryngeal cancer","喉","laryngeal"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 19 },
  { kind: "cancer_alias", title: "胆管癌别名", content: "胆管癌、胆管细胞癌、cholangiocarcinoma。常见检测靶点包括FGFR2融合、IDH1。", keywords: ["胆管癌","胆管细胞癌","cholangiocarcinoma","胆管","cholangio"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 20 },
  { kind: "cancer_alias", title: "胆囊癌别名", content: "胆囊癌、gallbladder cancer。常见检测靶点包括HER2、PD-L1。", keywords: ["胆囊癌","gallbladder cancer","胆囊","gallbladder"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 21 },
  { kind: "cancer_alias", title: "肉瘤别名", content: "肉瘤、软组织肉瘤、骨肉瘤、sarcoma。常见检测靶点包括MDM2、CDK4、PD-L1。", keywords: ["肉瘤","软组织肉瘤","骨肉瘤","sarcoma"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 22 },
  { kind: "cancer_alias", title: "神经内分泌癌别名", content: "神经内分泌癌、神经内分泌瘤、NET、neuroendocrine tumor。常见检测靶点包括mTOR、SSTR。", keywords: ["神经内分泌癌","神经内分泌瘤","NET","neuroendocrine","神经内分泌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 23 },
  { kind: "cancer_alias", title: "间皮瘤别名", content: "间皮瘤、胸膜间皮瘤、腹膜间皮瘤、mesothelioma。常见检测靶点包括BAP1、PD-L1。", keywords: ["间皮瘤","胸膜间皮瘤","mesothelioma","间皮","mesothelial"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 24 },
  { kind: "cancer_alias", title: "胶质瘤别名", content: "胶质瘤、脑胶质瘤、glioma。病理报告中常写为'弥漫性胶质瘤'、'星形细胞瘤'、'少突胶质细胞瘤'、'胶质母细胞瘤'等，tumorType应统一提取为'胶质瘤'。常见检测靶点包括IDH1/2、MGMT启动子甲基化、TERT。", keywords: ["胶质瘤","脑胶质瘤","glioma","胶质","星形细胞瘤","少突胶质","胶质母细胞瘤","弥漫性胶质瘤"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 25 },
  { kind: "cancer_alias", title: "淋巴瘤别名", content: "淋巴瘤、霍奇金淋巴瘤、非霍奇金淋巴瘤、lymphoma。病理报告中常写为'非霍奇金淋巴瘤，弥漫性大B细胞淋巴瘤'、'霍奇金淋巴瘤'等，tumorType应统一提取为'淋巴瘤'或具体的亚型名称。常见检测靶点包括CD20、PD-L1、EBV。", keywords: ["淋巴瘤","霍奇金淋巴瘤","非霍奇金淋巴瘤","lymphoma","霍奇金","Hodgkin","弥漫性大B细胞淋巴瘤","B细胞淋巴瘤"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 26 },
  { kind: "cancer_alias", title: "白血病别名", content: "白血病、急性白血病、慢性白血病、leukemia。常见检测靶点包括BCR-ABL、FLT3、IDH1/2。", keywords: ["白血病","急性白血病","慢性白血病","leukemia","急性髓系白血病","AML","ALL","CML","CLL"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 27 },
  { kind: "cancer_alias", title: "骨髓瘤别名", content: "骨髓瘤、多发性骨髓瘤、multiple myeloma。常见检测靶点包括BCMA、CD38。", keywords: ["骨髓瘤","多发性骨髓瘤","multiple myeloma","myeloma","MM"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 28 },
  // ========== 检测项目 ==========
  { kind: "medical_term", title: "肺癌基因检测9基因", content: "肺癌相关基因检测9基因套餐：EGFR、ALK、ROS1、KRAS、BRAF、MET、RET、HER2、PIK3CA。适用于非小细胞肺癌靶向用药指导。", keywords: ["9基因","九基因","肺癌9基因","EGFR","ALK","ROS1","KRAS","BRAF","MET","RET","HER2","PIK3CA","肺癌"], fieldKeys: ["testItemsLung","testItemsOther"], sortOrder: 20 },
  { kind: "medical_term", title: "肺癌基因检测13基因", content: "肺癌相关基因检测13基因套餐：在9基因基础上增加NTRK1/2/3、NRAS。覆盖更多罕见靶点。", keywords: ["13基因","十三基因","肺癌13基因","NTRK","NRAS"], fieldKeys: ["testItemsLung","testItemsOther"], sortOrder: 21 },
  { kind: "medical_term", title: "肺癌基因检测1021基因", content: "肺癌1021基因大Panel检测：覆盖肿瘤突变负荷（TMB）、微卫星不稳定性（MSI）、基因拷贝数变异等。适用于免疫治疗指导。", keywords: ["1021基因","大panel","TMB","MSI","免疫治疗","肺癌大panel"], fieldKeys: ["testItemsLung","testItemsOther"], sortOrder: 22 },
  { kind: "medical_term", title: "消化道肿瘤基因检测", content: "消化道肿瘤基因检测套餐：包含KRAS、NRAS、BRAF、MSI、HER2等。适用于结直肠癌、胃癌靶向和免疫治疗指导。", keywords: ["消化道","肠癌基因","KRAS","NRAS","BRAF","MSI","HER2","肠癌"], fieldKeys: ["testItemsGI","testItemsOther"], sortOrder: 23 },
  { kind: "medical_term", title: "林奇综合征检测", content: "林奇综合征（Lynch syndrome）基因检测：MLH1、MSH2、MSH6、PMS2。遗传性结直肠癌筛查。", keywords: ["林奇","Lynch","MLH1","MSH2","MSH6","PMS2","遗传性"], fieldKeys: ["testItemsGI","testItemsOther"], sortOrder: 24 },
  { kind: "medical_term", title: "HRD检测", content: "同源重组修复缺陷（HRD）检测：评估卵巢癌、乳腺癌对PARP抑制剂的敏感性。", keywords: ["HRD","同源重组","PARP","卵巢癌","乳腺癌"], fieldKeys: ["testItemsOther"], sortOrder: 25 },
  { kind: "medical_term", title: "PD-L1检测", content: "PD-L1免疫组化检测：评估肿瘤PD-L1表达水平，指导免疫检查点抑制剂（如帕博利珠单抗）使用。", keywords: ["PD-L1","免疫组化","帕博利珠","免疫治疗","PD1"], fieldKeys: ["testItemsOther"], sortOrder: 26 },
  // ========== LIMS 字典 ==========
  { kind: "lims_dictionary", title: "样本类型字典", content: "常见样本类型：组织（tissue）、血液（blood）、骨髓（bone marrow）、胸水（pleural effusion）、腹水（ascites）、脑脊液（CSF）。LIMS中tissue可简写为组织、蜡块、切片。", keywords: ["样本类型","tissue","blood","组织","血液","骨髓","胸水","腹水","蜡块","切片"], fieldKeys: ["sampleType","bloodSample"], sortOrder: 30 },
  { kind: "lims_dictionary", title: "检测公司字典", content: "常见检测公司：世和基因、燃石医学、泛生子、吉因加、臻和科技、思路迪、元码基因、诺禾致源。", keywords: ["世和","燃石","泛生子","吉因加","臻和","思路迪","元码","诺禾","检测公司","检测机构"], fieldKeys: ["testProvider"], sortOrder: 31 },
  { kind: "lims_dictionary", title: "组织样本处理", content: "组织样本需标注：取材部位、肿瘤细胞含量百分比（tumorCellPercent）、样本制备时间（samplePrepTime）。肿瘤细胞含量通常以百分比表示，如≥20%。", keywords: ["肿瘤细胞含量","tumorCellPercent","取材","制备时间","samplePrepTime","百分比"], fieldKeys: ["tumorCellPercent","samplePrepTime"], sortOrder: 32 },
  // ========== 样本类型标准化 ==========
  { kind: "sample_type_mapping", title: "样本类型标准化映射", content: "样本类型标准化规则：组织标本→组织；活检组织→组织；手术标本→组织；穿刺活检→穿刺；细针穿刺→穿刺；粗针穿刺→穿刺；骨髓穿刺→骨髓；外周血→血液；全血→血液；血浆→血液；血清→血液；胸水→胸水；胸腔积液→胸水；腹水→腹水；腹腔积液→腹水；脑脊液→脑脊液；尿液→尿液；痰液→痰液；灌洗液→灌洗液。", keywords: ["样本","标本","组织","活检","穿刺","骨髓","血液","血浆","血清","胸水","腹水","脑脊液","尿液","痰液","灌洗液","样本类型"], fieldKeys: ["sampleType"], sortOrder: 33 },
  // ========== 字段说明 ==========
  { kind: "field_description", title: "性别字段说明", content: "性别字段为勾选项：男□ 女□。OCR难以区分□和☑，应结合视觉增强判断。若无法确定则返回unknown。", keywords: ["性别","男","女","gender","勾选","□","☑"], fieldKeys: ["patientGender"], sortOrder: 40 },
  { kind: "field_description", title: "肿瘤分类说明", content: "肿瘤分类（tumorCategory）：实体瘤（solid）或血液肿瘤（hematologic）。肺癌、胃癌、乳腺癌等属于实体瘤；白血病、淋巴瘤属于血液肿瘤。", keywords: ["肿瘤分类","实体瘤","血液肿瘤","solid","hematologic","tumorCategory"], fieldKeys: ["tumorCategory"], sortOrder: 41 },
  { kind: "field_description", title: "肿瘤分类标准路径模板", content: "tumorCategory 输出格式为「器官系统/癌种/亚型」三级路径，不要使用系统级分类路径（如消化系统/结直肠/腺癌）。标准路径映射：结直肠癌→肠道/结直肠腺癌/直肠腺癌 或 肠道/结直肠腺癌/结肠腺癌；胃癌→消化系统/胃癌/胃腺癌；肺癌→呼吸系统/肺癌/肺腺癌 或 呼吸系统/肺癌/肺鳞癌；膀胱癌→泌尿系统/膀胱癌/尿路上皮癌；乳腺癌→乳腺/乳腺癌/浸润性癌。路径末级应为具体亚型名，与 tumorType 保持一致。", keywords: ["tumorCategory","标准路径","路径模板","结直肠","肠道","分类路径","亚型"], fieldKeys: ["tumorCategory"], sortOrder: 410 },
  { kind: "field_description", title: "临床分期输出规则", content: "临床分期（clinicalStage）输出规则：1) 报告中有临床分期（如 IV期、IIIA期）时优先输出临床分期；2) 无临床分期则输出 TNM 分期（如 T2aN1M0）；3) 不要混用 yp 前缀（新辅助治疗后分期），输出标准 TNM 即可。格式二选一：临床分期（罗马数字+期）或 TNM（T数字N数字M数字），不要同时输出两者。", keywords: ["临床分期","clinicalStage","TNM","分期","IV期","ypT","新辅助"], fieldKeys: ["clinicalStage"], sortOrder: 411 },
  { kind: "field_description", title: "肿瘤类型提取规则", content: "tumorType字段提取规则：从病理诊断中提取简化的癌种名称，而非完整的病理描述。例如：'膀胱高级别尿路上皮癌'→tumorType='膀胱癌'；'胰腺中分化导管腺癌'→tumorType='胰腺癌'；'弥漫性胶质瘤'→tumorType='胶质瘤'；'食管鳞状细胞癌'→tumorType='食管癌'；'胃肠道间质瘤伴坏死'→tumorType='胃肠间质瘤'；'（胃小弯）中-低分化腺癌'→tumorType='胃癌'。病理详情应放入pathologicalDiagnosis字段。", keywords: ["tumorType","肿瘤类型","癌种","提取规则","病理诊断","简化","规范化"], fieldKeys: ["tumorType"], sortOrder: 42 },
  { kind: "field_description", title: "输血史说明", content: "输血史（transfusionHistory）：勾选项，有输血史□ 无输血史□。输血可能影响基因检测结果（外源DNA干扰）。", keywords: ["输血","transfusion","输血史","外源DNA"], fieldKeys: ["transfusionHistory"], sortOrder: 42 },
  { kind: "field_description", title: "肿瘤细胞含量说明", content: "肿瘤细胞含量（tumorCellPercent）：组织样本中肿瘤细胞占比。通常要求≥20%才能保证检测准确性。格式如'≥20%'、'30%'。", keywords: ["肿瘤细胞含量","tumorCellPercent","≥20%","细胞占比","含量"], fieldKeys: ["tumorCellPercent"], sortOrder: 43 },
  { kind: "field_description", title: "临床诊断说明", content: "临床诊断（clinicalDiagnosis）：医生给出的诊断描述，如'左肺上叶腺癌'、'右肺下叶鳞状细胞癌'。可能包含部位、病理类型、分期等信息。", keywords: ["临床诊断","clinicalDiagnosis","诊断","病理","分期"], fieldKeys: ["clinicalDiagnosis"], sortOrder: 44 },
  { kind: "field_description", title: "送检信息说明", content: "送检信息包括：送检医生（referringDoctor）、送检日期（referralDate）、病理科号（pathologyNo）、样本编号（sampleNo）、诊室（clinicRoom）。", keywords: ["送检","referringDoctor","referralDate","病理科号","pathologyNo","样本编号","sampleNo","诊室"], fieldKeys: ["referringDoctor","referralDate","pathologyNo","sampleNo","clinicRoom"], sortOrder: 45 },
  { kind: "field_description", title: "身份证号格式", content: "中国身份证号：18位，最后一位可能是X。格式如'370102199001011234'。注意OCR可能将X识别为x。", keywords: ["身份证","idNumber","身份证号","证件号"], fieldKeys: ["idNumber"], sortOrder: 46 },
  { kind: "field_description", title: "电话号码格式", content: "手机号码：11位数字，1开头。格式如'13812345678'。座机号：区号+号码，如'0531-88888888'。", keywords: ["电话","phone","手机","号码","联系方式"], fieldKeys: ["phone"], sortOrder: 47 },
  { kind: "field_description", title: "门诊号说明", content: "门诊号（outpatientNo）：医院内部编号，通常为8-10位数字。如'0001957996'。不同医院格式不同。", keywords: ["门诊号","outpatientNo","门诊","编号"], fieldKeys: ["outpatientNo"], sortOrder: 48 },
  { kind: "field_description", title: "年龄字段说明", content: "年龄（patientAge）：通常以数字+岁表示，如'55岁'。应归一化为数字。注意手写体可能将5识别为S。", keywords: ["年龄","patientAge","岁","年纪"], fieldKeys: ["patientAge"], sortOrder: 49 },
  { kind: "field_description", title: "民族字段说明", content: "民族（ethnicity）：常见值包括汉族、回族、藏族、维吾尔族、蒙古族等。默认汉族。", keywords: ["民族","ethnicity","汉族","回族","少数民族"], fieldKeys: ["ethnicity"], sortOrder: 50 },
  { kind: "field_description", title: "文件编号说明", content: "文件编号（documentNo）：检测机构内部编号，用于追溯检测报告。格式因机构而异。", keywords: ["文件编号","documentNo","报告编号","检测编号"], fieldKeys: ["documentNo","documentVersion"], sortOrder: 51 },
  // ========== 性别推断规则 ==========
  { kind: "gender_inference", title: "性别推断规则", content: "性别推断规则：1. 直接标识：男/女、男性/女性、M/F/Male/Female；2. 疾病关联推断：乳腺癌→女性（99%），前列腺癌→男性（100%），宫颈癌/卵巢癌/子宫内膜癌→女性（100%），睾丸癌→男性（100%）；3. 检查项目推断：前列腺特异性抗原(PSA)→男性，人绒毛膜促性腺激素(hCG)→女性（孕期检查）；4. 注意事项：仅在无法直接识别时使用推断，推断结果confidence应降低0.2，如有冲突以直接标识为准。", keywords: ["性别","男","女","gender","乳腺","前列腺","宫颈","卵巢","睾丸","子宫内膜","PSA","hCG"], fieldKeys: ["patientGender"], sortOrder: 52 },
  // ========== OCR纠错规则 ==========
  { kind: "ocr_correction", title: "医院名称OCR纠错", content: "医院名称常见OCR错误映射：人民医皖→人民医院；肿瘸医院→肿瘤医院；协和医胱→协和医院；匠科大学→医科大学；附属医胱→附属医院；中心医胱→中心医院；第一人民医皖→第一人民医院；省立医胱→省立医院；军区总医胱→军区总医院；妇幼保腱院→妇幼保健院。OCR常见混淆字：院↔皖/胱/脱；瘤↔瘸/痛；科↔料/抖；健↔腱/建。", keywords: ["医院","医皖","医胱","肿瘤","肿瘸","人民","协和","医科","附属","中心","省立","军区","妇幼","OCR","纠错","医院名称"], fieldKeys: ["hospitalName"], sortOrder: 60 },
];

async function main() {
  const count = await prisma.knowledgeEntry.count();
  if (count > 0) {
    console.log(`知识库已有 ${count} 条记录，清除后重新 seed...`);
    await prisma.knowledgeEntry.deleteMany({});
  }
  const result = await prisma.knowledgeEntry.createMany({ data: SEED_ENTRIES as any });
  console.log(`✅ 已 seed ${result.count} 条知识库条目`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
