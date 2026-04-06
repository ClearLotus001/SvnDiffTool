import type { LogicalTextSelectionPoint, LogicalTextSelectionSide } from '@/utils/diff/logicalTextSelection';

const LARGE_COLUMN = Number.MAX_SAFE_INTEGER;

function resolveNodeWithinHost(host: HTMLElement, node: Node | null) {
  if (!node) return false;
  const candidate = node instanceof Element ? node : node.parentElement;
  return Boolean(candidate && host.contains(candidate));
}

function resolveRootLineIndex(root: HTMLElement) {
  const lineElement = root.closest<HTMLElement>('[data-line-idx]');
  const lineIdx = Number(lineElement?.dataset.lineIdx ?? Number.NaN);
  return Number.isFinite(lineIdx) ? lineIdx : null;
}

function resolveRootSide(root: HTMLElement): LogicalTextSelectionSide | null {
  const side = root.closest<HTMLElement>('[data-copy-side]')?.dataset.copySide;
  if (side === 'base' || side === 'mine' || side === 'both') return side;
  return null;
}

function getTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current.textContent && current.textContent.length > 0) {
      textNodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return textNodes;
}

function getRootTextLength(root: HTMLElement) {
  return getTextNodes(root).reduce((sum, node) => sum + (node.textContent?.length ?? 0), 0);
}

export function estimateLogicalTextColumnFromClientX(
  clientX: number,
  contentLeft: number,
  contentRight: number,
  textLength: number,
) {
  if (textLength <= 0) return 0;
  const contentWidth = contentRight - contentLeft;
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return textLength;

  const relative = (clientX - contentLeft) / contentWidth;
  return Math.max(0, Math.min(textLength, Math.floor(relative * textLength)));
}

function getTextOffsetWithinRoot(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function resolveElementWithinHostAtPoint(host: HTMLElement, clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof Element)) return null;
  return host.contains(element) ? element : null;
}

function resolveSelectableTextRootAtPoint(host: HTMLElement, clientX: number, clientY: number) {
  return resolveElementWithinHostAtPoint(host, clientX, clientY)?.closest<HTMLElement>('[data-selectable-text-root="true"]') ?? null;
}

function getDistanceToRect(rect: DOMRect, clientX: number, clientY: number) {
  const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
  const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
  return (dx * dx) + (dy * dy);
}

function resolveNearestSelectableTextRoot(host: HTMLElement, clientX: number, clientY: number) {
  const roots = Array.from(host.querySelectorAll<HTMLElement>('[data-selectable-text-root="true"]'));
  if (roots.length === 0) return null;

  let nearestRoot = roots[0] ?? null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  roots.forEach((root) => {
    const distance = getDistanceToRect(root.getBoundingClientRect(), clientX, clientY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestRoot = root;
    }
  });
  return nearestRoot;
}

function resolveCaretOffsetWithinRoot(host: HTMLElement, root: HTMLElement, clientX: number, clientY: number) {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  const caretPosition = documentWithCaret.caretPositionFromPoint?.(clientX, clientY);
  if (
    caretPosition
    && resolveNodeWithinHost(host, caretPosition.offsetNode)
    && root.contains(caretPosition.offsetNode)
  ) {
    return getTextOffsetWithinRoot(root, caretPosition.offsetNode, caretPosition.offset);
  }

  const caretRange = documentWithCaret.caretRangeFromPoint?.(clientX, clientY);
  if (
    caretRange
    && resolveNodeWithinHost(host, caretRange.startContainer)
    && root.contains(caretRange.startContainer)
  ) {
    return getTextOffsetWithinRoot(root, caretRange.startContainer, caretRange.startOffset);
  }

  return null;
}

