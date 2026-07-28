import { memo, type ReactNode } from 'react';

import Tooltip, { type TooltipPlacement } from '@/components/shared/Tooltip';

interface PathTooltipProps {
  path: string;
  children: ReactNode;
  placement?: TooltipPlacement;
}

const MIN_PATH_TOOLTIP_WIDTH = 520;
const MAX_PATH_TOOLTIP_WIDTH = 840;
const PATH_TOOLTIP_HORIZONTAL_PADDING = 44;

export function getPathTooltipWidth(filePath: string): number {
  const estimatedTextWidth = Array.from(filePath.trim()).reduce((width, character) => (
    width + (character.codePointAt(0)! > 0xff ? 14 : 8.4)
  ), 0);
  return Math.min(
    MAX_PATH_TOOLTIP_WIDTH,
    Math.max(MIN_PATH_TOOLTIP_WIDTH, Math.ceil(estimatedTextWidth + PATH_TOOLTIP_HORIZONTAL_PADDING)),
  );
}

const PathTooltip = memo(({
  path,
  children,
  placement = 'top',
}: PathTooltipProps) => {
  const normalizedPath = path.trim();
  return (
    <Tooltip
      content={(
        <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left font-code">
          {normalizedPath}
        </span>
      )}
      placement={placement}
      width={getPathTooltipWidth(normalizedPath)}
      maxWidth={MAX_PATH_TOOLTIP_WIDTH}
      disabled={!normalizedPath}>
      {children}
    </Tooltip>
  );
});

export default PathTooltip;
