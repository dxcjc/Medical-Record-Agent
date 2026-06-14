import { z } from "zod";

export type ApiRouteResponseObject = Record<string, unknown>;
export type ProviderConfigFieldError = {
  path: string;
  message: string;
};

const nonEmptyString = z.string().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const jsonObjectSchema = z.record(z.unknown());
const secretRefsRouteInputSchema = z.record(nonEmptyString);

const plaintextSecretKeyPattern =
  /^(api[-_]?key|open[-_]?ai[-_]?api[-_]?key|api[-_]?token|access[-_]?token|refresh[-_]?token|bearer[-_]?token|password|passphrase|secret|client[-_]?secret|secret[-_]?access[-_]?key|authorization|auth[-_]?header)$/i;
const bearerValuePattern = /\bBearer\s+[^\s,;]+/gi;
const redactedRouteMarker = {
  redacted: true
} as const;
const sensitiveResponseKeyCompacts = new Set([
  "apikey",
  "openaiapikey",
  "apitoken",
  "xapitoken",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "token",
  "password",
  "passphrase",
  "secret",
  "clientsecret",
  "secretaccesskey",
  "accesskey",
  "authorization",
  "authheader",
  "cookie",
  "setcookie"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findPlaintextSecretConfigPath(value: unknown, path: string[] = []): string[] | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findPlaintextSecretConfigPath(value[index], [...path, String(index)]);
      if (nestedPath) {
        return nestedPath;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (plaintextSecretKeyPattern.test(key)) {
      return [...path, key];
    }

    const nestedPath = findPlaintextSecretConfigPath(item, [...path, key]);
    if (nestedPath) {
      return nestedPath;
    }
  }

  return null;
}

function parsePositiveIntegerQueryValue(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function compactKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretDiagnosticsPath(path: string[]) {
  return path.some((segment) => segment === "secretDiagnostics");
}

function isSensitiveResponseKey(key: string, path: string[]) {
  const compact = compactKey(key);

  if (compact === "secretref" || compact === "secretrefs") {
    return false;
  }

  if (isSecretDiagnosticsPath(path) && compact === "value") {
    return true;
  }

  if (isSecretDiagnosticsPath(path) && (compact === "apikey" || compact === "apitoken" || compact === "token")) {
    return false;
  }

  return sensitiveResponseKeyCompacts.has(compact) || (compact.endsWith("secret") && compact !== "secretref");
}

function maskSecretRefsRecord(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([secretKey, secretValue]) => [
      secretKey,
      {
        configured: Boolean(secretValue)
      }
    ])
  );
}

function readProviderConfigString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function hasSecretRef(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0;
}

function addRequiredFieldError(errors: ProviderConfigFieldError[], path: string, message: string) {
  errors.push({ path, message });
}

export function validateProviderConfigRequiredFields(input: {
  kind: string;
  config?: Record<string, unknown>;
  secretRefs?: Record<string, unknown>;
}): ProviderConfigFieldError[] {
  const errors: ProviderConfigFieldError[] = [];
  const config = input.config ?? {};
  const mode = readProviderConfigString(config, ["providerKind", "provider", "kind"])?.toLowerCase() ?? "";
  const kind = input.kind.toLowerCase();
  const endpoint = readProviderConfigString(config, ["endpoint", "baseUrl"]);
  const model = readProviderConfigString(config, ["modelOrBucket", "model"]);

  if (kind === "llm") {
    if (mode === "openai-responses" || mode === "openai-compatible" || mode === "http") {
      if (!endpoint) {
        addRequiredFieldError(errors, "config.endpoint", "Base URL 不能为空");
      }
      if (!model) {
        addRequiredFieldError(errors, "config.modelOrBucket", "模型名称不能为空");
      }
      if (!hasSecretRef(input.secretRefs, "apiKey")) {
        addRequiredFieldError(errors, "secretRefs.apiKey", "API Key 引用名不能为空");
      }
    } else if (mode === "langchain" && !model) {
      addRequiredFieldError(errors, "config.modelOrBucket", "模型名称不能为空");
    }
  }

  if (kind === "ocr") {
    if (mode === "http" || mode === "openai-compatible") {
      if (!endpoint) {
        addRequiredFieldError(errors, "config.endpoint", mode === "openai-compatible" ? "Base URL 不能为空" : "OCR Endpoint 不能为空");
      }
      if (mode === "openai-compatible" && !model) {
        addRequiredFieldError(errors, "config.modelOrBucket", "模型名称不能为空");
      }
      if (mode === "openai-compatible" && !hasSecretRef(input.secretRefs, "apiKey")) {
        addRequiredFieldError(errors, "secretRefs.apiKey", "API Key 引用名不能为空");
      }
    }
  }

  if (kind === "storage") {
    if (!endpoint) {
      addRequiredFieldError(errors, "config.endpoint", "存储地址不能为空");
    }
    if (!model) {
      addRequiredFieldError(errors, "config.modelOrBucket", "Bucket / Prefix 不能为空");
    }
  }

  if (kind === "lims") {
    if (!endpoint) {
      addRequiredFieldError(errors, "config.endpoint", "LIMS Endpoint 不能为空");
    }
    if (!hasSecretRef(input.secretRefs, "apiToken")) {
      addRequiredFieldError(errors, "secretRefs.apiToken", "API Token 引用名不能为空");
    }
  }

  return errors;
}

