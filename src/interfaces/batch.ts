import type { AnalysisReport, Capability, RunControl } from '../../subs/analysis/src/interfaces/analysis.js';

export interface BatchInvocation {
  readonly cwd: string;
  readonly root?: string;
  readonly capabilities: readonly Capability[];
  /** False returns the report with `snapshot: null`, so a batch child never transfers it. */
  readonly snapshot?: false;
}
export type BatchResult =
  | { readonly status: 'reported'; readonly report: AnalysisReport; readonly exitCode: 0 | 1 | 2 }
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type BatchOperation = (invocation: BatchInvocation, control?: RunControl) => Promise<BatchResult>;
