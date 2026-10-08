import type { AffectedDocument } from 'ramify.ts/cli';
import { expect } from 'vitest';
import { RamifyCli } from '../../../subs/evidence/src/ramify-cli.js';

/** Literal provider facts for the guard matrix, independent of fixture files. */
const modules = [
  { id: 'shop', parent: null, directory: '.' },
  { id: 'shop/orders', parent: 'shop', directory: 'subs/orders' },
  { id: 'shop/orders/pricing', parent: 'shop/orders', directory: 'subs/orders/subs/pricing' },
  { id: 'shop/billing', parent: 'shop', directory: 'subs/billing' },
  { id: 'shop/contracts', parent: 'shop', directory: 'subs/contracts' },
];
const owners: Readonly<Record<string, string | null>> = {
  '.': 'shop', 'package.json': 'shop', 'ramify-audit.json': 'shop', '../elsewhere/secrets.txt': null,
  'subs/orders/src/orders.ts': 'shop/orders', 'subs/orders/src/notes-store.ts': 'shop/orders',
  'subs/orders/src/notes/store.ts': 'shop/orders', 'subs/orders/src/tests/notes.test.ts': 'shop/orders',
  'subs/orders/module.ramify': 'shop/orders', 'subs/orders/src/escape/secrets.txt': 'shop/orders',
  'subs/orders/src/tests/steps/add-note.steps.ts': 'shop/orders',
  'subs/orders/src/tests/features/notes/add-note.feature': 'shop/orders',
  'subs/orders/subs/pricing': 'shop/orders/pricing',
  'subs/orders/subs/pricing/src/price.ts': 'shop/orders/pricing',
  'subs/orders/subs/pricing/module.ramify': 'shop/orders/pricing',
  'subs/orders/subs/notes': 'shop/orders', 'subs/orders/subs/notes/module.ramify': 'shop/orders',
  'subs/orders/subs/notes/README.md': 'shop/orders', 'subs/orders/subs/notes/src/notes.ts': 'shop/orders',
  'subs/orders/subs/notes/src/tests/notes.test.ts': 'shop/orders',
  'subs/orders/subs/other/module.ramify': 'shop/orders',
  'subs/billing/src/billing.ts': 'shop/billing', 'subs/contracts/src/interfaces/notes.ts': 'shop/contracts',
};
const signature = (paths: readonly string[]) => JSON.stringify([...paths].sort());

/** Exact required queries, unordered so independent reads need no incidental sequencing. */
export function writeGuardOwnership(root: string, required: readonly (readonly string[])[]) {
  const pending = required.map(signature), failures: string[] = [];
  const calls: string[][] = [];
  class ScriptedOwnership extends RamifyCli {
    override async queryOwnership(projectRoot: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
      try {
        expect(projectRoot, 'ownership root').toBe(root);
        const next = signature(paths), index = pending.indexOf(next);
        expect(index, `unstated or exhausted ownership query ${next}`).toBeGreaterThanOrEqual(0);
        const seeds = paths.map(path => {
          expect(Object.hasOwn(owners, path), `unstated ownership path ${path}`).toBe(true);
          const module = owners[path]!;
          return { path, status: module === null ? 'outside-project' : 'owned', module,
            basis: module === null ? 'none' : 'containment', exclusion: null, kind: module === null ? null : 'inert', selects: [] };
        });
        pending.splice(index, 1); calls.push([...paths]);
        return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-guard-only',
          revision: { sequence: null, inputId: 'scripted-write-guard' },
          selection: { schemaVersion: 'ramify.affected/4', inputId: 'scripted-write-guard', paths: seeds,
            scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules, exclusions: [] } },
            changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as AffectedDocument;
      } catch (error) { failures.push(String(error)); throw error; }
    }
  }
  return { ramify: new ScriptedOwnership(), calls,
    assertComplete() {
      expect(failures, 'caught ownership script violations').toEqual([]);
      expect(pending, 'unused required ownership answers').toEqual([]);
    },
  };
}
