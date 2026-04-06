import type { SyntaxPresentation, SplitRow, WorkbookSelectedCell } from '@/types';

import { LN_W } from '@/constants/layout';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { WORKBOOK_CELL_WIDTH } from '@/utils/workbook/workbookDisplay';
import { cssVar } from '@/theme/cssUtils';
import { getSplitLineSyntaxTokens } from '@/utils/diff/syntaxHighlighting';
import SplitCell from '@/components/diff/SplitCell';

interface SplitWorkbookStickyRegionProps {
  vertical: boolean;
  columnLabels: string[];
  singleGridWidth: number;
  frozenRow: SplitRow | null;
  syntaxPresentation?: SyntaxPresentation | null;
  showWhitespace: boolean;
  fontSize: number;
  sheetName: string;
  baseVersion: string;
  mineVersion: string;
  selectedCell?: WorkbookSelectedCell | null;
  onSelectCell?: ((cell: WorkbookSelectedCell | null) => void) | undefined;
}

const DOUBLE_ROW_H = (ROW_H * 2) + 1;

export default function SplitWorkbookStickyRegion({
  vertical,
  columnLabels,
  singleGridWidth,
  frozenRow,
  syntaxPresentation = null,
  showWhitespace,
  fontSize,
  sheetName,
  baseVersion,
  mineVersion,
  selectedCell = null,
  onSelectCell,
}: SplitWorkbookStickyRegionProps) {
  const renderWorkbookColumns = (accent: string, stickyLeftBase = 0) => (
    <div style={{
      display: 'flex',
      height: ROW_H,
      minWidth: singleGridWidth,
      background: cssVar('bg1'),
    }}>
      <div style={{
        width: LN_W + 3,
        minWidth: LN_W + 3,
        borderBottom: `1px solid ${cssVar('border')}`,
        background: cssVar('bg2'),
        position: 'sticky',
        left: stickyLeftBase,
        zIndex: 7,
        boxShadow: `10px 0 14px -14px ${cssVar('border2')}`,
      }} />
      {columnLabels.map((label, index) => (
        <div
          key={label}
          style={{
            width: WORKBOOK_CELL_WIDTH,
            minWidth: WORKBOOK_CELL_WIDTH,
            maxWidth: WORKBOOK_CELL_WIDTH,
            borderLeft: `1px solid ${cssVar('border')}`,
            borderBottom: `1px solid ${cssVar('border')}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accent,
            background: cssVar('bg1'),
            fontSize: 11,
            fontWeight: 700,
            position: index === 0 ? 'sticky' : 'relative',
            left: index === 0 ? stickyLeftBase + LN_W + 3 : undefined,
            zIndex: index === 0 ? 6 : 1,
            boxShadow: index === 0 ? `10px 0 14px -14px ${cssVar('border2')}` : undefined,
          }}>
          {label}
        </div>
      ))}
    </div>
  );

  const frozenWorkbookRow = frozenRow ? (
    <div
      style={{
        height: vertical ? DOUBLE_ROW_H : ROW_H,
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        width: 'max-content',
        minWidth: '100%',
        background: cssVar('bg1'),
      }}>
      <SplitCell
        line={frozenRow.left}
        side="left"
        syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, frozenRow.left, 'left')}
        widthMode={vertical ? 'content' : 'fill'}
        lineNumberLayout={vertical ? 'paired' : 'single'}
        isReplacementPair={Boolean(frozenRow.isReplacementPair)}
        isSearchMatch={false}
        isActiveSearch={false}
        showWhitespace={showWhitespace}
        fontSize={fontSize}
        sheetName={sheetName}
        versionLabel={baseVersion}
        selectedCell={selectedCell}
        onSelectCell={onSelectCell}
        stickyLeftBase={0}
      />
      <div
        style={vertical
          ? { height: 1, background: cssVar('border'), width: '100%', flexShrink: 0 }
          : { width: 1, background: cssVar('border'), flexShrink: 0 }}
      />
      <SplitCell
        line={frozenRow.right}
        side="right"
        syntaxTokens={getSplitLineSyntaxTokens(syntaxPresentation, frozenRow.right, 'right')}
        widthMode={vertical ? 'content' : 'fill'}
        lineNumberLayout={vertical ? 'paired' : 'single'}
        isReplacementPair={Boolean(frozenRow.isReplacementPair)}
        isSearchMatch={false}
        isActiveSearch={false}
        showWhitespace={showWhitespace}
        fontSize={fontSize}
        sheetName={sheetName}
        versionLabel={mineVersion}
        selectedCell={selectedCell}
        onSelectCell={onSelectCell}
        stickyLeftBase={vertical ? 0 : singleGridWidth + 1}
      />
    </div>
  ) : null;

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 30,
      isolation: 'isolate',
      background: cssVar('bg1'),
      boxShadow: `0 1px 0 ${cssVar('border')}`,
    }}>
      {vertical ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {renderWorkbookColumns(cssVar('acc2'), 0)}
          <div style={{ height: 1, background: cssVar('border') }} />
          {renderWorkbookColumns(cssVar('acc'), 0)}
        </div>
      ) : (
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {renderWorkbookColumns(cssVar('acc2'), 0)}
          <div style={{ width: 1, background: cssVar('border'), flexShrink: 0 }} />
          {renderWorkbookColumns(cssVar('acc'), singleGridWidth + 1)}
        </div>
      )}
      {frozenWorkbookRow}
    </div>
  );
}
