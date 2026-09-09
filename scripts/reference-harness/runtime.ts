import type { HarnessRuntime } from './runner.js';
import { modelHandlers } from './model-cases.js';
import { projectHandlers } from './project-cases.js';
import { parserHandlers } from './parser-cases.js';
import { catalogHandlers } from './catalog-cases.js';
import { linkingHandlers } from './linking-cases.js';

/** Only executed public providers advertise capabilities; source-access checking arrives later. */
export const referenceRuntime: HarnessRuntime = {
  capabilities: new Set(['registry', 'parse', 'acquire', 'metadata', 'catalog', 'link']),
  handlers: new Map([...modelHandlers, ...parserHandlers, ...projectHandlers, ...catalogHandlers, ...linkingHandlers]),
};
