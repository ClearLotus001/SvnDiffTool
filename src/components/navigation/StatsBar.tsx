// src/components/StatsBar.tsx
import { memo, useMemo, type ReactNode } from 'react';
import { useI18n } from '@/context/i18n';
import type { TextDiffPresentation, WorkbookArtifactDiff, WorkbookCompareMode } from '@/types';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import Tooltip from '@/components/shared/Tooltip';
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
}

const Dot = ({ c }: { c: string }) => (
  <span className="size-[7px] rounded-full block shrink-0" style={{ background: c }} />
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
}: StatsBarProps) => {
  const { t } = useI18n();

  const stats = useMemo(() => textDiffPresentation.stats, [textDiffPresentation]);
  const workbookSectionSummary = useMemo(
    () => summarizeWorkbookSectionChanges(workbookSections),
    [workbookSections],
  );

  const metric = (color: string, value: string, label: string, tooltip?: ReactNode) => {
    const node = (
      <div className="inline-flex items-center gap-1.5 shrink-0 leading-none">
        <Dot c={color} />
        <span className="font-code text-[13px]" style={{ color }}>{value}</span>
        <span className="text-text-secondary font-ui text-[13px]">{label}</span>
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
      <div className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full bg-bg-surface-hover border border-border-default shrink-0">
        {side && <RoleBadge side={side} accent={accent} />}
        <span
          className="text-[11px] font-bold tracking-wider uppercase whitespace-nowrap font-ui"
          style={{ color: accent }}>
          {label}
        </span>
        <span className="text-text-title text-[13px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px] font-ui">
          {value}
        </span>
      </div>
    </Tooltip>
  );

  return (
    <div
      className="
        bg-bg-surface-solid border-t border-border-default
        min-h-[30px] flex items-center gap-2.5 py-1 px-2.5 shrink-0
        w-full min-w-0 text-[13px] text-text-secondary
        overflow-x-auto font-ui relative z-[18]
      "
      style={{ boxShadow: `0 -1px 0 var(--border-color), 0 -10px 24px -24px var(--border-strong)` }}>
      {metric(cssVar('addTx'), `+${stats.add + stats.chg}`, t('statsAdded'))}
      {metric(cssVar('delTx'), `-${stats.del + stats.chg}`, t('statsRemoved'))}
      {metric(cssVar('chgTx'), `~${stats.chg}`, t('statsModified'))}

      {fileName && metaPill(t('commonTableFile'), fileName, cssVar('acc2'))}
      {isWorkbookMode && (
        <Tooltip
          content={workbookCompareMode === 'strict'
            ? t('toolbarCompareModeStatusStrictHint')
            : t('toolbarCompareModeStatusContentHint')}
          maxWidth={360}>
          <div
            className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full border shrink-0"
            style={{
              background: workbookCompareMode === 'strict' ? cssAlpha('acc2', '10') : undefined,
              borderColor: workbookCompareMode === 'strict' ? cssAlpha('acc2', '40') : undefined,
            }}>
            <Dot c={workbookCompareMode === 'strict' ? cssVar('acc2') : cssVar('t2')} />
            <span
              className="text-[11px] font-bold whitespace-nowrap font-ui"
              style={{ color: workbookCompareMode === 'strict' ? cssVar('acc2') : cssVar('t1') }}>
              {workbookCompareMode === 'strict'
                ? t('toolbarCompareModeStatusStrict')
                : t('toolbarCompareModeStatusContent')}
            </span>
          </div>
        </Tooltip>
      )}
      {isWorkbookMode && workbookSectionSummary.added > 0 && metric(
        cssVar('addTx'),
        `+${workbookSectionSummary.added}`,
        t('statsWorkbookSheetsAdded'),
        t('statsWorkbookSheetsAddedHint', { count: workbookSectionSummary.added }),
      )}
      {isWorkbookMode && workbookSectionSummary.deleted > 0 && metric(
        cssVar('delTx'),
        `-${workbookSectionSummary.deleted}`,
        t('statsWorkbookSheetsDeleted'),
        t('statsWorkbookSheetsDeletedHint', { count: workbookSectionSummary.deleted }),
      )}
      {isWorkbookMode && workbookSectionSummary.renamed > 0 && metric(
        cssVar('chgTx'),
        `↦${workbookSectionSummary.renamed}`,
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
          <div className="inline-flex items-center gap-1.5 min-w-0 py-0.5 px-2 rounded-full bg-bg-surface-hover border border-border-strong shrink-0">
            <Dot c={cssVar('t2')} />
            <span className="text-[11px] text-text-secondary font-bold whitespace-nowrap font-ui">
              {t('statsArtifactOnlyDiffLabel')}
            </span>
          </div>
        </Tooltip>
      )}
      {metaPill(baseTitle, baseVersionLabel, cssVar('acc2'), baseName, 'base')}
      {metaPill(mineTitle, mineVersionLabel, cssVar('acc'), mineName, 'mine')}

      <div className="flex-1" />
      <span className="whitespace-nowrap font-ui text-[13px]">{t('statsLines', { count: totalLines })}</span>
      <span className="text-border-strong">|</span>
      <span className="whitespace-nowrap font-ui text-[13px]">{t('statsHints')}</span>
    </div>
  );
});

export default StatsBar;
