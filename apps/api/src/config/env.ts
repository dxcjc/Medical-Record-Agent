import { z } from "zod";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1, "HOST 不能为空").default(DEFAULT_HOST),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),

  DATABASE_URL: z.string().min(1, "DATABASE_URL 是必要配置").url("DATABASE_URL 必须是合法连接地址"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET 至少需要 32 个字符，避免开发环境外使用弱密钥"),
  JWT_EXPIRES_IN: z.string().min(1, "JWT_EXPIRES_IN 不能为空").default("1h"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1, "JWT_REFRESH_EXPIRES_IN 不能为空").default("7d"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().min(1, "LOCAL_STORAGE_DIR 不能为空").default("./storage"),
  S3_ENDPOINT: z.string().url("S3_ENDPOINT 必须是合法 URL").optional(),
  S3_REGION: z.string().min(1, "S3_REGION 不能为空").optional(),
  S3_BUCKET: z.string().min(1, "S3_BUCKET 不能为空").optional(),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID 不能为空").optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY 不能为空").optional(),

  OCR_PROVIDER: z.enum(["none", "http"]).default("none"),
  OCR_ENDPOINT: z.string().url("OCR_ENDPOINT 必须是合法 URL").optional(),
  OCR_API_KEY: z.string().optional().transform(v => v || undefined),

  LLM_PROVIDER: z.enum(["none", "langchain", "openai-compatible", "openai-responses"]).default("none"),
  LLM_MODEL: z.string().min(1, "LLM_MODEL 不能为空").optional(),
  LLM_BASE_URL: z.string().url("LLM_BASE_URL 必须是合法 URL").optional(),
  LLM_API_KEY: z.string().optional().transform(v => v || undefined),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY 不能为空").optional(),

  LIMS_BASE_URL: z.string().url("LIMS_BASE_URL 必须是合法 URL"),
  LIMS_CLINICAL_INFO_ENDPOINT: z.string().min(1, "LIMS_CLINICAL_INFO_ENDPOINT 不能为空"),
  LIMS_API_TOKEN: z.string().min(1, "LIMS_API_TOKEN 不能为空"),
  LIMS_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
});

const checkedEnvSchema = rawEnvSchema.superRefine((env, context) => {
  // 当对象存储被启用时，启动阶段必须一次性校验完整 S3 配置，避免运行到上传文件时才失败。
  if (env.STORAGE_DRIVER === "s3") {
    for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!env[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} 是启用 S3 存储时的必要配置`
        });
      }
    }
  }

  // 未配置真实 OCR provider 时保留 none 状态；真实 OCR provider 必须显式提供 endpoint，token 可按测试服务策略选填。
  if (env.OCR_PROVIDER === "http" && !env.OCR_ENDPOINT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OCR_ENDPOINT"],
      message: "OCR_PROVIDER=http 时必须配置 OCR_ENDPOINT"
    });
  }

  if (env.LLM_PROVIDER !== "none" && !env.LLM_MODEL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_MODEL"],
      message: "配置真实 LLM provider 时必须配置 LLM_MODEL"
    });
  }

  // 真实模型 provider 必须声明模型网关地址或 OpenAI key，防止启动后把请求发到不明确的目标。
  if (env.LLM_PROVIDER === "openai-compatible" && (!env.LLM_BASE_URL || !env.LLM_API_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_BASE_URL"],
      message: "LLM_PROVIDER=openai-compatible 时必须配置 LLM_BASE_URL 和 LLM_API_KEY"
    });
  }

  // LangChain 是真实模型调用链路，必须至少提供一个模型访问密钥；未配置状态不会进入识别主链路。
  if (env.LLM_PROVIDER === "langchain" && !env.LLM_API_KEY && !env.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_API_KEY"],
      message: "LLM_PROVIDER=langchain 时必须配置 LLM_API_KEY 或 OPENAI_API_KEY"
    });
  }

  if (env.LLM_PROVIDER === "openai-responses" && !env.OPENAI_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "LLM_PROVIDER=openai-responses 时必须配置 OPENAI_API_KEY"
    });
  }
});

export type AppEnv = ReturnType<typeof parseEnv>;

export function parseEnv(input: NodeJS.ProcessEnv) {
  const result = checkedEnvSchema.safeParse(input);

  if (!result.success) {
    // 错误信息只包含配置项名称和校验原因，不回显用户传入的密钥或 token 值。
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "ENV"}: ${issue.message}`)
      .join("; ");

    throw new Error(`环境变量校验失败：${details}`);
  }

  const env = result.data;

  return {
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    server: {
      host: env.HOST,
      port: env.PORT
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
    },
    storage: {
      driver: env.STORAGE_DRIVER,
      localDir: env.LOCAL_STORAGE_DIR,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY
      }
    },
    providers: {
      ocr: {
        provider: env.OCR_PROVIDER,
        endpoint: env.OCR_ENDPOINT,
        apiKey: env.OCR_API_KEY
      },
      llm: {
        provider: env.LLM_PROVIDER,
        model: env.LLM_MODEL ?? "unconfigured-real-model",
        baseUrl: env.LLM_BASE_URL,
        apiKey: env.LLM_API_KEY,
        openAiApiKey: env.OPENAI_API_KEY
      }
    },
    lims: {
      baseUrl: env.LIMS_BASE_URL,
      clinicalInfoEndpoint: env.LIMS_CLINICAL_INFO_ENDPOINT,
      apiToken: env.LIMS_API_TOKEN,
      timeoutMs: env.LIMS_TIMEOUT_MS
    }
  };
}

export function loadEnv() {
  // API 启动入口调用该函数即可在进程启动阶段完成必要变量校验；测试和纯类型导入不会被环境副作用影响。
  return parseEnv(process.env);
}
