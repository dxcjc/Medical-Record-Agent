/**
 * mra feedback <job_id> --field <key> --value <value>
 * 纠正识别字段
 */
import { apiRequest } from '../lib/api.js';
import { output } from '../lib/format.js';

export async function feedback(args) {
  const jobId = args._[1];
  const fieldKey = args.field;
  const value = args.value;

  if (!jobId || !fieldKey || value === undefined) {
    console.error('用法: mra feedback <job_id> --field <key> --value <value>');
    console.error('  --field   要纠正的字段 key (如 patientName)');
    console.error('  --value   正确的值');
    process.exit(1);
  }

  const result = await apiRequest(args, 'POST', '/feedback', {
    jobId,
    fieldKey,
    correctedValue: value,
  });

  output({ success: true, feedback_id: result.id, field: fieldKey, corrected_to: value }, args.format);
}
