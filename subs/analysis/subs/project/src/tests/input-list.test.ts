import { mkdtemp, readFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capture } from '../capture.js';
import { byteOrder } from '../data.js';
import { observeProject } from '../observer.js';
import type { ObservationSink, ProjectObserver } from '../interfaces/project.js';
import { declaration, fixture, limits, put } from './fixtures.js';

// Every content identity and input identity passes through `createHash`.
const hashing = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (...args: Parameters<typeof actual.createHash>) => { hashing.calls++; return actual.createHash(...args); } };
});

const registry = 'registry/1:test';
/** Observer cases acquire a project per step; a loaded parallel run exceeds the 5 s default. */
const timeout = 60_000;
let work: string, root: string;
const disposals: (() => Promise<void>)[] = [];
beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-input-list-')));
  root = join(work, 'project');
  await fixture(root);
  await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
  await put(root, 'subs/child/README.md', '# Child\n\nChild purpose.\n');
  await put(root, 'subs/child/src/child.ts', 'export const child = 1;\n');
  await put(root, 'node_modules/pkg/index.d.ts', 'export declare const pkg: number;\n');
});
afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
  await rm(work, { recursive: true, force: true });
});

function capture(at = root): Capture {
  const created = new Capture(at, limits, performance.now() + 30_000);
  disposals.push(() => created.dispose());
  return created;
}
async function observe(): Promise<ProjectObserver> {
  const result = await observeProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' },
    parse: declaration, limits, registry });
  if (result.status !== 'observing') throw new Error(`Expected an observing project: ${JSON.stringify(result)}`);
  disposals.push(() => result.observer.dispose());
  return result.observer;
}
/** A capture that never held a cached list, replaying the same reads of the same disk. */
async function rebuilt(from: Capture): Promise<string> {
  const fresh = new Capture(from.root, limits, performance.now() + 30_000);
  try {
    await fresh.replay(from.observations());
    return JSON.stringify(fresh.inputs);
  } finally { await fresh.dispose(); }
}
type Report = (sink: ObservationSink) => void;
/** A newly acquired observer given the same reports, promoted when the original promoted them. */
async function reobserved(reports: readonly Report[], promoted: boolean): Promise<{ inputs: string; inputId: string }> {
  const result = await observeProject({ request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' },
    parse: declaration, limits, registry });
  if (result.status !== 'observing') throw new Error('Expected an observing project');
  try {
    for (const report of reports) report(result.observer.sink);
    if (promoted) expect((await result.observer.apply([])).kind).toBe('unchanged');
    return { inputs: JSON.stringify(result.observer.inputs), inputId: result.observer.inputId };
  } finally { await result.observer.dispose(); }
}
const sha256 = async (path: string): Promise<string> =>
  (await vi.importActual<typeof import('node:crypto')>('node:crypto')).createHash('sha256').update(await readFile(path)).digest('hex');

