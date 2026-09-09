import { readFile, symlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { ownerId, sourcePath } from './linking-expectations.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler, ProjectContext } from './runner.js';
import { cleanStatic, compilerValid, completeStatic, expectedDecision, selected, staticProject } from './static-expectations.js';
import type { StaticProject } from './static-expectations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const workspace = 'workspace', catalog = `${workspace}/catalog`, core = `${catalog}/core`;
const reviews = `${workspace}/reviews`, runtime = `${reviews}/core`, tasks = `${runtime}/tasks`, controller = `${runtime}/controller`;
const pureUi = `${reviews}/ui/pure-ui`, sharedUi = `${workspace}/shared-ui`, catalogUi = `${catalog}/ui`;
const description = (owner: string): string => sourcePath(owner, '').replace(/src\/$/, 'module.ramify');
const probe = (owner: string, file = '__i1_probe.ts'): string => sourcePath(owner, file);
const fixtureProbe = 'subs/consumer/src/probe.ts', api = 'subs/provider/src/interfaces/api.ts';
const consumerDescription = 'subs/consumer/module.ramify', providerDescription = 'subs/provider/module.ramify';
const fixtureSource = sourcePath(core, 'tests/fixture.ts');
const runtimeTest = sourcePath(runtime, 'tests/runtime.test.ts'), catalogTest = sourcePath(core, 'tests/catalog.test.ts');
const w3 = 'expose-sub makeCatalogFixture from catalog to descendants';
const specifier = (importer: string, target: string): string => {
  const path = relative(dirname(importer), target).replace(/\.tsx?$/, '.js');
  return path.startsWith('.') ? path : `./${path}`;
};
async function replace(root: string, path: string, before: string, after: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Expected one mutation anchor ${before} in ${path}`);
  await put(root, path, text.replace(before, after));
}
async function append(root: string, path: string, text: string): Promise<void> {
  await put(root, path, await readFile(join(root, path), 'utf8') + text);
}
const importBinding = (root: string, importer: string, target: string, binding: string, typeOnly = false) =>
  put(root, importer, `import ${typeOnly ? 'type ' : ''}{ ${binding} } from '${specifier(importer, target)}';\n`);
const unchanged = async (): Promise<void> => {};
const handlers = new Map<string, InstanceHandler>();
type ProjectHandler = Extract<InstanceHandler, { kind: 'project' }>;
function add(id: string, fixture: 'R' | 'F', mutate: ProjectHandler['mutate'],
  check: (context: ProjectContext, result: StaticProject) => void,
  prepare: NonNullable<ProjectHandler['prepare']> = unchanged): void {
  handlers.set(id, { kind: 'project',
    fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot } : { kind: 'create', create: createProjectFixture },
    prepare: async context => {
      if (fixture === 'R') await symlink(join(referenceRoot, 'node_modules'), join(context.root, 'node_modules'));
      await prepare(context);
    },
    baseline: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await staticProject(context.root);
      cleanStatic(result, context.assertions);
      context.assertions.equal('baseline owners', result.inventory.modules.length, fixture === 'R' ? 15 : 3);
      context.assertions.equal('baseline static application decisions', result.decisions.length, fixture === 'R' ? 164 : 1);
      context.assertions.equal('baseline analysis diagnostics', result.diagnostics, []);
    }, mutate,
    run: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await staticProject(context.root);
      completeStatic(result, context.assertions);
      // Each definite decision must survive the analysis mapping as a located
      // diagnostic, with the exact original (or null for a target-only load).
      for (const { access, decision } of result.decisions) {
        const diagnostics = result.diagnostics.filter(issue => issue.accessId === access.id);
        context.assertions.equal(`${access.id}: analysis diagnostic evidence`, diagnostics.map(issue =>
          [issue.code, issue.location, issue.importer, issue.original]), decision.status === 'denied'
          ? [[decision.reason, decision.question.location, decision.question.importer.area, decision.original?.id ?? null]] : []);
      }
      check(context, result);
    },
  });
}
function denials(context: ProjectContext, result: StaticProject, expected: readonly (readonly [string, string | null, string])[] = []): void {
  context.assertions.equal('exactly the independently expected denials', result.decisions.filter(item => item.decision.status === 'denied')
    .map(item => [item.access.importer.file, item.decision.original?.id.binding ?? null, item.decision.reason]), expected);
}
function originDenied(context: ProjectContext, item: StaticProject['decisions'][number], blockers: readonly string[]): void {
  const { decision } = item;
  const prefix = `${decision.question.importer.file}#${decision.original?.id.binding ?? 'load'}`;
  context.assertions.equal(`${prefix}: origin guard runs before visibility and same-owner exemption`,
    [decision.status, decision.reason, decision.visibility, decision.requirements], ['denied', 'testing-origin', null, []]);
  context.assertions.equal(`${prefix}: testing blockers retained`, [...new Set(decision.blockingOrigins.map(origin => origin.file))], blockers);
  context.assertions.ok(`${prefix}: blockers carry testing classification`, decision.blockingOrigins.every(origin => origin.area.profile.includes('testing')));
}
const browserConsumer: NonNullable<ProjectHandler['prepare']> = ({ root }) =>
  put(root, consumerDescription, 'ramify 1\nmodule consumer tagged [browser]\n');

for (const typeOnly of [false, true]) add(`I1-12:ui-${typeOnly ? 'type' : 'value'}`, 'R', ({ root }) =>
  importBinding(root, probe(core), sourcePath(sharedUi, 'status-badge.tsx'), typeOnly ? 'StatusBadgeProps' : 'StatusBadge', typeOnly), (context, result) => {
  const binding = typeOnly ? 'StatusBadgeProps' : 'StatusBadge';
  expectedDecision(context.assertions, selected(result, context.assertions, probe(core), binding), {
    importer: probe(core), owner: ownerId(sharedUi), file: 'status-badge.tsx', binding, target: sourcePath(sharedUi, 'status-badge.tsx'),
    status: 'denied', reason: 'required-importer-tag', request: typeOnly ? 'type-only' : 'value', profile: [], tags: ['browser', 'ui'],
    hops: [ownerId(sharedUi), ownerId(workspace)], failedTag: 'ui',
  });
  denials(context, result, [[probe(core), binding, 'required-importer-tag']]);
});
for (const typeOnly of [false, true]) for (const [variant, owner, profile] of [
  ['core', core, []], ['pure-ui', pureUi, ['browser', 'ui']],
] as const) add(`I1-12:dispatch-${typeOnly ? 'type' : 'value'}/${variant}`, 'R', ({ root }) =>
  importBinding(root, probe(owner), typeOnly ? 'src/interfaces/protocol.ts' : 'src/interfaces/dispatch-probe.ts',
    typeOnly ? 'ProtocolFacilities' : 'dispatchProbe', typeOnly), (context, result) => {
  const binding = typeOnly ? 'ProtocolFacilities' : 'dispatchProbe', file = typeOnly ? 'interfaces/protocol.ts' : 'interfaces/dispatch-probe.ts';
  const item = selected(result, context.assertions, probe(owner), binding);
  expectedDecision(context.assertions, item, { importer: probe(owner), owner: ownerId(''), file, binding, target: `src/${file}`,
    status: 'denied', reason: 'required-importer-tag', request: typeOnly ? 'type-only' : 'value', profile,
    tags: typeOnly ? ['dispatch'] : ['browser', 'dispatch'], hops: [ownerId('')], failedTag: 'dispatch' });
  context.assertions.equal('only dispatch fails after established visibility', item.decision.requirements.filter(requirement => !requirement.satisfied)
    .map(requirement => requirement.tag), ['dispatch']);
  denials(context, result, [[probe(owner), binding, 'required-importer-tag']]);
}, async ({ root }) => {
  if (typeOnly) return;
  await put(root, 'src/interfaces/dispatch-probe.ts', 'export function dispatchProbe() { return 1; }\n');
  await append(root, 'module.ramify', '\nexpose-src dispatchProbe from "interfaces/dispatch-probe.ts" tagged [dispatch, browser] to descendants\n');
});
add('I1-12:tag-without-path', 'R', async ({ root }) => {
  await replace(root, description(tasks), 'module tasks', 'module tasks tagged [browser]');
  await replace(root, description(controller), 'from "controller.ts" to parent', 'from "controller.ts" tagged [browser] to parent');
  await importBinding(root, probe(tasks), sourcePath(controller, 'controller.ts'), 'tick');
}, (context, result) => {
  const item = selected(result, context.assertions, probe(tasks), 'tick');
  expectedDecision(context.assertions, item, { importer: probe(tasks), owner: ownerId(controller), file: 'controller.ts', binding: 'tick',
    target: sourcePath(controller, 'controller.ts'), status: 'denied', reason: 'not-visible', profile: ['browser'], tags: ['browser'] });
  context.assertions.equal('matching browser tags do not establish visibility', item.decision.visibility?.visible, false);
  denials(context, result, [[probe(tasks), 'tick', 'not-visible']]);
});

for (const [id, text, binding, request, allowed, hasType] of [
  ['browser-value', 'import { Runtime } from API; new Runtime();', 'Runtime', 'value', false, true],
  ['explicit-type/statement', 'import type { Runtime } from API; let typed: Runtime;', 'Runtime', 'type-only', true, true],
  ['explicit-type/inline', 'import { type Runtime } from API; let typed: Runtime;', 'Runtime', 'type-only', true, true],
  ['unmarked-interface', 'import { Type } from API; let typed: Type;', 'Type', 'type-only', true, true],
  ['unmarked-class', 'import { Runtime } from API; let typed: Runtime;', 'Runtime', 'value', false, true],
  ['merged-runtime', 'import { Merged } from API; let typed: typeof Merged;', 'Merged', 'value', false, false],
] as const) add(`I1-13:${id}`, 'F', ({ root }) => put(root, fixtureProbe, text.replace('API', "'../../provider/src/interfaces/api.js'") + '\n'), (context, result) => {
  const item = selected(result, context.assertions, fixtureProbe, binding);
  expectedDecision(context.assertions, item, { importer: fixtureProbe, owner: 'fixture/provider', file: 'interfaces/api.ts', binding, target: api,
    status: allowed ? 'allowed' : 'denied', reason: allowed ? 'exposed' : 'required-symbol-tag', request, profile: ['browser'], tags: [],
    hops: ['fixture/provider', 'fixture'], ...(allowed ? {} : { failedTag: 'browser' }) });
  context.assertions.equal('compiler binding existence drives requests independently of usage',
    [item.decision.original?.hasValue, item.decision.original?.hasType], [binding !== 'Type', hasType]);
  context.assertions.equal('explicit type syntax and load are retained', [item.access.form, item.access.runtimeLoad, item.access.selections[0].explicitType],
    id === 'explicit-type/statement' ? ['import-type', false, true] : id === 'explicit-type/inline' ? ['inline-type-import', true, true] : ['import', true, false]);
  denials(context, result, allowed ? [] : [[fixtureProbe, binding, 'required-symbol-tag']]);
}, browserConsumer);
add('I1-13:same-owner', 'F', async ({ root }) => {
  await replace(root, providerDescription, 'module provider', 'module provider tagged [browser]');
  await importBinding(root, 'subs/provider/src/local.ts', api, 'Runtime');
}, (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, 'subs/provider/src/local.ts', 'Runtime'), {
    importer: 'subs/provider/src/local.ts', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'Runtime', target: api,
    status: 'allowed', reason: 'same-owner', profile: ['browser'], tags: [] });
  denials(context, result);
});

