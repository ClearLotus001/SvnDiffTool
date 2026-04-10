// src/components/StatsBar.tsx
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/context/i18n';
import type { TextDiffPresentation, TextLineSelectionSummary, WorkbookArtifactDiff, WorkbookCompareMode } from '@/types';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import Tooltip from '@/components/shared/Tooltip';
import {
  resolveDiffIndicatorCssPalette,
  type DiffIndicatorCssPalette,
} from '@/utils/diff/diffIndicatorVisuals';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import { summarizeWorkbookSectionChanges } from '@/utils/workbook/workbookSections';

interface StatsBarProps {
  textDiffPresentation: TextDiffPresentation;
  baseName: string;
  mineName: string;
  baseTitle: string;
  mineTitle: string;
  fileName: string;
  totalLines: number;
  baseVersionLabel: string;
  mineVersionLabel: string;
  isWorkbookMode?: boolean;
  workbookCompareMode?: WorkbookCompareMode;
  workbookArtifactDiff?: WorkbookArtifactDiff | null;
  workbookSections?: WorkbookSection[];
  lineSelectionSummary?: TextLineSelectionSummary | null;
}

const SCROLL_RAIL_CLASS = 'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

const Dot = ({ color }: { color: string }) => (
  <span className="size-[7px] rounded-full block shrink-0" style={{ background: color }} />
);

