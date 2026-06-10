import { readFile as readFileFromDisk } from "node:fs/promises";

import { isCliEntrypoint } from "./production-smoke";

export type ServedAppReadinessStatus = "passed" | "blocked" | "failed";
export type ServedAppExternalStatus = "not-evaluated";

export interface ServedAppReadinessCheck {
  id: "served-home" | "api-health" | "dist-index" | "bundle-consistency";
  status: ServedAppReadinessStatus;
  code: string;
  detail: string;
}

export interface ServedAppReadinessSummary {
  generatedAt: string;
  localReadiness: ServedAppReadinessStatus;
  externalIntegration: ServedAppExternalStatus;
  finalProduct: ServedAppExternalStatus;
  baseUrl: string;
  apiHealthUrl: string;
  distIndexPath: string;
  servedBundles: string[];
  distBundles: string[];
  matchedBundles: string[];
  checks: ServedAppReadinessCheck[];
}

export interface RunServedAppReadinessOptions {
  now?: () => Date;
  baseUrl?: string;
  apiHealthUrl?: string;
  distIndexPath?: string;
  fetchImpl?: typeof fetch;
  readFile?: (path: string) => Promise<string>;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function extractAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const attributePattern = /\s([a-zA-Z:-]+)=["']([^"']+)["']/gu;
  let match = attributePattern.exec(tag);

  while (match) {
    const name = match[1];
    const value = match[2];
    if (name && value) {
      attributes.set(name.toLowerCase(), value);
    }
    match = attributePattern.exec(tag);
  }

  return attributes;
}

function isViteJavaScriptAsset(value: string) {
  return value.startsWith("/assets/") && value.endsWith(".js");
}

