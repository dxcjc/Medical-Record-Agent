import { useMemo } from 'react';
import { Card, Grid, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { IconExclamationCircle } from '@arco-design/web-react/icon';

const { Row, Col } = Grid;
const { Text } = Typography;

interface FieldDef {
  label: string;
  value: string | string[] | null;
  confidence?: number;
  source?: string;
}

interface FieldGroupProps {
  title: string;
  icon?: React.ReactNode;
  fields: FieldDef[];
  columns?: 1 | 2;
}

function ConfidenceBadge({ confidence, source }: { confidence?: number; source?: string }) {
  if (confidence == null) return null;

  const isLow = confidence < 0.7;
  const color = confidence >= 0.8 ? 'green' : confidence >= 0.5 ? 'orange' : 'red';

  const badge = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {isLow && (
        <IconExclamationCircle
          style={{ color: '#FF7D00', fontSize: 14 }}
        />
      )}
      <Tag
        size="small"
        color={color}
        style={{ borderRadius: 10, fontSize: 11 }}
      >
        {(confidence * 100).toFixed(0)}%
      </Tag>
    </span>
  );

  if (source) {
    return <Tooltip content={`来源: ${source}`}>{badge}</Tooltip>;
  }
  return badge;
}

function formatFieldValue(val: string | string[] | null): string {
  if (val == null || val === '') return '-';
  if (Array.isArray(val)) return val.length > 0 ? val.join('、') : '-';
  return val;
}

export default function FieldGroup({ title, icon, fields, columns = 2 }: FieldGroupProps) {
  const spanPerField = columns === 1 ? 24 : 12;

  return (
    <Card
      style={{
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
      headerStyle={{ borderBottom: '1px solid var(--color-border)' }}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {icon}
          {title}
        </span>
      }
    >
      <Row gutter={[16, 12]}>
        {fields.map((field) => (
          <Col key={field.label} span={spanPerField}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text
                type="secondary"
                style={{ fontSize: 12, lineHeight: '20px' }}
              >
                {field.label}
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: formatFieldValue(field.value) === '-'
                      ? 'var(--color-text-4)'
                      : 'var(--color-text-1)',
                  }}
                >
                  {formatFieldValue(field.value)}
                </Text>
                <ConfidenceBadge
                  confidence={field.confidence}
                  source={field.source}
                />
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
}
