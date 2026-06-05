import type { OcrDocumentInput, OcrProvider, OcrResult } from "../providers/providerTypes";

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
