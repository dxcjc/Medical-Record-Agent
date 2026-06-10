function throwIfAborted(signal: AbortSignal | undefined) {
  signal?.throwIfAborted();
}

/**
 * 将浏览器 File/Blob 内容转成 base64，供 JSON 上传接口传递二进制病历文件。
 * 这里只做编码转换，不做脱敏；真实敏感数据是否允许上传由调用方的隐私策略和后端权限控制。
 */
export async function blobToBase64(blob: Blob, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const buffer = await blob.arrayBuffer();
  throwIfAborted(signal);
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    throwIfAborted(signal);
    binary += String.fromCharCode(byte);
  }

  throwIfAborted(signal);
  return btoa(binary);
}

async function digestSha256(buffer: ArrayBuffer, signal?: AbortSignal): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    throwIfAborted(signal);
    return digest;
  }

  // 病历文件校验值应在浏览器 WebCrypto 中计算；如果运行环境缺失该能力，直接让页面上传失败并提示用户。
  throw new Error("当前浏览器不支持文件校验计算，请更换浏览器后重试。");
}

/**
 * 计算 Blob 的 SHA-256 十六进制摘要，供上传接口记录真实文件校验值。
 * 后端可以用这个值校验受控存储里的字节是否和浏览器提交内容一致。
 */
export async function blobSha256Hex(blob: Blob, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const buffer = await blob.arrayBuffer();
  throwIfAborted(signal);
  const digest = new Uint8Array(await digestSha256(buffer, signal));
  throwIfAborted(signal);

  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