export function redactSensitiveRouteValue(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveRouteValue(item, path));
  }

  if (typeof value === "string") {
    return value.replace(bearerValuePattern, "[redacted]");
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "secretRefs" && isRecord(item)) {
      output.secretRefs = maskSecretRefsRecord(item);
      continue;
    }

    if (isSensitiveResponseKey(key, path)) {
      output[key] = { ...redactedRouteMarker };
      continue;
    }

    output[key] = redactSensitiveRouteValue(item, [...path, key]);
  }

  return output;
}

export function isRouteResponseObject(value: unknown): value is ApiRouteResponseObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function assertRouteResponseObject(value: unknown, code: string): ApiRouteResponseObject {
  if (!isRouteResponseObject(value)) {
    throw Object.assign(new Error(code), {
      code,
      statusCode: 500
    });
  }

  return value;
}

export function assertRouteResponseObjectList(values: unknown[], code: string): ApiRouteResponseObject[] {
  return values.map((value) => assertRouteResponseObject(value, code));
}

export const fileUploadRouteInputSchema = z
  .object({
    originalName: nonEmptyString,
    mimeType: optionalNonEmptyString,
    byteSize: z.number().int().nonnegative().optional(),
    checksumSha256: optionalNonEmptyString,
    contentBase64: optionalNonEmptyString,
    metadata: jsonObjectSchema.optional()
  })
  .strip();

const recognitionDocumentRouteInputSchema = z
  .object({
    documentId: nonEmptyString,
    fileName: optionalNonEmptyString,
    mimeType: optionalNonEmptyString,
    storageKey: optionalNonEmptyString
  })
  .strip();

const recognitionProviderConfigRouteInputSchema = z
  .object({
    ocrProviderKey: optionalNonEmptyString,
    providerKey: optionalNonEmptyString
  })
  .strip();

export const recognitionJobRouteInputSchema = z
  .object({
    schemaKey: optionalNonEmptyString,
    schemaVersionId: optionalNonEmptyString,
    sourceFileId: optionalNonEmptyString,
    document: recognitionDocumentRouteInputSchema.optional(),
    options: jsonObjectSchema.optional(),
    providerConfig: recognitionProviderConfigRouteInputSchema.optional()
  })
  .strip();

export const feedbackRouteInputSchema = z
  .object({
    jobId: optionalNonEmptyString,
    sampleId: optionalNonEmptyString,
    source: optionalNonEmptyString,
    fieldKey: optionalNonEmptyString,
    field: optionalNonEmptyString,
    originalValue: z.unknown().optional(),
    expected: z.unknown().optional(),
    actual: z.unknown().optional(),
    correctedValue: z.unknown().optional(),
    decision: optionalNonEmptyString,
    label: optionalNonEmptyString,
    status: optionalNonEmptyString,
    reason: optionalNonEmptyString,
    reviewer: optionalNonEmptyString,
    confidence: z.number().finite().optional(),
    evidenceId: optionalNonEmptyString,
    evidenceQuote: optionalNonEmptyString,
    payload: jsonObjectSchema.optional(),
    schemaVersionId: optionalNonEmptyString
  })
  .strip()
  .superRefine((value, context) => {
    if (!value.jobId && !value.sampleId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "jobId or sampleId is required",
        path: ["jobId"]
      });
    }

    if (!value.fieldKey && !value.field) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fieldKey or field is required",
        path: ["fieldKey"]
      });
    }
  });

const evaluationGroundTruthFieldRouteInputSchema = z.record(z.unknown());

export const evaluationSampleRouteInputSchema = z
  .object({
    externalId: optionalNonEmptyString,
    fileId: optionalNonEmptyString,
    recognitionJobId: optionalNonEmptyString,
    metadata: jsonObjectSchema.optional(),
    input: jsonObjectSchema.optional(),
    groundTruth: z.union([jsonObjectSchema, z.array(evaluationGroundTruthFieldRouteInputSchema)]).optional()
  })
  .strip();

