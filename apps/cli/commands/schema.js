/**
 * mra schema <command>
 * 查看命令的参数 Schema（参考 dws schema）
 */
import { output } from '../lib/format.js';

const SCHEMAS = {
  recognize: {
    command: 'recognize',
    description: '上传病历图片并触发识别',
    usage: 'mra recognize --file <path> [--schema <key>]',
    flags: {
      file:   { type: 'string', required: true, description: '病历图片路径' },
      schema: { type: 'string', required: false, description: '识别 schema key', default: 'tumor-gene-test' },
    },
    required: ['file'],
  },
  status: {
    command: 'status',
    description: '查询识别任务状态',
    usage: 'mra status <job_id>',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {},
    required: ['job_id'],
  },
  result: {
    command: 'result',
    description: '获取识别结果',
    usage: 'mra result <job_id> [--format json|table]',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {
      format: { type: 'string', required: false, description: '输出格式', default: 'table' },
    },
    required: ['job_id'],
  },
  feedback: {
    command: 'feedback',
    description: '纠正识别字段',
    usage: 'mra feedback <job_id> --field <key> --value <value>',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {
      field: { type: 'string', required: true, description: '要纠正的字段 key' },
      value: { type: 'string', required: true, description: '正确的值' },
    },
    required: ['job_id', 'field', 'value'],
  },
  knowledge: {
    command: 'knowledge',
    description: '知识库管理',
    usage: 'mra knowledge <search <query>|list [--kind <type>]>',
    subcommands: {
      search: { flags: { query: { type: 'string', required: true } } },
      list:   { flags: { kind: { type: 'string', required: false } } },
    },
  },
  schemas: {
    command: 'schemas',
    description: '列出可用的识别 schema',
    usage: 'mra schemas',
    flags: {},
  },
  jobs: {
    command: 'jobs',
    description: '列出识别任务',
    usage: 'mra jobs [--status <status>] [--limit <n>]',
    flags: {
      status: { type: 'string', required: false, description: '筛选状态' },
      limit:  { type: 'number', required: false, description: '返回数量', default: 20 },
    },
  },
  push: {
    command: 'push',
    description: '推送识别结果到外部系统',
    usage: 'mra push --endpoint <url> --job <job_id> [--token <token>]',
    flags: {
      endpoint: { type: 'string', required: true, description: '外部系统接收 URL' },
      job:      { type: 'string', required: true, description: '任务 ID' },
      token:    { type: 'string', required: false, description: '认证 token' },
      format:   { type: 'string', required: false, description: '输出格式', default: 'table' },
    },
    required: ['endpoint', 'job'],
  },
  stats: {
    command: 'stats',
    description: '查看字段识别统计',
    usage: 'mra stats [--schema <key>] [--format json|table]',
    flags: {
      schema: { type: 'string', required: false, description: 'Schema key', default: 'tumor-gene-test' },
      format: { type: 'string', required: false, description: '输出格式', default: 'table' },
    },
  },
  trend: {
    command: 'trend',
    description: '查看识别趋势数据',
    usage: 'mra trend [--schema <key>] [--days 30] [--format json|table]',
    flags: {
      schema: { type: 'string', required: false, description: 'Schema key', default: 'tumor-gene-test' },
      days:   { type: 'number', required: false, description: '天数', default: 30 },
      format: { type: 'string', required: false, description: '输出格式', default: 'table' },
    },
  },
  delete: {
    command: 'delete',
    description: '软删除识别任务',
    usage: 'mra delete <job_id> [--yes] [--token <token>]',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {
      yes:   { type: 'boolean', required: false, description: '跳过确认' },
      token: { type: 'string', required: false, description: '认证 token' },
    },
    required: ['job_id'],
  },
  rerun: {
    command: 'rerun',
    description: '重新执行识别任务',
    usage: 'mra rerun <job_id> [--token <token>]',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {
      token: { type: 'string', required: false, description: '认证 token' },
    },
    required: ['job_id'],
  },
  export: {
    command: 'export',
    description: '导出识别结果为 JSON 文件',
    usage: 'mra export <job_id> [--output <path>] [--token <token>]',
    positional: [{ name: 'job_id', required: true, description: '任务 ID' }],
    flags: {
      output: { type: 'string', required: false, description: '输出文件路径', default: '<job_id>.json' },
      token:  { type: 'string', required: false, description: '认证 token' },
    },
    required: ['job_id'],
  },
};

export async function schema(args) {
  const cmd = args._[1];

  if (!cmd) {
    const rows = Object.entries(SCHEMAS).map(([name, s]) => ({
      命令: name,
      描述: s.description,
    }));
    output(rows, args.format || 'table');
    console.error('\n用法: mra schema <command> 查看详细参数');
    return;
  }

  if (!SCHEMAS[cmd]) {
    console.error('未知命令: ' + cmd);
    console.error('可用命令: ' + Object.keys(SCHEMAS).join(', '));
    process.exit(1);
  }

  output(SCHEMAS[cmd], args.format || 'json');
}
