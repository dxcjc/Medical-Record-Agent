/**
 * mra recognize --file <path> [--schema <key>]
 * 上传病历图片并触发识别
 */
import { uploadFile } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function recognize(args) {
  const filePath = args.file;
  if (!filePath) {
    console.error('用法: mra recognize --file <path> [--schema <key>]');
    console.error('  --file    病历图片路径 (必需)');
    console.error('  --schema  识别 schema (默认: tumor-gene-test)');
    process.exit(1);
  }

  console.error('正在上传并识别...');
  const result = await uploadFile(args, filePath, args.schema);

  const display = {
    job_id: result.id,
    status: result.status,
    schema: result.schemaKey,
    created: result.createdAt,
  };

  output(display, args.format);
  console.error('\n提示: 用 mra status <job_id> 查看进度，mra result <job_id> 获取结果');
}