add('I1-15:derived-profile', 'R', unchanged, (context, result) => {
  for (const [owner, ordinary, tests] of [
    [workspace, ['browser', 'dispatch', 'ui'], ['dispatch', 'testing', 'ui']], [pureUi, ['browser', 'ui'], ['testing', 'ui']],
  ] as const) {
    const module = result.model.modules.find(module => module.id === ownerId(owner))!;
    context.assertions.equal(`${owner}: exact derived model profiles`, module.areas.map(area => [area.kind, area.profile]), [['ordinary', ordinary], ['tests', tests]]);
    for (const [kind, profile] of [['ordinary', ordinary], ['tests', tests]] as const) {
      const observed = result.accesses.filter(access => access.importer.area.owner === ownerId(owner) && access.importer.area.kind === kind);
      context.assertions.ok(`${owner}/${kind}: actual source occurrences`, observed.length > 0);
      context.assertions.equal(`${owner}/${kind}: actual importer profiles`, [...new Set(observed.map(access => JSON.stringify(access.importer.area.profile)))], [JSON.stringify(profile)]);
    }
  }
  denials(context, result);
});
add('I1-15:child-profile', 'R', unchanged, (context, result) => {
  context.assertions.equal('parent and child have independent header profiles', [reviews, runtime].map(owner =>
    result.model.modules.find(module => module.id === ownerId(owner))!.headerTags), [['dispatch'], []]);
  const observed = result.accesses.filter(access => access.importer.area.owner === ownerId(runtime) && access.importer.area.kind === 'ordinary');
  context.assertions.ok('child has actual source accesses', observed.length > 0);
  context.assertions.equal('no inherited parent tags in child occurrences', [...new Set(observed.map(access => JSON.stringify(access.importer.area.profile)))], ['[]']);
  denials(context, result);
});
for (const [id, file, binding, allowed] of [
  ['test-looking-file', 'example.test.ts', 'value', true], ['nested-helpers-tests', 'helpers/tests/probe.ts', 'Runtime', false],
] as const) add(`I1-15:${id}`, 'F', ({ root }) => importBinding(root, `subs/consumer/src/${file}`, api, binding), (context, result) => {
  const importer = `subs/consumer/src/${file}`;
  expectedDecision(context.assertions, selected(result, context.assertions, importer, binding), {
    importer, owner: 'fixture/provider', file: 'interfaces/api.ts', binding, target: api, profile: ['browser'], tags: allowed ? ['browser'] : [],
    status: allowed ? 'allowed' : 'denied', reason: allowed ? 'exposed' : 'required-symbol-tag', hops: ['fixture/provider', 'fixture'],
    ...(allowed ? {} : { failedTag: 'browser' }) });
  context.assertions.equal('inventory classifies by reserved area only', result.inventory.files.find(file => file.path === importer)?.area, 'ordinary');
  denials(context, result, allowed ? [] : [[importer, binding, 'required-symbol-tag']]);
}, browserConsumer);
function privateTest(context: ProjectContext, result: StaticProject, foreign: boolean): void {
  const importer = foreign ? probe(runtime, 'tests/__i1_probe.ts') : catalogTest;
  expectedDecision(context.assertions, selected(result, context.assertions, importer, 'resolvePredecessors'), {
    importer, owner: ownerId(core), file: 'history.ts', binding: 'resolvePredecessors', target: sourcePath(core, 'history.ts'),
    status: foreign ? 'denied' : 'allowed', reason: foreign ? 'not-visible' : 'same-owner', profile: ['testing'], importerArea: 'tests', tags: [] });
  context.assertions.equal('private helper has no exposures', result.model.exposures.filter(exposure => exposure.original.owner === ownerId(core)
    && exposure.original.binding === 'resolvePredecessors'), []);
}
add('I1-15:own-private-test', 'R', unchanged, (context, result) => { privateTest(context, result, false); denials(context, result); });
add('I1-15:foreign-private-test', 'R', ({ root }) => importBinding(root, probe(runtime, 'tests/__i1_probe.ts'), sourcePath(core, 'history.ts'), 'resolvePredecessors'), (context, result) => {
  privateTest(context, result, true);
  denials(context, result, [[probe(runtime, 'tests/__i1_probe.ts'), 'resolvePredecessors', 'not-visible']]);
});

