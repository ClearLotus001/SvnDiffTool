import * as path from 'node:path';
import {
  bytesToMegabytes,
  readPackageSizeReport,
  type PackageSizeReport,
} from './packageSizeReport';

const rootDir = path.resolve(__dirname, '..');
const EXPECTED_ELECTRON_LOCALES = ['en-US.pak', 'zh-CN.pak'];
const MAX_INSTALLER_ARTIFACT_BYTES = 90 * 1024 * 1024;
const MAX_INNER_LOCALES_BYTES = 2 * 1024 * 1024;

function hasCiFlag(): boolean {
  return process.argv.slice(2).includes('--ci');
}

function formatBytes(bytes: number): string {
  return `${bytesToMegabytes(bytes).toFixed(2)} MB`;
}

function formatArtifactList(report: PackageSizeReport): string[] {
  const artifacts = report.installer?.artifacts ?? [];
  return artifacts.map((artifact) => `  - ${artifact.fileName}: ${formatBytes(artifact.bytes)}`);
}

function assertCiExpectations(report: PackageSizeReport) {
  const failures: string[] = [];
  const installer = report.installer;

  if (!installer) {
    failures.push('Missing Windows installer metrics.');
  } else {
    if (installer.installerBytes > MAX_INSTALLER_ARTIFACT_BYTES) {
      failures.push(`Windows installer exceeds limit: ${formatBytes(installer.installerBytes)} > ${formatBytes(MAX_INSTALLER_ARTIFACT_BYTES)}.`);
    }
    const keptLocales = installer.localesKept.join(',');
    const expectedLocales = EXPECTED_ELECTRON_LOCALES.join(',');
    if (keptLocales !== expectedLocales) {
      failures.push(`Unexpected Electron locales retained: [${keptLocales}] (expected [${expectedLocales}]).`);
    }
    if (installer.localesBytes > MAX_INNER_LOCALES_BYTES) {
      failures.push(`Electron locales exceed limit: ${formatBytes(installer.localesBytes)} > ${formatBytes(MAX_INNER_LOCALES_BYTES)}.`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }
}

async function main() {
  const report = await readPackageSizeReport(rootDir);
  if (!report) {
    throw new Error('package-size-report.json not found. Run the Windows packaging scripts first.');
  }

  console.log(`Package size report for v${report.version}`);
  console.log(`Generated at: ${report.generatedAt}`);

  if (report.installer) {
    console.log('\nWindows installer assets:');
    console.log(`  - Installer: ${report.installer.installerFileName} (${formatBytes(report.installer.installerBytes)})`);
    console.log(`  - win-unpacked: ${formatBytes(report.installer.winUnpackedBytes)}`);
    console.log(`  - app.asar: ${formatBytes(report.installer.appAsarBytes)}`);
    console.log(`  - Electron locales: ${formatBytes(report.installer.localesBytes)} [${report.installer.localesKept.join(', ')}]`);
    console.log('  - Release artifacts:');
    formatArtifactList(report).forEach((line) => console.log(line));
  }

  if (hasCiFlag()) {
    assertCiExpectations(report);
    console.log('\nCI size gates passed.');
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
