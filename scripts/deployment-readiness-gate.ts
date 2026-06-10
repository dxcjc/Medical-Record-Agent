import { spawn } from "node:child_process";

import { isCliEntrypoint } from "./production-smoke";

export type DeploymentReadinessStatus = "passed" | "blocked" | "failed";
export type DeploymentReadinessPhase =
  | "local-readiness"
  | "browser-e2e"
  | "external-blocker-readiness"
  | "real-production"
  | "mock-production";

export interface DeploymentReadinessCheckPlan {
  id: string;
  label: string;
  phase: DeploymentReadinessPhase;
  command: string[];
  env?: Record<string, string>;
  requiredForLocalReadiness: boolean;
}

export interface DeploymentReadinessCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DeploymentReadinessCheckResult extends DeploymentReadinessCheckPlan {
  status: DeploymentReadinessStatus;
  exitCode: number;
  stdoutSummary: string;
  stderrSummary: string;
}

export interface DeploymentReadinessBlockedDiagnostic {
  checkId: string;
  name: string;
  code?: string;
  missingKeys?: string[];
  missingEnv?: string[];
  missingConfig?: string[];
  requiredEndpoints?: string[];
  requiredCredentials?: string[];
  provider?: string;
  adapter?: string;
  requiredExternal?: string[];
  nextAction?: string;
  requiredChecks?: string[];
}

export interface DeploymentReadinessSummary {
  generatedAt: string;
  checks: DeploymentReadinessCheckResult[];
  localReadiness: {
    status: DeploymentReadinessStatus;
    requiredChecks: string[];
  };
  externalIntegration: {
    status: DeploymentReadinessStatus;
    requiredChecks: string[];
    blockedReasons: string[];
    blockedDiagnostics: DeploymentReadinessBlockedDiagnostic[];
  };
  finalProduct: {
    status: DeploymentReadinessStatus;
    reason: string;
  };
}

export type DeploymentReadinessCommandRunner = (
  check: DeploymentReadinessCheckPlan
) => Promise<DeploymentReadinessCommandResult>;

export function buildDeploymentReadinessCommandPlan(): DeploymentReadinessCheckPlan[] {
  return [
    {
      id: "typecheck",
      label: "TypeScript typecheck",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "typecheck"],
      requiredForLocalReadiness: true
    },
    {
      id: "unit-tests",
      label: "Full Vitest suite",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "test"],
      requiredForLocalReadiness: true
    },
    {
      id: "demo-web-styles",
      label: "demo-web style guards",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "--filter", "@medical-record-agent/demo-web", "test:styles"],
      requiredForLocalReadiness: true
    },
    {
      id: "demo-web-mobile",
      label: "demo-web mobile guards",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "--filter", "@medical-record-agent/demo-web", "test:mobile"],
      requiredForLocalReadiness: true
    },
    {
      id: "demo-web-build",
      label: "demo-web production build",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "--filter", "@medical-record-agent/demo-web", "build"],
      requiredForLocalReadiness: true
    },
    {
      id: "served-app-readiness",
      label: "9901 served app and dist bundle readiness",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "readiness:served-app"],
      requiredForLocalReadiness: true
    },
    {
      id: "demo-web-smoke",
      label: "demo-web local runtime smoke",
      phase: "local-readiness",
      command: ["corepack", "pnpm", "smoke:demo-web"],
      requiredForLocalReadiness: true
    },
    {
      id: "demo-web-browser-e2e",
      label: "demo-web browser E2E",
      phase: "browser-e2e",
      command: ["corepack", "pnpm", "e2e:demo-web:browser"],
      requiredForLocalReadiness: false
    },
    {
      id: "external-blocker-readiness",
      label: "external blocker readiness diagnostics",
      phase: "external-blocker-readiness",
      command: ["corepack", "pnpm", "readiness:external-blockers"],
      requiredForLocalReadiness: false
    },
    {
      id: "queue-broker-readiness",
      label: "queue broker local contract readiness",
      phase: "external-blocker-readiness",
      command: ["corepack", "pnpm", "readiness:queue-broker"],
      requiredForLocalReadiness: false
    },
    {
      id: "production-smoke-real",
      label: "real production smoke",
      phase: "real-production",
      command: ["corepack", "pnpm", "smoke:production"],
      requiredForLocalReadiness: false
    },
    {
      id: "production-smoke-mock",
      label: "mock-production contract smoke",
      phase: "mock-production",
      command: ["corepack", "pnpm", "smoke:production"],
      env: {
        PRODUCTION_SMOKE_MODE: "mock-production",
        PRODUCTION_SMOKE_RUN_WRITEBACK: "1"
      },
      requiredForLocalReadiness: true
    }
  ];
}

function trimOutput(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 800) {
    return normalized;
  }

  const summaryLine = normalized
    .split(/\r?\n/u)
    .find((line) => line.startsWith("SUMMARY_JSON "));

  return summaryLine ? `${normalized.slice(0, 800)}...\n${summaryLine}` : `${normalized.slice(0, 800)}...`;
}

