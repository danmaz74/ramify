import type { HarnessRuntime } from './runner.js';
import { modelHandlers } from './model-cases.js';
import { projectHandlers } from './project-cases.js';
import { parserHandlers } from './parser-cases.js';
import { catalogHandlers } from './catalog-cases.js';
import { linkingHandlers } from './linking-cases.js';
import { staticHandlers } from './static-cases.js';

/** Only executed public providers advertise capabilities; later forms and session checking remain unavailable. */
export const referenceRuntime: HarnessRuntime = {
  capabilities: new Set(['registry', 'parse', 'acquire', 'metadata', 'catalog', 'link', 'static-access']),
  handlers: new Map([...modelHandlers, ...parserHandlers, ...projectHandlers, ...catalogHandlers, ...linkingHandlers, ...staticHandlers]),
};
