import type { HarnessRuntime } from './runner.js';

/** Later iterations register real providers and their exact leaf assertions here. */
export const referenceRuntime: HarnessRuntime = {
  capabilities: new Set(),
  handlers: new Map(),
};
