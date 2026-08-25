import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Copy } from 'lucide-react';
import type { ComparisonSourceKind, LayoutMode, SvnRevisionInfo } from '@/types';
import { useI18n } from '@/context/i18n';
import { TEXT_DIFF_MINIMAP_WIDTH } from '@/constants/layout';
import { useAppStore } from '@/store/appStore';
import { cssAlpha } from '@/theme/cssUtils';
import { extractDisplayName, extractVersionLabel } from '@/utils/diff/diffMeta';
import { shouldSkipSameRevisionCompare } from '@/utils/navigation/revisionCompareSelection';
import RevisionPicker from '@/components/navigation/RevisionPicker';
import RevisionLogHoverCard from '@/components/navigation/RevisionLogHoverCard';
import Tooltip from '@/components/shared/Tooltip';
import PathTooltip from '@/components/shared/PathTooltip';

const HEADER_STATUS_TAG_CLASS = 'inline-flex items-center h-5 px-1.5 rounded-[5px] whitespace-nowrap box-border border';
const HEADER_TOOLBAR_TEXT_STRONG_CLASS = 'font-ui text-[10px] font-bold leading-none';
const HEADER_TOOLBAR_TEXT_INNER_CLASS = 'inline-flex items-center h-full leading-none';
const HEADER_TOOLBAR_VALUE_INNER_CLASS = 'inline-flex items-center h-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-ui text-[10px] font-semibold leading-none tracking-[-0.01em]';

