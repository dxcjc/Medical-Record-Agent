import type { OcrDocumentInput, OcrProvider, OcrResult, OcrQualityWarning } from "../providers/providerTypes";

export interface DocumentPipelineInput {
  provider: OcrProvider;
  document: OcrDocumentInput;
}

export interface DocumentPipelineResult {
  providerName: string;
  ocrResult: OcrResult;
  ocrText: string;
}

export async function runDocumentPipeline(input: DocumentPipelineInput): Promise<DocumentPipelineResult> {
  // 文档管线当前只负责调用 OCR provider 并拼出抽取所需文本。
  // 文件读取、生产存储和真实 PDF/Image 预处理会在后续 API/storage 任务中接入，避免 core 层提前绑定基础设施。
  const ocrResult = await input.provider.recognize(input.document);
  const ocrText = ocrResult.pages
    .slice()
    .sort((left, right) => left.page - right.page)
    .map((page) => page.text)
    .join("\n");

  return {
    providerName: ocrResult.providerName,
    ocrResult,
    ocrText
  };
}

export interface MultiDocumentPipelineInput {
  provider: OcrProvider;
  documents: readonly OcrDocumentInput[];
}

export async function runMultiDocumentPipeline(input: MultiDocumentPipelineInput): Promise<DocumentPipelineResult> {
  const results: Array<{ index: number; document: OcrDocumentInput; result: OcrResult }> = [];
  const failedDocuments: Array<{ index: number; document: OcrDocumentInput; error: unknown }> = [];

  for (let index = 0; index < input.documents.length; index += 1) {
    const document = input.documents[index]!;
    try {
      const result = await input.provider.recognize(document);
      results.push({ index, document, result });
    } catch (error) {
      failedDocuments.push({ index, document, error });
    }
  }

  if (results.length === 0) {
    const firstFailure = failedDocuments[0];
    throw firstFailure?.error ?? new Error("所有文档 OCR 识别失败");
  }

  // 按文档顺序合并，每个文档的页码从上一个文档的页数之后继续
  let pageOffset = 0;
  const mergedPages: OcrResult["pages"] = [];
  const mergedBlocks: OcrResult["blocks"] = [];
  const mergedWarnings: OcrQualityWarning[] = [];
  const textParts: string[] = [];

  for (let index = 0; index < input.documents.length; index += 1) {
    const document = input.documents[index]!;
    const docResult = results.find((r) => r.index === index);

    if (!docResult) {
      // 该文档识别失败，在文本中标注失败信息
      const fileName = document.fileName ?? document.documentId;
      textParts.push(`[文件 ${index + 1}: ${fileName}]\n【OCR 识别失败】`);
      mergedWarnings.push({
        code: "DOCUMENT_OCR_FAILED",
        message: `[文件 ${index + 1}: ${fileName}] OCR 识别失败`,
        severity: "warning"
      });
      continue;
    }

    const { result } = docResult;
    const fileName = document.fileName ?? document.documentId;
    const docPageCount = result.pages.length;

    // 合并页面文本，前缀标注文件来源
    const docText = result.pages
      .slice()
      .sort((left, right) => left.page - right.page)
      .map((page) => page.text)
      .join("\n");
    textParts.push(`[文件 ${index + 1}: ${fileName}]\n${docText}`);

    // 合并 pages，重新编号
    for (const page of result.pages) {
      mergedPages.push({
        ...page,
        page: page.page + pageOffset
      });
    }

    // 合并 blocks，重新编号页码
    for (const block of result.blocks) {
      mergedBlocks.push({
        ...block,
        page: block.page + pageOffset
      });
    }

    // 合并质量告警，标注来源文件
    for (const warning of result.qualityWarnings) {
      mergedWarnings.push({
        ...warning,
        message: `[文件 ${index + 1}: ${fileName}] ${warning.message}`
      });
    }

    pageOffset += docPageCount;
  }

  const firstResult = results[0]!;
  return {
    providerName: firstResult.result.providerName,
    ocrResult: {
      providerName: firstResult.result.providerName,
      pages: mergedPages,
      blocks: mergedBlocks,
      qualityWarnings: mergedWarnings,
      raw: { documentCount: input.documents.length, successfulCount: results.length, failedCount: failedDocuments.length }
    },
    ocrText: textParts.join("\n\n")
  };
}
