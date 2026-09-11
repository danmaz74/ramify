import { measurementHandlers } from './measurement-cases.js';
import { lifecycleHandlers } from './lifecycle-cases.js';
import { fallbackCliHandlers } from './fallback-cli-cases.js';
import { contextHandlers } from './context-cases.js';
import { ipcHandlers } from './ipc-cases.js';
import { daemonProcessHandlers } from './process-cases.js';
import { residentCliHandlers } from './resident-cli-cases.js';
import { quickCliHandlers } from './quick-cli-cases.js';
import { editHandlers } from './edit-cases.js';
import { serviceHandlers } from './service-cases.js';
import { incrementHandlers } from './increment-cases.js';
import { plan2GateHandlers } from './plan2-gate-cases.js';
import { entryBoundaryHandlers } from './entry-boundary-cases.js';
import { equivalenceHandlers } from './equivalence-cases.js';
import { completionHandlers } from './completion-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Availability permits named handlers to run; it never credits missing ones.
 * Plan 1 regression requires its prior full gate on identical inputs. */
export const plan2Runtime: HarnessRuntime = {
  capabilities: new Set(['contexts', 'daemon-service', 'increment', 'ipc', 'client', 'daemon-process', 'lifecycle', 'resident-measure', 'harness-gate', 'cli', 'equivalence', 'completion']),
  handlers: new Map([...measurementHandlers, ...lifecycleHandlers, ...fallbackCliHandlers, ...contextHandlers, ...serviceHandlers, ...editHandlers, ...incrementHandlers, ...ipcHandlers, ...daemonProcessHandlers, ...residentCliHandlers, ...quickCliHandlers, ...plan2GateHandlers, ...entryBoundaryHandlers, ...equivalenceHandlers, ...completionHandlers]),
};
