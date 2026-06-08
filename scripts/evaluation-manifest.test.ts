import { describe, expect, it } from "vitest";

import {
  buildEvaluationImportPayload,
  buildEvaluationManifestCliConfig,
  importEvaluationManifest,
  validateEvaluationManifest,
  type EvaluationDatasetManifest
} from "./evaluation-manifest";

function createValidManifest(): EvaluationDatasetManifest {
  return {
    datasetId: "lims-clinical-info-real-deidentified-v1",
    name: "LIMS 临床信息真实脱敏评估集",
    schemaId: "lims-clinical-info",
    schemaVersion: "1.0.0",
    sourceType: "real_deidentified",
    deidentified: true,
    storagePolicy: "local_controlled",
    createdBy: "evaluation-admin",
    createdAt: "2026-06-08T10:00:00.000+08:00",
    reviewedBy: "deid-reviewer",
    reviewedAt: "2026-06-08T11:00:00.000+08:00",
    deidentification: {
      proofId: "proof-20260608-001",
      method: "manual_review"
    },
    samples: [
      {
        sampleId: "real-deidentified-001",
        documentRef: "evaluation-data/local-deidentified/documents/record-001.ocr.json",
        documentType: "ocr_text",
        sourceType: "real_deidentified",
        deidentified: true,
        caseCategory: "清晰扫描件",
        qualityTags: ["清晰", "证据完整"],
        language: "zh-CN",
        needsReview: false,
        reviewReasons: [],
        groundTruth: [
          {
            fieldKey: "clinicalDiagnosis",
            label: "临床诊断",
            value: "肺腺癌",
            normalizedValue: "肺腺癌",
            matchPolicy: "normalized",
            needsReview: false,
            reviewReason: "",
            evidence: [
              {
                text: "临床诊断：肺腺癌",
                pageNumber: 1,
                blockId: "block-001",
                startOffset: 0,
                endOffset: 9,
                evidenceRole: "primary"
              }
            ]
          }
        ]
      }
    ]
  };
}

