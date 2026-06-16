import { describe, expect, it } from "vitest";

import {
  buildDemoWebSmokeSummary,
  classifyDemoWebRoute,
  extractAssetPaths,
  isHealthyApiPayload,
  resolveDemoWebRouteUrl
} from "./demo-web-basic-e2e";

describe("demo-web basic E2E helpers", () => {
  it("resolves SPA routes against the dev server origin", () => {
    expect(resolveDemoWebRouteUrl("http://127.0.0.1:5173", "/recognition/new")).toBe("http://127.0.0.1:5173/recognition/new");
    expect(resolveDemoWebRouteUrl("http://127.0.0.1:5173/", "login")).toBe("http://127.0.0.1:5173/login");
  });

  it("extracts Vite entry assets from HTML", () => {
    const html = `
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
      <link rel="stylesheet" href="/assets/index.css">
    `;

    expect(extractAssetPaths(html)).toEqual(["/src/main.tsx", "/assets/index.css"]);
  });

  it("classifies login, home shell and critical SPA routes for local runtime smoke", () => {
    expect(classifyDemoWebRoute("/login")).toBe("login");
    expect(classifyDemoWebRoute("/")).toBe("home-shell");
    expect(classifyDemoWebRoute("/recognition/new")).toBe("critical-route");
    expect(classifyDemoWebRoute("/providers")).toBe("critical-route");
  });

  it("recognizes API health payload without depending on a real external sandbox", () => {
    expect(isHealthyApiPayload({ status: "ok", service: "medical-record-agent-api" })).toBe(true);
    expect(isHealthyApiPayload({ status: "ok", service: "other" })).toBe(false);
    expect(isHealthyApiPayload("ok")).toBe(false);
  });

  it("builds an explicit mock-runtime smoke summary instead of pretending browser E2E ran", () => {
    const summary = buildDemoWebSmokeSummary({
      mode: "mock-runtime",
      checks: [
        {
          route: "/login",
          kind: "login",
          url: "http://127.0.0.1:5173/login",
          ok: true,
          status: 200,
          assets: ["/src/main.tsx"]
        },
        {
          route: "/",
          kind: "home-shell",
          url: "http://127.0.0.1:5173/",
          ok: true,
          status: 200,
          assets: ["/src/main.tsx"]
        },
        {
          route: "/recognition/new",
          kind: "critical-route",
          url: "http://127.0.0.1:5173/recognition/new",
          ok: true,
          status: 200,
          assets: ["/src/main.tsx"]
        }
      ],
      apiHealth: {
        ok: true,
        url: "http://127.0.0.1:5173/api/health",
        status: 200
      },
      dist: {
        ok: true,
        indexPath: "medical-ui/dist/index.html",
        assets: ["/assets/index-CURRENT.js"]
      }
    });

    expect(summary).toEqual({
      ok: true,
      mode: "mock-runtime",
      browserE2E: "not-run",
      routeKinds: ["login", "home-shell", "critical-route"],
      checkedRoutes: ["/login", "/", "/recognition/new"],
      apiHealthOk: true,
      distBundleOk: true
    });
  });
});
