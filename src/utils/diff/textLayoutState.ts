import type {
  TextHorizontalLayoutSnapshot,
  TextUnifiedLayoutSnapshot,
  TextVerticalLayoutSnapshot,
} from '@/types';

export interface TextLayoutSnapshotsByMode {
  unified: TextUnifiedLayoutSnapshot | null;
  'split-h': TextHorizontalLayoutSnapshot | null;
  'split-v': TextVerticalLayoutSnapshot | null;
}

export function createEmptyTextLayoutSnapshots(): TextLayoutSnapshotsByMode {
  return {
    unified: null,
    'split-h': null,
    'split-v': null,
  };
}
