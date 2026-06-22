import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  content: string;
}

type Subscriber = (items: ToastItem[]) => void;

/* ------------------------------------------------------------------ */
/*  全局 store（不依赖 React context，任何模块都能调用）                  */
/* ------------------------------------------------------------------ */

let nextId = 0;
let globalItems: ToastItem[] = [];
const subscribers = new Set<Subscriber>();

function notify() {
  for (const fn of subscribers) fn([...globalItems]);
}

function addToast(type: ToastType, content: string, duration: number) {
  const id = nextId++;
  globalItems = [...globalItems, { id, type, content }];
  notify();
  setTimeout(() => {
    globalItems = globalItems.filter((t) => t.id !== id);
    notify();
  }, duration);
}

/** 命令式 API —— 任何模块可直接 import 调用 */
export const toast = {
  success: (content: string) => addToast('success', content, 3000),
  error: (content: string) => addToast('error', content, 5000),
  warning: (content: string) => addToast('warning', content, 4000),
  info: (content: string) => addToast('info', content, 3000),
};

/* ------------------------------------------------------------------ */
/*  样式常量                                                           */
/* ------------------------------------------------------------------ */

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'var(--color-success-light-1, #e8ffea)',
    border: 'var(--color-success-light-3, #00b42a)',
    icon: '✓',
  },
  error: {
    bg: 'var(--color-danger-light-1, #ffece8)',
    border: 'var(--color-danger-light-3, #f53f3f)',
    icon: '✕',
  },
  warning: {
    bg: 'var(--color-warning-light-1, #fff7e8)',
    border: 'var(--color-warning-light-3, #ff7d00)',
    icon: '⚠',
  },
  info: {
    bg: 'var(--color-info-light-1, #e8f3ff)',
    border: 'var(--color-info-light-3, #165dff)',
    icon: 'ℹ',
  },
};

const CONTAINER_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  pointerEvents: 'none',
};

/* ------------------------------------------------------------------ */
/*  React 组件                                                         */
/* ------------------------------------------------------------------ */

/** 在 App 顶层挂载，订阅全局 store 并渲染 toast */
export default function GlobalToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    subscribers.add(setItems);
    return () => {
      subscribers.delete(setItems);
    };
  }, []);

  // 保证 portal 容器存在
  useEffect(() => {
    let el = document.getElementById('global-toast-root') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-toast-root';
      document.body.appendChild(el);
    }
    containerRef.current = el;
  }, []);

  if (!containerRef.current || items.length === 0) return null;

  return createPortal(
    <div style={CONTAINER_STYLE}>
      {items.map((item) => (
        <ToastMessage key={item.id} item={item} />
      ))}
    </div>,
    containerRef.current,
  );
}

/* ------------------------------------------------------------------ */
/*  单条 Toast                                                         */
/* ------------------------------------------------------------------ */

function ToastMessage({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(false);
  const style = TYPE_STYLES[item.type];

  useEffect(() => {
    // 入场动画
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      role="alert"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 8,
        background: style.bg,
        border: `1px solid ${style.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        fontSize: 14,
        color: 'var(--color-text-1, #1d2129)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        maxWidth: 420,
        wordBreak: 'break-word',
      }}
    >
      <span style={{ flexShrink: 0, fontWeight: 600 }}>{style.icon}</span>
      <span>{item.content}</span>
    </div>
  );
}
