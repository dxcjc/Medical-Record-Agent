# Medical Record Agent Product Implementation Plan

> 历史草案说明：本文是 2026-06-04 的早期产品计划，Provider 路线已被 2026-06-09 hard remove 方案取代。当前执行方案要求用户/业务主线只接入真实 OCR/LLM Provider；自动化验证只能使用测试替身、fixture、合成样本和 contract test double，不把模拟模型提供商作为可用产品路线。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个生产取向的 TypeScript 通用病历识别 Agent，主线使用 LangGraph.js + LangChain.js，完整覆盖真实 OCR provider、真实 LLM provider、轻量 RAG、多 Agent 演进、生产级存储、权限登录、LIMS 高置信自动写回、schema 在线编辑发布、真实脱敏样本评估，以及精致多页面 Demo/管理前端。

**Architecture:** 使用 pnpm workspace 管理 monorepo。核心能力按 `shared` 类型、`core` 领域引擎、`api` 服务、`demo-web` 前端拆分；识别主流程由 LangGraph 工作流承载，LLM 调用、structured output、tool 封装和轻量 RAG 由 LangChain.js 承载。生产能力通过 Provider、Repository、Auth、Audit、Writeback、Evaluation 插件化接入。当前执行方案只把真实 OCR/LLM Provider 作为业务主线，同时实现 LangChain、OpenAI-compatible、OpenAI Responses 三类真实模型 provider；测试使用 fixture、合成样本和 contract test double。

**Tech Stack:** TypeScript、pnpm workspace、Vitest、Fastify、Prisma、PostgreSQL、MinIO/S3-compatible Storage、本地文件存储、JWT、bcrypt、LangGraph.js、LangChain.js、OpenAI SDK、Vite、React、React Router、TanStack Query、driver.js、lucide-react。

---

## Scope Check

本计划是完整产品计划，不是 MVP 收窄版。必须覆盖：

- 真实 OCR provider。
- 真实 LLM provider，包含 LangChainModelProvider、OpenAICompatibleProvider、OpenAIResponsesProvider。
- LangGraph Agent 工作流。
- LangChain structured output、tool 封装和轻量 RAG。
- 第一阶段轻量多 Agent，第二阶段 Manager + Specialist 对照实验。
- 生产级文件、任务、结果、反馈、评估样本存储。
- 生产级权限、登录、API token 和审计。
- 高置信自动决策后的 LIMS 自动写回。
- schema 在线编辑、校验、发布、停用、回滚和版本对比。
- 用真实脱敏病历样本做字段级评估。
- 精致多页面 Demo/管理前端和 StepGuide 引导。

实现顺序仍然分阶段，避免高风险能力互相阻塞：

1. 基础工作区和核心类型。
2. LangGraph 工作流骨架、核心识别引擎、真实 Provider 接口和测试替身。
3. LangChain 模型层、轻量 RAG 和 specialist agent。
4. 生产存储和 repository。
5. API 服务和权限审计。
6. 真实 OCR/LLM provider。
7. Schema Studio 在线管理。
8. 自动写回策略和 LIMS 写回。
9. 真实样本评估。
10. Demo/管理前端。
11. 端到端验收。

## File Structure

