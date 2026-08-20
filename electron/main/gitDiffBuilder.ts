import * as path from 'node:path';

import { writeManagedTempFile } from '../runtimePaths.js';
import {
  buildDevWorkingCopyDiffData,
  buildLocalDiffData,
} from './diffBuilder.js';
import {
  GIT_EMPTY_REVISION_ID,
  activateGitWorkingFileSession,
  clearActiveGitWorkingFileSession,
  getActiveGitWorkingFileSession,
  readGitFileRevision,
  resolveGitRevisionInfo,
  type GitWorkingFileSession,
} from './gitOperations.js';
import { SPECIAL_MINE_ID } from './constants.js';
import type { DiffData, WorkbookCompareMode } from './types.js';

function resolveComparisonExtension(filePath: string): string {
  return path.extname(filePath) || '.txt';
}

async function buildGitFileDiffData(
  session: GitWorkingFileSession,
  requestedBaseRevisionId: string | undefined,
  requestedMineRevisionId: string | undefined,
  workbookCompareMode: WorkbookCompareMode,
): Promise<DiffData> {
  const defaultBaseRevisionId = session.tracked && session.headCommit
    ? session.headCommit
    : GIT_EMPTY_REVISION_ID;
  const baseRevisionId = requestedBaseRevisionId?.trim() || defaultBaseRevisionId;
  const mineRevisionId = requestedMineRevisionId?.trim() || SPECIAL_MINE_ID;
  const [baseContents, mineContents, baseRevisionInfo, mineRevisionInfo] = await Promise.all([
    readGitFileRevision(session, baseRevisionId),
    readGitFileRevision(session, mineRevisionId),
    resolveGitRevisionInfo(session, baseRevisionId),
    resolveGitRevisionInfo(session, mineRevisionId),
  ]);
  const extension = resolveComparisonExtension(session.workingFilePath);
  const [baseTempPath, mineTempPath] = await Promise.all([
    writeManagedTempFile('git-base', extension, baseContents),
    writeManagedTempFile('git-working', extension, mineContents),
  ]);
  const data = await buildLocalDiffData(baseTempPath, mineTempPath, workbookCompareMode);
  const fileName = path.basename(session.workingFilePath);
  const repositoryName = path.basename(session.repositoryPath);
  const baseLabel = baseRevisionInfo.kind === 'working-copy'
    ? baseRevisionInfo.title
    : baseRevisionInfo.revision;
  const mineLabel = mineRevisionInfo.kind === 'working-copy'
    ? mineRevisionInfo.title
    : mineRevisionInfo.revision;

  return {
    ...data,
    source: {
      kind: 'git',
      label: repositoryName,
      repositoryPath: session.repositoryPath,
      baseVersion: baseRevisionId,
      targetVersion: mineRevisionId,
    },
    svnUrl: '',
    fileName,
    sourceIdentity: [
      'git-file',
      session.repositoryPath,
      session.relativePath,
      baseRevisionId,
      mineRevisionId,
    ].join(':'),
    compareContext: 'git_compare',
    timelineTargetUrl: null,
    workingCopyAvailable: true,
    initialPair: {
      baseRevisionId: defaultBaseRevisionId,
      mineRevisionId: SPECIAL_MINE_ID,
    },
    resetPair: {
      baseRevisionId: defaultBaseRevisionId,
      mineRevisionId: SPECIAL_MINE_ID,
    },
    launchBaseName: `${fileName} — ${baseLabel}`,
    launchMineName: `${fileName} — ${mineLabel}`,
    baseName: `${fileName} — ${baseLabel}`,
    mineName: `${fileName} — ${mineLabel}`,
    revisionOptions: null,
    baseRevisionInfo,
    mineRevisionInfo,
    canSwitchRevisions: session.tracked,
    sourceNoticeCode: session.tracked ? null : 'unversioned-working-copy',
    perf: data.perf
      ? { ...data.perf, source: 'local-dev' }
      : { source: 'local-dev' },
  };
}

export async function buildSmartWorkingCopyDiffData(
  filePath: string,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const gitSession = await activateGitWorkingFileSession(filePath);
  if (gitSession) {
    return buildGitFileDiffData(gitSession, undefined, undefined, workbookCompareMode);
  }

  clearActiveGitWorkingFileSession();
  return buildDevWorkingCopyDiffData(filePath, workbookCompareMode);
}

export async function buildGitFileRevisionDiffData(
  baseRevisionId: string | undefined,
  mineRevisionId: string | undefined,
  workbookCompareMode: WorkbookCompareMode = 'strict',
): Promise<DiffData> {
  const session = getActiveGitWorkingFileSession();
  if (!session) throw new Error('No active Git working file is available.');
  return buildGitFileDiffData(
    session,
    baseRevisionId,
    mineRevisionId,
    workbookCompareMode,
  );
}
