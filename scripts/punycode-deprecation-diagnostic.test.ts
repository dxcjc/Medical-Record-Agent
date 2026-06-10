import { describe, expect, it } from "vitest";

import {
  classifyPunycodeDeprecationSources,
  formatPunycodeDeprecationDiagnostic
} from "./punycode-deprecation-diagnostic";

describe("punycode deprecation diagnostic", () => {
  it("classifies known whatwg-url/tr46 loads as upstream dependency warning, not local app source", () => {
    const diagnostic = classifyPunycodeDeprecationSources([
      {
        request: "punycode",
        packageName: "whatwg-url",
        packageVersion: "5.0.0",
        filePath:
          "/tmp/Medical-Record-Agent/node_modules/.pnpm/whatwg-url@5.0.0/node_modules/whatwg-url/lib/url-state-machine.js"
      },
      {
        request: "punycode",
        packageName: "tr46",
        packageVersion: "0.0.3",
        filePath: "/tmp/Medical-Record-Agent/node_modules/.pnpm/tr46@0.0.3/node_modules/tr46/index.js"
      }
    ]);

    expect(diagnostic).toEqual({
      status: "upstream-dependency",
      safeLocalReplacement: false,
      localSourceImports: [],
      upstreamSources: [
        {
          request: "punycode",
          packageName: "whatwg-url",
          packageVersion: "5.0.0",
          filePath:
            "/tmp/Medical-Record-Agent/node_modules/.pnpm/whatwg-url@5.0.0/node_modules/whatwg-url/lib/url-state-machine.js"
        },
        {
          request: "punycode",
          packageName: "tr46",
          packageVersion: "0.0.3",
          filePath: "/tmp/Medical-Record-Agent/node_modules/.pnpm/tr46@0.0.3/node_modules/tr46/index.js"
        }
      ],
      recommendation:
        "Do not patch node_modules. Track or upgrade the transitive dependency chain that loads whatwg-url/tr46; keep reporting DEP0040 until upstream stops requiring Node's builtin punycode module."
    });
    expect(formatPunycodeDeprecationDiagnostic(diagnostic)).toContain("status=upstream-dependency");
    expect(formatPunycodeDeprecationDiagnostic(diagnostic)).toContain("safeLocalReplacement=false");
    expect(formatPunycodeDeprecationDiagnostic(diagnostic)).toContain("whatwg-url@5.0.0");
    expect(formatPunycodeDeprecationDiagnostic(diagnostic)).toContain("tr46@0.0.3");
  });

  it("marks app source punycode imports as locally actionable", () => {
    const diagnostic = classifyPunycodeDeprecationSources([
      {
        request: "punycode",
        packageName: "medical-record-agent",
        packageVersion: "workspace",
        filePath: "/tmp/Medical-Record-Agent/apps/api/src/example.ts"
      }
    ]);

    expect(diagnostic.status).toBe("local-source-actionable");
    expect(diagnostic.safeLocalReplacement).toBe(true);
    expect(diagnostic.localSourceImports).toEqual([
      {
        request: "punycode",
        packageName: "medical-record-agent",
        packageVersion: "workspace",
        filePath: "/tmp/Medical-Record-Agent/apps/api/src/example.ts"
      }
    ]);
    expect(formatPunycodeDeprecationDiagnostic(diagnostic)).toContain("status=local-source-actionable");
  });
});
