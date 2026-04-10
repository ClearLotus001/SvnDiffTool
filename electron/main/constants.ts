import * as path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

export const APP_ROOT = path.resolve(__dirname, '..', '..');
export const RENDERER_DIST = path.join(APP_ROOT, 'dist');
export const PRELOAD_PATH = path.join(__dirname, '..', 'preload.js');
export const DEV_SERVER_URL = process.env.DEV_SERVER_URL?.trim() || 'http://localhost:5173';
export const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xltm', '.xlsb', '.xls']);
export const RUST_PARSER_NAME = process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser';
export const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: false,
});
export const SPECIAL_BASE_ID = '__base_input__';
export const SPECIAL_MINE_ID = '__mine_input__';
export const REMOTE_HEAD_ID = '__remote_head__';
export const TRAILING_PAREN_VERSION = /\(([^)]+)\)\s*$/;
export const KEYWORD_VERSION = /\b(?:r|rev|revision|ver|version|v)\s*[:#-]?\s*([0-9][\w.-]*)\b/i;
export const RUST_MAX_BUFFER = 256 * 1024 * 1024;
export const SVN_TEXT_MAX_BUFFER = 64 * 1024 * 1024;
export const SVN_BINARY_MAX_BUFFER = 256 * 1024 * 1024;
export const FILE_PAYLOAD_CACHE_LIMIT = 12;
export const REVISION_PAYLOAD_CACHE_LIMIT = 24;
export const FILE_PAYLOAD_CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const REVISION_PAYLOAD_CACHE_MAX_BYTES = 128 * 1024 * 1024;
export const WORKBOOK_COMPARE_CACHE_LIMIT = 8;
export const WORKBOOK_COMPARE_CACHE_MAX_BYTES = 96 * 1024 * 1024;
export const WORKBOOK_COMPARE_CACHE_COMPRESS_MIN_BYTES = 8 * 1024 * 1024;
export const DEV_PROFILE_ROOT = process.env.ELECTRON_DEV_PROFILE_DIR?.trim() || '';
export const AUTO_EXIT_AFTER_LOAD_MS = Number(process.env.SVN_DIFF_AUTO_EXIT_AFTER_LOAD_MS ?? '0');
export const FILE_EQUALITY_CACHE_LIMIT = 24;
export const FILE_EQUALITY_CHUNK_BYTES = 1024 * 1024;
export const DEFAULT_REVISION_QUERY_LIMIT = 50;
export const MAX_REVISION_QUERY_LIMIT = 100;
export const USE_NATIVE_WINDOW_CONTROLS = process.env.SVN_DIFF_NATIVE_WINDOW_CONTROLS === '1';
export const DEFAULT_LAUNCH_MAXIMIZED = true;
export const REVISION_OPTION_PAGES_CACHE_LIMIT = 24;
