import { plan5GateHandlers } from './plan5-gate-cases.js';
import { plan5EngineHandlers } from './plan5-engine-cases.js';
import { plan5CatalogHandlers } from './plan5-catalog-cases.js';
import { plan5ObserverHandlers } from './plan5-observer-cases.js';
import { plan5CompilerHandlers } from './plan5-compiler-cases.js';
import { plan5SessionHandlers } from './plan5-session-cases.js';
import { plan5SessionRevisionHandlers } from './plan5-session-revision-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Registration is not execution; later providers remain unavailable. */
export const plan5Runtime: HarnessRuntime = {
  capabilities: new Set(['engine', 'harness-gate', 'catalog', 'observer', 'compiler', 'session']),
  handlers: new Map([...plan5EngineHandlers, ...plan5CatalogHandlers, ...plan5ObserverHandlers, ...plan5CompilerHandlers, ...plan5SessionHandlers, ...plan5SessionRevisionHandlers, ...plan5GateHandlers]),
};
