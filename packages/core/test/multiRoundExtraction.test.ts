import { describe, expect, it, vi } from "vitest";

import {
  detectMissingFields,
  buildSecondRoundPrompt,
  parseSecondRoundOutput,
  mergeExtractionResults,
  runSecondRoundExtraction,
  extractWithMultiRound
} from "../src/engine/extractionCore";
import type { ModelFieldCandidate, ModelProvider } from "../src/providers/providerTypes";
import type { CoreSchemaDraft } from "../src/schemas/schemaValidator";
import { limsClinicalInfoSchema } from "../src/schemas/limsClinicalInfoSchema";

// ── Test fixtures ──

const testSchema: CoreSchemaDraft = {
  key: "test-schema",
  label: "测试 Schema",
  version: "1.0.0",
  evidencePolicy: {
    required: true,
    minConfidence: 0.7,
    requireSourceText: true,
    requirePageReference: false
  },
  fields: [
    {
      key: "clinicalDiagnosis",
      label: "临床诊断",
      type: "string",
      required: true,
      comments: ["主要诊断"]
    },
    {
      key: "sampleType",
      label: "样本类型",
      type: "enum",
      comments: ["样本类型"],
      enumMap: { tissue: "组织", blood: "血液" }
    },
    {
      key: "tumorType",
      label: "肿瘤类型",
      type: "string",
      comments: ["肿瘤类型"]
    },
    {
      key: "smokingHistory",
      label: "吸烟史",
      type: "enum",
      comments: ["吸烟史"],
      enumMap: { never: "从不吸烟", current: "目前吸烟" }
    }
  ]
};

const sampleOcrText = "姓名：张三 性别：男 年龄：55岁\n临床诊断：肺腺癌\n样本类型：组织\n吸烟史：目前吸烟";

function makeCandidate(
  fieldKey: string,
  value: ModelFieldCandidate["value"],
  confidence: number = 0.9
): ModelFieldCandidate {
  return {
    fieldKey,
    value,
    rawValue: typeof value === "string" ? value : JSON.stringify(value),
    confidence,
    evidence: [{
      snippet: typeof value === "string" ? value : JSON.stringify(value),
      startOffset: 0,
      endOffset: 10
    }]
  };
}

// ── detectMissingFields ──

describe("detectMissingFields", () => {
  it("returns empty array when all fields have valid candidates with sufficient confidence", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", "tissue", 0.88),
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toEqual([]);
  });

  it("detects fields not present in candidates", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95)
      // sampleType, tumorType, smokingHistory missing entirely
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toContain("sampleType");
    expect(missing).toContain("tumorType");
    expect(missing).toContain("smokingHistory");
    expect(missing).not.toContain("clinicalDiagnosis");
  });

  it("detects fields with null value", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", null, 0.0),
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", null, 0.0)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toContain("sampleType");
    expect(missing).toContain("smokingHistory");
    expect(missing).not.toContain("clinicalDiagnosis");
    expect(missing).not.toContain("tumorType");
  });

  it("detects fields with empty string value", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "", 0.5),
      makeCandidate("sampleType", "tissue", 0.88),
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toContain("clinicalDiagnosis");
  });

  it("detects fields with empty array value", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", [], 0.5),
      makeCandidate("sampleType", "tissue", 0.88),
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toContain("clinicalDiagnosis");
  });

  it("detects fields with low confidence", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", "tissue", 0.2),   // below threshold
      makeCandidate("tumorType", "肺癌", 0.1),       // below threshold
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).toContain("sampleType");
    expect(missing).toContain("tumorType");
    expect(missing).not.toContain("clinicalDiagnosis");
    expect(missing).not.toContain("smokingHistory");
  });

  it("uses custom confidence threshold", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", "tissue", 0.5),   // above default 0.3 but below 0.6
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missingDefault = detectMissingFields(candidates, testSchema);
    expect(missingDefault).not.toContain("sampleType");

    const missingStrict = detectMissingFields(candidates, testSchema, 0.6);
    expect(missingStrict).toContain("sampleType");
  });

  it("uses highest confidence candidate when duplicates exist", () => {
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("sampleType", null, 0.0),       // first attempt: null
      makeCandidate("sampleType", "tissue", 0.85),   // second attempt: valid
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("tumorType", "肺癌", 0.85),
      makeCandidate("smokingHistory", "current", 0.9)
    ];

    const missing = detectMissingFields(candidates, testSchema);
    expect(missing).not.toContain("sampleType");
  });
});

