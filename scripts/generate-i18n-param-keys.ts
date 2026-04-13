import fs from 'node:fs';
import path from 'node:path';
import { collectPlaceholderMap, renderParamKeySource, type MessageMap } from '../shared/i18n/common.js';

interface GenerateTarget {
  label: string;
  localeSources: string[];
  outputPath: string;
  constName: string;
}

const repoRoot = path.resolve(__dirname, '..');

const targets: GenerateTarget[] = [
  {
    label: 'renderer',
    localeSources: [
      path.join(repoRoot, 'src', 'locales', 'en-US.json'),
      path.join(repoRoot, 'src', 'locales', 'zh-CN.json'),
    ],
    outputPath: path.join(repoRoot, 'src', 'i18n', 'paramKeys.ts'),
    constName: 'RENDERER_TRANSLATION_PARAM_KEYS',
  },
  {
    label: 'electron',
    localeSources: [
      path.join(repoRoot, 'electron', 'locales', 'en-US.json'),
      path.join(repoRoot, 'electron', 'locales', 'zh-CN.json'),
    ],
    outputPath: path.join(repoRoot, 'electron', 'i18nParamKeys.ts'),
    constName: 'ELECTRON_TRANSLATION_PARAM_KEYS',
  },
];

function normalizePath(targetPath: string): string {
  return path.relative(repoRoot, targetPath).replace(/\\/g, '/');
}

function readMessageMap(filePath: string): MessageMap {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as MessageMap;
}

function assertPlaceholderParity(label: string, localeSources: string[]): Record<string, readonly string[]> {
  const [firstSource, ...restSources] = localeSources;
  if (!firstSource) {
    throw new Error(`[generate:i18n-param-keys] ${label} has no locale sources configured.`);
  }
  const baseMap = collectPlaceholderMap(readMessageMap(firstSource));
  const baseSignature = JSON.stringify(baseMap);

  for (const source of restSources) {
    const candidateMap = collectPlaceholderMap(readMessageMap(source));
    if (JSON.stringify(candidateMap) !== baseSignature) {
      throw new Error(
        `[generate:i18n-param-keys] ${label} placeholder maps are inconsistent between ` +
        `${normalizePath(firstSource)} and ${normalizePath(source)}.`,
      );
    }
  }

  return baseMap;
}

function writeIfChanged(filePath: string, content: string): 'created' | 'updated' | 'unchanged' {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
    return 'created';
  }

  const current = fs.readFileSync(filePath, 'utf8');
  if (current === content) {
    return 'unchanged';
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return 'updated';
}

function main(): void {
  for (const target of targets) {
    const placeholderMap = assertPlaceholderParity(target.label, target.localeSources);
    const content = renderParamKeySource(
      target.constName,
      normalizePath(target.localeSources[0]!),
      placeholderMap,
    );
    const status = writeIfChanged(target.outputPath, content);
    console.log(`[generate:i18n-param-keys] ${status}: ${normalizePath(target.outputPath)}`);
  }
}

main();
