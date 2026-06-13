/**
 * 参数解析 + 输出格式化（参考 DWS 的 --format json/table 模式）
 */

export function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--format' || arg === '-f') {
      args.format = argv[++i];
    } else if (arg === '--api-url') {
      args.apiUrl = argv[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
    i++;
  }
  return args;
}

export function output(data, format = 'table') {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    formatTable(data);
  }
}

function formatTable(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('_(无数据)_');
      return;
    }
    const keys = Object.keys(data);
    // Header
    console.log('| ' + keys.join(' | ') + ' |');
    console.log('| ' + keys.map(() => '---').join(' | ') + ' |');
    // Rows
    data.forEach(row => {
      console.log('| ' + keys.map(k => String(row[k] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |');
    });
  } else if (typeof data === 'object') {
    // 对象：用 Markdown 键值对格式
    const entries = Object.entries(data);
    entries.forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.log(`**${key}:**`);
        console.log('```json');
        console.log(JSON.stringify(value, null, 2));
        console.log('```');
      } else {
        console.log(`**${key}:** ${value}`);
      }
    });
  } else {
    console.log(data);
  }
}

export function getApiUrl(args) {
  return args.apiUrl || process.env.MRA_API_URL || 'http://localhost:3000';
}

export function getApiToken(args) {
  return args.token || process.env.MRA_API_TOKEN || '';
}
