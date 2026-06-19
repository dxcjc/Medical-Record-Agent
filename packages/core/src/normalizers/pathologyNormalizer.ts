import type { NormalizedField } from "./clinicalNormalizers";

/**
 * 病理诊断字段简化器（P1-3）。
 *
 * 背景：Agent 常输出完整病理描述，如
 *   "（肝脏右前叶）转移性低分化腺癌，符合肠癌肝转移"
 * 而期望值是简短诊断名"转移性低分化腺癌"。
 *
 * 本函数提取核心诊断名词短语：
 * 1. 去除开头部位的括号前缀（如"（肝脏右前叶）"）
 * 2. 去除尾部"，符合X转移"/"，部分为X"等附加说明
 * 3. 取主诊断（首个逗号分隔项）
 *
 * 后处理后若仍过长，由 validationEngine 触发重抽。
 */
export function normalizePathologicalDiagnosis(text: string): NormalizedField<string> {
  const originalText = text;
  const notes: string[] = [];

  if (!text || !text.trim()) {
    return { originalText, normalizedValue: "", confidence: 0.3, notes: ["输入为空"] };
  }

  let value = text.trim();

  // 1. 去除开头的部位前缀括号（可多个），如"（肝脏右前叶）"、"（胃小弯）（贲门）"
  //    循环去除开头连续的括号前缀
  let removedPrefix = false;
  while (true) {
    const matched = value.match(/^（[^）]*）\s*/);
    if (!matched) break;
    value = value.slice(matched[0].length);
    removedPrefix = true;
  }
  if (removedPrefix) {
    notes.push("去除部位前缀括号");
    value = value.trim();
  }

  // 2. 取主诊断：首个中文逗号/英文逗号分隔项
  //    典型："转移性低分化腺癌，符合肠癌肝转移" → "转移性低分化腺癌"
  //          "低分化腺癌，部分为印戒细胞癌" → "低分化腺癌"
  const commaIdx = findMainComma(value);
  if (commaIdx >= 0) {
    const main = value.slice(0, commaIdx).trim();
    if (main.length > 0) {
      notes.push("取主诊断，去除附加说明");
      value = main;
    }
  }

  // 3. 置信度判定
  let confidence = 0.9;
  if (value.length === 0) {
    // 去除前缀后无核心诊断
    confidence = 0.3;
    notes.push("去除前缀后无核心诊断，保留原文本");
    value = originalText.trim();
  } else if (value === originalText.trim()) {
    // 未做任何简化
    confidence = 0.95;
  } else {
    confidence = 0.85;
  }

  return { originalText, normalizedValue: value, confidence, notes };
}

/**
 * 找到主诊断与附加说明的分隔逗号位置。
 * 仅在核心诊断已有足够长度（>=3 字符）后出现的逗号才算分隔符，
 * 避免误切"腺癌，部分"这类。取第一个符合位置的逗号。
 */
function findMainComma(text: string): number {
  for (let i = 3; i < text.length; i++) {
    const ch = text[i];
    if (ch === "，" || ch === ",") {
      return i;
    }
  }
  return -1;
}
