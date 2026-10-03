import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseDescription, readRootMarker } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry } from '../../subs/analysis/subs/model/src/index.js';
import { observeProject, observedEnumerations } from '../../subs/analysis/subs/project/src/observer.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type {
  AcquisitionLimits, CapturedInput, InventoryUpdate, ProjectInventory,
  ProjectObserver, ProjectReadOptions,
} from '../../subs/analysis/subs/project/src/interfaces/project.js';
import type { DescriptionParser } from '../../subs/analysis/subs/descriptions/src/interfaces/syntax.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { referenceRoot } from './fixtures/plan2/reference.js';
import { runIsolatedProject } from './mutation.js';
import type { IsolatedProject } from './mutation.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { residentTextMutations as edits, applyTextMutation } from './resident-mutations.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const limits: AcquisitionLimits = {
  attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
  maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 60_000,
};
const registry = createDefaultTagRegistry().id;
const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const catalogDirectory = 'subs/workspace/subs/catalog';
const validationSource = 'subs/workspace/subs/reviews/subs/validation/src/validate.ts';
const unexposedSource = 'subs/workspace/subs/catalog/subs/core/src/history.ts';
const zodDeclaration = 'node_modules/zod/index.d.ts';

/**
 * The identity a batch report carries, transcribed here from the recipe in
 * `run-analysis.ts`, so the observer's own identity has an independent oracle.
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

function options(root: string, parse: DescriptionParser = parseDescription): ProjectReadOptions {
  return { request: { cwd: root, root, configuration: 'discover', scope: 'whole-project' }, parse, marker: readRootMarker, limits, registry };
}
/** One acquisition-only batch capture of exactly the state on disk now. */
async function batch(root: string): Promise<{ identity: string; inputs: readonly CapturedInput[]; inventory: ProjectInventory }> {
  const acquired = await readProject(options(root));
  if (acquired.status !== 'acquired') throw new Error(`Batch acquisition failed: ${JSON.stringify(acquired)}`);
  try {
    return { identity: batchIdentity(acquired.view.inventory, acquired.view.inputs),
      inputs: acquired.view.inputs, inventory: acquired.view.inventory };
  } finally { await acquired.view.dispose(); }
}
async function open(root: string, parse: DescriptionParser = parseDescription): Promise<ProjectObserver> {
  const result = await observeProject(options(root, parse));
  if (result.status !== 'observing') throw new Error(`Observation failed: ${JSON.stringify(result)}`);
  return result.observer;
}

/** Reference dependencies with a private `zod`, so a declaration can be edited. */
async function prepareReference(root: string, mutableZod = false): Promise<void> {
  const source = join(referenceRoot, 'node_modules'), target = join(root, 'node_modules');
  if (!mutableZod) { await symlink(source, target); return; }
  await mkdir(target);
  for (const entry of await readdir(source)) {
    if (entry === 'zod') await cp(join(source, entry), join(target, entry), { recursive: true, dereference: true });
    else await symlink(join(source, entry), join(target, entry));
  }
}

interface Session {
  readonly observer: ProjectObserver;
  readonly inputs: readonly CapturedInput[];
  readonly inventory: ProjectInventory;
  readonly enumerations: number;
  readonly parses: () => number;
}
const sessions = new Map<string, Session>();
function counting(): { parse: DescriptionParser; parses: () => number } {
  let parses = 0;
  return { parse: (file: string, text: string) => { parses++; return parseDescription(file, text); }, parses: () => parses };
}
/** Establish the cold observation as the baseline every mutation starts from. */
function baseline(expected: { owners: number; files: number }, mutableZod = false) {
  return {
    prepare: (context: IsolatedProject) => prepareReference(context.root, mutableZod),
    baseline: async ({ root, runDirectory, assertions }: ProjectContext) => {
      const { parse, parses } = counting();
      const observer = await open(root, parse);
      sessions.set(runDirectory, { observer, inputs: observer.inputs, inventory: observer.inventory,
        enumerations: observedEnumerations(observer), parses });
      assertions.equal('cold observation reports the reference owners and owned files',
        [observer.inventory.modules.length, observer.inventory.files.length], [expected.owners, expected.files]);
      assertions.equal('cold observation carries the batch input identity',
        observer.inputId, (await batch(root)).identity);
    },
  };
}
async function session(context: ProjectContext): Promise<Session> {
  const held = sessions.get(context.runDirectory);
  if (!held) throw new Error('Expected an observer opened by the baseline');
  return held;
}
function release(runDirectory: string): Promise<void> {
  const held = sessions.get(runDirectory);
  sessions.delete(runDirectory);
  return held ? held.observer.dispose() : Promise.resolve();
}
function moved(before: readonly CapturedInput[], after: readonly CapturedInput[]): readonly string[] {
  const previous = new Map(before.map(input => [input.path, `${input.role}:${input.sha256}`]));
  const current = new Map(after.map(input => [input.path, `${input.role}:${input.sha256}`]));
  return [...new Set([...previous.keys(), ...current.keys()])]
    .filter(path => previous.get(path) !== current.get(path)).sort(order);
}
function localUpdate(assertions: Assertions, name: string, update: InventoryUpdate): Extract<InventoryUpdate, { kind: 'local' }> {
  assertions.equal(name, update.kind, 'local');
  if (update.kind !== 'local') throw new Error(`Expected a local update: ${JSON.stringify(update)}`);
  return update;
}

