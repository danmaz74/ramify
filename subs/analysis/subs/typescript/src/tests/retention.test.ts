import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createRetainedSourceAnalysis, retainedCompilerEvidence } from '../retained-source-analysis.js';
import { acquire, areasFor, code, exported, fixture, original, sourceLimits, withCatalog } from './fixtures.js';

function assertFrozenPlainData(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value !== 'object') {
    expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
    return;
  }
  expect(ancestors.has(value), 'Catalog must not retain compiler cycles').toBe(false);
  expect(Object.isFrozen(value), 'Every report object and array is immutable').toBe(true);
  expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
  const next = new Set(ancestors).add(value);
  for (const key of Reflect.ownKeys(value)) {
    expect(typeof key).toBe('string');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    expect(descriptor.get).toBeUndefined();
    expect(descriptor.set).toBeUndefined();
    if (Array.isArray(value) && key === 'length') continue;
    assertFrozenPlainData(descriptor.value, next);
  }
}

it('retains only frozen plain catalog data after releasing the compiler and captured view', async () => {
  await withCatalog({
    'src/value.ts': 'export interface Shape { value: number } export const value = 1;',
    'src/forward.ts': 'export { value as alias } from "./value.js";',
  }, async ({ catalog, source, view }) => {
    assertFrozenPlainData(catalog);
    const serialized = JSON.stringify(catalog);
    expect(JSON.parse(serialized)).toEqual(catalog);
    await source.dispose();
    await view.dispose();
    await source.dispose();
    await expect(source.catalog()).rejects.toThrow();
    expect(JSON.stringify(catalog)).toBe(serialized);
    expect(exported(catalog, 'src/forward.ts', 'alias').original).toEqual(code('value.ts', 'value'));
    expect(original(catalog, code('value.ts', 'Shape'))).toMatchObject({ hasType: true, hasValue: false });
    expect(Reflect.set(catalog.files, '0', null)).toBe(false);
    assertFrozenPlainData(catalog);
  });
}, 30_000);

it('retains only frozen plain facts after releasing the retained adapter, with no server or snapshot left', async () => {
  const root = await fixture({
    'src/value.ts': 'export interface Shape { value: number } export const value = 1;',
    'src/forward.ts': 'export { value as alias } from "./value.js";',
  });
  try {
    const view = await acquire(root);
    const sink = { file() {}, directory() {}, absent() {}, probe() {} };
    const analysis = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'),
      inventory: view.inventory, areas: areasFor(view), limits: sourceLimits, sink });
    const pid = retainedCompilerEvidence(analysis).serverPid;
    expect(pid).toBeDefined();
    const { descriptions } = await analysis.describe([]);
    const catalog = analysis.catalog();
    const accesses = await analysis.interpreter().interpret(['src/forward.ts']);
    assertFrozenPlainData(descriptions);
    assertFrozenPlainData(catalog);
    assertFrozenPlainData(accesses);
    const serialized = JSON.stringify(catalog);
    await analysis.dispose();
    await analysis.dispose();
    const evidence = retainedCompilerEvidence(analysis);
    expect([evidence.hot, evidence.liveSnapshots, evidence.serverPid]).toEqual([false, 0, undefined]);
    let alive = true;
    for (let attempt = 0; attempt < 200 && alive; attempt++) {
      try { process.kill(pid!, 0); await new Promise<void>(done => setTimeout(done, 25)); }
      catch (error) { alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
    }
    expect(alive, 'the compiler server process is gone').toBe(false);
    expect(() => analysis.catalog()).toThrow();
    expect(JSON.stringify(catalog)).toBe(serialized);
    expect(exported(catalog, 'src/forward.ts', 'alias').original).toEqual(code('value.ts', 'value'));
    assertFrozenPlainData(catalog);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
