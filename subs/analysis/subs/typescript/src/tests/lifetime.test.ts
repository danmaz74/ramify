import { createHook } from 'node:async_hooks';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { createSourceAnalysis } from '../source-analysis.js';
import type { SourceAnalysis, SourceAnalysisInputs } from '../interfaces/source.js';
import type { ProjectInputView } from '../../../project/src/interfaces/project.js';
import { acquire, areasFor, exported, fixture, sourceLimits } from './fixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function withInputs(check: (inputs: SourceAnalysisInputs, root: string) => Promise<void>,
  files: Readonly<Record<string, string>> = { 'src/value.ts': 'export const value = 1;' }): Promise<void> {
  const root = await fixture(files);
  let view: ProjectInputView | undefined;
  try {
    view = await acquire(root);
    await check({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits }, root);
  } finally { await view?.dispose(); await rm(root, { force: true, recursive: true }); }
}

function replaceView(inputs: SourceAnalysisInputs, overrides: Partial<ProjectInputView>): SourceAnalysisInputs {
  return { ...inputs, view: { ...inputs.view, ...overrides, get inputs() { return inputs.view.inputs; } } };
}

describe('supervised source lifetime', () => {
  it('rejects a pre-aborted lifetime before any input read or process startup', async () => {
    await withInputs(async inputs => {
      const controller = new AbortController(); controller.abort();
      let reads = 0, processes = 0;
      const hook = createHook({ init(_id, type) { if (type === 'PROCESSWRAP') processes++; } });
      hook.enable();
      try {
        await expect(createSourceAnalysis({ ...replaceView(inputs, {
          async readFile() { reads++; throw new Error('No read is permitted'); },
        }), signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
        expect(reads).toBe(0); expect(processes).toBe(0);
      } finally { hook.disable(); }
    });
  });

  it('cancels a still-opening compiler while its parent-served read remains unresolved', async () => {
    await withInputs(async (inputs, root) => {
      const controller = new AbortController();
      const entered = deferred<void>(), read = deferred<string | undefined>();
      let successes = 0;
      const opening = createSourceAnalysis({ ...replaceView(inputs, {
        async readFile(path) {
          if (path === join(root, 'src/value.ts')) { entered.resolve(); return read.promise; }
          return inputs.view.readFile(path);
        },
      }), signal: controller.signal });
      const outcome = opening.then(source => { successes++; return source.dispose(); }, error => error);
      await entered.promise;
      let responsive = false;
      await new Promise<void>(done => setTimeout(() => { responsive = true; done(); }, 0));
      const start = performance.now(); controller.abort();
      expect(await outcome).toMatchObject({ code: 'cancelled' });
      expect(performance.now() - start).toBeLessThan(5000);
      expect(responsive).toBe(true);
      read.resolve('export const late = 2;');
      await new Promise<void>(done => setTimeout(done, 20));
      expect(successes).toBe(0);
    });
  }, 15_000);

  it('turns an influencing read failure into an explicit failed startup and releases the helper', async () => {
    await withInputs(async inputs => {
      let reads = 0;
      const start = performance.now();
      await expect(createSourceAnalysis(replaceView(inputs, {
        async readFile() { reads++; throw new Error('Deliberately unreadable captured input'); },
      }))).rejects.toMatchObject({ code: 'read-failure', message: 'Deliberately unreadable captured input' });
      expect(reads).toBe(1);
      expect(performance.now() - start).toBeLessThan(5000);
      // The independent next session proves failed startup leaves no reusable
      // terminal/compiler cache in the entry module.
      const source = await createSourceAnalysis(inputs);
      try { expect(exported(await source.catalog(), 'src/value.ts', 'value').original).not.toBeNull(); }
      finally { await source.dispose(); }
    });
  }, 15_000);

  for (const signalKind of ['operation', 'lifetime', 'dispose'] as const) {
    it(`terminates a pending catalog on ${signalKind} without waiting for its filesystem callback`, async () => {
      await withInputs(async (inputs, root) => {
        const lifetime = new AbortController(), operation = new AbortController();
        const entered = deferred<void>(), exists = deferred<boolean>();
        let block = false;
        const source = await createSourceAnalysis({ ...replaceView(inputs, {
          async fileExists(path) {
            if (block && path === join(root, 'src/style.css')) { entered.resolve(); return exists.promise; }
            return inputs.view.fileExists(path);
          },
        }), signal: lifetime.signal });
        try {
          block = true;
          let successes = 0;
          const checking = source.catalog(operation.signal).then(value => { successes++; return value; }, error => error);
          await entered.promise;
          await expect(source.catalog()).rejects.toMatchObject({ code: 'concurrent-operation' });
          const start = performance.now();
          if (signalKind === 'operation') operation.abort();
          else if (signalKind === 'lifetime') lifetime.abort();
          else await source.dispose();
          expect(await checking).toMatchObject({ code: signalKind === 'dispose' ? 'disposed' : 'cancelled' });
          await source.dispose();
          expect(performance.now() - start).toBeLessThan(5000);
          exists.resolve(true);
          await new Promise<void>(done => setTimeout(done, 20));
          expect(successes).toBe(0);
          await expect(source.catalog()).rejects.toHaveProperty('code');
        } finally { exists.resolve(false); await source.dispose(); }
      }, {
        'src/value.ts': 'export const value = 1;',
        'src/style.css': '.value {}',
        'src/style.d.ts': 'declare module "*.css" { const styles: Record<string,string>; export default styles; }',
      });
    }, 15_000);
  }

  it('enforces a startup deadline while a captured read is still pending', async () => {
    await withInputs(async inputs => {
      const read = deferred<string | undefined>();
      const start = performance.now();
      await expect(createSourceAnalysis({ ...replaceView(inputs, {
        readFile: () => read.promise,
      }), limits: { ...inputs.limits, deadlineMs: 300 } })).rejects.toMatchObject({ code: 'resource-limit' });
      expect(performance.now() - start).toBeLessThan(5000);
      read.resolve(undefined);
    });
  }, 10_000);

  it('reports solution-style configuration as unavailable before forcing owned roots', async () => {
    await withInputs(async inputs => {
      const sourceView = replaceView(inputs, {
        async readFile(path) {
          if (path === inputs.inventory.scope.configuration) return '{"files":[],"references":[{"path":"./unavailable"}]}';
          return inputs.view.readFile(path);
        },
      });
      await expect(createSourceAnalysis(sourceView)).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('Solution-style') });
    });
  }, 10_000);

  it('chunks a compiler source larger than one protocol frame without changing its exports', async () => {
    await withInputs(async inputs => {
      const source = await createSourceAnalysis(inputs);
      try {
        expect(exported(await source.catalog(), 'src/large.ts', 'large').original).not.toBeNull();
        expect((await inputs.view.seal()).status).toBe('coherent');
      } finally { await source.dispose(); }
    }, { 'src/large.ts': `/*${'x'.repeat(2 * 1024 * 1024)}*/\nexport const large = 1;` });
  }, 15_000);

  it('rejects an oversized captured read before transferring it to the helper', async () => {
    await withInputs(async (inputs, root) => {
      await expect(createSourceAnalysis(replaceView(inputs, {
        async readFile(path) {
          if (path === join(root, 'src/value.ts')) return 'x'.repeat(8 * 1024 * 1024 + 1);
          return inputs.view.readFile(path);
        },
      }))).rejects.toMatchObject({ code: 'resource-limit' });
    });
  }, 10_000);

  it('does not recompute every captured content identity for each compiler filesystem callback', async () => {
    const files = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`src/value${index}.ts`, `export const value${index} = ${index};`]));
    await withInputs(async inputs => {
      let reads = 0, identityReads = 0;
      const view: ProjectInputView = { ...inputs.view,
        get inputs() { identityReads++; return inputs.view.inputs; },
        async readFile(path) { reads++; return inputs.view.readFile(path); },
      };
      const source = await createSourceAnalysis({ ...inputs, view });
      try { expect((await source.catalog()).files).toHaveLength(40); }
      finally { await source.dispose(); }
      expect(reads).toBeGreaterThan(40);
      expect(identityReads).toBeLessThanOrEqual(4);
    }, files);
  }, 10_000);

  it('keeps the view caller-owned after idempotent compiler disposal', async () => {
    await withInputs(async inputs => {
      const source: SourceAnalysis = await createSourceAnalysis(inputs);
      const catalog = await source.catalog();
      await Promise.all([source.dispose(), source.dispose()]);
      expect((await inputs.view.seal()).status).toBe('coherent');
      expect(await inputs.view.readFile('src/value.ts')).toContain('value');
      expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
      await expect(source.catalog()).rejects.toMatchObject({ code: 'disposed' });
    });
  }, 10_000);
});
