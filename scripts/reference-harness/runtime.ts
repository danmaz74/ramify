import type { HarnessRuntime } from './runner.js';
import { modelHandlers } from './model-cases.js';

/** Only executed public providers advertise capabilities; source analysis arrives later. */
export const referenceRuntime: HarnessRuntime = {
  capabilities: new Set(['registry']),
  handlers: new Map(modelHandlers),
};
