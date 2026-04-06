import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(__filename);

interface PackageJsonExports {
  exports?: Record<string, string>;
}

const COMMON_SHIKI_LANGUAGES = new Set<string>([
  'bash',
  'bat',
  'c',
  'cmake',
  'codeowners',
  'cpp',
  'csharp',
  'css',
  'csv',
  'diff',
  'docker',
  'dockerfile',
  'dotenv',
  'go',
  'graphql',
  'groovy',
  'hcl',
  'html',
  'ini',
  'java',
  'javascript',
  'jinja',
  'json',
  'json5',
  'jsonc',
  'jsonl',
  'jsx',
  'kotlin',
  'less',
  'lua',
  'makefile',
  'markdown',
  'mdx',
  'mermaid',
  'mmd',
  'nginx',
  'nix',
  'nu',
  'perl',
  'php',
  'powershell',
  'proto',
  'python',
  'r',
  'ruby',
  'rust',
  'sass',
  'scala',
  'scss',
  'shellscript',
  'sql',
  'swift',
  'tf',
  'tfvars',
  'toml',
  'tsx',
  'typescript',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

function sortLanguages(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function toSupportedLanguagesSource(languages: string[]): string {
  const entries = languages.map((language) => `  ${JSON.stringify(language)},`).join('\n');
  return `// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: npm run generate:shiki-registry

const SUPPORTED_SHIKI_LANGUAGES = [
${entries}
] as const;

export type SupportedShikiLanguage = typeof SUPPORTED_SHIKI_LANGUAGES[number];

const SUPPORTED_SHIKI_LANGUAGE_SET = new Set<string>(SUPPORTED_SHIKI_LANGUAGES);

export function isSupportedShikiLanguage(languageId: string | null | undefined): languageId is SupportedShikiLanguage {
  return typeof languageId === 'string' && SUPPORTED_SHIKI_LANGUAGE_SET.has(languageId);
}
`;
}

function toLanguageRegistrySource(languages: string[]): string {
  const entries = languages.map((language) => (
    `  ${JSON.stringify(language)}: () => import(${JSON.stringify(`@shikijs/langs/${language}`)}).then((module) => module.default),`
  )).join('\n');

  return `// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: npm run generate:shiki-registry

import type { LanguageRegistration } from '@shikijs/types';
import type { SupportedShikiLanguage } from '@/generated/shikiSupportedLanguages';

type LanguageLoader = () => Promise<LanguageRegistration[]>;

export const shikiLanguageRegistry: Record<SupportedShikiLanguage, LanguageLoader> = {
${entries}
};
`;
}

async function main() {
  const langsEntryPath = require.resolve('@shikijs/langs');
  const packageJsonPath = path.join(path.dirname(path.dirname(langsEntryPath)), 'package.json');
  const packageJson = JSON.parse(
    await fs.readFile(packageJsonPath, 'utf-8'),
  ) as PackageJsonExports;
  const profile = process.env.SVN_DIFF_SHIKI_PROFILE === 'full' ? 'full' : 'common';

  const exportsMap = packageJson.exports ?? {};
  const allLanguages = sortLanguages(
    Object.keys(exportsMap)
      .filter((key) => key !== '.')
      .map((key) => key.replace(/^\.\//, '')),
  );
  const languages = profile === 'full'
    ? allLanguages
    : allLanguages.filter((language) => COMMON_SHIKI_LANGUAGES.has(language));

  const generatedDir = path.join(process.cwd(), 'src', 'generated');
  await fs.mkdir(generatedDir, { recursive: true });

  await Promise.all([
    fs.writeFile(
      path.join(generatedDir, 'shikiSupportedLanguages.ts'),
      toSupportedLanguagesSource(languages),
      'utf-8',
    ),
    fs.writeFile(
      path.join(generatedDir, 'shikiLanguageRegistry.ts'),
      toLanguageRegistrySource(languages),
      'utf-8',
    ),
  ]);

  console.log(`Generated Shiki language registry for ${languages.length} entries (${profile} profile).`);
}

void main();
