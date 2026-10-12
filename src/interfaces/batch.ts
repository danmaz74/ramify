import type { PathOwnership, ProjectOwnership, ProjectWarning } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import type { AnalysisDiagnostic, AnalysisFailureEvidence, AnalysisReport, Capability, RunControl, StageExecution } from '../../subs/analysis/src/interfaces/analysis.js';
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
  readonly fileFacts?: true;
  readonly cwd: string;
  readonly root?: string;
  readonly modules: readonly string[];
  readonly paths: readonly string[];
}
/** `invalid-project` (exit 1) is an invalid project; `project-unavailable` (exit 2) is an open that
 * reported because the project could not be found or read. */
export type AffectedBatchResult =
  | { readonly status: 'answered'; readonly inputId: string; readonly result: AffectedSelection }
  | (AnalysisFailureEvidence & { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason | 'invalid-project' | 'project-unavailable'; readonly message: string;
      readonly unknownModules: readonly string[]; readonly exitCode: 1 | 2 })
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type AffectedBatchOperation = (invocation: AffectedBatchInvocation, control?: RunControl) => Promise<AffectedBatchResult>;

/** Fresh ownership acquisition, independent of every full-analysis operation. */
export interface OwnershipBatchInvocation {
  readonly cwd: string;
  readonly root?: string;
  readonly paths: readonly string[];
}
export type OwnershipBatchResult =
  | { readonly status: 'answered'; readonly exitCode: 0; readonly root: string; readonly inputId: string;
      readonly scope: { readonly configuration: string; readonly ownership: ProjectOwnership };
      readonly paths: readonly { readonly path: string; readonly ownership: PathOwnership }[];
      readonly warnings: readonly ProjectWarning[] }
  | ({ readonly root: string | null; readonly diagnostics: readonly AnalysisDiagnostic[];
       readonly stages?: readonly StageExecution[] }
    & ({ readonly status: 'invalid'; readonly exitCode: 1 }
      | { readonly status: 'incomplete' | 'unavailable'; readonly exitCode: 2 }))
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type OwnershipBatchOperation = (invocation: OwnershipBatchInvocation, control?: RunControl) => Promise<OwnershipBatchResult>;
