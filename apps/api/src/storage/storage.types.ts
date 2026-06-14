import type { Readable } from "node:stream";

/**
 * 存储层只向上暴露逻辑文件标识和文件内容，不暴露底层磁盘绝对路径或对象存储内部实现细节。
 */
export interface StoredFileDescriptor {
  /**
   * 供业务层保存和回传的逻辑 key。
   * 这个值可以被后续读取、删除接口复用，但不应等同于本地绝对路径。
   */
  key: string;
  /**
   * 文件大小，单位为字节。
   */
  size: number;
  /**
   * 可选的内容类型，便于上层透传下载响应头或做基本校验。
   */
  contentType?: string;
  /**
   * 对象存储场景下可选返回 etag，便于调试与后续扩展。
   */
  etag?: string;
}

/**
 * 读取到的文件内容对象。
 */
export interface StoredFile extends StoredFileDescriptor {
  /**
   * 二进制文件内容。
   */
  body: Buffer;
}

/**
 * 以流式方式读取到的文件描述对象。
 */
export interface StoredFileStream extends StoredFileDescriptor {
  /**
   * 可读流，适合大文件场景，避免一次性加载到内存。
   */
  stream: Readable;
}

/**
 * 写入文件时需要的最小输入。
 */
export interface PutFileInput {
  /**
   * 由业务层分配的逻辑 key。
   */
  key: string;
  /**
   * 待写入的二进制内容。
   */
  body: Buffer;
  /**
   * 可选内容类型。
   */
  contentType?: string;
}

/**
 * 统一存储提供者接口。
 */
export interface StorageProvider {
  /**
   * 写入一个文件，并返回可安全暴露给上层的逻辑描述信息。
   */
  put(input: PutFileInput): Promise<StoredFileDescriptor>;
  /**
   * 读取一个逻辑 key 对应的文件；不存在时返回 null。
   */
  get(key: string): Promise<StoredFile | null>;
  /**
   * 以流式方式读取一个逻辑 key 对应的文件；不存在时返回 null。
   * 适用于大文件场景，避免一次性将整个文件加载到内存。
   */
  getStream?(key: string): Promise<StoredFileStream | null>;
  /**
   * 删除一个逻辑 key 对应的文件；不存在时保持幂等。
   */
  delete(key: string): Promise<void>;
}
