#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCliProcess } from './cli-process.js';

// The installed entry preserves dist/src; package metadata lives beside dist.
await runCliProcess({ packageRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  batch: async (invocation, control) => (await import('./batch.js')).runBatch(invocation, control) });
