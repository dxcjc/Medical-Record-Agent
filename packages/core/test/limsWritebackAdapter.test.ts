import { describe, expect, it, vi } from "vitest";

import {
  createLimsWritebackAdapter,
  type LimsWritebackRequestPayload
} from "../src/index";

function requestPayload(): LimsWritebackRequestPayload {
  return {
    id: "demo-writeback-request-001",
    recognitionResultId: "demo-result-001",
    limsSampleId: "DEMO-SAMPLE-A",
    requestedByUserId: "demo-user-reviewer",
    requestedAt: "2026-06-04T08:15:00.000Z",
    fields: [
      {
        sourceFieldKey: "sampleType",
        targetFieldKey: "lims_sample_type",
        value: "tissue"
      }
    ],
    payload: {
      clinicalInfo: {
        sampleType: "tissue"
      }
    }
  };
}

describe("LIMS writeback adapter", () => {
  it("writes payload successfully and maps receipt id", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            status: "OK",
            receiptId: "DEMO-RECEIPT-001"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const adapter = createLimsWritebackAdapter({
      endpoint: "https://lims.example.test/api/clinical-info/writeback",
      headers: { Authorization: "Bearer lims-token" },
      responseMapping: {
        statusPath: "result.status",
        successValue: "OK",
        receiptIdPath: "result.receiptId"
      },
      fetchFn: fetchMock
    });

    const result = await adapter.execute(requestPayload());

    expect(result.status).toBe("success");
    expect(result.externalReceiptId).toBe("DEMO-RECEIPT-001");
  });

  it("propagates idempotency key in headers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createLimsWritebackAdapter({
      endpoint: "https://lims.example.test/api/clinical-info/writeback",
      idempotencyKeyHeader: "Idempotency-Key",
      responseMapping: {
        statusPath: "status",
        successValue: "ok"
      },
      fetchFn: fetchMock
    });

    await adapter.execute({
      ...requestPayload(),
      idempotencyKey: "idem-demo-001"
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({
      "Idempotency-Key": "idem-demo-001"
    });
  });

  it("preserves retryable flag and error message on failed writeback response", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            status: "FAILED"
          },
          error: {
            message: "DEMO_WRITEBACK_UNAVAILABLE",
            retryable: true
          }
        }),
        { status: 503, headers: { "content-type": "application/json" } }
      )
    );
    const adapter = createLimsWritebackAdapter({
      endpoint: "https://lims.example.test/api/clinical-info/writeback",
      maxRetries: 0,
      responseMapping: {
        statusPath: "result.status",
        successValue: "OK",
        errorMessagePath: "error.message",
        retryablePath: "error.retryable"
      },
      fetchFn: fetchMock
    });

    const result = await adapter.execute(requestPayload());

    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(true);
    expect(result.errorMessage).toBe("DEMO_WRITEBACK_UNAVAILABLE");
  });
});
