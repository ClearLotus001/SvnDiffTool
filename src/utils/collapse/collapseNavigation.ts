export function findNextCollapseIndex<T>(
  items: T[],
  afterIndex: number,
  isCollapseItem: (item: T) => boolean,
): number {
  for (let index = Math.max(0, afterIndex); index < items.length; index += 1) {
    if (isCollapseItem(items[index]!)) return index;
  }
  return -1;
}

export function findPreviousCollapseIndex<T>(
  items: T[],
  beforeIndex: number,
  isCollapseItem: (item: T) => boolean,
): number {
  for (let index = Math.min(beforeIndex, items.length - 1); index >= 0; index -= 1) {
    if (isCollapseItem(items[index]!)) return index;
  }
  return -1;
}

export function findNextCollapseIndexWithWrap<T>(
  items: T[],
  afterIndex: number,
  isCollapseItem: (item: T) => boolean,
): number {
  const normalizedStart = Math.max(0, afterIndex);
  const forward = findNextCollapseIndex(items, normalizedStart, isCollapseItem);
  if (forward >= 0) return forward;

  for (let index = 0; index < Math.min(normalizedStart, items.length); index += 1) {
    if (isCollapseItem(items[index]!)) return index;
  }
  return -1;
}

export function findPreviousCollapseIndexWithWrap<T>(
  items: T[],
  beforeIndex: number,
  isCollapseItem: (item: T) => boolean,
): number {
  const normalizedStart = Math.min(beforeIndex, items.length - 1);
  const backward = findPreviousCollapseIndex(items, normalizedStart, isCollapseItem);
  if (backward >= 0) return backward;

  for (let index = items.length - 1; index > normalizedStart; index -= 1) {
    if (isCollapseItem(items[index]!)) return index;
  }
  return -1;
}

export function countRemainingCollapses<T>(
  items: T[],
  afterIndex: number,
  isCollapseItem: (item: T) => boolean,
): number {
  let count = 0;
  for (let index = Math.max(0, afterIndex); index < items.length; index += 1) {
    if (isCollapseItem(items[index]!)) count += 1;
  }
  return count;
}

export function getCollapseIndexes<T>(
  items: T[],
  isCollapseItem: (item: T) => boolean,
): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (isCollapseItem(items[index]!)) indexes.push(index);
  }
  return indexes;
}

export function findCyclicCollapseIndex(
  collapseIndexes: number[],
  currentCollapseIndex: number | null,
  fallbackIndex: number,
  direction: 'prev' | 'next',
): number {
  if (collapseIndexes.length === 0) return -1;

  if (currentCollapseIndex != null) {
    const currentPosition = collapseIndexes.indexOf(currentCollapseIndex);
    if (currentPosition >= 0) {
      const delta = direction === 'next' ? 1 : -1;
      const nextPosition = (currentPosition + delta + collapseIndexes.length) % collapseIndexes.length;
      return collapseIndexes[nextPosition] ?? -1;
    }
  }

  if (direction === 'next') {
    return collapseIndexes.find((index) => index > fallbackIndex) ?? collapseIndexes[0] ?? -1;
  }

  for (let index = collapseIndexes.length - 1; index >= 0; index -= 1) {
    if ((collapseIndexes[index] ?? -1) < fallbackIndex) return collapseIndexes[index] ?? -1;
  }
  return collapseIndexes[collapseIndexes.length - 1] ?? -1;
}

export function resolveActiveCollapsePosition(
  collapseIndexes: number[],
  currentCollapseIndex: number | null,
  fallbackIndex: number,
): number {
  if (collapseIndexes.length === 0) return -1;

  if (currentCollapseIndex != null) {
    const currentPosition = collapseIndexes.indexOf(currentCollapseIndex);
    if (currentPosition >= 0) return currentPosition;
  }

  const nextIndex = collapseIndexes.findIndex((index) => index >= fallbackIndex);
  if (nextIndex >= 0) return nextIndex;
  return 0;
}
