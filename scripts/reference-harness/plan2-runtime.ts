import { plan2GateHandlers } from './plan2-gate-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Start empty; each Plan 2 provider activates its own capability and handlers.
 * Plan 1's CLI and harness registrations never supply resident evidence. */
export const plan2Runtime: HarnessRuntime = {
  capabilities: new Set(['harness-gate']),
  handlers: plan2GateHandlers,
};
