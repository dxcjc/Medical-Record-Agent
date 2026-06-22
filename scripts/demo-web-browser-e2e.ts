import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

import { isCliEntrypoint } from "./production-smoke";

export type BrowserE2EStatus = "passed" | "blocked";

export type BrowserE2EViewport = {
  name: "desktop" | "mobile";
  width: number;
  height: number;
  isMobile: boolean;
};

export type BrowserE2ERoute = {
  path: string;
  requiresAuth: boolean;
};

export type BrowserE2EConfig = {
  baseUrl: string;
  screenshotDir: string;
  routes: BrowserE2ERoute[];
  viewports: BrowserE2EViewport[];
  startupTimeoutMs: number;
  navigationTimeoutMs: number;
};

export type BrowserE2EPassedSummary = {
  ok: true;
  browserE2E: "passed";
  engine: string;
  checkedRoutes: string[];
  screenshots: string[];
  screenshotDir: string;
};

export type BrowserE2EBlockedSummary = {
  ok: false;
  browserE2E: "blocked";
  engine: string;
  reason: string;
  checkedRoutes: string[];
  screenshots: string[];
  screenshotDir: string;
};

export type BrowserE2ESummary = BrowserE2EPassedSummary | BrowserE2EBlockedSummary;

type CdpResult<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

type CdpTargetCreated = {
  targetId: string;
};

type CdpSessionAttached = {
  sessionId: string;
};

type CdpRuntimeEvaluation = {
  result?: {
    value?: unknown;
  };
};

type CdpScreenshot = {
  data: string;
};

type BrowserPageEvaluator = {
  evaluate<T>(expression: string, awaitPromise?: boolean): Promise<T>;
};

const browserE2EBlockedUrlPatterns = ["*://fonts.googleapis.com/*", "*://fonts.gstatic.com/*"];

const authStorageKey = "medical-record-agent.auth";
const browserE2EAuth = {
  token: "browser-e2e-token",
  user: {
    id: "browser-e2e-user",
    email: "browser-e2e@example.local",
    displayName: "浏览器验收"
  },
  permissions: [
    "job:create",
    "job:read",
    "schema:read",
    "schema:publish",
    "evaluation:manage",
    "feedback:create",
    "audit:read",
    "writeback:execute",
    "provider:manage"
  ],
  roles: ["admin"]
};

export function buildDefaultBrowserE2EConfig(env: Record<string, string | undefined> = process.env): BrowserE2EConfig {
  return {
    baseUrl: (env.DEMO_WEB_BROWSER_E2E_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, ""),
    screenshotDir: env.DEMO_WEB_BROWSER_E2E_SCREENSHOT_DIR ?? "ui-parity-screenshots/medical-e2e-current",
    routes: (env.DEMO_WEB_BROWSER_E2E_ROUTES ?? "/login,/,/recognition/new,/recognition/jobs/demo,/providers,/writeback")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => ({
        path,
        requiresAuth: path !== "/login"
      })),
    viewports: [
      {
        name: "desktop",
        width: Number(env.DEMO_WEB_BROWSER_E2E_DESKTOP_WIDTH ?? 1440),
        height: Number(env.DEMO_WEB_BROWSER_E2E_DESKTOP_HEIGHT ?? 1000),
        isMobile: false
      },
      {
        name: "mobile",
        width: Number(env.DEMO_WEB_BROWSER_E2E_MOBILE_WIDTH ?? 390),
        height: Number(env.DEMO_WEB_BROWSER_E2E_MOBILE_HEIGHT ?? 844),
        isMobile: true
      }
    ],
    startupTimeoutMs: Number(env.DEMO_WEB_BROWSER_E2E_STARTUP_TIMEOUT_MS ?? 15000),
    navigationTimeoutMs: Number(env.DEMO_WEB_BROWSER_E2E_NAVIGATION_TIMEOUT_MS ?? 12000)
  };
}

export function normalizeScreenshotName(viewportName: string, routePath: string) {
  const routePart = routePath === "/" ? "home" : routePath.replace(/^\/+/u, "").replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return `${viewportName}-${routePart}.png`;
}

