import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { parseDescription, readRootMarker } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry } from '../../subs/analysis/subs/model/src/index.js';
import { isRamifyGeneratedPath } from '../../subs/analysis/subs/project/src/generated-path.js';
import { observeProject } from '../../subs/analysis/subs/project/src/observer.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { AcquisitionLimits, ProjectReadOptions } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import type { RetainedSession, SessionInputs } from '../../subs/analysis/src/interfaces/session.js';
import { createFilesystemWatcher } from '../../subs/daemon/src/filesystem-watcher.js';
import type { WatchEvent } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { sessionInputs } from './session-expectations.js';
import type { InstanceHandler } from './runner.js';

const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
const registry = createDefaultTagRegistry().id;
const sessionLimits = { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 };

async function withTemp<T>(prefix: string, run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
function options(root: string): ProjectReadOptions {
  return { request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse: parseDescription, marker: readRootMarker, limits, registry };
}
async function batch(root: string) {
  const acquired = await readProject(options(root));
  if (acquired.status !== 'acquired') throw new Error(`Batch acquisition failed: ${JSON.stringify(acquired)}`);
  return acquired.view;
}
async function inputs(root: string): Promise<SessionInputs> {
  return { ...sessionInputs(root), session: sessionLimits };
}
async function until(predicate: () => boolean, message: string): Promise<void> {
  const deadline = performance.now() + 4000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(message);
    await delay(10);
  }
}
async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

const handlers = new Map<string, InstanceHandler>();

handlers.set('I2A-02:ordinary-inventory-excluded', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-ord-', async root => {
    await createProjectFixture(root);
    await put(root, 'src/.ramify/subs/provider/src/interfaces/api.ts.md', '# api\n\nGenerated summary.\n');
    await put(root, 'src/.ramify/weird.xyz', 'not application source, arbitrary extension\n');
    await put(root, 'src/.ramify/nested/deep/file.ts', 'export const generated = 1;\n');
    const view = await batch(root);
    try {
      const owned = view.inventory.files.map(file => file.path);
      assertions.equal('no generated file entered the owned inventory', owned.filter(path => isRamifyGeneratedPath(path)), []);
      assertions.equal('no generated path entered outsideModuleFiles', view.inventory.outsideModuleFiles.filter(path => isRamifyGeneratedPath(path)), []);
      assertions.equal('no generated path was captured as an input', view.inputs.filter(input => isRamifyGeneratedPath(input.path)), []);
      assertions.ok('a real neighboring source file is still inventoried', owned.includes('subs/provider/src/interfaces/api.ts'));
    } finally { await view.dispose(); }
  });
} });

handlers.set('I2A-02:tests-inventory-excluded', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-tests-', async root => {
    await createProjectFixture(root);
    await put(root, 'subs/consumer/src/tests/consumer.test.ts', 'export const spec = 1;\n');
    await put(root, 'subs/consumer/src/tests/.ramify/subs/provider/src/interfaces/api.ts.md', '# api\n');
    await put(root, 'subs/consumer/src/tests/.ramify/weird.txt', 'generated\n');
    const view = await batch(root);
    try {
      const owned = view.inventory.files.map(file => [file.path, file.area] as const);
      assertions.ok('the real testing file is owned with the tests area', owned.some(([path, area]) => path === 'subs/consumer/src/tests/consumer.test.ts' && area === 'tests'));
      assertions.equal('no generated testing path entered the owned inventory', owned.filter(([path]) => isRamifyGeneratedPath(path)), []);
      assertions.equal('no generated testing path was captured as an input', view.inputs.filter(input => isRamifyGeneratedPath(input.path)), []);
      const consumer = view.inventory.modules.find(module => module.id === 'fixture/consumer')!;
      assertions.equal('the tests-area profile/presence reflects only the real file', consumer.areas.find(area => area.kind === 'tests')?.present, true);
    } finally { await view.dispose(); }
  });
} });

handlers.set('I2A-02:explicit-config-excluded', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-cfg-', async root => {
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
    await put(root, 'README.md', '# fixture\n\nPurpose.\n');
    await put(root, 'package.json', '{"private":true,"type":"module"}\n');
    // The explicit `files` entry names a project-root path outside every
    // module's `src/`, so only the explicit-selection path (not the directory
    // walk) could otherwise admit it as outside-module source.
    await put(root, 'tsconfig.json', JSON.stringify({ files: ['src/value.ts', '.ramify/explicit.ts'] }) + '\n');
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    await put(root, '.ramify/explicit.ts', 'export const generated = 1;\n');
    const view = await batch(root);
    try {
      assertions.equal('the explicitly selected generated path is not outside-module source', view.inventory.outsideModuleFiles, []);
      assertions.equal('the explicitly selected generated path was not captured as an input', view.inputs.filter(input => isRamifyGeneratedPath(input.path)), []);
      assertions.ok('the explicitly selected real file is still owned', view.inventory.files.some(file => file.path === 'src/value.ts'));
    } finally { await view.dispose(); }
  });
} });

