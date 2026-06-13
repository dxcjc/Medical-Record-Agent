/**
 * mra jobs [--status <status>] [--limit <n>]
 * 列出识别任务
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function listJobs(args) {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.limit) params.set('limit', args.limit);
  const qs = params.toString() ? '?' + params.toString() : '';

  const res = await apiRequest(args, 'GET', '/jobs' + qs);
  const jobs = res.jobs || res.items || res || [];

  if (args.format === 'json') {
    output(jobs, 'json');
    return;
  }

  const rows = (Array.isArray(jobs) ? jobs : []).map(j => ({
    ID: (j.id || '').slice(0, 12),
    状态: j.status,
    Schema: j.schemaKey,
    创建: j.createdAt ? new Date(j.createdAt).toLocaleString('zh-CN') : '-',
  }));
  output(rows.length ? rows : [{ 结果: '无任务' }], 'table');
}
