import { describe, expect, it, vi } from "vitest";

import {
  ProviderError,
  buildExtractionPrompt,
  createHttpLlmProvider,
  createLangChainModelProvider,
  createMockModelProvider,
  createModelProvider,
  createOpenAiResponsesProvider,
  extractStructuredFields,
  limsClinicalInfoSchema
} from "../src/index";

const demoOcrText = "DEMO_CASE_001：演示文本提示吸烟10年，诊断：DEMO_DIAGNOSIS_A。样本类型：DEMO_TISSUE。";

describe("LLM extraction engine", () => {
  it("builds extraction prompt with schema fields, OCR text, RAG context and output schema", () => {
    const prompt = buildExtractionPrompt({
      schema: limsClinicalInfoSchema,
      ocrText: demoOcrText,
      ragContext: ["肺腺癌通常归入肿瘤类型候选。", "样本类型组织对应 tissue。"],
      evidenceRequirements: ["每个字段必须给出 evidence.snippet。"]
    });

    expect(prompt).toContain("LIMS 临床信息");
    expect(prompt).toContain("smokingHistory");
    expect(prompt).toContain("clinicalDiagnosis");
    expect(prompt).toContain(demoOcrText);
    expect(prompt).toContain("肺腺癌通常归入肿瘤类型候选。");
    expect(prompt).toContain("每个字段必须给出 evidence.snippet。");
    expect(prompt).toContain('"fields"');
    expect(prompt).toContain('"fieldKey"');
    expect(prompt).toContain('"confidence"');
  });

  it("mock model provider returns deterministic structured fields through extraction engine", async () => {
    const provider = createMockModelProvider({
      providerName: "mock-model-test",
      candidates: [
        {
          fieldKey: "clinicalDiagnosis",
          value: "DEMO_DIAGNOSIS_A",
          rawValue: "诊断：DEMO_DIAGNOSIS_A",
          confidence: 0.92,
          evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49, pageNumber: 1 }]
        }
      ]
    });

    const result = await extractStructuredFields({
      provider,
      schema: limsClinicalInfoSchema,
      ocrText: demoOcrText,
      ragContext: ["诊断字段优先来自临床诊断段落。"]
    });

    expect(result.providerName).toBe("mock-model-test");
    expect(result.prompt).toContain(demoOcrText);
    expect(result.candidates).toEqual([
      {
        fieldKey: "clinicalDiagnosis",
        value: "DEMO_DIAGNOSIS_A",
        rawValue: "诊断：DEMO_DIAGNOSIS_A",
        confidence: 0.92,
        evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49, pageNumber: 1 }]
      }
    ]);
  });

  it("langchain provider uses injected structured model and parses mocked response", async () => {
    const invoke = vi.fn(async () => ({
      fields: [
        {
          fieldKey: "sampleType",
          value: "tissue",
          rawValue: "样本类型：DEMO_TISSUE",
          confidence: 0.89,
          evidence: [{ snippet: "样本类型：DEMO_TISSUE", startOffset: 50, endOffset: 72, pageNumber: 1 }]
        }
      ]
    }));
    const withStructuredOutput = vi.fn(() => ({ invoke }));
    const provider = createLangChainModelProvider({
      providerName: "langchain-test",
      model: { withStructuredOutput }
    });

    const result = await extractStructuredFields({
      provider,
      schema: limsClinicalInfoSchema,
      ocrText: demoOcrText
    });

    expect(withStructuredOutput).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[0]).toContain(demoOcrText);
    expect(result.candidates[0]?.fieldKey).toBe("sampleType");
  });

  it("HTTP LLM provider sends OpenAI-compatible request and parses JSON content", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: [
                    {
                      fieldKey: "tumorType",
                      value: "DEMO_DIAGNOSIS_A",
                      rawValue: "诊断：DEMO_DIAGNOSIS_A",
                      confidence: 0.91,
                      evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49, pageNumber: 1 }]
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createHttpLlmProvider({
      endpoint: "https://llm-gateway.example.test/v1/chat/completions",
      model: "demo-model",
      apiKey: "secret-api-key",
      timeoutMs: 1000,
      fetchFn: fetchMock
    });

    const result = await provider.extractFields({
      schema: limsClinicalInfoSchema,
      prompt: "请抽取字段。",
      ocrText: demoOcrText
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret-api-key"
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "demo-model",
      messages: expect.any(Array),
      response_format: { type: "json_object" }
    });
    expect(result.candidates[0]?.fieldKey).toBe("tumorType");
  });

  it("OpenAI Responses provider uses injected client shape and parses output text JSON", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        fields: [
          {
            fieldKey: "smokingHistory",
            value: "current",
            rawValue: "吸烟10年",
            confidence: 0.86,
            evidence: [{ snippet: "吸烟10年", startOffset: 10, endOffset: 16, pageNumber: 1 }]
          }
        ]
      })
    }));
    const provider = createOpenAiResponsesProvider({
      providerName: "responses-test",
      model: "gpt-demo",
      experimental: { enabled: true },
      client: { responses: { create } }
    });

    const result = await provider.extractFields({
      schema: limsClinicalInfoSchema,
      prompt: "请抽取字段。",
      ocrText: demoOcrText
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-demo",
        input: expect.stringContaining("请抽取字段。")
      })
    );
    expect(result.candidates[0]?.fieldKey).toBe("smokingHistory");
  });

  it("malformed HTTP model output becomes structured non-retryable provider error without raw text or secrets", async () => {
    const provider = createHttpLlmProvider({
      endpoint: "https://llm-gateway.example.test/v1/chat/completions",
      model: "demo-model",
      apiKey: "secret-api-key",
      timeoutMs: 1000,
      fetchFn: vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `{"fields":[{"fieldKey":"clinicalDiagnosis","rawLeak":"${demoOcrText}"}]}`
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    });

    await provider
      .extractFields({
        schema: limsClinicalInfoSchema,
        prompt: `请抽取字段，原文：${demoOcrText}`,
        ocrText: demoOcrText
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({
          providerName: "http-llm",
          retryable: false,
          code: "MODEL_OUTPUT_MALFORMED"
        });
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("模型结构化输出无效");
        expect(message).not.toContain(demoOcrText);
        expect(message).not.toContain("secret-api-key");
        expect(message).not.toContain("Authorization");
      });
  });

  it("strict parser rejects extra fields, invalid numbers and missing evidence", async () => {
    const invalidOutputs = [
      {
        fields: [],
        rawLeak: demoOcrText
      },
      {
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "DEMO_DIAGNOSIS_A",
            rawValue: "诊断：DEMO_DIAGNOSIS_A",
            confidence: 0.9,
            evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49, sourceText: demoOcrText }]
          }
        ]
      },
      {
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: Number.NaN,
            rawValue: "诊断：DEMO_DIAGNOSIS_A",
            confidence: 0.9,
            evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49 }]
          }
        ]
      },
      {
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "DEMO_DIAGNOSIS_A",
            rawValue: "诊断：DEMO_DIAGNOSIS_A",
            confidence: Number.NaN,
            evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49 }]
          }
        ]
      },
      {
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "DEMO_DIAGNOSIS_A",
            rawValue: "诊断：DEMO_DIAGNOSIS_A",
            confidence: 0.9,
            evidence: []
          }
        ]
      },
      {
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "DEMO_DIAGNOSIS_A",
            rawValue: "诊断：DEMO_DIAGNOSIS_A",
            confidence: 0.9,
            evidence: [{ snippet: "", startOffset: 28, endOffset: 49, pageNumber: "1" }]
          }
        ]
      }
    ];

    for (const output of invalidOutputs) {
      const provider = createLangChainModelProvider({
        providerName: "langchain-strict-test",
        model: {
          invoke: vi.fn(async () => output)
        }
      });

      await expect(
        provider.extractFields({
          schema: limsClinicalInfoSchema,
          prompt: "请抽取字段。",
          ocrText: demoOcrText
        })
      ).rejects.toMatchObject({
        name: "ProviderError",
        providerName: "langchain-strict-test",
        retryable: false,
        code: "MODEL_OUTPUT_MALFORMED"
      });
    }
  });

  it("LangChain provider separates malformed output from retryable model invocation failure", async () => {
    const malformedProvider = createLangChainModelProvider({
      providerName: "langchain-malformed-test",
      model: {
        invoke: vi.fn(async () => ({ fields: [{ fieldKey: "clinicalDiagnosis" }] }))
      }
    });
    const failingProvider = createLangChainModelProvider({
      providerName: "langchain-failure-test",
      model: {
        invoke: vi.fn(async () => {
          throw new Error(`模型网关异常：${demoOcrText}`);
        })
      }
    });

    await expect(
      malformedProvider.extractFields({
        schema: limsClinicalInfoSchema,
        prompt: "请抽取字段。",
        ocrText: demoOcrText
      })
    ).rejects.toMatchObject({
      retryable: false,
      code: "MODEL_OUTPUT_MALFORMED"
    });

    await failingProvider
      .extractFields({
        schema: limsClinicalInfoSchema,
        prompt: `请抽取字段，原文：${demoOcrText}`,
        ocrText: demoOcrText
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({
          retryable: true,
          code: "LANGCHAIN_MODEL_RETRYABLE_FAILURE"
        });
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(demoOcrText);
      });
  });

  it("OpenAI Responses provider treats invalid output_text as non-retryable malformed output", async () => {
    const invalidResponses = [
      {},
      { output_text: "{not-json" },
      {
        output_text: JSON.stringify({
          fields: [
            {
              fieldKey: "clinicalDiagnosis",
              value: "DEMO_DIAGNOSIS_A",
              rawValue: "诊断：DEMO_DIAGNOSIS_A",
              confidence: 0.91,
              evidence: [{ snippet: "诊断：DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 49, sourceText: demoOcrText }]
            }
          ]
        })
      }
    ];

    for (const response of invalidResponses) {
      const create = vi.fn(async () => response);
      const provider = createOpenAiResponsesProvider({
        providerName: "responses-malformed-test",
        model: "gpt-demo",
        experimental: { enabled: true },
        client: { responses: { create } }
      });

      await expect(
        provider.extractFields({
          schema: limsClinicalInfoSchema,
          prompt: "请抽取字段。",
          ocrText: demoOcrText
        })
      ).rejects.toMatchObject({
        retryable: false,
        code: "MODEL_OUTPUT_MALFORMED"
      });
    }
  });

  it("model provider factory selects supported LLM providers", () => {
    const mockProvider = createModelProvider({
      kind: "mock",
      mock: { candidates: [] }
    });
    const httpProvider = createModelProvider({
      kind: "http",
      http: {
        endpoint: "https://llm-gateway.example.test/v1/chat/completions",
        model: "demo-model",
        fetchFn: vi.fn()
      }
    });

    expect(mockProvider.providerName).toBe("fixture-model");
    expect(httpProvider.providerName).toBe("http-llm");
  });

  it("rejects schema mismatched field keys and value types", async () => {
    const schemaWithAge = {
      ...limsClinicalInfoSchema,
      fields: [
        ...limsClinicalInfoSchema.fields,
        {
          key: "age",
          label: "年龄",
          type: "number" as const,
          comments: ["演示 schema 扩展字段，用于验证模型输出必须匹配字段类型。"]
        }
      ]
    };
    const invalidCases = [
      {
        schema: limsClinicalInfoSchema,
        output: {
          fields: [
            {
              fieldKey: "notInSchema",
              value: "DEMO_DIAGNOSIS_A",
              rawValue: "DEMO_DIAGNOSIS_A",
              confidence: 0.9,
              evidence: [{ snippet: "DEMO_DIAGNOSIS_A", startOffset: 28, endOffset: 44 }]
            }
          ]
        }
      },
      {
        schema: schemaWithAge,
        output: {
          fields: [
            {
              fieldKey: "age",
              value: "not-a-number",
              rawValue: "not-a-number",
              confidence: 0.9,
              evidence: [{ snippet: "not-a-number", startOffset: 10, endOffset: 22 }]
            }
          ]
        }
      }
    ];

    for (const { schema, output } of invalidCases) {
      const provider = createLangChainModelProvider({
        providerName: "langchain-schema-mismatch-test",
        model: {
          invoke: vi.fn(async () => output)
        }
      });

      await expect(
        provider.extractFields({
          schema,
          prompt: "请抽取字段。",
          ocrText: demoOcrText
        })
      ).rejects.toMatchObject({
        name: "ProviderError",
        providerName: "langchain-schema-mismatch-test",
        retryable: false,
        code: "MODEL_OUTPUT_MALFORMED"
      });
    }
  });

  it("accepts enum field values not in enumMap as valid string candidates", async () => {
    const output = {
      fields: [
        {
          fieldKey: "smokingHistory",
          value: "unsupported-enum",
          rawValue: "unsupported-enum",
          confidence: 0.9,
          evidence: [{ snippet: "unsupported-enum", startOffset: 10, endOffset: 26 }]
        }
      ]
    };
    const provider = createLangChainModelProvider({
      providerName: "langchain-enum-tolerance-test",
      model: {
        invoke: vi.fn(async () => output)
      }
    });

    const result = await provider.extractFields({
      schema: limsClinicalInfoSchema,
      prompt: "请抽取字段。",
      ocrText: demoOcrText
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].fieldKey).toBe("smokingHistory");
    expect(result.candidates[0].value).toBe("unsupported-enum");
  });

  it("gates OpenAI Responses provider behind explicit experimental config", () => {
    const config = {
      providerName: "responses-disabled-test",
      model: "gpt-demo",
      client: { responses: { create: vi.fn() } }
    };

    expect(() => createOpenAiResponsesProvider(config)).toThrowError(ProviderError);
    expect(() =>
      createModelProvider({
        kind: "openai-responses",
        openAiResponses: config
      })
    ).toThrowError(ProviderError);
    expect(
      createOpenAiResponsesProvider({
        ...config,
        experimental: { enabled: true }
      }).providerName
    ).toBe("responses-disabled-test");
  });
});