function classifyCommandResult(result: DeploymentReadinessCommandResult): DeploymentReadinessStatus {
  if (result.exitCode === 0) {
    return "passed";
  }

  if (result.exitCode === 2 || /\b(blocked|STATUS blocked|MODE blocked|browserE2E["=:]blocked)\b/iu.test(result.stdout)) {
    return "blocked";
  }

  return "failed";
}

async function spawnCommand(check: DeploymentReadinessCheckPlan): Promise<DeploymentReadinessCommandResult> {
  const [command, ...args] = check.command;
  if (!command) {
    throw new Error(`readiness check ${check.id} 缺少命令。`);
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(check.env ?? {})
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function collectBlockedReasons(checks: DeploymentReadinessCheckResult[]) {
  return checks
    .filter((check) => check.status === "blocked")
    .map((check) => `${check.id}: ${check.stdoutSummary || check.stderrSummary || "blocked"}`);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : undefined;
}

function parseSummaryJson(stdout: string): Record<string, unknown> | null {
  const summaryLine = stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith("SUMMARY_JSON "));

  if (!summaryLine) {
    return null;
  }

  try {
    return readRecord(JSON.parse(summaryLine.replace("SUMMARY_JSON ", "")));
  } catch {
    return null;
  }
}

function parseFirstJsonObject(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf("{");
  if (start < 0) {
    return null;
  }

  for (let index = start; index < stdout.length; index += 1) {
    if (stdout[index] !== "}") {
      continue;
    }

    try {
      return readRecord(JSON.parse(stdout.slice(start, index + 1)));
    } catch {
      // Keep scanning; the formatted summary follows the JSON block.
    }
  }

  return null;
}

function collectExternalBlockerDiagnostics(
  check: DeploymentReadinessCheckResult
): DeploymentReadinessBlockedDiagnostic[] {
  if (check.id !== "external-blocker-readiness" || check.status !== "blocked") {
    return [];
  }

  const summary = parseSummaryJson(check.stdoutSummary) ?? parseFirstJsonObject(check.stdoutSummary);
  const blockers = Array.isArray(summary?.blockers) ? summary.blockers : [];

  return blockers.flatMap((blocker): DeploymentReadinessBlockedDiagnostic[] => {
    const record = readRecord(blocker);
    const name = readString(record.id);
    if (!name) {
      return [];
    }

    const diagnostic: DeploymentReadinessBlockedDiagnostic = {
      checkId: check.id,
      name
    };
    const code = readString(record.code);
    const nextAction = readString(record.nextAction);
    const missingEnv = readStringArray(record.missingEnv);
    const missingConfig = readStringArray(record.missingConfig);
    const requiredEndpoints = readStringArray(record.requiredEndpoints);
    const requiredCredentials = readStringArray(record.requiredCredentials);
    const requiredChecks = readStringArray(record.smokeSteps);

    if (code) {
      diagnostic.code = code;
    }
    if (nextAction) {
      diagnostic.nextAction = nextAction;
    }
    if (missingEnv) {
      diagnostic.missingEnv = missingEnv;
    }
    if (missingConfig) {
      diagnostic.missingConfig = missingConfig;
    }
    if (requiredEndpoints) {
      diagnostic.requiredEndpoints = requiredEndpoints;
    }
    if (requiredCredentials) {
      diagnostic.requiredCredentials = requiredCredentials;
    }
    if (requiredChecks) {
      diagnostic.requiredChecks = requiredChecks;
    }

    return [diagnostic];
  });
}

function collectBlockedDiagnostics(checks: DeploymentReadinessCheckResult[]): DeploymentReadinessBlockedDiagnostic[] {
  return checks.flatMap((check) => {
    const externalBlockerDiagnostics = collectExternalBlockerDiagnostics(check);
    if (externalBlockerDiagnostics.length > 0) {
      return externalBlockerDiagnostics;
    }

    if (check.status !== "blocked") {
      return [];
    }

    const summary = parseSummaryJson(check.stdoutSummary);
    const blockedSteps = Array.isArray(summary?.blockedSteps) ? summary.blockedSteps : [];

    return blockedSteps.flatMap((step): DeploymentReadinessBlockedDiagnostic[] => {
      const record = readRecord(step);
      const name = readString(record.name);
      if (!name) {
        return [];
      }

      const diagnostic: DeploymentReadinessBlockedDiagnostic = {
        checkId: check.id,
        name
      };
      const code = readString(record.code);
      const provider = readString(record.provider);
      const adapter = readString(record.adapter);
      const nextAction = readString(record.nextAction);
      const missingKeys = readStringArray(record.missingKeys);
      const requiredExternal = readStringArray(record.requiredExternal);
      const requiredChecks = readStringArray(record.requiredChecks);

      if (code) {
        diagnostic.code = code;
      }
      if (missingKeys) {
        diagnostic.missingKeys = missingKeys;
      }
      if (provider) {
        diagnostic.provider = provider;
      }
      if (adapter) {
        diagnostic.adapter = adapter;
      }
      if (requiredExternal) {
        diagnostic.requiredExternal = requiredExternal;
      }
      if (nextAction) {
        diagnostic.nextAction = nextAction;
      }
      if (requiredChecks) {
        diagnostic.requiredChecks = requiredChecks;
      }

      return [diagnostic];
    });
  });
}

export async function runDeploymentReadinessGate(
  options: {
    runner?: DeploymentReadinessCommandRunner;
    now?: () => Date;
  } = {}
): Promise<DeploymentReadinessSummary> {
  const runner = options.runner ?? spawnCommand;
  const checks: DeploymentReadinessCheckResult[] = [];

  for (const check of buildDeploymentReadinessCommandPlan()) {
    const result = await runner(check);
    checks.push({
      ...check,
      status: classifyCommandResult(result),
      exitCode: result.exitCode,
      stdoutSummary: trimOutput(result.stdout),
      stderrSummary: trimOutput(result.stderr)
    });
  }

  const requiredLocalChecks = checks.filter((check) => check.requiredForLocalReadiness);
  const realProductionChecks = checks.filter(
    (check) => check.phase === "real-production" || check.phase === "external-blocker-readiness"
  );
  const localReadinessFailed = requiredLocalChecks.some((check) => check.status === "failed");
  const localReadinessBlocked = requiredLocalChecks.some((check) => check.status === "blocked");
  const externalFailed = realProductionChecks.some((check) => check.status === "failed");
  const externalBlocked = realProductionChecks.some((check) => check.status === "blocked");
  const localStatus: DeploymentReadinessStatus = localReadinessFailed
    ? "failed"
    : localReadinessBlocked
      ? "blocked"
      : "passed";
  const externalStatus: DeploymentReadinessStatus = externalFailed ? "failed" : externalBlocked ? "blocked" : "passed";
  const finalStatus: DeploymentReadinessStatus =
    localStatus === "failed" || externalStatus === "failed" ? "failed" : externalStatus === "passed" ? "passed" : "blocked";

  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    checks,
    localReadiness: {
      status: localStatus,
      requiredChecks: requiredLocalChecks.map((check) => check.id)
    },
    externalIntegration: {
      status: externalStatus,
      requiredChecks: realProductionChecks.map((check) => check.id),
      blockedReasons: collectBlockedReasons(realProductionChecks),
      blockedDiagnostics: collectBlockedDiagnostics(realProductionChecks)
    },
    finalProduct: {
      status: finalStatus,
      reason:
        finalStatus === "passed"
          ? "本地 readiness 与真实生产 smoke 均通过。"
          : finalStatus === "blocked"
            ? "本地 readiness 可单独判定；真实外部集成仍 blocked：真实 OCR/LLM/LIMS sandbox、真实 KMS/Vault/Secret Manager、生产多实例 session invalidation store 或真实 broker 多实例 smoke 尚未通过；医疗最终产品仍 blocked。"
            : "至少一个本地或真实生产 gate 失败。"
    }
  };
}

export function chooseDeploymentReadinessExitCode(summary: DeploymentReadinessSummary) {
  if (summary.localReadiness.status === "failed" || summary.externalIntegration.status === "failed") {
    return 1;
  }

  if (summary.finalProduct.status === "blocked") {
    return 2;
  }

  return 0;
}

export function formatDeploymentReadinessSummary(summary: DeploymentReadinessSummary) {
  const lines = [
    `localReadiness=${summary.localReadiness.status}`,
    `externalIntegration=${summary.externalIntegration.status}`,
    `finalProduct=${summary.finalProduct.status}`,
    `reason=${summary.finalProduct.reason}`
  ];

  for (const check of summary.checks) {
    lines.push(`${check.status.toUpperCase()} ${check.id} exit=${check.exitCode} command=${check.command.join(" ")}`);
  }

  for (const diagnostic of summary.externalIntegration.blockedDiagnostics) {
    lines.push(
      [
        "BLOCKED_DETAIL",
        diagnostic.checkId,
        diagnostic.name,
        diagnostic.code ?? "UNKNOWN_BLOCKED_CODE",
        diagnostic.nextAction ? `nextAction=${diagnostic.nextAction}` : undefined,
        diagnostic.requiredChecks ? `requiredChecks=${diagnostic.requiredChecks.join(",")}` : undefined
      ]
        .filter((item): item is string => Boolean(item))
        .join(" ")
    );
  }

  return lines.join("\n");
}

async function main() {
  const summary = await runDeploymentReadinessGate();
  console.log(JSON.stringify(summary, null, 2));
  console.log(formatDeploymentReadinessSummary(summary));
  process.exitCode = chooseDeploymentReadinessExitCode(summary);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
