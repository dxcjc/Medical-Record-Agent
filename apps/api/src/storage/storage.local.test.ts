import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalStorageProvider } from "./local-storage.provider";

describe("createLocalStorageProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    // 每个用例都使用独立临时目录，避免测试之间相互污染文件状态。
    tempDir = await mkdtemp(path.join(tmpdir(), "storage-local-"));
  });

  afterEach(async () => {
    // 测试结束后递归删除临时目录，确保本地环境不会残留测试文件。
    await rm(tempDir, { recursive: true, force: true });
  });

  it("能够写入、读取并删除文件", async () => {
    const provider = createLocalStorageProvider({ rootDir: tempDir });
    const body = Buffer.from("病历附件内容", "utf8");

    const storedFile = await provider.put({
      key: "cases/2026/record.txt",
      body,
      contentType: "text/plain"
    });

    expect(storedFile.key).toBe("cases/2026/record.txt");
    expect(storedFile.size).toBe(body.byteLength);

    const loadedFile = await provider.get("cases/2026/record.txt");

    expect(loadedFile).not.toBeNull();
    expect(loadedFile?.body.toString("utf8")).toBe("病历附件内容");
    expect(loadedFile?.contentType).toBe("text/plain");

    await provider.delete("cases/2026/record.txt");

    await expect(provider.get("cases/2026/record.txt")).resolves.toBeNull();
  });

  it("返回值只暴露逻辑 key，不暴露本地绝对路径", async () => {
    const provider = createLocalStorageProvider({ rootDir: tempDir });

    const storedFile = await provider.put({
      key: "reports/private.pdf",
      body: Buffer.from("pdf")
    });

    expect(storedFile.key).toBe("reports/private.pdf");
    expect(storedFile.key).not.toContain(tempDir);
    expect(Object.keys(storedFile)).not.toContain("path");
  });
});
