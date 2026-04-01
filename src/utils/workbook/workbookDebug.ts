interface WorkbookDebugEntry {
  ts: string;
  scope: string;
  payload: unknown;
}

type WorkbookDebugGlobal = typeof globalThis & {
  __SVN_DIFF_WORKBOOK_DEBUG__?: boolean;
  __SVN_DIFF_WORKBOOK_DEBUG_LOGS__?: WorkbookDebugEntry[];
};

function getWorkbookDebugGlobal(): WorkbookDebugGlobal {
  return globalThis as WorkbookDebugGlobal;
}

export function isWorkbookDebugEnabled(): boolean {
  const globalRef = getWorkbookDebugGlobal();
  if (globalRef.__SVN_DIFF_WORKBOOK_DEBUG__ === true) return true;

  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem('svndiff:workbook-debug') === '1';
  } catch {
    return false;
  }
}

export function setWorkbookDebugEnabled(enabled: boolean) {
  const globalRef = getWorkbookDebugGlobal();
  globalRef.__SVN_DIFF_WORKBOOK_DEBUG__ = enabled;

  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('svndiff:workbook-debug', enabled ? '1' : '0');
  } catch {
    // Ignore storage failures.
  }
}

export function workbookDebugLog(scope: string, payload: unknown) {
  if (!isWorkbookDebugEnabled()) return;

  const globalRef = getWorkbookDebugGlobal();
  const entry: WorkbookDebugEntry = {
    ts: new Date().toISOString(),
    scope,
    payload,
  };

  const current = globalRef.__SVN_DIFF_WORKBOOK_DEBUG_LOGS__ ?? [];
  current.push(entry);
  if (current.length > 200) {
    current.splice(0, current.length - 200);
  }
  globalRef.__SVN_DIFF_WORKBOOK_DEBUG_LOGS__ = current;

  console.log(`[workbook-debug] ${scope}`, payload);
}

export function getWorkbookDebugLogSnapshot(): string {
  const globalRef = getWorkbookDebugGlobal();
  return JSON.stringify(globalRef.__SVN_DIFF_WORKBOOK_DEBUG_LOGS__ ?? [], null, 2);
}

export function clearWorkbookDebugLogs() {
  const globalRef = getWorkbookDebugGlobal();
  globalRef.__SVN_DIFF_WORKBOOK_DEBUG_LOGS__ = [];
}
