import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEV_ADMIN_PASSWORD_HASH = "$2b$10$t2Zf0Oed2yXwozTjLw8K1.ZiqCkBx.vi6uvPOk6PYhWD7eDUkeCe.";
const legacySyntheticProviderKeys = [
  `mock-${"ocr"}-default`,
  `mock-${"llm"}-default`,
  `mock-${"lims"}-writeback`
];

const permissions = {
  admin: [
    "user:manage",
    "role:manage",
    "schema:read",
    "schema:draft",
    "schema:publish",
    "job:create",
    "job:read",
    "job:review",
    "feedback:create",
    "feedback:review",
    "provider:manage",
    "writeback:execute",
    "evaluation:manage",
    "audit:read"
  ],
  reviewer: ["schema:read", "job:create", "job:read", "job:review", "feedback:create", "feedback:review"],
  operator: ["schema:read", "job:create", "job:read", "feedback:create"]
};

const limsClinicalInfoDefinition = {
  key: "lims-clinical-info",
  name: "LIMS 临床信息",
  label: "LIMS 临床信息",
  locale: "zh-CN",
  version: "1.0.0",
  description: "肿瘤临床信息病历识别 Schema",
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
      enumMap: { never: "从不吸烟", current: "目前吸烟", former: "既往吸烟或已戒烟", unknown: "未提及或无法判断" },
      adapterHints: { limsTargetPath: "clinicalInfo.smokingHistory", normalizer: "smoking", writebackMode: "preview" }
    },
    {
      key: "hypertensionHistory",
      label: "高血压病史",
      type: "boolean",
      adapterHints: { limsTargetPath: "clinicalInfo.hypertensionHistory", normalizer: "booleanHistory", writebackMode: "preview" }
    },
    {
      key: "diagnosisDate",
      label: "诊断日期",
      type: "date",
      adapterHints: { limsTargetPath: "clinicalInfo.diagnosisDate", normalizer: "dateText", writebackMode: "preview" }
    },
    {
      key: "familyTumorHistory",
      label: "家族肿瘤史",
      type: "list",
      adapterHints: { limsTargetPath: "clinicalInfo.familyTumorHistory", normalizer: "listField", writebackMode: "preview" }
    },
    {
      key: "clinicalDiagnosis",
      label: "临床诊断",
      type: "string",
      required: true,
      adapterHints: { limsTargetPath: "clinicalInfo.clinicalDiagnosis", writebackMode: "preview" }
    },
    {
      key: "sampleType",
      label: "样本类型",
      type: "enum",
      enumMap: { tissue: "组织", blood: "血液", pleuralEffusion: "胸水", paraffinSection: "石蜡切片", unknown: "未提及或无法判断" },
      adapterHints: { limsTargetPath: "clinicalInfo.sampleType", normalizer: "sampleType", writebackMode: "preview" }
    },
    {
      key: "tumorType",
      label: "肿瘤类型",
      type: "string",
      adapterHints: { limsTargetPath: "clinicalInfo.tumorType", writebackMode: "preview" }
    },
    {
      key: "tumorStage",
      label: "肿瘤分期",
      type: "string",
      adapterHints: { limsTargetPath: "clinicalInfo.tumorStage", writebackMode: "preview" }
    },
    {
      key: "reportDate",
      label: "报告日期",
      type: "date",
      adapterHints: { limsTargetPath: "clinicalInfo.reportDate", normalizer: "dateText", writebackMode: "preview" }
    }
  ],
  validation: {
    minConfidenceForAutoWriteback: 0.92,
    requiredEvidenceFields: ["clinicalDiagnosis", "sampleType"],
    missingRequiredFieldDecision: "needs_review"
  }
};

