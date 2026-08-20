import { loadGitWorkingFileLineBlame } from './gitOperations.js';
import { loadSvnWorkingFileLineBlame } from './svnOperations.js';
import type { LineBlameLine, LineBlamePayload } from './types.js';

async function loadWorkingFileLineBlame(filePath: string): Promise<LineBlameLine[]> {
  const svnBlame = await loadSvnWorkingFileLineBlame(filePath);
  return svnBlame.length > 0 ? svnBlame : loadGitWorkingFileLineBlame(filePath);
}

export async function loadWorkingCopyLineBlame(
  basePath: string,
  minePath: string,
): Promise<LineBlamePayload> {
  const [base, mine] = await Promise.all([
    loadWorkingFileLineBlame(basePath),
    loadWorkingFileLineBlame(minePath),
  ]);
  return { base, mine };
}
