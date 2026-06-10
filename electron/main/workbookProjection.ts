import type {
  DiffLine,
  WorkbookCellDeltaPayload,
  WorkbookCellSnapshot,
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookDiffRegionPatch,
  WorkbookMergeRange,
  WorkbookMetadataMap,
  WorkbookPrecomputedDeltaPayload,
  WorkbookSection,
  WorkbookSelectedCell,
} from './types.js';

const WORKBOOK_SHEET_PREFIX = '@@sheet';
const WORKBOOK_ROW_PREFIX = '@@row';
const WORKBOOK_FORMULA_SEPARATOR = '\u001F';

interface WorkbookSheetDisplayLine {
  kind: 'sheet';
  sheetName: string;
}

interface WorkbookRowDisplayLine {
  kind: 'row';
  rowNumber: number;
  cells: WorkbookCellSnapshot[];
}

type WorkbookDisplayLine = WorkbookSheetDisplayLine | WorkbookRowDisplayLine;

interface WorkbookSectionRuntimeStats {
  exactFingerprintParts: string[];
  nonEmptySignatureCounts: Map<string, number>;
  nonEmptySignatureTotal: number;
}

interface WorkbookDiffRegionNode extends WorkbookDiffRegionPatch {
  rowNumberStart: number;
  rowNumberEnd: number;
  anchorSelection: WorkbookSelectedCell | null;
  anchorLineIdx: number;
}

interface WorkbookDiffRegionBlock {
  startRowIndex: number;
  endRowIndex: number;
  startCol: number;
  endCol: number;
  hasBaseSide: boolean;
  hasMineSide: boolean;
  patches: WorkbookDiffRegionNode[];
}

interface PreparedWorkbookProjectionResult {
  sections: WorkbookSection[];
  navigationRegions: WorkbookDiffRegion[];
}

interface PreparedWorkbookProjectionInput {
  diffLines: DiffLine[] | null;
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  compareMode: WorkbookCompareMode;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
}

function parseWorkbookCell(field: string): WorkbookCellSnapshot {
  const separatorIdx = field.indexOf(WORKBOOK_FORMULA_SEPARATOR);
  if (separatorIdx < 0) {
    return { value: field, formula: '' };
  }

  return {
    value: field.slice(0, separatorIdx),
    formula: field.slice(separatorIdx + 1),
  };
}

function parseWorkbookDisplayLine(line: string | null | undefined): WorkbookDisplayLine | null {
  if (typeof line !== 'string' || !line.startsWith('@@')) return null;

  const parts = line.split('\t');
  if (parts[0] === WORKBOOK_SHEET_PREFIX) {
    return {
      kind: 'sheet',
      sheetName: parts.slice(1).join('\t').trim(),
    };
  }
  if (parts[0] === WORKBOOK_ROW_PREFIX) {
    const rowNumber = Number(parts[1] ?? 0);
    return {
      kind: 'row',
      rowNumber: Number.isFinite(rowNumber) ? rowNumber : 0,
      cells: parts.slice(2).map(parseWorkbookCell),
    };
  }
  return null;
}

function normalizeWorkbookCellValueForMode(
  value: string,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  if (compareMode === 'content' && value.trim() === '') {
    return '';
  }
  return value;
}

function hasWorkbookCellContent(
  cell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return normalizeWorkbookCellValueForMode(cell.value, compareMode) !== '' || cell.formula !== '';
}

function workbookCellsDiffer(
  leftCell: WorkbookCellSnapshot,
  rightCell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): boolean {
  return (
    normalizeWorkbookCellValueForMode(leftCell.value, compareMode)
    !== normalizeWorkbookCellValueForMode(rightCell.value, compareMode)
  ) || leftCell.formula !== rightCell.formula;
}

