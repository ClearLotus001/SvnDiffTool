import React from 'react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown renderer error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[app-error-boundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#f4efe6',
          color: '#2c2418',
          fontFamily: '"DM Sans", "Segoe UI", sans-serif',
        }}>
        <div
          style={{
            maxWidth: 640,
            display: 'grid',
            gap: 10,
            padding: '20px 24px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(143, 118, 85, 0.18)',
            boxShadow: '0 24px 48px -32px rgba(60, 42, 16, 0.28)',
          }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>页面渲染异常</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#6e5a40' }}>
            已拦截一次渲染错误，避免直接白屏。你可以重新加载当前对比，或把这次触发条件继续发给我，我再顺着日志点位往下查。
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: '#8b3f2f',
              fontFamily: '"JetBrains Mono", "Consolas", monospace',
              wordBreak: 'break-word',
            }}>
            {this.state.message}
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
