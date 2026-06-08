import { describe, expect, it } from "vitest";

import { blobToBase64 } from "./fileContent";

describe("blobToBase64", () => {
  it("把浏览器 Blob 内容转换成可传给文件上传 API 的 base64", async () => {
    const blob = new Blob(["DEMO_PDF_BYTES"], {
      type: "application/pdf",
    });

    await expect(blobToBase64(blob)).resolves.toBe("REVNT19QREZfQllURVM=");
  });
});
