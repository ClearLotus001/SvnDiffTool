import type { ReactNode } from 'react';

interface WorkbookCompareShellProps {
  perfPanel?: ReactNode;
  mergeNotice?: ReactNode;
  frozenOverflowBar?: ReactNode;
  mainContent: ReactNode;
  collapseJumpButton: ReactNode;
  miniMap: ReactNode;
  hoverTooltip?: ReactNode;
  sheetTabs: ReactNode;
}

export default function WorkbookCompareShell({
  perfPanel,
  mergeNotice,
  frozenOverflowBar,
  mainContent,
  collapseJumpButton,
  miniMap,
  hoverTooltip,
  sheetTabs,
}: WorkbookCompareShellProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
      {perfPanel}
      {mergeNotice}
      {frozenOverflowBar}
      <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
        <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
          {mainContent}
          {collapseJumpButton}
        </div>
        {miniMap}
      </div>
      {hoverTooltip}
      {sheetTabs}
    </div>
  );
}
