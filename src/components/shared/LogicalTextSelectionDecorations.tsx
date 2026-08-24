import { memo } from 'react';

interface LogicalTextSelectionRange {
  start: number;
  end: number;
}

interface LogicalTextSelectionDecorationsProps {
  selectionRange?: LogicalTextSelectionRange | null | undefined;
}

const LogicalTextSelectionDecorations = memo(({
  selectionRange = null,
}: LogicalTextSelectionDecorationsProps) => {
  const selectedCharacterCount = selectionRange
    ? Math.max(0, selectionRange.end - selectionRange.start)
    : 0;

  return (
    <>
      {selectionRange && selectedCharacterCount > 0 && (
        <span
          aria-hidden="true"
          data-logical-text-selection-overlay="true"
          className="logical-text-selection-overlay"
          style={{
            left: `${selectionRange.start}ch`,
            width: `${selectedCharacterCount}ch`,
          }}
        />
      )}
    </>
  );
});

export default LogicalTextSelectionDecorations;
