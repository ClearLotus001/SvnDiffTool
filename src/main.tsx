import '@/styles/app.css';
import '@fontsource-variable/manrope/wght.css';
import '@/components/app/global-bot/global-bot.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import AppErrorBoundary from '@/components/app/AppErrorBoundary';
import { I18nProvider } from '@/context/i18n';
import { installRendererDiagnosticsCapture } from '@/utils/app/rendererDiagnostics';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

installRendererDiagnosticsCapture();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);
