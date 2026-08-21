import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InstallerSizeReport {
  installerFileName: string;
  installerBytes: number;
  winUnpackedBytes: number;
  localesBytes: number;
  localesKept: string[];
  appAsarBytes: number;
  artifacts: Array<{
    fileName: string;
    bytes: number;
  }>;
}

export interface PackageSizeReport {
  version: string;
  generatedAt: string;
  installer?: InstallerSizeReport;
}

export function getReleaseDir(rootDir: string): string {
  return path.join(rootDir, 'release');
}

function getPackageSizeReportPath(rootDir: string): string {
  return path.join(getReleaseDir(rootDir), 'package-size-report.json');
}

export function bytesToMegabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export async function getFileSizeBytes(filePath: string): Promise<number> {
  const stats = await fs.promises.stat(filePath);
  return stats.size;
}

export async function getDirectorySizeBytes(targetPath: string): Promise<number> {
  const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(entryPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await fs.promises.stat(entryPath)).size;
    }
  }

  return total;
}

export async function listLocaleFileNames(localesDir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(localesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function readPackageSizeReport(rootDir: string): Promise<PackageSizeReport | null> {
  const reportPath = getPackageSizeReportPath(rootDir);
  try {
    const raw = await fs.promises.readFile(reportPath, 'utf-8');
    return JSON.parse(raw) as PackageSizeReport;
  } catch {
    return null;
  }
}

export async function updatePackageSizeReport(
  rootDir: string,
  version: string,
  partial: Partial<Omit<PackageSizeReport, 'version' | 'generatedAt'>>,
): Promise<PackageSizeReport> {
  const previous = await readPackageSizeReport(rootDir);
  const next: PackageSizeReport = {
    version,
    generatedAt: new Date().toISOString(),
  };

  const inheritedInstaller = previous?.version === version ? previous.installer : undefined;
  const nextInstaller = partial.installer ?? inheritedInstaller;

  if (nextInstaller) {
    next.installer = nextInstaller;
  }

  const reportPath = getPackageSizeReportPath(rootDir);
  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}
