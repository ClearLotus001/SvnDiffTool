import {
  Fragment,
  memo,
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
import { useVirtual } from '@/hooks/virtualization/useVirtual';
import { cssAlpha, cssVar } from '@/theme/cssUtils';

const SEARCH_RESULT_ROW_H = 60;

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

function renderHighlightedText(text: string, pattern: RegExp | null) {
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
          background: cssAlpha('searchHl', '58'),
          color: cssVar('t0'),
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
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const highlightPattern = useMemo(
    () => buildHighlightPattern(query, isRegex, isCaseSensitive),
    [isCaseSensitive, isRegex, query],
  );
  const {
    totalH,
    startIdx,
    endIdx,
    scrollToIndex,
  } = useVirtual(results.length, scrollRef, SEARCH_RESULT_ROW_H, {
    overscanMin: 10,
    overscanFactor: 1.4,
  });

  useEffect(() => {
    if (activeIdx < 0 || activeIdx >= results.length) return;
    scrollToIndex(activeIdx, 'center', 'auto');
  }, [activeIdx, results.length, scrollToIndex]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragOffset = dragOffsetRef.current;
      if (!dragOffset) return;
      const nextLeft = Math.max(8, Math.min(window.innerWidth - 320, event.clientX - dragOffset.x));
      const nextTop = Math.max(8, Math.min(window.innerHeight - 120, event.clientY - dragOffset.y));
      onPositionChange({ left: nextLeft, top: nextTop });
    };
    const stopDragging = () => {
      dragOffsetRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [onPositionChange]);

  if (typeof document === 'undefined') return null;

  const content = (
    <div
      ref={containerRef ?? undefined}
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
            {t('searchResultsKeyboardHint')}
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
          gridTemplateColumns: isWorkbookMode ? 'minmax(150px, 180px) minmax(180px, 220px) minmax(320px, 1fr)' : 'minmax(160px, 190px) minmax(320px, 1fr)',
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
        <div ref={scrollRef} className="relative h-[360px] overflow-auto">
          <div style={{ position: 'relative', height: totalH }}>
            {results.slice(startIdx, endIdx).map((item, offset) => {
              const itemIndex = startIdx + offset;
              const isActive = item.index === activeIdx;
              return (
                <button
                  key={`${item.scopeKey}:${item.index}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onRequestFocusInput?.();
                  }}
                  onClick={() => onJump(item.index)}
                  className="absolute left-0 right-0 w-full border-b border-border-default/70 px-4 text-left transition-colors duration-150 hover:bg-bg-surface-hover"
                  style={{
                    top: itemIndex * SEARCH_RESULT_ROW_H,
                    height: SEARCH_RESULT_ROW_H,
                    background: isActive ? cssAlpha('searchHl', '30') : undefined,
                    boxShadow: isActive
                      ? `inset 3px 0 0 ${cssVar('searchHl')}, inset 0 0 0 1px ${cssAlpha('searchHl', '40')}`
                      : undefined,
                  }}>
                  <div
                    className="grid items-center gap-3"
                    style={{
                      gridTemplateColumns: isWorkbookMode ? 'minmax(150px, 180px) minmax(180px, 220px) minmax(320px, 1fr)' : 'minmax(160px, 190px) minmax(320px, 1fr)',
                    }}>
                    {isWorkbookMode ? (
                      <>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {item.sheetName ? renderBadge(item.sheetName, isActive ? 'accent' : 'muted') : renderBadge('—')}
                            {item.sideLabel ? renderBadge(item.sideLabel, isActive ? 'accent' : 'muted') : null}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {renderBadge(item.address || item.locationLabel, isActive ? 'accent' : 'muted')}
                            {item.rowNumber != null ? renderBadge(`R${item.rowNumber}`) : null}
                            {item.colIndex != null ? renderBadge(`C${item.colIndex + 1}`) : null}
                          </div>
                        </div>
                        <div
                          className="min-w-0 text-[12px] leading-5 text-text-title"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                          {renderHighlightedText(item.preview || ' ', highlightPattern)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`truncate font-code text-[12px] ${isActive ? 'text-accent' : 'text-text-title'}`}>
                          {item.locationLabel}
                        </div>
                        <div
                          className="min-w-0 text-[12px] leading-5 text-text-title"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                          {renderHighlightedText(item.preview || ' ', highlightPattern)}
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
