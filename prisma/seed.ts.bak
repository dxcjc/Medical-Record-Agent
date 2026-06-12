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
  name: "LIMS 高资信息病历识别预设",
  locale: "zh-CN",
  description: "合成初始化字段配置，仅用于本地开发和演示，不包含真实患者数据。",
  adapter: {
    type: "lims-clinical-info",
    targetSystem: "LIMS",
    targetEndpointKey: "limsClinicalInfoWriteback"
  },
  fields: [
    {
      key: "patientName",
      label: "患者姓名",
      type: "string",
      required: true,
      aliases: ["姓名", "患者", "病人姓名"],
      evidenceRequired: true,
      adapterHint: {
        targetPath: "patient.name"
      }
    },
    {
      key: "gender",
      label: "性别",
      type: "enum",
      required: false,
      aliases: ["性别"],
      enumMap: {
        男: "male",
        女: "female",
        未说明: "unknown"
      },
      adapterHint: {
        targetPath: "patient.gender"
      }
    },
    {
      key: "age",
      label: "年龄",
      type: "number",
      required: false,
      aliases: ["年龄", "岁"],
      normalizer: "ageTextToNumber",
      adapterHint: {
        targetPath: "patient.age"
      }
    },
    {
      key: "diagnosis",
      label: "临床诊断",
      type: "string",
      required: true,
      aliases: ["诊断", "临床诊断", "入院诊断"],
      evidenceRequired: true,
      adapterHint: {
        targetPath: "clinical.diagnosis"
      }
    },
    {
      key: "sampleType",
      label: "样本类型",
      type: "enum",
      required: true,
      aliases: ["样本", "标本类型", "样本类型"],
      enumMap: {
        外周血: "peripheral_blood",
        组织: "tissue",
        血浆: "plasma",
        胸水: "pleural_effusion"
      },
      adapterHint: {
        targetPath: "sample.type"
      }
    },
    {
      key: "collectionDate",
      label: "采样日期",
      type: "date",
      required: false,
      aliases: ["采样日期", "采集日期", "取样日期"],
      normalizer: "dateTextToIsoDate",
      adapterHint: {
        targetPath: "sample.collectionDate"
      }
    },
    {
      key: "medicalHistory",
      label: "疾病史",
      type: "string",
      required: false,
      aliases: ["病史", "疾病史", "既往史"],
      adapterHint: {
        targetPath: "clinical.medicalHistory"
      }
    },
    {
      key: "familyHistory",
      label: "家族史",
      type: "string",
      required: false,
      aliases: ["家族史", "遗传史"],
      adapterHint: {
        targetPath: "clinical.familyHistory"
      }
    }
  ],
  validation: {
    minConfidenceForAutoWriteback: 0.92,
    requiredEvidenceFields: ["patientName", "diagnosis", "sampleType"],
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
