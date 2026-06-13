import { useCallback, useMemo, type KeyboardEvent } from 'react';
import { Tag, Tooltip, Typography } from '@arco-design/web-react';
import { IconCheck } from '@arco-design/web-react/icon';

const { Text } = Typography;

interface CheckboxMatrixProps {
  title: string;
  options: string[];
  selected: string[];
  confidence?: number;
  source?: string;
  onChange?: (selected: string[]) => void;
}

export default function CheckboxMatrix({
  title,
  options,
  selected,
  confidence,
  source,
  onChange,
}: CheckboxMatrixProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback(
    (opt: string) => {
      if (!onChange) return;
      const next = selectedSet.has(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
      onChange(next);
    },
    [selected, selectedSet, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, opt: string) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle(opt);
      }
    },
    [toggle],
  );

  const confidenceColor = confidence != null
    ? confidence >= 0.8
      ? 'green'
      : confidence >= 0.5
        ? 'orange'
        : 'red'
    : undefined;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--color-text-1)' }}>
        {title}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {options.map((opt) => {
          const isChecked = selectedSet.has(opt);
          return (
            <div
              key={opt}
              role="checkbox"
              aria-checked={isChecked}
              tabIndex={0}
              onClick={() => toggle(opt)}
              onKeyDown={(e) => handleKeyDown(e, opt)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 6,
                cursor: onChange ? 'pointer' : 'default',
                fontSize: 13,
                fontWeight: isChecked ? 600 : 400,
                background: isChecked ? '#3370FF' : '#F7F8FA',
                color: isChecked ? '#fff' : 'var(--color-text-3)',
                border: isChecked ? '1px solid #3370FF' : '1px solid var(--color-border)',
                transition: 'all 0.2s',
                userSelect: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (onChange) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#3370FF';
                }
              }}
              onMouseLeave={(e) => {
                if (!isChecked) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
                }
              }}
            >
              {isChecked && <IconCheck style={{ fontSize: 12 }} />}
              {opt}
            </div>
          );
        })}
      </div>

      {(confidence != null || source) && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          {confidence != null && confidenceColor && (
            <Tag size="small" color={confidenceColor}>
              置信度 {(confidence * 100).toFixed(0)}%
            </Tag>
          )}
          {source && (
            <Tooltip content={`来源: ${source}`}>
              <Text type="secondary" style={{ fontSize: 12, cursor: 'help' }}>
                📍 {source}
              </Text>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
