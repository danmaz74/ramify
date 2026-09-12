import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry, deriveSourceAreas } from '../../subs/analysis/subs/model/src/index.js';
import { observeProject } from '../../subs/analysis/subs/project/src/observer.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { AcquisitionLimits, CapturedInput, ObservationSink, ProjectInventory, ProjectObserver,
  ProjectReadOptions } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import { createRetainedSourceAnalysis, retainedCompilerEvidence } from '../../subs/analysis/subs/typescript/src/retained-source-analysis.js';
import { createSourceAnalysis } from '../../subs/analysis/subs/typescript/src/source-analysis.js';
import type { RetainedSourceAnalysis, SourceChangeSet, SourceWorkLimits } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import type { SourceArea } from '../../subs/analysis/subs/model/src/interfaces/model.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { referenceRoot } from './fixtures/plan2/reference.js';
import { runIsolatedProject } from './mutation.js';
import type { IsolatedProject } from './mutation.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { sessionInputs } from './session-expectations.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const acquisition: AcquisitionLimits = {
  attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
  maxInputBytes: 512 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1100, maxDepth: 128, deadlineMs: 120_000,
};
const registry = createDefaultTagRegistry().id;
const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const workRoot = join(repositoryRoot, '.reference-work');
const coreCatalog = 'subs/workspace/subs/catalog/subs/core/src/catalog.ts';
const extraFile = 'subs/workspace/subs/catalog/src/extra.ts';
const zodDeclaration = 'node_modules/zod/index.d.cts';
const none: SourceChangeSet = { changed: [], created: [], deleted: [], inventory: null, invalidateAll: false };

/**
 * The identity a batch report carries, transcribed from the recipe in
 * `run-analysis.ts`, so the merged observer identity has an independent oracle.
 */
function batchIdentity(inventory: ProjectInventory, inputs: readonly CapturedInput[]): string {
  const captured = [...inputs].sort((a, b) => order(a.path, b.path) || order(a.role, b.role));
  return `input/1:${sha256(JSON.stringify({
    scope: inventory.scope, registry, integration: 'typescript/7.0.2/captured-source/1',
    recipe: 'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1',
    roots: inventory.files.filter(file => file.kind === 'source').map(file => file.path).sort(order),
    inputs: captured,
  }))}`;
}
function options(root: string): ProjectReadOptions {
  return { request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse: parseDescription, limits: acquisition, registry };
}
function areasOf(inventory: ProjectInventory): readonly SourceArea[] {
  return inventory.modules.flatMap(module => {
    const result = deriveSourceAreas(createDefaultTagRegistry(), module.id, module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags);
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    return result.value;
  });
}
function sourceLimits(root: string): SourceWorkLimits {
  return { ...sessionInputs(root).limits.source, deadlineMs: 180_000 };
}
const silent: ObservationSink = { file() {}, directory() {}, absent() {}, probe() {} };

/** Reference dependencies, with the named packages copied so their bytes can be edited. */
async function prepareReference(root: string, copies: readonly string[] = []): Promise<void> {
  const source = join(referenceRoot, 'node_modules'), target = join(root, 'node_modules');
  if (!copies.length) { await symlink(source, target); return; }
  await mkdir(target);
  for (const entry of await readdir(source)) {
    if (copies.includes(entry)) await cp(join(source, entry), join(target, entry), { recursive: true, dereference: true });
    else await symlink(join(source, entry), join(target, entry));
  }
}

async function observe(root: string): Promise<ProjectObserver> {
  const result = await observeProject(options(root));
  if (result.status !== 'observing') throw new Error(`Observation failed: ${JSON.stringify(result)}`);
  return result.observer;
}
async function adapter(root: string, inventory: ProjectInventory, sink: ObservationSink): Promise<RetainedSourceAnalysis> {
  return createRetainedSourceAnalysis({ root, configuration: inventory.scope.configuration, inventory,
    areas: areasOf(inventory), limits: sourceLimits(root), sink });
}