// ── buildSecondRoundPrompt ──

describe("buildSecondRoundPrompt", () => {
  it("generates prompt with all missing fields", () => {
    const prompt = buildSecondRoundPrompt(
      sampleOcrText,
      ["patientName", "hospitalName"],
      testSchema
    );

    expect(prompt).toContain("第二轮定向抽取");
    expect(prompt).toContain("patientName");
    expect(prompt).toContain("hospitalName");
    expect(prompt).toContain(sampleOcrText);
  });

  it("includes OCR text in prompt", () => {
    const prompt = buildSecondRoundPrompt(
      sampleOcrText,
      ["clinicalDiagnosis"],
      testSchema
    );

    expect(prompt).toContain(sampleOcrText);
  });

  it("includes field descriptions from schema", () => {
    const prompt = buildSecondRoundPrompt(
      sampleOcrText,
      ["sampleType"],
      testSchema
    );

    // Schema label for sampleType
    expect(prompt).toContain("样本类型");
    // Enum hint from schema
    expect(prompt).toContain("tissue=组织");
    expect(prompt).toContain("blood=血液");
  });

  it("includes JSON output format hint", () => {
    const prompt = buildSecondRoundPrompt(
      sampleOcrText,
      ["clinicalDiagnosis", "tumorType"],
      testSchema
    );

    expect(prompt).toContain("只返回 JSON");
    expect(prompt).toContain("clinicalDiagnosis");
    expect(prompt).toContain("tumorType");
  });

  it("handles unknown fields gracefully", () => {
    const prompt = buildSecondRoundPrompt(
      sampleOcrText,
      ["unknownField"],
      testSchema
    );

    expect(prompt).toContain("unknownField");
  });
});

// ── parseSecondRoundOutput ──

describe("parseSecondRoundOutput", () => {
  it("parses valid JSON object with missing fields", () => {
    const output = {
      clinicalDiagnosis: "肺腺癌",
      sampleType: "组织"
    };

    const result = parseSecondRoundOutput(output, testSchema, ["clinicalDiagnosis", "sampleType"]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);

    const diag = result!.find(c => c.fieldKey === "clinicalDiagnosis");
    expect(diag?.value).toBe("肺腺癌");
    expect(diag?.confidence).toBe(0.75);
    expect(diag?.evidence).toHaveLength(1);

    const sample = result!.find(c => c.fieldKey === "sampleType");
    expect(sample?.value).toBe("组织");
  });

  it("parses JSON string input", () => {
    const output = JSON.stringify({
      clinicalDiagnosis: "肺腺癌"
    });

    const result = parseSecondRoundOutput(output, testSchema, ["clinicalDiagnosis"]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].value).toBe("肺腺癌");
  });

  it("returns null for empty string values", () => {
    const output = {
      clinicalDiagnosis: "",
      sampleType: ""
    };

    const result = parseSecondRoundOutput(output, testSchema, ["clinicalDiagnosis", "sampleType"]);
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseSecondRoundOutput("not-json", testSchema, ["clinicalDiagnosis"])).toBeNull();
    expect(parseSecondRoundOutput(null, testSchema, ["clinicalDiagnosis"])).toBeNull();
    expect(parseSecondRoundOutput(42, testSchema, ["clinicalDiagnosis"])).toBeNull();
  });

  it("ignores fields not in missingFields list", () => {
    const output = {
      clinicalDiagnosis: "肺腺癌",
      extraField: "should be ignored"
    };

    const result = parseSecondRoundOutput(output, testSchema, ["clinicalDiagnosis"]);
    expect(result).toHaveLength(1);
    expect(result![0].fieldKey).toBe("clinicalDiagnosis");
  });

  it("handles numeric values", () => {
    const output = {
      clinicalDiagnosis: 12345
    };

    const result = parseSecondRoundOutput(output, testSchema, ["clinicalDiagnosis"]);
    expect(result).not.toBeNull();
    expect(result![0].value).toBe(12345);
  });

  it("handles array values", () => {
    const schemaWithList: CoreSchemaDraft = {
      ...testSchema,
      fields: [
        ...testSchema.fields,
        { key: "tags", label: "标签", type: "list", comments: [] }
      ]
    };

    const output = {
      tags: ["tag1", "tag2"]
    };

    const result = parseSecondRoundOutput(output, schemaWithList, ["tags"]);
    expect(result).not.toBeNull();
    expect(result![0].value).toEqual(["tag1", "tag2"]);
  });
});

