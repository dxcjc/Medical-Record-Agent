import React from 'react';
import { Button, Space } from '@arco-design/web-react';
import { IconFaceFrownFill } from '@arco-design/web-react/icon';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 全局 React Error Boundary
 * 捕获子组件渲染错误，显示友好错误页
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到子组件错误:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <IconFaceFrownFill style={{ fontSize: 72, color: 'var(--color-text-3)' }} />
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--color-text-1)' }}>
            页面出错了
          </h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-2)', margin: 0 }}>
            请刷新页面或返回首页
          </p>
          <Space>
            <Button type="primary" onClick={this.handleReload}>
              刷新页面
            </Button>
            <Button onClick={this.handleGoHome}>
              返回首页
            </Button>
          </Space>
        </div>
      );
    }

    return this.props.children;
  }
}
