import { memo } from 'react';
import type { LayoutMode, SvnRevisionInfo } from '@/types';
import { useI18n } from '@/context/i18n';
import { cssAlpha } from '@/theme/cssUtils';
import { extractDisplayName, extractVersionLabel } from '@/utils/diff/diffMeta';
import RevisionPicker from '@/components/navigation/RevisionPicker';
import RevisionLogHoverCard from '@/components/navigation/RevisionLogHoverCard';
import Tooltip from '@/components/shared/Tooltip';

interface SplitHeaderProps {
  baseName: string;
  mineName: string;
  baseTitle?: string;
  mineTitle?: string;
  baseValueLabel?: string;
  mineValueLabel?: string;
  layout: LayoutMode;
  isWorkbookMode: boolean;
  baseRevisionInfo?: SvnRevisionInfo | null;
  mineRevisionInfo?: SvnRevisionInfo | null;
  revisionOptions?: SvnRevisionInfo[] | null;
  canSwitchRevisions?: boolean;
  isLoadingRevisionOptions?: boolean;
  isSwitchingRevisions?: boolean;
  revisionHasMore?: boolean;
  revisionQueryDateTime?: string;
  revisionQueryError?: string;
  isLoadingMoreRevisions?: boolean;
  isSearchingRevisionDateTime?: boolean;
  onRevisionChange?: ((baseRevisionId: string, mineRevisionId: string) => void) | undefined;
  onOpenRevisionPicker?: (() => void) | undefined;
  onResetCompare?: (() => void) | undefined;
  canResetCompare?: boolean;
  onLoadMoreRevisions?: (() => void) | undefined;
  onRevisionDateTimeQuery?: ((value: string) => void) | undefined;
}

function buildRevisionLogText(info: SvnRevisionInfo | null) {
  const message = info?.message?.trim() ?? '';
  if (message) return message;
  return '';
}

