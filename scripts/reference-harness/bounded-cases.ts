import { readFile, rename, rm, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { sourcePath, ownerId } from './linking-expectations.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler, ProjectContext } from './runner.js';
import { compilerValid, expectedDecision, selected, staticProject } from './static-expectations.js';
import type { StaticProject } from './static-expectations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const probe = 'subs/consumer/src/probe.ts', api = 'subs/provider/src/interfaces/api.ts';
const apiSpecifier = "'../../provider/src/interfaces/api.js'";
const handlers = new Map<string, InstanceHandler>();
type ProjectHandler = Extract<InstanceHandler, { kind: 'project' }>;
const unchanged = async (): Promise<void> => {};
async function append(root: string, path: string, text: string): Promise<void> {
  await put(root, path, await readFile(join(root, path), 'utf8') + text);
}
async function configure(root: string, options: Record<string, unknown>): Promise<void> {
  const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  Object.assign(config.compilerOptions, options);
  await put(root, 'tsconfig.json', JSON.stringify(config));
}
async function boundedProject(root: string): Promise<StaticProject> {
  const result = await staticProject(root);
  return { ...result, decisions: result.allDecisions };
}
function complete(context: ProjectContext, result: StaticProject): void {
  context.assertions.equal('no source coverage gaps', result.coverage, []);
  context.assertions.equal('every application occurrence checked', result.results.filter(item => !['checked', 'external'].includes(item.outcome)), []);
  context.assertions.equal('every selection resolved', result.accesses.filter(access => access.target.kind === 'application')
    .flatMap(access => access.selections).filter(selection => selection.status !== 'resolved'), []);
}
function denials(context: ProjectContext, result: StaticProject, expected: readonly (readonly [string, string | null, string])[] = []): void {
  context.assertions.equal('exact independent denial set', result.decisions.filter(item => item.decision.status === 'denied')
    .map(item => [item.access.importer.file, item.decision.original?.id.binding ?? null, item.decision.reason]).sort(), [...expected].sort());
}
function add(id: string, fixture: 'R' | 'F' | 'J', mutate: ProjectHandler['mutate'],
  check: (context: ProjectContext, result: StaticProject) => void, options: {
    prepare?: NonNullable<ProjectHandler['prepare']>; partial?: boolean;
  } = {}): void {
  handlers.set(id, { kind: 'project',
    fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot } : { kind: 'create', create: createProjectFixture },
    prepare: async context => {
      if (fixture === 'R') await symlink(join(referenceRoot, 'node_modules'), join(context.root, 'node_modules'));
      if (fixture === 'J') await configure(context.root, { allowJs: true, checkJs: true, noEmit: true });
      await options.prepare?.(context);
    },
    baseline: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await boundedProject(context.root);
      complete(context, result); denials(context, result);
      context.assertions.equal('baseline declared owners', result.inventory.modules.length, fixture === 'R' ? 15 : 3);
      context.assertions.ok('baseline has real application decisions', result.decisions.length > 0);
      context.assertions.equal('baseline diagnostics', result.diagnostics, []);
    }, mutate,
    run: async context => {
      await compilerValid(context.root, context.assertions);
      const result = await boundedProject(context.root);
      if (!options.partial) complete(context, result);
      // Keep definite findings independently observable through analysis mapping.
      for (const { access, decision } of result.decisions) {
        const found = result.diagnostics.filter(issue => issue.accessId === access.id);
        context.assertions.equal(`${access.id}: located diagnostic`, found.map(issue => [issue.code, issue.location, issue.importer, issue.original]),
          decision.status === 'denied' ? [[decision.reason, decision.question.location, decision.question.importer.area, decision.original?.id ?? null]] : []);
      }
      check(context, result);
    },
  });
}
function source(text: string): ProjectHandler['mutate'] {
  return ({ root }) => put(root, probe, text.replaceAll('API', apiSpecifier) + '\n');
}
function one(context: ProjectContext, result: StaticProject, binding: string, form: string, options: {
  request?: 'type-only' | 'value'; profile?: readonly string[]; runtime?: boolean; written?: string; importer?: string;
} = {}): void {
  const importer = options.importer ?? probe;
  expectedDecision(context.assertions, selected(result, context.assertions, importer, binding), {
    importer, owner: 'fixture/provider', file: 'interfaces/api.ts', binding, target: api,
    status: 'allowed', reason: 'exposed', tags: binding === 'value' ? ['browser'] : [], profile: options.profile ?? [],
    hops: ['fixture/provider', 'fixture'], request: options.request ?? 'value',
  });
  const accesses = result.accesses.filter(access => access.importer.file === importer);
  context.assertions.equal('exactly the explicit original selected', accesses.flatMap(access => access.selections.map(selection => selection.original?.binding)), [binding]);
  context.assertions.equal('selected source form and runtime load', [accesses[0].selectionForm, accesses[0].runtimeLoad], [form, options.runtime ?? true]);
  if (options.written) context.assertions.equal('written syntax retained', accesses[0].form, options.written);
  denials(context, result);
}
const browser: NonNullable<ProjectHandler['prepare']> = ({ root }) => put(root, 'subs/consumer/module.ramify', 'ramify 1\nmodule consumer tagged [browser]\n');

