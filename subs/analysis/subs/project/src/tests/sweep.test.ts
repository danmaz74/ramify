import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { observeProject } from '../observer.js';
import { readProject } from '../read-project.js';
import type { CapturedInput, ProjectInventory, ProjectObserver } from '../interfaces/project.js';
import { declaration, fixture, limits, put } from './fixtures.js';

const registry = 'registry/1:test';
let work: string, root: string;
const observers: ProjectObserver[] = [];
beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), 'ramify-sweep-')));
  root = join(work, 'project');
  await fixture(root);
  await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
  await put(root, 'subs/child/README.md', '# Child\n\nChild purpose.\n');
  await put(root, 'subs/child/src/child.ts', 'export const child = 1;\n');
  // Excluded from Plan 1's walk, so only a source stage's report observes it.
  await put(root, 'node_modules/pkg/index.d.ts', 'export declare const pkg: number;\n');
});
afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.dispose();
  await rm(work, { recursive: true, force: true });
});

const request = () => ({ cwd: root, root, configuration: 'discover' as const, scope: 'whole-project' as const });
async function observe(): Promise<ProjectObserver> {
  const result = await observeProject({ request: request(), parse: declaration, limits, registry });
  if (result.status !== 'observing') throw new Error(`Expected an observing project: ${JSON.stringify(result)}`);
  observers.push(result.observer);
  return result.observer;
}

/**
 * The batch input identity, transcribed here from the recipe a report carries,
 * so the observer's own identity is compared with an independent computation.
 */
function batchIdentity(inventory: ProjectInventory, inputs: readonly CapturedInput[]): string {
  const order = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
  const captured = [...inputs].sort((a, b) => order(a.path, b.path) || order(a.role, b.role));
  return `input/1:${createHash('sha256').update(JSON.stringify({
    scope: inventory.scope, registry, integration: 'typescript/7.0.2/captured-source/1',
    recipe: 'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1',
    roots: inventory.files.filter(file => file.kind === 'source').map(file => file.path).sort(order),
    inputs: captured,
  })).digest('hex')}`;
}
/** One acquisition-only batch capture of the same disk state. */
async function batch(): Promise<string> {
  const acquired = await readProject({ request: request(), parse: declaration, limits, registry });
  if (acquired.status !== 'acquired') throw new Error(`Expected an acquired project: ${JSON.stringify(acquired)}`);
  try { return batchIdentity(acquired.view.inventory, acquired.view.inputs); }
  finally { await acquired.view.dispose(); }
}

describe('project observation sweep', () => {
  it('reports nothing while every observed path keeps its recorded state', async () => {
    const observer = await observe();
    expect(await observer.reobserve()).toEqual([]);
  });

  it('detects an unwatched owned edit, creation and removal exactly once', async () => {
    const observer = await observe();
    await put(root, 'subs/child/src/child.ts', 'export const child = 2;\n');
    expect(await observer.reobserve()).toEqual([{ path: join(root, 'subs/child/src/child.ts'), kind: 'changed' }]);
    // The sweep only observes; the recorded state moves when the change is applied.
    expect(await observer.reobserve()).toEqual([{ path: join(root, 'subs/child/src/child.ts'), kind: 'changed' }]);
    expect((await observer.apply([{ path: 'subs/child/src/child.ts', kind: 'changed' }])).kind).toBe('local');
    expect(await observer.reobserve()).toEqual([]);

    await unlink(join(root, 'subs/child/src/child.ts'));
    expect(await observer.reobserve()).toEqual([
      { path: join(root, 'subs/child/src'), kind: 'changed' },
      { path: join(root, 'subs/child/src/child.ts'), kind: 'deleted' },
    ]);
  });

  it('detects a change to a dependency only a source stage reported', async () => {
    const observer = await observe();
    const path = join(root, 'node_modules/pkg/index.d.ts');
    expect(observer.inputs.some(input => input.path === 'node_modules/pkg/index.d.ts')).toBe(false);
    const bytes = await readFile(path);
    observer.sink.file(path, createHash('sha256').update(bytes).digest('hex'), bytes.length, 'dependency');
    expect(observer.inputs.some(input => input.path === 'node_modules/pkg/index.d.ts' && input.role === 'dependency')).toBe(true);
    expect(await observer.reobserve()).toEqual([]);

    await put(root, 'node_modules/pkg/index.d.ts', 'export declare const pkg: string;\n');
    expect(await observer.reobserve()).toEqual([{ path, kind: 'changed' }]);
    expect((await observer.apply([{ path, kind: 'changed' }])).kind).toBe('local');
    expect(await observer.reobserve()).toEqual([]);
  });

  it('reports a reported identity the disk no longer holds', async () => {
    const observer = await observe();
    const path = join(root, 'node_modules/pkg/index.d.ts');
    observer.sink.file(path, createHash('sha256').update('superseded').digest('hex'), 10, 'dependency');
    expect(await observer.reobserve()).toEqual([{ path, kind: 'changed' }]);
    expect(observer.inputs.some(input => input.path === 'node_modules/pkg/index.d.ts' && input.role === 'dependency')).toBe(true);
    expect(await observer.reobserve()).toEqual([]);
  });

  it('carries the identity a batch capture of the same inputs carries', async () => {
    const observer = await observe();
    const identities = [observer.inputId];
    expect(observer.inputId).toBe(await batch());

    await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child tagged [ui]\n');
    expect((await observer.apply([{ path: 'subs/child/module.ramify', kind: 'changed' }])).kind).toBe('local');
    identities.push(observer.inputId);
    expect(observer.inputId).toBe(await batch());

    await put(root, 'subs/child/README.md', '# Child\n\nChild purpose, restated.\n');
    expect((await observer.apply([{ path: 'subs/child/README.md', kind: 'changed' }])).kind).toBe('local');
    identities.push(observer.inputId);
    expect(observer.inputId).toBe(await batch());

    await put(root, 'subs/child/src/extra.ts', 'export const extra = 2;\n');
    expect((await observer.apply([{ path: 'subs/child/src/extra.ts', kind: 'created' }])).kind).toBe('local');
    identities.push(observer.inputId);
    expect(observer.inputId).toBe(await batch());

    expect(new Set(identities).size).toBe(4);
  });

  it('carries a batch identity after a structural rebuild', async () => {
    const observer = await observe();
    await put(root, 'subs/child/subs/grandchild/module.ramify', 'ramify 1\nmodule grandchild\n');
    await put(root, 'subs/child/subs/grandchild/README.md', '# Grandchild\n\nGrandchild purpose.\n');
    await put(root, 'subs/child/subs/grandchild/src/deep.ts', 'export const deep = 3;\n');
    expect((await observer.apply([{ path: 'subs/child/subs/grandchild/module.ramify', kind: 'created' }])).kind).toBe('structural');
    expect(observer.inputId).toBe(await batch());
  });
});
