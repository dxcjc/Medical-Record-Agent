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
