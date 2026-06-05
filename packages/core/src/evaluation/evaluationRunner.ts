import { calculateFieldMetrics, type FieldEvaluationMetrics, type FieldEvaluationSample } from "./metrics";

export type EvaluationDatasetSensitivity = "synthetic" | "real" | "real_deidentified";

export interface EvaluationDatasetSample {
  id: string;
  input: unknown;
  groundTruth: EvaluationGroundTruth;
  sensitivity?: EvaluationDatasetSensitivity | undefined;
  deidentified?: boolean | undefined;
}

export interface EvaluationDataset {
  id: string;
  samples: readonly EvaluationDatasetSample[];
  sensitivity?: EvaluationDatasetSensitivity | undefined;
  deidentified?: boolean | undefined;
}

export type EvaluationGroundTruth = Record<string, EvaluationGroundTruthField>;

export interface EvaluationGroundTruthField {
  value?: FieldEvaluationSample["groundTruthValue"] | undefined;
  normalizedValue?: FieldEvaluationSample["normalizedGroundTruthValue"] | undefined;
  expectedNeedsReview?: boolean | undefined;
}

export type EvaluationPrediction = Record<string, EvaluationPredictionField>;

export interface EvaluationPredictionField {
  value?: FieldEvaluationSample["predictedValue"] | undefined;
  normalizedValue?: FieldEvaluationSample["normalizedPredictedValue"] | undefined;
  evidence?: readonly string[] | undefined;
  needsReview?: boolean | undefined;
}

export interface RecognitionRunnerInput<TSchemaConfig = unknown, TProviderConfig = unknown> {
  sample: EvaluationDatasetSample;
  schemaConfig: TSchemaConfig;
  providerConfig: TProviderConfig;
}

export interface RecognitionRunnerOutput {
  fields: EvaluationPrediction;
  warnings?: readonly string[] | undefined;
}

export type RecognitionRunner<TSchemaConfig = unknown, TProviderConfig = unknown> = (
  input: RecognitionRunnerInput<TSchemaConfig, TProviderConfig>
) => Promise<RecognitionRunnerOutput> | RecognitionRunnerOutput;

export interface RunEvaluationInput<TSchemaConfig = unknown, TProviderConfig = unknown> {
  dataset: EvaluationDataset;
  schemaConfig: TSchemaConfig;
  providerConfig: TProviderConfig;
  recognition: RecognitionRunner<TSchemaConfig, TProviderConfig>;
  now?: (() => number) | undefined;
}

export interface EvaluationRunSummary {
  datasetId: string;
  totalSamples: number;
  completedSamples: number;
  failedSamples: number;
  totalFieldSamples: number;
  startedAtMs: number;
  finishedAtMs: number;
  durationMs: number;
}

export interface EvaluationSampleResult {
  sampleId: string;
  status: "completed" | "failed";
  latencyMs: number;
  fieldResults: FieldEvaluationSample[];
  warnings: string[];
  error?: string | undefined;
}

export interface EvaluationRunnerMessage {
  sampleId?: string | undefined;
  message: string;
}

export interface EvaluationRunResult {
  summary: EvaluationRunSummary;
  metrics: FieldEvaluationMetrics;
  sampleResults: EvaluationSampleResult[];
  warnings: EvaluationRunnerMessage[];
  errors: EvaluationRunnerMessage[];
}

export async function runEvaluation<TSchemaConfig = unknown, TProviderConfig = unknown>(
  input: RunEvaluationInput<TSchemaConfig, TProviderConfig>
): Promise<EvaluationRunResult> {
  assertDatasetIsSafeForEvaluation(input.dataset);

  const now = input.now ?? Date.now;
  const startedAtMs = now();
  const sampleResults: EvaluationSampleResult[] = [];
  const warnings: EvaluationRunnerMessage[] = [];
  const errors: EvaluationRunnerMessage[] = [];

  for (const sample of input.dataset.samples) {
    const sampleStartedAtMs = now();

    try {
      const recognitionOutput = await input.recognition({
        sample,
        schemaConfig: input.schemaConfig,
        providerConfig: input.providerConfig
      });
      const sampleFinishedAtMs = now();
      const latencyMs = sampleFinishedAtMs - sampleStartedAtMs;
      const fieldResults = buildFieldResults(sample.groundTruth, recognitionOutput.fields, latencyMs);
      const sampleWarnings = [...(recognitionOutput.warnings ?? [])];

      for (const warning of sampleWarnings) {
        warnings.push({
          sampleId: sample.id,
          message: warning
        });
      }

      sampleResults.push({
        sampleId: sample.id,
        status: "completed",
        latencyMs,
        fieldResults,
        warnings: sampleWarnings
      });
    } catch (error) {
      const sampleFinishedAtMs = now();
      const latencyMs = sampleFinishedAtMs - sampleStartedAtMs;
      const message = errorToMessage(error);

      errors.push({
        sampleId: sample.id,
        message
      });
      sampleResults.push({
        sampleId: sample.id,
        status: "failed",
        latencyMs,
        fieldResults: [],
        warnings: [],
        error: message
      });
    }
  }

  const finishedAtMs = now();
  const allFieldResults = sampleResults.flatMap((sampleResult) => sampleResult.fieldResults);

  return {
    summary: {
      datasetId: input.dataset.id,
      totalSamples: input.dataset.samples.length,
      completedSamples: sampleResults.filter((sampleResult) => sampleResult.status === "completed").length,
      failedSamples: sampleResults.filter((sampleResult) => sampleResult.status === "failed").length,
      totalFieldSamples: allFieldResults.length,
      startedAtMs,
      finishedAtMs,
      durationMs: finishedAtMs - startedAtMs
    },
    metrics: calculateFieldMetrics(allFieldResults),
    sampleResults,
    warnings,
    errors
  };
}

function buildFieldResults(
  groundTruth: EvaluationGroundTruth,
  prediction: EvaluationPrediction,
  latencyMs: number
): FieldEvaluationSample[] {
  return Object.entries(groundTruth).map(([fieldKey, expectedField]) => {
    const predictedField = prediction[fieldKey];

    // 指标层按字段样本聚合；这里保留 ground truth 的每个字段，缺预测字段交给 metrics 按错误处理。
    return {
      fieldKey,
      groundTruthValue: expectedField.value,
      predictedValue: predictedField?.value,
      normalizedGroundTruthValue: expectedField.normalizedValue,
      normalizedPredictedValue: predictedField?.normalizedValue,
      evidence: predictedField?.evidence,
      expectedNeedsReview: expectedField.expectedNeedsReview,
      actualNeedsReview: predictedField?.needsReview,
      latencyMs
    };
  });
}

function assertDatasetIsSafeForEvaluation(dataset: EvaluationDataset): void {
  assertSensitivityIsDeidentified({
    owner: `数据集 ${dataset.id}`,
    sensitivity: dataset.sensitivity,
    deidentified: dataset.deidentified
  });

  for (const sample of dataset.samples) {
    assertSensitivityIsDeidentified({
      owner: `样本 ${sample.id}`,
      sensitivity: sample.sensitivity,
      deidentified: sample.deidentified
    });
  }
}

function assertSensitivityIsDeidentified(input: {
  owner: string;
  sensitivity?: EvaluationDatasetSensitivity | undefined;
  deidentified?: boolean | undefined;
}): void {
  if ((input.sensitivity === "real" || input.sensitivity === "real_deidentified") && input.deidentified !== true) {
    throw new Error(`${input.owner} 标记为 ${input.sensitivity}，但 deidentified 不是 true，评估运行器拒绝处理未脱敏真实样本`);
  }
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "识别执行失败";
}
