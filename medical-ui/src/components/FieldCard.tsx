import React from 'react';
import { Card, Tag, Tooltip, Typography } from '@arco-design/web-react';

const { Text } = Typography;

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
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      title={
        <span>
          {label || fieldKey}
          {confidence !== undefined && (
            <Tag color={confidenceColor(confidence)} style={{ marginLeft: 8 }}>
              {(confidence * 100).toFixed(0)}%
            </Tag>
          )}
        </span>
      }
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 13,
          background: 'var(--color-fill-1)',
          borderRadius: 4,
          padding: '6px 10px',
          wordBreak: 'break-all',
        }}
      >
        {formatValue(value)}
      </div>
      {evidence && (
        <Tooltip content={evidence}>
          <Text
            type="secondary"
            ellipsis
            style={{ display: 'block', marginTop: 6, fontSize: 12, cursor: 'pointer' }}
          >
            {evidence}
          </Text>
        </Tooltip>
      )}
    </Card>
  );
};

export default FieldCard;