for (const [id, text, selectionForm] of [
  ['namespace-members', 'void ns.value;', 'direct-member'],
  ['literal-key/single-quote', "void ns['value'];", 'literal-key'],
  ['literal-key/double-quote', 'void ns["value"];', 'literal-key'],
  ['destructure/direct', 'const { value } = ns;', 'destructure'],
  ['destructure/renamed', 'const { value: local } = ns;', 'destructure'],
] as const) add(`I1-19:${id}`, 'F', source(`import * as ns from API; ${text}`), (context, result) => {
  one(context, result, 'value', selectionForm, { written: 'namespace-import' });
  if (id.startsWith('destructure')) context.assertions.equal('destructured local spelling', result.accesses[0].selections[0].localName,
    id.endsWith('renamed') ? 'local' : 'value');
});
for (const typeOnly of [false, true]) add(`I1-19:qualified-type/${typeOnly ? 'type' : 'ordinary'}-namespace`, 'F',
  source(`import ${typeOnly ? 'type ' : ''}* as ns from API; type Local = ns.Type;`), (context, result) => {
    one(context, result, 'Type', 'qualified-type', { request: 'type-only', runtime: !typeOnly,
      written: typeOnly ? 'type-namespace-import' : 'namespace-import' });
    context.assertions.equal('explicit namespace type flag', result.accesses[0].selections[0].explicitType, typeOnly);
  });
add('I1-19:private-growth', 'F', ({ root }) => append(root, api, '\nexport const privateGrowth = 3;\n'), (context, result) => {
  one(context, result, 'value', 'direct-member');
  context.assertions.ok('new private original remains in complete catalog', result.catalog.originals.some(original => original.id.binding === 'privateGrowth'));
  context.assertions.ok('growth creates no exposure', !result.model.exposures.some(exposure => exposure.original.binding === 'privateGrowth'));
}, { prepare: ({ root }) => put(root, probe, `import * as ns from ${apiSpecifier}; void ns.value;`) });
for (const [id, body, code] of [
  ['unknown-key', 'declare const key: keyof typeof ns; void ns[key];', 'unknown-key'],
  ['escape', 'declare function consume(value: unknown): void; consume(ns);', 'namespace-escape'],
  ['known-denial-plus-escape', 'void ns.privateValue; declare function consume(value: unknown): void; consume(ns);', 'namespace-escape'],
] as const) add(`I1-19:${id}`, 'F', source(`import * as ns from API; ${body}`), (context, result) => {
  context.assertions.ok('unknown portion has explicit located coverage', result.coverage.some(issue => issue.code === code
    && issue.location.file === probe && issue.location.line > 0 && issue.location.column > 0));
  context.assertions.equal('known selections never widened', result.accesses.flatMap(access => access.selections.map(selection => selection.original?.binding)),
    id === 'known-denial-plus-escape' ? ['privateValue'] : []);
  context.assertions.ok('uncovered occurrence never reports checked success', result.results.filter(item => item.coverage.length).every(item =>
    item.outcome === 'mixed' || item.outcome === 'unverifiable'));
  denials(context, result, id === 'known-denial-plus-escape' ? [[probe, 'privateValue', 'not-visible']] : []);
}, { partial: true });

