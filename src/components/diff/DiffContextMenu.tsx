import { memo } from 'react';
import { useI18n } from '@/context/i18n';
import ContextMenuSurface, {
  type ContextMenuAction as DiffContextMenuAction,
  type ContextMenuPoint as DiffContextMenuPoint,
  type ContextMenuSection as DiffContextMenuSection,
} from '@/components/shared/ContextMenuSurface';

interface DiffContextMenuProps {
  anchorPoint: DiffContextMenuPoint | null;
  sections: DiffContextMenuSection[];
  onClose: () => void;
}

const DiffContextMenu = memo(({
  anchorPoint,
  sections,
  onClose,
}: DiffContextMenuProps) => {
  const { t } = useI18n();

  return (
    <ContextMenuSurface
      anchorPoint={anchorPoint}
      sections={sections}
      onClose={onClose}
      ariaLabel={t('diffContextMenuAriaLabel')}
      zIndex={170}
    />
  );
});

export type {
  DiffContextMenuAction,
  DiffContextMenuPoint,
  DiffContextMenuSection,
};

export default DiffContextMenu;
