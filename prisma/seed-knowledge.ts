import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_ENTRIES = [
  // ========== 肿瘤类型与别名 ==========
  { kind: "cancer_alias", title: "肺腺癌别名", content: "肺腺癌、LUAD、lung adenocarcinoma 通常归入肿瘤类型候选，优先映射到 tumorType。肺腺癌是非小细胞肺癌（NSCLC）最常见的亚型，约占肺癌的40%。", keywords: ["肺腺癌","LUAD","lung adenocarcinoma","腺癌","非小细胞肺癌","NSCLC","肿瘤类型","tumorType"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 1 },
  { kind: "cancer_alias", title: "肺鳞癌别名", content: "肺鳞癌、肺鳞状细胞癌、LUSC、lung squamous cell carcinoma，属于非小细胞肺癌亚型。", keywords: ["肺鳞癌","鳞状细胞癌","LUSC","lung squamous","鳞癌"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 2 },
  { kind: "cancer_alias", title: "小细胞肺癌别名", content: "小细胞肺癌、SCLC、small cell lung cancer，恶性程度高，约占肺癌15%。", keywords: ["小细胞肺癌","SCLC","small cell","小细胞"], fieldKeys: ["tumorType","clinicalDiagnosis"], sortOrder: 3 },
  { kind: "cancer_alias", title: "结直肠癌别名", content: "结直肠癌、CRC、colorectal cancer、大肠癌、直肠癌、结肠癌。常见检测基因为KRAS、NRAS、BRAF、MSI。", keywords: ["结直肠癌","CRC","colorectal","大肠癌","直肠癌","结肠癌","肠癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 4 },
  { kind: "cancer_alias", title: "胃癌别名", content: "胃癌、gastric cancer、GC。常见检测靶点包括HER2、PD-L1、MSI。", keywords: ["胃癌","gastric cancer","GC","胃腺癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 5 },
  { kind: "cancer_alias", title: "乳腺癌别名", content: "乳腺癌、breast cancer、BRCA。常见检测基因为BRCA1/2、HER2、ER/PR。", keywords: ["乳腺癌","breast cancer","BRCA","乳癌"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 6 },
  { kind: "cancer_alias", title: "甲状腺癌别名", content: "甲状腺癌、thyroid cancer。常见类型包括甲状腺乳头状癌、甲状腺滤泡癌。", keywords: ["甲状腺癌","thyroid cancer","甲状腺乳头状癌","甲状腺"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 7 },
  { kind: "cancer_alias", title: "胃肠间质瘤别名", content: "胃肠间质瘤、GIST、gastrointestinal stromal tumor。主要检测基因为C-KIT（CD117）和PDGFRA。", keywords: ["胃肠间质瘤","GIST","gastrointestinal stromal","间质瘤"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 8 },
  { kind: "cancer_alias", title: "黑色素瘤别名", content: "黑色素瘤、melanoma、黑色素癌。常见检测基因为BRAF、C-KIT、NRAS。", keywords: ["黑色素瘤","melanoma","黑色素癌","恶黑"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 9 },
  { kind: "cancer_alias", title: "肝癌别名", content: "肝癌、肝细胞癌、HCC、hepatocellular carcinoma。常见检测靶点包括AFP、VEGF。", keywords: ["肝癌","肝细胞癌","HCC","hepatocellular","肝"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 10 },
  { kind: "cancer_alias", title: "胰腺癌别名", content: "胰腺癌、pancreatic cancer、PDAC。常见检测基因为KRAS、BRCA1/2。", keywords: ["胰腺癌","pancreatic","PDAC","胰腺"], fieldKeys: ["tumorType","tumorCategory","clinicalDiagnosis"], sortOrder: 11 },
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
  // ========== 字段说明 ==========
  { kind: "field_description", title: "性别字段说明", content: "性别字段为勾选项：男□ 女□。OCR难以区分□和☑，应结合视觉增强判断。若无法确定则返回unknown。", keywords: ["性别","男","女","gender","勾选","□","☑"], fieldKeys: ["patientGender"], sortOrder: 40 },
  { kind: "field_description", title: "肿瘤分类说明", content: "肿瘤分类（tumorCategory）：实体瘤（solid）或血液肿瘤（hematologic）。肺癌、胃癌、乳腺癌等属于实体瘤；白血病、淋巴瘤属于血液肿瘤。", keywords: ["肿瘤分类","实体瘤","血液肿瘤","solid","hematologic","tumorCategory"], fieldKeys: ["tumorCategory"], sortOrder: 41 },
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
];

async function main() {
  const count = await prisma.knowledgeEntry.count();
  if (count > 0) {
    console.log(`知识库已有 ${count} 条记录，跳过 seed`);
    return;
  }
  const result = await prisma.knowledgeEntry.createMany({ data: SEED_ENTRIES as any });
  console.log(`✅ 已 seed ${result.count} 条知识库条目`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
