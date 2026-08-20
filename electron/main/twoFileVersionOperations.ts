import * as fs from 'node:fs';
import * as path from 'node:path';

import { electronT } from '../i18n.js';
import { writeManagedTempFile } from '../runtimePaths.js';
import { buildLiteralLocalDiffData, buildLocalDiffData } from './diffBuilder.js';
import {
  queryGitRevisionOptionsForSession,
  loadGitFileRevisionLineBlame,
  readGitFileRevision,
  resolveGitRevisionInfo,
  resolveGitWorkingFileSession,
  type GitWorkingFileSession,
} from './gitOperations.js';
import {
  queryRevisionOptionsForTarget,
  loadSvnTargetLineBlame,
  loadSvnWorkingFileLineBlame,
  querySvnRevisionInfoForTarget,
  readSvnFileRevision,
  resolveLocalSvnUrl,
} from './svnOperations.js';
import { SPECIAL_BASE_ID, SPECIAL_MINE_ID } from './constants.js';
import type {
  DiffData,
  LineBlameLine,
  LineBlamePayload,
  RevisionOptionsPayload,
  RevisionOptionsQuery,
  SvnRevisionInfo,
  WorkbookCompareMode,
} from './types.js';

type TwoFileSideContext =
  | { provider: 'git'; path: string; git: GitWorkingFileSession }
  | { provider: 'svn'; path: string; target: string }
  | { provider: 'local'; path: string };

interface TwoFileVersionSession {
  base: TwoFileSideContext;
  mine: TwoFileSideContext;
}

let activeSession: TwoFileVersionSession | null = null;

function sideSpecialId(side: 'base' | 'mine'): string {
  return side === 'base' ? SPECIAL_BASE_ID : SPECIAL_MINE_ID;
}

function isWorkingSourceId(value: string | null | undefined): boolean {
  return !value || value === SPECIAL_BASE_ID || value === SPECIAL_MINE_ID;
}

function workingSourceInfo(
  side: 'base' | 'mine',
  context: TwoFileSideContext,
): SvnRevisionInfo {
  const versioned = context.provider !== 'local';
  return {
    id: sideSpecialId(side),
    revision: versioned ? 'WC' : '',
    title: versioned ? electronT('revisionWorkingCopyTitle') : path.basename(context.path),
    author: '',
    date: '',
    message: '',
    kind: versioned ? 'working-copy' : 'input-file',
  };
}

async function resolveSideContext(filePath: string): Promise<TwoFileSideContext> {
  const git = await resolveGitWorkingFileSession(filePath);
  if (git?.tracked) return { provider: 'git', path: filePath, git };
  const target = await resolveLocalSvnUrl(filePath);
  return target
    ? { provider: 'svn', path: filePath, target }
    : { provider: 'local', path: filePath };
}

function decorateDiffData(
  data: DiffData,
  session: TwoFileVersionSession,
  baseInfo: SvnRevisionInfo,
  mineInfo: SvnRevisionInfo,
): DiffData {
  const switchableSides = {
    base: session.base.provider !== 'local',
    mine: session.mine.provider !== 'local',
  };
  return {
    ...data,
    source: {
      kind: 'local',
      label: 'Versioned local files',
      baseKind: session.base.provider,
      targetKind: session.mine.provider,
      baseVersion: baseInfo.id,
      targetVersion: mineInfo.id,
    },
    basePath: session.base.path,
    minePath: session.mine.path,
    sourceIdentity: [
      'two-file-versioned',
      session.base.provider,
      session.base.path,
      baseInfo.id,
      session.mine.provider,
      session.mine.path,
      mineInfo.id,
    ].join('::'),
    compareContext: 'literal_two_file_compare',
    workingCopyAvailable: switchableSides.base || switchableSides.mine,
    initialPair: {
      baseRevisionId: sideSpecialId('base'),
      mineRevisionId: sideSpecialId('mine'),
    },
    resetPair: {
      baseRevisionId: sideSpecialId('base'),
      mineRevisionId: sideSpecialId('mine'),
    },
    revisionOptions: null,
    baseRevisionInfo: baseInfo,
    mineRevisionInfo: mineInfo,
    canSwitchRevisions: switchableSides.base || switchableSides.mine,
    revisionSwitchableSides: switchableSides,
  };
}

export function clearActiveTwoFileVersionSession(): void {
  activeSession = null;
}

export function hasActiveTwoFileVersionSession(): boolean {
  return activeSession != null;
}

