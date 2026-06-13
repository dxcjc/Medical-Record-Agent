/**
 * mra status <job_id>
 * 查询识别任务状态
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function status(args) {
  const jobId = args._[1];
  if (!jobId) {
    console.error('用法: mra status <job_id>');
    process.exit(1);
  }

  const job = await apiRequest(args, 'GET', '/jobs/' + jobId);

  const display = {
    job_id: job.id,
    status: job.status,
    schema: job.schemaKey,
    created: job.createdAt,
    started: job.startedAt || '-',
    completed: job.completedAt || '-',
  };

  if (job.trace && Array.isArray(job.trace)) {
    const lastNode = job.trace[job.trace.length - 1];
    if (lastNode) {
      display.current_node = lastNode.node || lastNode.name || '-';
      display.elapsed_ms = lastNode.elapsedMs || '-';
    }
  }

  output(display, args.format);
}