const starMembers = ['Merged', 'PrivateType', 'Runtime', 'Type', 'privateValue', 'value'];
function star(context: ProjectContext, result: StaticProject, typeOnly: boolean, namespace: boolean): void {
  const expected = [...starMembers, ...(namespace ? ['defaultValue'] : [])].sort();
  const items = result.decisions.filter(item => item.access.importer.file === probe);
  context.assertions.equal('whole source selection has exact default membership', items.map(item => item.decision.original?.id.binding).sort(), expected);
  for (const item of items) {
    const binding = item.decision.original!.id.binding;
    const denied = ['PrivateType', 'privateValue'].includes(binding);
    expectedDecision(context.assertions, item, { importer: probe, owner: 'fixture/provider', file: 'interfaces/api.ts', binding, target: api,
      status: denied ? 'denied' : 'allowed', reason: denied ? 'not-visible' : 'exposed', tags: binding === 'value' ? ['browser'] : [], profile: [],
      request: typeOnly || ['Type', 'PrivateType'].includes(binding) ? 'type-only' : 'value', ...(denied ? {} : { hops: ['fixture/provider', 'fixture'] }) });
    context.assertions.equal(`${binding}: whole written form and load`, [item.access.form, item.access.selectionForm, item.access.runtimeLoad],
      [namespace ? typeOnly ? 'type-namespace-export' : 'namespace-export' : typeOnly ? 'type-star-export' : 'star-export',
        namespace ? 'whole-namespace' : 'whole-star', !typeOnly]);
  }
  denials(context, result, [[probe, 'PrivateType', 'not-visible'], [probe, 'privateValue', 'not-visible']]);
}
for (const [id, typeOnly, namespace] of [
  ['source-star', false, false], ['type-star', true, false], ['namespace-export', false, true], ['type-namespace-export', true, true],
] as const) add(`I1-20:${id}`, 'F', source(`export ${typeOnly ? 'type ' : ''}*${namespace ? ' as ns' : ''} from API;`),
(context, result) => star(context, result, typeOnly, namespace));
add('I1-20:downstream-selection', 'F', async context => {
  await source('export * from API;')(context);
  await put(context.root, 'subs/consumer/src/use.ts', "import { value } from './probe.js'; void value;\n");
}, (context, result) => {
  star(context, result, false, false);
  const downstream = selected(result, context.assertions, 'subs/consumer/src/use.ts', 'value');
  context.assertions.equal('downstream selection retains provider original and forwarding origin',
    [downstream.decision.status, downstream.decision.original?.id, downstream.access.selections[0].forwarding.map(origin => origin.file)],
    ['allowed', { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value' }, [probe]]);
});
add('I1-20:no-declaration', 'F', ({ root }) => put(root, 'src/use.ts', "import { value } from '../subs/consumer/src/probe.js'; void value;\n"), (context, result) => {
  context.assertions.equal('source forwarding does not create exposure', result.model.exposures.filter(exposure => exposure.module === 'fixture/consumer'), []);
  const root = selected(result, context.assertions, 'src/use.ts', 'value');
  expectedDecision(context.assertions, root, { importer: 'src/use.ts', owner: 'fixture/consumer/provider', file: 'interfaces/api.ts', binding: 'value',
    target: probe, status: 'denied', reason: 'not-visible', tags: ['browser'], profile: [] });
  context.assertions.equal('forwarder may use its child original', selected(result, context.assertions, probe, 'value').decision.status, 'allowed');
  denials(context, result, [['src/use.ts', 'value', 'not-visible']]);
}, { prepare: async ({ root }) => {
  await mkdir(join(root, 'subs/consumer/subs'), { recursive: true });
  await rename(join(root, 'subs/provider'), join(root, 'subs/consumer/subs/provider'));
  await put(root, 'module.ramify', 'ramify 1\nmodule fixture\n');
  await put(root, probe, "export { value } from '../subs/provider/src/interfaces/api.js';\n");
} });

add('I1-21:reference-lazy', 'R', unchanged, (context, result) => {
  const importer = sourcePath('workspace', 'app.tsx');
  const item = selected(result, context.assertions, importer, 'ReviewPanel');
  expectedDecision(context.assertions, item, { importer, owner: ownerId('workspace/reviews/ui'), file: 'review-panel.tsx', binding: 'ReviewPanel',
    target: sourcePath('workspace/reviews/ui', 'review-panel.tsx'), status: 'allowed', reason: 'exposed', profile: ['browser', 'dispatch', 'ui'],
    tags: ['browser', 'dispatch', 'ui'], hops: [ownerId('workspace/reviews/ui'), ownerId('workspace/reviews')] });
  context.assertions.equal('authored lazy callback selects ReviewPanel only', result.accesses.filter(access => access.form === 'dynamic-import')
    .map(access => [access.selectionForm, access.selections.map(selection => selection.original?.binding)]), [['then-member', ['ReviewPanel']]]);
  denials(context, result);
});
for (const [id, text, form] of [
  ['await-member/direct', 'void (await import(API)).value;', 'direct-member'],
  ['await-member/namespace-dot', 'const ns = await import(API); void ns.value;', 'direct-member'],
  ['await-member/namespace-key', "const ns = await import(API); void ns['value'];", 'literal-key'],
  ['await-destructure', 'const { value: local } = await import(API); void local;', 'destructure'],
  ['then-member/dot', 'import(API).then(ns => ns.value);', 'then-member'],
  ['then-member/key', "import(API).then(ns => ns['value']);", 'then-member'],
  ['then-destructure', 'import(API).then(({ value: local }) => local);', 'then-destructure'],
] as const) add(`I1-21:${id}`, 'F', source(text), (context, result) => one(context, result, 'value', form, { written: 'dynamic-import' }));
add('I1-21:import-type/typescript', 'F', source('type Local = import(API).Type;'), (context, result) =>
  one(context, result, 'Type', 'qualified-type', { request: 'type-only', runtime: false, written: 'import-type-query' }));
add('I1-21:import-type/jsdoc-javascript', 'J', async ({ root }) => {
  await rm(join(root, probe));
  await put(root, 'subs/consumer/src/probe.js', `/** @typedef {import(${apiSpecifier}).Type} Local */\nexport {};\n`);
}, (context, result) => {
  one(context, result, 'Type', 'qualified-type', { request: 'type-only', runtime: false, written: 'jsdoc-import-type', importer: 'subs/consumer/src/probe.js' });
  context.assertions.ok('JavaScript fixture is inventoried', result.inventory.files.some(file => file.path === 'subs/consumer/src/probe.js'));
});
add('I1-21:typeof-import-member', 'F', source('type Local = typeof import(API).Runtime;'), (context, result) =>
  one(context, result, 'Runtime', 'qualified-type', { request: 'type-only', runtime: false, written: 'import-type-query', profile: ['browser'] }), { prepare: browser });
add('I1-21:typeof-import-namespace', 'F', source('type Namespace = typeof import(API);'), (context, result) => {
  const items = result.decisions.filter(item => item.access.importer.file === probe);
  context.assertions.equal('typeof namespace includes runtime members only including default', items.map(item => item.decision.original?.id.binding).sort(),
    ['Merged', 'Runtime', 'defaultValue', 'privateValue', 'value']);
  context.assertions.ok('every runtime member requests its type without a load', items.every(item => item.decision.question.selection?.request === 'type-only'
    && !item.access.runtimeLoad && item.access.selections[0].explicitType));
  context.assertions.ok('browser promises are not required for namespace types', items.every(item => item.decision.reason !== 'required-symbol-tag'));
  denials(context, result, [[probe, 'privateValue', 'not-visible']]);
}, { prepare: browser });
for (const [variant, text] of [
  ['variable', 'declare const target: string; void import(target);'],
  ['template', 'declare const name: string; void import(`./${name}.js`);'],
] as const) add(`I1-21:nonliteral-target/${variant}`, 'F', source(text), (context, result) => {
  context.assertions.equal('nonliteral import stays unresolved without guessed selections', result.accesses.map(access =>
    [access.target.kind, access.specifier, access.selections]), [['unresolved', null, []]]);
  context.assertions.equal('located nonliteral coverage', result.coverage.map(issue => [issue.code, issue.location.file]), [['nonliteral-target', probe]]);
  context.assertions.equal('no allowed or external interpretation of unknown target', result.results.map(item => item.outcome), ['unverifiable']);
  denials(context, result);
}, { partial: true });

add('I1-22:hook-side-effect', 'R', unchanged, (context, result) => {
  const importer = sourcePath('integration-tests', 'steps/collection-review.steps.ts');
  const hook = result.decisions.find(item => item.access.importer.file === importer && item.access.specifier === '../support/hooks.js')!;
  context.assertions.ok('authored hook occurrence executed', hook);
  context.assertions.equal('testing hook is an allowed symbol-free load', [hook.access.form, hook.access.runtimeLoad, hook.access.selections,
    hook.decision.status, hook.decision.reason, hook.decision.question.target.file, hook.access.importer.area.profile],
    ['side-effect-import', true, [], 'allowed', 'symbol-free', sourcePath('integration-tests', 'support/hooks.ts'), ['dispatch', 'testing']]);
  denials(context, result);
});
for (const [id, text, form] of [
  ['empty-import', 'import {} from API;', 'empty-import'], ['empty-export', 'export {} from API;', 'empty-export'],
  ['discarded-lazy', 'await import(API);', 'discarded-import'],
] as const) add(`I1-22:${id}`, 'F', source(text), (context, result) => {
  context.assertions.equal('ordinary symbol-free target checked without requesting private exports', result.decisions.map(item =>
    [item.access.form, item.access.selectionForm, item.access.selections, item.access.runtimeLoad, item.decision.status, item.decision.reason, item.decision.question.target.file]),
  [[form, 'none', [], true, 'allowed', 'symbol-free', api]]);
  denials(context, result);
});
add('I1-22:inline-type-statement', 'F', source('import { type Type } from API;'), (context, result) =>
  one(context, result, 'Type', 'named', { request: 'type-only', written: 'inline-type-import', profile: ['browser'] }), {
  prepare: async context => { await browser(context); await configure(context.root, { verbatimModuleSyntax: true }); },
});
for (const sameOwner of [true, false]) for (const [variant, syntax, form] of [
  ['side-effect', 'import TARGET;', 'side-effect-import'], ['empty-import', 'import {} from TARGET;', 'empty-import'],
  ['empty-export', 'export {} from TARGET;', 'empty-export'], ['discarded-lazy', 'await import(TARGET);', 'discarded-import'],
] as const) add(`I1-22:testing-target/${sameOwner ? 'same-owner' : 'foreign'}-${variant}`, 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/tests/hook.ts', 'export {};\n');
  await put(root, sameOwner ? 'subs/provider/src/load.ts' : probe,
    syntax.replace('TARGET', sameOwner ? "'./tests/hook.js'" : "'../../provider/src/tests/hook.js'") + '\n');
}, (context, result) => {
  const importer = sameOwner ? 'subs/provider/src/load.ts' : probe;
  const item = result.decisions.find(item => item.access.importer.file === importer)!;
  context.assertions.equal('testing source origin checked before owner exemption with no dummy symbol',
    [item.access.form, item.access.selections, item.decision.reason, item.decision.original, item.decision.visibility, item.decision.requirements,
      item.decision.blockingOrigins.map(origin => [origin.file, origin.area.owner, origin.area.kind, origin.area.profile])],
    [form, [], 'testing-origin', null, null, [], [['subs/provider/src/tests/hook.ts', 'fixture/provider', 'tests', ['testing']]]]);
  denials(context, result, [[importer, null, 'testing-origin']]);
});
export const boundedHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