// ── mergeExtractionResults ──

describe("mergeExtractionResults", () => {
  it("keeps all first-round results when second round is empty", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", "tissue", 0.88)
    ];

    const merged = mergeExtractionResults(first, []);
    expect(merged).toHaveLength(2);
    expect(merged.map(c => c.fieldKey).sort()).toEqual(["clinicalDiagnosis", "sampleType"]);
  });

  it("adds second-round results for fields missing in first round", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95)
    ];
    const second = [
      makeCandidate("sampleType", "tissue", 0.75)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged).toHaveLength(2);
    expect(merged.find(c => c.fieldKey === "sampleType")?.value).toBe("tissue");
  });

  it("replaces null first-round values with second-round values", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", null, 0.0)
    ];
    const second = [
      makeCandidate("sampleType", "tissue", 0.75)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged.find(c => c.fieldKey === "sampleType")?.value).toBe("tissue");
  });

  it("replaces empty string first-round values with second-round values", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "", 0.5)
    ];
    const second = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.75)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged.find(c => c.fieldKey === "clinicalDiagnosis")?.value).toBe("肺腺癌");
  });

  it("prefers higher confidence when both rounds have values", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "疑似肺癌", 0.6)
    ];
    const second = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.85)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged.find(c => c.fieldKey === "clinicalDiagnosis")?.value).toBe("肺腺癌");
  });

  it("prefers first round when confidence is equal (conservative)", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "第一轮诊断", 0.75)
    ];
    const second = [
      makeCandidate("clinicalDiagnosis", "第二轮诊断", 0.75)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged.find(c => c.fieldKey === "clinicalDiagnosis")?.value).toBe("第一轮诊断");
  });

  it("keeps first round when it has higher confidence", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "确诊肺腺癌", 0.95)
    ];
    const second = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.75)
    ];

    const merged = mergeExtractionResults(first, second);
    expect(merged.find(c => c.fieldKey === "clinicalDiagnosis")?.value).toBe("确诊肺腺癌");
  });

  it("handles complex merge scenario with multiple fields", () => {
    const first = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", null, 0.0),           // missing
      makeCandidate("tumorType", "肺癌", 0.6),           // low confidence
      makeCandidate("smokingHistory", "current", 0.88)   // good
    ];
    const second = [
      makeCandidate("sampleType", "tissue", 0.75),       // fills missing
      makeCandidate("tumorType", "肺腺癌", 0.82)          // higher confidence
    ];

    const merged = mergeExtractionResults(first, second);

    // clinicalDiagnosis: first round only, kept
    expect(merged.find(c => c.fieldKey === "clinicalDiagnosis")?.value).toBe("肺腺癌");
    // sampleType: first round null, second round fills
    expect(merged.find(c => c.fieldKey === "sampleType")?.value).toBe("tissue");
    // tumorType: second round has higher confidence
    expect(merged.find(c => c.fieldKey === "tumorType")?.value).toBe("肺腺癌");
    // smokingHistory: first round only, kept
    expect(merged.find(c => c.fieldKey === "smokingHistory")?.value).toBe("current");
  });
});

