/**
 * mra delete <job_id> [--yes] [--token <token>]
 * 软删除识别任务
 */
import { createInterface } from 'node:readline';
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function deleteJob(args) {
  const jobId = args._[1];
  if (!jobId) {
    console.error('用法: mra delete <job_id> [--yes] [--token <token>]');
    console.error('  --yes / -y  跳过确认');
    process.exit(1);
  }

  // 确认删除
  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise(resolve => {
      rl.question('确认删除任务 ' + jobId + '? (y/N) ', resolve);
    });
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.error('已取消');
      process.exit(0);
    }
  }

  await apiRequest(args, 'DELETE', '/jobs/' + jobId);

  output({ success: true, job_id: jobId, deleted: true }, args.format);
}
