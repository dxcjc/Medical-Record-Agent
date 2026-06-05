export interface NormalizedField<T> {
  originalText: string;
  normalizedValue: T;
  confidence: number;
  notes: string[];
}

export interface SmokingNormalizedValue {
  status: "never" | "current" | "former" | "unknown";
  years?: number;
  cigarettesPerDay?: number;
  quitYears?: number;
}

function extractFirstNumber(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  const value = match?.[1];
  return value === undefined ? undefined : Number(value);
}

export function normalizeSmokingHistory(text: string): NormalizedField<SmokingNormalizedValue> {
  const originalText = text;
  const trimmedText = text.trim();
  const notes: string[] = [];

  const hasSmokingEvidence = /吸烟|抽烟/.test(trimmedText);
  const hasQuitEvidence = /戒烟|已戒/.test(trimmedText);
  const hasNeverEvidence = /否认吸烟|无吸烟|不吸烟|从不吸烟/.test(trimmedText);
  const hasLooseNegation = /否认/.test(trimmedText);
  const hasConflict = (hasNeverEvidence && (hasSmokingEvidence || hasQuitEvidence)) || (hasLooseNegation && hasSmokingEvidence);

  let status: SmokingNormalizedValue["status"] = "unknown";
  if (hasConflict) {
    status = "unknown";
    notes.push("吸烟状态存在冲突，降低置信度并保留原文");
  } else if (hasNeverEvidence) {
    status = "never";
    notes.push("命中否定吸烟表达");
  } else if (hasQuitEvidence) {
    status = "former";
    notes.push("命中戒烟表达");
  } else if (hasSmokingEvidence) {
    status = "current";
    notes.push("命中当前或既往吸烟表达");
  }

  const years = extractFirstNumber(trimmedText, /吸烟\s*(\d+)\s*年/);
  const cigarettesPerDay = extractFirstNumber(trimmedText, /(?:每天|每日|日均|约)\s*(\d+)\s*支/);
  const quitYears = extractFirstNumber(trimmedText, /戒烟\s*(\d+)\s*年/);

  const normalizedValue: SmokingNormalizedValue = { status };
  // 只在识别到对应数值时追加归一化字段，避免用空值覆盖原始证据文本。
  if (years !== undefined) {
    normalizedValue.years = years;
  }
  if (cigarettesPerDay !== undefined) {
    normalizedValue.cigarettesPerDay = cigarettesPerDay;
  }
  if (quitYears !== undefined) {
    normalizedValue.quitYears = quitYears;
  }

  return {
    originalText,
    normalizedValue,
    confidence: hasConflict ? 0.45 : status === "unknown" ? 0.35 : 0.86,
    notes
  };
}

export function normalizeBooleanHistory(text: string): NormalizedField<boolean | null> {
  const originalText = text;
  const trimmedText = text.trim();
  const diseaseObjectPattern = /(高血压|糖尿病|冠心病|肿瘤|家族史)/;
  const positiveHistoryPattern = /(既往|有|患有|确诊).{0,12}(病史|高血压|糖尿病|冠心病|肿瘤|家族史)|(?:高血压|糖尿病|冠心病|肿瘤).{0,4}病史/;
  const explicitNegativeHistoryPattern = /(否认|未见|没有).{0,8}(高血压|糖尿病|冠心病|肿瘤|家族史)|(否认|未见|没有)(既往)?病史|无\s*(高血压|糖尿病|冠心病|肿瘤|家族史|病史|既往病史)/;
  const hasDiseaseObject = diseaseObjectPattern.test(trimmedText);
  const hasPositiveHistory = positiveHistoryPattern.test(trimmedText);
  const hasNegativeHistory = explicitNegativeHistoryPattern.test(trimmedText);
  const hasPositiveCue = /(既往|患有|确诊)/.test(trimmedText);

  if (hasPositiveCue && hasNegativeHistory) {
    return {
      originalText,
      normalizedValue: null,
      confidence: 0.42,
      notes: ["病史肯定和否定表达共存，需人工复核"]
    };
  }

  if (hasNegativeHistory && hasDiseaseObject) {
    return {
      originalText,
      normalizedValue: false,
      confidence: 0.88,
      notes: ["否认", "命中紧邻疾病对象的否定病史表达"]
    };
  }

  if (hasPositiveHistory) {
    return {
      originalText,
      normalizedValue: true,
      confidence: 0.78,
      notes: ["肯定", "命中肯定病史表达"]
    };
  }

  return {
    originalText,
    normalizedValue: null,
    confidence: 0.3,
    notes: ["未命中明确肯定或否定病史表达"]
  };
}

export function normalizeDateText(text: string): NormalizedField<string | null> {
  const originalText = text;
  const trimmedText = text.trim();
  const match = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(trimmedText);

  if (match === null) {
    return {
      originalText,
      normalizedValue: null,
      confidence: 0.25,
      notes: ["未识别到完整年月日"]
    };
  }

  const [, year, month, day] = match;
  // 正则已要求 3 个捕获组；这里再做运行时保护，满足严格索引检查并避免异常日期文本漏网。
  if (year === undefined || month === undefined || day === undefined) {
    return {
      originalText,
      normalizedValue: null,
      confidence: 0.25,
      notes: ["日期捕获组不完整"]
    };
  }

  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const parsedDate = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  const isRealCalendarDate =
    parsedDate.getUTCFullYear() === numericYear &&
    parsedDate.getUTCMonth() === numericMonth - 1 &&
    parsedDate.getUTCDate() === numericDay;

  // Date 会自动把 2 月 31 日滚到 3 月，必须反查年月日一致性，避免生成非法 ISO 日期。
  if (!isRealCalendarDate) {
    return {
      originalText,
      normalizedValue: null,
      confidence: 0.2,
      notes: [`非法日期：${year}年${month}月${day}日不是有效日历日期`]
    };
  }

  const normalizedValue = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  return {
    originalText,
    normalizedValue,
    confidence: 0.9,
    notes: ["已将中文日期归一化为 ISO 日期"]
  };
}

export function normalizeListField(text: string): NormalizedField<string[]> {
  const originalText = text;
  const normalizedValue = text
    .split(/[、，,；;|\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    originalText,
    normalizedValue,
    confidence: normalizedValue.length > 0 ? 0.82 : 0.2,
    notes: normalizedValue.length > 0 ? ["已按常见分隔符拆分列表字段"] : ["未拆分出有效列表项"]
  };
}
