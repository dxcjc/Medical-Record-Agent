/**
 * 将浏览器 File/Blob 内容转成 base64，供 JSON 上传接口传递二进制病历文件。
 * 这里只做编码转换，不做脱敏；真实敏感数据是否允许上传由调用方的隐私策略和后端权限控制。
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function digestSha256(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle.digest("SHA-256", buffer);
  }

  // 病历文件校验值应在浏览器 WebCrypto 中计算；如果运行环境缺失该能力，直接让页面上传失败并提示用户。
  throw new Error("当前浏览器不支持文件校验计算，请更换浏览器后重试。");
}

/**
 * 计算 Blob 的 SHA-256 十六进制摘要，供上传接口记录真实文件校验值。
 * 后端可以用这个值校验受控存储里的字节是否和浏览器提交内容一致。
 */
export async function blobSha256Hex(blob: Blob): Promise<string> {
  const digest = new Uint8Array(await digestSha256(await blob.arrayBuffer()));

  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