function resolvePointFromRoot(
  host: HTMLElement,
  root: HTMLElement,
  clientX: number,
  clientY: number,
): LogicalTextSelectionPoint | null {
  const lineIdx = resolveRootLineIndex(root);
  const side = resolveRootSide(root);
  if (lineIdx == null || !side) return null;

  const content = root.querySelector<HTMLElement>('[data-selectable-text-content="true"]');
  const contentRect = content?.getBoundingClientRect() ?? null;
  const textLength = getRootTextLength(root);
  const caretOffset = resolveCaretOffsetWithinRoot(host, root, clientX, clientY);

  let column = caretOffset ?? textLength;
  if (contentRect) {
    if (clientX <= contentRect.left) column = 0;
    else if (clientX >= contentRect.right) column = LARGE_COLUMN;
    else if (caretOffset == null) {
      column = estimateLogicalTextColumnFromClientX(
        clientX,
        contentRect.left,
        contentRect.right,
        textLength,
      );
    }
  } else if (caretOffset == null) {
    column = LARGE_COLUMN;
  }

  return {
    lineIdx,
    side,
    column,
  };
}

function resolveCollapseTargetAtPoint(host: HTMLElement, clientX: number, clientY: number) {
  return resolveElementWithinHostAtPoint(host, clientX, clientY)?.closest<HTMLElement>('[data-collapse-range="true"]') ?? null;
}

function resolveSideNearLineRange(
  host: HTMLElement,
  startLineIdx: number,
  endLineIdx: number,
  preferredSide: LogicalTextSelectionSide | null,
) {
  if (preferredSide && preferredSide !== 'both') return preferredSide;

  const roots = Array.from(host.querySelectorAll<HTMLElement>('[data-selectable-text-root="true"]'));
  const ranked = roots
    .map((root) => ({
      side: resolveRootSide(root),
      lineIdx: resolveRootLineIndex(root),
    }))
    .filter((entry): entry is { side: LogicalTextSelectionSide; lineIdx: number } => entry.side != null && entry.lineIdx != null)
    .filter((entry) => entry.lineIdx >= startLineIdx - 1 && entry.lineIdx <= endLineIdx + 1);

  if (ranked.length > 0) return ranked[0]!.side;
  const fallback = roots[0] ? resolveRootSide(roots[0]) : null;
  return fallback ?? 'both';
}

function resolvePointFromCollapseTarget(
  host: HTMLElement,
  target: HTMLElement,
  clientY: number,
  referencePoint: LogicalTextSelectionPoint | null,
): LogicalTextSelectionPoint | null {
  const startLineIdx = Number(target.dataset.collapseStart ?? Number.NaN);
  const endLineIdx = Number(target.dataset.collapseEnd ?? Number.NaN);
  if (!Number.isFinite(startLineIdx) || !Number.isFinite(endLineIdx)) return null;

  const rect = target.getBoundingClientRect();
  const preferEnd = referencePoint
    ? referencePoint.lineIdx <= startLineIdx
    : clientY >= ((rect.top + rect.bottom) / 2);

  const side = resolveSideNearLineRange(host, startLineIdx, endLineIdx, referencePoint?.side ?? null);
  return {
    lineIdx: preferEnd ? endLineIdx : startLineIdx,
    side,
    column: preferEnd ? LARGE_COLUMN : 0,
  };
}

export function resolveLogicalTextSelectionPointFromClientPoint(
  host: HTMLElement,
  clientX: number,
  clientY: number,
  referencePoint: LogicalTextSelectionPoint | null = null,
): LogicalTextSelectionPoint | null {
  const collapseTarget = resolveCollapseTargetAtPoint(host, clientX, clientY);
  if (collapseTarget) {
    const point = resolvePointFromCollapseTarget(host, collapseTarget, clientY, referencePoint);
    if (point) return point;
  }

  const root = resolveSelectableTextRootAtPoint(host, clientX, clientY)
    ?? resolveNearestSelectableTextRoot(host, clientX, clientY);
  if (!root) return null;
  return resolvePointFromRoot(host, root, clientX, clientY);
}
