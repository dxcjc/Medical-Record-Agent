import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PutFileInput, StorageProvider, StoredFile } from "./storage.types";

export interface LocalStorageProviderOptions {
  /**
   * 本地存储根目录。所有逻辑 key 最终都会被约束在这个目录之下。
   */
  rootDir: string;
}

/**
 * 规范化并校验逻辑 key，避免路径穿越写到根目录之外。
 */
function normalizeStorageKey(key: string) {
  const normalizedKey = key.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!normalizedKey) {
    throw new Error("存储 key 不能为空");
  }

  if (normalizedKey.includes("\0")) {
    throw new Error("存储 key 不能包含空字符");
  }

  const segments = normalizedKey.split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment.length === 0)) {
    throw new Error("存储 key 包含非法路径片段");
  }

  return normalizedKey;
}

/**
 * 把逻辑 key 映射到受控根目录内的绝对路径，并再次校验最终结果没有逃逸出根目录。
 */
function resolveLocalPath(rootDir: string, key: string) {
  const normalizedKey = normalizeStorageKey(key);
  const absoluteRootDir = path.resolve(rootDir);
  const absoluteFilePath = path.resolve(absoluteRootDir, normalizedKey);
  const relativePath = path.relative(absoluteRootDir, absoluteFilePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("存储 key 超出了本地存储根目录");
  }

  return {
    normalizedKey,
    absoluteRootDir,
    absoluteFilePath,
    absoluteMetadataPath: `${absoluteFilePath}.meta.json`
  };
}

interface LocalFileMetadata {
  /**
   * 与二进制文件并存的轻量元数据，目前只记录内容类型，后续可按需扩展。
   */
  contentType?: string;
}

function createLocalFileMetadata(contentType?: string): LocalFileMetadata {
  return contentType ? { contentType } : {};
}

/**
 * 第一版本地文件存储实现。
 * 它只把逻辑 key 暴露给调用方，底层磁盘绝对路径只在 provider 内部使用。
 */
export function createLocalStorageProvider(options: LocalStorageProviderOptions): StorageProvider {
  return {
    async put(input: PutFileInput) {
      const { normalizedKey, absoluteFilePath, absoluteMetadataPath } = resolveLocalPath(options.rootDir, input.key);

      // 先确保父目录存在，再原子性写入文件内容。
      await mkdir(path.dirname(absoluteFilePath), { recursive: true });
      await Promise.all([
        writeFile(absoluteFilePath, input.body),
        writeFile(
          absoluteMetadataPath,
          JSON.stringify(createLocalFileMetadata(input.contentType), null, 2),
          "utf8"
        )
      ]);

      return {
        key: normalizedKey,
        size: input.body.byteLength,
        ...(input.contentType ? { contentType: input.contentType } : {})
      };
    },

    async get(key: string): Promise<StoredFile | null> {
      const { normalizedKey, absoluteFilePath, absoluteMetadataPath } = resolveLocalPath(options.rootDir, key);

      try {
        const [body, fileStat, metadataContent] = await Promise.all([
          readFile(absoluteFilePath),
          stat(absoluteFilePath),
          readFile(absoluteMetadataPath, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
              return "{}";
            }

            throw error;
          })
        ]);
        let metadata: LocalFileMetadata = {};
        try {
          metadata = JSON.parse(metadataContent) as LocalFileMetadata;
        } catch {
          metadata = {};
        }

        return {
          key: normalizedKey,
          body,
          size: fileStat.size,
          ...(metadata.contentType ? { contentType: metadata.contentType } : {})
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },

    async delete(key: string) {
      const { absoluteFilePath, absoluteMetadataPath } = resolveLocalPath(options.rootDir, key);

      // 删除操作保持幂等，文件不存在时直接视为成功。
      await Promise.all([rm(absoluteFilePath, { force: true }), rm(absoluteMetadataPath, { force: true })]);
    }
  };
}