function foreignFixture(context: ProjectContext, result: StaticProject, allowed: boolean): void {
  expectedDecision(context.assertions, selected(result, context.assertions, runtimeTest, 'makeCatalogFixture'), {
    importer: runtimeTest, owner: ownerId(core), file: 'tests/fixture.ts', binding: 'makeCatalogFixture', target: fixtureSource,
    status: allowed ? 'allowed' : 'denied', reason: allowed ? 'exposed' : 'not-visible', profile: ['testing'], tags: ['testing'],
    importerArea: 'tests', originalArea: 'tests', ...(allowed ? { hops: [ownerId(core), ownerId(catalog), ownerId(workspace)] } : {}) });
  expectedDecision(context.assertions, selected(result, context.assertions, catalogTest, 'makeCatalogFixture'), {
    importer: catalogTest, owner: ownerId(core), file: 'tests/fixture.ts', binding: 'makeCatalogFixture', target: fixtureSource,
    status: 'allowed', reason: 'same-owner', profile: ['testing'], tags: ['testing'], importerArea: 'tests', originalArea: 'tests' });
}
add('I1-16:foreign-fixture', 'R', unchanged, (context, result) => { foreignFixture(context, result, true); denials(context, result); });
add('I1-16:remove-fixture-hop', 'R', ({ root }) => replace(root, description(workspace), w3, ''), (context, result) => {
  foreignFixture(context, result, false);
  denials(context, result, [[runtimeTest, 'makeCatalogFixture', 'not-visible']]);
});
for (const kind of ['value', 'type', 'side-effect'] as const) for (const [variant, owner] of [['same-owner', core], ['foreign-owner', runtime]] as const)
  add(`I1-16:production-${kind}/${variant}`, 'R', ({ root }) => kind === 'side-effect'
    ? put(root, probe(owner), `import '${specifier(probe(owner), fixtureSource)}';\n`)
    : importBinding(root, probe(owner), fixtureSource, 'makeCatalogFixture', kind === 'type'), (context, result) => {
    const importer = probe(owner);
    if (kind === 'side-effect') {
      const items = result.decisions.filter(item => item.access.importer.file === importer);
      context.assertions.equal('one symbol-free occurrence', items.length, 1);
      const item = items[0]!;
      context.assertions.equal('known target without invented binding', [item.decision.question.importer.area.kind, item.decision.question.importer.area.profile,
        item.decision.question.target.file, item.decision.question.selection, item.decision.original, item.access.selections, item.access.runtimeLoad],
      ['ordinary', [], fixtureSource, null, null, [], true]);
      originDenied(context, item, [fixtureSource]);
    } else {
      const item = selected(result, context.assertions, importer, 'makeCatalogFixture');
      expectedDecision(context.assertions, item, { importer, owner: ownerId(core), file: 'tests/fixture.ts', binding: 'makeCatalogFixture', target: fixtureSource,
        status: 'denied', reason: 'testing-origin', profile: [], tags: ['testing'], originalArea: 'tests', request: kind === 'type' ? 'type-only' : 'value' });
      originDenied(context, item, [fixtureSource]);
    }
    denials(context, result, [[importer, kind === 'side-effect' ? null : 'makeCatalogFixture', 'testing-origin']]);
  });
