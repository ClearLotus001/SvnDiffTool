import type {
  DiffLine,
  WorkbookCompareMode,
  WorkbookSection,
} from '@/types';
import { hasWorkbookCellContent } from '@/utils/workbook/workbookCellContract';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import { buildWorkbookRowSignature } from '@/utils/workbook/workbookAlignment';

export type { WorkbookSection };

export interface WorkbookLineSheetContext {
  baseSheetName: string | null;
  mineSheetName: string | null;
}

export interface WorkbookLineSheetContextLookup {
  get(lineIdx: number): WorkbookLineSheetContext | null;
  materialize(): WorkbookLineSheetContext[];
}

const workbookLineSheetContextsCache = new WeakMap<DiffLine[], WorkbookLineSheetContext[]>();
const workbookLineSheetContextLookupCache = new WeakMap<DiffLine[], WorkbookLineSheetContextLookup>();
const workbookSectionsCache = new WeakMap<DiffLine[], Map<WorkbookCompareMode, WorkbookSection[]>>();

function parseWorkbookSheetDisplayLine(line: string | null | undefined): string | null {
  if (typeof line !== 'string' || !line.startsWith('@@sheet\t')) return null;
  return line.slice('@@sheet\t'.length).trim();
}

export function resolveWorkbookSheetNameForLineContext(params: {
  line: DiffLine | null | undefined;
  context: WorkbookLineSheetContext | null | undefined;
  preferredSheetName?: string | null | undefined;
}): string | null {
  const { line, context, preferredSheetName = null } = params;
  if (!line || !context) return preferredSheetName ?? null;

  const { baseSheetName, mineSheetName } = context;
  if (baseSheetName && mineSheetName && baseSheetName === mineSheetName) {
    return baseSheetName;
  }
  if (preferredSheetName && (preferredSheetName === baseSheetName || preferredSheetName === mineSheetName)) {
    return preferredSheetName;
  }
  if (line.type === 'add') return mineSheetName ?? baseSheetName ?? null;
  if (line.type === 'delete') return baseSheetName ?? mineSheetName ?? null;

  const parsedBase = line.base ? parseWorkbookDisplayLine(line.base) : null;
  const parsedMine = line.mine ? parseWorkbookDisplayLine(line.mine) : null;
  if (parsedBase?.kind === 'row' && parsedMine?.kind !== 'row') return baseSheetName ?? mineSheetName ?? null;
  if (parsedMine?.kind === 'row' && parsedBase?.kind !== 'row') return mineSheetName ?? baseSheetName ?? null;
  if (parsedBase?.kind === 'sheet' && parsedMine?.kind !== 'sheet') return baseSheetName ?? mineSheetName ?? null;
  if (parsedMine?.kind === 'sheet' && parsedBase?.kind !== 'sheet') return mineSheetName ?? baseSheetName ?? null;

  return mineSheetName ?? baseSheetName ?? preferredSheetName ?? null;
}

interface WorkbookSectionRuntimeStats {
  exactFingerprintParts: string[];
  nonEmptySignatureCounts: Map<string, number>;
  nonEmptySignatureTotal: number;
}

export interface WorkbookSectionChangeSummary {
  added: number;
  deleted: number;
  renamed: number;
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

function applyWorkbookRowToSection(
  section: WorkbookSection,
  stats: WorkbookSectionRuntimeStats,
  lineIdx: number,
  row: Extract<ReturnType<typeof parseWorkbookDisplayLine>, { kind: 'row' }>,
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
  const hasVisibleCell = row.cells.some(cell => hasWorkbookCellContent(cell, compareMode));
  if (section.firstDataLineIdx == null && hasVisibleCell) {
    section.firstDataLineIdx = lineIdx;
    section.firstDataRowNumber = row.rowNumber;
  }
}

function createWorkbookSectionRuntimeStats(): WorkbookSectionRuntimeStats {
  return {
    exactFingerprintParts: [],
    nonEmptySignatureCounts: new Map<string, number>(),
    nonEmptySignatureTotal: 0,
  };
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

  const deletedSections = sections.filter(section => section.changeType === 'delete');
  const addedSections = sections.filter(section => section.changeType === 'add');
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
      const deletedSection = sections.find(section => section.name === candidate.deletedName);
      const addedSection = sections.find(section => section.name === candidate.addedName);
      if (!deletedSection || !addedSection) return;
      applyWorkbookSectionRename(deletedSection, addedSection);
      usedDeletedNames.add(deletedSection.name);
      usedAddedNames.add(addedSection.name);
    });
}

export function buildWorkbookLineSheetContexts(
  diffLines: DiffLine[],
): WorkbookLineSheetContext[] {
  const cached = workbookLineSheetContextsCache.get(diffLines);
  if (cached) return cached;

  const lookup = buildWorkbookLineSheetContextLookup(diffLines);
  const contexts = lookup.materialize();
  workbookLineSheetContextsCache.set(diffLines, contexts);
  return contexts;
}

