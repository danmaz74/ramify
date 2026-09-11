import { plan2GateHandlers } from './plan2-gate-cases.js';
import { entryBoundaryHandlers } from './entry-boundary-cases.js';
import { equivalenceHandlers } from './equivalence-cases.js';
import { completionHandlers } from './completion-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Availability permits named handlers to run; it never credits missing ones.
 * CLI currently supplies only the two independent I2-19 process witnesses.
 * Resident commands and all other CLI instances remain missing-handler.
 * Equivalence handlers fail at their real-process prerequisite until the
 * predecessor daemon and resident CLI providers are implemented.
 * Completion handlers likewise require actual providers. Plan 1 regression
 * requires its prior full gate on identical source/build/runtime inputs. */
export const plan2Runtime: HarnessRuntime = {
  capabilities: new Set(['harness-gate', 'cli', 'equivalence', 'completion']),
  handlers: new Map([...plan2GateHandlers, ...entryBoundaryHandlers, ...equivalenceHandlers, ...completionHandlers]),
};
