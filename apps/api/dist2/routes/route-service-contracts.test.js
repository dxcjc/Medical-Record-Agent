// 编译期契约守卫：schemas/providers/audit 路由服务不能再用 scalar 响应满足接口。
const routeObject = { id: "route-object" };
const validSchemaService = {
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
const validProviderService = {
    listProviders: async () => [routeObject],
    saveProviderConfig: async () => routeObject,
    setDefaultProvider: async () => routeObject,
    checkProviderHealth: async () => routeObject
};
void validProviderService;
const validAuditService = {
    listRecent: async () => [routeObject]
};
void validAuditService;
const validWritebackService = {
    execute: async () => routeObject,
    listEligible: async () => [routeObject]
};
void validWritebackService;
const validFileService = {
    createUpload: async () => routeObject,
    getContent: async () => null
};
void validFileService;
const validJobService = {
    create: async () => routeObject,
    get: async () => routeObject,
    list: async () => []
};
void validJobService;
const validResultService = {
    getByJobId: async () => routeObject
};
void validResultService;
const validFeedbackService = {
    create: async () => routeObject
};
void validFeedbackService;
const validEvaluationService = {
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
const invalidSchemaService = scalarSchemaServiceFixture;
void invalidSchemaService;
const scalarProviderServiceFixture = {
    listProviders: async () => ["not-object"],
    saveProviderConfig: async () => "not-object",
    setDefaultProvider: async () => "not-object",
    checkProviderHealth: async () => "not-object"
};
// @ts-expect-error scalar provider responses must be rejected at compile time
const invalidProviderService = scalarProviderServiceFixture;
void invalidProviderService;
const scalarAuditServiceFixture = {
    listRecent: async () => ["not-object"]
};
// @ts-expect-error scalar audit list items must be rejected at compile time
const invalidAuditService = scalarAuditServiceFixture;
void invalidAuditService;
const scalarWritebackServiceFixture = {
    execute: async () => "not-object",
    listEligible: async () => ["not-object"]
};
// @ts-expect-error scalar writeback responses must be rejected at compile time
const invalidWritebackService = scalarWritebackServiceFixture;
void invalidWritebackService;
const scalarFileServiceFixture = {
    createUpload: async () => "not-object",
    getContent: async () => null
};
// @ts-expect-error scalar file upload response must be rejected at compile time
const invalidFileService = scalarFileServiceFixture;
void invalidFileService;
const scalarJobServiceFixture = {
    create: async () => "not-object",
    get: async () => "not-object"
};
// @ts-expect-error scalar job responses must be rejected at compile time
const invalidJobService = scalarJobServiceFixture;
void invalidJobService;
const scalarResultServiceFixture = {
    getByJobId: async () => "not-object"
};
// @ts-expect-error scalar result response must be rejected at compile time
const invalidResultService = scalarResultServiceFixture;
void invalidResultService;
const scalarFeedbackServiceFixture = {
    create: async () => "not-object"
};
// @ts-expect-error scalar feedback response must be rejected at compile time
const invalidFeedbackService = scalarFeedbackServiceFixture;
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
const invalidEvaluationService = scalarEvaluationServiceFixture;
void invalidEvaluationService;
export {};
//# sourceMappingURL=route-service-contracts.test.js.map