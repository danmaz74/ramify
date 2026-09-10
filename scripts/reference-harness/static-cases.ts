import { readFile, symlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { originalKey } from '../../subs/analysis/subs/model/src/index.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { ownerId, sourcePath } from './linking-expectations.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler, ProjectContext } from './runner.js';
import { cleanStatic, compilerValid, completeStatic, expectedDecision, selected, staticForms, staticProject } from './static-expectations.js';
import type { StaticProject } from './static-expectations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const workspace = 'workspace', catalog = 'workspace/catalog', core = `${catalog}/core`, reviews = 'workspace/reviews';
const runtime = `${reviews}/core`, tasks = `${runtime}/tasks`, controller = `${runtime}/controller`, validation = `${reviews}/validation`;
const description = (owner: string): string => sourcePath(owner, '').replace(/src\/$/, 'module.ramify');
const probe = (owner: string): string => sourcePath(owner, '__i1_probe.ts');
const specifier = (importer: string, target: string): string => {
  const path = relative(dirname(importer), target).replace(/\.tsx?$/, '.js');
  return path.startsWith('.') ? path : `./${path}`;
};
async function replace(root: string, path: string, before: string, after: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  if (!text.includes(before)) throw new Error(`Missing mutation anchor ${before} in ${path}`);
  await put(root, path, text.replace(before, after));
}
const w2 = 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent';
const removedW2 = 'expose-sub createCatalogTools, inspectRecord from catalog to parent';
const fixtureProbe = 'subs/consumer/src/probe.ts', api = 'subs/provider/src/interfaces/api.ts';
const handlers = new Map<string, InstanceHandler>();
function add(id: string, fixture: 'R' | 'F', mutate: Extract<InstanceHandler, { kind: 'project' }>['mutate'],
  check: (context: ProjectContext, result: StaticProject) => void): void {
  handlers.set(id, { kind: 'project',
    fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot } : { kind: 'create', create: createProjectFixture },
    ...(fixture === 'R' ? { prepare: async ({ root }: { root: string }) => symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')) } : {}),
    baseline: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await staticProject(context.root);
      cleanStatic(result, context.assertions);
      context.assertions.equal('baseline owners', result.inventory.modules.length, fixture === 'R' ? 15 : 3);
      context.assertions.equal('baseline static occurrence inventory', result.accesses.filter(access => staticForms.has(access.form)).length, fixture === 'R' ? 292 : 1);
      context.assertions.equal('baseline application decisions', result.decisions.length, fixture === 'R' ? 164 : 1);
      context.assertions.equal('baseline static external scope', result.accesses.filter(access => staticForms.has(access.form) && access.target.kind === 'external').length, fixture === 'R' ? 128 : 0);
    }, mutate,
    run: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await staticProject(context.root);
      completeStatic(result, context.assertions);
      check(context, result);
    },
  });
}
const unchanged = async (): Promise<void> => {};
const noDenials = (context: ProjectContext, result: StaticProject): void => context.assertions.equal('changed source has no denied decisions',
  result.decisions.filter(item => item.decision.status === 'denied'), []);
const deniedOnly = (context: ProjectContext, result: StaticProject, importer: string, binding: string): void =>
  context.assertions.equal('exactly the independently expected denied binding', result.decisions.filter(item => item.decision.status === 'denied')
    .map(item => [item.access.importer.file, item.decision.original?.id.binding]), [[importer, binding]]);
