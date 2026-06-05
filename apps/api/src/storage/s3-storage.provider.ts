import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

import type { PutFileInput, StorageProvider, StoredFile } from "./storage.types";

export interface S3StorageClientLike {
  /**
   * 这里保留与 AWS SDK 一致的 send 形态，便于生产接 S3Client、测试注入 mock client。
   */
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3StorageProviderOptions {
  /**
   * 目标 bucket 名称。
   */
  bucket: string;
  /**
   * 可注入的 S3 client；生产环境一般传真实 S3Client，单测可传 mock。
   */
  client: S3StorageClientLike;
}

/**
 * 将 S3 SDK 返回的 Body 统一读成 Buffer，屏蔽调用方对底层流实现的感知。
 */
async function readBodyToBuffer(body: unknown) {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }

  throw new Error("暂不支持的 S3 Body 类型");
}

/**
 * 第一版 S3-compatible 存储实现。
 * 该实现只关注统一接口和请求组装，不向上暴露任何底层 endpoint、bucket 内部路径之外的信息。
 */
export function createS3StorageProvider(options: S3StorageProviderOptions): StorageProvider {
  return {
    async put(input: PutFileInput) {
      const response = await options.client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType
        })
      );

      const result = response as { ETag?: string };

      return {
        key: input.key,
        size: input.body.byteLength,
        ...(input.contentType ? { contentType: input.contentType } : {}),
        ...(result.ETag ? { etag: result.ETag } : {})
      };
    },

    async get(key: string): Promise<StoredFile | null> {
      try {
        const response = (await options.client.send(
          new GetObjectCommand({
            Bucket: options.bucket,
            Key: key
          })
        )) as {
          Body?: unknown;
          ContentType?: string;
          ContentLength?: number;
        };

        const body = await readBodyToBuffer(response.Body);

        return {
          key,
          body,
          size: response.ContentLength ?? body.byteLength,
          ...(response.ContentType ? { contentType: response.ContentType } : {})
        };
      } catch (error) {
        if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") {
          return null;
        }

        throw error;
      }
    },

    async delete(key: string) {
      await options.client.send(
        new DeleteObjectCommand({
          Bucket: options.bucket,
          Key: key
        })
      );
    }
  };
}

export interface CreateS3ClientOptions {
  /**
   * S3-compatible 服务 endpoint。
   */
  endpoint: string;
  /**
   * 区域信息；MinIO 等兼容服务通常也需要一个 region 占位。
   */
  region: string;
  /**
   * 访问密钥。
   */
  accessKeyId: string;
  /**
   * 访问密钥对应的 secret。
   */
  secretAccessKey: string;
  /**
   * 是否强制 path-style 访问；兼容多数自建 S3 服务时建议开启。
   */
  forcePathStyle?: boolean;
}

/**
 * 为生产配置提供一个默认 S3 client 构造函数，后续接 env 或工厂时可以直接复用。
 */
export function createS3Client(options: CreateS3ClientOptions) {
  return new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: options.forcePathStyle ?? true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    }
  });
}
