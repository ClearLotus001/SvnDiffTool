import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(__filename);

interface PackageJsonExports {
  exports?: Record<string, string>;
}

function sortLanguages(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function toSupportedLanguagesSource(languages: string[]): string {
  const entries = languages.map((language) => `  ${JSON.stringify(language)},`).join('\n');
  return `// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: npm run generate:shiki-registry

export const SUPPORTED_SHIKI_LANGUAGES = [
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

  const exportsMap = packageJson.exports ?? {};
  const languages = sortLanguages(
    Object.keys(exportsMap)
      .filter((key) => key !== '.')
      .map((key) => key.replace(/^\.\//, '')),
  );

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

  console.log(`Generated Shiki language registry for ${languages.length} entries.`);
}

void main();
