import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry, deriveSourceAreas } from '../../subs/analysis/subs/model/src/index.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { SourceAnalysisInputs } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { AccessInterpretation } from '../../subs/analysis/subs/typescript/src/accesses.js';
import { buildCatalog } from '../../subs/analysis/subs/typescript/src/catalog.js';
import type { CatalogExport } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { sessionInputs } from './session-expectations.js';

export async function withSourceInputs<T>(root: string, operation: (inputs: SourceAnalysisInputs) => Promise<T>): Promise<T> {
  const configured = sessionInputs(root);
  const acquired = await readProject({ request: configured.project, parse: parseDescription,
    limits: { ...configured.limits.acquisition, maxOwners: 1100, maxInputBytes: 512 * 1024 ** 2, deadlineMs: 120_000 } });
  assert.equal(acquired.status, 'acquired');
  if (acquired.status !== 'acquired') throw new Error(JSON.stringify(acquired));
  const view = acquired.view;
  try {
    const areas = view.inventory.modules.flatMap(module => {
      const result = deriveSourceAreas(createDefaultTagRegistry(), module.id, module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags);
      assert.equal(result.status, 'valid');
      if (result.status !== 'valid') throw new Error(JSON.stringify(result));
      return result.value;
    });
    return await operation({ view, inventory: view.inventory, areas, limits: { ...configured.limits.source, deadlineMs: 180_000 } });
  } finally { await view.dispose(); }
}

/** Instrument the real synchronous owner implementation within its compiler lifetime. */
export async function withNativeInterpreter<T>(root: string, operation: (context: {
  interpreter: AccessInterpretation; project: NonNullable<ReturnType<ReturnType<API['updateSnapshot']>['getProject']>>;
  inputs: SourceAnalysisInputs; traversals: Record<string, number>;
}) => Promise<T>): Promise<T> {
  return withSourceInputs(root, async inputs => {
    const configuration = resolve(root, inputs.inventory.scope.configuration);
    const api = new API({ cwd: root });
    let snapshot: ReturnType<API['updateSnapshot']> | undefined;
    let interpreter: AccessInterpretation | undefined;
    try {
      snapshot = api.updateSnapshot({ openProjects: [configuration] });
      const project = snapshot.getProject(configuration);
      assert.ok(project);
      const host = { resourceWitness: '', fileExists: existsSync, readFile: (path: string) => {
        try { return readFileSync(path, 'utf8'); }
        catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; throw error; }
      } };
      const runtime = new Map<CatalogExport, boolean>();
      const catalog = buildCatalog(project, inputs, host, runtime);
      const traversals: Record<string, number> = { catalog: 0, originals: 0, inventory: 0 };
      const counted = <V>(name: string, values: readonly V[]): readonly V[] => new Proxy([...values], {
        get(target, key, receiver) {
          if (key === 'map' || key === Symbol.iterator) traversals[name]++;
          return Reflect.get(target, key, receiver);
        },
      });
      const countedInputs = { ...inputs, inventory: { ...inputs.inventory, files: counted('inventory', inputs.inventory.files) } };
      interpreter = new AccessInterpretation(project, countedInputs, host,
        { ...catalog, files: counted('catalog', catalog.files), originals: counted('originals', catalog.originals) }, runtime);
      return await operation({ interpreter, project, inputs, traversals });
    } finally { interpreter?.dispose(); snapshot?.dispose(); api.close(); }
  });
}
