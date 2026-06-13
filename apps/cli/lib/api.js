/**
 * API 客户端（参考 DWS 的 HTTP 封装层）
 */

import { getApiUrl, getApiToken } from './format.js';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

function buildHeaders(args) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getApiToken(args);
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return headers;
}

export async function apiRequest(args, method, path, body) {
  const baseUrl = getApiUrl(args);
  const url = baseUrl + path;
  const opts = {
    method,
    headers: buildHeaders(args),
  };
  if (body) opts.body = JSON.stringify(body);

  if (args.verbose) console.error('→ ' + method + ' ' + url);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('API ' + res.status + ': ' + (text || res.statusText));
  }
  return res.json();
}

export async function uploadFile(args, filePath, schemaKey) {
  const baseUrl = getApiUrl(args);
  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);
  const crypto = await import('node:crypto');
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 1. 上传文件（JSON + base64）
  const uploadBody = {
    originalName: fileName,
    mimeType: 'image/png',
    byteSize: fileBuffer.length,
    checksumSha256: checksum,
    contentBase64: fileBuffer.toString('base64'),
  };

  if (args.verbose) console.error('→ POST ' + baseUrl + '/files');
  const uploadRes = await fetch(baseUrl + '/files', {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(uploadBody),
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error('上传失败: ' + uploadRes.status + ' ' + text);
  }
  const uploadData = await uploadRes.json();
  const fileId = uploadData.id || uploadData.file?.id;

  // 2. 创建识别任务
  const jobBody = {
    sourceFileId: fileId,
    schemaKey: schemaKey || 'tumor-gene-test',
  };
  if (args.verbose) console.error('→ POST ' + baseUrl + '/jobs');
  const jobRes = await fetch(baseUrl + '/jobs', {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify(jobBody),
  });
  if (!jobRes.ok) {
    const text = await jobRes.text().catch(() => '');
    throw new Error('创建任务失败: ' + jobRes.status + ' ' + text);
  }
  return jobRes.json();
}
