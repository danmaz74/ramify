import fs from 'node:fs';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createFilesystemWatcher } from '../filesystem-watcher.js';
import type { ContextEvent, ContextStatus, ContextToken, WatchEvent, WatcherHandle, WatchScope } from '../../subs/contexts/src/interfaces/contexts.js';
import type { ProjectExclusion } from '../../../analysis/subs/project/src/interfaces/project.js';
import { alive, capabilities, descendants, unwrap, until, withDaemonProcess } from './daemon-process.js';
import { watchScope } from './watch-scopes.js';

/**
 * PB1-23 (excluded and inert observation) at the watcher and real daemon boundaries.
 * Contracts, "Transport, observation and projections": watcher ports receive revision-bound
 * excluded roots and the canonical reserved-path rules and register nothing beneath them;
 * they are reconfigured after boundary changes, and the enclosing directory stays watched so
 * that a boundary root's removal is observed. Expected values are written from the contracts
 * and the fixture below, never read back from the implementation.
 */
const exclusion = (kind: ProjectExclusion['kind'], directory: string, owner: string | null = null): ProjectExclusion => ({ kind, directory, owner });
const root = { id: 'app', parent: null, directory: '.' };
const declared = (...extra: ProjectExclusion[]) => ({ modules: [root],
  exclusions: [exclusion('output', 'dist'), exclusion('external', 'external-tree'), exclusion('scratch', 'src/tmp', 'app'), ...extra]
    .sort((a, b) => a.directory < b.directory ? -1 : 1) });

async function put(base: string, path: string, content: string): Promise<void> {
  await mkdir(join(base, path, '..'), { recursive: true });
  await writeFile(join(base, path), content);
}
/** Source, inert prose, a declared owned-ignored and external tree, a scratch directory,
 * installed packages and compiler output, each with nested directories. */
async function layout(base: string): Promise<void> {
  for (const [path, content] of Object.entries({
    'src/main.ts': 'export const main = 1;\n', 'src/tmp/sub/scratch.ts': 'export const scratch = 1;\n',
    'docs/notes.md': '# Notes\n', 'vendor/deep/dir/file.ts': 'export const vendor = 1;\n',
    'external-tree/x/y.ts': 'export const external = 1;\n', 'node_modules/pkg/index.js': 'module.exports = 1;\n',
    'dist/out/main.js': 'export {};\n',
  })) await put(base, path, content);
}