add('I1-16:testing-barrel', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/tests/barrel.ts', "export { value } from '../interfaces/api.js';\n");
  await importBinding(root, 'subs/provider/src/probe.ts', 'subs/provider/src/tests/barrel.ts', 'value');
}, (context, result) => {
  const importer = 'subs/provider/src/probe.ts', barrel = 'subs/provider/src/tests/barrel.ts';
  const item = selected(result, context.assertions, importer, 'value');
  expectedDecision(context.assertions, item, { importer, owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value', target: barrel,
    status: 'denied', reason: 'testing-origin', profile: [], tags: ['browser'] });
  originDenied(context, item, [barrel]);
  context.assertions.equal('testing barrel keeps production original and origin path', item.access.selections[0].forwarding.map(origin => [origin.file, origin.area.kind]), [[barrel, 'tests']]);
  expectedDecision(context.assertions, selected(result, context.assertions, barrel, 'value'), { importer: barrel, owner: 'fixture/provider', file: 'interfaces/api.ts',
    binding: 'value', target: api, status: 'allowed', reason: 'same-owner', profile: ['testing'], tags: ['browser'], importerArea: 'tests' });
  denials(context, result, [[importer, 'value', 'testing-origin']]);
});
add('I1-16:production-forwarding-test', 'R', async ({ root }) => {
  await put(root, sourcePath(core, 'barrel.ts'), "export { makeCatalogFixture } from './tests/fixture.js';\n");
  await importBinding(root, probe(core), sourcePath(core, 'barrel.ts'), 'makeCatalogFixture');
}, (context, result) => {
  for (const importer of [probe(core), sourcePath(core, 'barrel.ts')]) {
    const item = selected(result, context.assertions, importer, 'makeCatalogFixture');
    expectedDecision(context.assertions, item, { importer, owner: ownerId(core), file: 'tests/fixture.ts', binding: 'makeCatalogFixture',
      target: importer === probe(core) ? sourcePath(core, 'barrel.ts') : fixtureSource, status: 'denied', reason: 'testing-origin', profile: [], tags: ['testing'], originalArea: 'tests' });
    originDenied(context, item, [fixtureSource]);
  }
  denials(context, result, [[probe(core), 'makeCatalogFixture', 'testing-origin'], [sourcePath(core, 'barrel.ts'), 'makeCatalogFixture', 'testing-origin']]);
});

