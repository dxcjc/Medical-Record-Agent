import type {
  MockOcrProviderConfig,
  OcrPage,
  OcrProvider,
  OcrTextBlock
} from "./providerTypes";

const defaultBlock: OcrTextBlock = {
  page: 1,
  blockId: "mock-block-1",
  text: "模拟 OCR 文本",
  confidence: 0.99,
  coordinates: { x: 0, y: 0, width: 100, height: 20 }
};

function buildPagesFromBlocks(blocks: OcrTextBlock[]): OcrPage[] {
  const pageMap = new Map<number, { text: string[]; confidences: number[] }>();

  for (const block of blocks) {
    const current = pageMap.get(block.page) ?? { text: [], confidences: [] };
    current.text.push(block.text);
    current.confidences.push(block.confidence);
    pageMap.set(block.page, current);
  }

  return [...pageMap.entries()]
    .sort(([leftPage], [rightPage]) => leftPage - rightPage)
    .map(([page, value]) => ({
      page,
      text: value.text.join("\n"),
      confidence:
        value.confidences.reduce((sum, confidence) => sum + confidence, 0) /
        Math.max(value.confidences.length, 1)
    }));
}

export function createMockOcrProvider(config: MockOcrProviderConfig = {}): OcrProvider {
  const providerName = config.providerName ?? "mock-ocr";
  const blocks = config.blocks ?? [defaultBlock];
  const pages = config.pages ?? buildPagesFromBlocks(blocks);
  const qualityWarnings = config.qualityWarnings ?? [];

  return {
    providerName,
    async recognize() {
      // Mock provider 不读取真实文件，也不根据输入内容变化输出。
      // 这样测试和 Demo 可以稳定复现同一份 OCR 结果，避免把测试可靠性绑定到外部服务。
      return {
        providerName,
        pages,
        blocks,
        qualityWarnings
      };
    }
  };
}
