import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";

import { isCliEntrypoint } from "./production-smoke";

export interface DemoWebBasicE2EConfig {
  baseUrl: string;
  apiHealthUrl: string;
  distIndexPath: string;
  routes: string[];
  startupTimeoutMs: number;
}

export type DemoWebRouteKind = "login" | "home-shell" | "critical-route";

export interface DemoWebRouteCheck {
  route: string;
  kind: DemoWebRouteKind;
  url: string;
  ok: boolean;
  status: number;
  assets: string[];
}

export interface DemoWebApiHealthCheck {
  ok: boolean;
  url: string;
  status: number;
}

export interface DemoWebDistBundleCheck {
  ok: boolean;
  indexPath: string;
  assets: string[];
}

export interface DemoWebSmokeSummaryInput {
  mode: "mock-runtime" | "blocked";
  checks: DemoWebRouteCheck[];
  apiHealth: DemoWebApiHealthCheck;
  dist: DemoWebDistBundleCheck;
}

export function resolveDemoWebRouteUrl(baseUrl: string, route: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}

export function extractAssetPaths(html: string) {
  const assetPaths: string[] = [];
  const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/giu;
  let match = assetPattern.exec(html);

  while (match) {
    if (match[1]) {
      assetPaths.push(match[1]);
    }
    match = assetPattern.exec(html);
  }

  return assetPaths;
}

export function classifyDemoWebRoute(route: string): DemoWebRouteKind {
  if (route === "/login") {
    return "login";
  }

  if (route === "/") {
    return "home-shell";
  }

  return "critical-route";
}

export function isHealthyApiPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return record.status === "ok" && record.service === "medical-record-agent-api";
}

export function buildDemoWebSmokeSummary(input: DemoWebSmokeSummaryInput) {
  return {
    ok: input.checks.every((check) => check.ok) && input.apiHealth.ok && input.dist.ok,
    mode: input.mode,
    browserE2E: "not-run" as const,
    routeKinds: Array.from(new Set(input.checks.map((check) => check.kind))),
    checkedRoutes: input.checks.map((check) => check.route),
    apiHealthOk: input.apiHealth.ok,
    distBundleOk: input.dist.ok
  };
}

function buildDefaultConfig(env: Record<string, string | undefined> = process.env): DemoWebBasicE2EConfig {
  return {
    baseUrl: env.DEMO_WEB_E2E_BASE_URL ?? "http://127.0.0.1:5173",
    apiHealthUrl: env.DEMO_WEB_E2E_API_HEALTH_URL ?? "http://127.0.0.1:3000/api/health",
    distIndexPath: env.DEMO_WEB_E2E_DIST_INDEX ?? "apps/web/dist/index.html",
    routes: (env.DEMO_WEB_E2E_ROUTES ?? "/login,/,/recognition/new,/recognition/jobs/demo,/providers,/writeback").split(",").map((route) => route.trim()).filter(Boolean),
    startupTimeoutMs: Number(env.DEMO_WEB_E2E_STARTUP_TIMEOUT_MS ?? 15000)
  };
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

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`demo-web dev server 未在 ${timeoutMs}ms 内就绪：${String(lastError)}`);
}

async function checkRoute(baseUrl: string, route: string): Promise<DemoWebRouteCheck> {
  const url = resolveDemoWebRouteUrl(baseUrl, route);
  const response = await fetch(url);
  const html = await response.text();

  return {
    route,
    kind: classifyDemoWebRoute(route),
    url,
    ok: response.ok && html.includes('<div id="root"></div>'),
    status: response.status,
    assets: extractAssetPaths(html)
  };
}

async function checkApiHealth(url: string): Promise<DemoWebApiHealthCheck> {
  const response = await fetch(url);
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  return {
    ok: response.ok && isHealthyApiPayload(payload),
    url,
    status: response.status
  };
}

async function checkDistBundle(indexPath: string): Promise<DemoWebDistBundleCheck> {
  const html = await readFile(indexPath, "utf8");
  const assets = extractAssetPaths(html);

  return {
    ok: assets.some((asset) => asset.includes("/assets/") && asset.endsWith(".js")),
    indexPath,
    assets
  };
}

function startDevServer() {
  return spawn("corepack", ["pnpm", "--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "pipe"
  });
}

async function stopDevServer(processHandle: ChildProcessWithoutNullStreams) {
  if (processHandle.exitCode !== null) {
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

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      processHandle.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

export async function runDemoWebBasicE2E(config: DemoWebBasicE2EConfig = buildDefaultConfig()) {
  const server = startDevServer();
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForHttp(resolveDemoWebRouteUrl(config.baseUrl, "/login"), config.startupTimeoutMs);
    const checks = await Promise.all(config.routes.map((route) => checkRoute(config.baseUrl, route)));
    const [apiHealth, dist] = await Promise.all([
      checkApiHealth(config.apiHealthUrl),
      checkDistBundle(config.distIndexPath)
    ]);
    const failed = checks.filter((check) => !check.ok || check.assets.length === 0);

    if (failed.length > 0 || !apiHealth.ok || !dist.ok) {
      throw new Error(`demo-web basic runtime smoke failed: ${JSON.stringify({ failed, apiHealth, dist }, null, 2)}`);
    }

    return buildDemoWebSmokeSummary({
      mode: "mock-runtime",
      checks,
      apiHealth,
      dist
    });
  } finally {
    await stopDevServer(server);
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  runDemoWebBasicE2E()
    .then((checks) => {
      console.log(JSON.stringify({ ok: true, checks }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
