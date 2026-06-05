import {
  ProviderError,
  type HttpOcrProviderConfig,
  type OcrCoordinateAliases,
  type OcrCoordinates,
  type OcrDocumentInput,
  type OcrPage,
  type OcrProvider,
  type OcrQualityWarning,
  type OcrResponseMapping,
  type OcrTextBlock,
  type QualityWarningSeverity
} from "./providerTypes";

type NormalizedOcrResponseMapping = Required<Omit<OcrResponseMapping, "coordinateAliases">> & {
  coordinateAliases: Required<OcrCoordinateAliases>;
};

const defaultMapping: NormalizedOcrResponseMapping = {
  pagesPath: "pages",
  pageNumberPath: "page",
  pageTextPath: "text",
  pageConfidencePath: "confidence",
  blocksPath: "blocks",
  blockIdPath: "blockId",
  blockTextPath: "text",
  blockConfidencePath: "confidence",
  coordinatesPath: "coordinates",
  coordinateAliases: {
    x: "x",
    y: "y",
    width: "width",
    height: "height"
  },
  warningsPath: "qualityWarnings",
  warningCodePath: "code",
  warningMessagePath: "message",
  warningSeverityPath: "severity",
  warningPagePath: "page"
};

function getByPath(value: unknown, path: string | undefined): unknown {
  if (!path) {
    return value;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeSeverity(value: unknown): QualityWarningSeverity {
  return value === "info" || value === "warning" || value === "error" ? value : "warning";
}

function normalizeMapping(mapping: OcrResponseMapping | undefined): NormalizedOcrResponseMapping {
  return {
    ...defaultMapping,
    ...mapping,
    coordinateAliases: {
      ...defaultMapping.coordinateAliases,
      ...mapping?.coordinateAliases
    }
  };
}

function createWarning(
  code: string,
  message: string,
  page?: number,
  severity: QualityWarningSeverity = "warning"
): OcrQualityWarning {
  const warning: OcrQualityWarning = {
    code,
    message,
    severity
  };

  if (page !== undefined) {
    warning.page = page;
  }

  return warning;
}

function mapCoordinates(
  value: unknown,
  mapping: NormalizedOcrResponseMapping,
  page: number,
  warnings: OcrQualityWarning[]
): OcrCoordinates {
  if (value === undefined || value === null || typeof value !== "object") {
    warnings.push(createWarning("OCR_BLOCK_COORDINATES_MISSING", "OCR 块缺少坐标，已回退为 0 坐标。", page));
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const coordinates = asRecord(value);

  return {
    x: asNumber(coordinates[mapping.coordinateAliases.x], 0),
    y: asNumber(coordinates[mapping.coordinateAliases.y], 0),
    width: asNumber(coordinates[mapping.coordinateAliases.width], 0),
    height: asNumber(coordinates[mapping.coordinateAliases.height], 0)
  };
}

function mapResponse(
  data: unknown,
  mapping: NormalizedOcrResponseMapping,
  providerName: string
): { pages: OcrPage[]; blocks: OcrTextBlock[]; qualityWarnings: OcrQualityWarning[] } {
  const pageItems = getByPath(data, mapping.pagesPath);
  if (!Array.isArray(pageItems)) {
    throw new ProviderError(`HTTP OCR 响应无效：${providerName} 返回的页面结构不符合映射配置`, {
      providerName,
      retryable: false,
      code: "HTTP_OCR_BAD_RESPONSE"
    });
  }

  const pages: OcrPage[] = [];
  const blocks: OcrTextBlock[] = [];
  const qualityWarnings: OcrQualityWarning[] = [];

  pageItems.forEach((pageItem, pageIndex) => {
    const pageRecord = asRecord(pageItem);
    const mappedPage = getByPath(pageRecord, mapping.pageNumberPath);
    const page = asNumber(mappedPage, pageIndex + 1);
    if (typeof mappedPage !== "number") {
      qualityWarnings.push(
        createWarning("OCR_PAGE_NUMBER_MISSING", "OCR 页面缺少页码，已按顺序回退页码。", page)
      );
    }

    const mappedText = getByPath(pageRecord, mapping.pageTextPath);
    const text = asString(mappedText, "");
    if (typeof mappedText !== "string") {
      qualityWarnings.push(
        createWarning("OCR_PAGE_TEXT_MISSING", "OCR 页面缺少整页文本，已回退为空字符串。", page)
      );
    }

    const confidence = asNumber(getByPath(pageRecord, mapping.pageConfidencePath), 0);
    pages.push({ page, text, confidence });

    const blockItems = getByPath(pageRecord, mapping.blocksPath);
    const blocksSource = Array.isArray(blockItems) ? blockItems : [];
    if (!Array.isArray(blockItems)) {
      qualityWarnings.push(
        createWarning("OCR_BLOCKS_MISSING", "OCR 页面缺少文本块数组，已回退为空数组。", page)
      );
    }

    blocksSource.forEach((blockItem, blockIndex) => {
      const blockRecord = asRecord(blockItem);
      const mappedBlockId = getByPath(blockRecord, mapping.blockIdPath);
      const blockId = asString(mappedBlockId, `${providerName}-page-${page}-block-${blockIndex + 1}`);
      if (typeof mappedBlockId !== "string") {
        qualityWarnings.push(
          createWarning("OCR_BLOCK_ID_MISSING", "OCR 文本块缺少 blockId，已使用回退标识。", page)
        );
      }

      const mappedBlockText = getByPath(blockRecord, mapping.blockTextPath);
      const blockText = asString(mappedBlockText, "");
      if (typeof mappedBlockText !== "string") {
        qualityWarnings.push(
          createWarning("OCR_BLOCK_TEXT_MISSING", "OCR 文本块缺少文本内容，已回退为空字符串。", page)
        );
      }

      const coordinates = mapCoordinates(getByPath(blockRecord, mapping.coordinatesPath), mapping, page, qualityWarnings);

      blocks.push({
        page,
        blockId,
        text: blockText,
        confidence: asNumber(getByPath(blockRecord, mapping.blockConfidencePath), confidence),
        coordinates
      });
    });
  });

  const warningItems = getByPath(data, mapping.warningsPath);
  if (warningItems !== undefined && !Array.isArray(warningItems)) {
    qualityWarnings.push(
      createWarning("OCR_WARNINGS_INVALID", "OCR 质量提示结构无效，已忽略该字段。")
    );
  }

  const mappedWarnings = (Array.isArray(warningItems) ? warningItems : []).map((warningItem, index) => {
    const warningRecord = asRecord(warningItem);
    const warning: OcrQualityWarning = {
      code: asString(getByPath(warningRecord, mapping.warningCodePath), `OCR_WARNING_${index + 1}`),
      message: asString(getByPath(warningRecord, mapping.warningMessagePath), "OCR 质量提示"),
      severity: normalizeSeverity(getByPath(warningRecord, mapping.warningSeverityPath))
    };
    const warningPage = getByPath(warningRecord, mapping.warningPagePath);
    if (typeof warningPage === "number") {
      warning.page = warningPage;
    }
    return warning;
  });

  return {
    pages,
    blocks,
    qualityWarnings: [...qualityWarnings, ...mappedWarnings]
  };
}

function buildRequestBody(input: OcrDocumentInput): Record<string, unknown> {
  // HTTP provider 的请求体只表达 provider 边界需要的材料：文档标识、文件元信息、存储键或二进制内容。
  // 这里不做文件系统读取，调用方可以传 Uint8Array 或 storageKey，便于后续接入对象存储/任务队列。
  return {
    documentId: input.documentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    contentBase64: input.content ? Buffer.from(input.content).toString("base64") : undefined
  };
}

function createRetryableFailure(providerName: string): ProviderError {
  return new ProviderError(`HTTP OCR 调用失败：${providerName} 返回了可重试的脱敏错误`, {
    providerName,
    retryable: true,
    code: "HTTP_OCR_RETRYABLE_FAILURE"
  });
}

function createNonRetryableFailure(providerName: string, code: string, message: string): ProviderError {
  return new ProviderError(message, {
    providerName,
    retryable: false,
    code
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createHttpOcrProvider(config: HttpOcrProviderConfig): OcrProvider {
  const providerName = config.providerName ?? "http-ocr";
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const maxRetries = config.maxRetries ?? 2;
  const retryDelayMs = config.retryDelayMs ?? 500;
  const mapping = normalizeMapping(config.responseMapping);

  return {
    providerName,
    async recognize(input) {
      // maxRetries 表示首次请求失败后的额外重试次数，因此总尝试次数是 maxRetries + 1。
      // 只有网络异常、超时、408/429/5xx 这类传输层问题才进入重试；200 成功后的坏 JSON / 坏 mapping
      // 视为 provider 响应契约错误，直接返回不可重试的脱敏错误。
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetchFn(config.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...config.headers
            },
            body: JSON.stringify(buildRequestBody(input)),
            signal: controller.signal
          });

          if (!response.ok) {
            if (isRetryableStatus(response.status)) {
              if (attempt < maxRetries) {
                await delay(retryDelayMs);
                continue;
              }
              throw createRetryableFailure(providerName);
            }

            throw createNonRetryableFailure(
              providerName,
              "HTTP_OCR_NON_RETRYABLE_FAILURE",
              `HTTP OCR 调用失败：${providerName} 返回了不可重试的脱敏错误`
            );
          }

          let data: unknown;
          try {
            data = (await response.json()) as unknown;
          } catch {
            throw createNonRetryableFailure(
              providerName,
              "HTTP_OCR_BAD_RESPONSE",
              `HTTP OCR 响应无效：${providerName} 返回了不可解析的脱敏响应`
            );
          }

          const mapped = mapResponse(data, mapping, providerName);
          return {
            providerName,
            ...mapped,
            raw: {
              // raw 只保留无敏感语义的状态摘要，避免把 OCR 服务响应或病历文本透传到上层。
              responseStatus: response.status
            }
          };
        } catch (error) {
          clearTimeout(timeout);

          if (error instanceof ProviderError) {
            throw error;
          }

          if (attempt < maxRetries) {
            await delay(retryDelayMs);
            continue;
          }

          throw createRetryableFailure(providerName);
        } finally {
          clearTimeout(timeout);
        }
      }

      throw createRetryableFailure(providerName);
    }
  };
}