function catalogRouter(context: ProjectContext, result: StaticProject, allowed: boolean): void {
  const importer = 'src/assembly.ts';
  expectedDecision(context.assertions, selected(result, context.assertions, importer, 'createCatalogRouter'), {
    importer, owner: ownerId(catalog), file: 'router.ts', binding: 'createCatalogRouter', target: sourcePath(catalog, 'router.ts'),
    status: allowed ? 'allowed' : 'denied', reason: allowed ? 'exposed' : 'not-visible', profile: ['dispatch'], tags: ['dispatch'],
    ...(allowed ? { hops: [ownerId(catalog), ownerId(workspace)] } : {}),
  });
  if (allowed) noDenials(context, result); else {
    deniedOnly(context, result, importer, 'createCatalogRouter');
    context.assertions.ok('A1 remains and the W2 catalog-router hop is absent', result.model.exposures.some(exposure =>
      exposure.module === ownerId(catalog) && exposure.original.binding === 'createCatalogRouter')
      && !result.model.exposures.some(exposure => exposure.module === ownerId(workspace) && exposure.original.binding === 'createCatalogRouter'));
  }
}
add('I1-06:remove-hop', 'R', ({ root }) => replace(root, description(workspace), w2, removedW2), (context, result) => catalogRouter(context, result, false));
add('I1-06:restore-hop', 'R', async ({ root }) => {
  await replace(root, description(workspace), w2, removedW2);
  const removed = await staticProject(root);
  if (!removed.decisions.some(item => item.access.importer.file === 'src/assembly.ts'
    && item.decision.original?.id.binding === 'createCatalogRouter' && item.decision.reason === 'not-visible')) {
    throw new Error('The removed W2 hop must deny before restoration');
  }
  await replace(root, description(workspace), removedW2, w2);
}, (context, result) => catalogRouter(context, result, true));
add('I1-06:relay-only', 'R', unchanged, (context, result) => {
  catalogRouter(context, result, true);
  context.assertions.equal('workspace retains browser profile', result.model.modules.find(module => module.id === ownerId(workspace))!.headerTags, ['browser', 'dispatch', 'ui']);
  context.assertions.ok('W2 declaration relays the unpromised server original', result.linked.selections.some(selection => selection.module === ownerId(workspace)
    && selection.pairs.some(pair => pair.original.binding === 'createCatalogRouter' && pair.effective)));
});
add('I1-06:source-forward', 'R', ({ root }) => put(root, probe(workspace),
  `export { createCatalogRouter } from '${specifier(probe(workspace), sourcePath(catalog, 'router.ts'))}';\n`), (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, probe(workspace), 'createCatalogRouter'), {
    importer: probe(workspace), owner: ownerId(catalog), file: 'router.ts', binding: 'createCatalogRouter', target: sourcePath(catalog, 'router.ts'),
    status: 'denied', reason: 'required-symbol-tag', profile: ['browser', 'dispatch', 'ui'], tags: ['dispatch'], hops: [ownerId(catalog)], failedTag: 'browser',
  });
  deniedOnly(context, result, probe(workspace), 'createCatalogRouter');
  context.assertions.ok('W2 remains valid despite the forbidden source forwarding', result.linked.selections.some(selection => selection.module === ownerId(workspace)
    && selection.pairs.some(pair => pair.original.binding === 'createCatalogRouter' && pair.effective)));
});

const nested = `${tasks}/nested`, vocab = sourcePath('workspace/contracts', 'interfaces/vocabulary.ts');
add('I1-07:deeper-descendant', 'R', async ({ root }) => {
  await put(root, description(nested), 'ramify 1\nmodule nested\n');
  await put(root, sourcePath(nested, 'probe.ts'), `import type { RecordId } from '${specifier(sourcePath(nested, 'probe.ts'), vocab)}';\n`);
}, (context, result) => {
  const importer = sourcePath(nested, 'probe.ts');
  expectedDecision(context.assertions, selected(result, context.assertions, importer, 'RecordId'), {
    importer, owner: ownerId('workspace/contracts'), file: 'interfaces/vocabulary.ts', binding: 'RecordId', target: vocab,
    status: 'allowed', reason: 'exposed', request: 'type-only', tags: ['browser'], profile: [], hops: [ownerId('workspace/contracts'), ownerId(workspace)],
  });
  context.assertions.equal('new deeper owner discovered', result.inventory.modules.length, 16);
  noDenials(context, result);
});
for (const [id, importerOwner, targetOwner, file, binding, typeOnly] of [
  ['reverse-task-controller', tasks, controller, 'controller.ts', 'tick', false],
  ['validation-runtime/value', validation, runtime, 'runtime.ts', 'createReviewRuntime', false],
  ['validation-runtime/type', validation, runtime, 'runtime.ts', 'ReviewOutcome', true],
  ['parent-private', catalog, core, 'history.ts', 'resolvePredecessors', false],
] as const) add(`I1-07:${id}`, 'R', ({ root }) => put(root, probe(importerOwner),
  `import ${typeOnly ? 'type ' : ''}{ ${binding} } from '${specifier(probe(importerOwner), sourcePath(targetOwner, file))}';\n`), (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, probe(importerOwner), binding), {
    importer: probe(importerOwner), owner: ownerId(targetOwner), file, binding, target: sourcePath(targetOwner, file),
    status: 'denied', reason: 'not-visible', request: typeOnly ? 'type-only' : 'value', tags: [], profile: importerOwner === catalog ? ['dispatch'] : [],
  });
  deniedOnly(context, result, probe(importerOwner), binding);
});

