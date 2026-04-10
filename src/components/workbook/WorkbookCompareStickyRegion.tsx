import type { ReactNode } from 'react';
import { cssVar } from '@/theme/cssUtils';

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
        background: cssVar('bg1'),
        boxShadow: `0 1px 0 ${cssVar('border')}`,
        minWidth: minBodyWidth,
      }}>
      {children}
    </div>
  );
}