export function classifyBrowserE2EStatus(summary: Pick<BrowserE2ESummary, "browserE2E">) {
  return summary.browserE2E;
}

export function buildBrowserE2EBlockedSummary(input: { reason: string; engine: string; screenshotDir: string }): BrowserE2EBlockedSummary {
  return {
    ok: false,
    browserE2E: "blocked",
    engine: input.engine,
    reason: input.reason,
    checkedRoutes: [],
    screenshots: [],
    screenshotDir: input.screenshotDir
  };
}

export function buildBrowserE2EPassedSummary(input: {
  engine: string;
  screenshotDir: string;
  checkedRoutes: string[];
  screenshots: string[];
}): BrowserE2EPassedSummary {
  return {
    ok: true,
    browserE2E: "passed",
    engine: input.engine,
    checkedRoutes: input.checkedRoutes,
    screenshots: input.screenshots,
    screenshotDir: input.screenshotDir
  };
}

function resolveDemoWebRouteUrl(baseUrl: string, route: string) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${baseUrl}${normalizedRoute}`;
}

async function isHttpReady(url: string) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHttp(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`demo-web dev server 未在 ${timeoutMs}ms 内就绪：${String(lastError)}`);
}

function startDevServer(baseUrl: string) {
  const parsed = new URL(baseUrl);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");

  return spawn("corepack", ["pnpm", "--dir", "apps/web", "exec", "vite", "--host", parsed.hostname, "--port", port, "--strictPort"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "pipe"
  });
}

async function ensureDevServer(config: BrowserE2EConfig) {
  const loginUrl = resolveDemoWebRouteUrl(config.baseUrl, "/login");
  if (await isHttpReady(loginUrl)) {
    return null;
  }

  const server = startDevServer(config.baseUrl);
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHttp(loginUrl, config.startupTimeoutMs);

  return server;
}

async function stopProcess(processHandle: ChildProcessWithoutNullStreams | null) {
  if (!processHandle || processHandle.exitCode !== null) {
    return;
  }

  const pid = processHandle.pid;
  if (!pid) {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    processHandle.kill("SIGTERM");
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  if (processHandle.exitCode === null) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      processHandle.kill("SIGKILL");
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAuthInitScript() {
  return `window.localStorage.setItem(${JSON.stringify(authStorageKey)}, ${JSON.stringify(JSON.stringify(browserE2EAuth))});`;
}

function readChromeExecutable(env: Record<string, string | undefined> = process.env) {
  const candidates = [
    env.DEMO_WEB_BROWSER_E2E_CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForChromeBrowserWebSocket(port: number, timeoutMs: number) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(versionUrl);
      const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
      if (response.ok && payload.webSocketDebuggerUrl) {
        return payload.webSocketDebuggerUrl;
      }
      lastError = new Error(`Chrome debugger HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(150);
  }

  throw new Error(`Chrome debugger 未在 ${timeoutMs}ms 内就绪：${String(lastError)}`);
}

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(private readonly webSocket: WebSocket) {
    this.webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResult<unknown> & { id?: number };
      if (typeof message.id !== "number") {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Chrome DevTools Protocol error"));
        return;
      }

      pending.resolve(message.result);
    });
  }

  send<T>(method: string, params?: Record<string, unknown>, sessionId?: string) {
    const id = this.nextId;
    this.nextId += 1;

    const message: Record<string, unknown> = {
      id,
      method
    };

    if (params) {
      message.params = params;
    }

    if (sessionId) {
      message.sessionId = sessionId;
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
    });

    this.webSocket.send(JSON.stringify(message));
    return promise;
  }

  close() {
    this.webSocket.close();
  }
}

async function connectCdp(webSocketUrl: string) {
  const webSocket = new WebSocket(webSocketUrl);
  await new Promise<void>((resolve, reject) => {
    webSocket.addEventListener("open", () => resolve(), { once: true });
    webSocket.addEventListener("error", () => reject(new Error("无法连接 Chrome DevTools WebSocket")), { once: true });
  });

  return new CdpConnection(webSocket);
}

async function evaluateInPage<T>(client: CdpConnection, sessionId: string, expression: string, awaitPromise = false) {
  const evaluation = await client.send<CdpRuntimeEvaluation>(
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,
      awaitPromise
    },
    sessionId
  );

  return evaluation.result?.value as T;
}

