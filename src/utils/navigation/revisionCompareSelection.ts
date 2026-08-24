export function shouldSkipSameRevisionCompare(
  isTwoFileCompare: boolean,
  baseRevisionId: string,
  mineRevisionId: string,
): boolean {
  if (isTwoFileCompare) return false;
  const normalizedBaseId = baseRevisionId.trim();
  const normalizedMineId = mineRevisionId.trim();
  return normalizedBaseId !== '' && normalizedBaseId === normalizedMineId;
}
