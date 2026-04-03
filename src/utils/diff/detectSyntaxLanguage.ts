import { isSupportedShikiLanguage } from '@/utils/diff/shikiSupportedLanguages';

const FILE_NAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  jenkinsfile: 'groovy',
  'cmakelists.txt': 'cmake',
};

const EXTENSION_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.json5': 'json5',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.xaml': 'xml',
  '.svg': 'xml',
  '.xsd': 'xml',
  '.xsl': 'xml',
  '.xslt': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.py': 'python',
  '.pyw': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.phtml': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.sql': 'sql',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.psd1': 'powershell',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.fish': 'shellscript',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.toml': 'toml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.groovy': 'groovy',
  '.gradle': 'groovy',
  '.dart': 'dart',
  '.lua': 'lua',
  '.pl': 'perl',
  '.pm': 'perl',
  '.r': 'r',
  '.scala': 'scala',
  '.tex': 'latex',
  '.proto': 'proto',
  '.graphql': 'graphql',
  '.gql': 'graphql',
};

const SHEBANG_RULES: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /\b(?:node|deno|bun)\b/i, language: 'javascript' },
  { pattern: /\bpython(?:\d(?:\.\d+)?)?\b/i, language: 'python' },
  { pattern: /\b(?:bash|sh|zsh|fish)\b/i, language: 'shellscript' },
  { pattern: /\bpwsh\b|\bpowershell\b/i, language: 'powershell' },
  { pattern: /\bruby\b/i, language: 'ruby' },
  { pattern: /\bphp\b/i, language: 'php' },
  { pattern: /\bperl\b/i, language: 'perl' },
];

function getNormalizedFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/\\/g, '/');
  if (!normalized) return '';
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
}

function getFileExtension(fileName: string): string {
  const normalized = getNormalizedFileName(fileName);
  const index = normalized.lastIndexOf('.');
  return index >= 0 ? normalized.slice(index) : '';
}

function detectFromShebang(...contents: Array<string | null | undefined>): string | null {
  const firstNonEmpty = contents.find((value) => typeof value === 'string' && value.trim().length > 0)?.trimStart();
  if (!firstNonEmpty?.startsWith('#!')) return null;

  const firstLine = firstNonEmpty.slice(0, firstNonEmpty.indexOf('\n') >= 0 ? firstNonEmpty.indexOf('\n') : undefined);
  const normalized = firstLine.toLowerCase();

  for (const rule of SHEBANG_RULES) {
    if (rule.pattern.test(normalized)) return rule.language;
  }
  return null;
}

export function detectSyntaxLanguage(
  fileName: string,
  ...contents: Array<string | null | undefined>
): string | null {
  const normalizedFileName = getNormalizedFileName(fileName);
  if (normalizedFileName && FILE_NAME_MAP[normalizedFileName]) {
    return FILE_NAME_MAP[normalizedFileName];
  }

  const extension = getFileExtension(fileName);
  if (extension && EXTENSION_MAP[extension]) {
    return EXTENSION_MAP[extension];
  }

  if (normalizedFileName && isSupportedShikiLanguage(normalizedFileName)) {
    return normalizedFileName;
  }

  const extensionId = extension.replace(/^\./, '');
  if (extensionId && isSupportedShikiLanguage(extensionId)) {
    return extensionId;
  }

  return detectFromShebang(...contents);
}
