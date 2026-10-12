import type { ServiceError, ServiceErrorCode } from '../../../src/interfaces/service.js';
import type { DisconnectReason } from '../../daemon/src/interfaces/daemon.js';
import type { AnalysisFailureEvidence } from '../../analysis/src/interfaces/analysis.js';
import type { RecoveryEvidence } from '../../daemon/src/context-types.js';

export type CliFailureEvidence = AnalysisFailureEvidence & { readonly recovery?: RecoveryEvidence };

type CliFailureCode = Exclude<ServiceErrorCode, 'stopping'> | 'stopped' | 'unavailable'
  | 'analysis-failed' | 'unsupported-setup' | 'evicted-revision' | 'unobserved-input'
  /** The connected daemon does not advertise a capability the invocation needs. */
  | 'incompatible-service' | 'output-failure';

/** An explicitly translated command failure, distinct from an unexpected throw. */
export class CliFailure extends Error {
  readonly evidence: CliFailureEvidence;
  constructor(readonly code: CliFailureCode, message: string, cause: unknown,
    evidence: CliFailureEvidence = {}) {
    super(message, { cause });
    this.name = 'CliFailure';
    this.evidence = {
      ...(evidence.diagnostics === undefined ? {} : { diagnostics: evidence.diagnostics }),
      ...(evidence.stages === undefined ? {} : { stages: evidence.stages }),
      ...(evidence.recovery === undefined ? {} : { recovery: evidence.recovery }),
    };
  }
}

export function serviceFailure(error: ServiceError): CliFailure {
  return new CliFailure(error.code === 'stopping' ? 'stopped' : error.code, error.message, error, error);
}

/** Rendering a refusal retains its source even when formatting or writing throws. */
export function withFailureOutput<T>(cause: CliFailureEvidence & { readonly reason: string; readonly message: string }, output: () => T): T {
  try { return output(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliFailure('output-failure', `${message}; original ${cause.reason}: ${cause.message}`, cause, cause);
  }
}

/** Render a terminal disconnect. The command must decide recovery separately;
 * a failure reason alone does not establish that recovery was exhausted. */
export function disconnectFailure(reason: DisconnectReason): CliFailure {
  switch (reason.kind) {
    case 'explicit-stop': return new CliFailure('stopped', `daemon stopped explicitly${reason.requestId === null ? '' : ` (request ${reason.requestId})`}`, reason);
    case 'idle-exit': return new CliFailure('stopped', 'daemon exited while idle', reason);
    case 'failure': return new CliFailure('unavailable', `daemon unavailable: ${reason.message}`, reason);
    case 'slow-consumer': return new CliFailure('unavailable', 'this client fell behind', reason);
    case 'incompatible': return new CliFailure('incompatible', `daemon protocol ${reason.daemon} client ${reason.client}`, reason);
    case 'rejected': return new CliFailure(reason.code === 'stopping' ? 'stopped' : reason.code, reason.message, reason);
    case 'closed': return new CliFailure('unavailable', "daemon released this client's lease", reason);
  }
}
