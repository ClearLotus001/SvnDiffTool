import { memo } from 'react';
import type { LayoutMode, SvnRevisionInfo } from '../types';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import { extractDisplayName, extractVersionLabel } from '../utils/diffMeta';
import RevisionPicker from './RevisionPicker';
import RevisionLogHoverCard from './RevisionLogHoverCard';
import Tooltip from './Tooltip';

interface SplitHeaderProps {
  baseName: string;
  mineName: string;
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
  onLoadMoreRevisions?: (() => void) | undefined;
  onRevisionDateTimeQuery?: ((value: string) => void) | undefined;
}

function buildRevisionLogText(info: SvnRevisionInfo | null) {
  const message = info?.message?.trim() ?? '';
  if (message) return message;
  const title = info?.title?.trim() ?? '';
  if (title && title !== info?.revision) return title;
  return '';
}

const SplitHeader = memo(({
  baseName,
  mineName,
  layout,
  isWorkbookMode,
  baseRevisionInfo = null,
  mineRevisionInfo = null,
  revisionOptions = null,
  canSwitchRevisions = false,
  isLoadingRevisionOptions = false,
  isSwitchingRevisions = false,
  revisionHasMore = false,
  revisionQueryDateTime = '',
  revisionQueryError = '',
  isLoadingMoreRevisions = false,
  isSearchingRevisionDateTime = false,
  onRevisionChange,
  onLoadMoreRevisions,
  onRevisionDateTimeQuery,
}: SplitHeaderProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const headerPillHeight = 28;
  const headerPillPadding = '0 10px';
  const headerPillRadius = 999;
  const baseVersion = baseRevisionInfo?.revision || extractVersionLabel(baseName) || t('commonBase');
  const mineVersion = mineRevisionInfo?.revision || extractVersionLabel(mineName) || t('commonMine');
  const baseDisplayName = extractDisplayName(baseName);
  const mineDisplayName = extractDisplayName(mineName);
  const options = revisionOptions ?? [];

  const resolveAxisLabel = (side: 'base' | 'mine') => {
    if (isWorkbookMode && layout === 'unified') {
      return side === 'base' ? t('splitHeaderAxisTop') : t('splitHeaderAxisBottom');
    }
    if (isWorkbookMode && layout === 'split-v') {
      return side === 'base' ? t('splitHeaderAxisLeftColumn') : t('splitHeaderAxisRightColumn');
    }
    return side === 'base' ? t('splitHeaderAxisLeftPane') : t('splitHeaderAxisRightPane');
  };

  const renderRoleBadge = (side: 'base' | 'mine') => {
    const accent = side === 'base' ? T.acc2 : T.acc;
    const glyphStyle = side === 'base'
      ? {
          width: 6,
          height: 6,
          borderRadius: 2,
          transform: 'rotate(45deg)',
        }
      : {
          width: 7,
          height: 7,
          borderRadius: '50%',
        };

    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 12,
          height: 12,
          minWidth: 12,
          borderRadius: 999,
          background: `${accent}14`,
          border: `1px solid ${accent}38`,
          boxSizing: 'border-box',
          flexShrink: 0,
        }}>
        <span
          style={{
            display: 'block',
            background: accent,
            boxShadow: `0 0 0 1px ${accent}22`,
            ...glyphStyle,
          }}
        />
      </span>
    );
  };

  const renderMeta = (info: SvnRevisionInfo | null, fallbackText: string, accent: string) => {
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

  const renderStaticVersion = (label: string, accent: string) => (
    <Tooltip content={label} maxWidth={320}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '100%',
          minWidth: 0,
          padding: headerPillPadding,
          height: headerPillHeight,
          borderRadius: headerPillRadius,
          border: `1px solid ${T.border}`,
          background: T.bg2,
          flexShrink: 0,
        }}>
        <span
          style={{
            color: accent,
            fontSize: FONT_SIZE.xs,
            fontWeight: 700,
            fontFamily: FONT_UI,
            whiteSpace: 'nowrap',
          }}>
          {t('splitHeaderVersionLabel')}
        </span>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: T.t0,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            fontFamily: FONT_CODE,
          }}>
            {label}
          </span>
      </span>
    </Tooltip>
  );

  const renderRevisionSelect = (
    side: 'base' | 'mine',
    info: SvnRevisionInfo | null,
  ) => {
    const otherId = side === 'base' ? mineRevisionInfo?.id ?? '' : baseRevisionInfo?.id ?? '';

    return (
      <RevisionPicker
        align={side === 'base' ? 'left' : 'right'}
        accent={side === 'base' ? T.acc2 : T.acc}
        title={side === 'base' ? t('splitHeaderBaseTitle') : t('splitHeaderMineTitle')}
        value={info}
        options={options}
        disabled={isSwitchingRevisions}
        isLoading={isLoadingRevisionOptions && options.length === 0}
        hasMore={revisionHasMore}
        isLoadingMore={isLoadingMoreRevisions}
        queryDateTime={revisionQueryDateTime}
        queryError={revisionQueryError}
        isSearchingDateTime={isSearchingRevisionDateTime}
        onChange={(nextId) => {
          if (!nextId) return;
          if (side === 'base') {
            onRevisionChange?.(nextId, otherId || mineRevisionInfo?.id || nextId);
            return;
          }
          onRevisionChange?.(otherId || baseRevisionInfo?.id || nextId, nextId);
        }}
        onLoadMore={onLoadMoreRevisions}
        onQueryDateTime={onRevisionDateTimeQuery}
      />
    );
  };

  const headerSide = (
    side: 'base' | 'mine',
    axis: string,
    title: string,
    name: string,
    version: string,
    info: SvnRevisionInfo | null,
    divider = false,
  ) => {
    const accent = side === 'base' ? T.acc2 : T.acc;
    const hasRevisionSwitch = canSwitchRevisions && Boolean(onRevisionChange);
    const normalizedVersion = version.trim();
    const staticVersionLabel = (
      normalizedVersion
      && normalizedVersion !== t('commonBase')
      && normalizedVersion !== t('commonMine')
    )
      ? normalizedVersion
      : t('splitHeaderVersionUnknown');

    return (
      <div
        style={{
          display: 'grid',
          gap: 6,
          minWidth: 0,
          padding: '8px 14px 9px',
          minHeight: 58,
          background: 'transparent',
          borderLeft: divider ? `1px solid ${T.border}` : 'none',
          borderTop: `1px solid ${T.border}`,
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minWidth: 0,
            flexWrap: 'wrap',
          }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              flexWrap: 'wrap',
            }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: headerPillHeight,
                padding: headerPillPadding,
                borderRadius: headerPillRadius,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                color: accent,
                fontFamily: FONT_UI,
                fontSize: FONT_SIZE.sm,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
              {renderRoleBadge(side)}
              {title}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: headerPillHeight,
                padding: headerPillPadding,
                borderRadius: headerPillRadius,
                border: `1px solid ${T.border}`,
                background: T.bg2,
                color: T.t2,
                fontFamily: FONT_UI,
                fontSize: FONT_SIZE.xs,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                {axis}
            </span>
          </div>
          {hasRevisionSwitch
            ? renderRevisionSelect(side, info)
            : renderStaticVersion(staticVersionLabel, accent)}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
          }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flex: '1 1 auto',
              minHeight: headerPillHeight,
              paddingLeft: 4,
            }}>
            {renderMeta(info, name || title, accent) ?? (
              <Tooltip content={name || title} maxWidth={320}>
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: T.t2,
                    fontSize: FONT_SIZE.xs,
                    fontFamily: FONT_UI,
                  }}>
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 0,
        padding: 0,
        width: '100%',
        minWidth: 0,
        background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
      <div style={{ minWidth: 0 }}>
        {headerSide(
          'base',
          resolveAxisLabel('base'),
          t('splitHeaderBaseTitle'),
          baseDisplayName,
          baseVersion,
          baseRevisionInfo,
          false,
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        {headerSide(
          'mine',
          resolveAxisLabel('mine'),
          t('splitHeaderMineTitle'),
          mineDisplayName,
          mineVersion,
          mineRevisionInfo,
          true,
        )}
      </div>
    </div>
  );
});

export default SplitHeader;