interface SplitHeaderProps {
  baseName: string;
  mineName: string;
  baseTitle?: string;
  mineTitle?: string;
  baseValueLabel?: string;
  mineValueLabel?: string;
  isTwoFileCompare?: boolean;
  layout: LayoutMode;
  isWorkbookMode: boolean;
  baseRevisionInfo?: SvnRevisionInfo | null;
  mineRevisionInfo?: SvnRevisionInfo | null;
  baseSourceKind?: ComparisonSourceKind | null;
  mineSourceKind?: ComparisonSourceKind | null;
  revisionOptions?: SvnRevisionInfo[] | null;
  canSwitchRevisions?: boolean;
  canSwitchBaseRevision?: boolean;
  canSwitchMineRevision?: boolean;
  isLoadingRevisionOptions?: boolean;
  isSwitchingRevisions?: boolean;
  revisionHasMore?: boolean;
  revisionQueryDateTime?: string;
  revisionQueryError?: string;
  isLoadingMoreRevisions?: boolean;
  isSearchingRevisionDateTime?: boolean;
  onRevisionChange?: ((baseRevisionId: string, mineRevisionId: string) => void) | undefined;
  onOpenRevisionPicker?: ((side: 'base' | 'mine') => void) | undefined;
  onResetCompare?: (() => void) | undefined;
  canResetCompare?: boolean;
  onLoadMoreRevisions?: ((side: 'base' | 'mine') => void) | undefined;
  onRevisionDateTimeQuery?: ((side: 'base' | 'mine', value: string) => void) | undefined;
  onBaseCopy?: (() => Promise<boolean> | boolean | void) | undefined;
  onMineCopy?: (() => Promise<boolean> | boolean | void) | undefined;
  onSwapSides?: (() => void) | undefined;
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
  isTwoFileCompare = false,
  layout, isWorkbookMode,
  baseRevisionInfo = null, mineRevisionInfo = null,
  baseSourceKind = null, mineSourceKind = null,
  revisionOptions = null, canSwitchRevisions = false,
  canSwitchBaseRevision = canSwitchRevisions,
  canSwitchMineRevision = canSwitchRevisions,
  isLoadingRevisionOptions = false, isSwitchingRevisions = false,
  revisionHasMore = false, revisionQueryDateTime = '', revisionQueryError = '',
  isLoadingMoreRevisions = false, isSearchingRevisionDateTime = false,
  onRevisionChange, onOpenRevisionPicker, onResetCompare, canResetCompare = false,
  onLoadMoreRevisions, onRevisionDateTimeQuery,
  onBaseCopy, onMineCopy, onSwapSides,
}: SplitHeaderProps) => {
  const { t } = useI18n();
  const textSplitHeaderRatio = useAppStore((s) => s.textSplitHeaderRatio);
  const copyTimerRef = useRef<number | null>(null);
  const [copiedSide, setCopiedSide] = useState<'base' | 'mine' | null>(null);
  const [sameRevisionNoticeSide, setSameRevisionNoticeSide] = useState<'base' | 'mine' | null>(null);
  const baseVersion = baseValueLabel.trim() || baseRevisionInfo?.revision || extractVersionLabel(baseName) || t('commonBase');
  const mineVersion = mineValueLabel.trim() || mineRevisionInfo?.revision || extractVersionLabel(mineName) || t('commonMine');
  const baseDisplayName = isTwoFileCompare ? baseName.trim() : extractDisplayName(baseName);
  const mineDisplayName = isTwoFileCompare ? mineName.trim() : extractDisplayName(mineName);
  const options = revisionOptions ?? [];
  const horizontalSplitHeader = layout === 'split-h' && !isWorkbookMode;
  const resolvedSplitRatio = horizontalSplitHeader
    ? Math.max(0.2, Math.min(0.8, textSplitHeaderRatio || 0.5))
    : 0.5;

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

  const renderStaticVersion = (
    side: 'base' | 'mine',
    label: string,
    tooltip: string,
    accent: string /* CSS var name */,
  ) => {
    const node = (
      <span
        data-testid={`static-version-${side}`}
        className={`${HEADER_STATUS_TAG_CLASS} ${HEADER_TOOLBAR_TEXT_STRONG_CLASS} gap-1 max-w-full min-w-0 shrink-0`}
        style={{
          borderColor: `color-mix(in srgb, var(${accent}) 30%, var(--border-color) 70%)`,
          background: `color-mix(in srgb, var(${accent}) 9%, var(--bg-surface-solid) 91%)`,
        }}>
        <span className={`${HEADER_TOOLBAR_TEXT_INNER_CLASS} ${HEADER_TOOLBAR_TEXT_STRONG_CLASS} whitespace-nowrap`} style={{ color: `var(${accent})` }}>
          {isTwoFileCompare ? t('toolbarFileLabel') : t('splitHeaderVersionLabel')}
        </span>
        <span className={`${HEADER_TOOLBAR_VALUE_INNER_CLASS} text-text-title`}>
          {label}
        </span>
      </span>
    );
    return isTwoFileCompare
      ? <PathTooltip path={tooltip || label}>{node}</PathTooltip>
      : <Tooltip content={tooltip || label} maxWidth={520}>{node}</Tooltip>;
  };

  const renderSourceBadge = (
    side: 'base' | 'mine',
    sourceKind: ComparisonSourceKind | null,
  ) => {
    if (sourceKind !== 'git' && sourceKind !== 'svn') return null;
    const label = sourceKind === 'git' ? 'GIT' : 'SVN';
    const tooltip = sourceKind === 'git'
      ? t('splitHeaderGitRepository')
      : t('splitHeaderSvnRepository');
    const color = sourceKind === 'git' ? '#f05a3c' : '#6f91bd';
    return (
      <Tooltip content={tooltip}>
        <span
          data-testid={`source-badge-${side}`}
          aria-label={tooltip}
          className={`${HEADER_STATUS_TAG_CLASS} min-w-8 justify-center shrink-0 font-code text-[10px] font-bold leading-none tracking-[0.06em]`}
          style={{
            color,
            borderColor: `color-mix(in srgb, ${color} 42%, var(--border-color) 58%)`,
            background: `color-mix(in srgb, ${color} 11%, var(--bg-surface-solid) 89%)`,
          }}>
          {label}
        </span>
      </Tooltip>
    );
  };

  const renderAuthorBadge = (info: SvnRevisionInfo | null, accent: string) => {
    const author = info?.author.trim() ?? '';
    if (!author) return null;
    return (
      <span
        data-testid="revision-author-tag"
        className={`${HEADER_STATUS_TAG_CLASS} max-w-32 shrink-0 font-ui text-[10px] font-semibold leading-none`}
        style={{
          color: `color-mix(in srgb, var(${accent}) 82%, var(--text-title) 18%)`,
          borderColor: `color-mix(in srgb, var(${accent}) 24%, var(--border-color) 76%)`,
          background: `color-mix(in srgb, var(${accent}) 7%, var(--bg-surface-solid) 93%)`,
        }}>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{author}</span>
      </span>
    );
  };

  const renderRevisionSelect = (side: 'base' | 'mine', info: SvnRevisionInfo | null) => {
    const otherId = side === 'base' ? mineRevisionInfo?.id ?? '' : baseRevisionInfo?.id ?? '';
    return (
      <RevisionPicker
        align={side === 'base' ? 'left' : 'right'}
        accent={side === 'base' ? '--version-base' : '--version-mine'}
        title={side === 'base' ? baseTitle : mineTitle}
        value={info}
        options={options}
        disabled={isSwitchingRevisions}
        isLoading={isLoadingRevisionOptions && options.length === 0}
        hasMore={revisionHasMore}
        isLoadingMore={isLoadingMoreRevisions}
        queryDateTime={revisionQueryDateTime}
        queryError={revisionQueryError}
        showSameRevisionNotice={sameRevisionNoticeSide === side}
        isSearchingDateTime={isSearchingRevisionDateTime}
        onOpen={() => {
          setSameRevisionNoticeSide(null);
          onOpenRevisionPicker?.(side);
        }}
        onChange={(nextId) => {
          if (!nextId) return;
          const nextBaseId = side === 'base'
            ? nextId
            : otherId || baseRevisionInfo?.id || nextId;
          const nextMineId = side === 'mine'
            ? nextId
            : otherId || mineRevisionInfo?.id || nextId;
          if (shouldSkipSameRevisionCompare(isTwoFileCompare, nextBaseId, nextMineId)) {
            setSameRevisionNoticeSide(side);
            return false;
          }
          setSameRevisionNoticeSide(null);
          onRevisionChange?.(nextBaseId, nextMineId);
          return true;
        }}
        onLoadMore={() => onLoadMoreRevisions?.(side)}
        onQueryDateTime={(value) => onRevisionDateTimeQuery?.(side, value)}
      />
    );
  };

  useEffect(() => () => {
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  const handleCopyClick = useCallback(async (side: 'base' | 'mine') => {
    const handler = side === 'base' ? onBaseCopy : onMineCopy;
    if (!handler) return;
    const result = await Promise.resolve(handler());
    if (result === false) return;
    setCopiedSide(side);
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedSide((current) => (current === side ? null : current));
      copyTimerRef.current = null;
    }, 1200);
  }, [onBaseCopy, onMineCopy]);

  const renderCopyButton = (side: 'base' | 'mine', version: string) => {
    const onCopy = side === 'base' ? onBaseCopy : onMineCopy;
    if (!onCopy) return null;
    const accent = side === 'base' ? '--version-base' : '--version-mine';
    const accentKey = side === 'base' ? 'versionBase' : 'versionMine';
    const copied = copiedSide === side;
    const tooltip = side === 'base'
      ? `${t('copyFullBaseTitle')} · ${version}`
      : `${t('copyFullMineTitle')} · ${version}`;

    return (
      <Tooltip content={tooltip}>
        <button
          type="button"
          onClick={() => { void handleCopyClick(side); }}
          aria-label={tooltip}
          className="
            size-6 rounded-md
            inline-flex items-center justify-center
            border cursor-pointer shrink-0
            transition-all duration-150
            hover:border-border-strong hover:bg-bg-surface-hover
            active:translate-y-0 active:scale-[0.98]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35
          "
          style={{
            borderColor: copied ? cssAlpha(accentKey, '44') : cssAlpha(accentKey, '22'),
            background: copied
              ? `color-mix(in srgb, var(${accent}) 12%, var(--bg-surface-hover) 88%)`
              : `color-mix(in srgb, var(${accent}) 4%, var(--bg-surface-solid) 96%)`,
            color: copied ? `var(${accent})` : cssAlpha(accentKey, 'c8'),
            boxShadow: copied ? `0 8px 16px -18px ${cssAlpha(accentKey, '28')}` : 'none',
          }}>
          {copied
            ? <Check size={11} strokeWidth={2.5} />
            : <Copy size={11} strokeWidth={2.2} />}
        </button>
      </Tooltip>
    );
  };

  const headerSide = (
    side: 'base' | 'mine', title: string, name: string,
    version: string, info: SvnRevisionInfo | null, sourceKind: ComparisonSourceKind | null,
    divider = false,
  ) => {
    const accent = side === 'base' ? '--version-base' : '--version-mine';
    const sideCanSwitch = side === 'base' ? canSwitchBaseRevision : canSwitchMineRevision;
    const hasRevisionSwitch = canSwitchRevisions && sideCanSwitch && Boolean(onRevisionChange);
    const normalizedVersion = version.trim();
    const staticVersionLabel = (
      normalizedVersion && normalizedVersion !== t('commonBase') && normalizedVersion !== t('commonMine')
    ) ? normalizedVersion : t('splitHeaderVersionUnknown');

    return (
      <div
        data-split-header-side={side}
        className="flex items-center gap-3 min-w-0 p-[7px_14px] min-h-[42px] bg-transparent border-t border-border-default"
        style={{
          borderLeft: divider ? `1px solid var(--border-color)` : 'none',
          paddingRight: side === 'base' && onSwapSides ? 28 : 14,
          paddingLeft: side === 'mine' && onSwapSides ? 28 : 14,
        }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renderSourceBadge(side, sourceKind)}
          {renderAuthorBadge(info, accent)}
          <div className="flex items-center min-w-0 flex-1 min-h-7">
            {isTwoFileCompare && !buildRevisionLogText(info) ? (
              <PathTooltip path={name || title}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary text-[11px] font-code">
                  {name || title}
                </span>
              </PathTooltip>
            ) : (renderMeta(info, name || title, accent) ?? (
              <Tooltip content={name || title} maxWidth={320}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary text-[11px] font-ui">
                  {name || title}
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 min-w-0 shrink-0">
          {side === 'base' && onResetCompare && (
            <button
              type="button"
              data-testid="reset-compare-tag"
              onClick={onResetCompare}
              disabled={!canResetCompare || isSwitchingRevisions}
              className={`
                ${HEADER_STATUS_TAG_CLASS}
                ${HEADER_TOOLBAR_TEXT_STRONG_CLASS}
                ${canResetCompare && !isSwitchingRevisions ? 'text-text-primary cursor-pointer hover:text-accent hover:brightness-110' : 'text-text-secondary cursor-default'}
                transition-all duration-150
              `}
              style={{
                borderColor: `color-mix(in srgb, var(${accent}) 20%, var(--border-color) 80%)`,
                background: `color-mix(in srgb, var(${accent}) 5%, var(--bg-surface-solid) 95%)`,
              }}>
              <span className={HEADER_TOOLBAR_TEXT_INNER_CLASS}>{t('revisionPickerReset')}</span>
            </button>
          )}
          {hasRevisionSwitch
            ? renderRevisionSelect(side, info)
            : renderStaticVersion(side, staticVersionLabel, name || staticVersionLabel, accent)}
          {renderCopyButton(side, normalizedVersion || staticVersionLabel)}
        </div>
      </div>
    );
  };

  const pairedHeader = (
    <div
      className="relative grid gap-0 min-w-0"
      style={{
        gridTemplateColumns: horizontalSplitHeader
          ? `minmax(0, ${(resolvedSplitRatio * 100).toFixed(3)}%) minmax(0, ${((1 - resolvedSplitRatio) * 100).toFixed(3)}%)`
          : 'minmax(0, 1fr) minmax(0, 1fr)',
      }}>
      <div className="min-w-0">
        {headerSide('base', baseTitle, baseDisplayName, baseVersion, baseRevisionInfo, baseSourceKind, false)}
      </div>
      <div className="min-w-0">
        {headerSide('mine', mineTitle, mineDisplayName, mineVersion, mineRevisionInfo, mineSourceKind, true)}
      </div>
      {onSwapSides && (
        <Tooltip
          content={t('splitHeaderSwapSides')}
          anchorStyle={{
            position: 'absolute',
            left: `${(resolvedSplitRatio * 100).toFixed(3)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
          }}>
          <button
            type="button"
            data-testid="split-header-swap"
            aria-label={t('splitHeaderSwapSides')}
            disabled={isSwitchingRevisions}
            onClick={onSwapSides}
            className="size-7 rounded-full border border-border-strong bg-bg-surface-solid text-text-primary inline-flex items-center justify-center cursor-pointer shadow-[0_6px_18px_-10px_var(--border-strong)] transition-[color,background,border-color,box-shadow,transform] duration-150 hover:text-accent hover:border-accent/50 hover:shadow-[0_8px_22px_-11px_var(--accent)] active:scale-95 disabled:opacity-45 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
            <ArrowLeftRight size={13} strokeWidth={2.25} />
          </button>
        </Tooltip>
      )}
    </div>
  );

  return horizontalSplitHeader ? (
    <div
      className="relative z-40 grid gap-0 p-0 w-full min-w-0 border-b border-border-default shrink-0 overflow-visible bg-bg-surface"
      style={{ gridTemplateColumns: `minmax(0, 1fr) ${TEXT_DIFF_MINIMAP_WIDTH}px` }}>
      <div className="min-w-0">
        {pairedHeader}
      </div>
      <div aria-hidden="true" className="min-w-0 border-l border-border-default bg-bg-surface" />
    </div>
  ) : (
    <div className="relative z-40 grid gap-0 p-0 w-full min-w-0 border-b border-border-default shrink-0 overflow-visible bg-bg-surface">
      {pairedHeader}
    </div>
  );
});

export default SplitHeader;