const SplitHeader = memo(({
  baseName, mineName,
  baseTitle = '', mineTitle = '',
  baseValueLabel = '', mineValueLabel = '',
  layout, isWorkbookMode,
  baseRevisionInfo = null, mineRevisionInfo = null,
  revisionOptions = null, canSwitchRevisions = false,
  isLoadingRevisionOptions = false, isSwitchingRevisions = false,
  revisionHasMore = false, revisionQueryDateTime = '', revisionQueryError = '',
  isLoadingMoreRevisions = false, isSearchingRevisionDateTime = false,
  onRevisionChange, onOpenRevisionPicker, onResetCompare, canResetCompare = false,
  onLoadMoreRevisions, onRevisionDateTimeQuery,
}: SplitHeaderProps) => {
  const { t } = useI18n();
  const baseVersion = baseValueLabel.trim() || baseRevisionInfo?.revision || extractVersionLabel(baseName) || t('commonBase');
  const mineVersion = mineValueLabel.trim() || mineRevisionInfo?.revision || extractVersionLabel(mineName) || t('commonMine');
  const baseDisplayName = extractDisplayName(baseName);
  const mineDisplayName = extractDisplayName(mineName);
  const options = revisionOptions ?? [];

  const resolveAxisLabel = (side: 'base' | 'mine') => {
    if (isWorkbookMode && layout === 'unified') return side === 'base' ? t('splitHeaderAxisTop') : t('splitHeaderAxisBottom');
    if (layout === 'split-v') {
      if (isWorkbookMode) return side === 'base' ? t('splitHeaderAxisLeftColumn') : t('splitHeaderAxisRightColumn');
      return side === 'base' ? t('splitHeaderAxisTop') : t('splitHeaderAxisBottom');
    }
    return side === 'base' ? t('splitHeaderAxisLeftPane') : t('splitHeaderAxisRightPane');
  };

  const renderRoleBadge = (side: 'base' | 'mine') => {
    const accentVar = side === 'base' ? '--acc2' : '--accent';
    const glyphCls = side === 'base' ? 'size-1.5 rounded-[2px] rotate-45' : 'size-[7px] rounded-full';
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center size-3 min-w-3 rounded-full shrink-0 box-border"
        style={{ background: cssAlpha(side === 'base' ? 'acc2' : 'acc', '14'), border: `1px solid ${cssAlpha(side === 'base' ? 'acc2' : 'acc', '38')}` }}>
        <span className={`block ${glyphCls}`} style={{ background: `var(${accentVar})`, boxShadow: `0 0 0 1px ${cssAlpha(side === 'base' ? 'acc2' : 'acc', '22')}` }} />
      </span>
    );
  };

  const renderMeta = (info: SvnRevisionInfo | null, fallbackText: string, accent: string /* CSS var name e.g. '--acc2' */) => {
    const primaryLog = buildRevisionLogText(info);
    const primary = primaryLog || fallbackText.trim();
    if (!primary) return null;
    return (
      <RevisionLogHoverCard
        accent={accent}
        displayText={primary}
        detailText={primaryLog}
        author={info?.author ?? ''}
        date={info?.date ?? ''}
        revision={info?.revision ?? ''}
        muted={!primaryLog}
      />
    );
  };

  const renderStaticVersion = (label: string, accent: string /* CSS var name */) => (
    <Tooltip content={label} maxWidth={320}>
      <span className="inline-flex items-center gap-2 max-w-full min-w-0 px-2.5 h-7 rounded-full border border-border-default bg-bg-surface-hover shrink-0">
        <span className="text-[11px] font-bold font-ui whitespace-nowrap" style={{ color: `var(${accent})` }}>
          {t('splitHeaderVersionLabel')}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-title text-[13px] font-bold font-code">
          {label}
        </span>
      </span>
    </Tooltip>
  );

  const renderRevisionSelect = (side: 'base' | 'mine', info: SvnRevisionInfo | null) => {
    const otherId = side === 'base' ? mineRevisionInfo?.id ?? '' : baseRevisionInfo?.id ?? '';
    return (
      <RevisionPicker
        align={side === 'base' ? 'left' : 'right'}
        accent={side === 'base' ? '--acc2' : '--accent'}
        title={side === 'base' ? baseTitle : mineTitle}
        value={info}
        options={options}
        disabled={isSwitchingRevisions}
        isLoading={isLoadingRevisionOptions && options.length === 0}
        hasMore={revisionHasMore}
        isLoadingMore={isLoadingMoreRevisions}
        queryDateTime={revisionQueryDateTime}
        queryError={revisionQueryError}
        isSearchingDateTime={isSearchingRevisionDateTime}
        onOpen={onOpenRevisionPicker}
        onChange={(nextId) => {
          if (!nextId) return;
          if (side === 'base') { onRevisionChange?.(nextId, otherId || mineRevisionInfo?.id || nextId); return; }
          onRevisionChange?.(otherId || baseRevisionInfo?.id || nextId, nextId);
        }}
        onLoadMore={onLoadMoreRevisions}
        onQueryDateTime={onRevisionDateTimeQuery}
      />
    );
  };

  const headerSide = (
    side: 'base' | 'mine', axis: string, title: string, name: string,
    version: string, info: SvnRevisionInfo | null, divider = false,
  ) => {
    const accent = side === 'base' ? '--acc2' : '--accent';
    const hasRevisionSwitch = canSwitchRevisions && Boolean(onRevisionChange);
    const normalizedVersion = version.trim();
    const staticVersionLabel = (
      normalizedVersion && normalizedVersion !== t('commonBase') && normalizedVersion !== t('commonMine')
    ) ? normalizedVersion : t('splitHeaderVersionUnknown');

    return (
      <div
        className="grid gap-1.5 min-w-0 p-[8px_14px_9px] min-h-[58px] bg-transparent border-t border-border-default"
        style={{ borderLeft: divider ? `1px solid var(--border-color)` : 'none' }}>
        <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
          <div className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full border border-border-default bg-bg-surface-hover font-ui text-[13px] font-bold whitespace-nowrap"
              style={{ color: `var(${accent})` }}>
              {renderRoleBadge(side)}
              {title}
            </span>
            {side === 'base' && onResetCompare && (
              <button
                type="button"
                onClick={onResetCompare}
                disabled={!canResetCompare || isSwitchingRevisions}
                className={`
                  inline-flex items-center h-7 px-2.5 rounded-full
                  border border-border-default bg-bg-surface-hover
                  font-ui text-[11px] font-bold whitespace-nowrap
                  ${canResetCompare && !isSwitchingRevisions ? 'text-text-primary cursor-pointer hover:border-accent hover:text-accent' : 'text-text-secondary cursor-default'}
                  transition-all duration-150
                `}>
                {t('revisionPickerReset')}
              </button>
            )}
            <span className="inline-flex items-center h-7 px-2.5 rounded-full border border-border-default bg-bg-surface-hover text-text-secondary font-ui text-[11px] font-semibold whitespace-nowrap">
              {axis}
            </span>
          </div>
          {hasRevisionSwitch
            ? renderRevisionSelect(side, info)
            : renderStaticVersion(staticVersionLabel, accent)}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center min-w-0 flex-1 min-h-7 pl-1">
            {renderMeta(info, name || title, accent) ?? (
              <Tooltip content={name || title} maxWidth={320}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary text-[11px] font-ui">
                  {name || title}
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-0 p-0 w-full min-w-0 border-b border-border-default shrink-0 bg-bg-surface">
      <div className="min-w-0">
        {headerSide('base', resolveAxisLabel('base'), baseTitle, baseDisplayName, baseVersion, baseRevisionInfo, false)}
      </div>
      <div className="min-w-0">
        {headerSide('mine', resolveAxisLabel('mine'), mineTitle, mineDisplayName, mineVersion, mineRevisionInfo, true)}
      </div>
    </div>
  );
});

export default SplitHeader;