async function watching(run: (base: string, state: {
  readonly paths: string[]; readonly events: () => readonly WatchEvent[]; readonly classified: () => number;
  open(scope: WatchScope): Promise<WatcherHandle>;
}) => Promise<void>): Promise<void> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rpb16-watch-')));
  const native: fs.FSWatcher[] = [], paths: string[] = [], batches: (readonly WatchEvent[])[] = [], handles: WatcherHandle[] = [];
  let classified = 0;
  const original = fs.watch;
  const spy = vi.spyOn(fs, 'watch').mockImplementation((...args: Parameters<typeof fs.watch>) => {
    paths.push(relative(base, String(args[0])) || '.');
    const handle = original(...args); native.push(handle); return handle;
  });
  try {
    await layout(base);
    await run(base, { paths, events: () => batches.flat(), classified: () => classified, async open(scope) {
      const counted: WatchScope = { ...scope, excluded(path) { classified++; return scope.excluded(path); } };
      const handle = await createFilesystemWatcher().watch(base, counted, events => { batches.push(events); });
      handles.push(handle); return handle;
    } });
  } finally {
    await Promise.all(handles.map(handle => handle.close()));
    try { for (const handle of native) expect(handle.eventNames()).toEqual([]); }
    finally { spy.mockRestore(); await rm(base, { recursive: true, force: true }); }
  }
}
describe('PB1-23: the filesystem watcher registers nothing beneath an exclusion', () => {
  it('registers only directories outside every exclusion, one classification per directory met, whatever the file count', async () => {
    await watching(async (base, state) => {
      // Many inert and excluded files change no registration and no classification count.
      for (let index = 0; index < 400; index++) {
        await put(base, `vendor/deep/dir/f${index}.ts`, 'export {};\n');
        await put(base, `docs/inert-${index}.md`, '# inert\n');
      }
      const handle = await state.open(watchScope(declared(exclusion('owned-ignored', 'vendor', 'app')), 4));
      expect([...state.paths].sort()).toEqual(['.', 'docs', 'src']);
      // Root children src, docs, vendor, external-tree, node_modules, dist, and src's child tmp.
      expect(state.classified()).toBe(7);
      expect(handle.registrations()).toEqual({ sequence: 4, directories: 3,
        pruned: ['dist', 'external-tree', 'node_modules', 'src/tmp', 'vendor'], prunedCount: 5 });
    });
  });

  it('delivers no change beneath an exclusion and a declared or scratch root\'s own removal, never a reserved root\'s', async () => {
    await watching(async (base, state) => {
      const handle = await state.open(watchScope(declared(exclusion('owned-ignored', 'vendor', 'app'))));
      const before = [...state.paths];
      // Byte edits and creations beneath each excluded tree.
      for (const path of ['vendor/deep/dir/file.ts', 'external-tree/x/y.ts', 'src/tmp/sub/scratch.ts', 'node_modules/pkg/index.js', 'dist/out/main.js']) {
        await appendFile(join(base, path), '// edited\n');
      }
      for (const path of ['vendor/deep/new/created.ts', 'external-tree/new.ts', 'src/tmp/created.ts', 'node_modules/other/index.js', 'dist/new.js']) {
        await put(base, path, 'export {};\n');
      }
      await rm(join(base, 'dist'), { recursive: true });
      await appendFile(join(base, 'docs/notes.md'), 'positive control\n');
      await until('inert positive control', 4000, () => state.events().some(event => event.path === 'docs/notes.md'));
      await delay(300);
      const events = state.events();
      expect(events.filter(event => /^(vendor|external-tree|src\/tmp|node_modules|dist)\//.test(event.path))).toEqual([]);
      // Compiler output is a reserved root: its own removal is not delivered.
      expect(events.filter(event => event.path === 'dist')).toEqual([]);
      expect(state.paths).toEqual(before);

      // The owned-ignored and scratch roots' own removals reach the listener.
      await rename(join(base, 'vendor'), join(base, 'moved'));
      await rm(join(base, 'src/tmp'), { recursive: true });
      await until('boundary root removals', 4000, () => ['vendor', 'src/tmp', 'moved'].every(path => state.events().some(event => event.path === path)));
      // The moved tree lies outside every exclusion now: it is registered with its subtree.
      await until('moved tree registered', 4000, () => handle.registrations().directories === 7);
      expect(state.paths.slice(before.length).sort()).toEqual(['moved', 'moved/deep', 'moved/deep/dir', 'moved/deep/new']);
      expect(handle.registrations()).toMatchObject({ pruned: ['external-tree', 'node_modules'], prunedCount: 2 });
    });
  });

  it('reconfigures: a new exclusion ends registrations beneath it, a removed one registers its tree', async () => {
    await watching(async (base, state) => {
      const handle = await state.open(watchScope(declared(exclusion('owned-ignored', 'vendor', 'app')), 1));
      expect([...state.paths].sort()).toEqual(['.', 'docs', 'src']);
      const classified = state.classified();
      // It reports the three directories registered beneath the removed exclusion.
      expect(await handle.reconfigure(watchScope(declared(exclusion('owned-ignored', 'docs', 'app')), 2))).toBe(3);
      expect([...state.paths].sort()).toEqual(['.', 'docs', 'src', 'vendor', 'vendor/deep', 'vendor/deep/dir']);
      expect(handle.registrations()).toEqual({ sequence: 2, directories: 5,
        pruned: ['dist', 'docs', 'external-tree', 'node_modules', 'src/tmp'], prunedCount: 5 });
      // Work follows the registered and pruned directories, not the files beneath them.
      expect(state.classified() - classified).toBeLessThanOrEqual(12);
      await appendFile(join(base, 'docs/notes.md'), 'now excluded\n');
      await appendFile(join(base, 'vendor/deep/dir/file.ts'), '// now watched\n');
      await until('reincluded edit', 4000, () => state.events().some(event => event.path === 'vendor/deep/dir/file.ts'));
      await delay(300);
      expect(state.events().filter(event => event.path.startsWith('docs/'))).toEqual([]);
    });
  });
});

/** The real daemon fixture: an owned-ignored tree the configuration lists, an external tree,
 * a scratch directory and inert prose; one analyzed source file. */
async function project(base: string): Promise<void> {
  await layout(base);
  await rm(join(base, 'dist'), { recursive: true });
  await rm(join(base, 'node_modules'), { recursive: true });
  await put(base, 'module.ramify', 'ramify 1\nroot module app\nowned-ignored "vendor"\nexternal "external-tree"\n');
  await put(base, 'README.md', '# App\n\nA watcher fixture.\n');
  await put(base, 'tsconfig.json', JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022',
    types: [], skipLibCheck: true }, include: ['src', 'vendor'], exclude: ['src/tmp'] }));
}

