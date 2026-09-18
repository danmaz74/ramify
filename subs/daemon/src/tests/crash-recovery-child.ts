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
 *
 * The optional third argument selects the view: `api` (the default) publishes
 * `mod`'s `.ramify` directory; `architect` publishes `.ramify-architect` at
 * the root with the `engine` and `gamma` modules.
 */
import { writeFile } from 'node:fs/promises';
import {
  createControlledApiViewFilesystem, createControlledFilesystemApiViewPublisher, createNodeApiViewFilesystem,
} from '../api-view-publisher.js';
import type { PublishInput } from '../interfaces/daemon.js';
import { apiInput, area, described, entry, file, moduleProjection, projection } from './api-view-fixtures.js';
import { architectView } from './architect-view-fixtures.js';

const [, , root, checkpointPath, view = 'api'] = process.argv;
if (!root || !checkpointPath || (view !== 'api' && view !== 'architect')) {
  console.error('usage: crash-recovery-child.ts <root> <checkpointPath> [api|architect]');
  process.exit(2);
}
const backup = view === 'api' ? '.ramify.old-' : '.ramify-architect.old-';

const fs = createControlledApiViewFilesystem(createNodeApiViewFilesystem());
const realRename = fs.rename.bind(fs);
fs.rename = async (from: string, to: string) => {
  await realRename(from, to);
  if (to.includes(backup)) {
    await writeFile(checkpointPath, 'reached');
    // A bare `new Promise(() => {})` keeps nothing alive: Node treats an
    // idle event loop with only an unsettled top-level await as done and
    // exits on its own. An interval timer keeps the process genuinely
    // running until the parent test sends SIGKILL.
    await new Promise<never>(() => { setInterval(() => {}, 60_000); });
  }
};

const publisher = createControlledFilesystemApiViewPublisher(
  { maxAreaBytes: 32 * 1024 * 1024, maxArchitectBytes: 64 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024,
    maxStagedBytes: 256 * 1024 * 1024 },
  fs,
);

const changed: PublishInput = view === 'api'
  ? apiInput(projection([moduleProjection('mod', 'mod', area('ordinary', 'mod/src', [
    file('external', 'other/src/thing.ts', [entry('changed', 'value', described('changed', 'function changed(): void;'))]),
  ]))]))
  : { api: null, architect: architectView({ revision: 'rev/2:fixture', children: ['engine', 'gamma'] }) };

await publisher.publish(root, 'rev-2', changed, 'req-crash');
// Unreachable in the intended crash scenario: the rename hook above hangs
// forever the first time a target is renamed to its `.old-` backup, and this
// fixture's own input always changes an existing target.
process.exit(1);
