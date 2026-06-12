import React from 'react';
import { Tag } from '@arco-design/web-react';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  queued: { color: 'gray', label: '排队中' },
  running: { color: 'blue', label: '识别中' },
  completed: { color: 'green', label: '已完成' },
  partial_completed: { color: 'orange', label: '部分完成' },
  needs_review: { color: 'orange', label: '待复核' },
  writeback_pending: { color: 'blue', label: '回写中' },
  writeback_completed: { color: 'green', label: '已回写' },
  writeback_failed: { color: 'red', label: '回写失败' },
  failed: { color: 'red', label: '失败' },
};

interface StatusTagProps {
  status: string;
}

const StatusTag: React.FC<StatusTagProps> = ({ status }) => {
  const config = STATUS_CONFIG[status] || { color: 'gray', label: status };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default StatusTag;
