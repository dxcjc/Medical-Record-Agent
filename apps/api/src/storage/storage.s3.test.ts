import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { createS3StorageProvider } from "./s3-storage.provider";

describe("createS3StorageProvider", () => {
  it("会按 bucket、key 和元数据组装上传请求", async () => {
    let sentCommand: unknown;
    const send = vi.fn(async (command: unknown) => {
      sentCommand = command;
      return { ETag: "\"etag-value\"" };
    });
    const provider = createS3StorageProvider({
      bucket: "medical-records",
      client: { send }
    });

    const storedFile = await provider.put({
      key: "attachments/report-1.pdf",
      body: Buffer.from("pdf-body"),
      contentType: "application/pdf"
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentCommand).toBeInstanceOf(PutObjectCommand);
    expect((sentCommand as PutObjectCommand).input).toMatchObject({
      Bucket: "medical-records",
      Key: "attachments/report-1.pdf",
      Body: Buffer.from("pdf-body"),
      ContentType: "application/pdf"
    });
    expect(storedFile).toMatchObject({
      key: "attachments/report-1.pdf",
      size: Buffer.byteLength("pdf-body"),
      etag: "\"etag-value\""
    });
  });

  it("会按 key 组装下载请求并把响应流读取为 Buffer", async () => {
    let sentCommand: unknown;
    const send = vi.fn(async (command: unknown) => {
      sentCommand = command;
      if (command instanceof GetObjectCommand) {
        return {
          Body: Readable.from([Buffer.from("s3-file-body")]),
          ContentType: "text/plain",
          ContentLength: 12
        };
      }

      throw new Error("unexpected command");
    });
    const provider = createS3StorageProvider({
      bucket: "medical-records",
      client: { send }
    });

    const loadedFile = await provider.get("attachments/note.txt");

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentCommand).toBeInstanceOf(GetObjectCommand);
    expect((sentCommand as GetObjectCommand).input).toMatchObject({
      Bucket: "medical-records",
      Key: "attachments/note.txt"
    });
    expect(loadedFile).toMatchObject({
      key: "attachments/note.txt",
      contentType: "text/plain",
      size: 12
    });
    expect(loadedFile?.body.toString("utf8")).toBe("s3-file-body");
  });

  it("会按 key 组装删除请求", async () => {
    let sentCommand: unknown;
    const send = vi.fn(async (command: unknown) => {
      sentCommand = command;
      return {};
    });
    const provider = createS3StorageProvider({
      bucket: "medical-records",
      client: { send }
    });

    await provider.delete("attachments/archive.zip");

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentCommand).toBeInstanceOf(DeleteObjectCommand);
    expect((sentCommand as DeleteObjectCommand).input).toMatchObject({
      Bucket: "medical-records",
      Key: "attachments/archive.zip"
    });
  });
});
