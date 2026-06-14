/**
 * mra rerun <job_id> [--token <token>]
 * 重新执行识别任务
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function rerun(args) {
  const jobId = args._[1];
  if (!jobId) {
    console.error('用法: mra rerun <job_id> [--token <token>]');
    process.exit(1);
  }

  const result = await apiRequest(args, 'POST', '/jobs/' + jobId + '/rerun');

  output({
    success: true,
    job_id: result.id || jobId,
    status: result.status || 'queued',
    message: '任务已重新提交',
  }, args.format);
}
