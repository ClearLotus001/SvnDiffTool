import { getWorkbookDebugLogSnapshot } from '@/utils/workbook/workbookDebug';

type RendererLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface RendererDiagnosticLogEntry {
  timestamp: string;
  level: RendererLogLevel;
  values: unknown[];
}

interface RendererDiagnosticStore {
  installed: boolean;
  logs: RendererDiagnosticLogEntry[];
}

interface RendererDiagnosticReportOptions {
  error: Error;
  componentStack?: string;
}

type RendererDiagnosticGlobal = typeof globalThis & {
  __SVN_DIFF_RENDERER_DIAGNOSTICS__?: RendererDiagnosticStore;
};

const MAX_RENDERER_LOG_ENTRIES = 200;

function getRendererDiagnosticGlobal(): RendererDiagnosticGlobal {
  return globalThis as RendererDiagnosticGlobal;
}

function getRendererDiagnosticStore(): RendererDiagnosticStore {
  const globalRef = getRendererDiagnosticGlobal();
  if (!globalRef.__SVN_DIFF_RENDERER_DIAGNOSTICS__) {
    globalRef.__SVN_DIFF_RENDERER_DIAGNOSTICS__ = {
      installed: false,
      logs: [],
    };
  }
  return globalRef.__SVN_DIFF_RENDERER_DIAGNOSTICS__;
}

function serializeDiagnosticValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return String(value);
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? '',
      cause: serializeDiagnosticValue(value.cause, seen),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (typeof Element !== 'undefined' && value instanceof Element) {
    return `<${value.tagName.toLowerCase()}>`;
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeDiagnosticValue(item, seen));
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, entryValue]) => ({
      key: serializeDiagnosticValue(key, seen),
      value: serializeDiagnosticValue(entryValue, seen),
    }));
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map(item => serializeDiagnosticValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, entryValue]) => [key, serializeDiagnosticValue(entryValue, seen)],
      ),
    );
  }

  return String(value);
}

function pushRendererDiagnosticLog(level: RendererLogLevel, values: unknown[]) {
  const store = getRendererDiagnosticStore();
  store.logs.push({
    timestamp: new Date().toISOString(),
    level,
    values: values.map(value => serializeDiagnosticValue(value)),
  });

  if (store.logs.length > MAX_RENDERER_LOG_ENTRIES) {
    store.logs.splice(0, store.logs.length - MAX_RENDERER_LOG_ENTRIES);
  }
}

function getConsoleMethod(level: RendererLogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'log': return console.log.bind(console);
    case 'info': return console.info.bind(console);
    case 'warn': return console.warn.bind(console);
    case 'error': return console.error.bind(console);
    case 'debug': return console.debug.bind(console);
    default: return console.log.bind(console);
  }
}

export function installRendererDiagnosticsCapture(): void {
  if (typeof window === 'undefined') return;

  const store = getRendererDiagnosticStore();
  if (store.installed) return;

  store.installed = true;

  const levels: RendererLogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach((level) => {
    const original = getConsoleMethod(level);
    console[level] = (...args: unknown[]) => {
      pushRendererDiagnosticLog(level, args);
      original(...args);
    };
  });

  window.addEventListener('error', (event) => {
    pushRendererDiagnosticLog('error', [
      'window.error',
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: serializeDiagnosticValue(event.error),
      },
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushRendererDiagnosticLog('error', [
      'window.unhandledrejection',
      serializeDiagnosticValue(event.reason),
    ]);
  });
}

function getRendererDiagnosticLogSnapshot(): string {
  return JSON.stringify(getRendererDiagnosticStore().logs, null, 2);
}

function buildSection(title: string, content: string): string {
  return `${title}\n${content.trim() ? content : '(empty)'}`;
}

function resolveBridgeAvailability(): string {
  return window.svnDiff ? 'electron-bridge: available' : 'electron-bridge: unavailable';
}

export function buildRendererDiagnosticReport({
  error,
  componentStack,
}: RendererDiagnosticReportOptions): string {
  const stack = error.stack?.trim() || '(no stack)';
  const safeComponentStack = componentStack?.trim() || '(no component stack)';
  const recentLogs = getRendererDiagnosticLogSnapshot();
  const workbookLogs = getWorkbookDebugLogSnapshot();

  return [
    'Versora Renderer Error Report',
    `generatedAt: ${new Date().toISOString()}`,
    `message: ${error.message || 'Unknown renderer error'}`,
    `name: ${error.name || 'Error'}`,
    `url: ${window.location.href}`,
    `userAgent: ${navigator.userAgent}`,
    `language: ${navigator.language}`,
    resolveBridgeAvailability(),
    '',
    buildSection('stack', stack),
    '',
    buildSection('componentStack', safeComponentStack),
    '',
    buildSection('recentRendererLogs', recentLogs),
    '',
    buildSection('workbookDebugLogs', workbookLogs),
  ].join('\n');
}
