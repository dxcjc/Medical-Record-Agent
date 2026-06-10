import { describe, expect, it } from "vitest";

import { getInitialLoginCredentials, isDemoAuthPrefillEnabled } from "./LoginPage";

describe("LoginPage demo credentials guard", () => {
  it("生产环境默认不预填 demo 凭据", () => {
    const env = { DEV: false, MODE: "production" };

    expect(isDemoAuthPrefillEnabled(env)).toBe(false);
    expect(getInitialLoginCredentials(env)).toEqual({
      email: "",
      password: ""
    });
  });

  it("开发或显式 demo 环境才预填默认凭据", () => {
    expect(isDemoAuthPrefillEnabled({ DEV: true, MODE: "development" })).toBe(true);
    expect(isDemoAuthPrefillEnabled({ DEV: false, MODE: "production", VITE_DEMO_AUTH_ENABLED: "true" })).toBe(true);
    expect(getInitialLoginCredentials({ DEV: true, MODE: "development" }).email).toBe("demo@example.local");
  });
});
