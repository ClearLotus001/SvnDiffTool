import { memo } from 'react';
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
}: DiffContextMenuProps) => (
  <ContextMenuSurface
    anchorPoint={anchorPoint}
    sections={sections}
    onClose={onClose}
    ariaLabel="Diff actions"
    zIndex={170}
  />
));

export type {
  DiffContextMenuAction,
  DiffContextMenuPoint,
  DiffContextMenuSection,
};

export default DiffContextMenu;
