import type { HarnessRuntime } from './runner.js';
import { modelHandlers } from './model-cases.js';
import { projectHandlers } from './project-cases.js';
import { parserHandlers } from './parser-cases.js';
import { catalogHandlers } from './catalog-cases.js';
import { linkingHandlers } from './linking-cases.js';
import { staticHandlers } from './static-cases.js';
import { tagsOriginHandlers } from './tags-origin-cases.js';
import { boundedHandlers } from './bounded-cases.js';
import { sessionHandlers } from './session-cases.js';
import { cliHandlers } from './cli-cases.js';
import { gateHandlers } from './gate-cases.js';
import { selfHandlers } from './self-cases.js';
import { relocationHandlers } from './relocation.js';

/** Every reviewed instance has a provider; only executed assertions prove a pass. */
export const referenceRuntime: HarnessRuntime = {
  capabilities: new Set(['registry', 'parse', 'acquire', 'metadata', 'catalog', 'link', 'static-access', 'tags-origin', 'namespace', 'lazy', 'symbol-free', 'coverage', 'resources', 'session', 'cli', 'regression', 'build-selection', 'harness-gate']),
  handlers: new Map([...modelHandlers, ...parserHandlers, ...projectHandlers, ...catalogHandlers, ...linkingHandlers, ...staticHandlers, ...tagsOriginHandlers, ...boundedHandlers, ...sessionHandlers, ...cliHandlers, ...gateHandlers, ...selfHandlers, ...relocationHandlers]),
};