export async function buildSmartLocalFileDiffData(
  basePath: string,
  minePath: string,
  compareMode: WorkbookCompareMode,
): Promise<DiffData> {
  const [base, mine] = await Promise.all([
    resolveSideContext(basePath),
    resolveSideContext(minePath),
  ]);
  const session = { base, mine } satisfies TwoFileVersionSession;
  const hasGit = base.provider === 'git' || mine.provider === 'git';
  const bothSvn = base.provider === 'svn' && mine.provider === 'svn';
  const hasMixedVersionSource = (
    base.provider === 'svn' || mine.provider === 'svn'
  ) && !bothSvn;

  if (!hasGit && !hasMixedVersionSource) {
    activeSession = null;
    return buildLocalDiffData(basePath, minePath, compareMode);
  }

  const data = await buildLiteralLocalDiffData(basePath, minePath, compareMode);
  activeSession = session;
  return decorateDiffData(
    data,
    session,
    workingSourceInfo('base', base),
    workingSourceInfo('mine', mine),
  );
}

async function resolveSideRevision(
  side: 'base' | 'mine',
  context: TwoFileSideContext,
  revisionId: string,
): Promise<{ bytes: Buffer; info: SvnRevisionInfo }> {
  if (context.provider === 'local' || isWorkingSourceId(revisionId)) {
    const bytes = await fs.promises.readFile(context.path);
    return { bytes, info: workingSourceInfo(side, context) };
  }
  if (context.provider === 'git') {
    const [bytes, info] = await Promise.all([
      readGitFileRevision(context.git, revisionId),
      resolveGitRevisionInfo(context.git, revisionId),
    ]);
    return { bytes, info };
  }

  const [bytes, info] = await Promise.all([
    readSvnFileRevision(context.target, revisionId),
    querySvnRevisionInfoForTarget(context.target, revisionId),
  ]);
  return {
    bytes,
    info: info ?? {
      id: revisionId,
      revision: revisionId,
      title: revisionId,
      author: '',
      date: '',
      message: '',
      kind: 'revision',
    },
  };
}

export async function buildTwoFileVersionDiffData(
  baseRevisionId: string,
  mineRevisionId: string,
  compareMode: WorkbookCompareMode,
): Promise<DiffData> {
  const session = activeSession;
  if (!session) throw new Error('Two-file version context is unavailable.');
  const [base, mine] = await Promise.all([
    resolveSideRevision('base', session.base, baseRevisionId),
    resolveSideRevision('mine', session.mine, mineRevisionId),
  ]);
  const [baseTempPath, mineTempPath] = await Promise.all([
    writeManagedTempFile('two-file-base', path.extname(session.base.path) || '.txt', base.bytes),
    writeManagedTempFile('two-file-mine', path.extname(session.mine.path) || '.txt', mine.bytes),
  ]);
  const data = await buildLiteralLocalDiffData(baseTempPath, mineTempPath, compareMode);
  activeSession = session;
  return decorateDiffData(data, session, base.info, mine.info);
}

export async function queryTwoFileRevisionOptions(
  query: RevisionOptionsQuery | undefined,
): Promise<RevisionOptionsPayload> {
  const session = activeSession;
  const side = query?.targetSide;
  if (!session || (side !== 'base' && side !== 'mine')) {
    return {
      items: [],
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: query?.anchorDateTime?.trim() || null,
    };
  }
  const context = session[side];
  if (context.provider === 'local') {
    return {
      items: [],
      hasMore: false,
      nextBeforeRevisionId: null,
      anchorRevisionId: null,
      queryDateTime: query?.anchorDateTime?.trim() || null,
    };
  }
  if (context.provider === 'git') {
    const payload = await queryGitRevisionOptionsForSession(context.git, query);
    return {
      ...payload,
      items: payload.items.map(item => item.kind === 'working-copy'
        ? { ...item, id: sideSpecialId(side) }
        : item),
    };
  }

  const payload = await queryRevisionOptionsForTarget(context.target, query);
  const items = query?.includeSpecials
    ? [workingSourceInfo(side, context), ...payload.items]
    : payload.items;
  return { ...payload, items };
}

async function resolveSideLineBlame(
  context: TwoFileSideContext,
  revisionId: string,
): Promise<LineBlameLine[]> {
  if (context.provider === 'local') return [];
  if (isWorkingSourceId(revisionId)) {
    return context.provider === 'git'
      ? loadGitFileRevisionLineBlame(context.git, SPECIAL_MINE_ID)
      : loadSvnWorkingFileLineBlame(context.path);
  }
  return context.provider === 'git'
    ? loadGitFileRevisionLineBlame(context.git, revisionId)
    : loadSvnTargetLineBlame(context.target, revisionId);
}

export async function loadTwoFileVersionLineBlame(
  baseRevisionId: string,
  mineRevisionId: string,
): Promise<LineBlamePayload> {
  const session = activeSession;
  if (!session) return { base: [], mine: [] };
  const [base, mine] = await Promise.all([
    resolveSideLineBlame(session.base, baseRevisionId),
    resolveSideLineBlame(session.mine, mineRevisionId),
  ]);
  return { base, mine };
}
