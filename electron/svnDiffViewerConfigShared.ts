export interface SvnDiffViewerRegistryState {
  globalDiffCommand: string | null;
  diffToolCommands: Record<string, string>;
}

export interface OwnedSvnDiffRegistryEntries {
  ownsGlobalDiffCommand: boolean;
  ownedDiffToolKeys: string[];
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
