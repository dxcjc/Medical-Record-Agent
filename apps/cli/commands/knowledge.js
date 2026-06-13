/**
 * mra knowledge search <query> | list [--kind <type>]
 * 知识库管理
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function knowledge(args) {
  const sub = args._[1];

  if (sub === 'search') {
    const query = args._.slice(2).join(' ');
    if (!query) {
      console.error('用法: mra knowledge search <query>');
      process.exit(1);
    }
    const res = await apiRequest(args, 'GET', '/knowledge?search=' + encodeURIComponent(query));
    const rows = (res.entries || []).map(e => ({
      类型: e.kind,
      标题: e.title,
      关键词: (e.keywords || []).slice(0, 3).join(', '),
      关联字段: (e.fieldKeys || []).join(', '),
    }));
    output(rows.length ? rows : [{ 结果: '无匹配条目' }], args.format);
  } else if (sub === 'list') {
    const kind = args.kind ? '?kind=' + args.kind : '';
    const res = await apiRequest(args, 'GET', '/knowledge' + kind);
    const rows = (res.entries || []).map(e => ({
      ID: e.id.slice(0, 8),
      类型: e.kind,
      标题: e.title,
      启用: e.enabled ? '✓' : '✗',
    }));
    output(rows, args.format);
  } else {
    console.error('用法: mra knowledge <search|list>');
    console.error('  search <query>       搜索知识库');
    console.error('  list [--kind <type>] 列出知识条目');
    process.exit(1);
  }
}
