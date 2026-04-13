import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import type { WorkbookContextMenuPoint } from '@/types';
import ContextMenuSurface, {
  type ContextMenuAction as WorkbookContextMenuAction,
  type ContextMenuSection as WorkbookContextMenuSection,
} from '@/components/shared/ContextMenuSurface';

interface WorkbookContextMenuProps {
  anchorPoint: WorkbookContextMenuPoint | null;
  sections: WorkbookContextMenuSection[];
  onClose: () => void;
}

const WorkbookContextMenu = memo(({
  anchorPoint,
  sections,
  onClose,
}: WorkbookContextMenuProps) => {
  const { t } = useI18n();

  return (
    <ContextMenuSurface
      anchorPoint={anchorPoint}
      sections={sections}
      onClose={onClose}
      ariaLabel={t('workbookContextMenuAriaLabel')}
      zIndex={160}
    />
  );
});

export type {
  WorkbookContextMenuAction,
  WorkbookContextMenuSection,
};

export default WorkbookContextMenu;
