import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';
import { getRuntimeLocale, translate, type Locale } from '@/i18n/core';
import type { WorkbookCellDisplay } from '@/utils/workbook/workbookDisplay';
import { createWorkbookRowLine, createWorkbookSheetLine } from '@/utils/workbook/workbookDisplay';
import {
  normalizeWorkbookRowNumber,
  parseWorkbookColumnIndexFromCellRef,
} from '@/utils/workbook/workbookLimits';

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

type XmlNode = Record<string, unknown>;

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

function collectOpenXmlText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(collectOpenXmlText).join('');
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ('#text' in record) {
      return collectOpenXmlText(record['#text']);
    }
    return [
      record.t,
      record.r,
      record.is,
    ].map(collectOpenXmlText).join('');
  }
  return '';
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

function normalizeCellValue(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, ' / ')
    .replace(/\t/g, '    ');
}

function buildUnsupportedWorkbookMessage(fileName: string, locale: Locale): string {
  const ext = getFileExtension(fileName) || translate(locale, 'commonUnknown');
  return [
    `[${translate(locale, 'workbookParserHeader')}]`,
    translate(locale, 'workbookParserUnsupportedFormat', { ext }),
    translate(locale, 'workbookParserSupportedFormatsHint'),
    translate(locale, 'workbookParserRustHint'),
  ].join('\n');
}

function buildWorkbookErrorMessage(fileName: string, error: unknown, locale: Locale): string {
  const message = error instanceof Error ? error.message : String(error);
  const resolvedFileName = fileName || translate(locale, 'commonUnknown');
  return [
    `[${translate(locale, 'workbookParserHeader')}]`,
    translate(locale, 'workbookParserFailed', { fileName: resolvedFileName }),
    message,
  ].join('\n');
}

function parseSharedStrings(zip: Record<string, Uint8Array>): string[] {
  const xml = parseXml(zip, 'xl/sharedStrings.xml');
  const items = asXmlNodeArray(asXmlNode(xml?.sst)?.si);
  return items.map(item => normalizeCellValue(collectOpenXmlText(item)));
}

function parseCellValue(cell: XmlNode, sharedStrings: string[]): WorkbookCellDisplay {
  const type = getXmlString(cell, 't');
  const rawValue = normalizeCellValue(collectOpenXmlText(cell.v));
  const formula = normalizeCellValue(collectOpenXmlText(cell.f));

  const value = type === 's'
    ? (() => {
    const index = Number(rawValue.trim());
      return Number.isFinite(index) ? normalizeCellValue(sharedStrings[index] ?? '') : rawValue;
    })()
    : type === 'inlineStr'
      ? normalizeCellValue(collectOpenXmlText(cell.is))
      : type === 'b'
        ? (rawValue === '1' ? 'TRUE' : 'FALSE')
        : type === 'e'
          ? (rawValue ? `#${rawValue}` : '#ERROR')
          : rawValue;

  if (formula) {
    const normalizedFormula = `=${formula}`;
    return {
      value,
      formula: normalizedFormula,
    };
  }

  return { value, formula: '' };
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

function serializeWorkbookSheet(
  zip: Record<string, Uint8Array>,
  sheetName: string,
  sheetPath: string,
  sharedStrings: string[],
): string[] {
  const sheetXml = parseXml(zip, sheetPath);
  const rows = asXmlNodeArray(asXmlNode(asXmlNode(sheetXml?.worksheet)?.sheetData)?.row);
  const output: string[] = [createWorkbookSheetLine(sheetName)];

  if (rows.length === 0) {
    return output;
  }

  rows.forEach((row, index) => {
    const rowNumber = normalizeWorkbookRowNumber(row.r, index + 1);
    let fallbackColumnIndex = 0;
    const cells = asXmlNodeArray(row.c)
      .map((cell) => {
        const ref = getXmlString(cell, 'r');
        const colIndex = ref
          ? parseWorkbookColumnIndexFromCellRef(ref)
          : fallbackColumnIndex;
        if (colIndex == null) return null;

        fallbackColumnIndex = colIndex + 1;
        const value = parseCellValue(cell, sharedStrings);
        return { colIndex, value };
      })
      .filter((cell): cell is { colIndex: number; value: WorkbookCellDisplay } => (
        cell != null && (cell.value.value !== '' || cell.value.formula !== '')
      ))
      .sort((left, right) => left.colIndex - right.colIndex);

    const maxCol = (cells[cells.length - 1]?.colIndex ?? -1) + 1;
    const rowValues: WorkbookCellDisplay[] = Array.from(
      { length: Math.max(0, maxCol) },
      () => ({ value: '', formula: '' }),
    );
    cells.forEach(cell => {
      rowValues[cell.colIndex] = cell.value;
    });
    output.push(createWorkbookRowLine(rowNumber, rowValues));
  });

  return output;
}

export function workbookBytesToText(bytes: Uint8Array, fileName: string, locale: Locale = getRuntimeLocale()): string {
  if (!isZipWorkbookFileName(fileName)) {
    return buildUnsupportedWorkbookMessage(fileName, locale);
  }

  try {
    const zip = unzipSync(bytes);
    const sheets = parseWorkbookSheets(zip);
    const sharedStrings = parseSharedStrings(zip);

    if (sheets.length === 0) {
      return [
        `[${translate(locale, 'workbookParserHeader')}]`,
        translate(locale, 'workbookParserNoWorksheets', {
          fileName: fileName || translate(locale, 'commonUnknown'),
        }),
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
    return buildWorkbookErrorMessage(fileName, error, locale);
  }
}

export interface DiffTextSourceInput {
  baseName: string;
  mineName: string;
  fileName: string;
  baseContent: string | null;
  mineContent: string | null;
  baseBytes: Uint8Array | null;
  mineBytes: Uint8Array | null;
}

function normalizeSideText(
  name: string,
  fallbackName: string,
  content: string | null,
  bytes: Uint8Array | null,
  locale: Locale,
): string {
  if (content != null && content !== '') {
    return content;
  }
  if (bytes && bytes.byteLength > 0) {
    const workbookName = [name, fallbackName].find(isWorkbookFileName) ?? (name || fallbackName);
    if (workbookName && isWorkbookFileName(workbookName)) {
      return workbookBytesToText(bytes, workbookName, locale);
    }
    return decodeUtf8(bytes);
  }
  return content ?? '';
}

export function resolveDiffTexts(data: DiffTextSourceInput, locale: Locale = getRuntimeLocale()): { baseText: string; mineText: string } {
  return {
    baseText: normalizeSideText(
      data.baseName,
      data.fileName,
      data.baseContent,
      data.baseBytes,
      locale,
    ),
    mineText: normalizeSideText(
      data.mineName,
      data.fileName,
      data.mineContent,
      data.mineBytes,
      locale,
    ),
  };
}
