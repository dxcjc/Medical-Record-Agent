import { describe, expect, it } from "vitest";

import { medicalQueryKeys } from "./queryKeys";

describe("medicalQueryKeys", () => {
  it("uses stable TanStack Query keys for dashboard runtime status", () => {
    expect(medicalQueryKeys.dashboard.runtime("http://localhost:3000")).toEqual([
      "medical-record-agent",
      "dashboard",
      "runtime",
      "http://localhost:3000"
    ]);
  });
});