export function extractViteJavaScriptBundleAssets(html: string) {
  const scriptAssets: string[] = [];
  const preloadAssets: string[] = [];
  const tagPattern = /<(script|link)\b[^>]*>/giu;
  let match = tagPattern.exec(html);

  while (match) {
    const tagName = match[1]?.toLowerCase();
    const tag = match[0];
    const attributes = extractAttributes(tag);

    if (tagName === "script") {
      const source = attributes.get("src");
      if (source && isViteJavaScriptAsset(source)) {
        scriptAssets.push(source);
      }
    }

    if (tagName === "link" && attributes.get("rel") === "modulepreload") {
      const href = attributes.get("href");
      if (href && isViteJavaScriptAsset(href)) {
        preloadAssets.push(href);
      }
    }

    match = tagPattern.exec(html);
  }

  return dedupe([...scriptAssets, ...preloadAssets]);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isHealthyApiPayload(payload: unknown) {
  const record = readRecord(payload);
  return record.status === "ok" && record.service === "medical-record-agent-api";
}

function buildCheck(
  id: ServedAppReadinessCheck["id"],
  status: ServedAppReadinessStatus,
  code: string,
  detail: string
): ServedAppReadinessCheck {
  return { id, status, code, detail };
}

async function readTextResponse(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

async function fetchServedHome(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
}): Promise<{ check: ServedAppReadinessCheck; html: string; bundles: string[] }> {
  try {
    const response = await input.fetchImpl(input.baseUrl);
    const html = await readTextResponse(response);
    const bundles = extractViteJavaScriptBundleAssets(html);

    if (!response.ok) {
      return {
        check: buildCheck(
          "served-home",
          "blocked",
          "SERVED_APP_HOME_UNREACHABLE",
          `${input.baseUrl} returned HTTP ${response.status}.`
        ),
        html,
        bundles
      };
    }

    if (!html.includes('<div id="root"></div>') || bundles.length === 0) {
      return {
        check: buildCheck(
          "served-home",
          "failed",
          "SERVED_APP_HOME_INVALID",
          "served home did not include the React root and Vite JavaScript assets."
        ),
        html,
        bundles
      };
    }

    return {
      check: buildCheck(
        "served-home",
        "passed",
        "SERVED_APP_HOME_OK",
        `${input.baseUrl} returned a Vite app shell with ${bundles.length} JavaScript bundle asset(s).`
      ),
      html,
      bundles
    };
  } catch (error) {
    return {
      check: buildCheck(
        "served-home",
        "blocked",
        "SERVED_APP_HOME_UNREACHABLE",
        `${input.baseUrl} unreachable: ${error instanceof Error ? error.message : String(error)}`
      ),
      html: "",
      bundles: []
    };
  }
}

async function fetchApiHealth(input: {
  fetchImpl: typeof fetch;
  apiHealthUrl: string;
}): Promise<ServedAppReadinessCheck> {
  try {
    const response = await input.fetchImpl(input.apiHealthUrl);
    let payload: unknown;

    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return buildCheck(
        "api-health",
        "blocked",
        "SERVED_APP_API_HEALTH_UNREACHABLE",
        `${input.apiHealthUrl} returned HTTP ${response.status}.`
      );
    }

    if (!isHealthyApiPayload(payload)) {
      return buildCheck(
        "api-health",
        "failed",
        "SERVED_APP_API_HEALTH_INVALID",
        `${input.apiHealthUrl} did not return { status: "ok", service: "medical-record-agent-api" }.`
      );
    }

    return buildCheck(
      "api-health",
      "passed",
      "SERVED_APP_API_HEALTH_OK",
      `${input.apiHealthUrl} returned the expected API health payload.`
    );
  } catch (error) {
    return buildCheck(
      "api-health",
      "blocked",
      "SERVED_APP_API_HEALTH_UNREACHABLE",
      `${input.apiHealthUrl} unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function readDistIndex(input: {
  readFile: (path: string) => Promise<string>;
  distIndexPath: string;
}): Promise<{ check: ServedAppReadinessCheck; html: string; bundles: string[] }> {
  try {
    const html = await input.readFile(input.distIndexPath);
    const bundles = extractViteJavaScriptBundleAssets(html);

    if (bundles.length === 0) {
      return {
        check: buildCheck(
          "dist-index",
          "failed",
          "SERVED_APP_DIST_BUNDLE_MISSING",
          `${input.distIndexPath} did not reference a Vite JavaScript bundle.`
        ),
        html,
        bundles
      };
    }

    return {
      check: buildCheck(
        "dist-index",
        "passed",
        "SERVED_APP_DIST_INDEX_OK",
        `${input.distIndexPath} referenced ${bundles.length} JavaScript bundle asset(s).`
      ),
      html,
      bundles
    };
  } catch (error) {
    return {
      check: buildCheck(
        "dist-index",
        "blocked",
        "SERVED_APP_DIST_INDEX_UNREADABLE",
        `${input.distIndexPath} unreadable: ${error instanceof Error ? error.message : String(error)}`
      ),
      html: "",
      bundles: []
    };
  }
}

function compareBundles(servedBundles: string[], distBundles: string[]) {
  const servedSet = new Set(servedBundles);
  const distSet = new Set(distBundles);
  const matched = distBundles.filter((asset) => servedSet.has(asset));
  const servedOnly = servedBundles.filter((asset) => !distSet.has(asset));
  const distOnly = distBundles.filter((asset) => !servedSet.has(asset));

  return { matched, servedOnly, distOnly };
}

function summarizeLocalReadiness(checks: ServedAppReadinessCheck[]): ServedAppReadinessStatus {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }

  if (checks.some((check) => check.status === "blocked")) {
    return "blocked";
  }

  return "passed";
}

export async function runServedAppReadiness(
  options: RunServedAppReadinessOptions = {}
): Promise<ServedAppReadinessSummary> {
  const now = options.now ?? (() => new Date());
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.SERVED_APP_BASE_URL ?? "http://localhost:9901");
  const apiHealthUrl = options.apiHealthUrl ?? process.env.SERVED_APP_API_HEALTH_URL ?? `${baseUrl}/api/health`;
  const distIndexPath = options.distIndexPath ?? process.env.SERVED_APP_DIST_INDEX ?? "apps/demo-web/dist/index.html";
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFile = options.readFile ?? ((path: string) => readFileFromDisk(path, "utf8"));
  const [servedHome, apiHealth, distIndex] = await Promise.all([
    fetchServedHome({ fetchImpl, baseUrl }),
    fetchApiHealth({ fetchImpl, apiHealthUrl }),
    readDistIndex({ readFile, distIndexPath })
  ]);
  const bundleComparison = compareBundles(servedHome.bundles, distIndex.bundles);
  const bundleConsistency =
    servedHome.check.status === "passed" && distIndex.check.status === "passed"
      ? bundleComparison.servedOnly.length === 0 && bundleComparison.distOnly.length === 0
        ? buildCheck(
            "bundle-consistency",
            "passed",
            "SERVED_APP_BUNDLE_MATCH",
            `served home and dist index reference the same bundle set: ${bundleComparison.matched.join(", ")}.`
          )
        : buildCheck(
            "bundle-consistency",
            "failed",
            "SERVED_APP_BUNDLE_MISMATCH",
            `servedOnly=${bundleComparison.servedOnly.join(",") || "none"} distOnly=${
              bundleComparison.distOnly.join(",") || "none"
            }.`
          )
      : buildCheck(
          "bundle-consistency",
          "blocked",
          "SERVED_APP_BUNDLE_COMPARISON_BLOCKED",
          "bundle comparison requires a reachable served home and readable dist index."
        );
  const checks = [servedHome.check, apiHealth, distIndex.check, bundleConsistency];

  return {
    generatedAt: now().toISOString(),
    localReadiness: summarizeLocalReadiness(checks),
    externalIntegration: "not-evaluated",
    finalProduct: "not-evaluated",
    baseUrl,
    apiHealthUrl,
    distIndexPath,
    servedBundles: servedHome.bundles,
    distBundles: distIndex.bundles,
    matchedBundles: bundleComparison.matched,
    checks
  };
}

export function chooseServedAppReadinessExitCode(summary: ServedAppReadinessSummary) {
  if (summary.localReadiness === "failed") {
    return 1;
  }

  if (summary.localReadiness === "blocked") {
    return 2;
  }

  return 0;
}

export function formatServedAppReadinessSummary(summary: ServedAppReadinessSummary) {
  const lines = [
    `localReadiness=${summary.localReadiness}`,
    `externalIntegration=${summary.externalIntegration}`,
    `finalProduct=${summary.finalProduct}`,
    `baseUrl=${summary.baseUrl}`,
    `apiHealthUrl=${summary.apiHealthUrl}`,
    `distIndexPath=${summary.distIndexPath}`,
    `servedBundle=${summary.servedBundles.join(",") || "none"}`,
    `distBundle=${summary.distBundles.join(",") || "none"}`,
    `matchedBundle=${summary.matchedBundles.join(",") || "none"}`
  ];

  for (const check of summary.checks) {
    lines.push(`${check.status.toUpperCase()} ${check.id} ${check.code} ${check.detail}`);
    if (check.status === "blocked") {
      lines.push(`BLOCKED_DETAIL served-app ${check.id} ${check.code} ${check.detail}`);
    }
    if (check.status === "failed") {
      lines.push(`FAILED ${check.id} ${check.code} ${check.detail}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const summary = await runServedAppReadiness();
  console.log(JSON.stringify(summary, null, 2));
  console.log(formatServedAppReadinessSummary(summary));
  process.exitCode = chooseServedAppReadinessExitCode(summary);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