function createCdpPageEvaluator(client: CdpConnection, sessionId: string): BrowserPageEvaluator {
  return {
    evaluate: (expression, awaitPromise) => evaluateInPage(client, sessionId, expression, awaitPromise)
  };
}

async function waitForRouteReady(page: BrowserPageEvaluator, expectedPath: string, timeoutMs: number) {
  const startedAt = Date.now();
  let lastValue: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await page.evaluate(`({
      readyState: document.readyState,
      path: window.location.pathname,
      hasRoot: Boolean(document.querySelector("#root")),
      hasRenderedContent: Boolean(document.querySelector("#root")?.firstElementChild),
      isLoading: Boolean(document.querySelector(".route-loading"))
    })`);

    const value = lastValue as {
      readyState?: string;
      path?: string;
      hasRoot?: boolean;
      hasRenderedContent?: boolean;
      isLoading?: boolean;
    };
    if (value.path === expectedPath && value.hasRoot && value.hasRenderedContent && !value.isLoading) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`路由 ${expectedPath} 未在 ${timeoutMs}ms 内就绪：${JSON.stringify(lastValue)}`);
}

async function assertRoute(page: BrowserPageEvaluator, route: BrowserE2ERoute, viewport: BrowserE2EViewport) {
  const assertion = await page.evaluate<{ ok: boolean; detail: string }>(
    `(() => {
      const text = document.body.innerText;
      const shell = document.querySelector(".app-shell");
      const main = document.querySelector("#main-content");
      const login = document.querySelector(".login-screen");
      const widthOk = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;

      if (${JSON.stringify(route.path)} === "/login") {
        return {
          ok: Boolean(login) && text.includes("登录临床工作台") && widthOk,
          detail: "login=" + Boolean(login) + ",widthOk=" + widthOk
        };
      }

      const routeTextOk =
        ${JSON.stringify(route.path)} === "/" ||
        (${JSON.stringify(route.path)} === "/recognition/new" && text.includes("新建识别")) ||
        (${JSON.stringify(route.path)} === "/recognition/jobs/demo" && (text.includes("任务详情") || text.includes("字段证据"))) ||
        (${JSON.stringify(route.path)} === "/providers" && text.toLowerCase().includes("provider")) ||
        (${JSON.stringify(route.path)} === "/writeback" && text.includes("写回"));

      return {
        ok: Boolean(shell) && Boolean(main) && routeTextOk && widthOk,
        detail: "shell=" + Boolean(shell) + ",main=" + Boolean(main) + ",routeTextOk=" + routeTextOk + ",widthOk=" + widthOk
      };
    })()`
  );

  if (!assertion.ok) {
    throw new Error(`${viewport.name} ${route.path} 浏览器断言失败：${assertion.detail}`);
  }
}

async function assertMobileLayout(page: BrowserPageEvaluator, route: BrowserE2ERoute) {
  if (route.path === "/login") {
    return;
  }

  const assertion = await page.evaluate<{ ok: boolean; detail: string }>(
    `new Promise((resolve) => {
      const desktopSidebar = document.querySelector(".app-shell > .app-sidebar");
      const menuButton = document.querySelector('[aria-label="打开导航菜单"]');
      const rect = menuButton ? menuButton.getBoundingClientRect() : { width: 0, height: 0 };
      const sidebarHidden = desktopSidebar ? window.getComputedStyle(desktopSidebar).display === "none" : false;
      const menuTouchOk = rect.width >= 44 && rect.height >= 44;
      if (menuButton instanceof HTMLElement) {
        menuButton.click();
      }
      window.setTimeout(() => {
        const drawerNav = document.querySelector(".mobile-sidebar-drawer .side-nav");
        resolve({
          ok: sidebarHidden && menuTouchOk && Boolean(drawerNav),
          detail: "sidebarHidden=" + sidebarHidden + ",menuTouchOk=" + menuTouchOk + ",drawerNav=" + Boolean(drawerNav)
        });
      }, 250);
    })`,
    true
  );

  if (!assertion.ok) {
    throw new Error(`mobile ${route.path} 导航抽屉断言失败：${assertion.detail}`);
  }
}

