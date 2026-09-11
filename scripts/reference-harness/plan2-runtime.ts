import { plan2GateHandlers } from './plan2-gate-cases.js';
import { entryBoundaryHandlers } from './entry-boundary-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Availability permits named handlers to run; it never credits missing ones.
 * CLI currently supplies only the two independent I2-19 process witnesses.
 * Resident commands and all other CLI instances remain missing-handler. */
export const plan2Runtime: HarnessRuntime = {
  capabilities: new Set(['harness-gate', 'cli']),
  handlers: new Map([...plan2GateHandlers, ...entryBoundaryHandlers]),
};
