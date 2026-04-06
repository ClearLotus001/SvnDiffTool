import { memo } from 'react';

import { useI18n } from '@/context/i18n';
import { ROW_H } from '@/hooks/virtualization/useVirtual';
import { cssVar } from '@/theme/cssUtils';

interface WorkbookSparseGapPlaceholderProps {
  count: number;
  rowNumberStart: number;
  rowNumberEnd: number;
}

const WorkbookSparseGapPlaceholder = memo(({
  count,
  rowNumberStart,
  rowNumberEnd,
}: WorkbookSparseGapPlaceholderProps) => {
  const { t } = useI18n();

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        background: [
          `linear-gradient(180deg, ${cssVar('bg0')}ee 0%, ${cssVar('bg1')}f6 100%)`,
          `repeating-linear-gradient(180deg, transparent 0, transparent ${ROW_H - 1}px, ${cssVar('border')}44 ${ROW_H - 1}px, ${cssVar('border')}44 ${ROW_H}px)`,
        ].join(', '),
        borderTop: `1px dashed ${cssVar('border')}`,
        borderBottom: `1px dashed ${cssVar('border')}`,
      }}>
      <div
        style={{
          position: 'sticky',
          top: 8,
          left: 8,
          display: 'inline-flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          maxWidth: 'min(560px, calc(100% - 16px))',
          padding: '6px 10px',
          borderRadius: 12,
          border: `1px solid ${cssVar('border')}`,
          background: cssVar('bg0'),
          boxShadow: `0 8px 24px -20px ${cssVar('acc')}66`,
          color: cssVar('t1'),
          fontSize: 12,
          lineHeight: 1.4,
          pointerEvents: 'none',
        }}>
        <span style={{ fontWeight: 800, color: cssVar('acc2') }}>
          {t('workbookSparseGapLabel', { count })}
        </span>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>
          {t('workbookSparseGapRange', { start: rowNumberStart, end: rowNumberEnd })}
        </span>
      </div>
    </div>
  );
});

export default WorkbookSparseGapPlaceholder;
