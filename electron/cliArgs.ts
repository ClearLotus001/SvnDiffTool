export interface CliArgs {
  basePath: string;
  minePath: string;
  baseName: string;
  mineName: string;
  baseUrl: string;
  mineUrl: string;
  baseRevision: string;
  mineRevision: string;
  pegRevision: string;
  fileName: string;
}

export const EMPTY_CLI_ARGS: CliArgs = {
  basePath: '',
  minePath: '',
  baseName: 'Base',
  mineName: 'Mine',
  baseUrl: '',
  mineUrl: '',
  baseRevision: '',
  mineRevision: '',
  pegRevision: '',
  fileName: '',
};
