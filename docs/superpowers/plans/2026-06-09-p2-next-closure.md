# 2026-06-09 P2 Next Closure Plan

## Brainstorming

Inputs reviewed:

- `.codex-medical-p1-p2-continuation.md`
- `PRODUCT-AUDIT-REPORT.md`
- `MEDICAL-P2-DEPLOYMENT-READINESS-AUDIT-REPORT.md`
- `MEDICAL-P2-DEPLOYMENT-READINESS-FIX-REPORT.md`
- `docs/2026-06-09-p2-production-handoff.md`
- `MEDICAL-P2-PRODUCTION-CLOSURE-AUDIT-REPORT.md`
- Existing P1/P2 audit and fix reports including `P1-AUDIT-REPORT.md`, `P1-FIX-REPORT.md`, `MEDICAL-P1-P2-NEXT-*`, `MEDICAL-P2-SECURITY-E2E-*`, `MEDICAL-P2-INTEGRATION-HARDENING-*`, and `MEDICAL-P2-ADAPTER-HARDENING-*`.

Consolidated state:

- UI current stage is passed and must be preserved as Material + Arco Design. UI pass is not final medical product pass.
- Local deployment readiness recently passed: typecheck, tests, demo-web style/mobile/build/smoke, browser E2E, and mock-production contract smoke.
- Real external integration remains blocked: OCR/LLM/LIMS sandbox, real KMS/Vault/Secret Manager, and real multi-instance broker smoke.
- Queue and secret resolver skeletons already exist with blocked production posture; repeating those would add little value unless the contract is materially strengthened.
- Security has CSP/security headers and rate limits, but the current web auth path stores JWT in `localStorage`, lacks HttpOnly cookie session support, and logout is only client-side state removal.

Chosen code-closable P2 item:

- Strengthen the minimum session boundary without claiming full enterprise SSO or refresh-token rotation.
- Add HttpOnly session cookie support, cookie-based authentication, logout cookie/session invalidation, and a production frontend token storage boundary that does not persist JWT in `localStorage`.

Explicit boundaries:

- This is a minimum cookie session boundary, not full refresh-token rotation backed by Redis or database session storage.
- API token and CLI Bearer-token flows remain supported for system callers and smoke scripts.
- Real external OCR/LLM/LIMS, real KMS/Vault/Secret Manager, and real broker smoke remain blocked.

## Writing Plan

1. Add tests first:
   - API auth route test: login sets a HttpOnly session cookie and `/auth/logout` clears it.
   - API server test: protected routes accept cookie auth and reject the same cookie after logout invalidates the in-memory session.
   - Frontend auth/client tests: production session auth persists user metadata without storing JWT, logout calls `/auth/logout`, and API requests include credentials for cookies.
2. Implement server changes:
   - Add safe cookie parsing/serialization helpers.
   - Set `mra_session` HttpOnly cookie on login.
   - Add in-memory revoked session-token registry for logout invalidation in the local/minimum boundary.
   - Let auth middleware authenticate via Bearer JWT, then HttpOnly cookie JWT, then API token.
   - Add `/auth/logout` to clear cookie and invalidate the current cookie token.
   - Enable CORS credentials for demo-web.
3. Implement frontend changes:
   - API client sends `credentials: "include"` and exposes logout.
   - Auth provider stores token only when production cookie session mode is disabled.
   - Production mode keeps `user`, `permissions`, and `roles` metadata but no JWT in `localStorage`.
4. Verify with required commands and 9901 HTTP checks.
5. Generate fix report and 7-dimension audit report with layered conclusion.

## TDD

Red tests to add before implementation:

- `apps/api/src/routes/auth.routes.test.ts`
  - Login response has `Set-Cookie` with `mra_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - `/auth/logout` returns success and clears `mra_session`.
- `apps/api/src/server.test.ts`
  - Login cookie can call `/jobs/:id` without `Authorization`.
  - After `/auth/logout`, the same cookie is rejected with `401`.
- `apps/demo-web/src/api/client.test.ts`
  - Requests use `credentials: "include"`.
  - `api.logout()` posts to `/auth/logout`.
- `apps/demo-web/src/auth/AuthContext.test.tsx`
  - Production session mode does not persist `token` in `localStorage`.
  - Logout clears stored auth metadata and calls backend logout.

## Verification Before Completion

Required:

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm --filter @medical-record-agent/demo-web test:styles`
- `corepack pnpm --filter @medical-record-agent/demo-web test:mobile`
- `corepack pnpm --filter @medical-record-agent/demo-web build`
- `corepack pnpm smoke:demo-web`
- `corepack pnpm readiness:deployment`
- 9901 homepage and `/api/health` checks.
- Confirm `apps/demo-web/dist/index.html` references the latest bundle served by 9901.

Expected final posture:

- UI current stage: passed.
- P1/P2 current session-security closure: passed if tests and local readiness pass.
- Real external integration: blocked.
- Medical final product: blocked/not passed until real OCR/LLM/LIMS, real KMS/Vault/Secret Manager, and real broker multi-instance smoke pass.
