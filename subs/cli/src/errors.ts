import type { ServiceError, ServiceErrorCode } from '../../../src/interfaces/service.js';
import type { DisconnectReason } from '../../daemon/src/interfaces/daemon.js';

type CliFailureCode = Exclude<ServiceErrorCode, 'stopping'> | 'stopped' | 'unavailable'
  | 'analysis-failed' | 'unsupported-setup';

/** An explicitly translated command failure, distinct from an unexpected throw. */
export class CliFailure extends Error {
  constructor(readonly code: CliFailureCode, message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'CliFailure';
  }
}

export function serviceFailure(error: ServiceError): CliFailure {
  return new CliFailure(error.code === 'stopping' ? 'stopped' : error.code, error.message, error);
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
