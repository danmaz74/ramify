import type { BatchOperation } from '../../../../src/interfaces/batch.js';

export type CliExitCode = 0 | 1 | 2 | 130;
export interface CliEnvironment {
  readonly cwd: string;
  readonly version: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly batch: BatchOperation;
}
