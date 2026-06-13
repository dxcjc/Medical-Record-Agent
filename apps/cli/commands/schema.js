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