function resolveWorkbookCellDeltaKind(
  baseCell: WorkbookCellSnapshot,
  mineCell: WorkbookCellSnapshot,
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookCellDeltaPayload['kind'] {
  if (!workbookCellsDiffer(baseCell, mineCell, compareMode)) return 'equal';

  const hasBaseContent = hasWorkbookCellContent(baseCell, compareMode);
  const hasMineContent = hasWorkbookCellContent(mineCell, compareMode);
  if (hasBaseContent !== hasMineContent) {
    return hasMineContent ? 'add' : 'delete';
  }

  return 'modify';
}

function buildWorkbookRowSignature(
  row: WorkbookRowDisplayLine,
  compareMode: WorkbookCompareMode = 'strict',
): string {
  const cells = [...row.cells];
  while (cells.length > 0) {
    const lastCell = cells[cells.length - 1];
    if (!lastCell || hasWorkbookCellContent(lastCell, compareMode)) break;
    cells.pop();
  }

  return cells
    .map((cell) => `${normalizeWorkbookCellValueForMode(cell.value, compareMode)}\u001F${cell.formula}`)
    .join('\t');
}

function ensureWorkbookSection(
  sections: WorkbookSection[],
  sectionIndexByName: Map<string, number>,
  sheetName: string,
  lineIdx: number,
): WorkbookSection {
  const existingIndex = sectionIndexByName.get(sheetName);
  if (existingIndex != null) {
    const existing = sections[existingIndex]!;
    existing.startLineIdx = Math.min(existing.startLineIdx, lineIdx);
    existing.endLineIdx = Math.max(existing.endLineIdx, lineIdx);
    return existing;
  }

  const nextSection: WorkbookSection = {
    name: sheetName,
    displayName: sheetName,
    changeType: 'equal',
    hasBaseSide: false,
    hasMineSide: false,
    renamePeerName: null,
    renameRole: null,
    startLineIdx: lineIdx,
    endLineIdx: lineIdx,
    maxColumns: 0,
    rowCount: 0,
    firstDataLineIdx: null,
    firstDataRowNumber: null,
  };
  sectionIndexByName.set(sheetName, sections.length);
  sections.push(nextSection);
  return nextSection;
}

function createWorkbookSectionRuntimeStats(): WorkbookSectionRuntimeStats {
  return {
    exactFingerprintParts: [],
    nonEmptySignatureCounts: new Map<string, number>(),
    nonEmptySignatureTotal: 0,
  };
}

function applyWorkbookRowToSection(
  section: WorkbookSection,
  stats: WorkbookSectionRuntimeStats,
  lineIdx: number,
  row: WorkbookRowDisplayLine,
  compareMode: WorkbookCompareMode,
) {
  section.endLineIdx = Math.max(section.endLineIdx, lineIdx);
  section.maxColumns = Math.max(section.maxColumns, row.cells.length);
  section.rowCount = Math.max(section.rowCount, row.rowNumber);
  const signature = buildWorkbookRowSignature(row, compareMode);
  stats.exactFingerprintParts.push(`${row.rowNumber}:${signature}`);
  if (signature.length > 0) {
    stats.nonEmptySignatureCounts.set(signature, (stats.nonEmptySignatureCounts.get(signature) ?? 0) + 1);
    stats.nonEmptySignatureTotal += 1;
  }
  const hasVisibleCell = row.cells.some((cell) => hasWorkbookCellContent(cell, compareMode));
  if (section.firstDataLineIdx == null && hasVisibleCell) {
    section.firstDataLineIdx = lineIdx;
    section.firstDataRowNumber = row.rowNumber;
  }
}

function buildSectionExactFingerprint(stats: WorkbookSectionRuntimeStats): string {
  return stats.exactFingerprintParts.join('\u001E');
}

function countSectionSignatureOverlap(
  leftStats: WorkbookSectionRuntimeStats,
  rightStats: WorkbookSectionRuntimeStats,
): number {
  let overlap = 0;
  leftStats.nonEmptySignatureCounts.forEach((leftCount, signature) => {
    overlap += Math.min(leftCount, rightStats.nonEmptySignatureCounts.get(signature) ?? 0);
  });
  return overlap;
}

function applyWorkbookSectionRename(
  sourceSection: WorkbookSection,
  targetSection: WorkbookSection,
) {
  sourceSection.changeType = 'rename';
  sourceSection.renamePeerName = targetSection.name;
  sourceSection.renameRole = 'source';
  sourceSection.displayName = sourceSection.name;

  targetSection.changeType = 'rename';
  targetSection.renamePeerName = sourceSection.name;
  targetSection.renameRole = 'target';
  targetSection.displayName = targetSection.name;
}

function annotateWorkbookSectionChanges(
  sections: WorkbookSection[],
  runtimeStatsByName: Map<string, WorkbookSectionRuntimeStats>,
) {
  sections.forEach((section) => {
    section.displayName = section.name;
    section.renamePeerName = null;
    section.renameRole = null;
    section.changeType = section.hasBaseSide && section.hasMineSide
      ? 'equal'
      : section.hasBaseSide
        ? 'delete'
        : 'add';
  });

  const deletedSections = sections.filter((section) => section.changeType === 'delete');
  const addedSections = sections.filter((section) => section.changeType === 'add');
  if (deletedSections.length === 0 || addedSections.length === 0) return;

  const exactDeletedByFingerprint = new Map<string, WorkbookSection[]>();
  const exactAddedByFingerprint = new Map<string, WorkbookSection[]>();

  deletedSections.forEach((section) => {
    const stats = runtimeStatsByName.get(section.name);
    const fingerprint = stats ? buildSectionExactFingerprint(stats) : '';
    if (!fingerprint) return;
    const bucket = exactDeletedByFingerprint.get(fingerprint);
    if (bucket) bucket.push(section);
    else exactDeletedByFingerprint.set(fingerprint, [section]);
  });
  addedSections.forEach((section) => {
    const stats = runtimeStatsByName.get(section.name);
    const fingerprint = stats ? buildSectionExactFingerprint(stats) : '';
    if (!fingerprint) return;
    const bucket = exactAddedByFingerprint.get(fingerprint);
    if (bucket) bucket.push(section);
    else exactAddedByFingerprint.set(fingerprint, [section]);
  });

  const usedDeletedNames = new Set<string>();
  const usedAddedNames = new Set<string>();
  const hasEnoughRenameEvidence = (leftSection: WorkbookSection, rightSection: WorkbookSection) => {
    const leftStats = runtimeStatsByName.get(leftSection.name);
    const rightStats = runtimeStatsByName.get(rightSection.name);
    const maxNonEmptyRowCount = Math.max(
      leftStats?.nonEmptySignatureTotal ?? 0,
      rightStats?.nonEmptySignatureTotal ?? 0,
    );
    const maxColumnCount = Math.max(leftSection.maxColumns, rightSection.maxColumns);
    return maxNonEmptyRowCount >= 2 || maxColumnCount >= 2;
  };

  exactDeletedByFingerprint.forEach((deletedMatches, fingerprint) => {
    const addedMatches = exactAddedByFingerprint.get(fingerprint) ?? [];
    if (deletedMatches.length !== 1 || addedMatches.length !== 1) return;
    const deletedSection = deletedMatches[0]!;
    const addedSection = addedMatches[0]!;
    if (!hasEnoughRenameEvidence(deletedSection, addedSection)) return;
    applyWorkbookSectionRename(deletedSection, addedSection);
    usedDeletedNames.add(deletedSection.name);
    usedAddedNames.add(addedSection.name);
  });

  type WorkbookRenameCandidate = {
    deletedName: string;
    addedName: string;
    overlap: number;
    coverage: number;
    lineDistance: number;
  };

  const similarityCandidates: WorkbookRenameCandidate[] = [];
  deletedSections.forEach((deletedSection) => {
    if (usedDeletedNames.has(deletedSection.name)) return;
    const deletedStats = runtimeStatsByName.get(deletedSection.name);
    if (!deletedStats) return;

    addedSections.forEach((addedSection) => {
      if (usedAddedNames.has(addedSection.name)) return;
      const addedStats = runtimeStatsByName.get(addedSection.name);
      if (!addedStats) return;

      const maxNonEmptyRowCount = Math.max(
        deletedStats.nonEmptySignatureTotal,
        addedStats.nonEmptySignatureTotal,
      );
      if (!hasEnoughRenameEvidence(deletedSection, addedSection)) return;

      const overlap = countSectionSignatureOverlap(deletedStats, addedStats);
      const coverage = overlap / maxNonEmptyRowCount;
      const lineDistance = Math.abs(deletedSection.startLineIdx - addedSection.startLineIdx);
      const isStrongMatch = coverage >= 0.85;
      const isUsefulLargeMatch = overlap >= 3 && coverage >= 0.6;
      if (!isStrongMatch && !isUsefulLargeMatch) return;

      similarityCandidates.push({
        deletedName: deletedSection.name,
        addedName: addedSection.name,
        overlap,
        coverage,
        lineDistance,
      });
    });
  });

  similarityCandidates
    .sort((left, right) => (
      right.coverage - left.coverage
      || right.overlap - left.overlap
      || left.lineDistance - right.lineDistance
      || left.deletedName.localeCompare(right.deletedName)
      || left.addedName.localeCompare(right.addedName)
    ))
    .forEach((candidate) => {
      if (usedDeletedNames.has(candidate.deletedName) || usedAddedNames.has(candidate.addedName)) return;
      const deletedSection = sections.find((section) => section.name === candidate.deletedName);
      const addedSection = sections.find((section) => section.name === candidate.addedName);
      if (!deletedSection || !addedSection) return;
      applyWorkbookSectionRename(deletedSection, addedSection);
      usedDeletedNames.add(deletedSection.name);
      usedAddedNames.add(addedSection.name);
    });
}

function getWorkbookSections(
  diffLines: DiffLine[],
  compareMode: WorkbookCompareMode,
): WorkbookSection[] {
  const sections: WorkbookSection[] = [];
  const sectionIndexByName = new Map<string, number>();
  const runtimeStatsByName = new Map<string, WorkbookSectionRuntimeStats>();
  let currentBaseSheetName: string | null = null;
  let currentMineSheetName: string | null = null;

  diffLines.forEach((line, lineIdx) => {
    const parsedBase = parseWorkbookDisplayLine(line.base);
    const parsedMine = parseWorkbookDisplayLine(line.mine);

    if (parsedBase?.kind === 'sheet') {
      currentBaseSheetName = parsedBase.sheetName;
      const section = ensureWorkbookSection(sections, sectionIndexByName, parsedBase.sheetName, lineIdx);
      section.hasBaseSide = true;
      if (!runtimeStatsByName.has(parsedBase.sheetName)) {
        runtimeStatsByName.set(parsedBase.sheetName, createWorkbookSectionRuntimeStats());
      }
    }

    if (parsedMine?.kind === 'sheet') {
      currentMineSheetName = parsedMine.sheetName;
      const section = ensureWorkbookSection(sections, sectionIndexByName, parsedMine.sheetName, lineIdx);
      section.hasMineSide = true;
      if (!runtimeStatsByName.has(parsedMine.sheetName)) {
        runtimeStatsByName.set(parsedMine.sheetName, createWorkbookSectionRuntimeStats());
      }
    }

    if (parsedBase?.kind === 'row' && currentBaseSheetName) {
      const section = ensureWorkbookSection(sections, sectionIndexByName, currentBaseSheetName, lineIdx);
      section.hasBaseSide = true;
      const stats = runtimeStatsByName.get(currentBaseSheetName) ?? createWorkbookSectionRuntimeStats();
      runtimeStatsByName.set(currentBaseSheetName, stats);
      applyWorkbookRowToSection(section, stats, lineIdx, parsedBase, compareMode);
    }

    if (parsedMine?.kind === 'row' && currentMineSheetName) {
      const section = ensureWorkbookSection(sections, sectionIndexByName, currentMineSheetName, lineIdx);
      section.hasMineSide = true;
      const stats = runtimeStatsByName.get(currentMineSheetName) ?? createWorkbookSectionRuntimeStats();
      runtimeStatsByName.set(currentMineSheetName, stats);
      applyWorkbookRowToSection(section, stats, lineIdx, parsedMine, compareMode);
    }
  });

  annotateWorkbookSectionChanges(sections, runtimeStatsByName);
  return sections;
}

function hasWorkbookSectionDeltaDeletionOrAddition(
  workbookDelta: WorkbookPrecomputedDeltaPayload,
): boolean {
  return workbookDelta.sections.some((section) => section.hasBaseSide === false || section.hasMineSide === false);
}

function hasWorkbookSectionProjectionMetadata(
  workbookDelta: WorkbookPrecomputedDeltaPayload,
): boolean {
  return workbookDelta.sections.every((section) => (
    section.startLineIdx != null
    && section.endLineIdx != null
    && section.maxColumns != null
    && section.rowCount != null
  ));
}

function buildWorkbookSectionsFromDelta(
  workbookDelta: WorkbookPrecomputedDeltaPayload | null,
  baseWorkbookMetadata: WorkbookMetadataMap | null,
  mineWorkbookMetadata: WorkbookMetadataMap | null,
): WorkbookSection[] | null {
  if (!workbookDelta || workbookDelta.sections.length === 0) return null;
  if (!hasWorkbookSectionProjectionMetadata(workbookDelta)) return null;
  if (hasWorkbookSectionDeltaDeletionOrAddition(workbookDelta)) return null;

  const sections: WorkbookSection[] = [];

  for (const deltaSection of workbookDelta.sections) {
    const metadataMaxColumns = Math.max(
      baseWorkbookMetadata?.sheets[deltaSection.name]?.maxColumns ?? 0,
      mineWorkbookMetadata?.sheets[deltaSection.name]?.maxColumns ?? 0,
    );

    let startLineIdxFromRows: number | null = null;
    let endLineIdxFromRows: number | null = null;
    let maxColumns = Math.max(deltaSection.maxColumns ?? 0, metadataMaxColumns);
    let rowCount = Math.max(
      deltaSection.rowCount ?? 0,
      baseWorkbookMetadata?.sheets[deltaSection.name]?.rowCount ?? 0,
      mineWorkbookMetadata?.sheets[deltaSection.name]?.rowCount ?? 0,
    );

    let firstDataLineIdx = deltaSection.firstDataLineIdx ?? null;
    let firstDataRowNumber = deltaSection.firstDataRowNumber ?? null;

    const includeLineIdx = (lineIdx: number | null | undefined) => {
      if (lineIdx == null) return;
      startLineIdxFromRows = startLineIdxFromRows == null ? lineIdx : Math.min(startLineIdxFromRows, lineIdx);
      endLineIdxFromRows = endLineIdxFromRows == null ? lineIdx : Math.max(endLineIdxFromRows, lineIdx);
    };

    for (const row of deltaSection.rows) {
      if (row.lineIdxs.length > 0) {
        for (const lineIdx of row.lineIdxs) {
          includeLineIdx(lineIdx);
        }
      } else {
        includeLineIdx(row.leftLineIdx);
        includeLineIdx(row.rightLineIdx);
      }

      if (row.baseRowNumber != null) rowCount = Math.max(rowCount, row.baseRowNumber);
      if (row.mineRowNumber != null) rowCount = Math.max(rowCount, row.mineRowNumber);

      let rowHasContent = false;
      for (const cellDelta of row.cellDeltas) {
        maxColumns = Math.max(maxColumns, cellDelta.column + 1);
        rowHasContent ||= cellDelta.hasContent;
      }
      if ((firstDataLineIdx == null || firstDataRowNumber == null) && rowHasContent) {
        firstDataLineIdx ??= row.lineIdx;
        firstDataRowNumber ??= row.baseRowNumber ?? row.mineRowNumber ?? null;
      }
    }

    const startLineIdx = deltaSection.startLineIdx ?? startLineIdxFromRows;
    const endLineIdx = deltaSection.endLineIdx ?? endLineIdxFromRows;
    if (startLineIdx == null || endLineIdx == null) return null;

    sections.push({
      name: deltaSection.name,
      displayName: deltaSection.name,
      changeType: 'equal',
      hasBaseSide: deltaSection.hasBaseSide ?? true,
      hasMineSide: deltaSection.hasMineSide ?? true,
      renamePeerName: null,
      renameRole: null,
      startLineIdx,
      endLineIdx,
      maxColumns,
      rowCount,
      firstDataLineIdx,
      firstDataRowNumber,
    });
  }

  if (sections.length !== workbookDelta.sections.length) return null;
  annotateWorkbookSectionChanges(sections, new Map());
  return sections;
}

function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function getWorkbookMergeRangesForRow(
  mergedRanges: ReadonlyArray<WorkbookMergeRange>,
  rowNumber: number,
): WorkbookMergeRange[] {
  return mergedRanges
    .filter((range) => rowNumber >= range.startRow && rowNumber <= range.endRow)
    .sort((left, right) => left.startCol - right.startCol || left.endCol - right.endCol);
}

function findWorkbookMergeRange(
  mergedRanges: ReadonlyArray<WorkbookMergeRange>,
  rowNumber: number,
  column: number,
): WorkbookMergeRange | null {
  const rowRanges = getWorkbookMergeRangesForRow(mergedRanges, rowNumber);
  if (rowRanges.length === 0) return null;

  let low = 0;
  let high = rowRanges.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((rowRanges[mid]?.startCol ?? 0) <= column) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  for (let index = low - 1; index >= 0; index -= 1) {
    const range = rowRanges[index]!;
    if (range.endCol < column) break;
    if (column <= range.endCol) return range;
  }

  return null;
}

function resolveWorkbookRowIndex(
  rowNumber: number | null,
  fallbackIndex: number,
  rowIndexByNumber: Map<number, number>,
): number {
  if (rowNumber == null) return fallbackIndex;
  return rowIndexByNumber.get(rowNumber) ?? fallbackIndex;
}

function buildFallbackCellDeltaPayload(
  baseRow: WorkbookRowDisplayLine | null,
  mineRow: WorkbookRowDisplayLine | null,
  column: number,
  compareMode: WorkbookCompareMode,
): WorkbookCellDeltaPayload {
  const baseCell = baseRow?.cells[column] ?? { value: '', formula: '' };
  const mineCell = mineRow?.cells[column] ?? { value: '', formula: '' };
  const changed = workbookCellsDiffer(baseCell, mineCell, compareMode);
  const hasBaseContent = hasWorkbookCellContent(baseCell, compareMode);
  const hasMineContent = hasWorkbookCellContent(mineCell, compareMode);

  return {
    column,
    baseCell,
    mineCell,
    changed,
    masked: !changed,
    strictOnly: workbookCellsDiffer(baseCell, mineCell, 'strict') && !workbookCellsDiffer(baseCell, mineCell, 'content'),
    kind: resolveWorkbookCellDeltaKind(baseCell, mineCell, compareMode),
    hasBaseContent,
    hasMineContent,
    hasContent: hasBaseContent || hasMineContent,
  };
}

function buildWorkbookAnchorSelection(params: {
  sheetName: string;
  baseRow: WorkbookRowDisplayLine | null;
  mineRow: WorkbookRowDisplayLine | null;
  baseRowNumber: number | null;
  mineRowNumber: number | null;
  preferredColumn: number;
  baseMergeRanges: WorkbookMergeRange[];
  mineMergeRanges: WorkbookMergeRange[];
  preferMineAnchor: boolean;
  preferBaseAnchor: boolean;
}): WorkbookSelectedCell | null {
  const {
    sheetName,
    baseRow,
    mineRow,
    baseRowNumber,
    mineRowNumber,
    preferredColumn,
    baseMergeRanges,
    mineMergeRanges,
    preferMineAnchor,
    preferBaseAnchor,
  } = params;

  const side = preferMineAnchor && mineRow
    ? 'mine'
    : preferBaseAnchor && baseRow
      ? 'base'
      : baseRow
        ? 'base'
        : mineRow
          ? 'mine'
          : null;
  if (!side) return null;

  const row = side === 'base' ? baseRow : mineRow;
  const rowNumber = side === 'base' ? baseRowNumber : mineRowNumber;
  if (!row || rowNumber == null || rowNumber <= 0) return null;

  const mergeRange = findWorkbookMergeRange(
    side === 'base' ? baseMergeRanges : mineMergeRanges,
    rowNumber,
    preferredColumn,
  );
  const colIndex = mergeRange?.startCol ?? preferredColumn;
  const cell = row.cells[colIndex] ?? { value: '', formula: '' };
  const colLabel = getWorkbookColumnLabel(colIndex);

  return {
    kind: 'cell',
    sheetName,
    side,
    versionLabel: '',
    rowNumber,
    colIndex,
    colLabel,
    address: `${colLabel}${rowNumber}`,
    value: cell.value,
    formula: cell.formula,
  };
}

function findParent(parent: number[], index: number): number {
  if (parent[index] === index) return index;
  parent[index] = findParent(parent, parent[index]!);
  return parent[index]!;
}

function unionParent(parent: number[], left: number, right: number) {
  const leftRoot = findParent(parent, left);
  const rightRoot = findParent(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function intervalsTouch(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA <= (endB + 1) && endA >= (startB - 1);
}

function mergeLineIdxs(lineIdxArrays: number[][]): number[] {
  return Array.from(new Set(lineIdxArrays.flatMap((lineIdxs) => lineIdxs)))
    .sort((left, right) => left - right);
}

function compareWorkbookDiffRegionNodes(
  left: WorkbookDiffRegionNode,
  right: WorkbookDiffRegionNode,
): number {
  return left.startRowIndex - right.startRowIndex
    || left.startCol - right.startCol
    || left.endRowIndex - right.endRowIndex
    || left.endCol - right.endCol
    || Number(left.hasBaseSide) - Number(right.hasBaseSide)
    || Number(left.hasMineSide) - Number(right.hasMineSide)
    || (left.baseRowStart ?? -1) - (right.baseRowStart ?? -1)
    || (left.baseRowEnd ?? -1) - (right.baseRowEnd ?? -1)
    || (left.mineRowStart ?? -1) - (right.mineRowStart ?? -1)
    || (left.mineRowEnd ?? -1) - (right.mineRowEnd ?? -1)
    || left.anchorLineIdx - right.anchorLineIdx;
}

function compareWorkbookDiffRegionBlocks(
  left: WorkbookDiffRegionBlock,
  right: WorkbookDiffRegionBlock,
): number {
  return left.startRowIndex - right.startRowIndex
    || left.startCol - right.startCol
    || left.endRowIndex - right.endRowIndex
    || left.endCol - right.endCol
    || Number(left.hasBaseSide) - Number(right.hasBaseSide)
    || Number(left.hasMineSide) - Number(right.hasMineSide);
}

function buildWorkbookDiffRegionNodeKey(node: WorkbookDiffRegionNode): string {
  return [
    node.startRowIndex,
    node.endRowIndex,
    node.startCol,
    node.endCol,
    node.baseRowStart ?? '',
    node.baseRowEnd ?? '',
    node.mineRowStart ?? '',
    node.mineRowEnd ?? '',
    Number(node.hasBaseSide),
    Number(node.hasMineSide),
  ].join(':');
}

function normalizeWorkbookDiffRegionNodes(nodes: WorkbookDiffRegionNode[]): WorkbookDiffRegionNode[] {
  if (nodes.length <= 1) return nodes.slice().sort(compareWorkbookDiffRegionNodes);

  const groups = new Map<string, WorkbookDiffRegionNode[]>();
  nodes.forEach((node) => {
    const key = buildWorkbookDiffRegionNodeKey(node);
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  });

  return Array.from(groups.values())
    .map((group) => {
      const anchorNode = group
        .slice()
        .sort(compareWorkbookDiffRegionNodes)
        .find((node) => node.anchorSelection != null) ?? group[0]!;
      const rowNumberCandidates = group
        .flatMap((node) => [node.rowNumberStart, node.rowNumberEnd])
        .filter((value) => value > 0);

      return {
        ...anchorNode,
        lineIdxs: mergeLineIdxs(group.map((node) => node.lineIdxs ?? [])),
        rowNumberStart: rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0,
        rowNumberEnd: rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0,
        anchorSelection: anchorNode.anchorSelection,
        anchorLineIdx: Math.min(...group.map((node) => node.anchorLineIdx)),
      };
    })
    .sort(compareWorkbookDiffRegionNodes);
}

function buildWorkbookDiffRegionBlock(
  patches: WorkbookDiffRegionNode[],
): WorkbookDiffRegionBlock {
  return {
    startRowIndex: Math.min(...patches.map((patch) => patch.startRowIndex)),
    endRowIndex: Math.max(...patches.map((patch) => patch.endRowIndex)),
    startCol: Math.min(...patches.map((patch) => patch.startCol)),
    endCol: Math.max(...patches.map((patch) => patch.endCol)),
    hasBaseSide: patches.some((patch) => patch.hasBaseSide),
    hasMineSide: patches.some((patch) => patch.hasMineSide),
    patches: patches.slice().sort(compareWorkbookDiffRegionNodes),
  };
}

function patchesBelongToSameVisualRegion(
  left: WorkbookDiffRegionNode,
  right: WorkbookDiffRegionNode,
): boolean {
  const rowsTouch = intervalsTouch(
    left.startRowIndex,
    left.endRowIndex,
    right.startRowIndex,
    right.endRowIndex,
  );
  const colsTouch = intervalsTouch(
    left.startCol,
    left.endCol,
    right.startCol,
    right.endCol,
  );

  return rowsTouch && colsTouch;
}

function buildWorkbookDiffRegionBlocks(
  nodes: WorkbookDiffRegionNode[],
): WorkbookDiffRegionBlock[] {
  const normalizedNodes = normalizeWorkbookDiffRegionNodes(nodes);
  if (normalizedNodes.length === 0) return [];

  const sortedNodeIndexes = normalizedNodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => compareWorkbookDiffRegionNodes(left.node, right.node))
    .map((entry) => entry.index);
  const parent = normalizedNodes.map((_, index) => index);
  const activeNodeIndexes: number[] = [];

  sortedNodeIndexes.forEach((nodeIndex) => {
    const node = normalizedNodes[nodeIndex]!;
    for (let activeIndex = activeNodeIndexes.length - 1; activeIndex >= 0; activeIndex -= 1) {
      const otherIndex = activeNodeIndexes[activeIndex]!;
      const otherNode = normalizedNodes[otherIndex]!;
      if (otherNode.endRowIndex < node.startRowIndex - 1) {
        activeNodeIndexes.splice(activeIndex, 1);
        continue;
      }
      if (patchesBelongToSameVisualRegion(node, otherNode)) {
        unionParent(parent, otherIndex, nodeIndex);
      }
    }
    activeNodeIndexes.push(nodeIndex);
  });

  const groupedNodes = new Map<number, WorkbookDiffRegionNode[]>();
  normalizedNodes.forEach((node, index) => {
    const root = findParent(parent, index);
    const group = groupedNodes.get(root);
    if (group) group.push(node);
    else groupedNodes.set(root, [node]);
  });

  return Array.from(groupedNodes.values())
    .map((groupNodes) => buildWorkbookDiffRegionBlock(groupNodes))
    .sort(compareWorkbookDiffRegionBlocks);
}

function resolveWorkbookDiffRegionRowStart(region: WorkbookDiffRegion): number {
  return region.rowNumberStart > 0 ? region.rowNumberStart : region.startRowIndex;
}

function resolveWorkbookDiffRegionRowEnd(region: WorkbookDiffRegion): number {
  return region.rowNumberEnd > 0 ? region.rowNumberEnd : region.endRowIndex;
}

function buildWorkbookNavigationSheetOrder(
  regions: WorkbookDiffRegion[],
  sheetOrder: string[],
): string[] {
  const nextSheetOrder: string[] = [];
  const seenSheetNames = new Set<string>();

  sheetOrder.forEach((sheetName) => {
    if (seenSheetNames.has(sheetName)) return;
    seenSheetNames.add(sheetName);
    nextSheetOrder.push(sheetName);
  });

  regions.forEach((region) => {
    if (seenSheetNames.has(region.sheetName)) return;
    seenSheetNames.add(region.sheetName);
    nextSheetOrder.push(region.sheetName);
  });

  return nextSheetOrder;
}

function compareWorkbookDiffRegions(
  left: WorkbookDiffRegion,
  right: WorkbookDiffRegion,
  sheetOrderIndexByName: Map<string, number>,
): number {
  const leftSheetOrder = sheetOrderIndexByName.get(left.sheetName);
  const rightSheetOrder = sheetOrderIndexByName.get(right.sheetName);
  if (leftSheetOrder != null && rightSheetOrder != null && leftSheetOrder !== rightSheetOrder) {
    return leftSheetOrder - rightSheetOrder;
  }
  if (leftSheetOrder != null && rightSheetOrder == null) return -1;
  if (leftSheetOrder == null && rightSheetOrder != null) return 1;

  return left.sheetName.localeCompare(right.sheetName)
    || resolveWorkbookDiffRegionRowStart(left) - resolveWorkbookDiffRegionRowStart(right)
    || left.startCol - right.startCol
    || resolveWorkbookDiffRegionRowEnd(left) - resolveWorkbookDiffRegionRowEnd(right)
    || left.endCol - right.endCol;
}

function buildWorkbookNavigationRegions(
  regions: WorkbookDiffRegion[],
  sheetOrder: string[],
): WorkbookDiffRegion[] {
  if (regions.length === 0) return [];

  const navigationSheetOrder = buildWorkbookNavigationSheetOrder(regions, sheetOrder);
  const sheetOrderIndexByName = new Map(
    navigationSheetOrder.map((sheetName, index) => [sheetName, index]),
  );

  return regions
    .slice()
    .sort((left, right) => compareWorkbookDiffRegions(left, right, sheetOrderIndexByName));
}

function buildWorkbookSectionNavigationRegions(params: {
  section: WorkbookSection;
  diffLines: DiffLine[];
  workbookDelta: WorkbookPrecomputedDeltaPayload | null;
  compareMode: WorkbookCompareMode;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
}): WorkbookDiffRegion[] {
  const {
    section,
    diffLines,
    workbookDelta,
    compareMode,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
  } = params;
  const sectionRows = workbookDelta?.sections.find((entry) => entry.name === section.name)?.rows ?? [];
  if (sectionRows.length === 0) return [];

  const baseMergeRanges = baseWorkbookMetadata?.sheets[section.name]?.mergeRanges ?? [];
  const mineMergeRanges = mineWorkbookMetadata?.sheets[section.name]?.mergeRanges ?? [];
  const changedSectionRows = sectionRows.filter((row) => (
    row.changedColumns.length > 0
    || row.cellDeltas.some((delta) => delta.changed)
  ));
  if (changedSectionRows.length === 0) return [];

  const sectionRowIndexByRow = new Map(sectionRows.map((row, rowIndex) => [row, rowIndex]));
  const changedLineIdxs = new Set(
    changedSectionRows.flatMap((row) => (
      row.lineIdxs.length > 0
        ? row.lineIdxs
        : [row.leftLineIdx, row.rightLineIdx].filter((value): value is number => value != null)
    )),
  );
  const parsedRowsByLineIdx = new Map<number, { baseRow: WorkbookRowDisplayLine | null; mineRow: WorkbookRowDisplayLine | null }>();
  const getParsedChangedRows = (lineIdx: number) => {
    const cached = parsedRowsByLineIdx.get(lineIdx);
    if (cached) return cached;
    const line = diffLines[lineIdx] ?? null;
    const value = {
      baseRow: (() => {
        if (!changedLineIdxs.has(lineIdx)) return null;
        const parsed = parseWorkbookDisplayLine(line?.base ?? null);
        return parsed?.kind === 'row' ? parsed : null;
      })(),
      mineRow: (() => {
        if (!changedLineIdxs.has(lineIdx)) return null;
        const parsed = parseWorkbookDisplayLine(line?.mine ?? null);
        return parsed?.kind === 'row' ? parsed : null;
      })(),
    };
    parsedRowsByLineIdx.set(lineIdx, value);
    return value;
  };

  const rowInfos = changedSectionRows.map((row) => {
    const leftLine = row.leftLineIdx != null ? (diffLines[row.leftLineIdx] ?? null) : null;
    const rightLine = row.rightLineIdx != null ? (diffLines[row.rightLineIdx] ?? null) : null;
    const parsedLeftRows = row.leftLineIdx != null ? getParsedChangedRows(row.leftLineIdx) : null;
    const parsedRightRows = row.rightLineIdx != null ? getParsedChangedRows(row.rightLineIdx) : null;
    const baseRow = parsedLeftRows?.baseRow ?? parsedRightRows?.baseRow ?? null;
    const mineRow = parsedRightRows?.mineRow ?? parsedLeftRows?.mineRow ?? null;

    return {
      row,
      rowIndex: sectionRowIndexByRow.get(row) ?? 0,
      baseRow,
      mineRow,
      baseRowNumber: row.baseRowNumber ?? baseRow?.rowNumber ?? null,
      mineRowNumber: row.mineRowNumber ?? mineRow?.rowNumber ?? null,
      leftLineType: leftLine?.type ?? null,
      rightLineType: rightLine?.type ?? null,
    };
  });

  const baseRowIndexByNumber = new Map<number, number>();
  const mineRowIndexByNumber = new Map<number, number>();
  sectionRows.forEach((row, rowIndex) => {
    if (row.baseRowNumber != null) baseRowIndexByNumber.set(row.baseRowNumber, rowIndex);
    if (row.mineRowNumber != null) mineRowIndexByNumber.set(row.mineRowNumber, rowIndex);
  });

  const nodes: WorkbookDiffRegionNode[] = [];

  rowInfos.forEach((entry) => {
    const changedColumns = entry.row.changedColumns.length > 0
      ? entry.row.changedColumns
      : entry.row.cellDeltas.filter((delta) => delta.changed).map((delta) => delta.column);
    if (changedColumns.length === 0) return;

    const cellDeltaByColumn = new Map(entry.row.cellDeltas.map((delta) => [delta.column, delta]));

    changedColumns.forEach((column) => {
      const cellDelta = cellDeltaByColumn.get(column)
        ?? buildFallbackCellDeltaPayload(entry.baseRow, entry.mineRow, column, compareMode);
      if (!cellDelta.changed) return;

      const baseRange = entry.baseRowNumber != null
        ? findWorkbookMergeRange(baseMergeRanges, entry.baseRowNumber, column)
        : null;
      const mineRange = entry.mineRowNumber != null
        ? findWorkbookMergeRange(mineMergeRanges, entry.mineRowNumber, column)
        : null;
      const startCol = Math.min(baseRange?.startCol ?? column, mineRange?.startCol ?? column);
      const endCol = Math.max(baseRange?.endCol ?? column, mineRange?.endCol ?? column);
      const baseRowStart = baseRange?.startRow ?? entry.baseRowNumber;
      const baseRowEnd = baseRange?.endRow ?? entry.baseRowNumber;
      const mineRowStart = mineRange?.startRow ?? entry.mineRowNumber;
      const mineRowEnd = mineRange?.endRow ?? entry.mineRowNumber;
      const startRowIndex = Math.min(
        entry.rowIndex,
        resolveWorkbookRowIndex(baseRowStart, entry.rowIndex, baseRowIndexByNumber),
        resolveWorkbookRowIndex(mineRowStart, entry.rowIndex, mineRowIndexByNumber),
      );
      const endRowIndex = Math.max(
        entry.rowIndex,
        resolveWorkbookRowIndex(baseRowEnd, entry.rowIndex, baseRowIndexByNumber),
        resolveWorkbookRowIndex(mineRowEnd, entry.rowIndex, mineRowIndexByNumber),
      );
      const hasBaseSide = Boolean(entry.baseRow && cellDelta.kind !== 'add');
      const hasMineSide = Boolean(entry.mineRow && cellDelta.kind !== 'delete');
      const rowNumberCandidates = [baseRowStart, baseRowEnd, mineRowStart, mineRowEnd]
        .filter((value): value is number => value != null && value > 0);
      const rowNumberStart = rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0;
      const rowNumberEnd = rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0;
      const preferMineAnchor = entry.rightLineType === 'add';
      const preferBaseAnchor = entry.leftLineType === 'delete';
      const anchorSelection = hasBaseSide && !hasMineSide
        ? buildWorkbookAnchorSelection({
            sheetName: section.name,
            baseRow: entry.baseRow,
            mineRow: null,
            baseRowNumber: entry.baseRowNumber,
            mineRowNumber: null,
            preferredColumn: startCol,
            baseMergeRanges,
            mineMergeRanges,
            preferMineAnchor: false,
            preferBaseAnchor: true,
          })
        : hasMineSide && !hasBaseSide
          ? buildWorkbookAnchorSelection({
              sheetName: section.name,
              baseRow: null,
              mineRow: entry.mineRow,
              baseRowNumber: null,
              mineRowNumber: entry.mineRowNumber,
              preferredColumn: startCol,
              baseMergeRanges,
              mineMergeRanges,
              preferMineAnchor: true,
              preferBaseAnchor: false,
            })
          : buildWorkbookAnchorSelection({
              sheetName: section.name,
              baseRow: entry.baseRow,
              mineRow: entry.mineRow,
              baseRowNumber: entry.baseRowNumber,
              mineRowNumber: entry.mineRowNumber,
              preferredColumn: startCol,
              baseMergeRanges,
              mineMergeRanges,
              preferMineAnchor,
              preferBaseAnchor,
            });
      const lineIdxs = entry.row.lineIdxs.length > 0 ? entry.row.lineIdxs : [entry.row.lineIdx];

      nodes.push({
        startRowIndex,
        endRowIndex,
        startCol,
        endCol,
        baseRowStart,
        baseRowEnd,
        mineRowStart,
        mineRowEnd,
        hasBaseSide,
        hasMineSide,
        lineIdxs,
        rowNumberStart,
        rowNumberEnd,
        anchorSelection,
        anchorLineIdx: Math.min(...lineIdxs),
      });
    });
  });

  return buildWorkbookDiffRegionBlocks(nodes)
    .map((block, regionIndex) => {
      const patches = block.patches.slice().sort(compareWorkbookDiffRegionNodes);
      const anchorPatch = patches[0]!;
      const lineIdxs = mergeLineIdxs(patches.map((patch) => patch.lineIdxs ?? []));
      const rowNumberCandidates = patches
        .flatMap((patch) => [patch.rowNumberStart, patch.rowNumberEnd])
        .filter((value) => value > 0);

      return {
        id: `${section.name}:${block.startRowIndex}:${block.startCol}:${regionIndex}`,
        sheetName: section.name,
        startRowIndex: block.startRowIndex,
        endRowIndex: block.endRowIndex,
        startCol: block.startCol,
        endCol: block.endCol,
        rowNumberStart: rowNumberCandidates.length > 0 ? Math.min(...rowNumberCandidates) : 0,
        rowNumberEnd: rowNumberCandidates.length > 0 ? Math.max(...rowNumberCandidates) : 0,
        lineStartIdx: Math.min(...lineIdxs),
        lineEndIdx: Math.max(...lineIdxs),
        anchorLineIdx: anchorPatch.anchorLineIdx,
        hasBaseSide: block.hasBaseSide,
        hasMineSide: block.hasMineSide,
        anchorSelection: anchorPatch.anchorSelection,
        patches,
      } satisfies WorkbookDiffRegion;
    })
    .sort((left, right) => (
      left.startRowIndex - right.startRowIndex
      || left.startCol - right.startCol
      || left.endRowIndex - right.endRowIndex
      || left.endCol - right.endCol
    ));
}

export function prepareWorkbookProjection({
  diffLines,
  workbookDelta,
  compareMode,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
}: PreparedWorkbookProjectionInput): PreparedWorkbookProjectionResult {
  if (!diffLines || diffLines.length === 0) {
    return {
      sections: [],
      navigationRegions: [],
    };
  }

  const sections = buildWorkbookSectionsFromDelta(
    workbookDelta,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
  ) ?? getWorkbookSections(diffLines, compareMode);
  if (!workbookDelta) {
    return {
      sections,
      navigationRegions: [],
    };
  }

  const regions = sections.flatMap((section) => buildWorkbookSectionNavigationRegions({
    section,
    diffLines,
    workbookDelta,
    compareMode,
    baseWorkbookMetadata,
    mineWorkbookMetadata,
  }));

  return {
    sections,
    navigationRegions: buildWorkbookNavigationRegions(
      regions,
      sections.map((section) => section.name),
    ),
  };
}
