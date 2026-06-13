/**
 * mra result <job_id> [--format json|table]
 * 获取识别结果
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function result(args) {
  const jobId = args._[1];
  if (!jobId) {
    console.error('用法: mra result <job_id> [--format json|table]');
    process.exit(1);
  }

  const res = await apiRequest(args, 'GET', '/results/' + jobId);

  if (args.format === 'json') {
    output(res, 'json');
    return;
  }

  // table 格式：展示字段摘要
  // fields 可能是数组（每个元素有 fieldKey）或对象（key→value）
  const fieldEntries = Array.isArray(res.fields)
    ? res.fields.map(f => [f.fieldKey || '?', f])
    : Object.entries(res.fields || {});

  const rows = fieldEntries.map(([key, field]) => ({
    字段: key,
    值: truncate(String(field.value ?? ''), 40),
    置信度: field.confidence != null ? Math.round(field.confidence * 100) + '%' : '-',
    需审核: field.needsReview ? '⚠️' : '✓',
  }));

  output(rows.length ? rows : [{ 结果: '无识别结果' }], 'table');
  console.error('\n总置信度: ' + (res.confidence != null ? Math.round(res.confidence * 100) + '%' : '-'));
  console.error('需审核: ' + (res.reviewRequired ? '是' : '否'));
}

function truncate(s, len) {
  return s.length > len ? s.slice(0, len) + '...' : s;
}