describe('PB1-23: the installed daemon watches by the published ownership', () => {
  it('records no registration beneath excluded trees, publishes nothing for their edits, observes boundary roots and reconfigures on declaration changes', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'rpb16-project-')));
    let pid = 0, children: number[] = [];
    try {
      await project(base);
      await withDaemonProcess('pb1-23', async daemon => {
        pid = daemon.pid;
        const { connection } = daemon;
        const opened = unwrap(await connection.openContext({ project: { cwd: base, root: base, scope: 'whole-project', configuration: 'discover' },
          setup: { registry: 'default', capabilities } }));
        if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
        const token: ContextToken = opened.token;
        const events: ContextEvent[] = [];
        unwrap(await connection.subscribe({ token }, event => events.push(event)));
        const first = unwrap(await connection.check({ token, requestId: 'open', freshness: { mode: 'synchronized', expect: [] } }));
        if (first.status !== 'reported' || !first.published) throw new Error(JSON.stringify(first).slice(0, 2000));
        children = await descendants(pid);
        const status = async (): Promise<ContextStatus> => unwrap(await connection.contextStatus({ token })) as ContextStatus;
        const settled = async (label: string, condition: (current: ContextStatus) => boolean) => until(label, 30_000, async () => {
          const current = await status();
          return current.synchronization === 'synchronized' && !current.pending.analysisRunning && condition(current);
        });
        const at = (directory: string) => directory === '.' ? base : join(base, directory);
        await settled('first registration', current => current.registrations?.sequence === first.revision.sequence);
        // After the first revision: registered directories are exactly those outside every exclusion.
        expect(await daemon.registered()).toEqual(['.', 'docs', 'src'].map(at).sort());
        expect((await status()).registrations).toEqual({ sequence: first.revision.sequence, directories: 3,
          pruned: ['external-tree', 'src/tmp', 'vendor'], prunedCount: 3 });
        const baseline = await status();
        const trace = (await daemon.trace()).length, delivered = events.length;

        // Byte edits beneath the declared trees and scratch, an inert byte edit and creations
        // there: no revision, no new registration, no new observation, same input identity.
        await appendFile(join(base, 'vendor/deep/dir/file.ts'), '// edited\n');
        await appendFile(join(base, 'external-tree/x/y.ts'), '// edited\n');
        await appendFile(join(base, 'src/tmp/sub/scratch.ts'), '// edited\n');
        await appendFile(join(base, 'docs/notes.md'), 'edited\n');
        await put(base, 'external-tree/x/new/deeper.ts', 'export {};\n');
        await put(base, 'src/tmp/new/deeper.ts', 'export {};\n');
        await delay(1500);
        await settled('after excluded edits', () => true);
        const after = await status();
        expect(after.published?.revision).toBe(baseline.published?.revision);
        expect(after.published?.fingerprints.inputId).toBe(baseline.published?.fingerprints.inputId);
        expect(after.session?.observedInputs).toBe(baseline.session?.observedInputs);
        expect(after.registrations).toEqual(baseline.registrations);
        expect((await daemon.trace()).slice(trace)).toEqual([]);
        expect(events.slice(delivered).filter(event => event.type === 'revision-published')).toEqual([]);

        // Positive control: an analyzed source edit publishes a watch revision.
        await appendFile(join(base, 'src/main.ts'), 'export const more = 2;\n');
        await settled('source revision', current => (current.published?.sequence ?? 0) > first.revision.sequence);
        expect((await status()).published?.cause).toBe('watch');

        // Boundary-root evidence: removing the owned-ignored root is observed through its parent.
        await rename(join(base, 'vendor'), join(base, 'vendor-away'));
        await until('missing owned-ignored root', 30_000, async () => (await status()).published?.outcome.execution === 'invalid');
        await rename(join(base, 'vendor-away'), join(base, 'vendor'));
        await settled('root restored', current => current.published?.outcome.execution === 'completed');

        // Adding a declaration prunes its tree: the registration of docs ends.
        const description = await readFile(join(base, 'module.ramify'), 'utf8');
        await writeFile(join(base, 'module.ramify'), `${description}owned-ignored "docs"\n`);
        await settled('docs declared', current => current.registrations?.pruned.includes('docs') === true);
        const declaredAt = (await status()).published!.sequence;
        expect((await status()).registrations).toEqual({ sequence: declaredAt, directories: 2,
          pruned: ['docs', 'external-tree', 'src/tmp', 'vendor'], prunedCount: 4 });
        expect(await daemon.registered()).toEqual(['.', 'src'].map(at).sort());

        // Removing the vendor declaration registers its tree, then sweeps conservatively.
        await writeFile(join(base, 'module.ramify'), 'ramify 1\nroot module app\nexternal "external-tree"\nowned-ignored "docs"\n');
        await settled('vendor reincluded', current => current.registrations !== null && !current.registrations.pruned.includes('vendor'));
        expect(await daemon.registered()).toEqual(['.', 'src', 'vendor', 'vendor/deep', 'vendor/deep/dir'].map(at).sort());
        const reincluded = await status();
        expect(reincluded.registrations).toMatchObject({ directories: 5, pruned: ['docs', 'external-tree', 'src/tmp'] });
        // The reincluded tree's source is watched: its edit publishes a revision.
        await appendFile(join(base, 'vendor/deep/dir/file.ts'), 'export const watched = 3;\n');
        await settled('reincluded edit', current => (current.published?.sequence ?? 0) > reincluded.published!.sequence);
        expect((await status()).published?.changed).toContain('vendor/deep/dir/file.ts');
      });
      // Cleanup: the daemon and every process it started have exited.
      expect(pid).toBeGreaterThan(0);
      expect([pid, ...children].filter(alive)).toEqual([]);
    } finally { await rm(base, { recursive: true, force: true }); }
  }, 180_000);
});
