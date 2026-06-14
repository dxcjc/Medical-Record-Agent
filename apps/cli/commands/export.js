/**
 * mra export <job_id> [--output <path>] [--token <token>]
 * 导出识别结果为 JSON 文件
 */
import { writeFileSync } from 'node:fs';
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function exportResult(args) {
  const jobId = args._[1];
  if (!jobId) {
    console.error('用法: mra export <job_id> [--output <path>] [--token <token>]');
    console.error('  --output / -o  输出文件路径 (默认: <job_id>.json)');
    process.exit(1);
  }

  // 获取任务信息和识别结果
  const [job, result] = await Promise.all([
    apiRequest(args, 'GET', '/jobs/' + jobId),
    apiRequest(args, 'GET', '/results/' + jobId),
  ]);

  const exportData = {
    jobId: job.id,
    schemaKey: job.schemaKey,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    fields: result.fields,
    confidence: result.confidence,
    reviewRequired: result.reviewRequired,
    exportedAt: new Date().toISOString(),
  };

  const outputPath = args.output || (jobId + '.json');
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  output({ success: true, job_id: jobId, file: outputPath }, args.format);
}
