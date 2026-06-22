import { Tag } from '@arco-design/web-react';

const STATUS_CONFIG: Record<string, { color: string; label: string; tone: string }> = {
  queued: { color: 'gray', label: '排队中', tone: 'neutral' },
  running: { color: 'blue', label: '识别中', tone: 'info' },
  completed: { color: 'green', label: '已完成', tone: 'success' },
  partial_completed: { color: 'orange', label: '部分完成', tone: 'warning' },
  needs_review: { color: 'orange', label: '需复核', tone: 'warning' },
  writeback_pending: { color: 'blue', label: '待回写', tone: 'info' },
  writeback_completed: { color: 'green', label: '已回写', tone: 'success' },
  writeback_failed: { color: 'red', label: '回写失败', tone: 'danger' },
  failed: { color: 'red', label: '失败', tone: 'danger' },
  active: { color: 'green', label: '激活', tone: 'success' },
  inactive: { color: 'gray', label: '未激活', tone: 'neutral' },
  deprecated: { color: 'orange', label: '已废弃', tone: 'warning' },
  draft: { color: 'gray', label: '草稿', tone: 'neutral' },
  ready: { color: 'green', label: '就绪', tone: 'success' },
  archived: { color: 'orange', label: '已归档', tone: 'warning' },
  success: { color: 'green', label: '成功', tone: 'success' },
};

export default function StatusTag({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { color: 'gray', label: status, tone: 'neutral' };
  return (
    <Tag className={`status-pill status-pill-${config.tone}`} color={config.color}>
      {config.label}
    </Tag>
  );
}
