import { readFile } from "node:fs/promises";
import { isCliEntrypoint } from "./production-smoke";

export type EvaluationManifestSourceType = "synthetic" | "real" | "real_deidentified";

export interface EvaluationEvidenceManifest {
  text: string;
  pageNumber?: number;
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
  evidenceRole?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface EvaluationGroundTruthManifest {
  fieldKey: string;
  label?: string;
  value: unknown;
  normalizedValue?: unknown;
  matchPolicy?: string;
  evidence: EvaluationEvidenceManifest[];
  needsReview?: boolean;
  reviewReason?: string;
  notes?: string;
}

export interface EvaluationSampleManifest {
  sampleId: string;
  documentRef: string;
  documentType: string;
  sourceType?: EvaluationManifestSourceType;
  deidentified: boolean;
  caseCategory?: string;
  qualityTags?: string[];
  language?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  groundTruth: EvaluationGroundTruthManifest[];
}

export interface EvaluationDatasetManifest {
  datasetId: string;
  name: string;
  schemaId: string;
  schemaVersion: string;
  sourceType: EvaluationManifestSourceType;
  deidentified: boolean;
  storagePolicy: "git_safe" | "local_controlled" | "intranet_controlled" | string;
  createdBy: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  deidentification?: {
    proofId?: string;
    method?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    checklist?: Record<string, boolean>;
  };
  samples: EvaluationSampleManifest[];
}

export interface EvaluationManifestIssue {
  code: string;
  path: string;
  message: string;
}

export interface EvaluationManifestValidationResult {
  valid: boolean;
  issues: EvaluationManifestIssue[];
}

export interface EvaluationImportPayload {
  dataset: {
    key: string;
    displayName: string;
    deidentified: boolean;
    metadata: Record<string, unknown>;
  };
  samples: Array<{
    externalId: string;
    input: Record<string, unknown>;
    metadata: Record<string, unknown>;
    groundTruth: EvaluationGroundTruthManifest[];
  }>;
}

export interface ImportEvaluationManifestInput {
  baseUrl: string;
  accessToken: string;
  manifest: EvaluationDatasetManifest;
}

export interface ImportEvaluationManifestResult {
  datasetId: string;
  sampleCount: number;
}

export type EvaluationManifestCliConfig =
  | {
      mode: "validate";
      manifestPath: string;
    }
  | {
      mode: "import";
      manifestPath: string;
      baseUrl: string;
      accessToken: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function addIssue(issues: EvaluationManifestIssue[], code: string, path: string, message: string) {
  issues.push({
    code,
    path,
    message
  });
}

function hasDeidentificationProof(manifest: EvaluationDatasetManifest) {
  // 与 API service 保持一致：外部 proofId 或内部 reviewedBy + reviewedAt 都可以作为可审计脱敏证明。
  return (
    hasText(manifest.deidentification?.proofId) ||
    (hasText(manifest.reviewedBy) && hasText(manifest.reviewedAt)) ||
    (hasText(manifest.deidentification?.reviewedBy) && hasText(manifest.deidentification?.reviewedAt))
  );
}

function collectStrings(value: unknown, path: string, output: Array<{ path: string; value: string }>) {
  if (typeof value === "string") {
    output.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, output));
    return;
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${path}.${key}`, output);
    }
  }
}

function containsPotentialPhi(value: string) {
  const compact = value.replace(/\s+/g, "");

  // 本地预检只做高精度风险扫描，避免误报过多；真正的脱敏责任仍由人工复核和受控导入流程承担。
  const riskPatterns = [
    /1[3-9]\d{9}/,
    /\d{17}[\dXx]/,
    /(电话|手机号|联系方式|身份证|证件号|住址|家庭住址|住院号|门诊号|条码号)[:：]?[^\s，。；;]{4,}/
  ];

  return riskPatterns.some((pattern) => pattern.test(compact));
}

function validateRequiredDatasetFields(manifest: EvaluationDatasetManifest, issues: EvaluationManifestIssue[]) {
  const requiredStringFields: Array<[keyof EvaluationDatasetManifest, string]> = [
    ["datasetId", "$.datasetId"],
    ["name", "$.name"],
    ["schemaId", "$.schemaId"],
    ["schemaVersion", "$.schemaVersion"],
    ["sourceType", "$.sourceType"],
    ["storagePolicy", "$.storagePolicy"],
    ["createdBy", "$.createdBy"],
    ["createdAt", "$.createdAt"]
  ];

  for (const [key, path] of requiredStringFields) {
    if (!hasText(manifest[key])) {
      addIssue(issues, "REQUIRED_FIELD_MISSING", path, `${path} 必须填写。`);
    }
  }

  if (manifest.deidentified !== true) {
    addIssue(issues, "DATASET_NOT_DEIDENTIFIED", "$.deidentified", "评估数据集必须标记 deidentified=true。");
  }

  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    addIssue(issues, "SAMPLES_REQUIRED", "$.samples", "manifest 至少需要一个样本。");
  }
}

function validateSourceType(manifest: EvaluationDatasetManifest, issues: EvaluationManifestIssue[]) {
  if (manifest.sourceType === "real") {
    addIssue(issues, "REAL_SOURCE_TYPE_FORBIDDEN", "$.sourceType", "原始真实病历不得进入评估 manifest。");
  }

  if (manifest.sourceType === "real_deidentified" && !hasDeidentificationProof(manifest)) {
    addIssue(
      issues,
      "DEIDENTIFICATION_PROOF_REQUIRED",
      "$.deidentification",
      "真实脱敏评估集必须包含 proofId，或 reviewedBy + reviewedAt。"
    );
  }
}

function validateSamples(manifest: EvaluationDatasetManifest, issues: EvaluationManifestIssue[]) {
  manifest.samples?.forEach((sample, sampleIndex) => {
    const samplePath = `$.samples[${sampleIndex}]`;
    const sampleSourceType = sample.sourceType ?? manifest.sourceType;

    if (!hasText(sample.sampleId)) {
      addIssue(issues, "REQUIRED_FIELD_MISSING", `${samplePath}.sampleId`, "样本必须填写 sampleId。");
    }

    if (!hasText(sample.documentRef)) {
      addIssue(issues, "REQUIRED_FIELD_MISSING", `${samplePath}.documentRef`, "样本必须填写 documentRef。");
    }

    if (!hasText(sample.documentType)) {
      addIssue(issues, "REQUIRED_FIELD_MISSING", `${samplePath}.documentType`, "样本必须填写 documentType。");
    }

    if (sampleSourceType === "real") {
      addIssue(issues, "REAL_SOURCE_TYPE_FORBIDDEN", `${samplePath}.sourceType`, "样本不能标记为 real。");
    }

    if ((sampleSourceType === "real_deidentified" || manifest.sourceType === "real_deidentified") && sample.deidentified !== true) {
      addIssue(issues, "SAMPLE_NOT_DEIDENTIFIED", `${samplePath}.deidentified`, "真实脱敏样本必须标记 deidentified=true。");
    }

    if (!Array.isArray(sample.groundTruth) || sample.groundTruth.length === 0) {
      addIssue(issues, "GROUND_TRUTH_REQUIRED", `${samplePath}.groundTruth`, "样本必须包含字段级 groundTruth。");
    }

    sample.groundTruth?.forEach((field, fieldIndex) => {
      const fieldPath = `${samplePath}.groundTruth[${fieldIndex}]`;
      if (!hasText(field.fieldKey)) {
        addIssue(issues, "REQUIRED_FIELD_MISSING", `${fieldPath}.fieldKey`, "groundTruth 必须填写 fieldKey。");
      }

      if (!Array.isArray(field.evidence) || field.evidence.length === 0) {
        addIssue(issues, "EVIDENCE_REQUIRED", `${fieldPath}.evidence`, "groundTruth 必须包含 evidence。");
      }
    });
  });
}

function validatePhiText(manifest: EvaluationDatasetManifest, issues: EvaluationManifestIssue[]) {
  const strings: Array<{ path: string; value: string }> = [];
  collectStrings(manifest, "$", strings);

  for (const item of strings) {
    if (containsPotentialPhi(item.value)) {
      addIssue(issues, "POTENTIAL_PHI", item.path, "manifest 文本中疑似包含 PHI/PII，请脱敏后再导入。");
    }
  }
}

export function validateEvaluationManifest(manifest: unknown): EvaluationManifestValidationResult {
  const issues: EvaluationManifestIssue[] = [];

  if (!isRecord(manifest)) {
    return {
      valid: false,
      issues: [
        {
          code: "MANIFEST_NOT_OBJECT",
          path: "$",
          message: "manifest 必须是 JSON object。"
        }
      ]
    };
  }

  const datasetManifest = manifest as unknown as EvaluationDatasetManifest;
  validateRequiredDatasetFields(datasetManifest, issues);
  validateSourceType(datasetManifest, issues);
  validateSamples(datasetManifest, issues);
  validatePhiText(datasetManifest, issues);

  return {
    valid: issues.length === 0,
    issues
  };
}

export function buildEvaluationImportPayload(manifest: EvaluationDatasetManifest): EvaluationImportPayload {
  const validation = validateEvaluationManifest(manifest);
  if (!validation.valid) {
    throw Object.assign(new Error("EVALUATION_MANIFEST_INVALID"), {
      code: "EVALUATION_MANIFEST_INVALID",
      issues: validation.issues
    });
  }

  const deidentification = {
    ...manifest.deidentification,
    ...(hasText(manifest.deidentification?.proofId) ? { proofId: manifest.deidentification?.proofId } : {})
  };

  return {
    dataset: {
      key: manifest.datasetId,
      displayName: manifest.name,
      deidentified: true,
      metadata: {
        sourceType: manifest.sourceType,
        schemaId: manifest.schemaId,
        schemaVersion: manifest.schemaVersion,
        storagePolicy: manifest.storagePolicy,
        createdBy: manifest.createdBy,
        createdAt: manifest.createdAt,
        reviewedBy: manifest.reviewedBy,
        reviewedAt: manifest.reviewedAt,
        deidentification
      }
    },
    samples: manifest.samples.map((sample) => {
      const sourceType = sample.sourceType ?? manifest.sourceType;

      return {
        externalId: sample.sampleId,
        input: {
          documentId: sample.sampleId,
          documentRef: sample.documentRef,
          documentType: sample.documentType,
          sourceType,
          storagePolicy: manifest.storagePolicy
        },
        metadata: {
          sourceType,
          deidentified: true,
          deidentification,
          documentRef: sample.documentRef,
          documentType: sample.documentType,
          caseCategory: sample.caseCategory,
          qualityTags: sample.qualityTags ?? [],
          language: sample.language,
          needsReview: sample.needsReview,
          reviewReasons: sample.reviewReasons ?? [],
          datasetId: manifest.datasetId
        },
        groundTruth: sample.groundTruth
      };
    })
  };
}

export async function readEvaluationManifest(path: string): Promise<EvaluationDatasetManifest> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as EvaluationDatasetManifest;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  return text.length > 0 ? (JSON.parse(text) as unknown) : {};
}

async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit, stepName: string) {
  const response = await fetchImpl(url, init);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`${stepName} 返回 HTTP ${response.status}`);
  }

  return payload;
}

function createAuthHeaders(accessToken: string) {
  return new Headers({
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json"
  });
}

function readDatasetId(payload: unknown, fallback: string) {
  const dataset = isRecord(payload) ? payload.dataset : undefined;
  const id = isRecord(dataset) ? dataset.id : undefined;

  return hasText(id) ? id : fallback;
}

function readSampleCount(payload: unknown, fallback: number) {
  const samples = isRecord(payload) ? payload.samples : undefined;
  return Array.isArray(samples) ? samples.length : fallback;
}

function requireEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  if (!hasText(value)) {
    throw new Error(`${key} 未配置。`);
  }

  return value;
}

export function buildEvaluationManifestCliConfig(
  args: string[],
  env: Record<string, string | undefined> = process.env
): EvaluationManifestCliConfig {
  const importMode = args.includes("--import");
  const manifestPath = args.find((arg) => arg !== "--import");

  if (!hasText(manifestPath)) {
    throw new Error("请传入评估 manifest JSON 路径。");
  }

  if (!importMode) {
    return {
      mode: "validate",
      manifestPath
    };
  }

  return {
    mode: "import",
    manifestPath,
    baseUrl: requireEnvValue(env, "EVALUATION_API_BASE_URL").replace(/\/$/, ""),
    accessToken: requireEnvValue(env, "EVALUATION_API_ACCESS_TOKEN")
  };
}

export async function importEvaluationManifest(
  input: ImportEvaluationManifestInput,
  fetchImpl: typeof fetch = fetch
): Promise<ImportEvaluationManifestResult> {
  const payload = buildEvaluationImportPayload(input.manifest);
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  const datasetResponse = await requestJson(
    fetchImpl,
    `${baseUrl}/evaluations/datasets`,
    {
      method: "POST",
      headers: createAuthHeaders(input.accessToken),
      body: JSON.stringify(payload.dataset)
    },
    "evaluation-dataset-create"
  );
  const datasetId = readDatasetId(datasetResponse, payload.dataset.key);

  const samplesResponse = await requestJson(
    fetchImpl,
    `${baseUrl}/evaluations/datasets/${encodeURIComponent(datasetId)}/samples`,
    {
      method: "POST",
      headers: createAuthHeaders(input.accessToken),
      body: JSON.stringify({
        samples: payload.samples
      })
    },
    "evaluation-samples-import"
  );

  return {
    datasetId,
    sampleCount: readSampleCount(samplesResponse, payload.samples.length)
  };
}

async function main() {
  const config = buildEvaluationManifestCliConfig(process.argv.slice(2));
  const manifest = await readEvaluationManifest(config.manifestPath);
  const validation = validateEvaluationManifest(manifest);

  if (!validation.valid) {
    for (const issue of validation.issues) {
      console.error(`${issue.code} ${issue.path} ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (config.mode === "import") {
    const result = await importEvaluationManifest({
      baseUrl: config.baseUrl,
      accessToken: config.accessToken,
      manifest
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          imported: true,
          datasetId: result.datasetId,
          sampleCount: result.sampleCount
        },
        null,
        2
      )
    );
    return;
  }

  const payload = buildEvaluationImportPayload(manifest);
  console.log(
    JSON.stringify(
      {
        ok: true,
        datasetKey: payload.dataset.key,
        sampleCount: payload.samples.length
      },
      null,
      2
    )
  );
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
