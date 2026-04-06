import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp } from 'lucide-react';

import type { SearchResultItem } from '@/types';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssVar } from '@/theme/cssUtils';

const SEARCH_RESULT_ROW_H = 54;

function getResultsGridTemplateColumns(isWorkbookMode: boolean) {
  return isWorkbookMode
    ? 'minmax(110px, 132px) minmax(160px, 220px) minmax(0, 1fr)'
    : 'minmax(140px, 180px) minmax(0, 1fr)';
}

interface SearchResultsPopoverProps {
  isWorkbookMode: boolean;
  results: SearchResultItem[];
  activeIdx: number;
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  position: { left: number; top: number } | null;
  onPositionChange: (position: { left: number; top: number }) => void;
  containerRef?: MutableRefObject<HTMLDivElement | null> | undefined;
  onJump: (index: number) => void;
  onClose: () => void;
  onRequestFocusInput?: (() => void) | undefined;
}

function buildHighlightPattern(
  query: string,
  isRegex: boolean,
  isCaseSensitive: boolean,
): RegExp | null {
  if (!query) return null;
  const source = isRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(source, isCaseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function renderHighlightedText(text: string, pattern: RegExp | null, active = false) {
  if (!text || !pattern) return text;

  pattern.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const value = match[0];
    if (!value) {
      pattern.lastIndex += 1;
      continue;
    }

    if (match.index > cursor) {
      nodes.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, match.index)}</Fragment>);
    }
    nodes.push(
      <mark
        key={`hit-${match.index}`}
        className="rounded-[4px] px-0.5 text-inherit"
        style={{
          background: active ? cssAlpha('searchHl', '68') : cssAlpha('searchHl', '38'),
          color: cssVar('t0'),
          boxShadow: active ? `inset 0 0 0 1px ${cssAlpha('searchHl', '78')}` : undefined,
        }}>
        {value}
      </mark>,
    );
    cursor = match.index + value.length;
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={`tail-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : text;
}

function renderBadge(
  label: string,
  tone: 'accent' | 'muted' = 'muted',
) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none"
      style={{
        borderColor: tone === 'accent' ? cssAlpha('acc', '38') : cssAlpha('border2', '7a'),
        background: tone === 'accent' ? cssAlpha('acc', '14') : cssAlpha('bg3', 'a8'),
        color: tone === 'accent' ? cssVar('acc') : cssVar('t1'),
      }}>
      {label}
    </span>
  );
}

const SearchResultsPopover = memo(({
  isWorkbookMode,
  results,
  activeIdx,
  query,
  isRegex,
  isCaseSensitive,
  position,
  onPositionChange,
  containerRef,
  onJump,
  onClose,
  onRequestFocusInput,
}: SearchResultsPopoverProps) => {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef(0);
  const currentPositionRef = useRef<{ left: number; top: number }>({
    left: position?.left ?? 24,
    top: position?.top ?? 88,
  });
  const highlightPattern = useMemo(
    () => buildHighlightPattern(query, isRegex, isCaseSensitive),
    [isCaseSensitive, isRegex, query],
  );

  const applyPanelPosition = useCallback((nextPosition: { left: number; top: number }) => {
    currentPositionRef.current = nextPosition;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.left = `${nextPosition.left}px`;
    panel.style.top = `${nextPosition.top}px`;
  }, []);

  const ensureActiveResultVisible = useCallback(() => {
    if (activeIdx < 0 || activeIdx >= results.length) return;
    rowRefs.current.get(activeIdx)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });
  }, [activeIdx, results.length]);

  useEffect(() => {
    ensureActiveResultVisible();
  }, [ensureActiveResultVisible]);

  useEffect(() => {
    applyPanelPosition({
      left: position?.left ?? 24,
      top: position?.top ?? 88,
    });
  }, [applyPanelPosition, position?.left, position?.top]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) return;
      const nextLeft = Math.max(8, Math.min(window.innerWidth - 320, event.clientX - dragOffset.x));
      const nextTop = Math.max(8, Math.min(window.innerHeight - 120, event.clientY - dragOffset.y));
      currentPositionRef.current = { left: nextLeft, top: nextTop };
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = 0;
        applyPanelPosition(currentPositionRef.current);
      });
    };
    const stopDragging = () => {
      if (!dragOffsetRef.current) return;
      dragOffsetRef.current = null;
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = 0;
      }
      applyPanelPosition(currentPositionRef.current);
      onPositionChange(currentPositionRef.current);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      if (dragFrameRef.current) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = 0;
      }
    };
  }, [applyPanelPosition, onPositionChange]);

  if (typeof document === 'undefined') return null;

  const content = (
    <div
      ref={(node) => {
        panelRef.current = node;
        if (containerRef) {
          containerRef.current = node;
        }
      }}
      className="motion-floating-panel z-[80] w-[min(920px,calc(100vw-56px))] overflow-hidden rounded-2xl border border-border-default bg-bg-surface-solid shadow-2xl"
      style={{
        position: 'fixed',
        left: position?.left ?? 24,
        top: position?.top ?? 88,
        boxShadow: `0 24px 56px -28px ${cssAlpha('border2', 'cc')}`,
      }}>
      <div
        className="flex items-center justify-between gap-4 border-b border-border-default px-4 py-3"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement | null)?.closest('button')) return;
          const currentTarget = event.currentTarget.getBoundingClientRect();
          dragOffsetRef.current = {
            x: event.clientX - currentTarget.left,
            y: event.clientY - currentTarget.top,
          };
        }}
        style={{
          background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
          cursor: 'move',
        }}>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-text-title">{t('searchResultsTitle')}</div>
          <div className="text-[11px] text-text-secondary">
            {t('searchResultsSummary', { count: results.length })}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="text-right">
            {isWorkbookMode
              ? t('searchResultsKeyboardHintWorkbook')
              : t('searchResultsKeyboardHintText')}
          </span>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onRequestFocusInput?.();
            }}
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-border-default bg-bg-surface-hover text-text-secondary transition-colors duration-150 hover:border-accent hover:text-accent"
            aria-label={t('searchCloseTitle')}>
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
      <div
        className="grid items-center gap-4 border-b border-border-default px-4 py-2.5 text-[12px] font-ui font-bold text-text-secondary"
        style={{
          gridTemplateColumns: getResultsGridTemplateColumns(isWorkbookMode),
          background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
        }}>
        {isWorkbookMode ? (
          <>
            <div>{t('searchResultsSheetColumn')}</div>
            <div>{t('searchResultsLocationColumn')}</div>
            <div>{t('searchResultsPreviewColumn')}</div>
          </>
        ) : (
          <>
            <div>{t('searchResultsLocationColumn')}</div>
            <div>{t('searchResultsPreviewColumn')}</div>
          </>
        )}
      </div>

      {results.length === 0 ? (
        <div className="px-5 py-12 text-center text-[13px] text-text-secondary">
          {t('searchResultsEmpty')}
        </div>
      ) : (
        <div ref={scrollRef} className="relative h-[360px] overflow-y-auto overflow-x-hidden px-2 py-2">
          <div className="grid gap-1.5">
            {results.map((item) => {
              const isActive = item.index === activeIdx;
              return (
                <button
                  key={`${item.scopeKey}:${item.index}`}
                  ref={(node) => {
                    if (!node) {
                      rowRefs.current.delete(item.index);
                      return;
                    }
                    rowRefs.current.set(item.index, node);
                  }}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onRequestFocusInput?.();
                  }}
                  onClick={() => onJump(item.index)}
                  className="group relative block w-full rounded-[12px] border px-3 py-2 text-left transition-all duration-150"
                  style={{
                    minHeight: SEARCH_RESULT_ROW_H,
                    borderColor: isActive ? cssAlpha('searchHl', '52') : cssAlpha('border2', '54'),
                    background: isActive
                      ? `linear-gradient(180deg, ${cssVar('searchActiveBg')} 0%, ${cssAlpha('searchHl', '12')} 100%)`
                      : cssAlpha('bg1', 'b8'),
                    boxShadow: isActive
                      ? `0 10px 22px -20px ${cssAlpha('searchHl', '6e')}, inset 0 0 0 1px ${cssAlpha('searchHl', '6e')}`
                      : `0 6px 14px -18px ${cssAlpha('border2', '78')}`,
                    contentVisibility: 'auto',
                    containIntrinsicSize: `${SEARCH_RESULT_ROW_H}px`,
                  }}>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full"
                      style={{ background: cssVar('searchHl') }}
                    />
                  )}
                  <div
                    className="grid items-center gap-2.5"
                    style={{
                      gridTemplateColumns: getResultsGridTemplateColumns(isWorkbookMode),
                      paddingLeft: isActive ? 8 : 0,
                    }}>
                    {isWorkbookMode ? (
                      <>
                        <div className="min-w-0 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-1">
                            {item.sheetName ? renderBadge(item.sheetName, isActive ? 'accent' : 'muted') : renderBadge('—')}
                            {item.sideLabel ? renderBadge(item.sideLabel, isActive ? 'accent' : 'muted') : null}
                          </div>
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          <div className="flex flex-wrap items-center gap-1">
                            {renderBadge(item.address || item.locationLabel, isActive ? 'accent' : 'muted')}
                            {item.rowNumber != null ? renderBadge(`R${item.rowNumber}`) : null}
                            {item.colIndex != null ? renderBadge(`C${item.colIndex + 1}`) : null}
                          </div>
                        </div>
                        <div
                          className="min-w-0 text-[12px] leading-[1.4] text-text-title"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}>
                          {renderHighlightedText(item.preview || ' ', highlightPattern, isActive)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`min-w-0 truncate font-code text-[12px] ${isActive ? 'text-accent' : 'text-text-title'}`}>
                          {item.locationLabel}
                        </div>
                        <div
                          className="min-w-0 text-[12px] leading-[1.4] text-text-title"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}>
                          {renderHighlightedText(item.preview || ' ', highlightPattern, isActive)}
                        </div>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
});

export default SearchResultsPopover;
