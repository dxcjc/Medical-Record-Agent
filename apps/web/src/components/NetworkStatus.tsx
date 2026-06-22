import { useState, useEffect, useRef, useCallback } from 'react';
import { healthApi } from '../api/client';

const CHECK_INTERVAL = 30_000; // 30 秒
const FAILURE_THRESHOLD = 2; // 连续 2 次失败

/**
 * 全局网络状态检测组件
 * 每 30 秒检测一次后端健康状态，连续 2 次失败显示红色提示条
 */
export default function NetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const failureCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      await healthApi.check();
      // 成功：重置计数，隐藏提示
      failureCountRef.current = 0;
      setIsOffline(false);
    } catch {
      // 失败：累加计数
      failureCountRef.current += 1;
      if (failureCountRef.current >= FAILURE_THRESHOLD) {
        setIsOffline(true);
      }
    }
  }, []);

  useEffect(() => {
    // 立即检测一次
    checkHealth();
    timerRef.current = setInterval(checkHealth, CHECK_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [checkHealth]);

  if (!isOffline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: '#F53F3F',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      ⚠️ 服务器连接中断，请检查网络
    </div>
  );
}
