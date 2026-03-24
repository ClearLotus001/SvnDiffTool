import { memo } from 'react';
import type { LayoutMode, SvnRevisionInfo } from '../types';
import { FONT_CODE, FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';
import { extractDisplayName, extractVersionLabel } from '../utils/diffMeta';

interface SplitHeaderProps {
  baseName: string;
  mineName: string;
  layout: LayoutMode;
  isWorkbookMode: boolean;
  baseRevisionInfo?: SvnRevisionInfo | null;
  mineRevisionInfo?: SvnRevisionInfo | null;
  revisionOptions?: SvnRevisionInfo[] | null;
  canSwitchRevisions?: boolean;
  isSwitchingRevisions?: boolean;
  onRevisionChange?: ((baseRevisionId: string, mineRevisionId: string) => void) | undefined;
}

function buildRevisionOptionLabel(option: SvnRevisionInfo) {
  if (option.message) return `${option.revision} · ${option.message}`;
  if (option.title && option.title !== option.revision) return `${option.revision} · ${option.title}`;
  return option.revision;
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
  isSwitchingRevisions = false,
  onRevisionChange,
}: SplitHeaderProps) => {
  const T = useTheme();
  const { t } = useI18n();
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

  const renderMeta = (info: SvnRevisionInfo | null) => {
    const parts = [info?.author, info?.date].filter(Boolean);
    const secondary = parts.join(' · ');
    const primary = info?.message?.trim() || info?.title?.trim() || '';
    if (!primary && !secondary) return null;

    return (
      <div
        style={{
          display: 'grid',
          gap: 2,
          justifyItems: 'center',
          minWidth: 0,
          maxWidth: '100%',
        }}>
        {primary && (
          <span
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: T.t0,
              fontSize: FONT_SIZE.sm,
              fontFamily: FONT_UI,
              fontWeight: 600,
            }}>
            {primary}
          </span>
        )}
        {secondary && (
          <span
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: T.t2,
              fontSize: FONT_SIZE.xs,
              fontFamily: FONT_UI,
            }}>
            {secondary}
          </span>
        )}
      </div>
    );
  };

  const renderRevisionSelect = (
    side: 'base' | 'mine',
    info: SvnRevisionInfo | null,
    fallbackLabel: string,
  ) => {
    const currentId = info?.id ?? '';
    const otherId = side === 'base' ? mineRevisionInfo?.id ?? '' : baseRevisionInfo?.id ?? '';

    if (!canSwitchRevisions || options.length === 0 || !onRevisionChange) {
      return (
        <span
          style={{
            color: T.t0,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            fontFamily: FONT_CODE,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}>
          {fallbackLabel}
        </span>
      );
    }

    return (
      <select
        aria-label={side === 'base' ? t('splitHeaderBaseTitle') : t('splitHeaderMineTitle')}
        value={currentId}
        disabled={isSwitchingRevisions}
        onChange={(event) => {
          const nextId = event.currentTarget.value;
          if (!nextId) return;
          if (side === 'base') {
            onRevisionChange(nextId, otherId || mineRevisionInfo?.id || nextId);
            return;
          }
          onRevisionChange(otherId || baseRevisionInfo?.id || nextId, nextId);
        }}
        style={{
          width: 'min(100%, 360px)',
          minWidth: 180,
          height: 30,
          padding: '0 30px 0 10px',
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: T.bg1,
          color: T.t0,
          fontSize: FONT_SIZE.sm,
          fontFamily: FONT_CODE,
          fontWeight: 700,
          outline: 'none',
          boxShadow: isSwitchingRevisions ? `inset 0 0 0 1px ${T.border}` : 'none',
        }}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {buildRevisionOptionLabel(option)}
          </option>
        ))}
      </select>
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
    const fallbackLabel = [name.trim(), version.trim()].filter(Boolean).join(' · ') || title;

    return (
      <div
        style={{
          display: 'grid',
          gap: 6,
          justifyItems: 'center',
          alignContent: 'center',
          minWidth: 0,
          padding: '8px 14px 10px',
          minHeight: 66,
          background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg0} 100%)`,
          borderLeft: divider ? `1px solid ${T.border}` : 'none',
          borderTop: `1px solid ${T.border}`,
        }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            color: accent,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.xs,
            fontWeight: 700,
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
          }}>
          {renderRoleBadge(side)}
          <span>{axis}</span>
          <span style={{ color: T.t2 }}>·</span>
          <span>{title}</span>
        </span>

        {renderRevisionSelect(side, info, fallbackLabel)}
        {renderMeta(info)}
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
        background: '#faf9f5',
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
