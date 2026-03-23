import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';
import type { DiffData } from '../types';
import type { WorkbookCellDisplay } from './workbookDisplay';
import { createWorkbookRowLine, createWorkbookSheetLine } from './workbookDisplay';

const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm', '.xlsb', '.xls']);
const ZIP_WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm']);
const textDecoder = new TextDecoder('utf-8');
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  textNodeName: '#text',
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
});

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getFileExtension(name: string): string {
  const normalized = name.trim().toLowerCase();
  const idx = normalized.lastIndexOf('.');
  return idx >= 0 ? normalized.slice(idx) : '';
}

export function isWorkbookFileName(name: string): boolean {
  return WORKBOOK_EXTENSIONS.has(getFileExtension(name));
}

function isZipWorkbookFileName(name: string): boolean {
  return ZIP_WORKBOOK_EXTENSIONS.has(getFileExtension(name));
}

function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function collectText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).map(collectText).join('');
  }
  return '';
}

function getZipEntry(zip: Record<string, Uint8Array>, entryPath: string): Uint8Array | null {
  if (zip[entryPath]) return zip[entryPath];
  const normalized = entryPath.replace(/\\/g, '/');
  return zip[normalized] ?? null;
}

function parseXml(zip: Record<string, Uint8Array>, entryPath: string): any | null {
  const entry = getZipEntry(zip, entryPath);
  if (!entry) return null;
  return xmlParser.parse(strFromU8(entry));
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
  return value;
}

function normalizeCellValue(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' / ')
    .replace(/\t/g, '    ')
    .trim();
}

function buildUnsupportedWorkbookMessage(fileName: string): string {
  const ext = getFileExtension(fileName) || 'unknown';
  return [
    '[Excel Parser]',
    `[不支持的工作簿格式 / Unsupported workbook format: ${ext}]`,
    '当前内置解析器支持 .xlsx / .xlsm / .xltx / .xltm。',
    '如需 .xls / .xlsb 支持，下一步可以切到 Rust 解析器。',
  ].join('\n');
}

function buildWorkbookErrorMessage(fileName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [
    '[Excel Parser]',
    `[解析工作簿失败 / Failed to parse workbook: ${fileName || 'unknown'}]`,
    message,
  ].join('\n');
}

function parseSharedStrings(zip: Record<string, Uint8Array>): string[] {
  const xml = parseXml(zip, 'xl/sharedStrings.xml');
  const items = asArray<any>(xml?.sst?.si);
  return items.map(item => {
    if (item?.t != null) return collectText(item.t);
    const runs = asArray<any>(item?.r);
    return runs.map(run => collectText(run?.t)).join('');
  });
}

function parseCellValue(cell: any, sharedStrings: string[]): WorkbookCellDisplay {
  const type = typeof cell?.t === 'string' ? cell.t : '';
  const rawValue = normalizeCellValue(collectText(cell?.v));
  const formula = normalizeCellValue(collectText(cell?.f));

  let value = '';
  if (type === 's') {
    const index = Number(rawValue);
    value = Number.isFinite(index) ? normalizeCellValue(sharedStrings[index] ?? '') : rawValue;
  } else if (type === 'inlineStr') {
    value = normalizeCellValue(collectText(cell?.is));
  } else if (type === 'b') {
    value = rawValue === '1' ? 'TRUE' : 'FALSE';
  } else if (type === 'e') {
    value = rawValue ? `#${rawValue}` : '#ERROR';
  } else {
    value = rawValue;
  }

  if (formula) {
    const normalizedFormula = `=${formula}`;
    return {
      value: value || normalizedFormula,
      formula: normalizedFormula,
    };
  }

  return { value, formula: '' };
}

