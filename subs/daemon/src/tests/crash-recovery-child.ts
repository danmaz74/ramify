/**
 * A real, separately-spawned process fixture for `I2A-07:crash-recovery`
 * (`api-view-publisher-crash-recovery.test.ts`). It publishes a second
 * revision over an already-published target through a filesystem seam whose
 * `rename` hangs forever immediately after the switch's first rename
 * (renaming the live target away to its `.old-<suffix>` backup) — the exact
 * point between the two switch renames where a real crash leaves both a
 * marked `.tmp-` stage and a marked `.old-` backup on disk. The parent test
 * waits for the checkpoint file this script writes right before hanging,
 * then SIGKILLs this process and asserts the next `publish` call recovers.
 */
import { writeFile } from 'node:fs/promises';
import {
  createControlledApiViewFilesystem, createControlledFilesystemApiViewPublisher, createNodeApiViewFilesystem,
} from '../api-view-publisher.js';
import { area, described, entry, file, moduleProjection, projection } from './api-view-fixtures.js';

const [, , root, checkpointPath] = process.argv;
if (!root || !checkpointPath) {
  console.error('usage: crash-recovery-child.ts <root> <checkpointPath>');
  process.exit(2);
}

const fs = createControlledApiViewFilesystem(createNodeApiViewFilesystem());
const realRename = fs.rename.bind(fs);
fs.rename = async (from: string, to: string) => {
  await realRename(from, to);
  if (to.includes('.ramify.old-')) {
    await writeFile(checkpointPath, 'reached');
    // A bare `new Promise(() => {})` keeps nothing alive: Node treats an
    // idle event loop with only an unsettled top-level await as done and
    // exits on its own. An interval timer keeps the process genuinely
    // running until the parent test sends SIGKILL.
    await new Promise<never>(() => { setInterval(() => {}, 60_000); });
  }
};

const publisher = createControlledFilesystemApiViewPublisher(
  { maxAreaBytes: 32 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 },
  fs,
);

const changedProjection = projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [
  file('external', 'other/src/thing.ts', [entry('changed', 'value', described('changed', 'function changed(): void;'))]),
]))]);

await publisher.publish(root, 'rev-2', changedProjection, 'req-crash');
// Unreachable in the intended crash scenario: the rename hook above hangs
// forever the first time a target is renamed to its `.old-` backup, and this
// fixture's own projection always changes an existing target.
process.exit(1);
