import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';
import type {
  SplitRow,
  WorkbookCompareMode,
  WorkbookHiddenColumnSegment,
  WorkbookMergeRange,
  WorkbookMetadataMap,
  WorkbookMetadataSource,
  WorkbookSheetMetadata,
  WorkbookSheetPresentation,
} from '@/types';
import { parseWorkbookDisplayLine } from '@/utils/workbook/workbookDisplay';
import { hasWorkbookCellContent } from '@/utils/workbook/workbookCellContract';
import { buildWorkbookHiddenColumnSegments } from '@/utils/workbook/workbookManualVisibility';

const ZIP_WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm']);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  textNodeName: '#text',
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
});

type XmlNode = Record<string, unknown>;

export type {
  WorkbookHiddenColumnSegment,
  WorkbookMergeRange,
  WorkbookMetadataMap,
  WorkbookSheetMetadata,
  WorkbookSheetPresentation,
};

const sheetPresentationCache = new WeakMap<SplitRow[], Map<string, WorkbookSheetPresentation>>();
const cacheObjectIds = new WeakMap<object, number>();
let nextCacheObjectId = 1;

function asXmlNode(value: unknown): XmlNode | null {
  return value != null && typeof value === 'object' ? value as XmlNode : null;
}

function asXmlNodeArray(value: unknown): XmlNode[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(asXmlNode).filter((item): item is XmlNode => item != null);
}

function getXmlString(node: XmlNode | null, key: string): string {
  const value = node?.[key];
  return typeof value === 'string' ? value : '';
}

function getCacheObjectId(value: object | null | undefined): number {
  if (!value) return 0;
  const existing = cacheObjectIds.get(value);
  if (existing) return existing;
  const nextId = nextCacheObjectId;
  nextCacheObjectId += 1;
  cacheObjectIds.set(value, nextId);
  return nextId;
}

function getFileExtension(name: string): string {
  const normalized = name.trim().toLowerCase();
  const idx = normalized.lastIndexOf('.');
  return idx >= 0 ? normalized.slice(idx) : '';
}

function isZipWorkbookFileName(name: string): boolean {
  return ZIP_WORKBOOK_EXTENSIONS.has(getFileExtension(name));
}

function getZipEntry(zip: Record<string, Uint8Array>, entryPath: string): Uint8Array | null {
  if (zip[entryPath]) return zip[entryPath];
  const normalized = entryPath.replace(/\\/g, '/');
  return zip[normalized] ?? null;
}

function parseXml(zip: Record<string, Uint8Array>, entryPath: string): XmlNode | null {
  const entry = getZipEntry(zip, entryPath);
  if (!entry) return null;
  return asXmlNode(xmlParser.parse(strFromU8(entry)));
}

function normalizeWorksheetPath(target: string): string {
  const trimmed = target.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed.slice(1);
  if (trimmed.startsWith('xl/')) return trimmed;
  return `xl/${trimmed}`;
}

function getColumnIndex(cellRef: string): number {
  const letters = cellRef.toUpperCase().match(/[A-Z]+/)?.[0] ?? '';
  let value = 0;
  for (let i = 0; i < letters.length; i += 1) {
    value = (value * 26) + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, value - 1);
}

function getRowNumber(cellRef: string): number {
  const digits = cellRef.match(/\d+/)?.[0] ?? '1';
  return Math.max(1, Number(digits) || 1);
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  }
  return false;
}

