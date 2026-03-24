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
  useState, useEffect, useRef, useCallback, useMemo, startTransition,
} from 'react';

import type {
  DiffLine,
  DiffData,
  DiffPerformanceMetrics,
  ThemeKey,
  LayoutMode,
  SvnRevisionInfo,
  WorkbookCompareMode,
  WorkbookFreezeState,
  WorkbookMetadataSource,
  WorkbookMoveDirection,
  WorkbookPrecomputedDeltaPayload,
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
import {
  buildWorkbookSectionRowIndex,
  buildWorkbookSectionRowIndexFromPrecomputedDelta,
} from './utils/workbookSheetIndex';
import { findWorkbookHunkTargetCell } from './utils/workbookHunkTarget';
import { findWorkbookSectionIndex, getWorkbookSections } from './utils/workbookSections';
import { getStoredAppSettings, saveStoredAppSettings } from './utils/settings';
import {
  clampWorkbookColumnWidth,
  type WorkbookColumnWidthBySheet,
} from './utils/workbookColumnWidths';
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
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
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

function cycleHunkIndex(current: number, total: number, direction: -1 | 1): number {
  if (total <= 0) return 0;
  return (current + direction + total) % total;
}

function hasBytePayload(value: unknown): value is Uint8Array {
  return Boolean(value && ArrayBuffer.isView(value) && value.byteLength > 0);
}

function buildDiffCacheKey(data: DiffData, compareMode: WorkbookCompareMode): string {
  return [
    compareMode,
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
  const [workbookCompareMode, setWorkbookCompareMode] = useState<WorkbookCompareMode>(initialSettings.workbookCompareMode);
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
  const [precomputedWorkbookDelta, setPrecomputedWorkbookDelta] = useState<WorkbookPrecomputedDeltaPayload | null>(null);
  const [revisionOptions, setRevisionOptions] = useState<SvnRevisionInfo[]>([]);
  const [baseRevisionInfo, setBaseRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [mineRevisionInfo, setMineRevisionInfo] = useState<SvnRevisionInfo | null>(null);
  const [canSwitchRevisions, setCanSwitchRevisions] = useState(false);
  const [isSwitchingRevisions, setIsSwitchingRevisions] = useState(false);
  const [workbookFreezeBySheet, setWorkbookFreezeBySheet] = useState<WorkbookFreezeStateMap>({});
  const [workbookColumnWidthBySheet, setWorkbookColumnWidthBySheet] = useState<WorkbookColumnWidthBySheet>({});
  const [activeWorkbookSheetName, setActiveWorkbookSheetName] = useState<string | null>(null);
  const [mountedWorkbookLayouts, setMountedWorkbookLayouts] = useState<Record<LayoutMode, boolean>>({
    unified: initialSettings.layout === 'unified',
    'split-h': initialSettings.layout === 'split-h',
    'split-v': initialSettings.layout === 'split-v',
  });
  const loadSeqRef = useRef(0);
  const hasLoadedDiffRef = useRef(false);
  const workbookCompareModeRef = useRef<WorkbookCompareMode>(workbookCompareMode);
  const currentDiffDataRef = useRef<DiffData | null>(null);
  const diffResultCacheRef = useRef<Map<string, CachedDiffResult>>(new Map());

  const T = THEMES[themeKey];

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--scroll-thumb', T.scrollThumb);
    root.style.setProperty('--scroll-thumb-hover', T.scrollThumbHover);
    root.style.setProperty('--scroll-track', T.scrollTrack);
  }, [T]);
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
  const activeSelectionMergeRanges = useMemo(() => {
    if (!selectedCell) return [];
    const sheetName = selectedCell.sheetName;
    return selectedCell.side === 'base'
      ? (baseWorkbookMetadata?.sheets[sheetName]?.mergeRanges ?? [])
      : (mineWorkbookMetadata?.sheets[sheetName]?.mergeRanges ?? []);
  }, [baseWorkbookMetadata, mineWorkbookMetadata, selectedCell]);

  // scrollToIndex exposed by the active panel — used by Goto and hunk nav
  const scrollToIndexRef = useRef<((idx: number, align?: 'start' | 'center') => void) | null>(null);
  const workbookMoveRef = useRef<((direction: WorkbookMoveDirection) => void) | null>(null);
  // Ref-based showSearch avoids stale keyboard handler closure
  const showSearchRef = useRef(false);
  useEffect(() => { showSearchRef.current = showSearch; }, [showSearch]);

  // ── Load diff data ─────────────────────────────────────────────────────────

  const beginDiffLoad = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoadError('');
    setIsLoadingDiff(true);
    setLoadPhase('loading');
    await waitForNextPaint();
    return seq;
  }, []);

  const failDiffLoad = useCallback((seq: number, error: unknown) => {
    if (seq !== loadSeqRef.current) return;
    setIsLoadingDiff(false);
    setLoadError(error instanceof Error ? error.message : String(error));
    setLoadPhase(hasLoadedDiffRef.current ? 'ready' : 'error');
    if (!hasLoadedDiffRef.current) {
      setLoadPerfMetrics(null);
    }
  }, []);

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

  const applyDiffData = useCallback(async (
    data: DiffData,
    options?: { seq?: number; loadingAlreadyStarted?: boolean; compareMode?: WorkbookCompareMode },
  ) => {
    const seq = options?.seq ?? ++loadSeqRef.current;
    const applyStart = getNow();
    const compareMode = options?.compareMode ?? workbookCompareModeRef.current;
    const cacheKey = buildDiffCacheKey(data, compareMode);
    if (!options?.loadingAlreadyStarted) {
      setLoadError('');
      setIsLoadingDiff(true);
      setLoadPhase('loading');
      await waitForNextPaint();
    }

    try {
      const textStart = getNow();
      const { baseText, mineText } = resolveDiffTexts(data);
      const textResolveMs = getNow() - textStart;
      const precomputedDiffLines = data.precomputedDiffLinesByMode?.[compareMode]
        ?? (compareMode === 'strict' ? (data.precomputedDiffLines ?? null) : null);
      const selectedPrecomputedWorkbookDelta = data.precomputedWorkbookDeltaByMode?.[compareMode]
        ?? (compareMode === 'strict' ? (data.precomputedWorkbookDelta ?? null) : null);
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
        currentDiffDataRef.current = data;

        setBaseName(data.baseName || data.fileName || '');
        setMineName(data.mineName || data.fileName || '');
        setFileName(data.fileName || '');
        setSelectedCell(null);
        setWorkbookFreezeBySheet({});
        setWorkbookColumnWidthBySheet({});
        setActiveWorkbookSheetName(null);
        setPrecomputedWorkbookDelta(cachedResult.workbookDelta);
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
      const shouldUsePrecomputedDiff = Boolean(precomputedDiffLines);
      if (shouldUsePrecomputedDiff) {
        nextDiffLines = precomputedDiffLines!;
        diffDuration = data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0;
      } else {
        const diffStart = getNow();
        nextDiffLines = await computeDiffAsync(baseText, mineText, compareMode);
        diffDuration = getNow() - diffStart;
      }
      if (seq !== loadSeqRef.current) return;
      const totalAppMs = getNow() - applyStart;
      currentDiffDataRef.current = data;

      setBaseName(data.baseName || data.fileName || '');
      setMineName(data.mineName || data.fileName || '');
      setFileName(data.fileName || '');
      setSelectedCell(null);
      setWorkbookFreezeBySheet({});
      setWorkbookColumnWidthBySheet({});
      setActiveWorkbookSheetName(null);
      setPrecomputedWorkbookDelta(selectedPrecomputedWorkbookDelta);
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
        diffMs: shouldUsePrecomputedDiff ? (data.perf?.rustDiffMs ?? data.perf?.diffMs ?? 0) : diffDuration,
        totalAppMs,
        diffLineCount: nextDiffLines.length,
      });
      diffResultCacheRef.current.set(cacheKey, {
        diffLines: nextDiffLines,
        workbookDelta: selectedPrecomputedWorkbookDelta,
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
        setPrecomputedWorkbookDelta(null);
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

  useEffect(() => {
    const currentData = currentDiffDataRef.current;
    if (!currentData) return;
    void applyDiffData(currentData, { compareMode: workbookCompareMode });
  }, [applyDiffData, workbookCompareMode]);

  const loadStandaloneDemo = useCallback(async () => {
    const seq = await beginDiffLoad();
    await applyDiffData({
      ...buildDemoDiffData(),
      perf: { source: 'demo' },
    }, {
      seq,
      loadingAlreadyStarted: true,
    });
  }, [applyDiffData, beginDiffLoad, buildDemoDiffData]);

  const loadElectronWorkingCopyDiff = useCallback(async (filePath: string) => {
    if (!window.svnDiff?.loadDevWorkingCopyDiff) return;
    const seq = await beginDiffLoad();
    try {
      const nextData = await window.svnDiff.loadDevWorkingCopyDiff(filePath);
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
      throw error;
    }
  }, [applyDiffData, beginDiffLoad, failDiffLoad]);

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

      let seq = 0;
      try {
        seq = await beginDiffLoad();
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
          if (!cancelled && seq === loadSeqRef.current) {
            await applyDiffData(data, {
              seq,
              loadingAlreadyStarted: true,
            });
          }
        } else if (!cancelled && seq === loadSeqRef.current) {
          setIsLoadingDiff(false);
          setHasLoadedDiff(false);
          setLoadPhase('idle');
          setLoadError('');
          setLoadPerfMetrics(null);
        }
      } catch (error) {
        if (!cancelled && seq === loadSeqRef.current) {
          setIsLoadingDiff(false);
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
  }, [applyDiffData, beginDiffLoad]);

  // Clear token cache when theme changes
  useEffect(() => { clearTokenCache(); }, [themeKey]);

  useEffect(() => {
    hasLoadedDiffRef.current = hasLoadedDiff;
  }, [hasLoadedDiff]);

  useEffect(() => {
    workbookCompareModeRef.current = workbookCompareMode;
  }, [workbookCompareMode]);

  useEffect(() => {
    saveStoredAppSettings({
      themeKey,
      layout,
      collapseCtx,
      showWhitespace,
      showHiddenColumns,
      workbookCompareMode,
      fontSize,
    });
  }, [themeKey, layout, collapseCtx, showWhitespace, showHiddenColumns, workbookCompareMode, fontSize]);

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
  const workbookSections = useMemo(
    () => getWorkbookSections(diffLines, workbookCompareMode),
    [diffLines, workbookCompareMode],
  );
  const workbookSectionRowIndex = useMemo(
    () => (
      workbookCompareMode === 'strict' && precomputedWorkbookDelta
        ? buildWorkbookSectionRowIndexFromPrecomputedDelta(diffLines, precomputedWorkbookDelta)
        : buildWorkbookSectionRowIndex(diffLines, workbookSections, workbookCompareMode)
    ),
    [diffLines, precomputedWorkbookDelta, workbookCompareMode, workbookSections],
  );
  const isWorkbookMode = workbookSections.length > 0;
  const workbookHunkTargets = useMemo(
    () => hunks.map(hunk => findWorkbookHunkTargetCell(
      hunk,
      workbookSections,
        workbookSectionRowIndex,
        baseVersionLabel,
        mineVersionLabel,
        workbookCompareMode,
      )),
    [baseVersionLabel, hunks, mineVersionLabel, workbookCompareMode, workbookSectionRowIndex, workbookSections],
  );
  const currentHunkTargetLabel = useMemo(() => {
    if (!isWorkbookMode) return '';
    const targetCell = workbookHunkTargets[hunkIdx];
    if (!targetCell) return '';
    const showSheetName = workbookSections.length > 1;
    return showSheetName
      ? `${targetCell.sheetName}!${targetCell.address}`
      : targetCell.address;
  }, [hunkIdx, isWorkbookMode, workbookHunkTargets, workbookSections.length]);

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
  const handleLayoutChange = useCallback((nextLayout: LayoutMode) => {
    setMountedWorkbookLayouts((prev) => (
      prev[nextLayout]
        ? prev
        : { ...prev, [nextLayout]: true }
    ));
    startTransition(() => {
      setLayout(nextLayout);
    });
  }, []);

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
    setIsSwitchingRevisions(true);
    const seq = await beginDiffLoad();
    try {
      const nextData = await window.svnDiff.loadRevisionDiff(nextBaseRevisionId, nextMineRevisionId);
      if (seq !== loadSeqRef.current) return;
      await applyDiffData(nextData, {
        seq,
        loadingAlreadyStarted: true,
      });
    } catch (error) {
      failDiffLoad(seq, error);
    } finally {
      setIsSwitchingRevisions(false);
    }
  }, [applyDiffData, beginDiffLoad, failDiffLoad]);

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

  const handleWorkbookColumnWidthChange = useCallback((
    sheetName: string,
    column: number,
    width: number,
  ) => {
    const nextWidth = clampWorkbookColumnWidth(width);
    setWorkbookColumnWidthBySheet((prev) => {
      const nextSheet = {
        ...(prev[sheetName] ?? {}),
        [column]: nextWidth,
      };
      return {
        ...prev,
        [sheetName]: nextSheet,
      };
    });
  }, []);

  useEffect(() => {
    if (workbookSections.length === 0) {
      setActiveWorkbookSheetName(null);
      return;
    }

    setActiveWorkbookSheetName((prev) => {
      if (prev && workbookSections.some(section => section.name === prev)) {
        return prev;
      }
      return workbookSections[0]?.name ?? null;
    });
  }, [workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode) return;
    setMountedWorkbookLayouts((prev) => (
      prev[layout]
        ? prev
        : { ...prev, [layout]: true }
    ));
  }, [isWorkbookMode, layout]);

  useEffect(() => {
    if (!hasLoadedDiff || !isWorkbookMode) return;
    if (mountedWorkbookLayouts.unified && mountedWorkbookLayouts['split-h'] && mountedWorkbookLayouts['split-v']) return;

    const timer = setTimeout(() => {
      startTransition(() => {
        setMountedWorkbookLayouts({
          unified: true,
          'split-h': true,
          'split-v': true,
        });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [hasLoadedDiff, isWorkbookMode, mountedWorkbookLayouts]);

  useEffect(() => {
    if (!isWorkbookMode || !selectedCell?.sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === selectedCell.sheetName ? prev : selectedCell.sheetName));
  }, [isWorkbookMode, selectedCell?.sheetName]);

  useEffect(() => {
    if (!isWorkbookMode || activeSearchIdx < 0) return;
    const lineIdx = searchMatches[activeSearchIdx]?.lineIdx;
    if (lineIdx == null) return;
    const sheetName = workbookSections[findWorkbookSectionIndex(workbookSections, lineIdx)]?.name;
    if (!sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === sheetName ? prev : sheetName));
  }, [activeSearchIdx, isWorkbookMode, searchMatches, workbookSections]);

  useEffect(() => {
    if (!isWorkbookMode) return;
    const targetLineIdx = hunkPositions[hunkIdx];
    if (targetLineIdx == null) return;
    const sheetName = workbookSections[findWorkbookSectionIndex(workbookSections, targetLineIdx)]?.name;
    if (!sheetName) return;
    setActiveWorkbookSheetName((prev) => (prev === sheetName ? prev : sheetName));
  }, [hunkIdx, hunkPositions, isWorkbookMode, workbookSections]);

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
        setHunkIdx(i => cycleHunkIndex(i, totalHunks, e.shiftKey ? -1 : 1));
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
    guidedLineIdx: null,
    guidedHunkRange: null,
    guidedPulseNonce: 0,
    onScrollerReady: handleScrollerReady,
  };

  useEffect(() => {
    const targetHunk = hunks[hunkIdx];
    if (!targetHunk) {
      return;
    }

    let raf2 = 0;
    if (isWorkbookMode) {
      const targetCell = workbookHunkTargets[hunkIdx];
      if (targetCell) {
        setActiveWorkbookSheetName((prev) => (prev === targetCell.sheetName ? prev : targetCell.sheetName));
        setSelectedCell(prev => (
          prev
          && prev.kind === targetCell.kind
          && prev.sheetName === targetCell.sheetName
          && prev.side === targetCell.side
          && prev.rowNumber === targetCell.rowNumber
          && prev.colIndex === targetCell.colIndex
            ? prev
            : targetCell
        ));
      }
    }

    const targetLineIdx = targetHunk.startIdx;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        scrollToIndexRef.current?.(targetLineIdx, 'center');
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [hunkIdx, hunks, isWorkbookMode, workbookHunkTargets]);

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
        flex: '1 1 auto',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        minWidth: 0, minHeight: 0,
      }}>
        <Toolbar
          fileName={displayFileName}
          themeKey={themeKey}         setThemeKey={setThemeKey}
          layout={layout}             setLayout={handleLayoutChange}
          hunkIdx={hunkIdx}           totalHunks={totalHunks}
          hunkTargetLabel={currentHunkTargetLabel}
          onPrev={() => setHunkIdx(i => cycleHunkIndex(i, totalHunks, -1))}
          onNext={() => setHunkIdx(i => cycleHunkIndex(i, totalHunks, 1))}
          showSearch={showSearch}     setShowSearch={setShowSearch}
          collapseCtx={collapseCtx}   setCollapseCtx={setCollapseCtx}
          showWhitespace={showWhitespace} setShowWhitespace={setShowWhitespace}
          showHiddenColumns={showHiddenColumns} setShowHiddenColumns={setShowHiddenColumns}
          workbookCompareMode={workbookCompareMode}
          setWorkbookCompareMode={setWorkbookCompareMode}
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
            mergeRanges={activeSelectionMergeRanges}
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
              width: '100%',
              minWidth: 0,
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
            </div>
          </div>
        ) : !hasLoadedDiff ? (
          <div
            style={{
              flex: 1,
              width: '100%',
              minWidth: 0,
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

            {isWorkbookMode && (
              <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0 }}>
                {mountedWorkbookLayouts.unified && (
                  <div
                    style={layout === 'unified'
                      ? { position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }
                      : { position: 'absolute', inset: 0, display: 'flex', minWidth: 0, minHeight: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                    <WorkbookComparePanel
                      {...panelProps}
                      active={layout === 'unified'}
                      baseVersionLabel={baseVersionLabel}
                      mineVersionLabel={mineVersionLabel}
                      mode="stacked"
                      selectedCell={selectedCell}
                      onSelectCell={setSelectedCell}
                      onWorkbookNavigationReady={handleWorkbookNavigationReady}
                      baseWorkbookMetadata={baseWorkbookMetadata}
                      mineWorkbookMetadata={mineWorkbookMetadata}
                      freezeStateBySheet={workbookFreezeBySheet}
                      columnWidthBySheet={workbookColumnWidthBySheet}
                      onColumnWidthChange={handleWorkbookColumnWidthChange}
                      workbookSections={workbookSections}
                      workbookSectionRowIndex={workbookSectionRowIndex}
                      activeWorkbookSheetName={activeWorkbookSheetName}
                      onActiveWorkbookSheetChange={setActiveWorkbookSheetName}
                      compareMode={workbookCompareMode}
                      showPerfDebug={isDevMode}
                      showHiddenColumns={showHiddenColumns}
                      tooltipDisabled={isLoadingDiff || layout !== 'unified'}
                    />
                  </div>
                )}
                {mountedWorkbookLayouts['split-v'] && (
                  <div
                    style={layout === 'split-v'
                      ? { position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }
                      : { position: 'absolute', inset: 0, display: 'flex', minWidth: 0, minHeight: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                    <WorkbookComparePanel
                      {...panelProps}
                      active={layout === 'split-v'}
                      baseVersionLabel={baseVersionLabel}
                      mineVersionLabel={mineVersionLabel}
                      mode="columns"
                      selectedCell={selectedCell}
                      onSelectCell={setSelectedCell}
                      onWorkbookNavigationReady={handleWorkbookNavigationReady}
                      baseWorkbookMetadata={baseWorkbookMetadata}
                      mineWorkbookMetadata={mineWorkbookMetadata}
                      freezeStateBySheet={workbookFreezeBySheet}
                      columnWidthBySheet={workbookColumnWidthBySheet}
                      onColumnWidthChange={handleWorkbookColumnWidthChange}
                      workbookSections={workbookSections}
                      workbookSectionRowIndex={workbookSectionRowIndex}
                      activeWorkbookSheetName={activeWorkbookSheetName}
                      onActiveWorkbookSheetChange={setActiveWorkbookSheetName}
                      compareMode={workbookCompareMode}
                      showPerfDebug={isDevMode}
                      showHiddenColumns={showHiddenColumns}
                      tooltipDisabled={isLoadingDiff || layout !== 'split-v'}
                    />
                  </div>
                )}
                {mountedWorkbookLayouts['split-h'] && (
                  <div
                    style={layout === 'split-h'
                      ? { position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }
                      : { position: 'absolute', inset: 0, display: 'flex', minWidth: 0, minHeight: 0, visibility: 'hidden', pointerEvents: 'none' }}>
                    <WorkbookHorizontalPanel
                      {...panelProps}
                      active={layout === 'split-h'}
                      baseVersionLabel={baseVersionLabel}
                      mineVersionLabel={mineVersionLabel}
                      selectedCell={selectedCell}
                      onSelectCell={setSelectedCell}
                      onWorkbookNavigationReady={handleWorkbookNavigationReady}
                      baseWorkbookMetadata={baseWorkbookMetadata}
                      mineWorkbookMetadata={mineWorkbookMetadata}
                      freezeStateBySheet={workbookFreezeBySheet}
                      columnWidthBySheet={workbookColumnWidthBySheet}
                      onColumnWidthChange={handleWorkbookColumnWidthChange}
                      workbookSections={workbookSections}
                      workbookSectionRowIndex={workbookSectionRowIndex}
                      activeWorkbookSheetName={activeWorkbookSheetName}
                      onActiveWorkbookSheetChange={setActiveWorkbookSheetName}
                      compareMode={workbookCompareMode}
                      showPerfDebug={isDevMode}
                      showHiddenColumns={showHiddenColumns}
                      tooltipDisabled={isLoadingDiff || layout !== 'split-h'}
                    />
                  </div>
                )}
              </div>
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
                  pointerEvents: 'auto',
                  cursor: 'progress',
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
          isWorkbookMode={isWorkbookMode}
          workbookCompareMode={workbookCompareMode}
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
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes guidedPulse{0%{box-shadow:0 0 0 0 ${T.acc2}00,inset 0 0 0 2px ${T.acc2}f2}50%{box-shadow:0 0 0 6px ${T.acc2}22,inset 0 0 0 2px ${T.acc2}}100%{box-shadow:0 0 0 0 ${T.acc2}00,inset 0 0 0 2px ${T.acc2}b8}}`}</style>
      </div>
    </ThemeContext.Provider>
  );
}