// ── runSecondRoundExtraction ──

describe("runSecondRoundExtraction", () => {
  it("returns candidates on successful extraction", async () => {
    const provider: ModelProvider = {
      providerName: "test-provider",
      async extractFields() {
        return {
          providerName: "test-provider",
          candidates: [
            makeCandidate("sampleType", "tissue", 0.8)
          ]
        };
      }
    };

    const result = await runSecondRoundExtraction(
      provider,
      testSchema,
      sampleOcrText,
      ["sampleType"],
      5000
    );

    expect(result.timedOut).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].fieldKey).toBe("sampleType");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty candidates on timeout", async () => {
    const provider: ModelProvider = {
      providerName: "slow-provider",
      async extractFields() {
        return new Promise(resolve => setTimeout(() => resolve({
          providerName: "slow-provider",
          candidates: []
        }), 200));
      }
    };

    const result = await runSecondRoundExtraction(
      provider,
      testSchema,
      sampleOcrText,
      ["sampleType"],
      50 // 50ms timeout
    );

    expect(result.timedOut).toBe(true);
    expect(result.candidates).toHaveLength(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(40);
  });

  it("returns empty candidates on provider error", async () => {
    const provider: ModelProvider = {
      providerName: "error-provider",
      async extractFields() {
        throw new Error("MODEL_ERROR");
      }
    };

    const result = await runSecondRoundExtraction(
      provider,
      testSchema,
      sampleOcrText,
      ["sampleType"],
      5000
    );

    expect(result.timedOut).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });
});

// ── extractWithMultiRound ──