function parseWorkbookSheets(zip: Record<string, Uint8Array>): { name: string; path: string }[] {
  const workbookXml = parseXml(zip, 'xl/workbook.xml');
  const relsXml = parseXml(zip, 'xl/_rels/workbook.xml.rels');
  const relationships = asXmlNodeArray(asXmlNode(relsXml?.Relationships)?.Relationship);
  const relMap = new Map<string, string>();

  relationships.forEach(rel => {
    const id = getXmlString(rel, 'Id');
    const target = getXmlString(rel, 'Target');
    if (id && target) relMap.set(id, normalizeWorksheetPath(target));
  });

  return asXmlNodeArray(asXmlNode(asXmlNode(workbookXml?.workbook)?.sheets)?.sheet)
    .filter((sheet) => {
      const state = getXmlString(sheet, 'state').trim().toLowerCase();
      return state !== 'hidden' && state !== 'veryhidden';
    })
    .map((sheet, index) => {
      const sheetName = getXmlString(sheet, 'name') || `Sheet${index + 1}`;
      const relId = getXmlString(sheet, 'r:id');
      const sheetPath = relMap.get(relId) ?? `xl/worksheets/sheet${index + 1}.xml`;
      return { name: sheetName, path: sheetPath };
    })
    .filter(sheet => Boolean(sheet.path));
}

function parseMergeRange(ref: string): WorkbookMergeRange | null {
  const [startRef, endRef] = ref.split(':');
  if (!startRef) return null;
  const resolvedEndRef = endRef || startRef;
  return {
    startRow: getRowNumber(startRef),
    endRow: getRowNumber(resolvedEndRef),
    startCol: getColumnIndex(startRef),
    endCol: getColumnIndex(resolvedEndRef),
  };
}

function parseSheetMetadata(
  zip: Record<string, Uint8Array>,
  sheetName: string,
  sheetPath: string,
): WorkbookSheetMetadata {
  const sheetXml = parseXml(zip, sheetPath);
  const hiddenColumns = new Set<number>();
  const mergeRanges: WorkbookMergeRange[] = [];

  asXmlNodeArray(asXmlNode(sheetXml?.worksheet)?.cols)
    .flatMap(cols => asXmlNodeArray(cols.col))
    .forEach(col => {
      if (!isTruthyFlag(col.hidden)) return;
      const min = Math.max(1, Number(col.min) || 1);
      const max = Math.max(min, Number(col.max) || min);
      for (let colIndex = min - 1; colIndex <= max - 1; colIndex += 1) {
        hiddenColumns.add(colIndex);
      }
    });

  asXmlNodeArray(asXmlNode(asXmlNode(sheetXml?.worksheet)?.mergeCells)?.mergeCell)
    .map(mergeCell => getXmlString(mergeCell, 'ref'))
    .filter(Boolean)
    .forEach(ref => {
      const parsed = parseMergeRange(ref);
      if (parsed) mergeRanges.push(parsed);
    });

  return {
    name: sheetName,
    hiddenColumns: [...hiddenColumns].sort((left, right) => left - right),
    mergeRanges,
  };
}

export function parseWorkbookMetadata(bytes: Uint8Array | null, fileName: string): WorkbookMetadataMap | null {
  if (!bytes || bytes.length === 0 || !isZipWorkbookFileName(fileName)) return null;

  try {
    const zip = unzipSync(bytes);
    const sheets = parseWorkbookSheets(zip);
    const metadata: WorkbookMetadataMap = { sheets: {} };

    sheets.forEach(sheet => {
      metadata.sheets[sheet.name] = parseSheetMetadata(zip, sheet.name, sheet.path);
    });

    return metadata;
  } catch {
    return null;
  }
}

function resolveWorkbookName(primaryName: string, fallbackName: string): string {
  return [primaryName, fallbackName].find(isZipWorkbookFileName) ?? '';
}

export function resolveWorkbookMetadata(data: WorkbookMetadataSource): {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
} {
  const baseName = resolveWorkbookName(data.baseName, data.fileName);
  const mineName = resolveWorkbookName(data.mineName, data.fileName);

  return {
    base: parseWorkbookMetadata(
      data.baseBytes,
      baseName,
    ),
    mine: parseWorkbookMetadata(
      data.mineBytes,
      mineName,
    ),
  };
}