handlers.set('I2A-02:exposure-rejected', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-exp-', async root => {
    await put(root, 'module.ramify', 'ramify 1\nroot module fixture\nexpose-src thing from ".ramify/thing.ts" to parent\nexpose-test other from ".ramify/other.ts" to parent\n');
    await put(root, 'README.md', '# fixture\n\nPurpose.\n');
    await put(root, 'package.json', '{"private":true,"type":"module"}\n');
    await put(root, 'tsconfig.json', '{"include":["src"]}\n');
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    // These generated files really exist on disk, but generated-output
    // isolation removes them from every directory listing capture reports,
    // so resolution can only ever find them missing, never a valid file.
    await put(root, 'src/.ramify/thing.ts', 'export const generated = 1;\n');
    await put(root, 'src/tests/.ramify/other.ts', 'export const generated = 2;\n');
    const acquired = await readProject(options(root));
    assertions.equal('a module.ramify statement naming only generated output is an invalid boundary', acquired.status, 'invalid');
    if (acquired.status !== 'invalid' || !acquired.inventory) throw new Error(`Unexpected acquisition outcome: ${JSON.stringify(acquired).slice(0, 500)}`);
    const references = acquired.inventory.references.filter(reference => reference.decoded.includes('.ramify'));
    assertions.equal('two references were recorded, one per statement', references.length, 2);
    assertions.ok('every generated-target reference is missing or excluded, never a valid file', references.every(reference => reference.status === 'excluded' || reference.status === 'missing'));
    assertions.ok('the generated-target references produced description issues, so no original or exposure is created', acquired.issues.some(issue => issue.path === 'module.ramify'));
    assertions.equal('no generated path entered the owned inventory', acquired.inventory.files.filter(file => isRamifyGeneratedPath(file.path)), []);
  });
} });

handlers.set('I2A-02:observer-input-stable', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-obs-', async root => {
    await createProjectFixture(root);
    const opened = await openRetainedSession(await inputs(root));
    if (opened.status !== 'opened') throw new Error(`Session did not open: ${JSON.stringify(opened)}`);
    const session: RetainedSession = opened.session;
    try {
      const sequence0 = opened.revision.sequence;
      await put(root, 'src/.ramify/created.ts.md', '# created\n');
      const created = await session.update([{ path: 'src/.ramify/created.ts.md', kind: 'created' }]);
      assertions.ok('a created generated file publishes no new revision', created.status === 'revised' && created.identical === true);
      assertions.equal('the sequence is unchanged after a generated create', created.status === 'revised' ? created.revision.sequence : -1, sequence0);
      await put(root, 'src/.ramify/created.ts.md', '# changed\n');
      const changed = await session.update([{ path: 'src/.ramify/created.ts.md', kind: 'changed' }]);
      assertions.ok('a changed generated file publishes no new revision', changed.status === 'revised' && changed.identical === true);
      const deleted = await session.update([{ path: 'src/.ramify/created.ts.md', kind: 'deleted' }]);
      assertions.ok('a deleted generated file publishes no new revision', deleted.status === 'revised' && deleted.identical === true);
      // A transient publisher sibling, never observed, leaves an unrelated sweep unchanged too.
      await put(root, 'src/.ramify.tmp-deadbeef/stage.ts', 'export const staged = 1;\n');
      const swept = await session.sweep();
      assertions.equal('a sweep after transient-only disk activity reports unchanged', swept.status, 'unchanged');
      assertions.equal('the final sequence still equals the opening sequence', session.current?.sequence, sequence0);
    } finally { await session.dispose(); }
  });
} });

handlers.set('I2A-02:watcher-silent', { kind: 'memory', run: async ({ assertions }) => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-i2a02-watch-'));
  const handles: { close(): Promise<void> }[] = [];
  try {
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    const batches: (readonly WatchEvent[])[] = [];
    const handle = await createFilesystemWatcher().watch(root, events => { batches.push(events); });
    handles.push(handle);
    await put(root, 'src/.ramify/final.ts.md', '# final\n');
    await put(root, 'src/.ramify.tmp-cafef00d/stage.ts', 'export const staged = 1;\n');
    await put(root, 'src/.ramify.old-cafef00d/previous.ts', 'export const rolled = 1;\n');
    // The positive control: a real neighboring source event still publishes.
    await put(root, 'src/value.ts', 'export const value = 2;\n');
    await until(() => batches.flat().some(event => event.path.endsWith('value.ts')), 'the real neighboring event never published');
    const events = batches.flat();
    assertions.equal('no reserved-name event reached the listener', events.filter(event => ['.ramify', '.ramify.tmp-cafef00d', '.ramify.old-cafef00d']
      .some(name => event.path.split('/').includes(name))), []);
    assertions.ok('the real neighboring source event still published', events.some(event => event.path.endsWith('value.ts')));
  } finally {
    await Promise.all(handles.map(item => item.close()));
    await rm(root, { recursive: true, force: true });
  }
} });

