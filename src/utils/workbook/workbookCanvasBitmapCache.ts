const DEFAULT_BITMAP_CACHE_BUDGET = 96 * 1024 * 1024;
const MAX_BITMAP_CACHE_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_PENDING_BITMAP_BYTES = 48 * 1024 * 1024;
const MAX_PENDING_BITMAP_COUNT = 2;

interface SizedCacheEntry<T> {
  value: T;
  bytes: number;
}

export class WorkbookCanvasBitmapLru<T> {
  private readonly entries = new Map<string, SizedCacheEntry<T>>();
  private totalBytes = 0;

  constructor(
    private readonly budgetBytes: number,
    private readonly dispose?: (value: T) => void,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, bytes: number): boolean {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    if (normalizedBytes > this.budgetBytes) {
      this.dispose?.(value);
      return false;
    }
    const previous = this.entries.get(key);
    if (previous) {
      this.totalBytes -= previous.bytes;
      this.dispose?.(previous.value);
      this.entries.delete(key);
    }
    this.entries.set(key, { value, bytes: normalizedBytes });
    this.totalBytes += normalizedBytes;
    while (this.totalBytes > this.budgetBytes) {
      const oldest = this.entries.entries().next().value as [string, SizedCacheEntry<T>] | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.totalBytes -= oldest[1].bytes;
      this.dispose?.(oldest[1].value);
    }
    return true;
  }

  clear(): void {
    this.entries.forEach(entry => this.dispose?.(entry.value));
    this.entries.clear();
    this.totalBytes = 0;
  }
}

export class WorkbookCanvasBitmapPendingBudget {
  private readonly entries = new Map<string, number>();
  private totalBytes = 0;

  constructor(
    private readonly budgetBytes: number,
    private readonly maxCount: number,
  ) {}

  get count(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  reserve(key: string, bytes: number): boolean {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    if (
      this.entries.has(key)
      || normalizedBytes > this.budgetBytes
      || this.entries.size >= this.maxCount
      || this.totalBytes + normalizedBytes > this.budgetBytes
    ) {
      return false;
    }
    this.entries.set(key, normalizedBytes);
    this.totalBytes += normalizedBytes;
    return true;
  }

  release(key: string): void {
    const bytes = this.entries.get(key);
    if (bytes === undefined) return;
    this.entries.delete(key);
    this.totalBytes -= bytes;
  }
}

type WorkbookCanvasBitmapSource = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

interface WorkbookCanvasBitmap {
  source: WorkbookCanvasBitmapSource;
  width: number;
  height: number;
}

function disposeBitmapSource(source: WorkbookCanvasBitmapSource): void {
  if ('close' in source && typeof source.close === 'function') source.close();
}

const bitmapCache = new WorkbookCanvasBitmapLru<WorkbookCanvasBitmap>(
  DEFAULT_BITMAP_CACHE_BUDGET,
  bitmap => {
    disposeBitmapSource(bitmap.source);
  },
);
const pendingBitmapBudget = new WorkbookCanvasBitmapPendingBudget(
  MAX_PENDING_BITMAP_BYTES,
  MAX_PENDING_BITMAP_COUNT,
);
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
let bitmapCacheGeneration = 0;

export function clearWorkbookCanvasBitmapCache(): void {
  bitmapCacheGeneration += 1;
  bitmapCache.clear();
}

export function getWorkbookCanvasBitmapCacheStats() {
  return {
    entries: bitmapCache.size,
    bytes: bitmapCache.bytes,
    pendingEntries: pendingBitmapBudget.count,
    pendingBytes: pendingBitmapBudget.bytes,
    generation: bitmapCacheGeneration,
  };
}

function getObjectId(value: object): number {
  const existing = objectIds.get(value);
  if (existing) return existing;
  const id = nextObjectId;
  nextObjectId += 1;
  objectIds.set(value, id);
  return id;
}

export function buildWorkbookCanvasBitmapCacheKey(
  scope: string,
  parts: readonly unknown[],
): string {
  return [scope, ...parts.map(part => {
    if ((typeof part === 'object' && part !== null) || typeof part === 'function') {
      return `#${getObjectId(part as object)}`;
    }
    return String(part);
  })].join('|');
}

interface WorkbookCanvasBitmapColumnFrame {
  entry: {
    column: number;
    width: number;
    displayWidth: number;
  };
  drawLeft: number;
  left: number;
  right: number;
  frozen: boolean;
}

export function buildWorkbookCanvasBitmapViewportColumnKey(
  frames: readonly WorkbookCanvasBitmapColumnFrame[],
  viewportWidth: number,
): string {
  return frames
    .filter(frame => frame.right > 0 && frame.left < viewportWidth)
    .map(frame => [
      frame.entry.column,
      frame.entry.width,
      frame.entry.displayWidth,
      frame.drawLeft.toFixed(3),
      frame.left.toFixed(3),
      frame.right.toFixed(3),
      Number(frame.frozen),
    ].join(':'))
    .join(',');
}

export function restoreWorkbookCanvasBitmap(canvas: HTMLCanvasElement, key: string): boolean {
  const bitmap = bitmapCache.get(key);
  if (!bitmap || bitmap.width !== canvas.width || bitmap.height !== canvas.height) return false;
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap.source, 0, 0);
  context.restore();
  return true;
}

function storeBitmapSource(
  key: string,
  source: WorkbookCanvasBitmapSource,
  width: number,
  height: number,
  generation: number,
): void {
  if (generation !== bitmapCacheGeneration) {
    disposeBitmapSource(source);
    return;
  }
  const bytes = width * height * 4;
  if (bytes > MAX_BITMAP_CACHE_ENTRY_BYTES) {
    disposeBitmapSource(source);
    return;
  }
  bitmapCache.set(key, { source, width, height }, bytes);
}

export function storeWorkbookCanvasBitmap(canvas: HTMLCanvasElement, key: string): void {
  const width = canvas.width;
  const height = canvas.height;
  const bytes = width * height * 4;
  const generation = bitmapCacheGeneration;
  if (bytes <= 0 || bytes > MAX_BITMAP_CACHE_ENTRY_BYTES) return;
  if (typeof createImageBitmap === 'function') {
    if (!pendingBitmapBudget.reserve(key, bytes)) return;
    let bitmapPromise: Promise<ImageBitmap>;
    try {
      bitmapPromise = createImageBitmap(canvas);
    } catch {
      pendingBitmapBudget.release(key);
      return;
    }
    void bitmapPromise
      .then(bitmap => storeBitmapSource(key, bitmap, width, height, generation))
      .finally(() => pendingBitmapBudget.release(key));
    return;
  }
  if (typeof document === 'undefined') return;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d')?.drawImage(canvas, 0, 0);
  storeBitmapSource(key, copy, copy.width, copy.height, generation);
}
