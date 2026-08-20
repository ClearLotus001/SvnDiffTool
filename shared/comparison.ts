export type ComparisonSourceKind = 'local' | 'git' | 'svn' | 'external';

export interface ComparisonSourceDescriptor {
  kind: ComparisonSourceKind;
  label: string;
  repositoryPath?: string | null;
  baseKind?: ComparisonSourceKind;
  targetKind?: ComparisonSourceKind;
  baseVersion?: string | null;
  targetVersion?: string | null;
}
