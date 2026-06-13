import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 肿瘤基因检测申请单 Schema
 * 基于实际文档：分子病理检测申请单（山东第一医科大学附属肿瘤医院）
 */
const tumorGeneTestDefinition = {
  key: "tumor-gene-test",
  name: "肿瘤基因检测申请单",
  label: "肿瘤基因检测申请单",
  locale: "zh-CN",
  version: "1.0.0",
  description:
    "肿瘤基因检测申请单识别 Schema，用于识别患者信息、送检信息、检测项目、样本信息等。基于实际分子病理检测申请单设计。",
  adapter: {
    type: "tumor-gene-test",
    targetSystem: "LIMS",
    targetEndpointKey: "tumorGeneTestWriteback",
  },
  evidencePolicy: {
    required: true,
    minConfidence: 0.6,
    requireSourceText: true,
    requirePageReference: true,
  },
  validation: {
    requiredEvidenceFields: ["patientName", "referringDoctor", "tumorType"],
    missingRequiredFieldDecision: "needs_review",
    minConfidenceForAutoWriteback: 0.85,
  },
  fields: [
    // 患者基本信息
    {
      key: "patientName",
      label: "患者姓名",
      type: "string",
      required: true,
      comments: [
        "从'姓名：'后提取，通常为手写或打印体。",
        "注意区分送检医生姓名和患者姓名。",
      ],
      adapterHints: {
        limsTargetPath: "patient.name",
        writebackMode: "preview",
      },
    },
    {
      key: "patientGender",
      label: "性别",
      type: "enum",
      enumMap: {
        male: "男",
        female: "女",
        unknown: "未填写",
      },
      comments: [
        "从'性别：男□女'中判断，区分勾选和未勾选。",
        "OCR 难以区分 □ 和 ☑，若无法判断则标记 unknown 并保留原文。",
      ],
      adapterHints: {
        limsTargetPath: "patient.gender",
        normalizer: "gender",
        writebackMode: "preview",
      },
    },
    {
      key: "patientAge",
      label: "年龄",
      type: "string",
      comments: [
        "从'年龄：XX岁'中提取，注意手写数字可能识别错误。",
      ],
      adapterHints: {
        limsTargetPath: "patient.age",
        writebackMode: "preview",
      },
    },
    {
      key: "outpatientNo",
      label: "门诊号",
      type: "string",
      comments: ["从'门诊号：'后提取，通常为打印数字。示例：0001957996"],
      adapterHints: {
        limsTargetPath: "patient.outpatientNo",
        writebackMode: "preview",
      },
    },
    {
      key: "phone",
      label: "联系电话",
      type: "string",
      comments: ["从'联系电话：'或'联系电话1：'后提取。11位手机号格式。"],
      adapterHints: {
        limsTargetPath: "patient.phone",
        writebackMode: "preview",
      },
    },
    {
      key: "idNumber",
      label: "身份证号",
      type: "string",
      comments: [
        "从'身份证/护照：'后提取。",
        "OCR 对身份证号识别质量极差，此字段置信度通常很低，必须人工复核。",
      ],
      adapterHints: {
        limsTargetPath: "patient.idNumber",
        writebackMode: "preview",
      },
    },
    {
      key: "ethnicity",
      label: "民族",
      type: "string",
      comments: ["从'民族：'后提取。示例：汉"],
      adapterHints: {
        limsTargetPath: "patient.ethnicity",
        writebackMode: "preview",
      },
    },

    // 送检信息
    {
      key: "referringDoctor",
      label: "送检医生",
      type: "string",
      required: true,
      comments: ["从'送检医生：'后提取。示例：贾文笑"],
      adapterHints: {
        limsTargetPath: "referral.doctor",
        writebackMode: "preview",
      },
    },
    {
      key: "referralDate",
      label: "送检日期",
      type: "date",
      comments: [
        "从'送检日期：'后提取，归一化为 ISO 日期。",
        "手写日期格式不规范（如 20265714），需要推断正确日期。",
        "若日期明显不合法，保留原文并标记为疑似错误。",
      ],
      adapterHints: {
        limsTargetPath: "referral.date",
        normalizer: "dateText",
        writebackMode: "preview",
      },
    },
    {
      key: "pathologyNo",
      label: "病理号",
      type: "string",
      comments: ["从'病理号：'后提取。示例：2022-21264"],
      adapterHints: {
        limsTargetPath: "referral.pathologyNo",
        writebackMode: "preview",
      },
    },
    {
      key: "sampleNo",
      label: "样本编号",
      type: "string",
      comments: ["从文档顶部或'样本编号：'后提取。示例：FZ2665269"],
      adapterHints: {
        limsTargetPath: "sample.sampleNo",
        writebackMode: "preview",
      },
    },
    {
      key: "clinicRoom",
      label: "诊室",
      type: "string",
      comments: ["从'诊室：'后提取。示例：胸部放疗知名专家门诊(4)"],
      adapterHints: {
        limsTargetPath: "referral.clinicRoom",
        writebackMode: "preview",
      },
    },

    // 临床诊断
    {
      key: "tumorType",
      label: "肿瘤类型",
      type: "string",
      required: true,
      comments: [
        "从临床诊断或文档上下文推断的肿瘤类型。",
        "本文档中为'肺腺癌'（OCR 识别为'肺腺cu'，手写体识别不准确）。",
        "需要结合原始文本和上下文推断正确值。",
      ],
      adapterHints: {
        limsTargetPath: "clinical.tumorType",
        writebackMode: "preview",
      },
    },
    {
      key: "tumorCategory",
      label: "肿瘤分类",
      type: "enum",
      enumMap: {
        gastrointestinal_stromal: "胃肠间质瘤",
        thyroid: "甲状腺癌",
        melanoma: "黑色素癌",
        breast: "乳腺癌",
        lung: "肺癌",
        colorectal: "结直肠癌",
        gastric: "胃癌",
        other: "其他",
        unknown: "未勾选/无法判断",
      },
      comments: [
        "从'□胃肠间质瘤□甲状腺癌 □黑色素癌 □乳腺癌□其他'中判断勾选了哪个。",
        "OCR 无法区分 □ 和 ☑，需要从上下文推断。",
      ],
      adapterHints: {
        limsTargetPath: "clinical.tumorCategory",
        writebackMode: "preview",
      },
    },

    // 样本信息
    {
      key: "sampleType",
      label: "标本类型",
      type: "list",
      comments: [
        "从'标本类型：内镜活检 口穿刺活检 手术标本 胸水 全血 □其他'中判断。",
        "可能是多选，用列表表示。",
      ],
      adapterHints: {
        limsTargetPath: "sample.type",
        normalizer: "listField",
        writebackMode: "preview",
      },
    },
    {
      key: "bloodSample",
      label: "血液样本信息",
      type: "string",
      comments: [
        "从'血液：'后提取样本量和处理信息。",
        "手写内容识别质量低。",
      ],
      adapterHints: {
        limsTargetPath: "sample.blood",
        writebackMode: "preview",
      },
    },
    {
      key: "samplePrepTime",
      label: "样本制备时间",
      type: "string",
      comments: [
        "从'样本制备时间：'后提取。手写日期时间格式不规范，保留原文。",
      ],
      adapterHints: {
        limsTargetPath: "sample.prepTime",
        writebackMode: "preview",
      },
    },
    {
      key: "tumorCellPercent",
      label: "肿瘤细胞含量",
      type: "string",
      comments: ["从'肿瘤细胞含量：__%'中提取。通常为手写百分比。"],
      adapterHints: {
        limsTargetPath: "sample.tumorCellPercent",
        writebackMode: "preview",
      },
    },

    // 检测项目
    {
      key: "testItemsLung",
      label: "肺癌检测项目",
      type: "list",
      comments: [
        "从肺癌区域的勾选项中提取已选项目。",
        "选项：肿瘤9基因、肿瘤13基因、肺癌11基因、EGFR、肿瘤40基因、188基因、1021基因、肿瘤mrd（血液）、实体瘤40基因",
        "OCR 无法区分 □ 和 ☑，保留所有选项文本，由人工确认实际勾选项。",
      ],
      adapterHints: {
        limsTargetPath: "testOrder.lung",
        normalizer: "listField",
        writebackMode: "preview",
      },
    },
    {
      key: "testItemsGI",
      label: "消化道肿瘤检测项目",
      type: "list",
      comments: [
        "从消化道肿瘤区域的勾选项中提取已选项目。",
        "选项：肠癌3基因（+MSI）、MSI、UGT1A1、C-Kit、PDGFRA、肠癌4基因（+MSI）、胃癌18基因、肿瘤18基因、肿瘤40基因、林奇综合征",
      ],
      adapterHints: {
        limsTargetPath: "testOrder.gi",
        normalizer: "listField",
        writebackMode: "preview",
      },
    },
    {
      key: "testItemsOther",
      label: "其他检测项目",
      type: "list",
      comments: [
        "从检测产品区域提取已选项目。",
        "可能包括：Onco1021-MRD、OncoD肿瘤用药基因检测、同源重组修复缺陷基因检测、OncoMD、脑胶质瘤基因检测、肿瘤临床超级外显子组、肿瘤融合基因检测、PD-L1 IHC、淋巴瘤基因检测",
      ],
      adapterHints: {
        limsTargetPath: "testOrder.other",
        normalizer: "listField",
        writebackMode: "preview",
      },
    },

    // 检测产品/公司
    {
      key: "testProvider",
      label: "检测公司",
      type: "string",
      comments: ["从文档中提取检测公司名称。示例：Gene+吉因加"],
      adapterHints: {
        limsTargetPath: "testOrder.provider",
        writebackMode: "preview",
      },
    },
    {
      key: "documentNo",
      label: "文件编号",
      type: "string",
      comments: ["从'文件编号：'后提取。示例：GeneTA5-002"],
      adapterHints: {
        limsTargetPath: "testOrder.documentNo",
        writebackMode: "preview",
      },
    },
    {
      key: "documentVersion",
      label: "文件版本",
      type: "string",
      comments: ["从'文件版本：'后提取。示例：V2.1"],
      adapterHints: {
        limsTargetPath: "testOrder.documentVersion",
        writebackMode: "preview",
      },
    },

    // 其他
    {
      key: "transfusionHistory",
      label: "输血史",
      type: "enum",
      enumMap: {
        none: "无",
        yes: "有",
        unknown: "未填写",
      },
      comments: ["从'输血史：无有'中判断。OCR 无法区分勾选状态。"],
      adapterHints: {
        limsTargetPath: "clinical.transfusionHistory",
        writebackMode: "preview",
      },
    },
  ],
};

async function main() {
  console.log("Seeding tumor-gene-test schema...");

  // Find or create a publisher user
  const user = await prisma.user.findFirst({
    where: { email: "admin.dev@example.local" },
  });

  if (!user) {
    console.error("Admin user not found. Run main seed first.");
    process.exit(1);
  }

  // Upsert the schema version
  const existing = await prisma.schemaVersion.findFirst({
    where: { schemaKey: "tumor-gene-test", version: 1 },
  });

  if (existing) {
    console.log("Schema already exists, updating definition...");
    await prisma.schemaVersion.update({
      where: { id: existing.id },
      data: {
        definition: tumorGeneTestDefinition as any,
        displayName: "肿瘤基因检测申请单",
        changelog: "基于实际分子病理检测申请单重新设计 Schema",
      },
    });
  } else {
    console.log("Creating new schema version...");
    await prisma.schemaVersion.create({
      data: {
        schemaKey: "tumor-gene-test",
        version: 1,
        displayName: "肿瘤基因检测申请单",
        status: "active",
        definition: tumorGeneTestDefinition as any,
        changelog: "基于实际分子病理检测申请单设计 Schema",
        publishedById: user.id,
      },
    });
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
