import { plan5GateHandlers } from './plan5-gate-cases.js';
import { plan5EngineHandlers } from './plan5-engine-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Registration is not execution; later providers remain unavailable. */
export const plan5Runtime: HarnessRuntime = {
  capabilities: new Set(['engine', 'harness-gate']),
  handlers: new Map([...plan5EngineHandlers, ...plan5GateHandlers]),
};