add('I1-17:production-tagged-testing', 'F', async ({ root }) => {
  await replace(root, providerDescription, 'expose-src Type, Runtime, Merged, default', 'expose-src Type, Merged, default');
  await append(root, providerDescription, 'expose-src Runtime from "interfaces/api.ts" tagged [testing] to parent\n');
  await importBinding(root, 'subs/provider/src/local.ts', api, 'Runtime');
  await importBinding(root, fixtureProbe, api, 'Runtime');
}, (context, result) => {
  for (const own of [false, true]) {
    const importer = own ? 'subs/provider/src/local.ts' : fixtureProbe;
    expectedDecision(context.assertions, selected(result, context.assertions, importer, 'Runtime'), {
      importer, owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'Runtime', target: api, profile: [], tags: ['testing'],
      status: own ? 'allowed' : 'denied', reason: own ? 'same-owner' : 'required-importer-tag',
      ...(own ? {} : { hops: ['fixture/provider', 'fixture'], failedTag: 'testing' }) });
  }
  denials(context, result, [[fixtureProbe, 'Runtime', 'required-importer-tag']]);
});
add('I1-17:separate-testing-module', 'R', ({ root }) => importBinding(root, probe('integration-tests'), 'src/assembly.ts', 'assembleSystem'), (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, sourcePath('integration-tests', 'support/world.ts'), 'createTestSystem'), {
    importer: sourcePath('integration-tests', 'support/world.ts'), owner: ownerId(''), file: 'tests/setup.ts', binding: 'createTestSystem', target: 'src/tests/setup.ts',
    status: 'allowed', reason: 'exposed', profile: ['dispatch', 'testing'], tags: ['dispatch', 'testing'], originalArea: 'tests', hops: [ownerId('')] });
  expectedDecision(context.assertions, selected(result, context.assertions, probe('integration-tests'), 'assembleSystem'), {
    importer: probe('integration-tests'), owner: ownerId(''), file: 'assembly.ts', binding: 'assembleSystem', target: 'src/assembly.ts',
    status: 'denied', reason: 'not-visible', profile: ['dispatch', 'testing'], tags: ['dispatch'] });
  denials(context, result, [[probe('integration-tests'), 'assembleSystem', 'not-visible']]);
});
const testingBrowser: NonNullable<ProjectHandler['prepare']> = ({ root }) =>
  put(root, consumerDescription, 'ramify 1\nmodule consumer tagged [testing, browser]\n');
