/**
 * mra push --endpoint <url> --job <job_id> [--token <token>]
 * 将识别结果推送到外部系统
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function push(args) {
  const endpoint = args.endpoint;
  const jobId = args.job;

  if (!endpoint || !jobId) {
    console.error('用法: mra push --endpoint <url> --job <job_id> [--token <token>]');
    console.error('  --endpoint  外部系统接收 URL (必需)');
    console.error('  --job       任务 ID (必需)');
    process.exit(1);
  }

  // 1. 获取识别结果
  const result = await apiRequest(args, 'GET', '/results/' + jobId);

  // 2. 推送到外部系统
  const payload = {
    jobId,
    fields: result.fields,
    confidence: result.confidence,
    reviewRequired: result.reviewRequired,
    pushedAt: new Date().toISOString(),
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('推送失败: ' + res.status + ' ' + text);
  }

  const pushResult = {
    success: true,
    job_id: jobId,
    endpoint,
    status: res.status,
    response: await res.text().catch(() => ''),
  };

  output(pushResult, args.format);
}