describe("evaluation manifest", () => {
  it("CLI 默认只做本地校验，不需要 API 配置", () => {
    expect(buildEvaluationManifestCliConfig(["manifest.json"], {})).toEqual({
      mode: "validate",
      manifestPath: "manifest.json"
    });
  });

  it("CLI 导入模式必须显式开启，并要求 API baseUrl 和 access token", () => {
    expect(
      buildEvaluationManifestCliConfig(["--import", "manifest.json"], {
        EVALUATION_API_BASE_URL: "http://127.0.0.1:3000/",
        EVALUATION_API_ACCESS_TOKEN: "signed.jwt"
      })
    ).toEqual({
      mode: "import",
      manifestPath: "manifest.json",
      baseUrl: "http://127.0.0.1:3000",
      accessToken: "signed.jwt"
    });

    expect(() => buildEvaluationManifestCliConfig(["--import", "manifest.json"], {})).toThrow(
      "EVALUATION_API_BASE_URL 未配置"
    );
  });

  it("允许带脱敏证明的真实脱敏 manifest，并生成可导入 API 的样本 payload", () => {
    const manifest = createValidManifest();

    expect(validateEvaluationManifest(manifest)).toEqual({
      valid: true,
      issues: []
    });

    expect(buildEvaluationImportPayload(manifest)).toEqual({
      dataset: {
        key: "lims-clinical-info-real-deidentified-v1",
        displayName: "LIMS 临床信息真实脱敏评估集",
        deidentified: true,
        metadata: {
          sourceType: "real_deidentified",
          schemaId: "lims-clinical-info",
          schemaVersion: "1.0.0",
          storagePolicy: "local_controlled",
          createdBy: "evaluation-admin",
          createdAt: "2026-06-08T10:00:00.000+08:00",
          reviewedBy: "deid-reviewer",
          reviewedAt: "2026-06-08T11:00:00.000+08:00",
          deidentification: {
            proofId: "proof-20260608-001",
            method: "manual_review"
          }
        }
      },
      samples: [
        {
          externalId: "real-deidentified-001",
          input: {
            documentId: "real-deidentified-001",
            documentRef: "evaluation-data/local-deidentified/documents/record-001.ocr.json",
            documentType: "ocr_text",
            sourceType: "real_deidentified",
            storagePolicy: "local_controlled"
          },
          metadata: {
            sourceType: "real_deidentified",
            deidentified: true,
            deidentification: {
              proofId: "proof-20260608-001",
              method: "manual_review"
            },
            documentRef: "evaluation-data/local-deidentified/documents/record-001.ocr.json",
            documentType: "ocr_text",
            caseCategory: "清晰扫描件",
            qualityTags: ["清晰", "证据完整"],
            language: "zh-CN",
            needsReview: false,
            reviewReasons: [],
            datasetId: "lims-clinical-info-real-deidentified-v1"
          },
          groundTruth: manifest.samples[0]?.groundTruth
        }
      ]
    });
  });

  it("拒绝 sourceType=real 的原始真实样本 manifest", () => {
    const manifest = {
      ...createValidManifest(),
      sourceType: "real"
    };

    expect(validateEvaluationManifest(manifest).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REAL_SOURCE_TYPE_FORBIDDEN",
          path: "$.sourceType"
        })
      ])
    );
  });

  it("拒绝缺少脱敏证明的 real_deidentified manifest", () => {
    const manifest = {
      ...createValidManifest(),
      deidentification: undefined,
      reviewedBy: undefined,
      reviewedAt: undefined
    };

    expect(validateEvaluationManifest(manifest).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DEIDENTIFICATION_PROOF_REQUIRED",
          path: "$.deidentification"
        })
      ])
    );
  });

  it("扫描 manifest 文本里的明显 PHI/PII 风险并阻止导入 payload 生成", () => {
    const manifest = createValidManifest();
    const evidence = manifest.samples[0]?.groundTruth[0]?.evidence[0];
    if (evidence) {
      evidence.text = "联系电话：13812345678；临床诊断：肺腺癌";
    }

    const result = validateEvaluationManifest(manifest);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "POTENTIAL_PHI",
          path: "$.samples[0].groundTruth[0].evidence[0].text"
        })
      ])
    );
    expect(() => buildEvaluationImportPayload(manifest)).toThrow("EVALUATION_MANIFEST_INVALID");
  });

  it("受控导入 manifest 时先创建 dataset，再导入 samples，并携带 Bearer token", async () => {
    const manifest = createValidManifest();
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL, init?: RequestInit) => {
      if (!init) {
        throw new Error("fetch init required");
      }
      fetchCalls.push({ url: String(url), init });
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/evaluations/datasets") {
        return jsonResponse({
          dataset: {
            id: "dataset-api-001"
          }
        });
      }

      if (pathname === "/evaluations/datasets/dataset-api-001/samples") {
        return jsonResponse(
          {
            samples: [
              {
                id: "sample-api-001"
              }
            ]
          },
          201
        );
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    };

    await expect(
      importEvaluationManifest(
        {
          baseUrl: "http://127.0.0.1:3000/",
          accessToken: "signed.jwt",
          manifest
        },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toEqual({
      datasetId: "dataset-api-001",
      sampleCount: 1
    });

    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/evaluations/datasets",
      "/evaluations/datasets/dataset-api-001/samples"
    ]);
    expect((fetchCalls[0]?.init.headers as Headers).get("authorization")).toBe("Bearer signed.jwt");
    expect(JSON.parse(String(fetchCalls[0]?.init.body))).toEqual({
      key: "lims-clinical-info-real-deidentified-v1",
      displayName: "LIMS 临床信息真实脱敏评估集",
      deidentified: true,
      metadata: expect.objectContaining({
        sourceType: "real_deidentified",
        deidentification: expect.objectContaining({
          proofId: "proof-20260608-001"
        })
      })
    });
    expect(JSON.parse(String(fetchCalls[1]?.init.body))).toEqual({
      samples: expect.arrayContaining([
        expect.objectContaining({
          externalId: "real-deidentified-001",
          metadata: expect.objectContaining({
            deidentified: true,
            documentRef: "evaluation-data/local-deidentified/documents/record-001.ocr.json"
          })
        })
      ])
    });
  });

  it("manifest 校验失败时导入脚本不调用 API", async () => {
    const manifest = createValidManifest();
    manifest.sourceType = "real";
    const fetchMock = async () => jsonResponse({});

    await expect(
      importEvaluationManifest(
        {
          baseUrl: "http://127.0.0.1:3000",
          accessToken: "signed.jwt",
          manifest
        },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow("EVALUATION_MANIFEST_INVALID");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
