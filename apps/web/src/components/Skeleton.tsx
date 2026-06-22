import { useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Skeleton 加载态组件                                                  */
/* ------------------------------------------------------------------ */

type SkeletonVariant = 'text' | 'circle' | 'rect' | 'rounded';

interface SkeletonProps {
  /** 骨架形状 */
  variant?: SkeletonVariant;
  /** 宽度 (px 或 CSS 值) */
  width?: number | string;
  /** 高度 (px 或 CSS 值) */
  height?: number | string;
  /** 文本行数（仅 variant='text' 时生效） */
  lines?: number;
  /** 是否显示 shimmer 动画 */
  animate?: boolean;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

function toCss(val: number | string | undefined, fallback: string): string {
  if (val === undefined) return fallback;
  return typeof val === 'number' ? `${val}px` : val;
}

export default function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  animate = true,
  style,
  className,
}: SkeletonProps) {
  const baseStyle: React.CSSProperties = useMemo(() => {
    const common: React.CSSProperties = {
      background: animate
        ? 'linear-gradient(90deg, var(--color-border) 25%, var(--color-line) 37%, var(--color-border) 63%)'
        : 'var(--color-border)',
      backgroundSize: animate ? '400% 100%' : undefined,
      animation: animate ? 'skeleton-shimmer 1.4s ease infinite' : undefined,
      ...style,
    };

    switch (variant) {
      case 'circle':
        return {
          ...common,
          width: toCss(width, '40px'),
          height: toCss(height, '40px'),
          borderRadius: '50%',
        };
      case 'rect':
        return {
          ...common,
          width: toCss(width, '100%'),
          height: toCss(height, '120px'),
          borderRadius: 0,
        };
      case 'rounded':
        return {
          ...common,
          width: toCss(width, '100%'),
          height: toCss(height, '120px'),
          borderRadius: 'var(--radius-control)',
        };
      case 'text':
      default:
        return {
          ...common,
          width: toCss(width, '100%'),
          height: toCss(height, '16px'),
          borderRadius: '4px',
        };
    }
  }, [variant, width, height, animate, style]);

  // 多行文本：最后一行宽度 60%
  if (variant === 'text' && lines > 1) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            style={{
              ...baseStyle,
              width: i === lines - 1 ? '60%' : baseStyle.width,
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={className} style={baseStyle} />;
}

/* ------------------------------------------------------------------ */
/*  复合骨架组件                                                        */
/* ------------------------------------------------------------------ */

/** 卡片统计骨架 — Dashboard KPI 区域 */
export function MetricCardSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <Skeleton variant="rounded" width={34} height={34} />
      <div style={{ flex: 1 }}>
        <Skeleton width={60} height={12} style={{ marginBottom: 8 }} />
        <Skeleton width={40} height={24} />
      </div>
    </div>
  );
}

/** 趋势图骨架 — Dashboard 图表区域 */
export function ChartSkeleton() {
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 16px' }}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            width="100%"
            height={40 + Math.random() * 120}
            style={{ flex: 1 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '0 16px' }}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} width="100%" height={12} style={{ flex: 1 }} />
        ))}
      </div>
    </div>
  );
}

/** 表格行骨架 — 通用表格加载态 */
export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0' }}>
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton
          key={i}
          width={i === 0 ? 80 : i === columns - 1 ? 60 : undefined}
          height={16}
          style={{ flex: i === 0 || i === columns - 1 ? 'none' : 1 }}
        />
      ))}
    </div>
  );
}

/** 表格骨架 — 多行 */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
          <TableRowSkeleton columns={columns} />
        </div>
      ))}
    </div>
  );
}

/** 图片骨架 */
export function ImageSkeleton({ width = '100%', height = 200 }: { width?: number | string; height?: number | string }) {
  return (
    <Skeleton
      variant="rounded"
      width={width}
      height={height}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    />
  );
}

/** 快捷操作卡片骨架 */
export function QuickActionCardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
      <Skeleton variant="rounded" width={48} height={48} />
      <Skeleton width={80} height={16} />
      <Skeleton width={120} height={12} />
    </div>
  );
}
