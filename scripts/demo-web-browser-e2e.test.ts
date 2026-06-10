import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildBrowserE2EBlockedSummary,
  buildBrowserE2EPassedSummary,
  buildDefaultBrowserE2EConfig,
  classifyBrowserE2EStatus,
  normalizeScreenshotName
} from "./demo-web-browser-e2e";

const browserE2ESource = readFileSync(new URL("./demo-web-browser-e2e.ts", import.meta.url), "utf8");

describe("demo-web browser E2E contract", () => {
  it("builds default coverage for required desktop and mobile routes", () => {
    const config = buildDefaultBrowserE2EConfig({
      DEMO_WEB_BROWSER_E2E_BASE_URL: "http://127.0.0.1:5173",
      DEMO_WEB_BROWSER_E2E_SCREENSHOT_DIR: "ui-parity-screenshots/medical-e2e-current"
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:5173");
    expect(config.screenshotDir).toBe("ui-parity-screenshots/medical-e2e-current");
    expect(config.routes.map((route) => route.path)).toEqual([
      "/login",
      "/",
      "/recognition/new",
      "/recognition/jobs/demo",
      "/providers",
      "/writeback"
    ]);
    expect(config.viewports.map((viewport) => viewport.name)).toEqual(["desktop", "mobile"]);
  });

  it("normalizes screenshot names into a controlled directory-safe format", () => {
    expect(normalizeScreenshotName("desktop", "/recognition/jobs/demo")).toBe("desktop-recognition-jobs-demo.png");
    expect(normalizeScreenshotName("mobile", "/")).toBe("mobile-home.png");
  });

  it("classifies passed and blocked summaries without conflating them", () => {
    expect(classifyBrowserE2EStatus({ browserE2E: "passed" })).toBe("passed");
    expect(classifyBrowserE2EStatus({ browserE2E: "blocked" })).toBe("blocked");
  });

  it("builds an explicit blocked summary when Playwright/browser dependencies are unavailable", () => {
    const summary = buildBrowserE2EBlockedSummary({
      reason: "playwright dependency is not installed",
      engine: "playwright",
      screenshotDir: "ui-parity-screenshots/medical-e2e-current"
    });

    expect(summary).toEqual({
      ok: false,
      browserE2E: "blocked",
      engine: "playwright",
      reason: "playwright dependency is not installed",
      checkedRoutes: [],
      screenshots: [],
      screenshotDir: "ui-parity-screenshots/medical-e2e-current"
    });
  });

  it("builds a passed summary with screenshots for all required routes", () => {
    const summary = buildBrowserE2EPassedSummary({
      engine: "playwright",
      screenshotDir: "ui-parity-screenshots/medical-e2e-current",
      checkedRoutes: ["/login", "/", "/recognition/new", "/recognition/jobs/demo", "/providers", "/writeback"],
      screenshots: [
        "ui-parity-screenshots/medical-e2e-current/desktop-login.png",
        "ui-parity-screenshots/medical-e2e-current/mobile-home.png"
      ]
    });

    expect(summary.browserE2E).toBe("passed");
    expect(summary.ok).toBe(true);
    expect(summary.checkedRoutes).toContain("/recognition/new");
    expect(summary.screenshots).toHaveLength(2);
  });

  it("keeps Playwright and Chrome CDP branches on the same route and mobile layout assertions", () => {
    const playwrightBranch = browserE2ESource.slice(
      browserE2ESource.indexOf("async function runWithPlaywright"),
      browserE2ESource.indexOf("export async function runDemoWebBrowserE2E")
    );

    expect(playwrightBranch).toContain("assertRoute(");
    expect(playwrightBranch).toContain("assertMobileLayout(");
    expect(playwrightBranch).toContain("waitForRouteReady");
    expect(browserE2ESource).toContain("routeTextOk");
  });

  it("does not block route readiness on document complete because external fonts can keep pages interactive", () => {
    const waitForRouteReadySource = browserE2ESource.slice(
      browserE2ESource.indexOf("async function waitForRouteReady"),
      browserE2ESource.indexOf("async function assertRoute")
    );

    expect(waitForRouteReadySource).toContain("hasRenderedContent");
    expect(waitForRouteReadySource).toContain("value.path === expectedPath");
    expect(waitForRouteReadySource).not.toContain('value.readyState === "complete"');
  });

  it("blocks external Google font requests during browser E2E to keep local route readiness deterministic", () => {
    expect(browserE2ESource).toContain("browserE2EBlockedUrlPatterns");
    expect(browserE2ESource).toContain("*://fonts.googleapis.com/*");
    expect(browserE2ESource).toContain("*://fonts.gstatic.com/*");
    expect(browserE2ESource).toContain("Network.setBlockedURLs");
    expect(browserE2ESource).toContain("routeCapablePage.route");
  });

  it("closes the mobile navigation drawer before taking screenshots", () => {
    expect(browserE2ESource).toContain("closeMobileDrawerForScreenshot");
    expect(browserE2ESource).toContain("assertMainContentReadyForScreenshot");
    expect(browserE2ESource).toContain("findVisibleViewportOverlay");
    expect(browserE2ESource).toContain("overlayOk");
    expect(browserE2ESource).toContain('[aria-label="关闭导航菜单"]');
    expect(browserE2ESource).toMatch(/await assertMobileLayout\(page,\s*input\.route\);[\s\S]*await closeMobileDrawerForScreenshot\(page\);[\s\S]*await assertMainContentReadyForScreenshot\(page,\s*input\.route\);[\s\S]*Page\.captureScreenshot/);
    expect(browserE2ESource).toMatch(/await assertMobileLayout\(pageEvaluator,\s*route\);[\s\S]*await closeMobileDrawerForScreenshot\(pageEvaluator\);[\s\S]*await assertMainContentReadyForScreenshot\(pageEvaluator,\s*route\);[\s\S]*page\.screenshot/);
  });

  it("reports unavailable Playwright browsers as blocked instead of failed browser E2E", () => {
    expect(browserE2ESource).toContain("Playwright browser unavailable");
    expect(browserE2ESource).toContain('browserE2E: "blocked"');
  });
});
