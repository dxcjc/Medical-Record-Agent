import { isCliEntrypoint } from "./production-smoke";

export interface PunycodeDeprecationSource {
  request: "punycode" | "node:punycode";
  packageName: string;
  packageVersion: string;
  filePath: string;
}

export interface PunycodeDeprecationDiagnostic {
  status: "not-observed" | "upstream-dependency" | "local-source-actionable";
  safeLocalReplacement: boolean;
  localSourceImports: PunycodeDeprecationSource[];
  upstreamSources: PunycodeDeprecationSource[];
  recommendation: string;
}

export const observedPunycodeDeprecationSources: PunycodeDeprecationSource[] = [
  {
    request: "punycode",
    packageName: "whatwg-url",
    packageVersion: "5.0.0",
    filePath:
      "node_modules/.pnpm/whatwg-url@5.0.0/node_modules/whatwg-url/lib/url-state-machine.js"
  },
  {
    request: "punycode",
    packageName: "tr46",
    packageVersion: "0.0.3",
    filePath: "node_modules/.pnpm/tr46@0.0.3/node_modules/tr46/index.js"
  }
];

function isLocalSourceImport(source: PunycodeDeprecationSource) {
  return !source.filePath.includes("/node_modules/") && !source.filePath.startsWith("node_modules/");
}

export function classifyPunycodeDeprecationSources(
  sources: PunycodeDeprecationSource[]
): PunycodeDeprecationDiagnostic {
  const localSourceImports = sources.filter(isLocalSourceImport);
  const upstreamSources = sources.filter((source) => !isLocalSourceImport(source));

  if (localSourceImports.length > 0) {
    return {
      status: "local-source-actionable",
      safeLocalReplacement: true,
      localSourceImports,
      upstreamSources,
      recommendation:
        "Replace local imports of Node's builtin punycode module with URL/domain standard APIs or a maintained userland package, then keep upstream dependency tracking separate."
    };
  }

  if (upstreamSources.length > 0) {
    return {
      status: "upstream-dependency",
      safeLocalReplacement: false,
      localSourceImports,
      upstreamSources,
      recommendation:
        "Do not patch node_modules. Track or upgrade the transitive dependency chain that loads whatwg-url/tr46; keep reporting DEP0040 until upstream stops requiring Node's builtin punycode module."
    };
  }

  return {
    status: "not-observed",
    safeLocalReplacement: false,
    localSourceImports: [],
    upstreamSources: [],
    recommendation: "No punycode deprecation source was observed in the provided trace."
  };
}

export function formatPunycodeDeprecationDiagnostic(diagnostic: PunycodeDeprecationDiagnostic) {
  const lines = [
    `status=${diagnostic.status}`,
    `safeLocalReplacement=${String(diagnostic.safeLocalReplacement)}`,
    `recommendation=${diagnostic.recommendation}`
  ];

  for (const source of diagnostic.localSourceImports) {
    lines.push(`LOCAL ${source.packageName}@${source.packageVersion} ${source.filePath}`);
  }
  for (const source of diagnostic.upstreamSources) {
    lines.push(`UPSTREAM ${source.packageName}@${source.packageVersion} ${source.filePath}`);
  }

  return lines.join("\n");
}

async function main() {
  const diagnostic = classifyPunycodeDeprecationSources(observedPunycodeDeprecationSources);
  console.log(JSON.stringify(diagnostic, null, 2));
  console.log(formatPunycodeDeprecationDiagnostic(diagnostic));
  process.exitCode = diagnostic.status === "local-source-actionable" ? 1 : 0;
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
