// ─────────────────────────────────────────────────────────────────────────────
// src/App.tsx  —  SvnExcelDiffTool root
//
// This file is now a thin orchestrator:
//   - Loads diff data (Electron IPC or demo)
//   - Manages all top-level state
//   - Handles keyboard shortcuts
//   - Renders the layout, delegating visuals to components/
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';

import type {
  DiffLine,
  DiffData,
  DiffPerformanceMetrics,
  ThemeKey,
  LayoutMode,
  SvnRevisionInfo,
  WorkbookFreezeState,
  WorkbookMetadataSource,
  WorkbookMoveDirection,
  WorkbookSelectedCell,
} from './types';
import { THEMES } from './theme';
import { useI18n } from './context/i18n';
import { ThemeContext } from './context/theme';
import { computeHunks } from './engine/diff';
import { clearTokenCache } from './engine/tokenizer';
import { buildSearchPattern, findMatches, navigateSearch } from './engine/search';
import { FONT_UI } from './constants/typography';
import { computeDiffAsync } from './utils/computeDiffAsync';
import { resolveDisplayFileName, resolveVersionLabel } from './utils/diffMeta';
import { resolveDiffTexts } from './utils/diffSource';
import type { WorkbookMetadataMap } from './utils/workbookMeta';
import { resolveWorkbookMetadataAsync } from './utils/resolveWorkbookMetadataAsync';
import { getWorkbookSections } from './utils/workbookSections';
import { getStoredAppSettings, saveStoredAppSettings } from './utils/settings';
import Toolbar        from './components/Toolbar';
import DevLoadBar     from './components/DevLoadBar';
import PerfBar       from './components/PerfBar';
import SearchBar      from './components/SearchBar';
import SplitHeader    from './components/SplitHeader';
import WorkbookFormulaBar from './components/WorkbookFormulaBar';
import WorkbookComparePanel from './components/WorkbookComparePanel';
import WorkbookHorizontalPanel from './components/WorkbookHorizontalPanel';
import UnifiedPanel   from './components/UnifiedPanel';
import SplitPanel     from './components/SplitPanel';
import StatsBar       from './components/StatsBar';
import GotoLine       from './components/GotoLine';
import ShortcutsPanel from './components/ShortcutsPanel';

type WorkbookFreezeStateMap = Record<string, WorkbookFreezeState>;
type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';
const DIFF_RESULT_CACHE_LIMIT = 8;