describe("extractWithMultiRound", () => {
  it("returns first-round result when multi-round is disabled", async () => {
    const firstRoundCandidates = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("sampleType", null, 0.0)
    ];

    const provider: ModelProvider = {
      providerName: "test-provider",
      async extractFields() {
        return {
          providerName: "test-provider",
          candidates: firstRoundCandidates
        };
      }
    };

    const result = await extractWithMultiRound(
      {
        provider,
        schema: testSchema,
        ocrText: sampleOcrText
      },
      { enabled: false }
    );

    expect(result.candidates).toEqual(firstRoundCandidates);
    expect(result.secondRound).toBeUndefined();
  });

  it("skips second round when first round is complete", async () => {
    const extractFieldsSpy = vi.fn(async () => ({
      providerName: "test-provider",
      candidates: [
        makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
        makeCandidate("sampleType", "tissue", 0.88),
        makeCandidate("tumorType", "肺癌", 0.85),
        makeCandidate("smokingHistory", "current", 0.9)
      ]
    }));

    const provider: ModelProvider = {
      providerName: "test-provider",
      extractFields: extractFieldsSpy
    };

    const result = await extractWithMultiRound(
      {
        provider,
        schema: testSchema,
        ocrText: sampleOcrText
      },
      { enabled: true }
    );

    // Provider should only be called once (no second round)
    expect(extractFieldsSpy).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(4);
    expect(result.secondRound).toBeUndefined();
  });

  it("runs second round when first round has missing fields and merges results", async () => {
    let callCount = 0;
    const provider: ModelProvider = {
      providerName: "test-provider",
      async extractFields() {
        callCount++;
        if (callCount === 1) {
          // First round: missing sampleType and smokingHistory
          return {
            providerName: "test-provider",
            candidates: [
              makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
              makeCandidate("tumorType", "肺癌", 0.85)
            ]
          };
        }
        // Second round: fill in missing fields
        return {
          providerName: "test-provider",
          candidates: [
            makeCandidate("sampleType", "tissue", 0.8),
            makeCandidate("smokingHistory", "current", 0.75)
          ]
        };
      }
    };

    const result = await extractWithMultiRound(
      {
        provider,
        schema: testSchema,
        ocrText: sampleOcrText
      },
      { enabled: true, timeoutMs: 10000 }
    );

    expect(callCount).toBe(2);
    expect(result.candidates).toHaveLength(4);
    expect(result.secondRound).toBeDefined();
    expect(result.secondRound!.timedOut).toBe(false);
    expect(result.secondRound!.missingFields).toContain("sampleType");
    expect(result.secondRound!.missingFields).toContain("smokingHistory");
  });

  it("falls back to first round on second round timeout", async () => {
    let callCount = 0;
    const provider: ModelProvider = {
      providerName: "test-provider",
      async extractFields() {
        callCount++;
        if (callCount === 1) {
          return {
            providerName: "test-provider",
            candidates: [
              makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
              makeCandidate("sampleType", null, 0.0)
            ]
          };
        }
        // Second round: simulate slow response
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
          providerName: "test-provider",
          candidates: [
            makeCandidate("sampleType", "tissue", 0.8)
          ]
        };
      }
    };

    const result = await extractWithMultiRound(
      {
        provider,
        schema: testSchema,
        ocrText: sampleOcrText
      },
      { enabled: true, timeoutMs: 50 } // Very short timeout
    );

    // Second round timed out, but first round results preserved
    expect(result.candidates).toHaveLength(2);
    expect(result.secondRound).toBeDefined();
    expect(result.secondRound!.timedOut).toBe(true);
  });

  it("uses custom confidence threshold", async () => {
    let callCount = 0;
    const provider: ModelProvider = {
      providerName: "test-provider",
      async extractFields() {
        callCount++;
        if (callCount === 1) {
          return {
            providerName: "test-provider",
            candidates: [
              makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
              makeCandidate("sampleType", "tissue", 0.5),  // above 0.3 but below 0.6
              makeCandidate("tumorType", "肺癌", 0.85),
              makeCandidate("smokingHistory", "current", 0.9)
            ]
          };
        }
        return {
          providerName: "test-provider",
          candidates: [
            makeCandidate("sampleType", "组织", 0.8)
          ]
        };
      }
    };

    // With default threshold (0.3): sampleType NOT missing
    const resultDefault = await extractWithMultiRound(
      { provider, schema: testSchema, ocrText: sampleOcrText },
      { enabled: true, confidenceThreshold: 0.3 }
    );
    expect(resultDefault.secondRound).toBeUndefined(); // no second round

    // Reset call count
    callCount = 0;

    // With strict threshold (0.6): sampleType IS missing
    const resultStrict = await extractWithMultiRound(
      { provider, schema: testSchema, ocrText: sampleOcrText },
      { enabled: true, confidenceThreshold: 0.6 }
    );
    expect(resultStrict.secondRound).toBeDefined();
    expect(resultStrict.secondRound!.missingFields).toContain("sampleType");
  });

  it("uses real LIMS clinical info schema fields", () => {
    // Verify our multi-round system works with the actual production schema
    const candidates: ModelFieldCandidate[] = [
      makeCandidate("clinicalDiagnosis", "肺腺癌", 0.95),
      makeCandidate("tumorType", "肺癌", 0.85)
      // missing: smokingHistory, hypertensionHistory, diagnosisDate, etc.
    ];

    const missing = detectMissingFields(candidates, limsClinicalInfoSchema);
    // All fields except clinicalDiagnosis and tumorType should be missing
    expect(missing).toContain("smokingHistory");
    expect(missing).toContain("hypertensionHistory");
    expect(missing).toContain("diagnosisDate");
    expect(missing).toContain("familyTumorHistory");
    expect(missing).toContain("sampleType");
    expect(missing).toContain("tumorStage");
    expect(missing).toContain("reportDate");
    expect(missing).not.toContain("clinicalDiagnosis");
    expect(missing).not.toContain("tumorType");
  });
});
