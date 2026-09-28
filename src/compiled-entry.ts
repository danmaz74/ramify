import { basename, dirname, join, resolve } from 'node:path';
import { createProcessAffectedBatch, createProcessBatch } from './batch-process.js';
import { runCliProcess } from './cli-process.js';

/** Replaced at compile time with the runtime identity of the build this client belongs to. */
declare const RAMIFY_BUILD_IDENTITY: string;

// The build compiles this entry with Bun to dist/src/ramify-client-<os>-<arch>, beside
// cli-entry.js. Its modules load from an embedded file system, so the installed build is
// located from the executable. The daemon and batch analysis stay in Node, found on PATH
// as the Node entry's shebang finds it. Commands refuse a build with a runtime identity other than the embedded one.
if (!basename(process.execPath).startsWith('ramify-client-')) throw new Error('compiled-entry runs only as the compiled client');
const packageRoot = resolve(dirname(process.execPath), '../..');
const node = 'node';
await runCliProcess({ packageRoot, buildIdentity: RAMIFY_BUILD_IDENTITY,
  location: { packageRoot, daemonEntry: join(packageRoot, 'dist/src/daemon-entry.js'), daemonRuntime: node },
  batch: createProcessBatch(node, join(packageRoot, 'dist/src/batch-entry.js')),
  affectedBatch: createProcessAffectedBatch(node, join(packageRoot, 'dist/src/batch-entry.js')) });
