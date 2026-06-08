import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const parserName = process.platform === 'win32' ? 'svn_excel_parser.exe' : 'svn_excel_parser';
const parserPath = path.join(repoRoot, 'rust', 'target', 'release', parserName);

if (!existsSync(parserPath)) {
  console.error(`Missing Rust workbook parser artifact: ${parserPath}`);
  console.error('Run "npm run build:rust" before running workbook integration tests.');
  process.exit(1);
}
