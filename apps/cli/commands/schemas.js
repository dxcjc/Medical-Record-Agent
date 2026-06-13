/**
 * mra schemas
 * 列出可用的识别 schema
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function schemas(args) {
  const res = await apiRequest(args, 'GET', '/schemas');
  const list = res.versions || res.schemas || res || [];

  if (args.format === 'json') {
    output(list, 'json');
    return;
  }

  const rows = (Array.isArray(list) ? list : []).map(s => ({
    KEY: s.schemaKey || s.key,
    名称: s.displayName || s.name,
    版本: s.version || '-',
    状态: s.status || '-',
  }));
  output(rows.length ? rows : [{ 结果: '无可用 schema (使用内置 tumor-gene-test)' }], 'table');
}
