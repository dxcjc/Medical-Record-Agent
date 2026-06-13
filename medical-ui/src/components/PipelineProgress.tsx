import { Spin } from '@arco-design/web-react';
import {
  IconCheckCircle,
  IconXCircle,
  IconClock,
} from '../icons/appIcons';

interface ProgressNode {
  key: string;
  label: string;
  status: 'wait' | 'process' | 'finish' | 'error';
  message?: string;
  duration?: number;
  error?: string;
}

interface PipelineProgressProps {
  nodes: ProgressNode[];
  style?: React.CSSProperties;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }: { status: ProgressNode['status'] }) {
  const size = 20;

  switch (status) {
    case 'finish':
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#00B42A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconCheckCircle size={12} style={{ color: '#fff' }} />
        </div>
      );
    case 'error':
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#F53F3F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconXCircle size={12} style={{ color: '#fff' }} />
        </div>
      );
    case 'process':
      return <Spin size={size} />;
    case 'wait':
    default:
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'var(--color-fill-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconClock size={12} style={{ color: 'var(--color-text-3)' }} />
        </div>
      );
  }
}

function statusColor(status: ProgressNode['status']): string {
  switch (status) {
    case 'finish':
      return '#00B42A';
    case 'error':
      return '#F53F3F';
    case 'process':
      return '#3370FF';
    case 'wait':
    default:
      return 'var(--color-fill-3)';
  }
}

export default function PipelineProgress({ nodes, style }: PipelineProgressProps) {
  if (nodes.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        padding: '16px 0',
        overflowX: 'auto',
        ...style,
      }}
    >
      {nodes.map((node, idx) => {
        const isLast = idx === nodes.length - 1;
        const color = statusColor(node.status);

        return (
          <div
            key={node.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: isLast ? 'none' : 1,
              minWidth: isLast ? 'auto' : 100,
              position: 'relative',
            }}
          >
            {/* Top row: icon + line */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                marginBottom: 8,
              }}
            >
              {/* Left line (except first) */}
              {idx > 0 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background:
                      node.status === 'finish' || node.status === 'process'
                        ? color
                        : 'var(--color-fill-3)',
                    transition: 'background 0.3s',
                  }}
                />
              )}

              {/* Icon */}
              <div style={{ flexShrink: 0, margin: '0 4px' }}>
                <StatusIcon status={node.status} />
              </div>

              {/* Right line (except last) */}
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background:
                      node.status === 'finish' ? color : 'var(--color-fill-3)',
                    transition: 'background 0.3s',
                  }}
                />
              )}
            </div>

            {/* Label */}
            <div
              style={{
                fontSize: 13,
                fontWeight: node.status === 'process' ? 600 : 400,
                color:
                  node.status === 'process'
                    ? '#3370FF'
                    : node.status === 'finish'
                      ? '#00B42A'
                      : node.status === 'error'
                        ? '#F53F3F'
                        : 'var(--color-text-3)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                transition: 'color 0.3s',
              }}
            >
              {node.label}
            </div>

            {/* Duration / Message */}
            {node.duration && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  marginTop: 2,
                }}
              >
                {formatDuration(node.duration)}
              </div>
            )}

            {/* Error */}
            {node.error && (
              <div
                style={{
                  fontSize: 11,
                  color: '#F53F3F',
                  marginTop: 2,
                  maxWidth: 120,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={node.error}
              >
                {node.error}
              </div>
            )}

            {/* Processing message */}
            {node.status === 'process' && node.message && (
              <div
                style={{
                  fontSize: 11,
                  color: '#3370FF',
                  marginTop: 2,
                  maxWidth: 120,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={String(node.message)}
              >
                {String(node.message)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
