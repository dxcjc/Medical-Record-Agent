import { describe, expect, it } from "vitest";

import { blobSha256Hex, blobToBase64 } from "./fileContent";

describe("blobToBase64", () => {
  it("把浏览器 Blob 内容转换成可传给文件上传 API 的 base64", async () => {
    const blob = new Blob(["DEMO_PDF_BYTES"], {
      type: "application/pdf",
    });

    await expect(blobToBase64(blob)).resolves.toBe("REVNT19QREZfQllURVM=");
  });

  it("计算浏览器 Blob 内容的 SHA-256 十六进制校验值", async () => {
    const blob = new Blob(["DEMO_PDF_BYTES"], {
      type: "application/pdf",
    });

    await expect(blobSha256Hex(blob)).resolves.toBe("b66f1b66ec824925d01f389a3494722c0676af4d131cc3bd7d38b7c06bf62d61");
  });

  it("base64 转换在异步读取前响应 AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(blobToBase64(new Blob(["DEMO_PDF_BYTES"]), controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  it("SHA-256 计算在异步读取前响应 AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(blobSha256Hex(new Blob(["DEMO_PDF_BYTES"]), controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});