export const importEvaluationSamplesRouteInputSchema = z.object({
  samples: z.array(evaluationSampleRouteInputSchema).min(1)
});

export const schemaDraftRouteInputSchema = z
  .object({
    schemaKey: nonEmptyString,
    displayName: nonEmptyString,
    definition: jsonObjectSchema
  })
  .strip();

export const updateSchemaDraftRouteInputSchema = z
  .object({
    definition: jsonObjectSchema
  })
  .strip();

export const publishSchemaDraftRouteInputSchema = z
  .object({
    changelog: z.string().optional()
  })
  .strip();

export const compareSchemaVersionsQuerySchema = z
  .object({
    left: nonEmptyString,
    right: nonEmptyString
  })
  .strip();

export const providerConfigRouteInputSchema = z
  .object({
    kind: nonEmptyString,
    displayName: nonEmptyString,
    enabled: z.boolean().optional().default(false),
    isDefault: z.boolean().optional().default(false),
    config: jsonObjectSchema.optional().default({}),
    secretRefs: secretRefsRouteInputSchema.optional()
  })
  .strip()
  .superRefine((value, context) => {
    const plaintextSecretPath = findPlaintextSecretConfigPath(value.config);
    if (plaintextSecretPath) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provider config must reference secrets through secretRefs",
        path: ["config", ...plaintextSecretPath]
      });
    }
  });

export const auditListQuerySchema = z
  .object({
    actorUserId: optionalNonEmptyString,
    actorApiTokenId: optionalNonEmptyString,
    action: optionalNonEmptyString,
    objectType: optionalNonEmptyString,
    page: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === "") return undefined;
        const parsed = parsePositiveIntegerQueryValue(value);
        return parsed ?? undefined;
      }),
    pageSize: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === "") return undefined;
        const parsed = parsePositiveIntegerQueryValue(value);
        return parsed ? Math.min(parsed, 100) : undefined;
      }),
    take: z
      .union([z.string(), z.number()])
      .optional()
      .refine(
        (value) => {
          if (value === undefined || value === "") {
            return true;
          }

          return parsePositiveIntegerQueryValue(value) !== null;
        },
        {
          message: "take must be a positive integer"
        }
      )
      .transform((value) => {
        if (value === undefined || value === "") {
          return undefined;
        }

        const parsed = parsePositiveIntegerQueryValue(value);
        if (parsed === null) {
          return undefined;
        }

        return Math.min(parsed, 100);
      })
  })
  .strip();

export const confirmedWritebackRouteInputSchema = z
  .object({
    jobId: nonEmptyString,
    confirmed: z.literal(true),
    idempotencyKey: optionalNonEmptyString
  })
  .strip();

export type CreateFileUploadRouteInput = z.infer<typeof fileUploadRouteInputSchema>;
export type CreateRecognitionJobRouteInput = z.infer<typeof recognitionJobRouteInputSchema>;
export type CreateFeedbackRouteInput = z.infer<typeof feedbackRouteInputSchema>;
export type EvaluationSampleRouteInput = z.infer<typeof evaluationSampleRouteInputSchema>;
export type ImportEvaluationSamplesRouteBody = z.infer<typeof importEvaluationSamplesRouteInputSchema>;
export type CreateSchemaDraftRouteInput = z.infer<typeof schemaDraftRouteInputSchema>;
export type UpdateSchemaDraftRouteInput = z.infer<typeof updateSchemaDraftRouteInputSchema>;
export type PublishSchemaDraftRouteInput = z.infer<typeof publishSchemaDraftRouteInputSchema>;
export type CompareSchemaVersionsRouteQuery = z.infer<typeof compareSchemaVersionsQuerySchema>;
export type ProviderConfigRouteInput = z.infer<typeof providerConfigRouteInputSchema>;
export type AuditListRouteQuery = z.infer<typeof auditListQuerySchema>;
export type ConfirmedWritebackRouteInput = z.infer<typeof confirmedWritebackRouteInputSchema>;

// ─── Webhook subscription DTOs ───────────────────────────────────────────────

export const createWebhookSubscriptionRouteInputSchema = z
  .object({
    callbackUrl: nonEmptyString,
    schemaKey: optionalNonEmptyString,
    events: z.array(nonEmptyString).optional()
  })
  .strip();

export type CreateWebhookSubscriptionRouteInput = z.infer<typeof createWebhookSubscriptionRouteInputSchema>;
