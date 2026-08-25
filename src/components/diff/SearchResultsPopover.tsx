import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, Loader2 } from 'lucide-react';

import type { SearchResultItem } from '@/types';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import {
  getVirtualizedSearchResultsWindow,
  SEARCH_RESULT_ITEM_H,
  SEARCH_RESULT_ROW_H,
  SEARCH_RESULTS_VIEWPORT_H,
} from '@/utils/diff/searchResultItems';
import useSearchResultsPanelSize from '@/hooks/diff/useSearchResultsPanelSize';
import {
  clampSearchResultsPanelPosition,
  getSearchResultsPanelHeightBounds,
  getSearchResultsPanelWidthBounds,
} from '@/utils/diff/searchResultsPanelLayout';

function getResultsGridTemplateColumns(isWorkbookMode: boolean) {
  return isWorkbookMode
    ? 'minmax(110px, 132px) minmax(160px, 220px) minmax(0, 1fr)'
    : 'minmax(140px, 180px) minmax(0, 1fr)';
}

interface SearchResultsPopoverProps {
  isWorkbookMode: boolean;
  resultCount: number;
  totalResultCount: number;
  resultsTruncated: boolean;
  resolveResult: (index: number) => SearchResultItem | null;
  activeIdx: number;
  isSearching: boolean;
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
        data-search-highlight="true"
        data-search-highlight-active={active ? 'true' : 'false'}
        className="px-0.5 font-semibold text-inherit"
        style={{
          borderRadius: 3,
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          background: active ? cssAlpha('searchHl', '70') : cssAlpha('searchHl', '3d'),
          color: cssVar('t0'),
          boxShadow: active
            ? `inset 0 0 0 1px ${cssAlpha('searchHl', '78')}`
            : `inset 0 0 0 1px ${cssAlpha('searchHl', '40')}`,
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
  resultCount,
  totalResultCount,
  resultsTruncated,
  resolveResult,
  activeIdx,
  isSearching,
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
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef(0);
  const currentPositionRef = useRef<{ left: number; top: number }>({
    left: position?.left ?? 24,
    top: position?.top ?? 88,
  });
  const {
    panelSize,
    panelSizeRef,
    activeResizeMode,
    handleWidthResizePointerDown,
    handleHeightResizePointerDown,
    handleProportionalResizePointerDown,
    handleWidthResizeKeyDown,
    handleHeightResizeKeyDown,
    handleProportionalResizeKeyDown,
  } = useSearchResultsPanelSize({
    panelRef,
    currentPositionRef,
    onPositionChange,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const highlightPattern = useMemo(
    () => buildHighlightPattern(query, isRegex, isCaseSensitive),
    [isCaseSensitive, isRegex, query],
  );
  const visibleWindow = useMemo(
    () => getVirtualizedSearchResultsWindow(resultCount, scrollTop, SEARCH_RESULTS_VIEWPORT_H),
    [resultCount, scrollTop],
  );
  const visibleItems = useMemo(() => {
    const items: Array<{ index: number; item: SearchResultItem }> = [];
    for (let index = visibleWindow.startIndex; index < visibleWindow.endIndex; index += 1) {
      const item = resolveResult(index);
      if (item) {
        items.push({ index, item });
      }
    }
    return items;
  }, [resolveResult, visibleWindow.endIndex, visibleWindow.startIndex]);

  const applyPanelPosition = useCallback((nextPosition: { left: number; top: number }) => {
    const clampedPosition = clampSearchResultsPanelPosition(
      nextPosition,
      panelSizeRef.current,
      window.innerWidth,
      window.innerHeight,
    );
    currentPositionRef.current = clampedPosition;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.left = `${clampedPosition.left}px`;
    panel.style.top = `${clampedPosition.top}px`;
  }, [panelSizeRef]);

  const ensureActiveResultVisible = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    if (activeIdx < 0 || activeIdx >= resultCount) return;

    const scrollStyle = getComputedStyle(scrollElement);
    const paddingTop = Number.parseFloat(scrollStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(scrollStyle.paddingBottom) || 0;
    const itemTop = paddingTop + (activeIdx * SEARCH_RESULT_ITEM_H);
    const itemBottom = itemTop + SEARCH_RESULT_ROW_H;
    const viewportTop = scrollElement.scrollTop + paddingTop;
    const viewportBottom = scrollElement.scrollTop + scrollElement.clientHeight - paddingBottom;

    if (itemTop < viewportTop) {
      scrollElement.scrollTo({ top: Math.max(0, itemTop - paddingTop), behavior: 'auto' });
      return;
    }
    if (itemBottom > viewportBottom) {
      scrollElement.scrollTo({
        top: itemBottom - scrollElement.clientHeight + paddingBottom,
        behavior: 'auto',
      });
    }
  }, [activeIdx, resultCount]);

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
    setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, [resultCount]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) return;
      const nextPosition = clampSearchResultsPanelPosition(
        {
          left: event.clientX - dragOffset.x,
          top: event.clientY - dragOffset.y,
        },
        panelSizeRef.current,
        window.innerWidth,
        window.innerHeight,
      );
      currentPositionRef.current = nextPosition;
      if (dragFrameRef.current) return;
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = 0;
        applyPanelPosition(currentPositionRef.current);
      });
    };
    const stopDragging = () => {
      if (!dragOffsetRef.current) return;
      dragOffsetRef.current = null;
      setIsDragging(false);
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
      dragOffsetRef.current = null;
      setIsDragging(false);
    };
  }, [applyPanelPosition, onPositionChange, panelSizeRef]);

  if (typeof document === 'undefined') return null;

  const content = (
    <div
      ref={(node) => {
        panelRef.current = node;
        if (containerRef) {
          containerRef.current = node;
        }
      }}
      data-testid="search-results-panel"
      data-resizing={activeResizeMode ?? 'false'}
      className="motion-floating-panel z-[80] flex flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface-solid shadow-2xl"
      style={{
        position: 'fixed',
        left: position?.left ?? 24,
        top: position?.top ?? 88,
        width: panelSize.width,
        height: panelSize.height,
        boxShadow: `0 24px 56px -28px ${cssAlpha('border2', 'cc')}`,
      }}>
      <div
        className="flex shrink-0 items-center justify-between gap-4 border-b border-border-default px-4 py-3"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement | null)?.closest('button')) return;
          const currentTarget = event.currentTarget.getBoundingClientRect();
          dragOffsetRef.current = {
            x: event.clientX - currentTarget.left,
            y: event.clientY - currentTarget.top,
          };
          setIsDragging(true);
        }}
        style={{
          background: `linear-gradient(180deg, ${cssVar('bg1')} 0%, ${cssVar('bg0')} 100%)`,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-text-title">{t('searchResultsTitle')}</div>
          <div className="text-[11px] text-text-secondary">
            {resultsTruncated
              ? t('searchResultsTruncatedSummary', {
                  shown: resultCount,
                  total: totalResultCount,
                })
              : t('searchResultsSummary', { count: resultCount })}
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
        className="grid shrink-0 items-center gap-4 border-b border-border-default px-4 py-2.5 text-[12px] font-ui font-bold text-text-secondary"
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

      {resultCount === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-6 text-center text-[13px] text-text-secondary">
          {isSearching ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/18 bg-[var(--accent)]/[0.06] px-3 py-1.5 text-accent">
              <Loader2 size={14} className="animate-spin" />
              <span>{t('searchLoading')}</span>
            </div>
          ) : (
            t('searchResultsEmpty')
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          data-testid="search-results-scroll"
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          <div style={{ position: 'relative', height: visibleWindow.totalHeight }}>
            <div
              data-testid="search-results-window"
              className="absolute left-0 right-0 grid gap-1.5"
              style={{
                top: visibleWindow.offsetTop,
              }}>
              {visibleItems.map(({ index, item }) => {
                const isActive = index === activeIdx;
                return (
                  <button
                    key={`${item.scopeKey}:${index}`}
                    type="button"
                    data-search-result-index={index}
                    data-search-result-active={isActive ? 'true' : 'false'}
                    aria-current={isActive ? 'true' : undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onRequestFocusInput?.();
                    }}
                    onClick={() => onJump(index)}
                    className="group relative block w-full rounded-[12px] border px-3 py-2 text-left transition-all duration-150"
                    style={{
                      height: SEARCH_RESULT_ROW_H,
                      borderColor: isActive ? cssAlpha('searchHl', '52') : cssAlpha('border2', '54'),
                      background: isActive
                        ? `linear-gradient(180deg, ${cssVar('searchActiveBg')} 0%, ${cssAlpha('searchHl', '12')} 100%)`
                        : cssAlpha('bg1', 'b8'),
                      boxShadow: isActive
                        ? `0 10px 22px -20px ${cssAlpha('searchHl', '6e')}, inset 0 0 0 1px ${cssAlpha('searchHl', '6e')}`
                        : `0 6px 14px -18px ${cssAlpha('border2', '78')}`,
                    }}>
                    <div
                      className="grid items-center gap-2.5"
                      style={{
                        gridTemplateColumns: getResultsGridTemplateColumns(isWorkbookMode),
                      }}>
                      {isWorkbookMode ? (
                        <>
                          <div className="min-w-0 overflow-hidden">
                            <div className="flex flex-wrap items-center gap-1">
                              {item.sheetName ? renderBadge(item.sheetName, isActive ? 'accent' : 'muted') : renderBadge('-')}
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
                            data-search-result-preview="true"
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
                            data-search-result-preview="true"
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
        </div>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('searchResultsResizeWidth')}
        aria-valuemin={getSearchResultsPanelWidthBounds(window.innerWidth).minWidth}
        aria-valuemax={getSearchResultsPanelWidthBounds(window.innerWidth).maxWidth}
        aria-valuenow={panelSize.width}
        tabIndex={0}
        data-app-shortcuts="local"
        data-testid="search-results-width-handle"
        onPointerDown={handleWidthResizePointerDown}
        onKeyDownCapture={handleWidthResizeKeyDown}
        className="group absolute bottom-4 right-0 top-[58px] z-20 w-2 cursor-ew-resize touch-none outline-none"
        style={{
          background: activeResizeMode === 'width'
            ? `linear-gradient(90deg, transparent 0%, ${cssAlpha('acc', '14')} 100%)`
            : undefined,
        }}>
        <span
          className="absolute right-0.5 top-1/2 h-12 w-[3px] -translate-y-1/2 rounded-full transition-all duration-150 group-hover:h-16 group-focus-visible:h-16"
          style={{
            background: activeResizeMode === 'width' ? cssVar('acc') : cssAlpha('border2', '70'),
            boxShadow: activeResizeMode === 'width'
              ? `0 0 0 3px ${cssAlpha('acc', '16')}`
              : `0 0 0 1px ${cssAlpha('bg0', '80')}`,
          }}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('searchResultsResizeHeight')}
        aria-valuemin={getSearchResultsPanelHeightBounds(window.innerHeight).minHeight}
        aria-valuemax={getSearchResultsPanelHeightBounds(window.innerHeight).maxHeight}
        aria-valuenow={panelSize.height}
        tabIndex={0}
        data-app-shortcuts="local"
        data-testid="search-results-height-handle"
        onPointerDown={handleHeightResizePointerDown}
        onKeyDownCapture={handleHeightResizeKeyDown}
        className="group absolute bottom-0 left-0 right-4 z-20 h-2 cursor-ns-resize touch-none outline-none"
        style={{
          background: activeResizeMode === 'height'
            ? `linear-gradient(180deg, transparent 0%, ${cssAlpha('acc', '14')} 100%)`
            : undefined,
        }}>
        <span
          className="absolute bottom-0.5 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full transition-all duration-150 group-hover:w-16 group-focus-visible:w-16"
          style={{
            background: activeResizeMode === 'height' ? cssVar('acc') : cssAlpha('border2', '70'),
            boxShadow: activeResizeMode === 'height'
              ? `0 0 0 3px ${cssAlpha('acc', '16')}`
              : `0 0 0 1px ${cssAlpha('bg0', '80')}`,
          }}
        />
      </div>
      <button
        type="button"
        aria-label={t('searchResultsResizeProportionally')}
        data-app-shortcuts="local"
        data-testid="search-results-proportional-handle"
        onPointerDown={handleProportionalResizePointerDown}
        onKeyDownCapture={handleProportionalResizeKeyDown}
        className="absolute bottom-0 right-0 z-30 size-4 cursor-nwse-resize touch-none rounded-tl-md border-0 bg-transparent p-0 outline-none"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, transparent 0 3px, ${activeResizeMode === 'proportional' ? cssVar('acc') : cssAlpha('border2', '80')} 3px 4px)`,
          boxShadow: activeResizeMode === 'proportional'
            ? `-2px -2px 8px ${cssAlpha('acc', '18')}`
            : undefined,
        }}
      />
    </div>
  );

  return createPortal(content, document.body);
});

export default SearchResultsPopover;
