/**
 * mra trend [--schema <key>] [--days 30] [--format json|table]
 * 查看识别趋势数据
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function trend(args) {
  const schemaKey = args.schema || 'tumor-gene-test';
  const days = args.days || 30;
  const path = '/api/stats/trend?schemaKey=' + encodeURIComponent(schemaKey) + '&days=' + days;

  const data = await apiRequest(args, 'GET', path);

  if (args.format === 'json') {
    output(data, 'json');
    return;
  }

  // table 格式
  const items = Array.isArray(data) ? data : (data.trend || data.items || []);
  if (items.length === 0) {
    output([{ 提示: '暂无趋势数据' }], 'table');
    return;
  }

  const rows = items.map(item => ({
    日期: item.date || item.day || '-',
    总数: item.total ?? '-',
    成功: item.extracted ?? item.success ?? '-',
    失败: item.failed ?? '-',
  }));

  output(rows, 'table');
}
