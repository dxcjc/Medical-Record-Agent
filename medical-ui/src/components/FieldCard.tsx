import React from 'react';
import { Tag, Tooltip } from '@arco-design/web-react';

interface FieldCardProps {
  fieldKey: string;
  value: unknown;
  confidence?: number;
  evidence?: string;
  label?: string;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'orange';
  return 'red';
}

const FieldCard: React.FC<FieldCardProps> = ({ fieldKey, value, confidence, evidence, label }) => {
  return (
    <div style={{
      background: 'var(--color-bg-white)',
      borderRadius: 'var(--radius-card)',
      border: '1px solid var(--color-border)',
      padding: '12px 16px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-text)' }}>
            {label || fieldKey}
          </span>
          {confidence !== undefined && (
            <Tag color={confidenceColor(confidence)} size="small">
              {(confidence * 100).toFixed(0)}%
            </Tag>
          )}
        </div>
      </div>
      <div style={{
        fontSize: 14,
        color: 'var(--color-text)',
        background: 'var(--color-bg)',
        borderRadius: 4,
        padding: '6px 10px',
        fontFamily: 'monospace',
        wordBreak: 'break-all',
      }}>
        {formatValue(value)}
      </div>
      {evidence && (
        <Tooltip content={evidence}>
          <div style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}>
            📄 {evidence}
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export default FieldCard;