function collectUsedColumns(
  rows: SplitRow[],
  side: 'base' | 'mine',
  compareMode: WorkbookCompareMode = 'strict',
): Set<number> {
  const used = new Set<number>();

  rows.forEach(row => {
    const content = side === 'base'
      ? row.left?.base ?? ''
      : row.right?.mine ?? '';
    const parsed = parseWorkbookDisplayLine(content);
    if (!parsed || parsed.kind !== 'row') return;

    parsed.cells.forEach((cell, index) => {
      if (hasWorkbookCellContent(cell, compareMode)) {
        used.add(index);
      }
    });
  });

  return used;
}

function collectMergedColumns(ranges: WorkbookMergeRange[]): Set<number> {
  const cols = new Set<number>();

  ranges.forEach(range => {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      cols.add(col);
    }
  });

  return cols;
}

export function buildWorkbookSheetPresentation(
  rows: SplitRow[],
  sheetName: string,
  baseMetadata: WorkbookMetadataMap | null,
  mineMetadata: WorkbookMetadataMap | null,
  fallbackColumnCount: number,
  includeHiddenColumns = false,
  compareMode: WorkbookCompareMode = 'strict',
  manualHiddenColumns: number[] = [],
): WorkbookSheetPresentation {
  const baseSheet = baseMetadata?.sheets[sheetName] ?? null;
  const mineSheet = mineMetadata?.sheets[sheetName] ?? null;
  let rowsCache = sheetPresentationCache.get(rows);
  if (!rowsCache) {
    rowsCache = new Map<string, WorkbookSheetPresentation>();
    sheetPresentationCache.set(rows, rowsCache);
  }

  const cacheKey = [
    sheetName,
    fallbackColumnCount,
    includeHiddenColumns ? '1' : '0',
    compareMode,
    manualHiddenColumns.join(','),
    getCacheObjectId(baseSheet),
    getCacheObjectId(mineSheet),
  ].join('::');
  const cachedPresentation = rowsCache.get(cacheKey);
  if (cachedPresentation) return cachedPresentation;

  const baseHidden = new Set(baseSheet?.hiddenColumns ?? []);
  const mineHidden = new Set(mineSheet?.hiddenColumns ?? []);
  const manualHidden = new Set(manualHiddenColumns);

  const candidateColumns = new Set<number>();
  [
    collectUsedColumns(rows, 'base', compareMode),
    collectUsedColumns(rows, 'mine', compareMode),
    collectMergedColumns(baseSheet?.mergeRanges ?? []),
    collectMergedColumns(mineSheet?.mergeRanges ?? []),
  ].forEach(columnSet => {
    columnSet.forEach(column => candidateColumns.add(column));
  });

  if (includeHiddenColumns) {
    (baseSheet?.hiddenColumns ?? []).forEach(column => candidateColumns.add(column));
    (mineSheet?.hiddenColumns ?? []).forEach(column => candidateColumns.add(column));
  }

  if (candidateColumns.size === 0) {
    for (let column = 0; column < Math.max(1, fallbackColumnCount); column += 1) {
      candidateColumns.add(column);
    }
  }

  const allColumns = [...candidateColumns].sort((left, right) => left - right);

  let visibleColumns = allColumns
    .filter(column => (
      includeHiddenColumns
      || (
        !(baseHidden.has(column) && mineHidden.has(column))
        && !manualHidden.has(column)
      )
    ));

  if (visibleColumns.length === 0) visibleColumns = [0];

  const presentation: WorkbookSheetPresentation = {
    allColumns,
    visibleColumns,
    hiddenColumnSegments: includeHiddenColumns
      ? []
      : buildWorkbookHiddenColumnSegments(allColumns, manualHiddenColumns),
    baseMergeRanges: baseSheet?.mergeRanges ?? [],
    mineMergeRanges: mineSheet?.mergeRanges ?? [],
  };
  rowsCache.set(cacheKey, presentation);
  return presentation;
}
