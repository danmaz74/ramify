import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { createDescriptionSet } from '../../subs/analysis/subs/typescript/src/descriptions.js';
import type { DescriptionSet, DescriptionUpdate } from '../../subs/analysis/subs/typescript/src/descriptions.js';
import type { CatalogExport, FileDescription } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { withSourceInputs } from './plan5-engine-fixture.js';

export interface DescriptionStates {
  /** The retained records every incremental call reads and replaces. */
  readonly set: DescriptionSet;
  /** Describe the current disk state over the retained records. */
  describe(files?: readonly string[]): Promise<DescriptionUpdate>;
  /** Describe the current disk state from nothing, as the comparison. */
  whole(): Promise<readonly FileDescription[]>;
  /** Both over one snapshot of the current state, the incremental call first. */
  both(files?: readonly string[]): Promise<{ readonly update: DescriptionUpdate; readonly whole: readonly FileDescription[] }>;
}

/** Describe successive disk states of one project through the real owner
 * implementation. Each state opens its own compiler snapshot; only the plain
 * descriptions carry over, as they will across the session's own updates. */
export async function withDescriptions<T>(root: string, operation: (states: DescriptionStates) => Promise<T>): Promise<T> {
  const set = createDescriptionSet();
  const host = { resourceWitness: '', fileExists: existsSync,
    realpath: (path: string) => existsSync(path) ? realpathSync(path) : path,
    directoryExists: (path: string) => existsSync(path) && statSync(path).isDirectory(), readFile: (path: string) => {
    try { return readFileSync(path, 'utf8'); }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; throw error; }
  } };
  type Describe = (target: DescriptionSet, files?: readonly string[]) => DescriptionUpdate;
  const state = <R>(run: (describe: Describe) => R): Promise<R> => withSourceInputs(root, async inputs => {
    const configuration = resolve(root, inputs.inventory.scope.configuration);
    const api = new API({ cwd: root });
    let snapshot: ReturnType<API['updateSnapshot']> | undefined;
    try {
      snapshot = api.updateSnapshot({ openProjects: [configuration] });
      const project = snapshot.getProject(configuration);
      assert.ok(project, 'the compiler created the described project');
      return run((target, files) => target.describe(project, inputs, host, new Map<CatalogExport, boolean>(),
        files ?? inputs.inventory.files.map(file => file.path)));
    } finally { snapshot?.dispose(); api.close(); }
  });
  return operation({
    set,
    describe: files => state(describe => describe(set, files)),
    whole: () => state(describe => describe(createDescriptionSet()).descriptions),
    both: files => state(describe => ({ update: describe(set, files), whole: describe(createDescriptionSet()).descriptions })),
  });
}

export function described(descriptions: readonly FileDescription[], path: string): FileDescription {
  const found = descriptions.find(description => description.file === path);
  assert.ok(found, `No description of ${path}`);
  return found;
}

/** The files whose description differs by value between two whole passes. */
export function changedByValue(before: readonly FileDescription[], after: readonly FileDescription[]): readonly string[] {
  const previous = new Map(before.map(description => [description.file, JSON.stringify(description)]));
  return after.filter(description => previous.get(description.file) !== JSON.stringify(description))
    .map(description => description.file).sort();
}