const RoleBadge = ({ side, accent }: { side: 'base' | 'mine'; accent: string }) => {
  const glyphCls = side === 'base'
    ? 'size-1.5 rounded-[3px] rotate-45'
    : 'size-[7px] rounded-full';

  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center size-3 min-w-3 rounded-full shrink-0 box-border"
      style={{
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
      }}>
      <span
        className={`block ${glyphCls}`}
        style={{
          background: accent,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 13%, transparent)`,
        }}
      />
    </span>
  );
};

const StatsBar = memo(({
  textDiffPresentation,
  baseName,
  mineName,
  baseTitle,
  mineTitle,
  fileName,
  totalLines,
  baseVersionLabel,
  mineVersionLabel,
  isWorkbookMode = false,
  workbookCompareMode = 'strict',
  workbookArtifactDiff = null,
  workbookSections = [],
  lineSelectionSummary = null,
}: StatsBarProps) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTrailingFade, setShowTrailingFade] = useState(false);

  const stats = useMemo(() => textDiffPresentation.stats, [textDiffPresentation]);
  const workbookSectionSummary = useMemo(
    () => summarizeWorkbookSectionChanges(workbookSections),
    [workbookSections],
  );
  const fileTypeLabel = isWorkbookMode ? t('commonTableFile') : t('toolbarFileLabel');
  const addedPalette = resolveDiffIndicatorCssPalette('add');
  const deletedPalette = resolveDiffIndicatorCssPalette('delete');
  const modifiedPalette = resolveDiffIndicatorCssPalette('modify');

  useEffect(() => {
    const root = rootRef.current;
    const el = scrollRef.current;
    if (!root || !el) return;

    const syncTrailingFade = () => {
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setShowTrailingFade(maxScrollLeft > 2 && el.scrollLeft < maxScrollLeft - 2);
    };

    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0 || el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      el.scrollLeft += delta;
    };

    const onScroll = () => {
      syncTrailingFade();
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          syncTrailingFade();
        })
      : null;

    syncTrailingFade();
    root.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });
    resizeObserver?.observe(el);
    if (el.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(el.firstElementChild);
    }

    return () => {
      root.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
    };
  }, []);

  const metric = (
    palette: DiffIndicatorCssPalette,
    value: string,
    label: string,
    tooltip?: ReactNode,
  ) => {
    const node = (
      <div
        className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full border shrink-0 leading-none whitespace-nowrap"
        style={{
          background: palette.background,
          borderColor: palette.accent,
          boxShadow: `0 10px 18px -20px ${palette.shadow}`,
        }}>
        <Dot color={palette.accent} />
        <span className="font-code text-[13px]" style={{ color: palette.text }}>{value}</span>
        <span className="font-ui text-[13px]" style={{ color: palette.text }}>{label}</span>
      </div>
    );
    return tooltip ? <Tooltip content={tooltip} maxWidth={320}>{node}</Tooltip> : node;
  };

  const metaPill = (
    label: string,
    value: string,
    accent: string,
    tooltip?: string,
    side?: 'base' | 'mine',
  ) => (
    <Tooltip content={tooltip ?? value} maxWidth={360}>
      <div className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full bg-bg-surface-hover border border-border-default shrink-0 whitespace-nowrap">
        {side && <RoleBadge side={side} accent={accent} />}
        <span
          className="text-[11px] font-bold tracking-wider uppercase whitespace-nowrap font-ui"
          style={{ color: accent }}>
          {label}
        </span>
        <span className="text-text-title text-[13px] font-semibold whitespace-nowrap font-ui">
          {value}
        </span>
      </div>
    </Tooltip>
  );

  return (
    <div
      ref={rootRef}
      className="
        bg-bg-surface-solid border-t border-border-default
        min-h-[38px] shrink-0 w-full min-w-0
        text-[13px] text-text-secondary font-ui relative z-[18]
        overflow-hidden
      "
      style={{ boxShadow: `0 -1px 0 var(--border-color), 0 -10px 24px -24px var(--border-strong)` }}>
      <div className="flex items-center gap-3 min-w-0 py-1.5 px-2.5">
        <div className="relative flex-1 min-w-0">
          <div
            ref={scrollRef}
            className={`flex-1 min-w-0 ${SCROLL_RAIL_CLASS}`}>
            <div className="inline-flex items-center gap-2 min-w-max pr-1">
              {metric(addedPalette, `+${stats.add + stats.chg}`, t('statsAdded'))}
              {metric(deletedPalette, `-${stats.del + stats.chg}`, t('statsRemoved'))}
              {metric(modifiedPalette, `~${stats.chg}`, t('statsModified'))}

              {fileName && metaPill(fileTypeLabel, fileName, cssVar('acc2'))}
              {isWorkbookMode && (
                <Tooltip
                  content={workbookCompareMode === 'strict'
                    ? t('toolbarCompareModeStrictTitle')
                    : t('toolbarCompareModeContentTitle')}
                  maxWidth={360}>
                  <div
                    className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full border shrink-0 whitespace-nowrap"
                    style={{
                      background: workbookCompareMode === 'strict' ? cssAlpha('acc2', '10') : undefined,
                      borderColor: workbookCompareMode === 'strict' ? cssAlpha('acc2', '40') : undefined,
                    }}>
                    <Dot color={workbookCompareMode === 'strict' ? cssVar('acc2') : cssVar('t2')} />
                    <span
                      className="text-[11px] font-bold whitespace-nowrap font-ui"
                      style={{ color: workbookCompareMode === 'strict' ? cssVar('acc2') : cssVar('t1') }}>
                      {workbookCompareMode === 'strict'
                        ? t('toolbarCompareModeStrict')
                        : t('toolbarCompareModeContent')}
                    </span>
                  </div>
                </Tooltip>
              )}
              {isWorkbookMode && workbookSectionSummary.added > 0 && metric(
                addedPalette,
                `+${workbookSectionSummary.added}`,
                t('statsWorkbookSheetsAdded'),
                t('statsWorkbookSheetsAddedHint', { count: workbookSectionSummary.added }),
              )}
              {isWorkbookMode && workbookSectionSummary.deleted > 0 && metric(
                deletedPalette,
                `-${workbookSectionSummary.deleted}`,
                t('statsWorkbookSheetsDeleted'),
                t('statsWorkbookSheetsDeletedHint', { count: workbookSectionSummary.deleted }),
              )}
              {isWorkbookMode && workbookSectionSummary.renamed > 0 && metric(
                modifiedPalette,
                `→${workbookSectionSummary.renamed}`,
                t('statsWorkbookSheetsRenamed'),
                t('statsWorkbookSheetsRenamedHint', { count: workbookSectionSummary.renamed }),
              )}
              {isWorkbookMode && workbookArtifactDiff?.hasArtifactOnlyDiff && (
                <Tooltip
                  content={(
                    <>
                      <div>{t('statsArtifactOnlyDiffHintPrimary')}</div>
                      <div className="mt-1.5 text-text-secondary">
                        {t('statsArtifactOnlyDiffHintSecondary')}
                      </div>
                    </>
                  )}
                  maxWidth={360}>
                  <div className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full bg-bg-surface-hover border border-border-strong shrink-0 whitespace-nowrap">
                    <Dot color={cssVar('t2')} />
                    <span className="text-[11px] text-text-secondary font-bold whitespace-nowrap font-ui">
                      {t('statsArtifactOnlyDiffLabel')}
                    </span>
                  </div>
                </Tooltip>
              )}
              {metaPill(baseTitle, baseVersionLabel, cssVar('acc2'), baseName, 'base')}
              {metaPill(mineTitle, mineVersionLabel, cssVar('acc'), mineName, 'mine')}
              {lineSelectionSummary && (
                <Tooltip
                  content={t('statsLineSelectionHint')}
                  maxWidth={320}>
                  <div className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full border border-border-default bg-bg-surface-hover shrink-0 whitespace-nowrap">
                    <Dot color={cssVar('acc2')} />
                    <span className="text-[11px] font-bold whitespace-nowrap font-ui" style={{ color: cssVar('acc2') }}>
                      {t('statsLineSelectionLabel', { count: lineSelectionSummary.count })}
                    </span>
                    {lineSelectionSummary.rangeLabel && (
                      <span className="text-text-title text-[12px] font-semibold whitespace-nowrap font-code">
                        {lineSelectionSummary.rangeLabel}
                      </span>
                    )}
                  </div>
                </Tooltip>
              )}
            </div>
          </div>

          {showTrailingFade && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 right-0 w-12"
              style={{
                background: `linear-gradient(90deg, ${cssAlpha('bg1', '00')} 0%, ${cssAlpha('bg1', 'cc')} 56%, ${cssVar('bg1')} 100%)`,
                boxShadow: `inset -1px 0 0 ${cssAlpha('border', '66')}`,
              }}
            />
          )}
        </div>

        <div className="inline-flex items-center justify-end gap-2 shrink-0 min-w-0 ml-auto pl-3 border-l border-border-default text-right">
          <span className="whitespace-nowrap font-ui text-[13px] text-text-title font-semibold shrink-0">
            {t('statsLines', { count: totalLines })}
          </span>
          <span aria-hidden="true" className="size-1 rounded-full bg-border-strong shrink-0" />
          <Tooltip content={t('statsHints')} maxWidth={420}>
            <span className="max-w-[42vw] overflow-hidden text-ellipsis whitespace-nowrap font-ui text-[12px] text-text-secondary cursor-default text-right">
              {t('statsHints')}
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

export default StatsBar;