interface CachedDiffResult {
  diffLines: DiffLine[];
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function hasBytePayload(value: unknown): value is Uint8Array {
  return Boolean(value && ArrayBuffer.isView(value) && value.byteLength > 0);
}

function buildDiffCacheKey(data: DiffData): string {
  return [
    data.fileName,
    data.baseRevisionInfo?.id ?? data.baseName,
    data.mineRevisionInfo?.id ?? data.mineName,
    hasBytePayload(data.baseBytes) ? data.baseBytes.byteLength : data.baseContent?.length ?? 0,
    hasBytePayload(data.mineBytes) ? data.mineBytes.byteLength : data.mineContent?.length ?? 0,
  ].join('::');
}

const MAX_WORKBOOK_METADATA_SINGLE_BYTES = 12 * 1024 * 1024;
const MAX_WORKBOOK_METADATA_TOTAL_BYTES = 20 * 1024 * 1024;

function shouldResolveWorkbookMetadata(source: WorkbookMetadataSource) {
  const baseBytes = hasBytePayload(source.baseBytes) ? source.baseBytes.byteLength : 0;
  const mineBytes = hasBytePayload(source.mineBytes) ? source.mineBytes.byteLength : 0;
  if (baseBytes === 0 && mineBytes === 0) return false;
  if (baseBytes > MAX_WORKBOOK_METADATA_SINGLE_BYTES || mineBytes > MAX_WORKBOOK_METADATA_SINGLE_BYTES) {
    return false;
  }
  return (baseBytes + mineBytes) <= MAX_WORKBOOK_METADATA_TOTAL_BYTES;
}

// ── Demo data (used for in-app development fallback) ──────────────────────────

const DEMO_BASE = `import axios from 'axios';

const BASE_URL = 'https://api.example.com';
const TIMEOUT = 5000;

async function fetchUser(id) {
  const response = await axios.get(\`\${BASE_URL}/users/\${id}\`);
  return response.data;
}

async function updateUser(id, payload) {
  const response = await axios.put(\`\${BASE_URL}/users/\${id}\`, payload);
  return response.data;
}

async function deleteUser(id) {
  await axios.delete(\`\${BASE_URL}/users/\${id}\`);
  return true;
}

async function listUsers(page = 1, limit = 20) {
  const response = await axios.get(\`\${BASE_URL}/users\`, { params: { page, limit } });
  return response.data;
}

export { fetchUser, updateUser, deleteUser, listUsers };
`;

const DEMO_MINE = `import axios from 'axios';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';

const BASE_URL = 'https://api.example.com';
const TIMEOUT = 8000;

async function fetchUser(id, options = {}) {
  const cacheKey = \`user_\${id}\`;
  if (!options.force && cache.has(cacheKey)) {
    logger.debug('Cache hit', { key: cacheKey });
    return cache.get(cacheKey);
  }
  const response = await axios.get(\`\${BASE_URL}/users/\${id}\`, { timeout: TIMEOUT });
  const data = response.data;
  cache.set(cacheKey, data, options.ttl || 300);
  return data;
}

async function updateUser(id, payload) {
  const response = await axios.put(\`\${BASE_URL}/users/\${id}\`, payload, { timeout: TIMEOUT });
  cache.delete(\`user_\${id}\`);
  return response.data;
}

async function deleteUser(id, soft = false) {
  if (soft) {
    await axios.patch(\`\${BASE_URL}/users/\${id}\`, { deleted: true });
  } else {
    await axios.delete(\`\${BASE_URL}/users/\${id}\`);
  }
  cache.delete(\`user_\${id}\`);
  return { success: true, soft };
}

async function listUsers(page = 1, limit = 20, filters = {}) {
  const response = await axios.get(\`\${BASE_URL}/users\`, {
    params: { page, limit, ...filters },
    timeout: TIMEOUT,
  });
  return response.data;
}

async function searchUsers(query) {
  const response = await axios.get(\`\${BASE_URL}/users/search\`, { params: { q: query } });
  return response.data;
}

export { fetchUser, updateUser, deleteUser, listUsers, searchUsers };
`;

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════

export default function App() {
  const { t } = useI18n();
  const initialSettingsRef = useRef(getStoredAppSettings());
  const initialSettings = initialSettingsRef.current;

  // ── State ──────────────────────────────────────────────────────────────────
  const [themeKey, setThemeKey]             = useState<ThemeKey>(initialSettings.themeKey);
  const [layout, setLayout]                 = useState<LayoutMode>(initialSettings.layout);
  const [diffLines, setDiffLines]           = useState<DiffLine[]>([]);
  const [baseName, setBaseName]             = useState('');
  const [mineName, setMineName]             = useState('');
  const [fileName, setFileName]             = useState('');
  const [collapseCtx, setCollapseCtx]       = useState(initialSettings.collapseCtx);
  const [showSearch, setShowSearch]         = useState(false);
  const [showGoto, setShowGoto]             = useState(false);
  const [showHelp, setShowHelp]             = useState(false);
  const [showWhitespace, setShowWhitespace] = useState(initialSettings.showWhitespace);
  const [showHiddenColumns, setShowHiddenColumns] = useState(initialSettings.showHiddenColumns);
  const [fontSize, setFontSize]             = useState(initialSettings.fontSize);
  const [hunkIdx, setHunkIdx]               = useState(0);
  const [searchQ, setSearchQ]               = useState('');
  const [searchRx, setSearchRx]             = useState(false);
  const [searchCs, setSearchCs]             = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(-1);
  const [isElectron, setIsElectron]         = useState(false);
  const [isDevMode, setIsDevMode]           = useState(false);
  const [isLoadingDiff, setIsLoadingDiff]   = useState(false);
  const [hasLoadedDiff, setHasLoadedDiff]   = useState(false);
  const [loadPhase, setLoadPhase]           = useState<LoadPhase>('idle');
  const [loadError, setLoadError]           = useState('');
  const [loadPerfMetrics, setLoadPerfMetrics] = useState<DiffPerformanceMetrics | null>(null);
  const [selectedCell, setSelectedCell]     = useState<WorkbookSelectedCell | null>(null);
  const [baseWorkbookMetadata, setBaseWorkbookMetadata] = useState<WorkbookMetadataMap | null>(null);
  const [mineWorkbookMetadata, setMineWorkbookMetadata] = useState<WorkbookMetadataMap | null>(null);
  const [revisionOptions, setRevisionOptions] = useState<SvnRevisionInfo[]>([]);
  const [baseRevisionInfo, setBaseRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [mineRevisionInfo, setMineRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [canSwitchRevisions, setCanSwitchRevisions] = useState(false);
  const [isSwitchingRevisions, setIsSwitchingRevisions] = useState(false);
  const [workbookFreezeBySheet, setWorkbookFreezeBySheet] = useState<WorkbookFreezeStateMap>({});
  const loadSeqRef = useRef(0);
  const hasLoadedDiffRef = useRef(false);
  const diffResultCacheRef = useRef<Map<string, CachedDiffResult>>(new Map());

  const T = THEMES[themeKey];
  const displayBaseName = baseName || t('commonBase');
  const displayMineName = mineName || t('commonMine');
  const displayFileName = useMemo(
    () => resolveDisplayFileName(fileName, baseName, mineName),
    [fileName, baseName, mineName],
  );
  const baseVersionLabel = useMemo(
    () => resolveVersionLabel(displayBaseName, baseRevisionInfo, t('commonBase')),
    [baseRevisionInfo, displayBaseName, t],
  );
  const mineVersionLabel = useMemo(
    () => resolveVersionLabel(displayMineName, mineRevisionInfo, t('commonMine')),
    [mineRevisionInfo, displayMineName, t],
  );
  const activeFreezeState = useMemo(
    () => (selectedCell ? (workbookFreezeBySheet[selectedCell.sheetName] ?? null) : null),
    [selectedCell, workbookFreezeBySheet],
  );

  // scrollToIndex exposed by the active panel — used by Goto and hunk nav
  const scrollToIndexRef = useRef<((idx: number, align?: 'start' | 'center') => void) | null>(null);
  const workbookMoveRef = useRef<((direction: WorkbookMoveDirection) => void) | null>(null);
  // Ref-based showSearch avoids stale keyboard handler closure
  const showSearchRef = useRef(false);
  useEffect(() => { showSearchRef.current = showSearch; }, [showSearch]);

  // ── Load diff data ─────────────────────────────────────────────────────────

  const buildDemoDiffData = useCallback((): DiffData => ({
    baseName: 'userService.js (r142)',
    mineName: 'userService.js (r143)',
    svnUrl: '',
    fileName: 'userService.js',
    baseContent: DEMO_BASE,
    mineContent: DEMO_MINE,
    baseBytes: null,
    mineBytes: null,
  }), []);

  const applyDiffData = useCallback(async (data: DiffData) => {
    const seq = ++loadSeqRef.current;
    const applyStart = getNow();
    const cacheKey = buildDiffCacheKey(data);
    setLoadError('');
    setIsLoadingDiff(true);
    setLoadPhase('loading');

    await waitForNextPaint();

    try {
      const textStart = getNow();
      const { baseText, mineText } = resolveDiffTexts(data);
      const textResolveMs = getNow() - textStart;
      const cachedResult = diffResultCacheRef.current.get(cacheKey);
      const metadataInput: WorkbookMetadataSource = {
        baseName: data.baseName,
        mineName: data.mineName,
        fileName: data.fileName,
        baseBytes: data.baseBytes,
        mineBytes: data.mineBytes,
      };
      const hasMetadataFromPayload = data.baseWorkbookMetadata !== undefined || data.mineWorkbookMetadata !== undefined;
      const shouldLoadMetadata = shouldResolveWorkbookMetadata(metadataInput);
      if (!shouldLoadMetadata && (hasBytePayload(metadataInput.baseBytes) || hasBytePayload(metadataInput.mineBytes))) {
        console.warn('[workbook-metadata] skipped for large workbook payload');
      }
      if (cachedResult) {
        diffResultCacheRef.current.delete(cacheKey);
        diffResultCacheRef.current.set(cacheKey, cachedResult);

        setBaseName(data.baseName || data.fileName || '');
        setMineName(data.mineName || data.fileName || '');
        setFileName(data.fileName || '');
        setSelectedCell(null);
        setWorkbookFreezeBySheet({});
        setBaseWorkbookMetadata(cachedResult.baseWorkbookMetadata ?? data.baseWorkbookMetadata ?? null);
        setMineWorkbookMetadata(cachedResult.mineWorkbookMetadata ?? data.mineWorkbookMetadata ?? null);
        setRevisionOptions(data.revisionOptions ?? []);
        setBaseRevisionInfo(data.baseRevisionInfo ?? null);
        setMineRevisionInfo(data.mineRevisionInfo ?? null);
        setCanSwitchRevisions(Boolean(data.canSwitchRevisions));
        setDiffLines(cachedResult.diffLines);
        setHunkIdx(0);
        setHasLoadedDiff(true);
        setLoadPhase('ready');
        setLoadPerfMetrics({
          source: data.perf?.source ?? 'local-dev',
          ...data.perf,
          textResolveMs,
          metadataMs: 0,
          diffMs: 0,
          totalAppMs: getNow() - applyStart,
          diffLineCount: cachedResult.diffLines.length,
        });
        return;
      }

      const metadataTask = !hasMetadataFromPayload && shouldLoadMetadata
        ? (async () => {
            const metadataStart = getNow();
            try {
              const result = await resolveWorkbookMetadataAsync(metadataInput);
              return {
                ok: true as const,
                result,
                duration: getNow() - metadataStart,
              };
            } catch (error) {
              return {
                ok: false as const,
                error,
                duration: getNow() - metadataStart,
              };
            }
          })()
        : null;
      let nextDiffLines: DiffLine[];
      let diffDuration: number;
      if (data.precomputedDiffLines) {
        nextDiffLines = data.precomputedDiffLines;
        diffDuration = data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0;
      } else {
        const diffStart = getNow();
        nextDiffLines = await computeDiffAsync(baseText, mineText);
        diffDuration = getNow() - diffStart;
      }
      if (seq !== loadSeqRef.current) return;
      const totalAppMs = getNow() - applyStart;

      setBaseName(data.baseName || data.fileName || '');
      setMineName(data.mineName || data.fileName || '');
      setFileName(data.fileName || '');
      setSelectedCell(null);
      setWorkbookFreezeBySheet({});
      setBaseWorkbookMetadata(data.baseWorkbookMetadata ?? null);
      setMineWorkbookMetadata(data.mineWorkbookMetadata ?? null);
      setRevisionOptions(data.revisionOptions ?? []);
      setBaseRevisionInfo(data.baseRevisionInfo ?? null);
      setMineRevisionInfo(data.mineRevisionInfo ?? null);
      setCanSwitchRevisions(Boolean(data.canSwitchRevisions));
      setDiffLines(nextDiffLines);
      setHunkIdx(0);
      setHasLoadedDiff(true);
      setLoadPhase('ready');
      setLoadPerfMetrics({
        source: data.perf?.source ?? 'local-dev',
        ...data.perf,
        textResolveMs,
        diffMs: data.precomputedDiffLines ? (data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0) : diffDuration,
        totalAppMs,
        diffLineCount: nextDiffLines.length,
      });
      diffResultCacheRef.current.set(cacheKey, {
        diffLines: nextDiffLines,
        baseWorkbookMetadata: data.baseWorkbookMetadata ?? null,
        mineWorkbookMetadata: data.mineWorkbookMetadata ?? null,
      });
      if (diffResultCacheRef.current.size > DIFF_RESULT_CACHE_LIMIT) {
        const oldestKey = diffResultCacheRef.current.keys().next().value;
        if (oldestKey) diffResultCacheRef.current.delete(oldestKey);
      }

      if (metadataTask) {
        void metadataTask.then((metadataResult) => {
          if (seq !== loadSeqRef.current) return;

          if (!metadataResult.ok) {
            const message = metadataResult.error instanceof Error
              ? metadataResult.error.message
              : String(metadataResult.error);
            console.warn('[workbook-metadata]', message);
            setLoadPerfMetrics((prev) => (prev ? {
              ...prev,
              metadataMs: metadataResult.duration,
            } : prev));
            return;
          }

          setBaseWorkbookMetadata(metadataResult.result.base);
          setMineWorkbookMetadata(metadataResult.result.mine);
          const cachedEntry = diffResultCacheRef.current.get(cacheKey);
          if (cachedEntry) {
            diffResultCacheRef.current.set(cacheKey, {
              ...cachedEntry,
              baseWorkbookMetadata: metadataResult.result.base,
              mineWorkbookMetadata: metadataResult.result.mine,
            });
          }
          setLoadPerfMetrics((prev) => (prev ? {
            ...prev,
            metadataMs: metadataResult.duration,
            totalAppMs: Math.max(prev.totalAppMs ?? 0, getNow() - applyStart),
          } : prev));
        });
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      if (!hasLoadedDiffRef.current) {
        setDiffLines([]);
        setBaseWorkbookMetadata(null);
        setMineWorkbookMetadata(null);
        setRevisionOptions([]);
        setBaseRevisionInfo(null);
        setMineRevisionInfo(null);
        setCanSwitchRevisions(false);
        setHasLoadedDiff(false);
        setLoadPhase('error');
        setLoadPerfMetrics(null);
      } else {
        setLoadPhase('ready');
      }
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoadingDiff(false);
      }
    }
  }, []);

  const loadStandaloneDemo = useCallback(async () => {
    await applyDiffData({
      ...buildDemoDiffData(),
      perf: { source: 'demo' },
    });
  }, [applyDiffData, buildDemoDiffData]);

  const loadElectronWorkingCopyDiff = useCallback(async (filePath: string) => {
    if (!window.svnDiff?.loadDevWorkingCopyDiff) return;
    const nextData = await window.svnDiff.loadDevWorkingCopyDiff(filePath);
    await applyDiffData(nextData);
  }, [applyDiffData]);

  useEffect(() => {
    clearTokenCache();
    let cancelled = false;

    const loadData = async () => {
      if (!window.svnDiff) {
        if (!cancelled) {
          setIsElectron(false);
          setHasLoadedDiff(false);
          setLoadPhase('error');
          setLoadError('Electron bridge is unavailable.');
          setLoadPerfMetrics(null);
        }
        return undefined;
      }

      setIsElectron(true);
      try {
        const devMode = await window.svnDiff.isDevMode?.();
        if (!cancelled) setIsDevMode(Boolean(devMode));
      } catch {
        if (!cancelled) setIsDevMode(false);
      }

      try {
        const data = await window.svnDiff.getDiffData();
        const hasDiffPayload = Boolean(
          data
          && (
            typeof data.baseContent === 'string'
            || typeof data.mineContent === 'string'
            || hasBytePayload(data.baseBytes)
            || hasBytePayload(data.mineBytes)
          )
        );
        if (hasDiffPayload) {
          if (!cancelled) {
            await applyDiffData(data);
          }
        } else if (!cancelled) {
          setHasLoadedDiff(false);
          setLoadPhase('idle');
          setLoadError('');
          setLoadPerfMetrics(null);
        }
      } catch (error) {
        if (!cancelled) {
          setHasLoadedDiff(false);
          setLoadPhase('error');
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }

      return undefined;
    };

    let cleanup: (() => void) | undefined;
    loadData().then(fn => { cleanup = fn; });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [applyDiffData]);

  // Clear token cache when theme changes
  useEffect(() => { clearTokenCache(); }, [themeKey]);

  useEffect(() => {
    hasLoadedDiffRef.current = hasLoadedDiff;
  }, [hasLoadedDiff]);

  useEffect(() => {
    saveStoredAppSettings({
      themeKey,
      layout,
      collapseCtx,
      showWhitespace,
      showHiddenColumns,
      fontSize,
    });
  }, [themeKey, layout, collapseCtx, showWhitespace, showHiddenColumns, fontSize]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const hunks         = useMemo(() => computeHunks(diffLines), [diffLines]);
  const hunkPositions = useMemo(() => hunks.map(h => h.startIdx), [hunks]);
  const totalHunks    = hunks.length;

  const searchPattern = useMemo(
    () => buildSearchPattern(searchQ, { isRegex: searchRx, isCaseSensitive: searchCs }),
    [searchQ, searchRx, searchCs],
  );
  const searchMatches = useMemo(
    () => findMatches(diffLines, searchPattern),
    [diffLines, searchPattern],
  );
  const isWorkbookMode = useMemo(() => getWorkbookSections(diffLines).length > 0, [diffLines]);

  const totalLines = useMemo(() => {
    let max = 0;
    diffLines.forEach(l => {
      const lineMax = Math.max(l.baseLineNo ?? 0, l.mineLineNo ?? 0);
      if (lineMax > max) max = lineMax;
    });
    return max;
  }, [diffLines]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSearch = useCallback((q: string, rx: boolean, cs: boolean) => {
    setSearchQ(q); setSearchRx(rx); setSearchCs(cs);
    setActiveSearchIdx(q ? 0 : -1);
  }, []);

  const handleSearchNav = useCallback((dir: 1 | -1) => {
    setActiveSearchIdx(i => navigateSearch(i, searchMatches.length, dir));
  }, [searchMatches.length]);

  const handleGoto = useCallback((lineNo: number) => {
    if (!scrollToIndexRef.current) return;
    const exactIdx = diffLines.findIndex(l => l.mineLineNo === lineNo || l.baseLineNo === lineNo);
    if (exactIdx >= 0) {
      scrollToIndexRef.current(exactIdx, 'center');
      return;
    }

    const nearestIdx = diffLines.findIndex(l => Math.max(l.baseLineNo ?? 0, l.mineLineNo ?? 0) >= lineNo);
    if (nearestIdx >= 0) {
      scrollToIndexRef.current(nearestIdx, 'center');
      return;
    }

    if (diffLines.length > 0) {
      scrollToIndexRef.current(diffLines.length - 1, 'center');
    }
  }, [diffLines]);

  const handleScrollerReady = useCallback(
    (fn: (idx: number, align?: 'start' | 'center') => void) => {
      scrollToIndexRef.current = fn;
    },
    [],
  );

  const handleWorkbookNavigationReady = useCallback(
    (fn: ((direction: WorkbookMoveDirection) => void) | null) => {
      workbookMoveRef.current = fn;
    },
    [],
  );

  const handleRevisionCompareChange = useCallback(async (
    nextBaseRevisionId: string,
    nextMineRevisionId: string,
  ) => {
    if (!window.svnDiff?.loadRevisionDiff) return;
    setLoadError('');
    setIsSwitchingRevisions(true);
    setIsLoadingDiff(true);
    setLoadPhase('loading');
    await waitForNextPaint();
    try {
      const nextData = await window.svnDiff.loadRevisionDiff(nextBaseRevisionId, nextMineRevisionId);
      await applyDiffData(nextData);
    } catch (error) {
      setIsLoadingDiff(false);
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoadPhase(hasLoadedDiffRef.current ? 'ready' : 'error');
    } finally {
      setIsSwitchingRevisions(false);
    }
  }, [applyDiffData]);

  const patchWorkbookFreeze = useCallback((patch: WorkbookFreezeState | null) => {
    if (!selectedCell) return;

    setWorkbookFreezeBySheet((prev) => {
      const next = { ...prev };
      if (!patch) {
        delete next[selectedCell.sheetName];
        return next;
      }

      next[selectedCell.sheetName] = {
        ...(prev[selectedCell.sheetName] ?? {}),
        ...patch,
      };
      return next;
    });
  }, [selectedCell]);

  const handleFreezeRow = useCallback(() => {
    if (!selectedCell || selectedCell.kind === 'column') return;
    patchWorkbookFreeze({ rowNumber: selectedCell.rowNumber });
  }, [patchWorkbookFreeze, selectedCell]);

  const handleFreezeColumn = useCallback(() => {
    if (!selectedCell || selectedCell.kind === 'row') return;
    patchWorkbookFreeze({ colCount: selectedCell.colIndex + 1 });
  }, [patchWorkbookFreeze, selectedCell]);

  const handleFreezePane = useCallback(() => {
    if (!selectedCell || selectedCell.kind !== 'cell') return;
    patchWorkbookFreeze({
      rowNumber: selectedCell.rowNumber,
      colCount: selectedCell.colIndex + 1,
    });
  }, [patchWorkbookFreeze, selectedCell]);

  const handleResetFreeze = useCallback(() => {
    patchWorkbookFreeze(null);
  }, [patchWorkbookFreeze]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target instanceof HTMLElement ? target : null;
      if (!el) return false;
      return el.isContentEditable || Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const handler = (e: KeyboardEvent) => {
      if (
        isWorkbookMode
        && selectedCell
        && selectedCell.kind === 'cell'
        && !showGoto
        && !showHelp
        && !isEditableTarget(e.target)
        && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        const directionMap: Record<string, WorkbookMoveDirection> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        };
        const direction = directionMap[e.key];
        if (direction) {
          e.preventDefault();
          workbookMoveRef.current?.(direction);
          return;
        }
      }
      if (e.key === 'F7') {
        e.preventDefault();
        setHunkIdx(i => e.shiftKey ? Math.max(0, i - 1) : Math.min(totalHunks - 1, i + 1));
        return;
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); setShowSearch(v => !v); return;
      }
      if (e.key === 'g' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); setShowGoto(v => !v); return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp(v => !v);
        return;
      }
      if (e.key === 'Escape') {
        setShowSearch(false); setShowGoto(false); setShowHelp(false); return;
      }
      if (showSearchRef.current && e.key === 'F3') {
        e.preventDefault();
        handleSearchNav(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.ctrlKey && e.key === ']') { e.preventDefault(); setFontSize(s => Math.min(20, s + 1)); }
      if (e.ctrlKey && e.key === '[') { e.preventDefault(); setFontSize(s => Math.max(10, s - 1)); }
      if (e.ctrlKey && e.key === '\\') { e.preventDefault(); setShowWhitespace(v => !v); }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSearchNav, isWorkbookMode, selectedCell, showGoto, showHelp, totalHunks]);

  // ── Shared panel props ─────────────────────────────────────────────────────

  const panelProps = {
    diffLines, collapseCtx, activeHunkIdx: hunkIdx,
    searchMatches, activeSearchIdx, hunkPositions,
    showWhitespace, fontSize,
    onScrollerReady: handleScrollerReady,
  };

  useEffect(() => {
    setSelectedCell(null);
  }, [diffLines]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemeContext.Provider value={T}>
      <div style={{
        fontFamily: FONT_UI,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 22%, ${T.bg0} 100%)`,
        color: T.t0,
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        minWidth: 0, minHeight: 0,
      }}>
        <Toolbar
          fileName={displayFileName}
          themeKey={themeKey}         setThemeKey={setThemeKey}
          layout={layout}             setLayout={setLayout}
          hunkIdx={hunkIdx}           totalHunks={totalHunks}
          onPrev={() => setHunkIdx(i => Math.max(0, i - 1))}
          onNext={() => setHunkIdx(i => Math.min(totalHunks - 1, i + 1))}
          showSearch={showSearch}     setShowSearch={setShowSearch}
          collapseCtx={collapseCtx}   setCollapseCtx={setCollapseCtx}
          showWhitespace={showWhitespace} setShowWhitespace={setShowWhitespace}
          showHiddenColumns={showHiddenColumns} setShowHiddenColumns={setShowHiddenColumns}
          fontSize={fontSize}         setFontSize={setFontSize}
          onGoto={() => setShowGoto(v => !v)}
          onHelp={() => setShowHelp(v => !v)}
          isElectron={isElectron}
          isWorkbookMode={isWorkbookMode}
        />

        {isElectron && isDevMode && (
          <DevLoadBar
            onLoadDemo={loadStandaloneDemo}
            onLoadWorkingCopyDiff={loadElectronWorkingCopyDiff}
          />
        )}

        {isDevMode && <PerfBar metrics={loadPerfMetrics} />}

        {showSearch && (
          <SearchBar
            matchCount={searchMatches.length}
            activeIdx={activeSearchIdx}
            onSearch={handleSearch}
            onNav={handleSearchNav}
            onClose={() => setShowSearch(false)}
          />
        )}

        {(isLoadingDiff || hasLoadedDiff) && (
          <SplitHeader
            baseName={displayBaseName}
            mineName={displayMineName}
            layout={layout}
            isWorkbookMode={isWorkbookMode}
            baseRevisionInfo={baseRevisionInfo}
            mineRevisionInfo={mineRevisionInfo}
            revisionOptions={revisionOptions}
            canSwitchRevisions={canSwitchRevisions && isElectron}
            isSwitchingRevisions={isSwitchingRevisions || isLoadingDiff}
            onRevisionChange={handleRevisionCompareChange}
          />
        )}

        {hasLoadedDiff && isWorkbookMode && (
          <WorkbookFormulaBar
            selection={selectedCell}
            fontSize={fontSize}
            freezeState={activeFreezeState}
            onFreezeRow={handleFreezeRow}
            onFreezeColumn={handleFreezeColumn}
            onFreezePane={handleFreezePane}
            onResetFreeze={handleResetFreeze}
          />
        )}

        {!hasLoadedDiff && loadPhase === 'loading' ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}>
            <div
              style={{
                display: 'grid',
                gap: 10,
                justifyItems: 'center',
                color: T.t1,
              }}>
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: `2px solid ${T.border}`,
                  borderTopColor: T.acc2,
                  animation: 'spin 0.9s linear infinite',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t('appLoadingDiff')}</span>
              <span style={{ fontSize: 11, color: T.t2 }}>{t('appLoadingHint')}</span>
            </div>
          </div>
        ) : !hasLoadedDiff ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}>
            <div
              style={{
                display: 'grid',
                gap: 8,
                justifyItems: 'center',
                textAlign: 'center',
                maxWidth: 520,
                color: T.t1,
              }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.t0 }}>
                {loadPhase === 'error' ? t('appLoadErrorTitle') : t('appIdleTitle')}
              </span>
              <span style={{ fontSize: 12, color: loadError ? T.delTx : T.t2, lineHeight: 1.5 }}>
                {loadError || (isDevMode ? t('devLoaderPendingWorkingCopy') : t('appIdleHintElectron'))}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
            {!isWorkbookMode && layout === 'unified' && <UnifiedPanel {...panelProps} />}
            {!isWorkbookMode && layout === 'split-h' && <SplitPanel  {...panelProps} vertical={false} />}
            {!isWorkbookMode && layout === 'split-v' && <SplitPanel  {...panelProps} vertical={true}  />}

            {isWorkbookMode && layout === 'unified' && (
              <WorkbookComparePanel
                {...panelProps}
                baseVersionLabel={baseVersionLabel}
                mineVersionLabel={mineVersionLabel}
                mode="stacked"
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                onWorkbookNavigationReady={handleWorkbookNavigationReady}
                baseWorkbookMetadata={baseWorkbookMetadata}
                mineWorkbookMetadata={mineWorkbookMetadata}
                freezeStateBySheet={workbookFreezeBySheet}
                showPerfDebug={isDevMode}
                showHiddenColumns={showHiddenColumns}
              />
            )}
            {isWorkbookMode && layout === 'split-v' && (
              <WorkbookComparePanel
                {...panelProps}
                baseVersionLabel={baseVersionLabel}
                mineVersionLabel={mineVersionLabel}
                mode="columns"
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                onWorkbookNavigationReady={handleWorkbookNavigationReady}
                baseWorkbookMetadata={baseWorkbookMetadata}
                mineWorkbookMetadata={mineWorkbookMetadata}
                freezeStateBySheet={workbookFreezeBySheet}
                showPerfDebug={isDevMode}
                showHiddenColumns={showHiddenColumns}
              />
            )}
            {isWorkbookMode && layout === 'split-h' && (
              <WorkbookHorizontalPanel
                {...panelProps}
                baseVersionLabel={baseVersionLabel}
                mineVersionLabel={mineVersionLabel}
                selectedCell={selectedCell}
                onSelectCell={setSelectedCell}
                onWorkbookNavigationReady={handleWorkbookNavigationReady}
                baseWorkbookMetadata={baseWorkbookMetadata}
                mineWorkbookMetadata={mineWorkbookMetadata}
                freezeStateBySheet={workbookFreezeBySheet}
                showPerfDebug={isDevMode}
                showHiddenColumns={showHiddenColumns}
              />
            )}

            {isLoadingDiff && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 60,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(250, 249, 245, 0.74)',
                  backdropFilter: 'blur(2px)',
                  pointerEvents: 'none',
                }}>
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    justifyItems: 'center',
                    color: T.t1,
                    padding: '18px 24px',
                    borderRadius: 16,
                    background: `${T.bg1}ee`,
                    border: `1px solid ${T.border}`,
                    boxShadow: `0 24px 48px -28px ${T.border2}`,
                  }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: `2px solid ${T.border}`,
                      borderTopColor: T.acc2,
                      animation: 'spin 0.9s linear infinite',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('appLoadingDiff')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <StatsBar
          diffLines={diffLines}
          baseName={displayBaseName}
          mineName={displayMineName}
          fileName={displayFileName}
          totalLines={totalLines}
          baseVersionLabel={baseVersionLabel}
          mineVersionLabel={mineVersionLabel}
        />

        {/* Modal backdrop */}
        {(showGoto || showHelp) && (
          <div
            onClick={() => { setShowGoto(false); setShowHelp(false); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          />
        )}

        {showGoto && (
          <GotoLine
            totalLines={totalLines}
            onGoto={handleGoto}
            onClose={() => setShowGoto(false)}
          />
        )}
        {showHelp && (
          <ShortcutsPanel onClose={() => setShowHelp(false)} />
        )}
        <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      </div>
    </ThemeContext.Provider>
  );
}
