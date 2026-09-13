import type { AnalysisInputs, AnalysisReport } from './interfaces/analysis.js';
import type { OperationTimings, SessionChange, SessionOpen, SessionRevision, SessionStatus, SessionUpdate, VerifyOutcome } from './interfaces/session.js';

/** Private worker protocol. AbortSignal and session handles never cross it. */
export type SessionCommand =
  | { readonly operation: 'open' }
  | { readonly operation: 'update'; readonly changes: readonly SessionChange[];
      readonly invocation?: Pick<AnalysisInputs, 'project' | 'capabilities'> }
  | { readonly operation: 'sweep' | 'verify' | 'releaseCompiler' | 'dispose' }
  | { readonly operation: 'report'; readonly sequence?: number }
  | { readonly operation: 'releaseRevision'; readonly sequence: number };
export type WorkerRequest = (SessionCommand & { readonly id: number }) | { readonly operation: 'cancel'; readonly id: number };
export type WorkerOpen = Exclude<SessionOpen, { status: 'opened' }> | { readonly status: 'opened'; readonly revision: SessionRevision };
export type WorkerResult = WorkerOpen | SessionUpdate | VerifyOutcome | AnalysisReport | null
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
