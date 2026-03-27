import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

interface ExportRecord {
  name: string;
  line: number;
}

const repoRoot = process.cwd();
const exportTargetDirs = ['src', 'electron', 'scripts', 'bootstrapper'];
const consumerDirs = [...exportTargetDirs, 'tests'];
const entryPoints = new Set([
  'src/main.tsx',
  'electron/main.ts',
  'electron/preload.ts',
  'bootstrapper/main.ts',
  'bootstrapper/preload.ts',
  'bootstrapper/renderer/renderer.ts',
  'scripts/dev-app.ts',
  'scripts/dev-electron-runner.ts',
  'scripts/build-rust.ts',
  'scripts/build-bootstrapper.ts',
  'scripts/build-bootstrapper-shell.ts',
  'scripts/build-win-installer.ts',
  'scripts/build-workspace.ts',
  'scripts/verify-single-instance-cache.ts',
]);
const allowlistPath = path.join(repoRoot, 'docs', 'code-review', 'unused-exports-baseline.txt');

const moduleExports = new Map<string, ExportRecord[]>();
const moduleUsages = new Map<string, Set<string>>();

function loadAllowlist(): Set<string> {
  if (!fs.existsSync(allowlistPath)) return new Set<string>();
  return new Set(
    fs.readFileSync(allowlistPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => Boolean(line) && !line.startsWith('#')),
  );
}

function normalizePath(filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function collectSourceFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files: string[] = [];

  function visit(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron' || entry.name === 'release' || entry.name === '.build-tmp') {
          continue;
        }
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.d\.ts$/.test(entry.name)) continue;
      files.push(absolutePath);
    }
  }

  visit(absoluteDir);
  return files;
}

function resolveLocalModule(fromFile: string, specifier: string): string | null {
  const resolvedBase = specifier.startsWith('@/') 
    ? path.join(repoRoot, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;

  if (!resolvedBase) return null;

  const candidates = [
    resolvedBase,
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    path.join(resolvedBase, 'index.ts'),
    path.join(resolvedBase, 'index.tsx'),
  ];

  const match = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return match ? normalizePath(match) : null;
}

function getModuleUsage(relativePath: string): Set<string> {
  let usage = moduleUsages.get(relativePath);
  if (!usage) {
    usage = new Set<string>();
    moduleUsages.set(relativePath, usage);
  }
  return usage;
}

function addUsage(relativePath: string, exportName: string) {
  getModuleUsage(relativePath).add(exportName);
}

function addExport(relativePath: string, exportName: string, line: number) {
  if (exportName === '*') return;
  const exports = moduleExports.get(relativePath) ?? [];
  if (exports.some(record => record.name === exportName && record.line === line)) {
    return;
  }
  exports.push({ name: exportName, line });
  moduleExports.set(relativePath, exports);
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
}

function extractDeclarationNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => {
    if (ts.isOmittedExpression(element)) return [];
    return extractDeclarationNames(element.name);
  });
}

function recordDeclarationExport(relativePath: string, sourceFile: ts.SourceFile, node: ts.Node, names: string[]) {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  if (hasDefaultModifier(node)) {
    addExport(relativePath, 'default', line);
    return;
  }
  names.forEach(name => addExport(relativePath, name, line));
}

function scanFile(absoluteFilePath: string) {
  const content = fs.readFileSync(absoluteFilePath, 'utf8');
  const scriptKind = absoluteFilePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absoluteFilePath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const relativePath = normalizePath(absoluteFilePath);

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveLocalModule(absoluteFilePath, node.moduleSpecifier.text);
      if (target && node.importClause) {
        if (node.importClause.name) addUsage(target, 'default');
        if (node.importClause.namedBindings) {
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            addUsage(target, '*');
          } else {
            node.importClause.namedBindings.elements.forEach((element) => {
              addUsage(target, element.propertyName?.text ?? element.name.text);
            });
          }
        }
      }
    }

    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) {
        ts.forEachChild(node, visit);
        return;
      }
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          if (element.isTypeOnly) return;
          addExport(relativePath, element.name.text, line);
        });
      }

      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveLocalModule(absoluteFilePath, node.moduleSpecifier.text);
        if (target) {
          if (!node.exportClause) {
            addUsage(target, '*');
          } else if (ts.isNamedExports(node.exportClause)) {
            node.exportClause.elements.forEach((element) => {
              addUsage(target, element.propertyName?.text ?? element.name.text);
            });
          }
        }
      }
    }

    if (ts.isExportAssignment(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      addExport(relativePath, 'default', line);
    }

    if (hasExportModifier(node)) {
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
        if (node.name) {
          recordDeclarationExport(relativePath, sourceFile, node, [node.name.text]);
        }
      } else if (ts.isVariableStatement(node)) {
        const names = node.declarationList.declarations.flatMap(declaration => extractDeclarationNames(declaration.name));
        recordDeclarationExport(relativePath, sourceFile, node, names);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function main() {
  const allowlist = loadAllowlist();
  const exportTargetFiles = [...new Set(exportTargetDirs.flatMap(collectSourceFiles))];
  const consumerFiles = [...new Set(consumerDirs.flatMap(collectSourceFiles))];

  exportTargetFiles.forEach(scanFile);
  consumerFiles.forEach(scanFile);

  const problems: string[] = [];

  for (const [relativePath, exports] of [...moduleExports.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (entryPoints.has(relativePath)) continue;

    const usage = moduleUsages.get(relativePath) ?? new Set<string>();
    for (const exportRecord of exports) {
      if (usage.has('*') || usage.has(exportRecord.name)) continue;
      if (allowlist.has(`${relativePath}::${exportRecord.name}`)) continue;
      problems.push(`${relativePath}:${exportRecord.line} - ${exportRecord.name}`);
    }
  }

  if (problems.length === 0) {
    console.log('No unused exports detected.');
    return;
  }

  console.error('Unused exports detected:');
  problems.forEach(problem => console.error(`  ${problem}`));
  process.exitCode = 1;
}

main();
