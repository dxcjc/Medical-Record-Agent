import type { NormalizedField } from "./clinicalNormalizers";

/**
 * 临床分期间式标准化器（P1-5）。
 *
 * 背景：Agent 输出分期格式不统一：
 *   - TNM 分期："ypT1cN1Mx"、"T1N1Mx"
 *   - 临床分期："IV期"、"三期"
 *   - 混用："IV期（T3N1M0）"
 *
 * 标准化规则（与知识库条目一致）：
 * 1. 报告中有临床分期（含"期"字）→ 优先输出临床分期
 * 2. 无临床分期 → 输出 TNM 分期
 * 3. 去除新辅助治疗前后缀 y/yp（如 ypT1cN1Mx → T1cN1Mx）
 * 4. TNM 字母统一大写（t1n1mx → T1N1Mx）
 */
export function normalizeClinicalStage(text: string): NormalizedField<string> {
  const originalText = text;
  const notes: string[] = [];

  if (!text || !text.trim()) {
    return { originalText, normalizedValue: "", confidence: 0.3, notes: ["输入为空"] };
  }

  let value = text.trim();

  // 规则 1：若同时含临床分期（"期"字）和 TNM（括号内 T...N...M...），
  // 优先保留临床分期部分。
  const clinicalMatch = value.match(/^([ⅠⅡⅢⅣⅤ一二三四五ivxIVX]{1,3}期)/);
  const hasTnmInParens = /[(（][Tt]\d.*[Mm]\d?.*[)）]/.test(value);
  if (clinicalMatch && hasTnmInParens) {
    notes.push("含临床分期和TNM，优先临床分期");
    return {
      originalText,
      normalizedValue: clinicalMatch[1] ?? value,
      confidence: 0.9,
      notes
    };
  }

  // 规则 2：纯临床分期（罗马数字/中文数字 + 期），保持不变
  if (clinicalMatch && value === clinicalMatch[1]) {
    return { originalText, normalizedValue: value, confidence: 0.95, notes };
  }

  // 规则 3：TNM 分期处理
  // 去除新辅助治疗前后缀 y/yp
  const yPrefixMatch = value.match(/^y(?:p)?(.+)/i);
  if (yPrefixMatch?.[1]) {
    notes.push("去除新辅助治疗前后缀 y/yp");
    value = yPrefixMatch[1];
  }

  // TNM 字母标准化：把 T/N/M 主标记大写（其后跟数字或 M 后跟 x/a-c 等修饰符）
  // 形如 "t1n1mx" → "T1N1Mx"，"T1cN1Mx" 保持不变
  // 只有实际改变值时才记录（已是正确格式的 TNM 不算标准化）
  const beforeTnm = value;
  value = value.replace(/([tnm])(\d|[xXabc])/gi, (match, letter, _next) => {
    if (/[tnm]/i.test(letter)) {
      return letter.toUpperCase() + match.slice(1);
    }
    return match;
  });
  if (value !== beforeTnm) {
    notes.push("TNM 主标记字母大写标准化");
  }

  // 校验是否为有效 TNM 格式（含 T、N、M 标记，或单独 T 标记）
  const isTnm = /^[T]\d[a-cx]?[N]\d[a-cx]?[M]\d?[a-cxX]?$/.test(value) ||
    /^[T]\d[a-cx]?$/.test(value);

  if (!isTnm && notes.length === 0) {
    // 既非临床分期也非 TNM，无法识别
    return {
      originalText,
      normalizedValue: originalText.trim(),
      confidence: 0.4,
      notes: ["无法识别的分期格式，保留原值"]
    };
  }

  const confidence = notes.length > 0 ? 0.85 : 0.95;
  return { originalText, normalizedValue: value, confidence, notes };
}
