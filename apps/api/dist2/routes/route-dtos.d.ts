import { z } from "zod";
export type ApiRouteResponseObject = Record<string, unknown>;
export type ProviderConfigFieldError = {
    path: string;
    message: string;
};
export declare function validateProviderConfigRequiredFields(input: {
    kind: string;
    config?: Record<string, unknown>;
    secretRefs?: Record<string, unknown>;
}): ProviderConfigFieldError[];
export declare function redactSensitiveRouteValue(value: unknown, path?: string[]): unknown;
export declare function isRouteResponseObject(value: unknown): value is ApiRouteResponseObject;
export declare function assertRouteResponseObject(value: unknown, code: string): ApiRouteResponseObject;
export declare function assertRouteResponseObjectList(values: unknown[], code: string): ApiRouteResponseObject[];
export declare const fileUploadRouteInputSchema: z.ZodObject<{
    originalName: z.ZodString;
    mimeType: z.ZodOptional<z.ZodString>;
    byteSize: z.ZodOptional<z.ZodNumber>;
    checksumSha256: z.ZodOptional<z.ZodString>;
    contentBase64: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    originalName: string;
    metadata?: Record<string, unknown> | undefined;
    mimeType?: string | undefined;
    byteSize?: number | undefined;
    checksumSha256?: string | undefined;
    contentBase64?: string | undefined;
}, {
    originalName: string;
    metadata?: Record<string, unknown> | undefined;
    mimeType?: string | undefined;
    byteSize?: number | undefined;
    checksumSha256?: string | undefined;
    contentBase64?: string | undefined;
}>;
export declare const recognitionJobRouteInputSchema: z.ZodObject<{
    schemaKey: z.ZodOptional<z.ZodString>;
    schemaVersionId: z.ZodOptional<z.ZodString>;
    sourceFileId: z.ZodOptional<z.ZodString>;
    document: z.ZodOptional<z.ZodObject<{
        documentId: z.ZodString;
        fileName: z.ZodOptional<z.ZodString>;
        mimeType: z.ZodOptional<z.ZodString>;
        storageKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        documentId: string;
        storageKey?: string | undefined;
        mimeType?: string | undefined;
        fileName?: string | undefined;
    }, {
        documentId: string;
        storageKey?: string | undefined;
        mimeType?: string | undefined;
        fileName?: string | undefined;
    }>>;
    options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    providerConfig: z.ZodOptional<z.ZodObject<{
        ocrProviderKey: z.ZodOptional<z.ZodString>;
        providerKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        ocrProviderKey?: string | undefined;
        providerKey?: string | undefined;
    }, {
        ocrProviderKey?: string | undefined;
        providerKey?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    providerConfig?: {
        ocrProviderKey?: string | undefined;
        providerKey?: string | undefined;
    } | undefined;
    options?: Record<string, unknown> | undefined;
    schemaVersionId?: string | undefined;
    schemaKey?: string | undefined;
    sourceFileId?: string | undefined;
    document?: {
        documentId: string;
        storageKey?: string | undefined;
        mimeType?: string | undefined;
        fileName?: string | undefined;
    } | undefined;
}, {
    providerConfig?: {
        ocrProviderKey?: string | undefined;
        providerKey?: string | undefined;
    } | undefined;
    options?: Record<string, unknown> | undefined;
    schemaVersionId?: string | undefined;
    schemaKey?: string | undefined;
    sourceFileId?: string | undefined;
    document?: {
        documentId: string;
        storageKey?: string | undefined;
        mimeType?: string | undefined;
        fileName?: string | undefined;
    } | undefined;
}>;
export declare const feedbackRouteInputSchema: z.ZodEffects<z.ZodObject<{
    jobId: z.ZodOptional<z.ZodString>;
    sampleId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    fieldKey: z.ZodOptional<z.ZodString>;
    field: z.ZodOptional<z.ZodString>;
    originalValue: z.ZodOptional<z.ZodUnknown>;
    expected: z.ZodOptional<z.ZodUnknown>;
    actual: z.ZodOptional<z.ZodUnknown>;
    correctedValue: z.ZodOptional<z.ZodUnknown>;
    decision: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    reviewer: z.ZodOptional<z.ZodString>;
    confidence: z.ZodOptional<z.ZodNumber>;
    evidenceId: z.ZodOptional<z.ZodString>;
    evidenceQuote: z.ZodOptional<z.ZodString>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    schemaVersionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    expected?: unknown;
    schemaVersionId?: string | undefined;
    fieldKey?: string | undefined;
    originalValue?: unknown;
    correctedValue?: unknown;
    jobId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
    sampleId?: string | undefined;
    source?: string | undefined;
    field?: string | undefined;
    actual?: unknown;
    decision?: string | undefined;
    label?: string | undefined;
    reason?: string | undefined;
    reviewer?: string | undefined;
    evidenceId?: string | undefined;
    evidenceQuote?: string | undefined;
}, {
    status?: string | undefined;
    expected?: unknown;
    schemaVersionId?: string | undefined;
    fieldKey?: string | undefined;
    originalValue?: unknown;
    correctedValue?: unknown;
    jobId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
    sampleId?: string | undefined;
    source?: string | undefined;
    field?: string | undefined;
    actual?: unknown;
    decision?: string | undefined;
    label?: string | undefined;
    reason?: string | undefined;
    reviewer?: string | undefined;
    evidenceId?: string | undefined;
    evidenceQuote?: string | undefined;
}>, {
    status?: string | undefined;
    expected?: unknown;
    schemaVersionId?: string | undefined;
    fieldKey?: string | undefined;
    originalValue?: unknown;
    correctedValue?: unknown;
    jobId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
    sampleId?: string | undefined;
    source?: string | undefined;
    field?: string | undefined;
    actual?: unknown;
    decision?: string | undefined;
    label?: string | undefined;
    reason?: string | undefined;
    reviewer?: string | undefined;
    evidenceId?: string | undefined;
    evidenceQuote?: string | undefined;
}, {
    status?: string | undefined;
    expected?: unknown;
    schemaVersionId?: string | undefined;
    fieldKey?: string | undefined;
    originalValue?: unknown;
    correctedValue?: unknown;
    jobId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
    confidence?: number | undefined;
    sampleId?: string | undefined;
    source?: string | undefined;
    field?: string | undefined;
    actual?: unknown;
    decision?: string | undefined;
    label?: string | undefined;
    reason?: string | undefined;
    reviewer?: string | undefined;
    evidenceId?: string | undefined;
    evidenceQuote?: string | undefined;
}>;
export declare const evaluationSampleRouteInputSchema: z.ZodObject<{
    externalId: z.ZodOptional<z.ZodString>;
    fileId: z.ZodOptional<z.ZodString>;
    recognitionJobId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    groundTruth: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">]>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, unknown> | undefined;
    externalId?: string | undefined;
    groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
    fileId?: string | undefined;
    recognitionJobId?: string | undefined;
    input?: Record<string, unknown> | undefined;
}, {
    metadata?: Record<string, unknown> | undefined;
    externalId?: string | undefined;
    groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
    fileId?: string | undefined;
    recognitionJobId?: string | undefined;
    input?: Record<string, unknown> | undefined;
}>;
export declare const importEvaluationSamplesRouteInputSchema: z.ZodObject<{
    samples: z.ZodArray<z.ZodObject<{
        externalId: z.ZodOptional<z.ZodString>;
        fileId: z.ZodOptional<z.ZodString>;
        recognitionJobId: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        groundTruth: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">]>>;
    }, "strip", z.ZodTypeAny, {
        metadata?: Record<string, unknown> | undefined;
        externalId?: string | undefined;
        groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
        fileId?: string | undefined;
        recognitionJobId?: string | undefined;
        input?: Record<string, unknown> | undefined;
    }, {
        metadata?: Record<string, unknown> | undefined;
        externalId?: string | undefined;
        groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
        fileId?: string | undefined;
        recognitionJobId?: string | undefined;
        input?: Record<string, unknown> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    samples: {
        metadata?: Record<string, unknown> | undefined;
        externalId?: string | undefined;
        groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
        fileId?: string | undefined;
        recognitionJobId?: string | undefined;
        input?: Record<string, unknown> | undefined;
    }[];
}, {
    samples: {
        metadata?: Record<string, unknown> | undefined;
        externalId?: string | undefined;
        groundTruth?: Record<string, unknown> | Record<string, unknown>[] | undefined;
        fileId?: string | undefined;
        recognitionJobId?: string | undefined;
        input?: Record<string, unknown> | undefined;
    }[];
}>;
export declare const schemaDraftRouteInputSchema: z.ZodObject<{
    schemaKey: z.ZodString;
    displayName: z.ZodString;
    definition: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    displayName: string;
    schemaKey: string;
    definition: Record<string, unknown>;
}, {
    displayName: string;
    schemaKey: string;
    definition: Record<string, unknown>;
}>;
export declare const updateSchemaDraftRouteInputSchema: z.ZodObject<{
    definition: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    definition: Record<string, unknown>;
}, {
    definition: Record<string, unknown>;
}>;
export declare const publishSchemaDraftRouteInputSchema: z.ZodObject<{
    changelog: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    changelog?: string | undefined;
}, {
    changelog?: string | undefined;
}>;
export declare const compareSchemaVersionsQuerySchema: z.ZodObject<{
    left: z.ZodString;
    right: z.ZodString;
}, "strip", z.ZodTypeAny, {
    left: string;
    right: string;
}, {
    left: string;
    right: string;
}>;
export declare const providerConfigRouteInputSchema: z.ZodEffects<z.ZodObject<{
    kind: z.ZodString;
    displayName: z.ZodString;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    isDefault: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    config: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    secretRefs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    displayName: string;
    kind: string;
    isDefault: boolean;
    config: Record<string, unknown>;
    enabled: boolean;
    secretRefs?: Record<string, string> | undefined;
}, {
    displayName: string;
    kind: string;
    isDefault?: boolean | undefined;
    config?: Record<string, unknown> | undefined;
    secretRefs?: Record<string, string> | undefined;
    enabled?: boolean | undefined;
}>, {
    displayName: string;
    kind: string;
    isDefault: boolean;
    config: Record<string, unknown>;
    enabled: boolean;
    secretRefs?: Record<string, string> | undefined;
}, {
    displayName: string;
    kind: string;
    isDefault?: boolean | undefined;
    config?: Record<string, unknown> | undefined;
    secretRefs?: Record<string, string> | undefined;
    enabled?: boolean | undefined;
}>;
export declare const auditListQuerySchema: z.ZodObject<{
    actorUserId: z.ZodOptional<z.ZodString>;
    actorApiTokenId: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodString>;
    take: z.ZodEffects<z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>, string | number | undefined, string | number | undefined>, number | undefined, string | number | undefined>;
}, "strip", z.ZodTypeAny, {
    take?: number | undefined;
    actorUserId?: string | undefined;
    actorApiTokenId?: string | undefined;
    action?: string | undefined;
}, {
    take?: string | number | undefined;
    actorUserId?: string | undefined;
    actorApiTokenId?: string | undefined;
    action?: string | undefined;
}>;
export declare const confirmedWritebackRouteInputSchema: z.ZodObject<{
    jobId: z.ZodString;
    confirmed: z.ZodLiteral<true>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    confirmed: true;
    idempotencyKey?: string | undefined;
}, {
    jobId: string;
    confirmed: true;
    idempotencyKey?: string | undefined;
}>;
export type CreateFileUploadRouteInput = z.infer<typeof fileUploadRouteInputSchema>;
export type CreateRecognitionJobRouteInput = z.infer<typeof recognitionJobRouteInputSchema>;
export type CreateFeedbackRouteInput = z.infer<typeof feedbackRouteInputSchema>;
export type EvaluationSampleRouteInput = z.infer<typeof evaluationSampleRouteInputSchema>;
export type ImportEvaluationSamplesRouteBody = z.infer<typeof importEvaluationSamplesRouteInputSchema>;
export type CreateSchemaDraftRouteInput = z.infer<typeof schemaDraftRouteInputSchema>;
export type UpdateSchemaDraftRouteInput = z.infer<typeof updateSchemaDraftRouteInputSchema>;
export type PublishSchemaDraftRouteInput = z.infer<typeof publishSchemaDraftRouteInputSchema>;
export type CompareSchemaVersionsRouteQuery = z.infer<typeof compareSchemaVersionsQuerySchema>;
export type ProviderConfigRouteInput = z.infer<typeof providerConfigRouteInputSchema>;
export type AuditListRouteQuery = z.infer<typeof auditListQuerySchema>;
export type ConfirmedWritebackRouteInput = z.infer<typeof confirmedWritebackRouteInputSchema>;
export declare const createWebhookSubscriptionRouteInputSchema: z.ZodObject<{
    callbackUrl: z.ZodString;
    schemaKey: z.ZodOptional<z.ZodString>;
    events: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    callbackUrl: string;
    schemaKey?: string | undefined;
    events?: string[] | undefined;
}, {
    callbackUrl: string;
    schemaKey?: string | undefined;
    events?: string[] | undefined;
}>;
export type CreateWebhookSubscriptionRouteInput = z.infer<typeof createWebhookSubscriptionRouteInputSchema>;
//# sourceMappingURL=route-dtos.d.ts.map