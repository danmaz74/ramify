import type { AnalysisInputs, AnalysisReport } from './interfaces/analysis.js';
import type { ArchitectViewQuery, ArchitectViewQueryOutcome } from './interfaces/architect-view.js';
import type { AffectedQuery, SessionAffectedOutcome } from './interfaces/affected.js';
import type { SessionMeasurementsOutcome } from './interfaces/measurements.js';
import type { ApiViewQuery, ApiViewQueryOutcome, OperationTimings, SessionChange, SessionOpen, SessionRevision, SessionStatus, SessionUpdate,
  SessionExplorerDetailsOutcome, VerifyOutcome } from './interfaces/session.js';
import type { SymbolDetailRequest } from '../subs/typescript/src/interfaces/source.js';

/** Private worker protocol. AbortSignal and session handles never cross it. */
export type SessionCommand =
  | { readonly operation: 'open' }
  | { readonly operation: 'update'; readonly changes: readonly SessionChange[];
      readonly invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'> }
  | { readonly operation: 'sweep' | 'verify' | 'releaseCompiler' | 'dispose' }
  | { readonly operation: 'report'; readonly sequence?: number }
  | { readonly operation: 'releaseRevision'; readonly sequence: number }
  | { readonly operation: 'apiView'; readonly query: ApiViewQuery }
  | { readonly operation: 'architectView'; readonly query: ArchitectViewQuery }
  | { readonly operation: 'measurements'; readonly sequence: number }
  | { readonly operation: 'affected'; readonly query: AffectedQuery }
  | { readonly operation: 'explorerDetails'; readonly sequence: number;
      readonly requests: readonly SymbolDetailRequest[] };
export type WorkerRequest = (SessionCommand & { readonly id: number }) | { readonly operation: 'cancel'; readonly id: number };
export type WorkerOpen = Exclude<SessionOpen, { status: 'opened' }> | { readonly status: 'opened'; readonly revision: SessionRevision };
export type WorkerResult = WorkerOpen | SessionUpdate | VerifyOutcome | AnalysisReport | ApiViewQueryOutcome
  | ArchitectViewQueryOutcome | SessionMeasurementsOutcome | SessionAffectedOutcome | SessionExplorerDetailsOutcome | null
  | { readonly status: 'unchanged'; readonly timings?: OperationTimings };
export type WorkerMessage =
  | { readonly kind: 'ready'; readonly heapLimit: number; readonly oldGenerationMiB: number }
  | { readonly kind: 'child'; readonly pid: number; readonly active: boolean }
  | { readonly kind: 'reply'; readonly id: number; readonly result: WorkerResult; readonly status: SessionStatus | null }
  | { readonly kind: 'error'; readonly id: number; readonly message: string; readonly status: SessionStatus | null };

/** A result of an update or sweep that carries operation timings: revised and reported
 * results of either, and a sweep's unchanged result. Cancellations carry none. */
export function timedResult(operation: SessionCommand['operation'], result: WorkerResult):
  result is Extract<SessionUpdate, { status: 'revised' | 'reported' }> | { readonly status: 'unchanged'; readonly timings?: OperationTimings } {
  if (!result || !('status' in result)) return false;
  if (operation === 'update') return result.status === 'revised' || result.status === 'reported';
  return operation === 'sweep' && (result.status === 'revised' || result.status === 'reported' || result.status === 'unchanged');
}