async function closeMobileDrawerForScreenshot(page: BrowserPageEvaluator) {
  const assertion = await page.evaluate<{ ok: boolean; detail: string }>(
    `new Promise((resolve) => {
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.left < window.innerWidth &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.01
        );
      };
      const findVisibleViewportOverlay = () => Array.from(document.body.querySelectorAll("*")).find((element) => {
        if (!(element instanceof Element)) {
          return false;
        }
        if (element.closest(".arco-trigger")) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const coversViewport =
          rect.left <= 1 &&
          rect.top <= 1 &&
          rect.right >= window.innerWidth - 1 &&
          rect.bottom >= window.innerHeight - 1;
        const overlayPosition = style.position === "fixed" || style.position === "absolute";
        const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
        const hasOverlayClass = /(?:mask|drawer|modal)/i.test(element.className.toString());
        const hasOverlayColor =
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          style.backgroundColor !== "transparent" &&
          !style.backgroundColor.includes("255, 255, 255");
        return coversViewport && overlayPosition && visible && (hasOverlayClass || hasOverlayColor);
      });
      const closeButton = document.querySelector('[aria-label="关闭导航菜单"]');
      if (closeButton instanceof HTMLElement) {
        closeButton.click();
      }
      const startedAt = Date.now();
      const checkClosed = () => {
        const visibleDrawerNav = Array.from(document.querySelectorAll(".mobile-sidebar-drawer .side-nav, .mobile-sidebar-drawer .mobile-sidebar")).some(isVisible);
        const visibleMask = Array.from(document.querySelectorAll(".arco-drawer-mask")).some(isVisible);
        const visibleViewportOverlay = findVisibleViewportOverlay();
        if (!visibleDrawerNav && !visibleMask && !visibleViewportOverlay) {
          resolve({
            ok: true,
            detail: "visibleDrawerNav=false,visibleMask=false,overlay=false"
          });
          return;
        }
        if (Date.now() - startedAt > 2000) {
          resolve({
            ok: false,
            detail:
              "visibleDrawerNav=" + visibleDrawerNav +
              ",visibleMask=" + visibleMask +
              ",overlay=" + (visibleViewportOverlay ? visibleViewportOverlay.className : "false")
          });
          return;
        }
        window.setTimeout(checkClosed, 50);
      };
      checkClosed();
    })`,
    true
  );

  if (!assertion.ok) {
    throw new Error(`mobile 导航抽屉截图前未关闭：${assertion.detail}`);
  }
}