```text
D:\02-Learning\agent
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── .env.example
├── prisma
│   ├── schema.prisma
│   └── seed.ts
├── apps
│   ├── api
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src
│   │       ├── index.ts
│   │       ├── server.ts
│   │       ├── auth
│   │       │   ├── auth.service.ts
│   │       │   ├── password.ts
│   │       │   ├── permissions.ts
│   │       │   └── token.ts
│   │       ├── config
│   │       │   └── env.ts
│   │       ├── middleware
│   │       │   ├── audit.middleware.ts
│   │       │   └── auth.middleware.ts
│   │       ├── repositories
│   │       │   ├── audit.repository.ts
│   │       │   ├── evaluation.repository.ts
│   │       │   ├── feedback.repository.ts
│   │       │   ├── file.repository.ts
│   │       │   ├── jobs.repository.ts
│   │       │   ├── schema.repository.ts
│   │       │   ├── token.repository.ts
│   │       │   ├── user.repository.ts
│   │       │   └── writeback.repository.ts
│   │       └── routes
│   │           ├── auth.routes.ts
│   │           ├── audit.routes.ts
│   │           ├── evaluation.routes.ts
│   │           ├── feedback.routes.ts
│   │           ├── files.routes.ts
│   │           ├── jobs.routes.ts
│   │           ├── providers.routes.ts
│   │           ├── results.routes.ts
│   │           ├── schemas.routes.ts
│   │           └── writeback.routes.ts
│   └── demo-web
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src
│           ├── App.tsx
│           ├── main.tsx
│           ├── styles.css
│           ├── api
│           │   └── agentClient.ts
│           ├── components
│           │   ├── AppShell.tsx
│           │   ├── EvidencePanel.tsx
│           │   ├── FieldCandidateTable.tsx
│           │   ├── JobTimeline.tsx
│           │   ├── MetricCard.tsx
│           │   ├── ProviderBadge.tsx
│           │   ├── ProtectedRoute.tsx
│           │   └── StepGuide.tsx
│           └── pages
│               ├── AuditLogPage.tsx
│               ├── DashboardPage.tsx
│               ├── EvaluationPage.tsx
│               ├── FeedbackSamplesPage.tsx
│               ├── JobDetailPage.tsx
│               ├── LoginPage.tsx
│               ├── NewRecognitionPage.tsx
│               ├── ProviderSettingsPage.tsx
│               ├── SchemaStudioPage.tsx
│               └── WritebackPage.tsx
├── packages
│   ├── core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src
│   │       ├── adapters
│   │       │   ├── genericJsonAdapter.ts
│   │       │   ├── limsClinicalPayloadAdapter.ts
│   │       │   └── limsWritebackAdapter.ts
│   │       ├── engine
│   │       │   ├── autoDecisionPolicy.ts
│   │       │   ├── documentPipeline.ts
│   │       │   ├── extractionEngine.ts
│   │       │   ├── jobOrchestrator.ts
│   │       │   ├── langgraphRecognitionWorkflow.ts
│   │       │   └── validationEngine.ts
│   │       ├── evaluation
│   │       │   ├── evaluationRunner.ts
│   │       │   └── metrics.ts
│   │       ├── normalizers
│   │       │   └── clinicalNormalizers.ts
│   │       ├── providers
│   │       │   ├── httpLlmProvider.ts
│   │       │   ├── httpOcrProvider.ts
│   │       │   ├── langchainModelProvider.ts
│   │       │   ├── openAiResponsesProvider.ts
│   │       │   ├── mockModelProvider.ts
│   │       │   ├── mockOcrProvider.ts
│   │       │   ├── providerFactory.ts
│   │       │   └── providerTypes.ts
│   │       ├── rag
│   │       │   ├── inMemoryKnowledgeRetriever.ts
│   │       │   └── knowledgeBase.ts
│   │       ├── schemas
│   │       │   ├── limsClinicalInfoSchema.ts
│   │       │   └── schemaValidator.ts
│   │       └── index.ts
│   └── shared
│       ├── package.json
│       ├── tsconfig.json
│       └── src
│           ├── fixtures.ts
│           ├── index.ts
│           └── types.ts
└── docs
    └── superpowers
        ├── specs
        │   └── 2026-06-04-medical-record-recognition-agent-design.md
        └── plans
            └── 2026-06-04-medical-record-agent-product.md
```

## Implementation Tasks

### Task 1: Workspace And Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/demo-web/package.json`
- Create: `apps/demo-web/tsconfig.json`
- Create: `apps/demo-web/vite.config.ts`
- Create: `apps/demo-web/index.html`

Steps:

- [ ] Create root workspace files with pnpm workspace scripts for `build`、`test`、`typecheck`、`dev:api`、`dev:web`、`db:migrate`、`db:seed`。
- [ ] Create `.env.example` with database、JWT、storage、OCR、LLM、LIMS endpoint configuration names and safe placeholder values.
- [ ] Create package skeletons for `packages/shared`、`packages/core`、`apps/api`、`apps/demo-web`.
- [ ] Install dependencies using `pnpm install`.
- [ ] Run `pnpm typecheck`; expected result is typecheck passes for empty skeletons.

Acceptance:

- `pnpm-lock.yaml` exists.
- `pnpm typecheck` passes.
- No runtime code is committed.

### Task 2: Shared Types And Fixtures

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/fixtures.ts`
- Modify: `packages/shared/src/index.ts`

Required types:

- Field schema and schema version types.
- Recognition job, status, document, OCR block, field candidate and recognition result types.
- Provider configuration types.
- User, role, permission and audit event types.
- File object and storage metadata types.
- Feedback submission and rule candidate types.
- LIMS writeback request and result types.
- Evaluation dataset, sample, ground truth, run and metric types.

Steps:

- [ ] Write failing type-level or runtime tests for representative payload shapes.
- [ ] Implement `types.ts` with Chinese comments explaining sensitive medical data and audit fields.
- [ ] Implement synthetic fixtures only; no real patient data.
- [ ] Export all shared modules.
- [ ] Run `pnpm --filter @medical-record-agent/shared typecheck`.

Acceptance:

- Shared types cover every production capability in this plan.
- Fixtures contain synthetic demo data only.

### Task 3: Database Schema And Seed Data

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `apps/api/src/config/env.ts`

Required models:

- User, Role, ApiToken.
- AuditLog.
- StoredFile.
- RecognitionJob.
- RecognitionResult.
- SchemaDraft.
- SchemaVersion.
- FeedbackSubmission.
- RuleCandidate.
- ProviderConfig.
- WritebackAttempt.
- EvaluationDataset.
- EvaluationSample.
- EvaluationRun.
- EvaluationMetric.

Steps:

- [ ] Write Prisma schema with PostgreSQL provider.
- [ ] Add seed data for admin user、roles、permissions、real provider config placeholders、`lims-clinical-info` schema version.
- [ ] Add environment config parser that validates required variables at startup.
- [ ] Run `pnpm db:migrate` against local PostgreSQL or test database.
- [ ] Run `pnpm db:seed`.

Acceptance:

- Database can be migrated from empty state.
- Seed creates one admin user and one active LIMS schema version.
- No real credentials are hardcoded.

### Task 4: Core Schema, Validation And Normalizers

**Files:**
- Create: `packages/core/src/schemas/limsClinicalInfoSchema.ts`
- Create: `packages/core/src/schemas/schemaValidator.ts`
- Create: `packages/core/src/normalizers/clinicalNormalizers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/schemaValidator.test.ts`
- Test: `packages/core/test/normalizers.test.ts`

Steps:

- [ ] Write failing tests for schema validation and clinical normalizers.
- [ ] Implement LIMS clinical schema with field comments, adapter hints, enum maps and evidence policy.
- [ ] Implement schema validator that rejects duplicate keys, missing labels, invalid target paths and unsupported types.
- [ ] Implement clinical normalizers for smoking, boolean history, date text and list fields.
- [ ] Run schema and normalizer tests.

Acceptance:

- `lims-clinical-info` is valid.
- Invalid schema drafts return actionable validation errors.
- Normalizers keep original text available and only add normalized values.

### Task 5: Provider Interfaces, Test Doubles And Real OCR Provider

**Files:**
- Create: `packages/core/src/providers/providerTypes.ts`
- Create: `packages/core/src/providers/mockOcrProvider.ts`
- Create: `packages/core/src/providers/httpOcrProvider.ts`
- Create: `packages/core/src/providers/providerFactory.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/ocrProviders.test.ts`

Steps:

- [ ] Define `OcrProvider` interface returning pages, text blocks, coordinates, confidence and quality warnings.
- [ ] Implement `mockOcrProvider` for deterministic tests.
- [ ] Implement `httpOcrProvider` for real OCR services with configurable endpoint、headers、timeout、retry、response mapping.
- [ ] Add provider factory that selects mock or HTTP OCR by config.
- [ ] Add tests for mock OCR and mocked HTTP OCR response mapping.

Acceptance:

- Real OCR provider can be configured without code changes.
- HTTP OCR failures return retryable provider errors with sanitized messages.
- OCR response mapping preserves page, blockId, text, confidence and coordinates.

### Task 6: Real LLM Provider And Extraction Engine

**Files:**
- Create: `packages/core/src/providers/mockModelProvider.ts`
- Create: `packages/core/src/providers/langchainModelProvider.ts`
- Create: `packages/core/src/providers/httpLlmProvider.ts`
- Create: `packages/core/src/providers/openAiResponsesProvider.ts`
- Create: `packages/core/src/engine/extractionEngine.ts`
- Modify: `packages/core/src/providers/providerFactory.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/llmExtraction.test.ts`

Steps:

- [ ] Define `ModelProvider` interface for structured field extraction.
- [ ] Implement `mockModelProvider` for deterministic tests.
- [ ] Implement `langchainModelProvider` as the default production learning path, using LangChain prompt template and structured output.
- [ ] Implement `httpLlmProvider` with OpenAI-compatible request shape, configurable endpoint/model/key, timeout and JSON schema response parsing.
- [ ] Implement `openAiResponsesProvider` using OpenAI SDK for Responses API experiments.
- [ ] Implement extraction prompt builder using schema fields, OCR text, light RAG context, evidence requirements and output schema.
- [ ] Add tests for prompt construction, mocked LLM response parsing and malformed response handling.

Acceptance:

- Real LLM provider supports LangChain, OpenAI-compatible gateways and OpenAI Responses experiments.
- Provider never logs raw medical text in error messages.
- Malformed model output becomes structured provider error.

### Task 7: Light RAG And Specialist Agents

**Files:**
- Create: `packages/core/src/rag/knowledgeBase.ts`
- Create: `packages/core/src/rag/inMemoryKnowledgeRetriever.ts`
- Create: `packages/core/src/agents/extractionAgent.ts`
- Create: `packages/core/src/agents/validationAgent.ts`
- Create: `packages/core/src/agents/writebackAgent.ts`
- Create: `packages/core/src/agents/evaluationAgent.ts`
- Test: `packages/core/test/ragAndAgents.test.ts`

Steps:

- [ ] Implement lightweight knowledge base for medical terms, cancer aliases, LIMS dictionaries and field descriptions.
- [ ] Implement in-memory retriever with keyword matching first and replaceable interface for future vector retrieval.
- [ ] Implement Extraction Agent wrapper that calls `ModelProvider` with RAG context.
- [ ] Implement Validation Agent wrapper that returns evidence and risk decisions.
- [ ] Implement Writeback Agent wrapper that checks writeback readiness.
- [ ] Implement Evaluation Agent wrapper that creates evaluation sample candidates.
- [ ] Add tests for retrieval, agent input/output shape and fixed tool permissions.

Acceptance:

- First-stage specialist agents are controlled nodes, not free-form chat agents.
- RAG context is included in extraction prompts without exposing unrelated knowledge.

### Task 8: LangGraph Workflow, Validation Engine And Job Orchestrator

**Files:**
- Create: `packages/core/src/engine/documentPipeline.ts`
- Create: `packages/core/src/engine/validationEngine.ts`
- Create: `packages/core/src/engine/autoDecisionPolicy.ts`
- Create: `packages/core/src/engine/langgraphRecognitionWorkflow.ts`
- Create: `packages/core/src/engine/jobOrchestrator.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/jobOrchestrator.test.ts`

Steps:

- [ ] Implement document pipeline using OCR provider.
- [ ] Implement validation engine for missing evidence, low confidence, enum normalization and conflict warnings.
- [ ] Implement auto decision policy that returns green/yellow/red based on evidence, confidence, conflict, schema status, permission and environment switch.
- [ ] Implement LangGraph workflow with preprocess, OCR, light RAG, extraction agent, validation agent, auto decision, writeback agent and evaluation agent nodes.
- [ ] Implement job orchestrator that starts the LangGraph workflow and persists status transitions.
- [ ] Add tests for completed, partial_completed, needs_review, writeback_pending, writeback_completed, writeback_failed and failed flows.

Acceptance:

- Job orchestration works with real Provider contracts and deterministic test doubles.
- Provider errors map to failed/retryable job errors.
- Low confidence or missing key fields mark `needs_review`.
- High confidence green decisions trigger writeback path when enabled.

### Task 9: Payload Adapters And LIMS Writeback Adapter

**Files:**
- Create: `packages/core/src/adapters/genericJsonAdapter.ts`
- Create: `packages/core/src/adapters/limsClinicalPayloadAdapter.ts`
- Create: `packages/core/src/adapters/limsWritebackAdapter.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/adapters.test.ts`
- Test: `packages/core/test/limsWritebackAdapter.test.ts`

Steps:

- [ ] Implement generic JSON payload adapter.
- [ ] Implement LIMS clinical payload adapter using schema adapter hints.
- [ ] Implement LIMS writeback adapter with configurable endpoint、auth headers、idempotency key、timeout、retry and response mapping.
- [ ] Add tests for payload generation, missing target paths, writeback success, writeback failure and idempotency key propagation.

Acceptance:

- Writeback adapter is never called by normal recognition result reads.
- Writeback requires green auto decision or explicit authorized API call.
- Failed writeback preserves error and retryable flag.

### Task 10: Production Storage Repositories

**Files:**
- Create repository files under `apps/api/src/repositories/*`.
- Create storage service files for local disk and S3/MinIO compatible object storage.

Steps:

- [ ] Implement Prisma repositories for users, tokens, audit, files, jobs, results, schemas, feedback, writeback and evaluation.
- [ ] Implement local file storage provider.
- [ ] Implement S3-compatible storage provider.
- [ ] Add tests using temporary directories and test database.

Acceptance:

- Structured data is persisted in PostgreSQL.
- Files can be stored and retrieved through the storage abstraction.
- Repositories do not leak raw file paths to unauthorized callers.

### Task 11: Auth, Permissions, API Token And Audit

**Files:**
- Create: `apps/api/src/auth/*`
- Create: `apps/api/src/middleware/auth.middleware.ts`
- Create: `apps/api/src/middleware/audit.middleware.ts`
- Create: `apps/api/src/routes/auth.routes.ts`
- Create: `apps/api/src/routes/audit.routes.ts`

Steps:

- [ ] Implement password hashing with bcrypt.
- [ ] Implement login and JWT issuing.
- [ ] Implement role permission checks.
- [ ] Implement API token authentication for system callers such as LIMS.
- [ ] Implement audit middleware for upload, result view, feedback, schema publish, writeback and provider config changes.
- [ ] Add route tests for unauthorized, forbidden and authorized flows.

Acceptance:

- Users cannot access protected routes without JWT or API token.
- Writeback and schema publish require explicit permissions.
- Audit entries record actor, action, object, timestamp and result.

### Task 12: API Routes

**Files:**
- Create route files under `apps/api/src/routes/*`.
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`

Required route groups:

- Auth API.
- Schema API.
- Job API.
- File API.
- Result API.
- Feedback API.
- Provider API.
- Writeback API.
- Evaluation API.
- Audit API.

Steps:

- [ ] Implement route handlers using repositories, core engine and auth middleware.
- [ ] Ensure upload and result routes enforce file/result permissions.
- [ ] Ensure writeback route requires confirmed job and writeback permission.
- [ ] Add integration tests for every route group.

Acceptance:

- API supports the full product flow from login to writeback and evaluation.
- Error responses are structured and do not expose secrets or raw provider failures.

### Task 13: Schema Studio Backend

**Files:**
- Create schema service files in `apps/api/src/services`.
- Extend schema repository and schema routes.

Steps:

- [ ] Implement create draft, update draft, validate draft, publish version, deactivate version, rollback version and compare versions.
- [ ] Require schema admin permission for draft edits and publish.
- [ ] Record audit logs for publish, deactivate and rollback.
- [ ] Add tests for valid publish, invalid draft rejection, rollback and permission denial.

Acceptance:

- Active schema versions are immutable.
- Drafts can be edited safely.
- Publish creates a new version and keeps old versions queryable.

### Task 14: Evaluation Backend With Real De-identified Samples

**Files:**
- Create: `packages/core/src/evaluation/metrics.ts`
- Create: `packages/core/src/evaluation/evaluationRunner.ts`
- Create evaluation routes and repository methods.

Steps:

- [ ] Implement dataset creation and sample upload metadata.
- [ ] Implement ground truth import for field values and evidence.
- [ ] Implement evaluation runner that runs recognition against selected dataset/schema/provider config.
- [ ] Implement metrics for field accuracy, normalized accuracy, evidence coverage, needs_review recall and average latency.
- [ ] Add tests using synthetic samples; document how real de-identified samples are loaded.

Acceptance:

- Evaluation can compare schema/provider/model versions.
- Real samples must be marked de-identified before use.
- Evaluation results are persisted and shown through API.

### Task 15: Demo/Admin Frontend Shell And Login

**Files:**
- Create Demo frontend app shell, routes, API client, login page and protected routes.

Steps:

- [ ] Implement refined shell with sidebar, topbar, provider status and user menu.
- [ ] Implement login page and token persistence.
- [ ] Implement protected routes and permission-aware navigation.
- [ ] Add API client with typed methods and error handling.
- [ ] Run frontend typecheck and build.

Acceptance:

- Unauthenticated users are redirected to login.
- Navigation includes Dashboard, New Recognition, Job Detail, Schema Studio, Evaluation, Feedback Samples, Provider Settings, Writeback, Agent Trace and Audit Log.

### Task 16: Recognition Demo Pages

**Files:**
- Create or modify Dashboard, New Recognition, Job Detail, field table, evidence panel, timeline and payload preview components.

Steps:

- [ ] Implement Dashboard metrics from real API.
- [ ] Implement New Recognition upload, schema, adapter, provider and privacy options.
- [ ] Implement Job Detail with document preview, OCR text, field candidates, evidence, warnings and payload.
- [ ] Implement LangGraph node trace panel with node status, inputs summary, outputs summary and timings.
- [ ] Implement green/yellow/red auto decision panel.
- [ ] Implement feedback submission from Job Detail.
- [ ] Add visible loading, success and error states.

Acceptance:

- User can create a real recognition job through the UI.
- User can inspect field evidence, payload, LangGraph trace and auto decision.
- User can submit feedback.

### Task 17: Schema Studio Frontend

**Files:**
- Create Schema Studio page and components.

Steps:

- [ ] Implement schema list and version list.
- [ ] Implement draft editor for field metadata, aliases, enumMap, validators, normalizers and adapter hints.
- [ ] Implement validation results panel.
- [ ] Implement publish, deactivate, rollback and compare flows with permission checks.
- [ ] Add visible warnings for production-impacting changes.

Acceptance:

- Admin can edit a draft and publish a new schema version.
- Invalid schema cannot be published.
- Non-admin cannot publish.

### Task 18: Provider Settings Frontend

**Files:**
- Create Provider Settings page and provider config components.

Steps:

- [ ] Implement OCR provider config form.
- [ ] Implement LLM provider config form for LangChainModelProvider, OpenAICompatibleProvider, OpenAIResponsesProvider and MockModelProvider.
- [ ] Implement storage provider config form.
- [ ] Implement health check button and result display.
- [ ] Hide secret values after save.

Acceptance:

- Admin can configure real provider endpoints and choose default model provider mode.
- Health checks show success/failure without exposing secrets.

### Task 19: Writeback Frontend

**Files:**
- Create Writeback page and writeback components.

Steps:

- [ ] Implement list of jobs eligible for LIMS writeback.
- [ ] Implement payload preview.
- [ ] Implement auto decision explanation showing which green conditions passed.
- [ ] Implement confirmation dialog that explains target system and data scope.
- [ ] Implement writeback execution and result display.
- [ ] Require writeback permission before showing action button.

Acceptance:

- Writeback cannot be triggered accidentally.
- Automatic writeback decisions are explainable.
- Every writeback attempt has visible status and audit trail.

### Task 20: Evaluation Frontend

**Files:**
- Create Evaluation page, dataset page sections, metric cards and comparison charts.

Steps:

- [ ] Implement dataset list and sample import flow.
- [ ] Implement ground truth import status.
- [ ] Implement evaluation run creation.
- [ ] Implement metric cards and version comparison table.
- [ ] Implement warnings for samples not marked de-identified.

Acceptance:

- Evaluator can run a dataset evaluation.
- Results show field-level metrics and version comparisons.

### Task 21: OpenAI Agents SDK And Framework Comparison Lab

**Files:**
- Create: `docs/agent-framework-comparison.md`
- Create: `packages/core/src/experiments/openAiAgentsExperiment.ts`
- Create: `packages/core/src/experiments/frameworkComparison.ts`

Steps:

- [ ] Implement a small OpenAI Agents SDK experiment that mirrors extraction/validation as specialist tools without entering the main production path.
- [ ] Document comparison between LangGraph, OpenAI Agents SDK, Mastra and LlamaIndex.TS for this project.
- [ ] Record what should stay mainline and what remains experimental.

Acceptance:

- Project learns mainstream Agent stack without mixing experimental code into production workflow.
- Comparison document explains when to promote a framework into the mainline.

### Task 22: StepGuide And Visual Polish

**Files:**
- Create: `apps/demo-web/src/components/StepGuide.tsx`
- Modify app shell and styles.

Steps:

- [ ] Implement `StepGuide` with driver.js.
- [ ] Cover environment status, LangGraph workflow, new recognition, schema selection, field evidence, auto decision, feedback, writeback, schema publish and evaluation.
- [ ] Polish UI with stable responsive layouts, visible feedback states, no text overlap and clear task surfaces.
- [ ] Verify desktop and mobile layouts.

Acceptance:

- Guided tour works across major pages.
- UI is visually polished and usable as a product demo/admin studio.

### Task 23: End-To-End Verification

**Files:**
- No new feature files.

Steps:

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run database migration and seed.
- [ ] Start API and frontend.
- [ ] Use browser to verify login, recognition, LangGraph trace, auto decision, feedback, schema publish, provider health, writeback preview/execution with test endpoint, evaluation run and audit log.
- [ ] Capture screenshots of key pages.

Acceptance:

- All automated checks pass.
- Full product flow works in local environment.
- Known limitations are documented in the final handoff.

## Self-Review

Spec coverage:

- 真实 OCR provider：Task 5、Task 18、Task 23。
- 真实 LLM provider：Task 6、Task 18、Task 23。
- LangGraph + LangChain 主线：Task 6、Task 7、Task 8、Task 16、Task 23。
- 轻量多 Agent：Task 7、Task 8。
- 轻量 RAG：Task 7、Task 8。
- 生产级文件存储：Task 3、Task 10、Task 12。
- 生产级权限登录：Task 11、Task 15。
- 自动写回 LIMS：Task 8、Task 9、Task 12、Task 19、Task 23。
- schema 在线编辑发布：Task 13、Task 17。
- 真实病历样本评估：Task 14、Task 20、Task 23。
- OpenAI Agents SDK 对照实验：Task 21。
- 精致多页面 Demo/Admin 前端和引导：Task 15-22。

Important execution note:

- 当前用户明确要求没有说提交就不能提交，本计划不包含 git commit 步骤。
- 真实 provider、LIMS 写回和真实样本评估都必须用测试环境或脱敏样本，不得把真实敏感病历发送到未授权公网服务。