async function main() {
  // 本 seed 只创建合成初始化数据：账号、角色、provider、schema 都用于开发演示。
  // 这里不包含真实患者信息、真实密码、真实 token、真实内网地址或任何生产凭据。
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      description: "系统管理员，可管理 schema、provider、评估、写回和审计。",
      permissions: permissions.admin
    },
    create: {
      name: "admin",
      description: "系统管理员，可管理 schema、provider、评估、写回和审计。",
      permissions: permissions.admin
    }
  });

  await prisma.role.upsert({
    where: { name: "reviewer" },
    update: {
      description: "审核员，可复核识别结果、提交反馈并参与规则改进。",
      permissions: permissions.reviewer
    },
    create: {
      name: "reviewer",
      description: "审核员，可复核识别结果、提交反馈并参与规则改进。",
      permissions: permissions.reviewer
    }
  });

  await prisma.role.upsert({
    where: { name: "operator" },
    update: {
      description: "操作员，可上传合成样本并查看自己有权限的识别任务。",
      permissions: permissions.operator
    },
    create: {
      name: "operator",
      description: "操作员，可上传合成样本并查看自己有权限的识别任务。",
      permissions: permissions.operator
    }
  });

  await prisma.user.upsert({
    where: { email: "admin.dev@example.local" },
    update: {
      displayName: "本地开发管理员",
      status: "active",
      passwordHash: DEV_ADMIN_PASSWORD_HASH,
      metadata: {
        credentialNotice: "仅用于本地开发。固定临时密码为 ChangeMe123!，hash 已用 bcrypt 校验，不能用于生产或共享环境。"
      },
      roles: {
        set: [{ id: adminRole.id }]
      }
    },
    create: {
      email: "admin.dev@example.local",
      displayName: "本地开发管理员",
      passwordHash: DEV_ADMIN_PASSWORD_HASH,
      status: "active",
      metadata: {
        credentialNotice: "仅用于本地开发。固定临时密码为 ChangeMe123!，hash 已用 bcrypt 校验，不能用于生产或共享环境。"
      },
      roles: {
        connect: [{ id: adminRole.id }]
      }
    }
  });

  await prisma.providerConfig.deleteMany({
    where: {
      key: {
        in: legacySyntheticProviderKeys
      }
    }
  });

  await prisma.providerConfig.upsert({
    where: { key: "local-storage-default" },
    update: {
      kind: "storage",
      displayName: "本地文件存储",
      status: "active",
      isDefault: true,
      config: {
        driver: "local",
        baseDir: "./storage",
        syntheticOnly: true
      },
      secretRefs: {}
    },
    create: {
      key: "local-storage-default",
      kind: "storage",
      displayName: "本地文件存储",
      status: "active",
      isDefault: true,
      config: {
        driver: "local",
        baseDir: "./storage",
        syntheticOnly: true
      },
      secretRefs: {}
    }
  });

  await prisma.providerConfig.upsert({
    where: { key: "paddleocr-http" },
    update: {
      kind: "ocr",
      displayName: "PaddleOCR 本地服务",
      status: "active",
      isDefault: true,
      config: {
        provider: "http",
        endpoint: "http://127.0.0.1:8866/ocr",
        timeoutMs: 30000
      },
      secretRefs: {}
    },
    create: {
      key: "paddleocr-http",
      kind: "ocr",
      displayName: "PaddleOCR 本地服务",
      status: "active",
      isDefault: true,
      config: {
        provider: "http",
        endpoint: "http://127.0.0.1:8866/ocr",
        timeoutMs: 30000
      },
      secretRefs: {}
    }
  });

  await prisma.providerConfig.upsert({
    where: { key: "local-lims-sandbox" },
    update: {
      kind: "lims",
      displayName: "本地 LIMS 沙箱写回目标",
      status: "active",
      isDefault: true,
      config: {
        baseUrl: "http://localhost:8090",
        clinicalInfoEndpoint: "/api/clinical-info/writeback",
        timeoutMs: 10000,
        syntheticOnly: true
      },
      secretRefs: {
        tokenEnv: "LIMS_API_TOKEN"
      }
    },
    create: {
      key: "local-lims-sandbox",
      kind: "lims",
      displayName: "本地 LIMS 沙箱写回目标",
      status: "active",
      isDefault: true,
      config: {
        baseUrl: "http://localhost:8090",
        clinicalInfoEndpoint: "/api/clinical-info/writeback",
        timeoutMs: 10000,
        syntheticOnly: true
      },
      secretRefs: {
        tokenEnv: "LIMS_API_TOKEN"
      }
    }
  });

  await prisma.schemaVersion.upsert({
    where: {
      schemaKey_version: {
        schemaKey: "lims-clinical-info",
        version: 1
      }
    },
    update: {
      displayName: "LIMS 高资信息病历识别预设",
      status: "active",
      definition: limsClinicalInfoDefinition,
      changelog: "初始化合成 LIMS 高资信息 schema version，用于本地开发演示。"
    },
    create: {
      schemaKey: "lims-clinical-info",
      version: 1,
      displayName: "LIMS 高资信息病历识别预设",
      status: "active",
      definition: limsClinicalInfoDefinition,
      changelog: "初始化合成 LIMS 高资信息 schema version，用于本地开发演示。"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Prisma seed 执行失败：", error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