async function assertMainContentReadyForScreenshot(page: BrowserPageEvaluator, route: BrowserE2ERoute) {
  const assertion = await page.evaluate<{ ok: boolean; detail: string }>(
    `(() => {
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.left < window.innerWidth &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.01
        );
      };
      const findVisibleViewportOverlay = () => Array.from(document.body.querySelectorAll("*")).find((element) => {
        if (!(element instanceof Element)) {
          return false;
        }
        if (element.closest(".arco-trigger")) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const coversViewport =
          rect.left <= 1 &&
          rect.top <= 1 &&
          rect.right >= window.innerWidth - 1 &&
          rect.bottom >= window.innerHeight - 1;
        const overlayPosition = style.position === "fixed" || style.position === "absolute";
        const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
        const hasOverlayClass = /(?:mask|drawer|modal)/i.test(element.className.toString());
        const hasOverlayColor =
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          style.backgroundColor !== "transparent" &&
          !style.backgroundColor.includes("255, 255, 255");
        return coversViewport && overlayPosition && visible && (hasOverlayClass || hasOverlayColor);
      });
      const path = ${JSON.stringify(route.path)};
      const main = document.querySelector("#main-content");
      const visibleDrawerNav = Array.from(document.querySelectorAll(".mobile-sidebar-drawer .side-nav, .mobile-sidebar-drawer .mobile-sidebar")).some(isVisible);
      const visibleViewportOverlay = findVisibleViewportOverlay();
      const overlayOk = !visibleViewportOverlay;
      const widthOk = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2;
      const menuButton = document.querySelector('[aria-label="打开导航菜单"]');
      const menuRect = menuButton ? menuButton.getBoundingClientRect() : { width: 0, height: 0 };
      const menuTouchOk = path === "/login" || (menuRect.width >= 44 && menuRect.height >= 44);

      const cardsFit = Array.from(document.querySelectorAll(".panel, .page-header")).every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width <= document.documentElement.clientWidth + 2;
      });

      if (path === "/login") {
        const login = document.querySelector(".login-screen");
        return {
          ok: Boolean(login) && !visibleDrawerNav && overlayOk && widthOk && cardsFit,
          detail:
            "login=" + Boolean(login) +
            ",visibleDrawerNav=" + visibleDrawerNav +
            ",overlayOk=" + overlayOk +
            ",widthOk=" + widthOk +
            ",cardsFit=" + cardsFit
        };
      }

      if (path === "/recognition/new") {
        const privacyOptions = Array.from(document.querySelectorAll(".privacy-option"));
        const privacyTouchOk = privacyOptions.length >= 2 && privacyOptions.every((option) => option.getBoundingClientRect().height >= 44);
        const privacyCheckboxTargets = Array.from(document.querySelectorAll(".privacy-option__checkbox"));
        const checkboxTouchOk = privacyCheckboxTargets.length >= 2 && privacyCheckboxTargets.every((target) => {
          const rect = target.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        });
        const buttons = Array.from(document.querySelectorAll(".recognition-actions-card .arco-btn"));
        const buttonTouchOk = buttons.length >= 1 && buttons.every((button) => button.getBoundingClientRect().height >= 44);
        const requiredSectionsOk =
          Boolean(document.querySelector(".recognition-upload-card")) &&
          Boolean(document.querySelector(".recognition-form-grid")) &&
          Boolean(document.querySelector(".recognition-privacy-card")) &&
          Boolean(document.querySelector(".recognition-actions-card"));
        return {
          ok: Boolean(main) && !visibleDrawerNav && overlayOk && widthOk && menuTouchOk && cardsFit && requiredSectionsOk && privacyTouchOk && checkboxTouchOk && buttonTouchOk,
          detail:
            "main=" + Boolean(main) +
            ",visibleDrawerNav=" + visibleDrawerNav +
            ",overlayOk=" + overlayOk +
            ",widthOk=" + widthOk +
            ",menuTouchOk=" + menuTouchOk +
            ",cardsFit=" + cardsFit +
            ",requiredSectionsOk=" + requiredSectionsOk +
            ",privacyTouchOk=" + privacyTouchOk +
            ",checkboxTouchOk=" + checkboxTouchOk +
            ",buttonTouchOk=" + buttonTouchOk
        };
      }

      if (path === "/") {
        const dashboardOk =
          Boolean(document.querySelector(".data-table-card")) &&
          document.body.innerText.includes("最近任务") &&
          Boolean(document.querySelector(".table-scroll"));
        return {
          ok: Boolean(main) && !visibleDrawerNav && overlayOk && widthOk && menuTouchOk && cardsFit && dashboardOk,
          detail:
            "main=" + Boolean(main) +
            ",visibleDrawerNav=" + visibleDrawerNav +
            ",overlayOk=" + overlayOk +
            ",widthOk=" + widthOk +
            ",menuTouchOk=" + menuTouchOk +
            ",cardsFit=" + cardsFit +
            ",dashboardOk=" + dashboardOk
        };
      }

      return {
        ok: Boolean(main) && !visibleDrawerNav && overlayOk && widthOk && menuTouchOk && cardsFit,
        detail:
          "main=" + Boolean(main) +
          ",visibleDrawerNav=" + visibleDrawerNav +
          ",overlayOk=" + overlayOk +
          ",widthOk=" + widthOk +
          ",menuTouchOk=" + menuTouchOk +
          ",cardsFit=" + cardsFit
      };
    })()`
  );

  if (!assertion.ok) {
    throw new Error(`${route.path} 截图前主体布局断言失败：${assertion.detail}`);
  }
}