const handlers = new Map<string, InstanceHandler>();

handlers.set('I5-05:description-local-update', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: ({ root }) => applyTextMutation(root, edits['remove-hop']).then(() => undefined),
  run: async (context: ProjectContext) => {
    const { observer, inputs, inventory, enumerations, parses } = await session(context);
    const { assertions } = context;
    try {
      const before = parses();
      const update = localUpdate(assertions, 'exposure edit is a local update',
        await observer.apply([{ path: edits['remove-hop'].path, kind: 'changed' }]));
      assertions.equal('only the edited description is named', [update.descriptions, update.readmes,
        update.created, update.deleted, update.changed], [[edits['remove-hop'].path], [], [], [], []]);
      assertions.equal('exactly one input identity moved', moved(inputs, observer.inputs), [edits['remove-hop'].path]);
      assertions.equal('every owned file keeps its recorded identity', update.inventory.files, inventory.files);
      assertions.equal('the fifteen owners are unchanged in identity and order',
        update.inventory.modules.map(module => module.id), inventory.modules.map(module => module.id));
      assertions.equal('the edited description lost the createCatalogRouter hop',
        update.inventory.modules.find(module => module.id === 'collection-review/workspace')!.description.status === 'valid'
        && JSON.stringify(update.inventory.modules.find(module => module.id === 'collection-review/workspace')!.description)
          .includes('createCatalogRouter'), false);
      assertions.equal('no directory beneath subs/ is listed again', observedEnumerations(observer), enumerations);
      assertions.equal('exactly one description was parsed again', parses() - before, 1);
      recordObservation('plan5-observer-local', { kind: update.kind, descriptions: update.descriptions,
        enumerations, owners: update.inventory.modules.length });
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:readme-local-update', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: async ({ root }) => {
    const path = join(root, catalogDirectory, 'README.md');
    const text = await readFile(path, 'utf8');
    const [first] = text.split('\n\n').slice(1);
    if (!first) throw new Error('Expected a first prose paragraph in the catalog README');
    await writeFile(path, text.replace(first, `${first.trimEnd()} It is restated for this observation.`));
  },
  run: async (context: ProjectContext) => {
    const { observer, inventory, parses } = await session(context);
    const { assertions } = context;
    try {
      const before = parses();
      const readme = `${catalogDirectory}/README.md`;
      const update = localUpdate(assertions, 'README edit is a local update',
        await observer.apply([{ path: readme, kind: 'changed' }]));
      assertions.equal('only the edited README is named', [update.readmes, update.descriptions,
        update.created, update.deleted, update.changed], [[readme], [], [], [], []]);
      const owner = update.inventory.modules.find(module => module.id === 'collection-review/workspace/catalog')!;
      assertions.equal('the purpose is the restated paragraph', owner.purpose.state === 'present'
        && owner.purpose.paragraph.endsWith('It is restated for this observation.'), true);
      assertions.equal('the owner keeps its parsed description',
        owner.description, inventory.modules.find(module => module.id === 'collection-review/workspace/catalog')!.description);
      assertions.equal('no description is parsed again', parses() - before, 0);
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:file-created-local', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: ({ root }) => writeFile(join(root, catalogDirectory, 'src/extra.ts'), 'export const extra = 1;\n', { flag: 'wx' }),
  run: async (context: ProjectContext) => {
    const { observer, inventory } = await session(context);
    const { assertions } = context;
    try {
      const created = `${catalogDirectory}/src/extra.ts`;
      const update = localUpdate(assertions, 'a created owned file is a local update',
        await observer.apply([{ path: created, kind: 'created' }]));
      assertions.equal('only the created file is named',
        [update.created, update.deleted, update.descriptions, update.readmes, update.changed], [[created], [], [], [], []]);
      assertions.equal('it joins its owner\'s ordinary area',
        update.inventory.files.filter(file => file.path === created).map(file => [file.owner, file.area, file.kind]),
        [['collection-review/workspace/catalog', 'ordinary', 'source']]);
      assertions.equal('the sixty owned files are the previous ones plus it',
        update.inventory.files.map(file => file.path),
        [...inventory.files.map(file => file.path), created].sort(order));
      assertions.equal('the observed identity equals a batch capture of the same state',
        observer.inputId, (await batch(context.root)).identity);
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:file-deleted-local', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: ({ root }) => rm(join(root, unexposedSource)),
  run: async (context: ProjectContext) => {
    const { observer, inventory } = await session(context);
    const { assertions } = context;
    try {
      const update = localUpdate(assertions, 'a deleted owned file is a local update',
        await observer.apply([{ path: unexposedSource, kind: 'deleted' }]));
      assertions.equal('only the deleted file is named',
        [update.deleted, update.created, update.descriptions, update.readmes, update.changed], [[unexposedSource], [], [], [], []]);
      assertions.equal('the inventory no longer lists it',
        update.inventory.files.map(file => file.path),
        inventory.files.map(file => file.path).filter(path => path !== unexposedSource));
      assertions.equal('no other owner loses a file',
        update.inventory.modules.map(module => module.id), inventory.modules.map(module => module.id));
      assertions.equal('the deleted path is no longer an observed input',
        observer.inputs.some(input => input.path === unexposedSource), false);
      // The structural edits differential test (ff22508) made a local update reject an exposure target
      // that lost its exact file, as the acquisition does.
      await rm(join(context.root, validationSource));
      const invalid = await observer.apply([{ path: validationSource, kind: 'deleted' }]);
      assertions.equal('deleting an exposure target is an invalid update naming the missing source reference',
        invalid.kind === 'invalid' ? invalid.issues.map(issue => [issue.code, issue.path]) : invalid.kind,
        [['missing-file', 'subs/workspace/subs/reviews/subs/validation/module.ramify']]);
      assertions.equal('the previous inventory stays current', observer.inventory, update.inventory);
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:module-added-structural', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: async ({ root }) => {
    const directory = join(root, catalogDirectory, 'subs/extra');
    await mkdir(join(directory, 'src'), { recursive: true });
    await writeFile(join(directory, 'module.ramify'), 'ramify 1\nmodule extra\n\nexpose-src extra from "extra.ts" to parent\n', { flag: 'wx' });
    await writeFile(join(directory, 'README.md'), '# Extra\n\nExtra supplies one exposed constant.\n', { flag: 'wx' });
    await writeFile(join(directory, 'src/extra.ts'), 'export const extra = 1;\n', { flag: 'wx' });
  },
  run: async (context: ProjectContext) => {
    const { observer } = await session(context);
    const { assertions } = context;
    try {
      const update = await observer.apply([{ path: `${catalogDirectory}/subs/extra/module.ramify`, kind: 'created' }]);
      assertions.equal('a new module boundary rebuilds the inventory', update.kind, 'structural');
      if (update.kind !== 'structural') throw new Error('Expected a structural update');
      assertions.equal('sixteen owners with the new one beneath catalog',
        [update.inventory.modules.length, update.inventory.modules.some(module => module.id === 'collection-review/workspace/catalog/extra')],
        [16, true]);
      assertions.equal('the new owner\'s source joins the inventory',
        update.inventory.files.some(file => file.path === `${catalogDirectory}/subs/extra/src/extra.ts`), true);
      assertions.equal('the rebuilt identity equals a batch capture of the same state',
        observer.inputId, (await batch(context.root)).identity);
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:stray-description-invalid', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }),
  mutate: ({ root }) => writeFile(join(root, catalogDirectory, 'src/module.ramify'), 'ramify 1\nmodule stray\n', { flag: 'wx' }),
  run: async (context: ProjectContext) => {
    const { observer, inventory } = await session(context);
    const { assertions } = context;
    try {
      const stray = `${catalogDirectory}/src/module.ramify`;
      const update = await observer.apply([{ path: stray, kind: 'created' }]);
      assertions.equal('a description inside a source area is an invalid update', update.kind, 'invalid');
      if (update.kind !== 'invalid') throw new Error('Expected an invalid update');
      const acquisition = await readProject(options(context.root));
      assertions.equal('Plan 1\'s acquisition of the same state is invalid', acquisition.status, 'invalid');
      assertions.equal('the update carries exactly Plan 1\'s issues',
        update.issues, acquisition.status === 'invalid' ? acquisition.issues : []);
      assertions.equal('the layout issue names the stray description',
        update.issues.filter(issue => issue.code === 'description-in-src').map(issue => issue.path), [stray]);
      assertions.equal('the previous inventory is not offered as current', update.inventory === inventory, false);
      assertions.equal('the last valid inventory is retained unchanged', observer.inventory, inventory);
    } finally { await release(context.runDirectory); }
  },
});

handlers.set('I5-05:sweep-detects-unwatched', {
  kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot }, ...baseline({ owners: 15, files: 59 }, true),
  mutate: async ({ root }) => {
    const path = join(root, zodDeclaration);
    await writeFile(path, `${await readFile(path, 'utf8')}\nexport declare const ramifySweepWitness: number;\n`);
  },
  run: async (context: ProjectContext) => {
    const { observer } = await session(context);
    const { assertions } = context;
    try {
      const path = join(context.root, zodDeclaration);
      // Iteration 5's retained adapter reports the compiler's reads here; the
      // observation this sweep starts from is the identity the reader saw.
      const original = (await readFile(path, 'utf8')).replace(/\nexport declare const ramifySweepWitness: number;\n$/, '');
      observer.sink.file(path, sha256(original), Buffer.byteLength(original), 'dependency');
      const changes = await observer.reobserve();
      assertions.equal('the sweep names the changed declaration exactly once',
        changes.filter(change => change.path === path), [{ path, kind: 'changed' }]);
      assertions.equal('every unchanged observed path returns no change', changes.length, 1);
      assertions.equal('the applied sweep change is an ordinary update',
        (await observer.apply(changes)).kind, 'local');
      assertions.equal('a settled sweep reports nothing', await observer.reobserve(), []);
    } finally { await release(context.runDirectory); }
  },
});

/** Four observed states on each fixture, each against its own batch capture. */
async function identitySequence(root: string, assertions: Assertions, fixture: string,
  steps: readonly { readonly name: string; readonly change: string; readonly kind: 'changed' | 'created'; readonly edit: () => Promise<void> }[]): Promise<void> {
  const observer = await open(root);
  try {
    const identities = [observer.inputId];
    assertions.equal(`${fixture}: the cold identity equals a batch capture`, observer.inputId, (await batch(root)).identity);
    for (const step of steps) {
      await step.edit();
      const update = await observer.apply([{ path: step.change, kind: step.kind }]);
      assertions.equal(`${fixture}: ${step.name} is a local update`, update.kind, 'local');
      assertions.equal(`${fixture}: ${step.name} carries the batch identity`, observer.inputId, (await batch(root)).identity);
      identities.push(observer.inputId);
    }
    assertions.equal(`${fixture}: every step has its own identity`, new Set(identities).size, identities.length);
    recordObservation('plan5-observer-identity', { fixture, steps: steps.map(step => step.name), identities });
  } finally { await observer.dispose(); }
}

handlers.set('I5-05:input-id-equals-batch', {
  kind: 'project', fixture: { kind: 'create', create: async root => { await materializeSynthetic(join(root, 'synthetic'), 'S100'); } },
  baseline: async ({ root, assertions }: ProjectContext) => {
    assertions.equal('S100 generated its hundred owner declarations',
      (await readFile(join(root, 'synthetic/subs/m099/module.ramify'), 'utf8')).trim().split('\n')[1], 'module "m099" tagged []');
  },
  mutate: async () => {},
  run: async ({ root, assertions }: ProjectContext) => {
    const result = await runIsolatedProject({ instanceId: 'I5-05:input-id-equals-batch/reference',
      workRoot: join(repositoryRoot, '.reference-work'), fixture: { kind: 'copy', sourceRoot: referenceRoot } }, async project => {
      await prepareReference(project.root);
      await identitySequence(project.root, assertions, 'R', [
        { name: 'the exposure edit', change: edits['remove-hop'].path, kind: 'changed',
          edit: async () => { await applyTextMutation(project.root, edits['remove-hop']); } },
        { name: 'the README edit', change: edits['readme-edit'].path, kind: 'changed',
          edit: async () => { await applyTextMutation(project.root, edits['readme-edit']); } },
        { name: 'the created source file', change: `${catalogDirectory}/src/extra.ts`, kind: 'created',
          edit: () => writeFile(join(project.root, catalogDirectory, 'src/extra.ts'), 'export const extra = 1;\n', { flag: 'wx' }) },
      ]);
    });
    if (!result.ok) throw result.error;
    const synthetic = join(root, 'synthetic');
    await identitySequence(synthetic, assertions, 'S100', [
      { name: 'the header tag edit', change: 'subs/m001/module.ramify', kind: 'changed',
        edit: () => writeFile(join(synthetic, 'subs/m001/module.ramify'), 'ramify 1\nmodule "m001" tagged [ui]\n') },
      { name: 'the README edit', change: 'subs/m001/README.md', kind: 'changed',
        edit: () => writeFile(join(synthetic, 'subs/m001/README.md'), '# m001\n\nSupplies deterministic workload bytes, restated.\n') },
      { name: 'the created source file', change: 'subs/m001/src/extra.ts', kind: 'created',
        edit: () => writeFile(join(synthetic, 'subs/m001/src/extra.ts'), 'export const extra = 1;\n', { flag: 'wx' }) },
    ]);
  },
});

export const plan5ObserverHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
