/**
 * mra stats [--schema <key>] [--format json|table]
 * 查看字段识别统计
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function stats(args) {
  const schemaKey = args.schema || 'tumor-gene-test';
  const path = '/api/stats/fields?schemaKey=' + encodeURIComponent(schemaKey);

  const data = await apiRequest(args, 'GET', path);

  if (args.format === 'json') {
    output(data, 'json');
    return;
  }

  // table 格式
  const items = Array.isArray(data) ? data : (data.fields || data.items || []);
  if (items.length === 0) {
    output([{ 提示: '暂无统计数据' }], 'table');
    return;
  }

  const rows = items.map(item => ({
    字段: item.fieldKey || '-',
    识别次数: item.recognitionCount ?? '-',
    置信度均值: item.avgConfidence != null ? Math.round(item.avgConfidence * 100) + '%' : '-',
    复核次数: item.reviewCount ?? '-',
    修正次数: item.correctionCount ?? '-',
  }));

  output(rows, 'table');
}