async function runRouteViaCdp(input: {
  client: CdpConnection;
  config: BrowserE2EConfig;
  route: BrowserE2ERoute;
  viewport: BrowserE2EViewport;
  screenshotPath: string;
}) {
  const context = await input.client.send<{ browserContextId: string }>("Target.createBrowserContext");
  const target = await input.client.send<CdpTargetCreated>("Target.createTarget", {
    url: "about:blank",
    browserContextId: context.browserContextId
  });
  const attached = await input.client.send<CdpSessionAttached>("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true
  });
  const sessionId = attached.sessionId;

  try {
    const page = createCdpPageEvaluator(input.client, sessionId);
    await input.client.send("Page.enable", undefined, sessionId);
    await input.client.send("Runtime.enable", undefined, sessionId);
    await input.client.send("Network.enable", undefined, sessionId);
    await input.client.send(
      "Network.setBlockedURLs",
      {
        urls: browserE2EBlockedUrlPatterns
      },
      sessionId
    );
    await input.client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: input.viewport.width,
        height: input.viewport.height,
        deviceScaleFactor: input.viewport.isMobile ? 2 : 1,
        mobile: input.viewport.isMobile
      },
      sessionId
    );
    await input.client.send(
      "Emulation.setTouchEmulationEnabled",
      {
        enabled: input.viewport.isMobile
      },
      sessionId
    );

    if (input.route.requiresAuth) {
      await input.client.send(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source: createAuthInitScript()
        },
        sessionId
      );
    }

    await input.client.send(
      "Page.navigate",
      {
        url: resolveDemoWebRouteUrl(input.config.baseUrl, input.route.path)
      },
      sessionId
    );
    await waitForRouteReady(page, input.route.path, input.config.navigationTimeoutMs);
    await sleep(750);
    await assertRoute(page, input.route, input.viewport);

    if (input.viewport.isMobile) {
      await assertMobileLayout(page, input.route);
      await closeMobileDrawerForScreenshot(page);
      await assertMainContentReadyForScreenshot(page, input.route);
    }

    const screenshot = await input.client.send<CdpScreenshot>(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: input.viewport.isMobile
      },
      sessionId
    );
    await writeFile(input.screenshotPath, Buffer.from(screenshot.data, "base64"));
  } finally {
    await input.client.send("Target.closeTarget", { targetId: target.targetId });
    await input.client.send("Target.disposeBrowserContext", { browserContextId: context.browserContextId });
  }
}

