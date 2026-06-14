#!/usr/bin/env node
/**
 * mra — Medical Record Agent CLI
 * 参考 DWS 设计：统一入口 + 子命令 + --format json/table + schema 发现
 */

import { parseArgs } from './lib/format.js';
import { recognize } from './commands/recognize.js';
import { status } from './commands/status.js';
import { result } from './commands/result.js';
import { feedback } from './commands/feedback.js';
import { knowledge } from './commands/knowledge.js';
import { schemas } from './commands/schemas.js';
import { schema } from './commands/schema.js';
import { listJobs } from './commands/jobs.js';
import { push } from './commands/push.js';
import { stats } from './commands/stats.js';
import { trend } from './commands/trend.js';
import { deleteJob } from './commands/delete.js';
import { rerun } from './commands/rerun.js';
import { exportResult } from './commands/export.js';

const COMMANDS = {
  recognize: { fn: recognize, desc: '识别病历图片' },
  status:    { fn: status,    desc: '查询任务状态' },
  result:    { fn: result,    desc: '获取识别结果' },
  feedback:  { fn: feedback,  desc: '纠正识别字段' },
  knowledge: { fn: knowledge, desc: '知识库管理' },
  schemas:   { fn: schemas,   desc: '列出可用 schema' },
  schema:    { fn: schema,    desc: '查看命令参数 Schema' },
  jobs:      { fn: listJobs,  desc: '列出识别任务' },
  push:      { fn: push,      desc: '推送结果到外部系统' },
  stats:     { fn: stats,     desc: '字段识别统计' },
  trend:     { fn: trend,     desc: '识别趋势数据' },
  delete:    { fn: deleteJob, desc: '删除任务' },
  rerun:     { fn: rerun,     desc: '重跑识别任务' },
  export:    { fn: exportResult, desc: '导出识别结果' },
};

function showHelp() {
  console.log(`
mra — Medical Record Agent CLI

用法: mra <command> [options]

命令:
  recognize  --file <path> [--schema <key>]    识别病历图片
  status     <job_id>                           查询任务状态
  result     <job_id> [--format json|table]     获取识别结果
  feedback   <job_id> --field <key> --value <v> 纠正识别字段
  knowledge  search <query> | list              知识库管理
  schemas                                        列出可用 schema
  schema     <command>                          查看命令参数 Schema
  jobs       [--status <s>] [--limit <n>]       列出识别任务
  push       --endpoint <url> --job <id>        推送结果到外部系统
  stats      [--schema <key>]                   字段识别统计
  trend      [--schema <key>] [--days <n>]      识别趋势数据
  delete     <job_id> [--yes]                   删除任务
  rerun      <job_id>                           重跑识别任务
  export     <job_id> [--output <path>]         导出识别结果

全局选项:
  --format json|table   输出格式 (默认: table)
  --api-url <url>       API 地址 (默认: http://localhost:3000)
  --verbose             详细日志
  --help                显示帮助

示例:
  mra recognize --file scan.jpg
  mra status cmqxxx
  mra result cmqxxx --format json
  mra feedback cmqxxx --field patientName --value "张三"
  mra knowledge search "肺腺癌"
  mra schema recognize
  mra push --endpoint https://example.com/hook --job cmqxxx
  mra stats --schema tumor-gene-test
  mra trend --days 30
  mra delete cmqxxx --yes
  mra rerun cmqxxx
  mra export cmqxxx --output result.json
`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (!command || args.help) {
  showHelp();
  process.exit(0);
}

if (!COMMANDS[command]) {
  console.error(`未知命令: ${command}`);
  console.error(`可用命令: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}

try {
  await COMMANDS[command].fn(args);
} catch (error) {
  if (args.verbose) {
    console.error(error);
  } else {
    console.error(`错误: ${error.message}`);
  }
  process.exit(1);
}
