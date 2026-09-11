import assert from 'node:assert/strict';
import { once } from 'node:events';
import { watch, writeFileSync, type FSWatcher } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { archive, packageRoot, until } from './resident-probe.js';

const excluded = new Set(['node_modules', '.git', 'dist', '.reference-work']);
const directory = await mkdtemp(join(tmpdir(), 'rf-watch-'));
const handles: FSWatcher[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  const root = join(directory, 'reference');
  await cp(resolve(packageRoot, 'examples/collection-review'), root, {
    recursive: true, filter: path => !relative(resolve(packageRoot, 'examples/collection-review'), path).split(sep).some(part => excluded.has(part)),
  });
  for (const name of excluded) { await mkdir(join(root, name), { recursive: true }); await writeFile(join(root, name, 'sentinel'), 'before'); }
  const burstDirectory = join(root, 'src', 'probe-burst'); await mkdir(burstDirectory);
  for (let index = 0; index < 100; index++) await writeFile(join(burstDirectory, `${index}.ts`), '// before\n');
  const pending = new Set<string>();
  const observed = new Set<string>();
  const batches: string[][] = [];
  let excludedEvents = 0; let nativeEvents = 0; let closed = false; let callbacksAfterClose = 0;
  const recursive = watch(root, { recursive: true }, (_event, name) => {
    if (closed) { callbacksAfterClose++; return; }
    nativeEvents++;
    if (name === null) return; // Unknown paths require conservative work in the real port.
    assert.ok(!isAbsolute(name) && !name.startsWith(`..${sep}`));
    if (name.split(sep).some(part => excluded.has(part))) { excludedEvents++; return; }
    pending.add(name); observed.add(name);
    clearTimeout(timer); timer = setTimeout(() => { batches.push([...pending].sort()); pending.clear(); }, 100);
  });
  handles.push(recursive);
  await delay(100);
  const start = performance.now();
  for (let index = 0; index < 100; index++) writeFileSync(join(burstDirectory, `${index}.ts`), '// after\n');
  const editDurationMs = performance.now() - start;
  assert.ok(editDurationMs < 100, 'Fixture did not produce its 100 edits inside the debounce window');
  for (const name of excluded) await writeFile(join(root, name, 'sentinel'), 'after');
  await until(() => observed.size === 100 && batches.length > 0, 'all recursive changes and debounced publication');
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 100);
  assert.ok(excludedEvents > 0, 'Control proves callback filtering does not avoid watching excluded trees');

  // Node recursive watch has no subtree-pruning option. Probe the selected port
  // arrangement separately: non-recursive handles on recursively enumerated directories.
  const watchedDirectories: string[] = [];
  let prunedEvents = 0;
  async function attach(path: string): Promise<void> {
    watchedDirectories.push(relative(root, path));
    handles.push(watch(path, () => { prunedEvents++; }));
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !excluded.has(entry.name)) await attach(join(path, entry.name));
    }
  }
  await attach(root);
  assert.ok(watchedDirectories.every(path => !path.split(sep).some(part => excluded.has(part))));
  await writeFile(join(burstDirectory, '0.ts'), '// pruned watcher control\n');
  await until(() => prunedEvents > 0, 'pruned watcher positive control');
  await delay(150);
  const beforeExcluded = prunedEvents;
  for (const name of excluded) await writeFile(join(root, name, 'sentinel'), 'excluded control');
  await delay(150);
  assert.equal(prunedEvents, beforeExcluded);

  const bounded = new Set<string>(); let overflows = 0;
  for (const path of observed) {
    if (bounded.size === 16) { bounded.clear(); overflows++; }
    bounded.add(path);
  }
  assert.ok(overflows > 0);
  let injectedErrors = 0;
  recursive.on('error', () => { injectedErrors++; });
  recursive.emit('error', Object.assign(new Error('probe fault injection'), { code: 'ENOSPC' }));
  assert.equal(injectedErrors, 1);
  assert.throws(() => watch(join(directory, 'absent')), { code: 'ENOENT' });
  closed = true; clearTimeout(timer);
  const closings = handles.map(handle => { const closing = once(handle, 'close'); handle.close(); return closing; });
  await Promise.all(closings); handles.length = 0;
  const atClose = nativeEvents;
  const prunedAtClose = prunedEvents;
  await writeFile(join(burstDirectory, '0.ts'), '// after close\n'); await delay(150);
  assert.equal(nativeEvents, atClose);
  assert.equal(callbacksAfterClose, 0);
  assert.equal(prunedEvents, prunedAtClose);
  await archive('fs-watch-recursive', { recursive: { changedPaths: observed.size, burstBatches: 1,
    editDurationMs, debounceMs: 100, rootRelative: true, excludedEventsFiltered: excludedEvents },
    prunedArrangement: { handles: watchedDirectories.length, excludedHandles: 0, excludedEvents: 0, positiveControl: true },
    overflow: { source: 'probe-owned bounded queue over actual events', maximumPaths: 16, overflows,
      nativeKernelOverflowObserved: false },
    errors: { injectedEventDelivered: true, realMissingRootError: 'ENOENT' },
    close: { everyHandleEmittedClose: true, callbacksAfterClose: 0 },
    decision: 'Use pruned per-directory fs.watch handles; unknown names, queue overflow and errors trigger conservative capture. Periodic and synchronized verification remain necessary because native event loss is not reliably signalled.' });
} finally {
  clearTimeout(timer); for (const handle of handles) handle.close();
  await rm(directory, { recursive: true, force: true });
}
