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
  const artifacts = report.innerInstaller?.artifacts ?? [];
  return artifacts.map((artifact) => `  - ${artifact.fileName}: ${formatBytes(artifact.bytes)}`);
}

function assertCiExpectations(report: PackageSizeReport) {
  const failures: string[] = [];
  const outerSetup = report.outerSetup;
  const innerInstaller = report.innerInstaller;

  const installerArtifactBytes = outerSetup?.setupBytes ?? innerInstaller?.installerBytes;
  if (installerArtifactBytes == null) {
    failures.push('Missing Windows installer metrics.');
  } else if (installerArtifactBytes > MAX_INSTALLER_ARTIFACT_BYTES) {
    failures.push(`Windows installer exceeds limit: ${formatBytes(installerArtifactBytes)} > ${formatBytes(MAX_INSTALLER_ARTIFACT_BYTES)}.`);
  }

  if (!innerInstaller) {
    failures.push('Missing inner installer metrics.');
  } else {
    const keptLocales = innerInstaller.localesKept.join(',');
    const expectedLocales = EXPECTED_ELECTRON_LOCALES.join(',');
    if (keptLocales !== expectedLocales) {
      failures.push(`Unexpected Electron locales retained: [${keptLocales}] (expected [${expectedLocales}]).`);
    }
    if (innerInstaller.localesBytes > MAX_INNER_LOCALES_BYTES) {
      failures.push(`Electron locales exceed limit: ${formatBytes(innerInstaller.localesBytes)} > ${formatBytes(MAX_INNER_LOCALES_BYTES)}.`);
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

  if (report.innerInstaller) {
    console.log('\nWindows installer assets:');
    console.log(`  - Installer: ${report.innerInstaller.installerFileName} (${formatBytes(report.innerInstaller.installerBytes)})`);
    console.log(`  - win-unpacked: ${formatBytes(report.innerInstaller.winUnpackedBytes)}`);
    console.log(`  - app.asar: ${formatBytes(report.innerInstaller.appAsarBytes)}`);
    console.log(`  - Electron locales: ${formatBytes(report.innerInstaller.localesBytes)} [${report.innerInstaller.localesKept.join(', ')}]`);
    console.log('  - Release artifacts:');
    formatArtifactList(report).forEach((line) => console.log(line));
  }

  if (report.outerSetup) {
    console.log('\nLegacy outer setup:');
    console.log(`  - Artifact: ${report.outerSetup.setupFileName} (${formatBytes(report.outerSetup.setupBytes)})`);
    console.log(`  - win-unpacked: ${formatBytes(report.outerSetup.winUnpackedBytes)}`);
    console.log(`  - app.asar: ${formatBytes(report.outerSetup.appAsarBytes)}`);
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
