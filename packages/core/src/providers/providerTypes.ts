export type OcrProviderKind = "mock" | "http";
export type ModelProviderKind = "mock" | "langchain" | "http" | "openai-responses";

export interface OcrDocumentInput {
  documentId: string;
  fileName?: string;
  mimeType?: string;
  content?: Uint8Array;
  storageKey?: string;
}

export interface OcrCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrTextBlock {
  page: number;
  blockId: string;
  text: string;
  confidence: number;
  coordinates: OcrCoordinates;
}

export interface OcrPage {
  page: number;
  text: string;
  confidence: number;
}

export type QualityWarningSeverity = "info" | "warning" | "error";

export interface OcrQualityWarning {
  code: string;
  message: string;
  severity: QualityWarningSeverity;
  page?: number;
}

export interface OcrResult {
  providerName: string;
  pages: OcrPage[];
  blocks: OcrTextBlock[];
  qualityWarnings: OcrQualityWarning[];
  raw?: Record<string, unknown>;
}

export interface OcrProvider {
  providerName: string;
  recognize(input: OcrDocumentInput): Promise<OcrResult>;
}

export interface ModelEvidence {
  snippet: string;
  startOffset: number;
  endOffset: number;
  pageNumber?: number;
  blockId?: string;
}

export interface ModelFieldCandidate {
  fieldKey: string;
  value: string | number | boolean | string[] | null;
  rawValue: string;
  confidence: number;
  evidence: ModelEvidence[];
}

export interface ModelExtractionRequest {
  schema: import("../schemas/schemaValidator").CoreSchemaDraft;
  prompt: string;
  ocrText: string;
  ragContext?: string[];
}

export interface ModelExtractionResult {
  providerName: string;
  candidates: ModelFieldCandidate[];
  raw?: Record<string, unknown>;
}

export interface ModelProvider {
  providerName: string;
  extractFields(request: ModelExtractionRequest): Promise<ModelExtractionResult>;
}

export interface ProviderErrorOptions {
  providerName: string;
  retryable: boolean;
  code: string;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly providerName: string;
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.providerName = options.providerName;
    this.retryable = options.retryable;
    this.code = options.code;

    // ProviderError 是跨 provider 边界向上抛出的结构化错误。
    // 只有调用方明确传入了已经脱敏的 cause，才会挂到 Error.cause 上；
    // 对外 message 仍然必须由各 provider 自己生成脱敏摘要，不能暗示一定保留原始异常。
    if ("cause" in options) {
      this.cause = options.cause;
    }
  }
}

export interface MockOcrProviderConfig {
  providerName?: string;
  pages?: OcrPage[];
  blocks?: OcrTextBlock[];
  qualityWarnings?: OcrQualityWarning[];
}

export interface MockModelProviderConfig {
  providerName?: string;
  candidates?: ModelFieldCandidate[];
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export interface OcrCoordinateAliases {
  x?: string;
  y?: string;
  width?: string;
  height?: string;
}

export interface OcrResponseMapping {
  pagesPath?: string;
  pageNumberPath?: string;
  pageTextPath?: string;
  pageConfidencePath?: string;
  blocksPath?: string;
  blockIdPath?: string;
  blockTextPath?: string;
  blockConfidencePath?: string;
  coordinatesPath?: string;
  coordinateAliases?: OcrCoordinateAliases;
  warningsPath?: string;
  warningCodePath?: string;
  warningMessagePath?: string;
  warningSeverityPath?: string;
  warningPagePath?: string;
}

export interface HttpOcrProviderConfig {
  providerName?: string;
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  responseMapping?: OcrResponseMapping;
  fetchFn?: FetchLike;
}

export interface LangChainStructuredModelLike {
  invoke(input: string): Promise<unknown>;
}

export interface LangChainModelLike {
  withStructuredOutput?(schema: Record<string, unknown>): LangChainStructuredModelLike;
  invoke?(input: string): Promise<unknown>;
}

export interface LangChainModelProviderConfig {
  providerName?: string;
  model: LangChainModelLike;
}

export interface HttpLlmProviderConfig {
  providerName?: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

export interface OpenAiResponsesClientLike {
  responses: {
    create(input: Record<string, unknown>): Promise<unknown>;
  };
}

export interface OpenAiResponsesProviderConfig {
  providerName?: string;
  model: string;
  client: OpenAiResponsesClientLike;
  experimental?: {
    enabled?: boolean;
  };
}

export type OcrProviderFactoryConfig =
  | {
      kind: "mock";
      mock?: MockOcrProviderConfig;
    }
  | {
      kind: "http";
      http: HttpOcrProviderConfig;
    };

export type ModelProviderFactoryConfig =
  | {
      kind: "mock";
      mock?: MockModelProviderConfig;
    }
  | {
      kind: "langchain";
      langchain: LangChainModelProviderConfig;
    }
  | {
      kind: "http";
      http: HttpLlmProviderConfig;
    }
  | {
      kind: "openai-responses";
      openAiResponses: OpenAiResponsesProviderConfig;
    };
