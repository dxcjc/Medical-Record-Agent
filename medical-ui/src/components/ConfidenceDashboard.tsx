import { useMemo } from 'react';
import {
  Card,
  Grid,
  Tag,
  Progress,
  Statistic,
  Typography,
  Divider,
  Empty,
} from '@arco-design/web-react';
import {
  IconCheckCircle,
  IconExclamationCircle,
  IconCloseCircle,
  IconInfoCircle,
} from '@arco-design/web-react/icon';

const { Row, Col } = Grid;
const { Text, Title } = Typography;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConfidenceField {
  key: string;
  label: string;
  value: string | null;
  confidence?: number;
}

interface ConfidenceDashboardProps {
  fields: ConfidenceField[];
  overallConfidence: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getConfidenceLevel(confidence: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (confidence >= 0.8) return { label: '高', color: '#00B42A', bg: 'var(--color-success-soft)' };
  if (confidence >= 0.5) return { label: '中', color: '#FF7D00', bg: 'var(--color-warning-soft)' };
  return { label: '低', color: '#F53F3F', bg: 'var(--color-danger-soft)' };
}

function getProgressColor(percent: number): string {
  if (percent >= 80) return '#00B42A';
  if (percent >= 50) return '#FF7D00';
  return '#F53F3F';
}

function getConfidenceTagColor(c: number): string {
  if (c >= 0.8) return 'green';
  if (c >= 0.5) return 'orange';
  return 'red';
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function DistributionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Text style={{ width: 48, fontSize: 13, textAlign: 'right', flexShrink: 0 }}>
        {label}
      </Text>
      <div
        style={{
          flex: 1,
          height: 24,
          background: 'var(--color-info-soft)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: 'width 0.3s ease',
            minWidth: count > 0 ? 4 : 0,
          }}
        />
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              left: Math.max(pct, 8),
              top: '50%',
              transform: 'translate(8px, -50%)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
            }}
          >
            {count} 个字段
          </span>
        )}
      </div>
      <Text type="secondary" style={{ width: 36, fontSize: 12, textAlign: 'right', flexShrink: 0 }}>
        {pct.toFixed(0)}%
      </Text>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ConfidenceDashboard({
  fields,
  overallConfidence,
}: ConfidenceDashboardProps) {
  const stats = useMemo(() => {
    const total = fields.length;
    const filled = fields.filter(
      (f) => f.value != null && f.value !== '' && f.value !== '-',
    ).length;
    const empty = total - filled;
    const needReview = fields.filter((f) => f.confidence != null && f.confidence < 0.7).length;
    return { total, filled, empty, needReview };
  }, [fields]);

  const distribution = useMemo(() => {
    const high = fields.filter((f) => f.confidence != null && f.confidence >= 0.8).length;
    const medium = fields.filter((f) => f.confidence != null && f.confidence >= 0.5 && f.confidence < 0.8).length;
    const low = fields.filter((f) => f.confidence != null && f.confidence < 0.5).length;
    return { high, medium, low };
  }, [fields]);

  const lowConfidenceFields = useMemo(
    () =>
      fields
        .filter((f) => f.confidence != null && f.confidence < 0.7)
        .sort((a, b) => (a.confidence || 0) - (b.confidence || 0)),
    [fields],
  );

  const overallPercent = Math.round(overallConfidence * 100);
  const level = getConfidenceLevel(overallConfidence);

  return (
    <Card
      style={{
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <IconInfoCircle style={{ color: '#3370FF', fontSize: 16 }} />
          识别质量概览
        </span>
      }
    >
      <Row gutter={[24, 24]}>
        {/* ---- Overall Confidence Circle ---- */}
        <Col xs={24} md={8}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              padding: '16px 0',
            }}
          >
            <Progress
              type="circle"
              percent={overallPercent}
              color={getProgressColor(overallPercent)}
              width={160}
              strokeWidth={10}
              formatText={() => (
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: level.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {overallPercent}%
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: 'var(--color-muted)',
                      marginTop: 4,
                    }}
                  >
                    置信度等级：{level.label}
                  </div>
                </div>
              )}
            />
            <Tag
              color={getConfidenceTagColor(overallConfidence)}
              style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px' }}
            >
              {level.label === '高' ? '✓ 质量良好' : level.label === '中' ? '⚠ 需注意' : '✕ 需复核'}
            </Tag>
          </div>
        </Col>

        {/* ---- Distribution + Stats ---- */}
        <Col xs={24} md={16}>
          {/* Distribution bar chart */}
          <div style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-title)',
                display: 'block',
                marginBottom: 12,
              }}
            >
              置信度分布
            </Text>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '12px 16px',
                background: 'var(--color-info-soft)',
                borderRadius: 'var(--radius-control)',
              }}
            >
              <DistributionBar
                label="高 ≥80"
                count={distribution.high}
                total={fields.length}
                color="#00B42A"
              />
              <DistributionBar
                label="中 50-80"
                count={distribution.medium}
                total={fields.length}
                color="#FF7D00"
              />
              <DistributionBar
                label="低 <50"
                count={distribution.low}
                total={fields.length}
                color="#F53F3F"
              />
            </div>
          </div>

          {/* Stats */}
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="总字段数"
                value={stats.total}
                groupSeparator
                styleValue={{ color: 'var(--color-title)', fontSize: 24, fontWeight: 700 }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="已填写"
                value={stats.filled}
                groupSeparator
                styleValue={{ color: '#00B42A', fontSize: 24, fontWeight: 700 }}
                prefix={<IconCheckCircle style={{ color: '#00B42A', fontSize: 16 }} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="空字段"
                value={stats.empty}
                groupSeparator
                styleValue={{ color: 'var(--color-muted)', fontSize: 24, fontWeight: 700 }}
                prefix={<IconCloseCircle style={{ color: 'var(--color-muted)', fontSize: 16 }} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="需复核"
                value={stats.needReview}
                groupSeparator
                styleValue={{
                  color: stats.needReview > 0 ? '#F53F3F' : 'var(--color-muted)',
                  fontSize: 24,
                  fontWeight: 700,
                }}
                prefix={
                  <IconExclamationCircle
                    style={{
                      color: stats.needReview > 0 ? '#F53F3F' : 'var(--color-muted)',
                      fontSize: 16,
                    }}
                  />
                }
              />
            </Col>
          </Row>
        </Col>
      </Row>

      {/* ---- Low Confidence Fields List ---- */}
      {lowConfidenceFields.length > 0 && (
        <>
          <Divider style={{ margin: '20px 0 16px' }} />
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <IconExclamationCircle style={{ color: '#FF7D00', fontSize: 16 }} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-title)',
                }}
              >
                低置信度字段（{'<'}70%）
              </Text>
              <Tag
                size="small"
                color="orange"
                style={{ borderRadius: 10, fontSize: 11 }}
              >
                {lowConfidenceFields.length}
              </Tag>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {lowConfidenceFields.map((field) => {
                const conf = field.confidence || 0;
                const percent = Math.round(conf * 100);
                const tagColor = getConfidenceTagColor(conf);
                return (
                  <div
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 16px',
                      background: 'var(--color-info-soft)',
                      borderRadius: 'var(--radius-control)',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Field name */}
                    <Text
                      style={{
                        fontWeight: 500,
                        fontSize: 13,
                        minWidth: 80,
                        color: 'var(--color-title)',
                      }}
                    >
                      {field.label}
                    </Text>

                    {/* Current value */}
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color:
                          field.value && field.value !== '-'
                            ? 'var(--color-text)'
                            : 'var(--color-disabled)',
                        minWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {field.value && field.value !== '-' ? field.value : '（空）'}
                    </Text>

                    {/* Confidence tag */}
                    <Tag
                      size="small"
                      color={tagColor}
                      style={{ fontWeight: 600, fontSize: 12, borderRadius: 10 }}
                    >
                      {percent}%
                    </Tag>

                    {/* Action suggestion */}
                    <Tag
                      size="small"
                      color="orange"
                      style={{
                        borderRadius: 10,
                        fontSize: 11,
                        background: 'var(--color-warning-soft)',
                      }}
                    >
                      建议人工复核
                    </Tag>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Empty state when all fields have good confidence */}
      {lowConfidenceFields.length === 0 && fields.length > 0 && (
        <>
          <Divider style={{ margin: '20px 0 16px' }} />
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <IconCheckCircle style={{ color: '#00B42A', fontSize: 24 }} />
            <Text
              style={{
                display: 'block',
                marginTop: 8,
                color: 'var(--color-muted)',
                fontSize: 13,
              }}
            >
              所有字段置信度均 ≥ 70%，无需特别关注
            </Text>
          </div>
        </>
      )}

      {/* No fields */}
      {fields.length === 0 && (
        <>
          <Divider style={{ margin: '20px 0 16px' }} />
          <Empty description="暂无字段数据" />
        </>
      )}
    </Card>
  );
}
