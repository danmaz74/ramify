import type { AnalysisReport, Capability, RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { AffectedSelection, AffectedUnavailableReason } from '../../subs/analysis/src/interfaces/affected.js';

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

/** One affected-module query over a fresh session; the project resolves as `check --batch` resolves it. */
export interface AffectedBatchInvocation {
  readonly cwd: string;
  readonly root?: string;
  readonly modules: readonly string[];
  readonly paths: readonly string[];
}
/** `invalid-project` (exit 1) is an invalid project; `project-unavailable` (exit 2) is an open that
 * reported because the project could not be found or read. */
export type AffectedBatchResult =
  | { readonly status: 'answered'; readonly inputId: string; readonly result: AffectedSelection }
  | { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason | 'invalid-project' | 'project-unavailable'; readonly message: string;
      readonly unknownModules: readonly string[]; readonly exitCode: 1 | 2 }
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type AffectedBatchOperation = (invocation: AffectedBatchInvocation, control?: RunControl) => Promise<AffectedBatchResult>;
