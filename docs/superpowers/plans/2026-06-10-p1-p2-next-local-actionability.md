# 2026-06-10 P1/P2 Next Local Actionability

## Brainstorming

- Required reports show previous rounds already closed UI/chunk, writeback readyFields boundary, demo fallback, Evaluation schema selection, provider/audit redaction, session/queue readiness, and production smoke blocked diagnostics.
- Real OCR/LLM/LIMS sandbox, KMS/Vault/Secret Manager, multi-instance session store, and real broker smoke remain external blockers and must stay blocked.
- A local actionable gap remains in API contract hardening: files/jobs/feedback/evaluation route services have compile-time object return types, but runtime route handlers still accept unsafe-cast scalar service responses as successful HTTP payloads. Results route still exposes `unknown | null`.

## Writing Plan

1. Add tests first for unsafe service responses on files/jobs/feedback/results/evaluation.
2. Tighten route handlers with `assertRouteResponseObject` and `assertRouteResponseObjectList`.
3. Tighten `ResultRouteService.getByJobId()` to `ApiRouteResponseObject | null`.
4. Run targeted route tests and API typecheck.
5. Run required project verification and 9901 bundle consistency checks.
6. Produce the requested fix and audit reports with layered acceptance.

## TDD

- Red target: route tests should fail because scalar service responses currently return 200/201.
- Green target: invalid route-facing service responses return structured 500 errors through existing Fastify error handling.
- Red result: `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts --reporter=dot` failed with 12 expected failures. Files/jobs/feedback/results/evaluation unsafe scalar service responses returned 200/201 instead of 500.
- Green result: after route response guards and result service type tightening, `corepack pnpm vitest run apps/api/src/routes/base.routes.test.ts apps/api/src/routes/evaluation.routes.test.ts apps/api/src/routes/route-service-contracts.test.ts --reporter=dot` passed, 37 tests.

## Verification Before Completion

- Required commands:
  - `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
  - `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
  - `corepack pnpm --filter @medical-record-agent/demo-web build`
  - `corepack pnpm test`
  - `corepack pnpm readiness:deployment`
- 9901 checks:
  - `http://localhost:9901/`
  - `http://localhost:9901/api/health`
  - `apps/demo-web/dist/index.html` and 9901 HTML must reference the same current bundle.

## Verification Result

- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`: passed, 19 tests.
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`: passed, 5 passed / 14 skipped.
- `corepack pnpm --filter @medical-record-agent/demo-web build`: passed, entry `/assets/index-BI5ExnF3.js`, largest JS chunk `vendor-arco-_4u-J6Qa.js` 415.91 kB.
- `corepack pnpm test`: passed, 75 passed / 1 skipped files; 443 passed / 1 skipped tests; existing upstream `DEP0040 punycode` warning remains.
- `corepack pnpm readiness:deployment`: exit 2, expected blocked. Local readiness passed; blocked diagnostics are limited to real OCR/LLM/LIMS sandbox, real KMS/Vault/Secret Manager, production multi-instance session store, and real broker/queue smoke.
- `http://localhost:9901/`: 200 OK.
- `http://localhost:9901/api/health`: 200 OK.
- `apps/demo-web/dist/index.html` and 9901 HTML reference the same JS bundle set, including `/assets/index-BI5ExnF3.js`.