for (const promised of [false, true]) add(`I1-17:testing-module-browser/${promised ? 'promised' : 'unpromised'}`, 'F', async ({ root }) => {
  await importBinding(root, fixtureProbe, api, 'Runtime');
  if (promised) {
    await replace(root, providerDescription, 'expose-src Type, Runtime, Merged, default', 'expose-src Type, Merged, default');
    await append(root, providerDescription, 'expose-src Runtime from "interfaces/api.ts" tagged [browser] to parent\n');
  }
}, (context, result) => {
  expectedDecision(context.assertions, selected(result, context.assertions, fixtureProbe, 'Runtime'), {
    importer: fixtureProbe, owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'Runtime', target: api, profile: ['browser', 'testing'], tags: promised ? ['browser'] : [],
    status: promised ? 'allowed' : 'denied', reason: promised ? 'exposed' : 'required-symbol-tag', hops: ['fixture/provider', 'fixture'],
    ...(promised ? {} : { failedTag: 'browser' }) });
  denials(context, result, promised ? [] : [[fixtureProbe, 'Runtime', 'required-symbol-tag']]);
}, testingBrowser);
add('I1-17:nested-tests', 'F', async ({ root }) => {
  await put(root, 'subs/consumer/src/tests/probe.ts', "import { Runtime } from '../../../provider/src/interfaces/api.js';\nimport type { Runtime as RuntimeType } from '../../../provider/src/interfaces/api.js';\n");
}, (context, result) => {
  const importer = 'subs/consumer/src/tests/probe.ts';
  const items = result.decisions.filter(item => item.access.importer.file === importer);
  context.assertions.equal('separate value and type requests both allowed with the derived testing profile', items.map(item =>
    [item.decision.question.selection?.request, item.decision.status, item.decision.reason, item.access.importer.area.kind, item.access.importer.area.profile,
      item.decision.original?.id, item.decision.original?.tags]), ['value', 'type-only'].map(request =>
    [request, 'allowed', 'exposed', 'tests', ['testing'], { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'Runtime' }, []]));
  context.assertions.ok('ordinary testing-module accesses retain browser', result.accesses.some(access => access.importer.file === fixtureProbe
    && JSON.stringify(access.importer.area.profile) === JSON.stringify(['browser', 'testing'])));
  denials(context, result);
}, testingBrowser);