async function runWithChromeCdp(config: BrowserE2EConfig): Promise<BrowserE2ESummary> {
  const chromePath = readChromeExecutable();
  if (!chromePath) {
    return buildBrowserE2EBlockedSummary({
      engine: "playwright/chrome-cdp",
      reason: "playwright dependency is not installed and no Chrome executable was found",
      screenshotDir: config.screenshotDir
    });
  }

  const port = await findFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "medical-browser-e2e-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    {
      stdio: "pipe"
    }
  );
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const webSocketUrl = await waitForChromeBrowserWebSocket(port, config.startupTimeoutMs);
    const client = await connectCdp(webSocketUrl);
    const screenshots: string[] = [];
    const checkedRoutes = new Set<string>();
    await mkdir(config.screenshotDir, { recursive: true });

    try {
      for (const viewport of config.viewports) {
        for (const route of config.routes) {
          const screenshotPath = join(config.screenshotDir, normalizeScreenshotName(viewport.name, route.path));
          await runRouteViaCdp({
            client,
            config,
            route,
            viewport,
            screenshotPath
          });
          screenshots.push(screenshotPath);
          checkedRoutes.add(route.path);
        }
      }
    } finally {
      client.close();
    }

    return buildBrowserE2EPassedSummary({
      engine: "chrome-cdp",
      screenshotDir: config.screenshotDir,
      checkedRoutes: Array.from(checkedRoutes),
      screenshots
    });
  } catch (error) {
    if (stderr.includes("error while loading shared libraries") || stderr.includes("Missing X server")) {
      return buildBrowserE2EBlockedSummary({
        engine: "chrome-cdp",
        reason: `Chrome browser unavailable: ${stderr.trim()}`,
        screenshotDir: config.screenshotDir
      });
    }

    throw error;
  } finally {
    chrome.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      chrome.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    if (chrome.exitCode === null) {
      chrome.kill("SIGKILL");
    }
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function tryLoadPlaywright() {
  try {
    const moduleName = "playwright";
    return (await import(moduleName)) as {
      chromium?: {
        launch: (options: Record<string, unknown>) => Promise<unknown>;
      };
    };
  } catch {
    return null;
  }
}

async function runWithPlaywright(config: BrowserE2EConfig, playwright: Awaited<ReturnType<typeof tryLoadPlaywright>>) {
  if (!playwright?.chromium) {
    return buildBrowserE2EBlockedSummary({
      engine: "playwright",
      reason: "playwright chromium launcher is unavailable",
      screenshotDir: config.screenshotDir
    });
  }

  let browser: {
    newContext: (options: Record<string, unknown>) => Promise<{
      addInitScript: (source: string) => Promise<void>;
      newPage: () => Promise<{
        goto: (url: string, options: Record<string, unknown>) => Promise<void>;
        waitForTimeout: (ms: number) => Promise<void>;
        evaluate: <T>(fn: string | (() => T | Promise<T>)) => Promise<T>;
        screenshot: (options: { path: string; fullPage?: boolean }) => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  };

  try {
    browser = (await playwright.chromium.launch({
      headless: true
    })) as typeof browser;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return buildBrowserE2EBlockedSummary({
      engine: "playwright",
      reason: `Playwright browser unavailable: ${reason}`,
      screenshotDir: config.screenshotDir
    });
  }

  const screenshots: string[] = [];
  const checkedRoutes = new Set<string>();
  await mkdir(config.screenshotDir, { recursive: true });

  try {
    for (const viewport of config.viewports) {
      for (const route of config.routes) {
        const context = await browser.newContext({
          viewport: {
            width: viewport.width,
            height: viewport.height
          },
          isMobile: viewport.isMobile,
          deviceScaleFactor: viewport.isMobile ? 2 : 1
        });

        try {
          if (route.requiresAuth) {
            await context.addInitScript(createAuthInitScript());
          }

          const page = await context.newPage();
          const routeCapablePage = page as typeof page & {
            route?: (url: string, handler: (route: { abort: () => Promise<void> }) => Promise<void>) => Promise<void>;
          };
          if (routeCapablePage.route) {
            for (const pattern of browserE2EBlockedUrlPatterns) {
              await routeCapablePage.route(pattern, async (requestRoute) => {
                await requestRoute.abort();
              });
            }
          }
          await page.goto(resolveDemoWebRouteUrl(config.baseUrl, route.path), {
            waitUntil: "domcontentloaded",
            timeout: config.navigationTimeoutMs
          });
          const pageEvaluator: BrowserPageEvaluator = {
            evaluate: (expression) => page.evaluate(expression)
          };
          await waitForRouteReady(pageEvaluator, route.path, config.navigationTimeoutMs);
          await page.waitForTimeout(750);
          await assertRoute(pageEvaluator, route, viewport);

          if (viewport.isMobile) {
            await assertMobileLayout(pageEvaluator, route);
            await closeMobileDrawerForScreenshot(pageEvaluator);
            await assertMainContentReadyForScreenshot(pageEvaluator, route);
          }

          const screenshotPath = join(config.screenshotDir, normalizeScreenshotName(viewport.name, route.path));
          await page.screenshot({ path: screenshotPath, fullPage: viewport.isMobile });
          screenshots.push(screenshotPath);
          checkedRoutes.add(route.path);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  return buildBrowserE2EPassedSummary({
    engine: "playwright",
    screenshotDir: config.screenshotDir,
    checkedRoutes: Array.from(checkedRoutes),
    screenshots
  });
}

export async function runDemoWebBrowserE2E(config: BrowserE2EConfig = buildDefaultBrowserE2EConfig()) {
  const devServer = await ensureDevServer(config);

  try {
    const playwright = await tryLoadPlaywright();
    if (playwright) {
      return await runWithPlaywright(config, playwright);
    }

    return await runWithChromeCdp(config);
  } finally {
    await stopProcess(devServer);
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  runDemoWebBrowserE2E()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      if (summary.browserE2E === "blocked") {
        process.exitCode = 2;
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
