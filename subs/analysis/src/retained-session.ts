import type { RunControl } from './interfaces/analysis.js';
import type { SessionInputs, SessionOpen } from './interfaces/session.js';
import { openWorkerSession } from './session-host.js';

/** One worker and one compiler lifetime per retained context. */
export function openRetainedSession(inputs: SessionInputs, control: RunControl = {}): Promise<SessionOpen> {
  return openWorkerSession(inputs, control);
}