add('I1-23:testing-style', 'R', async ({ root }) => {
  const css = await readFile(join(root, sourcePath(catalogUi, 'catalog-card.module.css')), 'utf8');
  await put(root, sourcePath(catalogUi, 'tests/theme.module.css'), css);
  await put(root, probe(catalogUi), "import styles from './tests/theme.module.css'; void styles;\nimport './tests/theme.module.css';\n");
}, (context, result) => {
  const importer = probe(catalogUi), target = sourcePath(catalogUi, 'tests/theme.module.css');
  const item = selected(result, context.assertions, importer, 'default');
  expectedDecision(context.assertions, item, { importer, owner: ownerId(catalogUi), file: 'tests/theme.module.css', binding: 'default', target,
    status: 'denied', reason: 'testing-origin', profile: ['browser', 'ui'], tags: ['testing', 'ui'], originalArea: 'tests', originalKind: 'resource' });
  originDenied(context, item, [target]);
  const load = result.decisions.find(item => item.access.importer.file === importer && !item.decision.original)!;
  context.assertions.equal('stylesheet side effect needs no invented export', [load.access.form, load.access.selections, load.decision.question.target.file], ['side-effect-import', [], target]);
  originDenied(context, load, [target]);
  denials(context, result, [[importer, 'default', 'testing-origin'], [importer, null, 'testing-origin']]);
});

export const tagsOriginHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
