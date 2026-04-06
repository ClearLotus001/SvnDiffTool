import type { ComponentProps } from 'react';

import type { CompareMode } from '@/hooks/workbook/useWorkbookCompareDerivedState';
import WorkbookCanvasHeaderStrip from '@/components/workbook/WorkbookCanvasHeaderStrip';
import WorkbookCompareFrozenRowsPane from '@/components/workbook/WorkbookCompareFrozenRowsPane';

type WorkbookCompareStickyHeaderProps = Omit<ComponentProps<typeof WorkbookCanvasHeaderStrip>, 'mode' | 'showFixedSideAccent'>;

interface WorkbookCompareStickyCanvasProps {
  mode: CompareMode;
  showColumnHeader: boolean;
  headerProps: WorkbookCompareStickyHeaderProps;
  headerRowsPaneProps?: ComponentProps<typeof WorkbookCompareFrozenRowsPane> | null;
  frozenRowsPaneProps: ComponentProps<typeof WorkbookCompareFrozenRowsPane>;
}

export default function WorkbookCompareStickyCanvas({
  mode,
  showColumnHeader,
  headerProps,
  headerRowsPaneProps = null,
  frozenRowsPaneProps,
}: WorkbookCompareStickyCanvasProps) {
  const showHeaderRowsPane = (headerRowsPaneProps?.frozenRowsViewportHeight ?? 0) > 0;
  const showFrozenRowsPane = frozenRowsPaneProps.frozenRowsViewportHeight > 0;
  const headerStrip = mode === 'stacked'
    ? (
      <WorkbookCanvasHeaderStrip
        {...headerProps}
        mode="single"
        fixedSide={headerProps.fixedSide ?? 'base'}
        showFixedSideAccent={false}
      />
    )
    : (
      <WorkbookCanvasHeaderStrip
        {...headerProps}
        mode="paired-wide"
      />
    );

  return (
    <>
      {showColumnHeader && (
        <div
          style={{
            position: 'sticky',
            left: 0,
            width: headerProps.viewportWidth,
            overflow: 'hidden',
          }}>
          {headerStrip}
        </div>
      )}
      {showHeaderRowsPane && headerRowsPaneProps && (
        <div
          style={{
            position: 'sticky',
            left: 0,
            width: headerProps.viewportWidth,
            overflow: 'hidden',
          }}>
          <WorkbookCompareFrozenRowsPane {...headerRowsPaneProps} />
        </div>
      )}
      {showFrozenRowsPane && (
        <div
          style={{
            position: 'sticky',
            left: 0,
            width: headerProps.viewportWidth,
            overflow: 'hidden',
          }}>
          <WorkbookCompareFrozenRowsPane {...frozenRowsPaneProps} />
        </div>
      )}
    </>
  );
}
