import { describe, expect, it } from "vitest";

import { buildEvaluationRunConfig, runEvaluationApiSmoke } from "./evaluation-runner-smoke";

describe("evaluation runner smoke", () => {
  it("从环境变量生成受控评估运行配置", () => {
    expect(
      buildEvaluationRunConfig({
        EVALUATION_API_BASE_URL: "http://127.0.0.1:3000/",
        EVALUATION_API_ACCESS_TOKEN: "signed.jwt",
        EVALUATION_DATASET_ID: "dataset-api-001",
        EVALUATION_PROVIDER_KEY: "openai-responses",
        EVALUATION_SCHEMA_KEY: "lims-clinical-info",
        EVALUATION_SAMPLE_LIMIT: "5"
      })
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      accessToken: "signed.jwt",
      datasetId: "dataset-api-001",
      providerKey: "openai-responses",
      schemaKey: "lims-clinical-info",
      sampleLimit: 5
    });
  });

  it("执行评估 run 后读取 run 详情和 metrics", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = async (url: string | URL, init?: RequestInit) => {
      if (!init) {
        throw new Error("fetch init required");
      }
      fetchCalls.push({ url: String(url), init });
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/evaluations/runs") {
        return jsonResponse(
          {
            run: {
              id: "run-api-001",
              status: "completed"
            }
          },
          201
        );
      }

      if (pathname === "/evaluations/runs/run-api-001") {
        return jsonResponse({
          run: {
            id: "run-api-001",
            status: "completed"
          }
        });
      }

      if (pathname === "/evaluations/runs/run-api-001/metrics") {
        return jsonResponse({
          metrics: [
            {
              name: "field_accuracy",
              value: 0.91,
              unit: "ratio"
            }
          ]
        });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    };

    await expect(
      runEvaluationApiSmoke(
        {
          baseUrl: "http://127.0.0.1:3000",
          accessToken: "signed.jwt",
          datasetId: "dataset-api-001",
          providerKey: "openai-responses",
          schemaKey: "lims-clinical-info",
          sampleLimit: 5
        },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toEqual({
      runId: "run-api-001",
      status: "completed",
      metricCount: 1
    });

    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/evaluations/runs",
      "/evaluations/runs/run-api-001",
      "/evaluations/runs/run-api-001/metrics"
    ]);
    expect((fetchCalls[0]?.init.headers as Headers).get("authorization")).toBe("Bearer signed.jwt");
    expect(JSON.parse(String(fetchCalls[0]?.init.body))).toEqual({
      datasetId: "dataset-api-001",
      providerKey: "openai-responses",
      schemaKey: "lims-clinical-info",
      sampleLimit: 5
    });
  });

  it("缺少 datasetId 或 providerKey 时拒绝运行", () => {
    expect(() =>
      buildEvaluationRunConfig({
        EVALUATION_API_BASE_URL: "http://127.0.0.1:3000",
        EVALUATION_API_ACCESS_TOKEN: "signed.jwt",
        EVALUATION_PROVIDER_KEY: "openai-responses"
      })
    ).toThrow("EVALUATION_DATASET_ID 未配置");

    expect(() =>
      buildEvaluationRunConfig({
        EVALUATION_API_BASE_URL: "http://127.0.0.1:3000",
        EVALUATION_API_ACCESS_TOKEN: "signed.jwt",
        EVALUATION_DATASET_ID: "dataset-api-001"
      })
    ).toThrow("EVALUATION_PROVIDER_KEY 未配置");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
