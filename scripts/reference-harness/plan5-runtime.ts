import { plan5ContextHandlers } from './plan5-context-cases.js';
import { plan5SupersessionHandlers } from './plan5-supersession-cases.js';
import { plan5GateHandlers } from './plan5-gate-cases.js';
import { plan5EngineHandlers } from './plan5-engine-cases.js';
import { plan5CatalogHandlers } from './plan5-catalog-cases.js';
import { plan5ObserverHandlers } from './plan5-observer-cases.js';
import { plan5CompilerHandlers } from './plan5-compiler-cases.js';
import { plan5SessionHandlers } from './plan5-session-cases.js';
import { plan5SessionRevisionHandlers } from './plan5-session-revision-cases.js';
import { plan5HostingHandlers } from './plan5-hosting-cases.js';
import { plan5HookHandlers } from './plan5-hook-cases.js';
import { plan5LiveHandlers } from './plan5-live-cases.js';
import { plan5FastMeasureHandlers } from './plan5-fast-measure-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Registration is not execution; later providers remain unavailable. */
export const plan5Runtime: HarnessRuntime = {
  capabilities: new Set(['engine', 'harness-gate', 'catalog', 'observer', 'compiler', 'session', 'hosting', 'contexts', 'supersession', 'hook-cli', 'live-equivalence', 'fast-measure']),
  handlers: new Map([...plan5FastMeasureHandlers, ...plan5LiveHandlers, ...plan5HookHandlers, ...plan5ContextHandlers, ...plan5SupersessionHandlers, ...plan5EngineHandlers, ...plan5CatalogHandlers, ...plan5ObserverHandlers, ...plan5CompilerHandlers, ...plan5SessionHandlers, ...plan5SessionRevisionHandlers, ...plan5HostingHandlers, ...plan5GateHandlers]),
};
