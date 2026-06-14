import type { AuditRouteService } from "./audit.routes";
import type { EvaluationRouteService } from "./evaluation.routes";
import type { FeedbackRouteService } from "./feedback.routes";
import type { FileRouteService } from "./files.routes";
import type { JobRouteService } from "./jobs.routes";
import type { ProviderRouteService } from "./providers.routes";
import type { ResultRouteService } from "./results.routes";
import type { SchemaRouteService } from "./schemas.routes";
import type { WritebackRouteService } from "./writeback.routes";

// 编译期契约守卫：schemas/providers/audit 路由服务不能再用 scalar 响应满足接口。
const routeObject = { id: "route-object" };

const validSchemaService: SchemaRouteService = {
  listActive: async () => [routeObject],
  createDraft: async () => routeObject,
  updateDraft: async () => routeObject,
  validateDraft: async () => routeObject,
  publishDraft: async () => routeObject,
  deactivateVersion: async () => routeObject,
  rollbackVersion: async () => routeObject,
  compareVersions: async () => routeObject
};

void validSchemaService;

const validProviderService: ProviderRouteService = {
  listProviders: async () => [routeObject],
  saveProviderConfig: async () => routeObject,
  setDefaultProvider: async () => routeObject,
  checkProviderHealth: async () => routeObject
};

void validProviderService;

const validAuditService: AuditRouteService = {
  listRecent: async () => [routeObject]
};

void validAuditService;

const validWritebackService: WritebackRouteService = {
  execute: async () => routeObject,
  listEligible: async () => [routeObject],
  listHistory: async () => ({ items: [routeObject], total: 1, page: 1, pageSize: 20 })
};

void validWritebackService;

const validFileService: FileRouteService = {
  createUpload: async () => routeObject,
  getContent: async () => null
};

void validFileService;

const validJobService: JobRouteService = {
  create: async () => routeObject,
  get: async () => routeObject,
  list: async () => [],
  softDelete: async () => routeObject,
  rerun: async () => routeObject
};

void validJobService;

const validResultService: ResultRouteService = {
  getByJobId: async () => routeObject
};

void validResultService;

const validFeedbackService: FeedbackRouteService = {
  create: async () => routeObject,
  listByJobId: async () => [],
  listAll: async () => ({ items: [routeObject], total: 1, page: 1, pageSize: 20 }),
  getFieldStats: async () => []
};

void validFeedbackService;

const validEvaluationService: EvaluationRouteService = {
  listDatasets: async () => [routeObject],
  createDataset: async () => routeObject,
  importSamples: async () => [routeObject],
  listRuns: async () => [routeObject],
  createRun: async () => routeObject,
  getRun: async () => routeObject,
  listRunMetrics: async () => [routeObject]
};

void validEvaluationService;

const scalarSchemaServiceFixture = {
  listActive: async () => ["not-object"],
  createDraft: async () => "not-object",
  updateDraft: async () => "not-object",
  validateDraft: async () => "not-object",
  publishDraft: async () => "not-object",
  deactivateVersion: async () => "not-object",
  rollbackVersion: async () => "not-object",
  compareVersions: async () => "not-object"
};

// @ts-expect-error scalar schema responses must be rejected at compile time
const invalidSchemaService: SchemaRouteService = scalarSchemaServiceFixture;
void invalidSchemaService;

const scalarProviderServiceFixture = {
  listProviders: async () => ["not-object"],
  saveProviderConfig: async () => "not-object",
  setDefaultProvider: async () => "not-object",
  checkProviderHealth: async () => "not-object"
};

// @ts-expect-error scalar provider responses must be rejected at compile time
const invalidProviderService: ProviderRouteService = scalarProviderServiceFixture;
void invalidProviderService;

const scalarAuditServiceFixture = {
  listRecent: async () => ["not-object"]
};

// @ts-expect-error scalar audit list items must be rejected at compile time
const invalidAuditService: AuditRouteService = scalarAuditServiceFixture;
void invalidAuditService;

const scalarWritebackServiceFixture = {
  execute: async () => "not-object",
  listEligible: async () => ["not-object"],
  listHistory: async () => "not-object"
};

// @ts-expect-error scalar writeback responses must be rejected at compile time
const invalidWritebackService: WritebackRouteService = scalarWritebackServiceFixture;
void invalidWritebackService;

const scalarFileServiceFixture = {
  createUpload: async () => "not-object",
  getContent: async () => null
};

// @ts-expect-error scalar file upload response must be rejected at compile time
const invalidFileService: FileRouteService = scalarFileServiceFixture;
void invalidFileService;

const scalarJobServiceFixture = {
  create: async () => "not-object",
  get: async () => "not-object"
};

// @ts-expect-error scalar job responses must be rejected at compile time
const invalidJobService: JobRouteService = scalarJobServiceFixture;
void invalidJobService;

const scalarResultServiceFixture = {
  getByJobId: async () => "not-object"
};

// @ts-expect-error scalar result response must be rejected at compile time
const invalidResultService: ResultRouteService = scalarResultServiceFixture;
void invalidResultService;

const scalarFeedbackServiceFixture = {
  create: async () => "not-object",
  listAll: async () => "not-object",
  getFieldStats: async () => "not-object"
};

// @ts-expect-error scalar feedback response must be rejected at compile time
const invalidFeedbackService: FeedbackRouteService = scalarFeedbackServiceFixture;
void invalidFeedbackService;

const scalarEvaluationServiceFixture = {
  listDatasets: async () => ["not-object"],
  createDataset: async () => "not-object",
  importSamples: async () => ["not-object"],
  listRuns: async () => ["not-object"],
  createRun: async () => "not-object",
  getRun: async () => "not-object",
  listRunMetrics: async () => ["not-object"]
};

// @ts-expect-error scalar evaluation responses must be rejected at compile time
const invalidEvaluationService: EvaluationRouteService = scalarEvaluationServiceFixture;
void invalidEvaluationService;
