export type EvaluationComparableValue =
  | string
  | number
  | boolean
  | null
  | readonly EvaluationComparableValue[]
  | { readonly [key: string]: EvaluationComparableValue };

export interface FieldEvaluationSample {
  /**
   * 字段标识允许缺失，用于表达上游样本里字段 key 丢失的异常情况。
   * 聚合指标不会因为 key 缺失而跳过该样本，避免把坏样本静默排除。
   */
  fieldKey?: string | undefined;
  groundTruthValue?: EvaluationComparableValue | undefined;
  predictedValue?: EvaluationComparableValue | undefined;
  normalizedGroundTruthValue?: EvaluationComparableValue | undefined;
  normalizedPredictedValue?: EvaluationComparableValue | undefined;
  evidence?: readonly string[] | undefined;
  expectedNeedsReview?: boolean | undefined;
  actualNeedsReview?: boolean | undefined;
  latencyMs?: number | undefined;
}

export interface FieldEvaluationMetrics {
  sampleCount: number;
  fieldAccuracy: number | null;
  normalizedAccuracy: number | null;
  evidenceCoverage: number | null;
  needsReviewRecall: number | null;
  averageLatencyMs: number | null;
}

export function calculateFieldMetrics(samples: readonly FieldEvaluationSample[]): FieldEvaluationMetrics {
  const sampleCount = samples.length;

  return {
    sampleCount,
    fieldAccuracy: calculateFieldAccuracy(samples),
    normalizedAccuracy: calculateNormalizedAccuracy(samples),
    evidenceCoverage: calculateEvidenceCoverage(samples),
    needsReviewRecall: calculateNeedsReviewRecall(samples),
    averageLatencyMs: calculateAverageLatencyMs(samples)
  };
}

function calculateFieldAccuracy(samples: readonly FieldEvaluationSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  const correctCount = samples.filter((sample) =>
    valuesEqual(sample.groundTruthValue ?? null, sample.predictedValue ?? undefined)
  ).length;

  // 字段级准确率以全部字段样本为分母；缺预测值按错误处理，避免漏抽取被跳过。
  return correctCount / samples.length;
}

function calculateNormalizedAccuracy(samples: readonly FieldEvaluationSample[]): number | null {
  const comparableSamples = samples.filter(
    (sample) =>
      sample.normalizedGroundTruthValue !== undefined && sample.normalizedPredictedValue !== undefined
  );

  if (comparableSamples.length === 0) {
    return null;
  }

  const correctCount = comparableSamples.filter((sample) =>
    valuesEqual(sample.normalizedGroundTruthValue, sample.normalizedPredictedValue)
  ).length;

  // 归一化准确率只统计两侧都提供归一化值的样本；未归一化字段没有可比较分母。
  return correctCount / comparableSamples.length;
}

function calculateEvidenceCoverage(samples: readonly FieldEvaluationSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  const coveredCount = samples.filter((sample) => (sample.evidence?.length ?? 0) > 0).length;

  // evidence 缺失、undefined 或空数组都视为无证据覆盖，但仍保留在字段样本分母中。
  return coveredCount / samples.length;
}

function calculateNeedsReviewRecall(samples: readonly FieldEvaluationSample[]): number | null {
  const expectedReviewSamples = samples.filter((sample) => sample.expectedNeedsReview === true);

  if (expectedReviewSamples.length === 0) {
    return null;
  }

  const recalledCount = expectedReviewSamples.filter((sample) => sample.actualNeedsReview === true).length;

  // 复核召回率 = 实际打上复核的期望复核样本 / 所有期望复核样本。
  // 当没有期望复核样本时返回 null，而不是 0，表示该批数据没有召回率分母。
  return recalledCount / expectedReviewSamples.length;
}

function calculateAverageLatencyMs(samples: readonly FieldEvaluationSample[]): number | null {
  const validLatencies = samples
    .map((sample) => sample.latencyMs)
    .filter((latencyMs): latencyMs is number => typeof latencyMs === "number" && Number.isFinite(latencyMs));

  if (validLatencies.length === 0) {
    return null;
  }

  // 平均延迟只统计真实提供且为有限数字的 latencyMs；缺失值不参与分母。
  return validLatencies.reduce((total, latencyMs) => total + latencyMs, 0) / validLatencies.length;
}

function valuesEqual(left: EvaluationComparableValue | undefined, right: EvaluationComparableValue | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return arraysEqual(left, right);
  }

  if (isPlainComparableObject(left) && isPlainComparableObject(right)) {
    return objectsEqual(left, right);
  }

  return false;
}

function arraysEqual(left: readonly EvaluationComparableValue[], right: readonly EvaluationComparableValue[]): boolean {
  return left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]));
}

function objectsEqual(
  left: { readonly [key: string]: EvaluationComparableValue },
  right: { readonly [key: string]: EvaluationComparableValue }
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  return arraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => valuesEqual(left[key], right[key]));
}

function isPlainComparableObject(
  value: EvaluationComparableValue
): value is { readonly [key: string]: EvaluationComparableValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