function inspectIdentity(context: ProjectContext, result: StaticProject): void {
  expectedDecision(context.assertions, selected(result, context.assertions, 'src/assembly.ts', 'inspect'), {
    importer: 'src/assembly.ts', owner: ownerId(core), file: 'catalog.ts', binding: 'inspect', target: sourcePath(core, 'catalog.ts'),
    status: 'allowed', reason: 'exposed', tags: [], profile: ['dispatch'], hops: [ownerId(core), ownerId(catalog), ownerId(workspace)],
  });
  noDenials(context, result);
}
add('I1-08:import-rename', 'R', async ({ root }) => {
  await replace(root, 'src/assembly.ts', 'import { inspect }', 'import { inspect as inspectLocal }');
  await replace(root, 'src/assembly.ts', '{ inspect }', '{ inspect: inspectLocal }');
}, (context, result) => {
  inspectIdentity(context, result);
  context.assertions.equal('local rename retained', result.accesses.find(access => access.importer.file === 'src/assembly.ts'
    && access.selections[0]?.exportedName === 'inspect')!.selections[0].localName, 'inspectLocal');
});
add('I1-08:exposure-rename', 'R', async ({ root }) => {
  await replace(root, description(catalog), 'inspect as inspectRecord', 'inspect as inspectPublic');
  await replace(root, description(workspace), 'inspectRecord from catalog', 'inspectPublic from catalog');
}, (context, result) => {
  inspectIdentity(context, result);
  context.assertions.equal('both relay names change with the original preserved', result.model.exposures.filter(exposure =>
    [ownerId(catalog), ownerId(workspace)].includes(exposure.module) && exposure.original.binding === 'inspect').map(exposure => exposure.names),
  [['inspectPublic'], ['inspectPublic']]);
});
function appRouter(context: ProjectContext, result: StaticProject): void {
  const importer = sourcePath(workspace, 'client.ts');
  const item = selected(result, context.assertions, importer, 'AppRouter');
  expectedDecision(context.assertions, item, {
    importer, owner: ownerId(''), file: 'assembly.ts', binding: 'AppRouter', target: 'src/interfaces/protocol.ts',
    status: 'allowed', reason: 'exposed', request: 'type-only', tags: ['dispatch'], profile: ['browser', 'dispatch', 'ui'], hops: [ownerId('')],
  });
  context.assertions.equal('protocol forwarding origin survives', item.access.selections[0].forwarding.map(origin => origin.file), ['src/interfaces/protocol.ts']);
  const forwarding = result.decisions.find(item => item.access.importer.file === 'src/interfaces/protocol.ts' && item.decision.original?.id.binding === 'AppRouter')!;
  context.assertions.equal('same-owner source forwarding retains type request', [forwarding.decision.status, forwarding.decision.reason, forwarding.access.form],
    ['allowed', 'same-owner', 'type-export']);
  noDenials(context, result);
}
add('I1-08:same-owner-forward', 'R', unchanged, appRouter);
add('I1-08:same-spelling', 'F', async ({ root }) => {
  await put(root, 'subs/consumer/src/local.ts', 'export const value = 2;\n');
  await put(root, fixtureProbe, "import { value } from '../../provider/src/interfaces/api.js';\nimport { value as ownValue } from './local.js'; void [value, ownValue];\n");
}, (context, result) => {
  const values = result.decisions.filter(item => item.access.importer.file === fixtureProbe);
  context.assertions.equal('same spelling preserves different original owners and permissions', values.map(item => [item.decision.original?.id.owner,
    item.decision.original?.id.binding, item.decision.reason]), [['fixture/provider', 'value', 'exposed'], ['fixture/consumer', 'value', 'same-owner']]);
  context.assertions.equal('same spelling has two distinct canonical identities', new Set(values.map(item => originalKey(item.decision.original!.id))).size, 2);
  noDenials(context, result);
});
for (const kind of ['wrapper', 'type-alias'] as const) add(`I1-08:new-${kind}`, 'F', async ({ root }) => {
  await put(root, 'subs/consumer/module.ramify', 'ramify 1\nmodule consumer tagged [ui]\n');
  await put(root, 'subs/consumer/src/wrapper.ts', kind === 'wrapper'
    ? "import { value } from '../../provider/src/interfaces/api.js'; export const wrapped = () => value;\n"
    : "import type { Type } from '../../provider/src/interfaces/api.js'; export type LocalType = Type;\n");
}, (context, result) => {
  const name = kind === 'wrapper' ? 'wrapped' : 'LocalType';
  const original = result.model.originals.find(original => original.id.binding === name)!;
  context.assertions.equal('new binding has its defining owner and required tags only', [original.id, original.origin.area.profile, original.tags,
    original.hasValue, original.hasType], [{ kind: 'code', owner: 'fixture/consumer', file: 'wrapper.ts', binding: name }, ['ui'], ['ui'], kind === 'wrapper', kind === 'type-alias']);
  context.assertions.ok('new binding remains unexposed', !result.model.exposures.some(exposure => originalKey(exposure.original) === originalKey(original.id)));
  noDenials(context, result);
});

