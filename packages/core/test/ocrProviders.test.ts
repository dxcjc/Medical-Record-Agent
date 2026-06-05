import { describe, expect, it, vi } from "vitest";

import {
  ProviderError,
  createHttpOcrProvider,
  createMockOcrProvider,
  createOcrProvider
} from "../src/index";

describe("ocr providers", () => {
  it("mock OCR provider returns deterministic pages, blocks, coordinates and warnings", async () => {
    const provider = createMockOcrProvider({
      providerName: "mock-ocr-test",
      blocks: [
        {
          page: 1,
          blockId: "fixed-block-1",
          text: "患者标识：DEMO-PATIENT-A",
          confidence: 0.93,
          coordinates: { x: 10, y: 20, width: 120, height: 24 }
        }
      ],
      qualityWarnings: [
        {
          code: "LOW_DPI",
          message: "DEMO 图像分辨率偏低",
          severity: "warning",
          page: 1
        }
      ]
    });

    const firstResult = await provider.recognize({
      documentId: "doc-001",
      fileName: "demo-record.png",
      mimeType: "image/png",
      content: new Uint8Array([1, 2, 3])
    });
    const secondResult = await provider.recognize({
      documentId: "doc-001",
      fileName: "demo-record.png",
      mimeType: "image/png",
      content: new Uint8Array([9, 8, 7])
    });

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.providerName).toBe("mock-ocr-test");
    expect(firstResult.pages).toEqual([
      { page: 1, text: "患者标识：DEMO-PATIENT-A", confidence: 0.93 }
    ]);
    expect(firstResult.blocks).toEqual([
      {
        page: 1,
        blockId: "fixed-block-1",
        text: "患者标识：DEMO-PATIENT-A",
        confidence: 0.93,
        coordinates: { x: 10, y: 20, width: 120, height: 24 }
      }
    ]);
    expect(firstResult.qualityWarnings[0]?.message).toBe("DEMO 图像分辨率偏低");
  });

  it("HTTP OCR provider maps configured response paths without real network access", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            pageResults: [
              {
                pageNumber: 2,
                fullText: "患者标识：DEMO-PATIENT-A\n诊断：DEMO-DIAGNOSIS-A",
                score: 0.88,
                lines: [
                  {
                    id: "line-8",
                    content: "诊断：DEMO-DIAGNOSIS-A",
                    probability: 0.81,
                    box: { left: 7, top: 9, w: 101, h: 18 }
                  }
                ]
              }
            ],
            warnings: [
              { code: "BLUR", message: "DEMO 图像略模糊", level: "warning", page: 2 }
            ]
          },
          traceId: "trace-should-not-be-returned-as-sensitive-payload"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createHttpOcrProvider({
      endpoint: "https://ocr.example.test/recognize",
      headers: {
        Authorization: "Bearer secret-token",
        "X-Api-Key": "secret-api-key"
      },
      timeoutMs: 1000,
      maxRetries: 0,
      retryDelayMs: 0,
      fetchFn: fetchMock,
      responseMapping: {
        pagesPath: "result.pageResults",
        pageNumberPath: "pageNumber",
        pageTextPath: "fullText",
        pageConfidencePath: "score",
        blocksPath: "lines",
        blockIdPath: "id",
        blockTextPath: "content",
        blockConfidencePath: "probability",
        coordinatesPath: "box",
        coordinateAliases: {
          x: "left",
          y: "top",
          width: "w",
          height: "h"
        },
        warningsPath: "result.warnings",
        warningCodePath: "code",
        warningMessagePath: "message",
        warningSeverityPath: "level",
        warningPagePath: "page"
      }
    });

    const result = await provider.recognize({
      documentId: "doc-http",
      fileName: "demo-record.png",
      mimeType: "image/png",
      storageKey: "private://records/doc-http"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerName).toBe("http-ocr");
    expect(result.pages).toEqual([
      { page: 2, text: "患者标识：DEMO-PATIENT-A\n诊断：DEMO-DIAGNOSIS-A", confidence: 0.88 }
    ]);
    expect(result.blocks).toEqual([
      {
        page: 2,
        blockId: "line-8",
        text: "诊断：DEMO-DIAGNOSIS-A",
        confidence: 0.81,
        coordinates: { x: 7, y: 9, width: 101, height: 18 }
      }
    ]);
    expect(result.qualityWarnings).toEqual([
      { code: "BLUR", message: "DEMO 图像略模糊", severity: "warning", page: 2 }
    ]);
    expect(result.raw).toEqual({ responseStatus: 200 });
  });

  it("HTTP OCR provider adds quality warnings when page or block fields are missing", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            pageResults: [
              {
                score: 0.61,
                lines: [
                  {
                    probability: 0.52
                  }
                ]
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createHttpOcrProvider({
      endpoint: "https://ocr.example.test/recognize",
      timeoutMs: 1000,
      maxRetries: 0,
      retryDelayMs: 0,
      fetchFn: fetchMock,
      responseMapping: {
        pagesPath: "result.pageResults",
        pageNumberPath: "pageNumber",
        pageTextPath: "fullText",
        pageConfidencePath: "score",
        blocksPath: "lines",
        blockIdPath: "id",
        blockTextPath: "content",
        blockConfidencePath: "probability",
        coordinatesPath: "box"
      }
    });

    const result = await provider.recognize({
      documentId: "doc-warning",
      fileName: "demo-warning-record.png",
      mimeType: "image/png",
      storageKey: "private://records/doc-warning"
    });

    expect(result.pages).toEqual([{ page: 1, text: "", confidence: 0.61 }]);
    expect(result.blocks).toEqual([
      {
        page: 1,
        blockId: "http-ocr-page-1-block-1",
        text: "",
        confidence: 0.52,
        coordinates: { x: 0, y: 0, width: 0, height: 0 }
      }
    ]);
    expect(result.qualityWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OCR_PAGE_NUMBER_MISSING", page: 1 }),
        expect.objectContaining({ code: "OCR_PAGE_TEXT_MISSING", page: 1 }),
        expect.objectContaining({ code: "OCR_BLOCK_ID_MISSING", page: 1 }),
        expect.objectContaining({ code: "OCR_BLOCK_TEXT_MISSING", page: 1 }),
        expect.objectContaining({ code: "OCR_BLOCK_COORDINATES_MISSING", page: 1 })
      ])
    );
  });

  it("HTTP OCR bad JSON response is non-retryable and sanitized", async () => {
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("DEMO-BAD-JSON-DETAIL");
        }
      }) as Response
    );
    const provider = createHttpOcrProvider({
      endpoint: "https://ocr.example.test/recognize",
      timeoutMs: 1000,
      maxRetries: 3,
      retryDelayMs: 0,
      fetchFn: fetchMock
    });

    await expect(
      provider.recognize({
        documentId: "doc-bad-json",
        fileName: "demo-bad-json-record.png",
        mimeType: "image/png",
        storageKey: "private://records/doc-bad-json"
      })
    ).rejects.toMatchObject({
      name: "ProviderError",
      providerName: "http-ocr",
      retryable: false,
      code: "HTTP_OCR_BAD_RESPONSE"
    });

    await provider
      .recognize({
        documentId: "doc-bad-json-2",
        fileName: "demo-bad-json-record-2.png",
        mimeType: "image/png",
        storageKey: "private://records/doc-bad-json-2"
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ProviderError);
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("HTTP OCR 响应无效");
        expect(message).not.toContain("DEMO-BAD-JSON-DETAIL");
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP OCR bad mapped response is non-retryable and not retried", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            pageResults: {
              pageNumber: 1,
              fullText: "DEMO-INVALID-PAGES-SHAPE"
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = createHttpOcrProvider({
      endpoint: "https://ocr.example.test/recognize",
      timeoutMs: 1000,
      maxRetries: 3,
      retryDelayMs: 0,
      fetchFn: fetchMock,
      responseMapping: {
        pagesPath: "result.pageResults",
        pageNumberPath: "pageNumber",
        pageTextPath: "fullText"
      }
    });

    await expect(
      provider.recognize({
        documentId: "doc-bad-mapping",
        fileName: "demo-bad-mapping-record.png",
        mimeType: "image/png",
        storageKey: "private://records/doc-bad-mapping"
      })
    ).rejects.toMatchObject({
      name: "ProviderError",
      providerName: "http-ocr",
      retryable: false,
      code: "HTTP_OCR_BAD_RESPONSE"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP OCR transport failures retry and return sanitized retryable provider errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error(
        "Authorization Bearer secret-token failed for DEMO-RAW-MEDICAL-TEXT with api key secret-api-key"
      );
    });
    const provider = createHttpOcrProvider({
      endpoint: "https://ocr.example.test/recognize",
      headers: {
        Authorization: "Bearer secret-token",
        "X-Api-Key": "secret-api-key"
      },
      timeoutMs: 100,
      maxRetries: 1,
      retryDelayMs: 0,
      fetchFn: fetchMock
    });

    await provider
      .recognize({
        documentId: "doc-fail",
        fileName: "demo-failed-record.png",
        mimeType: "image/png",
        content: new TextEncoder().encode("DEMO-RAW-MEDICAL-TEXT")
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toMatchObject({
          name: "ProviderError",
          providerName: "http-ocr",
          retryable: true,
          code: "HTTP_OCR_RETRYABLE_FAILURE"
        });
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain("HTTP OCR 调用失败");
        expect(message).not.toContain("secret-token");
        expect(message).not.toContain("secret-api-key");
        expect(message).not.toContain("DEMO-RAW-MEDICAL-TEXT");
        expect(message).not.toContain("Authorization");
        expect(message).not.toContain("X-Api-Key");
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provider factory selects mock and HTTP OCR from configuration", () => {
    const mockProvider = createOcrProvider({
      kind: "mock",
      mock: {
        blocks: [
          {
            page: 1,
            blockId: "factory-block",
            text: "DEMO-FACTORY-MOCK",
            confidence: 1,
            coordinates: { x: 0, y: 0, width: 10, height: 10 }
          }
        ]
      }
    });
    const httpProvider = createOcrProvider({
      kind: "http",
      http: {
        endpoint: "https://ocr.example.test/recognize",
        maxRetries: 0,
        retryDelayMs: 0,
        fetchFn: vi.fn()
      }
    });

    expect(mockProvider.providerName).toBe("mock-ocr");
    expect(httpProvider.providerName).toBe("http-ocr");
  });
});
