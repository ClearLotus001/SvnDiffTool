import type { ReactNode } from 'react';

interface WorkbookCompareStickyRegionProps {
  minBodyWidth: number;
  children: ReactNode;
}

export default function WorkbookCompareStickyRegion({
  minBodyWidth,
  children,
}: WorkbookCompareStickyRegionProps) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        isolation: 'isolate',
        background: 'var(--bg1)',
        boxShadow: '0 1px 0 var(--border)',
        minWidth: minBodyWidth,
      }}>
      {children}
    </div>
  );
}
