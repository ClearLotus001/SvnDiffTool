import React from 'react';
import { useI18n } from '@/context/i18n';
import type { TranslationFn } from '@/context/i18n';
import { copyText } from '@/utils/app/clipboard';
import { exportTextFile } from '@/utils/app/fileExport';
import { buildRendererDiagnosticReport } from '@/utils/app/rendererDiagnostics';
import { closeCurrentWindow, retryCurrentPage } from '@/utils/app/windowActions';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  t: TranslationFn;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  report: string;
  actionMessage: string;
  actionTone: 'idle' | 'success' | 'error';
}

class AppErrorBoundaryInner extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      report: '',
      actionMessage: '',
      actionTone: 'idle',
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Unknown renderer error',
      report: '',
      actionMessage: '',
      actionTone: 'idle',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[app-error-boundary]', error, errorInfo);
    this.setState({
      report: buildRendererDiagnosticReport(
        errorInfo.componentStack
          ? {
              error,
              componentStack: errorInfo.componentStack,
            }
          : { error },
      ),
      actionMessage: '',
      actionTone: 'idle',
    });
  }

  private getReportContent(): string {
    return this.state.report || this.state.message || 'Unknown renderer error';
  }

  private getReportFileName(): string {
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
    return `versora-renderer-error-${stamp}.log`;
  }

  private handleCopyReport = () => {
    void (async () => {
      const copied = await copyText(this.getReportContent());
      this.setState({
        actionMessage: copied
          ? this.props.t('rendererErrorCopied')
          : this.props.t('rendererErrorCopyFailed'),
        actionTone: copied ? 'success' : 'error',
      });
    })();
  };

  private handleRetry = () => {
    retryCurrentPage();
  };

  private handleClose = () => {
    closeCurrentWindow();
  };

  private handleExportReport = () => {
    void (async () => {
      try {
        const result = await exportTextFile(this.getReportContent(), this.getReportFileName());
        const exportLocation = result.location || this.getReportFileName();
        this.setState({
          actionMessage:
            result.status === 'saved'
              ? this.props.t('rendererErrorExported', {
                  location: exportLocation,
                })
              : result.status === 'downloaded'
                ? this.props.t('rendererErrorDownloadStarted', {
                    location: exportLocation,
                  })
                : this.props.t('rendererErrorExportCancelled'),
          actionTone: result.status === 'cancelled' ? 'idle' : 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.setState({
          actionMessage: this.props.t('rendererErrorExportFailed', { message }),
          actionTone: 'error',
        });
      }
    })();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="w-full h-full grid place-items-center p-6 bg-bg-base text-text-title font-ui">
        <div className="max-w-[640px] grid gap-2.5 p-[20px_24px] rounded-[18px] bg-bg-surface border border-border-default shadow-2xl">
          <div className="text-[18px] font-extrabold">{this.props.t('rendererErrorTitle')}</div>
          <div className="text-[13px] leading-relaxed text-text-secondary">
            {this.props.t('rendererErrorBody')}
          </div>
          <div className="text-[12px] leading-normal text-diff-remove-text font-code break-words">
            {this.state.message}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="h-8 px-3 rounded-[9px] border border-transparent bg-accent text-bg-base font-ui text-[13px] font-semibold cursor-pointer hover:bg-accent-hover active:scale-[0.97] transition-all duration-150"
            >
              {this.props.t('rendererErrorRetryAction')}
            </button>
            <button
              type="button"
              onClick={this.handleClose}
              className="h-8 px-3 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150"
            >
              {this.props.t('rendererErrorCloseAction')}
            </button>
            <button
              type="button"
              onClick={this.handleCopyReport}
              className="h-8 px-3 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150"
            >
              {this.props.t('rendererErrorCopyAction')}
            </button>
            <button
              type="button"
              onClick={this.handleExportReport}
              className="h-8 px-3 rounded-[9px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-semibold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150"
            >
              {this.props.t('rendererErrorExportAction')}
            </button>
          </div>
          {this.state.actionMessage ? (
            <div
              className={`text-[12px] leading-normal break-words ${
                this.state.actionTone === 'error'
                  ? 'text-diff-remove-text'
                  : this.state.actionTone === 'success'
                    ? 'text-diff-add-text'
                    : 'text-text-secondary'
              }`}
            >
              {this.state.actionMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}

export default function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();

  return <AppErrorBoundaryInner t={t}>{children}</AppErrorBoundaryInner>;
}
