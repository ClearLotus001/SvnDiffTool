export interface SvnDiffViewerRegistryState {
  globalDiffCommand: string | null;
  diffToolCommands: Record<string, string>;
}

export interface OwnedSvnDiffRegistryEntries {
  ownsGlobalDiffCommand: boolean;
  ownedDiffToolKeys: string[];
}

export type SvnDiffViewerScope = 'all-files' | 'text-only' | 'workbook-only';

export type SvnDiffViewerAvailabilityReason =
  | 'ready'
  | 'windows-only'
  | 'packaged-only'
  | 'launcher-missing';

export type ResolvedSvnDiffViewerMode =
  | SvnDiffViewerScope
  | 'mixed'
  | 'unconfigured'
  | 'unsupported';

export function resolveSvnDiffViewerAvailabilityReason(
  platform: string,
  isPackaged: boolean,
  launcherExists: boolean,
): SvnDiffViewerAvailabilityReason {
  if (platform !== 'win32') return 'windows-only';
  if (!isPackaged) return 'packaged-only';
  if (!launcherExists) return 'launcher-missing';
  return 'ready';
}

function normalizeKeyName(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeSvnDiffViewerScope(value: string | null | undefined): SvnDiffViewerScope | null {
  switch (value) {
    case 'workbook-only':
      return 'workbook-only';
    case 'all-files':
    case 'text-only':
      return value;
    default:
      return null;
  }
}

export function normalizeSvnDiffViewerCommand(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function getOwnedSvnDiffRegistryEntries(
  command: string | null,
  registryState: SvnDiffViewerRegistryState,
): OwnedSvnDiffRegistryEntries {
  const normalizedOurCommand = normalizeSvnDiffViewerCommand(command);
  const ownsGlobalDiffCommand = normalizeSvnDiffViewerCommand(registryState.globalDiffCommand) === normalizedOurCommand;
  const ownedDiffToolKeys = Object.keys(registryState.diffToolCommands).filter((key) => (
    normalizeSvnDiffViewerCommand(registryState.diffToolCommands[key]) === normalizedOurCommand
  ));

  return {
    ownsGlobalDiffCommand,
    ownedDiffToolKeys,
  };
}

export function canRestoreSvnDefaultDiffViewer(
  command: string | null,
  registryState: SvnDiffViewerRegistryState,
) {
  if (!command) return false;
  const ownership = getOwnedSvnDiffRegistryEntries(command, registryState);
  return ownership.ownsGlobalDiffCommand || ownership.ownedDiffToolKeys.length > 0;
}

export function resolveSvnDiffViewerMode(
  command: string | null,
  registryState: SvnDiffViewerRegistryState,
  workbookExtensions: readonly string[],
): ResolvedSvnDiffViewerMode {
  if (!command) return 'unsupported';

  const normalizedOurCommand = normalizeSvnDiffViewerCommand(command);
  const workbookExtensionSet = new Set(workbookExtensions.map(normalizeKeyName));
  const globalIsOurs = normalizeSvnDiffViewerCommand(registryState.globalDiffCommand) === normalizedOurCommand;
  const ownedDiffToolKeys = Object.keys(registryState.diffToolCommands).filter((key) => (
    normalizeSvnDiffViewerCommand(registryState.diffToolCommands[key]) === normalizedOurCommand
  ));
  const workbookOwnCount = workbookExtensions.filter((extension) => (
    normalizeSvnDiffViewerCommand(registryState.diffToolCommands[normalizeKeyName(extension)] ?? null) === normalizedOurCommand
  )).length;
  const nonWorkbookOwnKeys = ownedDiffToolKeys.filter((key) => !workbookExtensionSet.has(normalizeKeyName(key)));
  const nonWorkbookConflicts = Object.keys(registryState.diffToolCommands).filter((key) => (
    !workbookExtensionSet.has(normalizeKeyName(key))
    && normalizeSvnDiffViewerCommand(registryState.diffToolCommands[key]) !== normalizedOurCommand
  ));

  if (globalIsOurs && workbookOwnCount === workbookExtensions.length && nonWorkbookConflicts.length === 0) {
    return 'all-files';
  }

  if (globalIsOurs && ownedDiffToolKeys.length === 0) {
    return 'text-only';
  }

  if (!globalIsOurs && workbookOwnCount === workbookExtensions.length && nonWorkbookOwnKeys.length === 0) {
    return 'workbook-only';
  }

  if (!globalIsOurs && ownedDiffToolKeys.length === 0) {
    return 'unconfigured';
  }

  return 'mixed';
}