interface Facts { readonly catalog: string; readonly accesses: string; readonly descriptions: string }
/** Describe the named files, then read every fact the adapter holds. */
async function facts(analysis: RetainedSourceAnalysis, files: readonly string[]): Promise<Facts> {
  const { descriptions } = await analysis.describe(files);
  const catalog = analysis.catalog();
  const accesses = await analysis.interpreter().interpret(catalog.files.map(file => file.file));
  return { catalog: JSON.stringify(catalog), accesses: JSON.stringify(accesses), descriptions: JSON.stringify(descriptions) };
}
/** A cold adapter over the disk as it is now, described in full, then disposed. */
async function fresh(root: string): Promise<Facts> {
  const acquired = await readProject(options(root));
  if (acquired.status !== 'acquired') throw new Error(`Batch acquisition failed: ${JSON.stringify(acquired)}`);
  const analysis = await adapter(root, acquired.view.inventory, silent);
  try { return await facts(analysis, acquired.view.inventory.files.map(file => file.path)); }
  finally { await analysis.dispose(); await acquired.view.dispose(); }
}
/** The finite helper over a batch capture: `buildCatalog`, `collectAccesses` and the sealed inputs. */
async function batch(root: string): Promise<{ catalog: string; accesses: string; inputs: readonly CapturedInput[]; identity: string }> {
  const acquired = await readProject(options(root));
  if (acquired.status !== 'acquired') throw new Error(`Batch acquisition failed: ${JSON.stringify(acquired)}`);
  const view = acquired.view;
  const analysis = await createSourceAnalysis({ view, inventory: view.inventory, areas: areasOf(view.inventory), limits: sourceLimits(root) });
  try {
    const catalog = JSON.stringify(await analysis.catalog());
    const accesses = JSON.stringify(await analysis.accesses());
    await analysis.dispose();
    const sealed = await view.seal();
    if (sealed.status !== 'coherent') throw new Error(`Batch capture changed: ${JSON.stringify(sealed)}`);
    return { catalog, accesses, inputs: sealed.inputs, identity: batchIdentity(view.inventory, sealed.inputs) };
  } finally { await analysis.dispose(); await view.dispose(); }
}
function alive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
async function gone(pid: number | undefined): Promise<boolean> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (!alive(pid)) return true;
    await new Promise<void>(done => setTimeout(done, 25));
  }
  return false;
}
async function bodyEdit(root: string, path: string, statement: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  const anchor = /(function\s+\w+\s*\([^)]*\)[^{]*\{)/;
  if (!anchor.test(text)) throw new Error(`No function body to edit in ${path}`);
  await writeFile(join(root, path), text.replace(anchor, `$1 ${statement}`));
}

const referenceBaseline = {
  kind: 'project' as const,
  fixture: { kind: 'copy' as const, sourceRoot: referenceRoot },
  baseline: async ({ root, assertions }: ProjectContext) => {
    const text = await readFile(join(root, coreCatalog), 'utf8');
    assertions.ok('the reference declares inspect in the core catalog', text.includes('export function inspect('));
  },
  mutate: async () => {},
};

const handlers = new Map<string, InstanceHandler>();

handlers.set('I5-04:single-live-snapshot', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    try {
      await analysis.describe([]);
      const original = await readFile(join(root, coreCatalog), 'utf8');
      const live: number[] = [], peaks: number[] = [], disposed: (boolean | null)[] = [], sequences: number[] = [];
      for (let edit = 1; edit <= 20; edit++) {
        await writeFile(join(root, coreCatalog), original.replace('  const record = findRecord(recordId);', `  void ${edit};\n  const record = findRecord(recordId);`));
        const update = await observer.apply([{ path: coreCatalog, kind: 'changed' }]);
        assertions.equal(`edit ${edit} is a local update`, update.kind, 'local');
        const { snapshot } = await analysis.update({ ...none, changed: [coreCatalog] });
        const evidence = retainedCompilerEvidence(analysis);
        live.push(evidence.liveSnapshots); peaks.push(evidence.peakLiveSnapshots); disposed.push(evidence.previousDisposed); sequences.push(snapshot);
        await analysis.describe([coreCatalog]);
      }
      assertions.equal('exactly one snapshot is live after each of twenty updates', live, Array(20).fill(1));
      assertions.equal('at most two snapshots exist during each replacement', peaks, Array(20).fill(2));
      assertions.equal('the replaced snapshot is disposed inside every update', disposed, Array(20).fill(true));
      assertions.equal('snapshot sequences are monotonic', sequences, Array.from({ length: 20 }, (_, index) => index + 2));
      const compared = await fresh(root);
      const catalog = JSON.stringify(analysis.catalog());
      const accesses = JSON.stringify(await analysis.interpreter().interpret(analysis.catalog().files.map(file => file.file)));
      assertions.equal('after twenty edits the facts equal a fresh adapter', [catalog, accesses], [compared.catalog, compared.accesses]);
      recordObservation('plan5-single-live-snapshot', { edits: 20, live, peaks });
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

handlers.set('I5-04:changed-file-facts-equal', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    try {
      const cold = await analysis.describe([]);
      const before = cold.descriptions.find(description => description.file === coreCatalog)!;
      await bodyEdit(root, coreCatalog, 'void 0;');
      assertions.equal('the body edit is a local update', (await observer.apply([{ path: coreCatalog, kind: 'changed' }])).kind, 'local');
      await analysis.update({ ...none, changed: [coreCatalog] });
      const { descriptions, delta } = await analysis.describe([coreCatalog]);
      const retained = descriptions.find(description => description.file === coreCatalog)!;
      assertions.ok('the edited file is described afresh', delta.recomputed.includes(coreCatalog));
      const access = await analysis.interpreter().interpret([coreCatalog]);
      const compared = await fresh(root);
      const freshDescription = (JSON.parse(compared.descriptions) as { file: string }[]).find(description => description.file === coreCatalog);
      assertions.equal('the description equals a fresh adapter\'s, positions included', JSON.parse(JSON.stringify(retained)), freshDescription);
      assertions.ok('declarations after the inserted statement moved',
        JSON.stringify(before.originals.map(original => original.declarations)) !== JSON.stringify(retained.originals.map(original => original.declarations)));
      const freshAccess = (JSON.parse(compared.accesses) as { accesses: { importer: { file: string } }[]; coverage: unknown[] });
      assertions.equal('the access facts of the file equal a fresh adapter\'s',
        JSON.parse(JSON.stringify(access.accesses)), freshAccess.accesses.filter(item => item.importer.file === coreCatalog));
      assertions.equal('the whole catalog equals a fresh adapter\'s', JSON.stringify(analysis.catalog()), compared.catalog);
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

handlers.set('I5-04:created-deleted-configuration', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    const absolute = resolve(root, extraFile);
    try {
      await analysis.describe([]);
      assertions.ok('the cold configuration does not name the file', !retainedCompilerEvidence(analysis).syntheticConfiguration!.includes(absolute));
      await writeFile(absolute, "import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';\nexport const extra = recordIdSchema;\n", { flag: 'wx' });
      const created = await observer.apply([{ path: extraFile, kind: 'created' }]);
      assertions.equal('the creation is a local update naming the file', created.kind === 'local' ? created.created : created.kind, [extraFile]);
      if (created.kind !== 'local') throw new Error('Expected a local update');
      assertions.ok('the owned file list names the created file', created.inventory.files.some(file => file.path === extraFile));
      await analysis.update({ ...none, created: [extraFile], inventory: created.inventory });
      let evidence = retainedCompilerEvidence(analysis);
      assertions.ok('the regenerated configuration names the created file', evidence.syntheticConfiguration!.includes(absolute));
      assertions.equal('the program contains the created file', evidence.programHas(extraFile), true);
      const described = await analysis.describe([extraFile]);
      assertions.ok('the created file is described', described.delta.recomputed.includes(extraFile));
      let compared = await fresh(root);
      assertions.equal('the catalog with the file equals a fresh adapter\'s', JSON.stringify(analysis.catalog()), compared.catalog);

      await rm(absolute);
      const deleted = await observer.apply([{ path: extraFile, kind: 'deleted' }]);
      assertions.equal('the deletion is a local update naming the file', deleted.kind === 'local' ? deleted.deleted : deleted.kind, [extraFile]);
      if (deleted.kind !== 'local') throw new Error('Expected a local update');
      assertions.ok('the owned file list no longer names the file', !deleted.inventory.files.some(file => file.path === extraFile));
      await analysis.update({ ...none, deleted: [extraFile], inventory: deleted.inventory });
      evidence = retainedCompilerEvidence(analysis);
      assertions.ok('the regenerated configuration no longer names the file', !evidence.syntheticConfiguration!.includes(absolute));
      assertions.equal('the program no longer contains the file', evidence.programHas(extraFile), false);
      const after = await analysis.describe([extraFile]);
      assertions.ok('the deleted file\'s original is removed', after.delta.removedOriginals.some(id => id.file === 'extra.ts'));
      assertions.ok('the catalog no longer lists the file', !analysis.catalog().files.some(file => file.file === extraFile));
      compared = await fresh(root);
      assertions.equal('the catalog without the file equals a fresh adapter\'s', JSON.stringify(analysis.catalog()), compared.catalog);
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

handlers.set('I5-04:invalidate-all', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root, ['zod']),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    try {
      const cold = await facts(analysis, []);
      const declaration = join(root, zodDeclaration);
      await writeFile(declaration, `${await readFile(declaration, 'utf8')}\nexport declare const ramifyInvalidateWitness: number;\n`);
      const update = await observer.apply([{ path: zodDeclaration, kind: 'changed' }]);
      assertions.equal('the dependency change is an observed local update', update.kind === 'local' ? update.changed : update.kind, [zodDeclaration]);
      await analysis.update({ ...none, changed: [zodDeclaration], invalidateAll: true });
      const { delta } = await analysis.describe([]);
      const owned = observer.inventory.files.map(file => file.path).sort(order);
      assertions.equal('every owned file is described afresh', delta.recomputed, owned);
      const catalog = JSON.stringify(analysis.catalog());
      const helper = await batch(root);
      assertions.equal('the catalog after invalidateAll equals buildCatalog over the same state', catalog, helper.catalog);
      assertions.ok('the invalidated facts were recomputed over the changed declaration', JSON.stringify(delta.recomputed) !== '[]' && cold.catalog.length > 0);
      recordObservation('plan5-invalidate-all', { recomputed: delta.recomputed.length, changed: delta.changed.length });
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

interface Difference { readonly missing: readonly string[]; readonly extra: readonly string[]; readonly changed: readonly string[] }
function difference(expected: readonly CapturedInput[], actual: readonly CapturedInput[]): Difference {
  const left = new Map(expected.map(input => [input.path, input])), right = new Map(actual.map(input => [input.path, input]));
  return {
    missing: expected.filter(input => !right.has(input.path)).map(input => input.path),
    extra: actual.filter(input => !left.has(input.path)).map(input => input.path),
    changed: expected.filter(input => right.has(input.path) && JSON.stringify(input) !== JSON.stringify(right.get(input.path)))
      .map(input => `${input.path}: ${input.role}/${input.sha256.slice(0, 12)}/${input.bytes} vs ${right.get(input.path)!.role}/${right.get(input.path)!.sha256.slice(0, 12)}/${right.get(input.path)!.bytes}`),
  };
}

/** Cold open and one body edit on one fixture, each state against its own batch capture. */
async function observedReads(root: string, assertions: Assertions, fixture: string, edited: string): Promise<void> {
  const observer = await observe(root);
  const callbacks = new Map<string, string>();
  const reads = new Map<string, string>();
  const recording: ObservationSink = {
    file: (path, sha, bytes, role) => { callbacks.set(path, role); reads.set(path, role); observer.sink.file(path, sha, bytes, role); },
    directory: (path, entries) => { callbacks.set(path, 'directory'); observer.sink.directory(path, entries); },
    absent: path => { callbacks.set(path, 'absent'); observer.sink.absent(path); },
    probe: (path, operation) => { callbacks.set(path, `probe:${operation}`); observer.sink.probe(path, operation); },
  };
  const analysis = await adapter(root, observer.inventory, recording);
  try {
    const owned = observer.inventory.files.map(file => file.path);
    const cold = await facts(analysis, owned);
    await observer.apply([]);
    const expected = await batch(root);
    const merged = difference(expected.inputs, observer.inputs);
    assertions.equal(`${fixture}: cold merged observations equal the batch capture by path, role and identity`, merged, { missing: [], extra: [], changed: [] });
    assertions.equal(`${fixture}: cold observed input identity equals the batch identity`, observer.inputId, expected.identity);
    assertions.equal(`${fixture}: cold catalog and accesses equal the finite helper`, [cold.catalog, JSON.parse(cold.accesses).accesses],
      [expected.catalog, JSON.parse(expected.accesses).accesses]);
    const acquisitionOnly = expected.inputs.filter(input => ['description', 'readme'].includes(input.role));
    assertions.ok(`${fixture}: the batch capture has description and README inputs`, acquisitionOnly.length > 0);
    // Directory enumeration probes the existence of every member, so the
    // compiler sees those names; it never reads their bytes or roles.
    assertions.equal(`${fixture}: compiler callbacks alone read none of them`,
      acquisitionOnly.filter(input => reads.has(resolve(root, input.path))).map(input => input.path), []);
    assertions.ok(`${fixture}: the merged set reads more inputs than the compiler's callbacks alone`,
      expected.inputs.filter(input => input.bytes > 0).length > reads.size);
    assertions.ok(`${fixture}: owned roles come from the acquisition and the callback reports agree`,
      observer.inputs.filter(input => owned.includes(input.path)).every(input => ['source', 'resource'].includes(input.role))
      && new Set([...reads.values()]).has('source'));

    await bodyEdit(root, edited, 'void 0;');
    const update = await observer.apply([{ path: edited, kind: 'changed' }]);
    assertions.equal(`${fixture}: the body edit is a local update`, update.kind, 'local');
    await analysis.update({ ...none, changed: [edited] });
    await analysis.describe([edited]);
    await analysis.interpreter().interpret([edited]);
    await observer.apply([]);
    const after = await batch(root);
    assertions.equal(`${fixture}: merged observations after one update equal a batch capture of the edited state`,
      difference(after.inputs, observer.inputs), { missing: [], extra: [], changed: [] });
    assertions.equal(`${fixture}: the input identity after the update equals the batch identity`, observer.inputId, after.identity);
    assertions.ok(`${fixture}: the two states carry different identities`, expected.identity !== after.identity);
    recordObservation('plan5-observed-reads', { fixture, batchInputs: expected.inputs.length, merged: observer.inputs.length, callbacks: callbacks.size });
  } finally { await analysis.dispose(); await observer.dispose(); }
}

handlers.set('I5-04:observed-reads-complete', {
  kind: 'project', fixture: { kind: 'create', create: async root => { await materializeSynthetic(join(root, 'synthetic'), 'S100'); } },
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.equal('S100 generated its hundred owner declarations',
      (await readFile(join(root, 'synthetic/subs/m099/module.ramify'), 'utf8')).trim().split('\n')[1], 'module "m099" tagged []');
  },
  mutate: async () => {},
  run: async ({ root, assertions }: ProjectContext) => {
    const result = await runIsolatedProject({ instanceId: 'I5-04:observed-reads-complete/reference', workRoot,
      fixture: { kind: 'copy', sourceRoot: referenceRoot } }, async project => {
      await prepareReference(project.root);
      await observedReads(project.root, assertions, 'R', coreCatalog);
    });
    if (!result.ok) throw result.error;
    await observedReads(join(root, 'synthetic'), assertions, 'S100', 'subs/m001/src/impl0.ts');
  },
});

handlers.set('I5-04:server-loss-explicit', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    try {
      await facts(analysis, []);
      const pid = retainedCompilerEvidence(analysis).serverPid;
      assertions.ok('the warm adapter has a live server process', alive(pid));
      process.kill(pid!, 'SIGKILL');
      assertions.ok('the killed server is gone', await gone(pid));
      await bodyEdit(root, coreCatalog, 'void 0;');
      await observer.apply([{ path: coreCatalog, kind: 'changed' }]);
      let failure: unknown;
      let returned: unknown;
      try { returned = await analysis.update({ ...none, changed: [coreCatalog] }); } catch (error) { failure = error; }
      assertions.equal('the next call rejects with a read-failure', [returned, (failure as { code?: string })?.code, (failure as Error)?.name],
        [undefined, 'read-failure', 'SourceAnalysisError']);
      assertions.equal('the adapter is no longer hot', analysis.hot, false);
      let stale: unknown;
      try { await analysis.describe([coreCatalog]); stale = 'described'; } catch (error) { stale = (error as { code?: string }).code; }
      assertions.equal('no description is returned from the lost server', stale, 'unavailable');
      let interpreter: unknown;
      try { analysis.interpreter(); interpreter = 'created'; } catch (error) { interpreter = (error as { code?: string }).code; }
      assertions.equal('no access fact is returned from the lost server', interpreter, 'unavailable');
      await analysis.update(none);
      assertions.ok('a later update rebuilds the compiler with a new server', analysis.hot && retainedCompilerEvidence(analysis).serverPid !== pid);
      const rebuilt = await facts(analysis, []);
      const compared = await fresh(root);
      assertions.equal('the rebuilt facts equal a fresh adapter over the edited state', [rebuilt.catalog, rebuilt.accesses], [compared.catalog, compared.accesses]);
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

handlers.set('I5-04:release-and-rebuild', {
  ...referenceBaseline, prepare: ({ root }: IsolatedProject) => prepareReference(root),
  run: async ({ root, assertions }: ProjectContext) => {
    const observer = await observe(root);
    const analysis = await adapter(root, observer.inventory, observer.sink);
    try {
      const warm = await facts(analysis, []);
      const pid = retainedCompilerEvidence(analysis).serverPid;
      assertions.equal('the adapter is hot before the release', analysis.hot, true);
      await analysis.releaseCompiler();
      assertions.equal('the adapter is warm after the release', [analysis.hot, retainedCompilerEvidence(analysis).liveSnapshots], [false, 0]);
      assertions.ok('the server process is gone after the release', await gone(pid));
      assertions.equal('the retained catalog survives the release', JSON.stringify(analysis.catalog()), warm.catalog);
      await bodyEdit(root, coreCatalog, 'void 0;');
      await observer.apply([{ path: coreCatalog, kind: 'changed' }]);
      await analysis.update({ ...none, changed: [coreCatalog] });
      assertions.equal('the adapter is hot again after the rebuild', [analysis.hot, alive(retainedCompilerEvidence(analysis).serverPid)], [true, true]);
      const { delta } = await analysis.describe([coreCatalog]);
      assertions.equal('the rebuild reads every owned file again', delta.recomputed, observer.inventory.files.map(file => file.path).sort(order));
      const catalog = JSON.stringify(analysis.catalog());
      const accesses = JSON.stringify(await analysis.interpreter().interpret(analysis.catalog().files.map(file => file.file)));
      const compared = await fresh(root);
      assertions.equal('the rebuilt facts equal a fresh adapter\'s', [catalog, accesses], [compared.catalog, compared.accesses]);
    } finally { await analysis.dispose(); await observer.dispose(); }
  },
});

export const plan5CompilerHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