add('I1-18:js-substitution', 'R', unchanged, (context, result) => {
  catalogRouter(context, result, true);
  context.assertions.equal('authored js spelling remains distinct from the ts original', result.accesses.find(access => access.importer.file === 'src/assembly.ts'
    && access.selections[0]?.exportedName === 'createCatalogRouter')!.specifier, '../subs/workspace/subs/catalog/src/router.js');
});
function catalogCard(context: ProjectContext, result: StaticProject): void {
  expectedDecision(context.assertions, selected(result, context.assertions, sourcePath(workspace, 'app.tsx'), 'CatalogCard'), {
    importer: sourcePath(workspace, 'app.tsx'), owner: ownerId(`${catalog}/ui`), file: 'catalog-card.tsx', binding: 'CatalogCard',
    target: sourcePath(`${catalog}/ui`, 'catalog-card.tsx'), status: 'allowed', reason: 'exposed', tags: ['browser', 'ui'],
    profile: ['browser', 'dispatch', 'ui'], hops: [ownerId(`${catalog}/ui`), ownerId(catalog)],
  });
  noDenials(context, result);
}
add('I1-18:path-alias', 'R', async ({ root }) => {
  const before = await staticProject(root);
  const alias = before.decisions.find(item => item.access.specifier === '@features/catalog/subs/ui/src/catalog-card.js');
  if (alias?.decision.original?.id.owner !== ownerId(`${catalog}/ui`) || alias.decision.status !== 'allowed') throw new Error('Configured alias must resolve before the relative variant');
  await replace(root, sourcePath(workspace, 'app.tsx'), '@features/catalog/subs/ui/src/catalog-card.js', '../subs/catalog/subs/ui/src/catalog-card.js');
}, (context, result) => {
  catalogCard(context, result);
  context.assertions.equal('relative spelling replaces only the alias', result.accesses.find(access => access.importer.file === sourcePath(workspace, 'app.tsx')
    && access.selections[0]?.exportedName === 'CatalogCard')!.specifier, '../subs/catalog/subs/ui/src/catalog-card.js');
});
add('I1-18:AppRouter-forward', 'R', unchanged, (context, result) => {
  appRouter(context, result);
  const inline = result.decisions.find(item => item.access.importer.file === sourcePath(`${reviews}/ui`, 'review-panel.tsx') && item.decision.original?.id.binding === 'AppRouter')!;
  context.assertions.equal('inline reference type preserves root original and dispatch tags', [inline.access.form, inline.access.runtimeLoad, inline.decision.question.selection?.request,
    inline.decision.original?.id, inline.decision.original?.tags, inline.decision.status], ['inline-type-import', true, 'type-only',
    { kind: 'code', owner: ownerId(''), file: 'assembly.ts', binding: 'AppRouter' }, ['dispatch'], 'allowed']);
});
for (const variant of ['named', 'default', 'forwarded-default'] as const) add(`I1-18:named-default/${variant}`, 'F', async ({ root }) => {
  if (variant === 'forwarded-default') {
    await replace(root, api, 'export default function defaultValue(): number { return 3; }', 'export { value as default };');
    // Both declarations select the same original and must agree on its existing
    // browser promise; this is the reviewed coherent forwarding-alias fixture.
    await replace(root, 'subs/provider/module.ramify', 'expose-src Type, Runtime, Merged, default from "interfaces/api.ts" to parent',
      'expose-src Type, Runtime, Merged from "interfaces/api.ts" to parent\nexpose-src default from "interfaces/api.ts" tagged [browser] to parent');
  }
  await put(root, fixtureProbe, variant === 'named' ? "import { value } from '../../provider/src/interfaces/api.js'; void value;\n"
    : "import chosen from '../../provider/src/interfaces/api.js'; void chosen;\n");
}, (context, result) => {
  const binding = variant === 'default' ? 'defaultValue' : 'value';
  expectedDecision(context.assertions, selected(result, context.assertions, fixtureProbe, binding), {
    importer: fixtureProbe, owner: 'fixture/provider', file: 'interfaces/api.ts', binding, target: api,
    status: 'allowed', reason: 'exposed', tags: variant === 'default' ? [] : ['browser'], profile: [], hops: ['fixture/provider', 'fixture'],
  });
  context.assertions.equal('named and default selection forms remain distinct', result.accesses[0].selectionForm, variant === 'named' ? 'named' : 'default');
  noDenials(context, result);
});
for (const variant of ['import-statement', 'import-inline', 'export-statement', 'export-inline'] as const) add(`I1-18:source-types/${variant}`, 'R', ({ root }) => {
  const [verb, style] = variant.split('-');
  return put(root, probe(core), `${verb} ${style === 'statement' ? 'type ' : ''}{ ${style === 'inline' ? 'type ' : ''}ProtocolFacilities } from '${specifier(probe(core), 'src/interfaces/protocol.ts')}';\n`);
}, (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, probe(core), 'ProtocolFacilities'), {
    importer: probe(core), owner: ownerId(''), file: 'interfaces/protocol.ts', binding: 'ProtocolFacilities', target: 'src/interfaces/protocol.ts',
    status: 'denied', reason: 'required-importer-tag', request: 'type-only', profile: [], tags: ['dispatch'], hops: [ownerId('')], failedTag: 'dispatch',
  });
  deniedOnly(context, result, probe(core), 'ProtocolFacilities');
  const access = result.accesses.find(access => access.importer.file === probe(core))!;
  context.assertions.equal('written type syntax is retained independently of runtime load', [access.form, access.runtimeLoad],
    variant === 'import-statement' ? ['import-type', false] : variant === 'import-inline' ? ['inline-type-import', true]
      : variant === 'export-statement' ? ['type-export', false] : ['inline-type-export', true]);
});
add('I1-18:application-alias', 'R', unchanged, (context, result) => {
  catalogCard(context, result);
  const alias = result.accesses.find(access => access.specifier === '@features/catalog/subs/ui/src/catalog-card.js')!;
  context.assertions.equal('bare application alias is compiler-proven application scope', alias.target.kind, 'application');
});
export const staticHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