function parseWorkbookSheets(zip: Record<string, Uint8Array>): { name: string; path: string }[] {
  const workbookXml = parseXml(zip, 'xl/workbook.xml');
  const relsXml = parseXml(zip, 'xl/_rels/workbook.xml.rels');
  const relationships = asArray<any>(relsXml?.Relationships?.Relationship);
  const relMap = new Map<string, string>();

  relationships.forEach(rel => {
    const id = typeof rel?.Id === 'string' ? rel.Id : '';
    const target = typeof rel?.Target === 'string' ? rel.Target : '';
    if (id && target) relMap.set(id, normalizeWorksheetPath(target));
  });

  return asArray<any>(workbookXml?.workbook?.sheets?.sheet)
    .filter((sheet) => {
      const state = typeof sheet?.state === 'string' ? sheet.state.trim().toLowerCase() : '';
      return state !== 'hidden' && state !== 'veryhidden';
    })
    .map((sheet, index) => {
      const sheetName = typeof sheet?.name === 'string' ? sheet.name : `Sheet${index + 1}`;
      const relId = typeof sheet?.['r:id'] === 'string' ? sheet['r:id'] : '';
      const sheetPath = relMap.get(relId) ?? `xl/worksheets/sheet${index + 1}.xml`;
      return { name: sheetName, path: sheetPath };
    })
    .filter(sheet => Boolean(sheet.path));
}

function serializeWorkbookSheet(
  zip: Record<string, Uint8Array>,
  sheetName: string,
  sheetPath: string,
  sharedStrings: string[],
): string[] {
  const sheetXml = parseXml(zip, sheetPath);
  const rows = asArray<any>(sheetXml?.worksheet?.sheetData?.row);
  const output: string[] = [createWorkbookSheetLine(sheetName)];

  if (rows.length === 0) {
    return output;
  }

  rows.forEach((row, index) => {
    const rowNumber = Number(row?.r) || index + 1;
    const cells = asArray<any>(row?.c)
      .map(cell => {
        const ref = typeof cell?.r === 'string' ? cell.r : '';
        const value = parseCellValue(cell, sharedStrings);
        return { ref, col: ref ? getColumnIndex(ref) : 0, value };
      })
      .filter(cell => cell.value.value !== '' || cell.value.formula !== '')
      .sort((left, right) => left.col - right.col);

    const maxCol = cells[cells.length - 1]?.col ?? 0;
    const rowValues: WorkbookCellDisplay[] = Array.from({ length: maxCol }, () => ({ value: '', formula: '' }));
    cells.forEach(cell => {
      if (cell.col > 0) rowValues[cell.col - 1] = cell.value;
    });
    output.push(createWorkbookRowLine(rowNumber, rowValues));
  });

  return output;
}

export function workbookBytesToText(bytes: Uint8Array, fileName: string): string {
  if (!isZipWorkbookFileName(fileName)) {
    return buildUnsupportedWorkbookMessage(fileName);
  }

  try {
    const zip = unzipSync(bytes);
    const sheets = parseWorkbookSheets(zip);
    const sharedStrings = parseSharedStrings(zip);

    if (sheets.length === 0) {
      return [
        '[Excel Parser]',
        `[未找到工作表 / No worksheets found: ${fileName || 'unknown'}]`,
      ].join('\n');
    }

    return sheets
      .flatMap((sheet, index) => {
        const lines = serializeWorkbookSheet(zip, sheet.name, sheet.path, sharedStrings);
        if (index < sheets.length - 1) lines.push('');
        return lines;
      })
      .join('\n');
  } catch (error) {
    return buildWorkbookErrorMessage(fileName, error);
  }
}

function normalizeSideText(
  name: string,
  fallbackName: string,
  content: string | null,
  bytes: Uint8Array | null,
): string {
  if (content != null && content !== '') {
    return content;
  }
  if (bytes && bytes.byteLength > 0) {
    const workbookName = [name, fallbackName].find(isWorkbookFileName) ?? (name || fallbackName);
    if (workbookName && isWorkbookFileName(workbookName)) {
      return workbookBytesToText(bytes, workbookName);
    }
    return decodeUtf8(bytes);
  }
  return content ?? '';
}

export function resolveDiffTexts(data: DiffData): { baseText: string; mineText: string } {
  return {
    baseText: normalizeSideText(
      data.baseName,
      data.fileName,
      data.baseContent,
      data.baseBytes,
    ),
    mineText: normalizeSideText(
      data.mineName,
      data.fileName,
      data.mineContent,
      data.mineBytes,
    ),
  };
}