handlers.set('I2A-02:tests-area-not-created', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-testsarea-', async root => {
    await createProjectFixture(root);
    // A pure `expose-sub` aggregator with no `src/` of its own, added only to
    // this handler's own temp root (never shared with other leaves).
    await put(root, 'subs/hollow/module.ramify', 'ramify 1\nmodule hollow\n');
    await put(root, 'subs/hollow/README.md', '# hollow\n\nAn aggregator declared with no src/ of its own.\n');
    // The consumer module has no `src/tests` at all yet; hollow has no `src/` at all.
    assertions.ok('the consumer module starts with no src/tests directory', !await exists(join(root, 'subs/consumer/src/tests')));
    assertions.ok('the hollow module starts with no src directory', !await exists(join(root, 'subs/hollow/src')));
    const before = await batch(root);
    try {
      const hollow = before.inventory.modules.find(module => module.id === 'fixture/hollow')!;
      assertions.equal('a module with no src/ at all reports its ordinary area absent', hollow.areas.find(area => area.kind === 'ordinary')?.present, false);
    } finally { await before.dispose(); }
    await put(root, 'subs/consumer/src/.ramify/subs/provider/src/interfaces/api.ts.md', '# api\n');
    const afterOrdinary = await batch(root);
    try {
      const consumer = afterOrdinary.inventory.modules.find(module => module.id === 'fixture/consumer')!;
      assertions.equal('writing an ordinary .ramify catalog never creates src/tests', consumer.areas.find(area => area.kind === 'tests')?.present, false);
      assertions.ok('src/tests still does not exist on disk', !await exists(join(root, 'subs/consumer/src/tests')));
    } finally { await afterOrdinary.dispose(); }
    // Restored pre-Plan-2A rule (user decision): presence is exactly directory
    // existence, with no generated-content awareness. `materialize` itself
    // never creates `src/` or `src/tests/` (enforced at the publisher, not
    // here); an out-of-band directory holding only generated content, as
    // simulated below, is a different, deliberately unsupported case, and
    // both areas report present once their directory exists, while the
    // generated content inside remains unowned either way.
    await put(root, 'subs/consumer/src/tests/.ramify/subs/provider/src/interfaces/api.ts.md', '# api\n');
    await put(root, 'subs/hollow/src/.ramify/subs/provider/src/interfaces/api.ts.md', '# api\n');
    const afterBoth = await batch(root);
    try {
      const consumer = afterBoth.inventory.modules.find(module => module.id === 'fixture/consumer')!;
      const hollow = afterBoth.inventory.modules.find(module => module.id === 'fixture/hollow')!;
      assertions.equal('a src/tests directory that now exists (even holding only generated content) reports present',
        consumer.areas.find(area => area.kind === 'tests')?.present, true);
      assertions.equal('a src directory that now exists (even holding only generated content) reports present',
        hollow.areas.find(area => area.kind === 'ordinary')?.present, true);
      assertions.equal('no file under either generated-only directory is owned',
        afterBoth.inventory.files.filter(file => (file.owner === 'fixture/consumer' && file.area === 'tests') || file.owner === 'fixture/hollow'), []);
    } finally { await afterBoth.dispose(); }
  });
} });

handlers.set('I2A-02:transient-names-excluded', { kind: 'memory', run: async ({ assertions }) => {
  await withTemp('ramify-i2a02-transient-', async root => {
    await createProjectFixture(root);
    await put(root, 'src/.ramify.tmp-1a2b3c4d/stage.ts', 'export const staged = 1;\n');
    await put(root, 'src/.ramify.old-1a2b3c4d/rolled.ts', 'export const rolled = 1;\n');
    // Near-miss names are ordinary and remain real, owned application source.
    await put(root, 'src/.ramify-other/real.ts', 'export const nearMiss = 1;\n');
    const view = await batch(root);
    try {
      const owned = view.inventory.files.map(file => file.path);
      assertions.equal('both transient publisher siblings are fully excluded', owned.filter(path => path.includes('.ramify.tmp-') || path.includes('.ramify.old-')), []);
      assertions.ok('a near-miss segment stays ordinary, owned application source', owned.includes('src/.ramify-other/real.ts'));
      assertions.equal('no transient path was captured as an input', view.inputs.filter(input => isRamifyGeneratedPath(input.path)), []);
    } finally { await view.dispose(); }
  });
  // Quick confirmation at the watcher boundary: a transient sibling attaches no handle.
  const { default: fs } = await import('node:fs');
  const { vi } = await import('vitest');
  const root = await mkdtemp(join(tmpdir(), 'ramify-i2a02-transient-watch-'));
  const handles: { close(): Promise<void> }[] = [];
  const paths: string[] = [];
  const originalWatch = fs.watch;
  const spy = vi.spyOn(fs, 'watch').mockImplementation((...args: Parameters<typeof fs.watch>) => {
    paths.push(String(args[0])); return originalWatch(...args);
  });
  try {
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    await put(root, 'src/.ramify.tmp-99999999/stage.ts', 'export const staged = 1;\n');
    const handle = await createFilesystemWatcher().watch(root, () => {});
    handles.push(handle);
    assertions.ok('the watcher attaches no handle beneath the transient stage sibling', !paths.some(path => path.includes('.ramify.tmp-99999999')));
  } finally {
    await Promise.all(handles.map(item => item.close()));
    spy.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
} });

export const plan2aIsolationHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
