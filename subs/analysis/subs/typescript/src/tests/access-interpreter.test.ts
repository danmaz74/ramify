import { rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createAccessInterpreter } from '../access-interpreter.js';
import { AccessInterpretation } from '../accesses.js';
import { createSourceAnalysis } from '../source-analysis.js';
import { acquire, areasFor, fixture, sourceLimits } from './fixtures.js';
import type { AccessInterpreter, DescriptionDependencies } from '../interfaces/source.js';

const noDependencies: DescriptionDependencies = { files: [], resources: [], shims: [], absent: [] };
import type { Project } from 'typescript/unstable/sync';

it('matches whole-pass subsets, reports candidates per file, and replaces only changed descriptions', async () => {
  const root = await fixture({
    'src/api.ts': 'export const value = 1;',
    'src/a.ts': "import { value } from './api.js'; void value;",
    'src/b.ts': "import './missing.js';",
    'src/c.ts': 'export const c = 3;',
  });
  const view = await acquire(root);
  const inputs = { view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  let interpreter: AccessInterpreter | undefined;
  const source = await createSourceAnalysis(inputs);
  try {
    const catalog = await source.catalog();
    const batch = await source.accesses();
    interpreter = await createAccessInterpreter(inputs);
    const all = await interpreter.interpret(view.inventory.files.map(file => file.path));
    expect({ accesses: all.accesses, coverage: all.coverage }).toEqual(batch);
    const paths = ['src/c.ts', 'src/b.ts', 'src/a.ts'];
    const subset = await interpreter.interpret(paths);
    expect(subset).toEqual({ accesses: all.accesses.filter(access => paths.includes(access.location.file)),
      coverage: all.coverage.filter(issue => paths.includes(issue.location.file)),
      candidates: all.candidates.filter(item => paths.includes(item.file)) });
    expect(subset.candidates.find(item => item.file === 'src/a.ts')?.paths).toContain('src/api.ts');
    expect(subset.candidates.find(item => item.file === 'src/b.ts')?.paths).toContain('src/missing.ts');
    expect(subset.candidates.find(item => item.file === 'src/c.ts')?.paths).toEqual([]);
    expect(await interpreter.interpret([])).toEqual({ accesses: [], coverage: [], candidates: [] });
    const original = catalog.originals.find(item => item.id.binding === 'value')!;
    const description = { file: 'src/api.ts', exports: catalog.files.find(file => file.file === 'src/api.ts')!,
      originals: [{ ...original, hasValue: false, hasType: true }], coverage: [], dependencies: noDependencies };
    interpreter.replaceDescriptions([description], []);
    expect((await interpreter.interpret(['src/a.ts'])).accesses[0].selections[0].request).toBe('type-only');
    interpreter.replaceDescriptions([], ['src/api.ts']);
    expect((await interpreter.interpret(['src/a.ts'])).accesses[0].selections[0].status).toBe('unresolved');
    interpreter.replaceDescriptions([{ ...description, originals: [original] }], []);
    expect(await interpreter.interpret(paths)).toEqual(subset);
    expect(Object.isFrozen(subset.accesses[0])).toBe(true);
    await interpreter.dispose();
    await interpreter.dispose();
    await expect(interpreter.interpret(paths)).rejects.toMatchObject({ code: 'disposed' });
    expect(() => interpreter!.replaceDescriptions([], [])).toThrow('disposed');
    expect(await view.readFile('src/api.ts')).toBe('export const value = 1;');
  } finally { await interpreter?.dispose(); await source.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
}, 60_000);

it('constructs setup once and does not traverse project arrays in twenty one-file calls', async () => {
  const root = await fixture({ 'src/a.ts': 'export {};' });
  const view = await acquire(root);
  try {
    const inputs = { inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
    const catalog = { files: [], originals: [], coverage: [] };
    // A missing compiler source is an independent coverage witness. Throwing
    // iteration traps detect any whole-inventory work after construction.
    const project = { program: { getSourceFile: () => undefined } } as unknown as Project;
    const interpreter = new AccessInterpretation(project, inputs, { resourceWitness: '', readFile: () => null, fileExists: () => false, realpath: path => path, directoryExists: () => false }, catalog, new Map());
    const trap = () => { throw new Error('repeated setup traversal'); };
    Object.defineProperty(inputs.inventory.files, Symbol.iterator, { value: trap });
    Object.defineProperty(inputs.inventory.files, 'map', { value: trap });
    Object.defineProperty(catalog.files, Symbol.iterator, { value: trap });
    Object.defineProperty(catalog.files, 'map', { value: trap });
    Object.defineProperty(catalog.originals, Symbol.iterator, { value: trap });
    Object.defineProperty(catalog.originals, 'map', { value: trap });
    for (let index = 0; index < 20; index++) {
      const result = interpreter.interpret(['src/a.ts']);
      expect(result.coverage.map(issue => [issue.code, issue.location.file])).toEqual([['compiler-blocked', 'src/a.ts']]);
    }
    interpreter.dispose();
    expect(() => interpreter.interpret(['src/a.ts'])).toThrow('disposed');
  } finally { await view.dispose(); await rm(root, { recursive: true, force: true }); }
});

it('cancels the finite lifetime and rejects unknown subset paths', async () => {
  const root = await fixture({ 'src/a.ts': 'export {};' });
  const view = await acquire(root);
  const inputs = { view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  let interpreter: AccessInterpreter | undefined;
  try {
    await expect(createAccessInterpreter({ ...inputs, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'cancelled' });
    interpreter = await createAccessInterpreter(inputs);
    await expect(interpreter.interpret(['outside.ts'])).rejects.toMatchObject({ code: 'unavailable' });
    await interpreter.dispose();
    interpreter = await createAccessInterpreter(inputs);
    await expect(interpreter.interpret(['src/a.ts'], AbortSignal.abort())).rejects.toMatchObject({ code: 'cancelled' });
    expect(await view.readFile('src/a.ts')).toBe('export {};');
  } finally { await interpreter?.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
}, 60_000);

it('preserves erased namespace members when descriptions cross the detached replacement seam', async () => {
  const root = await fixture({
    'src/api.ts': 'export class Value {}',
    'src/relay.ts': "export type { Value } from './api.js';",
    'src/use.ts': "export * from './relay.js'; type Namespace = typeof import('./relay.js');",
  });
  const view = await acquire(root);
  const inputs = { view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  const source = await createSourceAnalysis(inputs);
  let interpreter: AccessInterpreter | undefined;
  try {
    const catalog = await source.catalog();
    interpreter = await createAccessInterpreter(inputs);
    const before = await interpreter.interpret(['src/use.ts']);
    interpreter.replaceDescriptions(catalog.files.map(file => ({ file: file.file, exports: file,
      originals: catalog.originals.filter(original => original.origin.file === file.file),
      coverage: catalog.coverage.filter(issue => issue.location.file === file.file),
      dependencies: noDependencies })), []);
    expect(await interpreter.interpret(['src/use.ts'])).toEqual(before);
  } finally { await interpreter?.dispose(); await source.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
}, 60_000);

it('does not materialize the full captured-input list while returning subset results', async () => {
  const root = await fixture({ 'src/api.ts': 'export const value = 1;',
    'src/use.ts': "import { value } from './api.js'; void value;" });
  const view = await acquire(root);
  let reads = 0;
  const observed = { ...view, get inputs() { reads++; return view.inputs; } };
  let interpreter: AccessInterpreter | undefined;
  try {
    interpreter = await createAccessInterpreter({ view: observed, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits });
    const setupReads = reads;
    for (let index = 0; index < 20; index++) {
      const result = await interpreter.interpret(['src/use.ts']);
      expect(result.accesses[0].selections[0].exportedName).toBe('value');
    }
    expect(reads).toBe(setupReads);
  } finally { await interpreter?.dispose(); await view.dispose(); await rm(root, { recursive: true, force: true }); }
}, 60_000);