export function buildWorkbookLineSheetContextLookup(
  diffLines: DiffLine[],
): WorkbookLineSheetContextLookup {
  const cached = workbookLineSheetContextLookupCache.get(diffLines);
  if (cached) return cached;

  const contexts: WorkbookLineSheetContext[] = [];
  let currentBaseSheetName: string | null = null;
  let currentMineSheetName: string | null = null;
  let builtThroughIndex = -1;

  const ensureBuiltThrough = (lineIdx: number) => {
    const targetIndex = Math.min(lineIdx, diffLines.length - 1);
    if (targetIndex <= builtThroughIndex) return;

    for (let index = builtThroughIndex + 1; index <= targetIndex; index += 1) {
      const line = diffLines[index];
      const baseSheetName = parseWorkbookSheetDisplayLine(line?.base);
      const mineSheetName = parseWorkbookSheetDisplayLine(line?.mine);

      if (baseSheetName != null) currentBaseSheetName = baseSheetName;
      if (mineSheetName != null) currentMineSheetName = mineSheetName;

      contexts[index] = {
        baseSheetName: currentBaseSheetName,
        mineSheetName: currentMineSheetName,
      };
    }

    builtThroughIndex = targetIndex;
  };

  const lookup: WorkbookLineSheetContextLookup = {
    get(lineIdx) {
      if (lineIdx < 0 || lineIdx >= diffLines.length) return null;
      ensureBuiltThrough(lineIdx);
      return contexts[lineIdx] ?? null;
    },
    materialize() {
      ensureBuiltThrough(diffLines.length - 1);
      workbookLineSheetContextsCache.set(diffLines, contexts);
      return contexts;
    },
  };

  workbookLineSheetContextLookupCache.set(diffLines, lookup);
  return lookup;
}

export function getWorkbookSections(
  diffLines: DiffLine[],
  compareMode: WorkbookCompareMode = 'strict',
): WorkbookSection[] {
  let compareModeCache = workbookSectionsCache.get(diffLines);
  if (!compareModeCache) {
    compareModeCache = new Map<WorkbookCompareMode, WorkbookSection[]>();
    workbookSectionsCache.set(diffLines, compareModeCache);
  }
  const cached = compareModeCache.get(compareMode);
  if (cached) return cached;

  const sections: WorkbookSection[] = [];
  const sectionIndexByName = new Map<string, number>();
  const runtimeStatsByName = new Map<string, WorkbookSectionRuntimeStats>();
  let currentBaseSheetName: string | null = null;
  let currentMineSheetName: string | null = null;

  diffLines.forEach((line, lineIdx) => {
    const parsedBase = line.base ? parseWorkbookDisplayLine(line.base) : null;
    const parsedMine = line.mine ? parseWorkbookDisplayLine(line.mine) : null;

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
      applyWorkbookRowToSection(
        section,
        stats,
        lineIdx,
        parsedBase,
        compareMode,
      );
    }

    if (parsedMine?.kind === 'row' && currentMineSheetName) {
      const section = ensureWorkbookSection(sections, sectionIndexByName, currentMineSheetName, lineIdx);
      section.hasMineSide = true;
      const stats = runtimeStatsByName.get(currentMineSheetName) ?? createWorkbookSectionRuntimeStats();
      runtimeStatsByName.set(currentMineSheetName, stats);
      applyWorkbookRowToSection(
        section,
        stats,
        lineIdx,
        parsedMine,
        compareMode,
      );
    }
  });

  annotateWorkbookSectionChanges(sections, runtimeStatsByName);
  compareModeCache.set(compareMode, sections);
  return sections;
}

export function summarizeWorkbookSectionChanges(
  sections: WorkbookSection[],
): WorkbookSectionChangeSummary {
  const renamePairs = new Set<string>();

  sections.forEach((section) => {
    if (section.changeType !== 'rename' || !section.renamePeerName) return;
    renamePairs.add([section.name, section.renamePeerName].sort().join('\u001F'));
  });

  return {
    added: sections.filter(section => section.changeType === 'add').length,
    deleted: sections.filter(section => section.changeType === 'delete').length,
    renamed: renamePairs.size,
  };
}

export function findWorkbookSectionIndex(sections: WorkbookSection[], lineIdx: number): number {
  const foundIndex = sections.findIndex(
    section => lineIdx >= section.startLineIdx && lineIdx <= section.endLineIdx,
  );
  return foundIndex >= 0 ? foundIndex : 0;
}

export function getWorkbookColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function getWorkbookColumnLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => getWorkbookColumnLabel(index));
}