describe('the observed-input list', () => {
  it('HO-3 input-list-cached: repeated reads without a mutation return the cached list and identity without hashing', async () => {
    const view = capture();
    await view.application('src/value.ts', 'source');
    await view.readDirectory('src');
    await view.hasExactEntry(join(root, 'module.ramify'));
    const first = view.inputs, version = view.version;
    hashing.calls = 0;
    for (let index = 0; index < 5; index++) expect(view.inputs).toBe(first);
    // Repeating a completed read with the same role changes nothing.
    await view.readFile('src/value.ts', 'source');
    await view.readDirectory('src');
    await view.hasExactEntry(join(root, 'module.ramify'));
    expect(view.inputs).toBe(first);
    expect(view.version).toBe(version);
    expect(hashing.calls).toBe(0);

    const observer = await observe();
    const inputs = observer.inputs, inputId = observer.inputId;
    hashing.calls = 0;
    for (let index = 0; index < 5; index++) { expect(observer.inputs).toBe(inputs); expect(observer.inputId).toBe(inputId); }
    expect(await observer.apply([])).toEqual({ kind: 'unchanged' });
    expect(observer.inputs).toBe(inputs); expect(observer.inputId).toBe(inputId);
    expect(hashing.calls).toBe(0);

    // A pending report is merged once; the merged list and its identity are then cached too.
    const dependency = join(root, 'node_modules/pkg/index.d.ts');
    observer.sink.file(dependency, await sha256(dependency), 35, 'dependency');
    const merged = observer.inputs, mergedId = observer.inputId;
    expect(merged).not.toBe(inputs); expect(mergedId).not.toBe(inputId);
    hashing.calls = 0;
    for (let index = 0; index < 5; index++) { expect(observer.inputs).toBe(merged); expect(observer.inputId).toBe(mergedId); }
    expect(hashing.calls).toBe(0);
  }, timeout);

  it('HO-4 input-list-invalidated: every capture mutation advances the version and equals a fresh rebuild', async () => {
    const view = capture();
    await put(root, 'target.json', '"a"');
    await symlink(join(root, 'target.json'), join(root, 'link.json'));
    await put(root, 'src/été.ts', 'export const summer = 1;\n');
    const mutations: [string, () => Promise<unknown>][] = [
      ['observe a new path', () => view.fileExists('src/value.ts')],
      ['observe an absent path', () => view.fileExists('missing.ts')],
      ['probe an exact name', () => view.hasExactEntry(join(root, 'package.json'))],
      ['read bytes', () => view.readFile('src/value.ts')],
      ['change a read role in place', () => view.application('src/value.ts', 'source')],
      ['enumerate a directory', () => view.readDirectory('src')],
      ['observe a non-ASCII path', () => view.fileExists('src/été.ts')],
      ['read through a symlink', () => view.readFile('link.json', 'configuration')],
      ['refresh an edited file', async () => { await put(root, 'src/value.ts', 'export const value = 2;\n'); await view.refresh('src/value.ts'); }],
      ['refresh a created path', async () => { await put(root, 'missing.ts', 'export {};\n'); await view.refresh('missing.ts'); }],
      ['refresh a retargeted symlink', async () => {
        await put(root, 'other.json', '"b"'); await unlink(join(root, 'link.json'));
        await symlink(join(root, 'other.json'), join(root, 'link.json')); await view.refresh('link.json');
      }],
      ['forget an observation', () => view.forget('missing.ts')],
      ['record a reported read', async () => { view.retainAcquisition(); await view.reported(() => view.readFile('package.json')); }],
      ['retire reported reads', () => view.retireReported()],
      ['relabel under a new root', async () => { view.root = join(root, 'src'); }],
    ];
    for (const [name, mutate] of mutations) {
      const before = view.inputs, version = view.version;
      await mutate();
      expect(view.version, name).toBeGreaterThan(version);
      expect(view.inputs, name).not.toBe(before);
      expect(JSON.stringify(view.inputs), name).toBe(await rebuilt(view));
    }
    expect(view.inputs.map(input => input.path)).toContain('été.ts');
    const version = view.version;
    await view.dispose();
    expect(view.version).toBeGreaterThan(version);
    expect(view.inputs).toEqual([]);
  }, timeout);

  it('HO-4 input-list-invalidated: reports, promotion, local and structural updates equal a fresh acquisition', async () => {
    const observer = await observe();
    const dependency = join(root, 'node_modules/pkg/index.d.ts');
    const digest = await sha256(dependency);
    const reports: Report[] = [];
    let promoted = false;
    const step = async (name: string, mutate: () => Promise<unknown>, changes = true): Promise<void> => {
      const inputs = observer.inputs, inputId = observer.inputId;
      await mutate();
      const fresh = await reobserved(reports, promoted);
      expect(JSON.stringify(observer.inputs), name).toBe(fresh.inputs);
      expect(observer.inputId, name).toBe(fresh.inputId);
      if (changes) expect(observer.inputs, name).not.toBe(inputs);
      if (changes) expect(observer.inputId, name).not.toBe(inputId);
    };
    const report = (entry: Report) => async () => { reports.push(entry); entry(observer.sink); };
    await step('opened', async () => undefined, false);
    await step('report a file read', report(sink => sink.file(dependency, digest, 35, 'dependency')));
    await step('report a directory', report(sink => sink.directory(join(root, 'node_modules/pkg'), [dependency])));
    await step('report an absence', report(sink => sink.absent(join(root, 'node_modules/missing.d.ts'))));
    await step('report a probe', report(sink => sink.probe(join(root, 'node_modules/probe.d.ts'), 'fileExists')));
    await step('promote the reports', async () => { expect((await observer.apply([])).kind).toBe('unchanged'); promoted = true; });
    await step('edit an owned file', async () => {
      await put(root, 'subs/child/src/child.ts', 'export const child = 2;\n');
      expect((await observer.apply([{ path: 'subs/child/src/child.ts', kind: 'changed' }])).kind).toBe('local');
    });
    await step('create an owned file, retiring reported reads', async () => {
      await put(root, 'subs/child/src/extra.ts', 'export const extra = 3;\n');
      expect((await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'created' }])).kind).toBe('local');
      reports.length = 0; promoted = false;
    });
    await step('change a description, replacing the inventory', async () => {
      await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child tagged [ui]\n');
      expect((await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }])).kind).toBe('local');
    });
    await step('rebuild the whole inventory', async () => {
      await put(root, 'subs/child/subs/grandchild/module.ramify', 'ramify 1\nmodule grandchild\n');
      await put(root, 'subs/child/subs/grandchild/README.md', '# Grandchild\n\nGrandchild purpose.\n');
      await put(root, 'subs/child/subs/grandchild/src/deep.ts', 'export const deep = 4;\n');
      expect((await observer.apply([{ path: 'subs/child/subs/grandchild/module.ramify', kind: 'created' }])).kind).toBe('structural');
    });
  }, timeout);

  it('HO-5 input-cache-no-leak: forgotten observations leave no cached entry', async () => {
    const view = capture();
    for (let index = 0; index < 50; index++) {
      await put(root, `src/temporary-${index}.ts`, `export const value = ${index};\n`);
      await view.application(`src/temporary-${index}.ts`, 'source');
      expect(view.inputs.some(input => input.path === `src/temporary-${index}.ts`)).toBe(true);
      await view.forget(`src/temporary-${index}.ts`);
      expect(view.recorded(`src/temporary-${index}.ts`)).toBeUndefined();
      expect(view.digest(`src/temporary-${index}.ts`)).toBeUndefined();
    }
    expect(view.inputs).toEqual([]);
    expect(view.observations()).toEqual([]);
    // A re-observed path is hashed again from its new bytes, not from a retained entry.
    await put(root, 'src/temporary-0.ts', 'export const value = "again";\n');
    await view.application('src/temporary-0.ts', 'source');
    expect(view.inputs).toEqual([{ path: 'src/temporary-0.ts', role: 'source', sha256: await sha256(join(root, 'src/temporary-0.ts')), bytes: 30 }]);

    const observer = await observe();
    const dependency = join(root, 'node_modules/pkg/index.d.ts');
    const label = 'node_modules/pkg/index.d.ts';
    observer.sink.file(dependency, await sha256(dependency), 35, 'dependency');
    expect(observer.inputs.some(input => input.path === label)).toBe(true);
    await observer.apply([]);
    await unlink(join(root, 'subs/child/src/child.ts'));
    expect((await observer.apply([{ path: 'subs/child/src/child.ts', kind: 'deleted' }])).kind).toBe('local');
    expect(observer.inputs.some(input => input.path === label || input.path === 'subs/child/src/child.ts')).toBe(false);
    expect(observer.inputId).toBe((await reobserved([], false)).inputId);
  }, timeout);

  it('HO-6 byte-order-equivalent: the comparator orders every tested pair as Buffer.compare does', async () => {
    const buffers = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
    const samples = ['', 'a', 'ab', 'b', 'A', 'z', '~', '\u007f', '\u0080', '\u00e9', '\u00ff', '\u0100', '\u07ff', '\u0800',
      '\u4e2d\u6587', '\ud7ff', '\ue000', '\uf8ff', '\ufeff', '\ufffd', '\uffff', '\u{10000}', '\u{1f600}', '\u{10ffff}',
      '\ud800', '\udc00', '\ud800a', 'a\udfff', '\udc00\ud800', '\ud800\u{10000}', 'src/\ue000.ts', 'src/\u{1f600}.ts',
      'src/\u00e9.ts', 'src/e.ts', 'src/\ufffd.ts', 'src/\ud800.ts', 'external:0123/x', 'subs/child/src/child.ts', 'subs/child/src'];
    for (const a of samples) for (const b of samples) expect(byteOrder(a, b), JSON.stringify([a, b])).toBe(buffers(a, b));

    // Seeded pairs over units at every encoding and surrogate boundary.
    const units = [0x00, 0x2f, 0x61, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd, 0xffff];
    let seed = 0x2545f491;
    const next = (bound: number): number => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % bound; };
    const text = (): string => String.fromCharCode(...Array.from({ length: next(6) }, () => units[next(units.length)]!));
    const strings = Array.from({ length: 400 }, text);
    for (let index = 0; index + 1 < strings.length; index++) {
      expect(byteOrder(strings[index]!, strings[index + 1]!)).toBe(buffers(strings[index]!, strings[index + 1]!));
    }
    // Sorting, including ties such as a lone surrogate against U+FFFD, is identical.
    expect(JSON.stringify([...strings, ...samples].sort(byteOrder))).toBe(JSON.stringify([...strings, ...samples].sort(buffers)));

    // A capture orders non-ASCII and supplementary names by UTF-8 bytes, not code units.
    for (const name of ['\ue000', '\u{1f600}', '\u00e9', 'z']) await put(root, `names/${name}.ts`, 'export {};\n');
    const view = capture();
    await view.readDirectory('names');
    for (const name of ['\u{1f600}', 'z', '\ue000', '\u00e9']) await view.fileExists(`names/${name}.ts`);
    const paths = view.inputs.map(input => input.path);
    expect(paths).toEqual(['names', 'names/z.ts', 'names/\u00e9.ts', 'names/\ue000.ts', 'names/\u{1f600}.ts']);
    expect(paths).toEqual([...paths].sort(buffers));
  }, timeout);
});
