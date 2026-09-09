import { readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { validateProject } from '../../subs/analysis/src/validation-entry.js';
import type { AnalysisCode } from '../../subs/analysis/src/validation-entry.js';
import { originalKey } from '../../subs/analysis/subs/model/src/index.js';
import { createProjectFixture, projectFixtureFiles, put } from './fixtures/plan1/project.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler, ProjectContext } from './runner.js';
import { assertReference, ownerId, referenceContracts, sourcePath, validated, validationInputs, vocabulary } from './linking-expectations.js';
import type { ValidProject } from './linking-expectations.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');
const cOwner = 'workspace/contracts';
const cDescription = 'subs/workspace/subs/contracts/module.ramify';
const vocabularyFile = sourcePath(cOwner, 'interfaces/vocabulary.ts');
const pDescription = 'subs/provider/module.ramify';
const apiFile = 'subs/provider/src/interfaces/api.ts';
const c1 = 'expose-src * from "interfaces/vocabulary.ts" tagged [browser] to parent';
const pHeader = 'ramify 1\nmodule provider\n';
const append = async (root: string, path: string, content: string): Promise<void> => put(root, path, await readFile(join(root, path), 'utf8') + content + '\n');
const replace = async (root: string, path: string, old: string, content: string): Promise<void> => {
  const text = await readFile(join(root, path), 'utf8');
  if (!text.includes(old)) throw new Error(`Missing mutation anchor ${old} in ${path}`);
  await put(root, path, text.replace(old, content));
};
const replaceC1 = (root: string, statement: string): Promise<void> => replace(root, cDescription, c1, statement);
const pWildcard = (root: string, path: string, header = pHeader, tags = ''): Promise<void> =>
  put(root, pDescription, `${header}expose-src * from "${path}"${tags} to parent\n`);

async function invalid(context: ProjectContext, code: AnalysisCode, file: string): Promise<void> {
  const result = await validateProject(validationInputs(context.root));
  const a = context.assertions;
  a.equal('invalid description result', result.status, 'invalid');
  if (result.status !== 'invalid') throw new Error(JSON.stringify(result));
  const issue = result.diagnostics.find(issue => issue.code === code && issue.location?.file === file);
  a.ok(`located ${code} at ${file}: ${JSON.stringify(result.diagnostics)}`, issue);
  a.ok('no linked model in invalid branch', !('linked' in result) && !('catalog' in result));
  a.ok('diagnostic has useful line and column', issue!.location!.line > 1 && issue!.location!.column > 0);
  if (code === 'conflicting-tags' || code === 'name-collision') a.ok('both conflicting declarations retained', issue!.related.length > 0);
  if (code === 'foreign-original') a.ok('foreign owner identified', issue!.message.includes('fixture/provider'));
}
function selection(result: ValidProject, module: string, name: string) {
  return result.linked.selections.filter(item => item.module === module).flatMap(item => item.pairs).filter(pair => pair.name === name);
}
function checkVocabulary(context: ProjectContext, result: ValidProject, names: readonly string[]): void {
  const expected = [...names].sort();
  for (const owner of [ownerId(cOwner), ownerId('workspace')]) {
    const expanded = result.linked.selections.find(item => item.module === owner && item.selector === 'wildcard')!;
    context.assertions.equal(`${owner}: complete current vocabulary`, expanded.pairs.map(pair => pair.name), expected);
    context.assertions.ok(`${owner}: every selected binding grounded and effective`, expanded.pairs.every(pair =>
      pair.effective && pair.original.owner === ownerId(cOwner) && pair.original.file === 'interfaces/vocabulary.ts'));
    for (const pair of expanded.pairs) {
      const original = result.linked.modelInput.originals.find(item => originalKey(item.id) === originalKey(pair.original))!;
      context.assertions.equal(`${owner}/${pair.name}: browser assignment`, original.tags, ['browser']);
    }
  }
}
function privateOriginal(context: ProjectContext, result: ValidProject, owner: string, binding: string): void {
  const original = result.linked.modelInput.originals.find(item => item.id.owner === owner && item.id.binding === binding);
  context.assertions.ok(`${binding}: retained original`, original);
  context.assertions.ok(`${binding}: unexposed`, !result.linked.modelInput.exposures.some(exposure => originalKey(exposure.original) === originalKey(original!.id)));
}
function fixtureContract(context: ProjectContext, result: ValidProject): void {
  context.assertions.equal('fixture declared owners', result.input.inventory.modules.map(module => module.id), ['fixture', 'fixture/consumer', 'fixture/provider']);
  for (const module of ['fixture', 'fixture/provider']) {
    const names = [...new Set(result.linked.selections.filter(item => item.module === module).flatMap(item => item.pairs.map(pair => pair.name)))].sort();
    context.assertions.equal(`${module}: only authored named bindings`, names, ['Merged', 'Runtime', 'Type', 'default', 'value']);
  }
  privateOriginal(context, result, 'fixture/provider', 'privateValue');
  privateOriginal(context, result, 'fixture/provider', 'PrivateType');
}

const handlers = new Map<string, InstanceHandler>();
function add(id: string, fixture: 'R' | 'F', mutate: Extract<InstanceHandler, { kind: 'project' }>['mutate'],
  run: Extract<InstanceHandler, { kind: 'project' }>['run']): void {
  handlers.set(id, { kind: 'project', fixture: fixture === 'R' ? { kind: 'copy', sourceRoot: referenceRoot } : { kind: 'create', create: createProjectFixture },
    ...(fixture === 'R' ? { prepare: async ({ root }: { root: string }) => symlink(join(referenceRoot, 'node_modules'), join(root, 'node_modules')) } : {}),
    baseline: async context => {
      const result = await validated(context.root, context.assertions);
      if (fixture === 'R') assertReference(result, context.assertions); else fixtureContract(context, result);
    }, mutate, run });
}
const invalidReference: readonly [string, string, AnalysisCode][] = [
  ['missing-file', c1.replace('vocabulary.ts', 'missing.ts'), 'missing-file'],
  ['missing-export', c1.replace(' * ', ' AbsentVocabulary '), 'missing-export'],
  ['name-collision', c1.replace(' * ', ' RecordId as Shared, Revision as Shared '), 'name-collision'],
];
for (const [id, statement, code] of invalidReference) add(`I1-05:${id}`, 'R', ({ root }) => replaceC1(root, statement),
  context => invalid(context, code, cDescription));
add('I1-05:conflicting-tags', 'R', ({ root }) => append(root, cDescription, 'expose-src RecordId from "interfaces/vocabulary.ts" tagged [] to parent'),
  context => invalid(context, 'conflicting-tags', cDescription));
add('I1-05:same-original-repeat', 'R', ({ root }) => append(root, cDescription, 'expose-src RecordId from "interfaces/vocabulary.ts" tagged [browser] to parent'),
  async context => {
    const result = await validated(context.root, context.assertions);
    const exposures = result.linked.modelInput.exposures.filter(exposure => exposure.module === ownerId(cOwner) && exposure.original.binding === 'RecordId');
    context.assertions.equal('one merged canonical exposure', exposures.length, 1);
    context.assertions.equal('both declaration witnesses retained', exposures[0]!.evidence.length, 2);
    checkVocabulary(context, result, vocabulary);
  });
for (const order of ['original', 'reversed', 'rotated']) add(`I1-05:statement-permutation/${order}`, 'R', async ({ root }) => {
  for (const owner of new Set(referenceContracts.map(item => item[1]))) {
    const path = sourcePath(owner, '').replace(/src\/$/, 'module.ramify');
    const lines = (await readFile(join(root, path), 'utf8')).split('\n');
    const statements = lines.filter(line => line.startsWith('expose-'));
    const reordered = order === 'reversed' ? [...statements].reverse() : order === 'rotated' ? [...statements.slice(1), statements[0]!] : statements;
    let index = 0;
    await put(root, path, lines.map(line => line.startsWith('expose-') ? reordered[index++] : line).join('\n'));
  }
}, async context => assertReference(await validated(context.root, context.assertions), context.assertions, order));
add('I1-05:named-growth', 'R', ({ root }) => append(root, sourcePath('workspace/catalog/core', 'catalog.ts'), 'export const hiddenGrowth = 1;'),
  async context => {
    const result = await validated(context.root, context.assertions);
    assertReference(result, context.assertions);
    privateOriginal(context, result, ownerId('workspace/catalog/core'), 'hiddenGrowth');
    context.assertions.equal('unexposed new original defaults', result.linked.modelInput.originals.find(item => item.id.binding === 'hiddenGrowth')!.tags, []);
    context.assertions.equal('named declarations remain 33', result.linked.selections.length, 33);
  });
add('I1-09:equivalent-names', 'R', ({ root }) => replaceC1(root, c1.replace(' * ', ` ${vocabulary.join(', ')} `)), async context => {
  const result = await validated(context.root, context.assertions);
  const named = result.linked.selections.find(item => item.module === ownerId(cOwner))!;
  context.assertions.equal('explicit complete names equal independently enumerated vocabulary', named.pairs.map(pair => pair.name), [...vocabulary].sort());
  context.assertions.equal('C1 now a named selection', named.selector, 'named');
  context.assertions.equal('W1 still relays the same pairs', result.linked.selections.find(item => item.module === ownerId('workspace') && item.selector === 'wildcard')!.pairs, named.pairs);
  context.assertions.ok('all originals remain vocabulary-owned', named.pairs.every(pair => pair.original.owner === ownerId(cOwner) && pair.original.file === 'interfaces/vocabulary.ts'));
});
add('I1-09:add-export', 'R', ({ root }) => append(root, vocabularyFile, 'export const addedVocabulary = 1;'),
  async context => checkVocabulary(context, await validated(context.root, context.assertions), [...vocabulary, 'addedVocabulary']));
add('I1-09:remove-export', 'R', ({ root }) => replace(root, vocabularyFile, 'export const revisionSchema', 'const revisionSchema'),
  async context => checkVocabulary(context, await validated(context.root, context.assertions), vocabulary.filter(name => name !== 'revisionSchema')));
add('I1-09:unselected-file', 'R', ({ root }) => put(root, sourcePath(cOwner, 'interfaces/unselected.ts'), 'export const unselected = 1;\n'),
  async context => {
    const result = await validated(context.root, context.assertions);
    privateOriginal(context, result, ownerId(cOwner), 'unselected');
    checkVocabulary(context, result, vocabulary);
  });
add('I1-09:signature-only-type', 'R', async () => {}, async context => {
  const result = await validated(context.root, context.assertions);
  for (const name of ['ToolInputSchema', 'ToolResult']) privateOriginal(context, result, ownerId(''), name);
  context.assertions.equal('R1 has only its four selected names', result.linked.selections.filter(item => item.module === ownerId(''))[0]!.pairs.map(pair => pair.name),
    ['InvocationContext', 'McpToolContribution', 'ProtocolFacilities', 'ToolInvocation']);
});
add('I1-09:empty-file', 'R', async ({ root }) => {
  await put(root, sourcePath(cOwner, 'interfaces/empty.ts'), 'export {};\n');
  await append(root, cDescription, 'expose-src * from "interfaces/empty.ts" to parent');
}, async context => {
  const result = await validated(context.root, context.assertions);
  const empty = result.linked.selections.find(item => item.provider === sourcePath(cOwner, 'interfaces/empty.ts'))!;
  context.assertions.equal('empty interface records an empty expansion', empty.pairs, []);
  context.assertions.ok('empty expansion retains declaration evidence', empty.statement.file === cDescription && empty.statement.line > 2);
  checkVocabulary(context, result, vocabulary);
});
add('I1-09:default', 'R', ({ root }) => append(root, vocabularyFile, 'export default function defaultVocabulary() { return 1; }'), async context => {
  const result = await validated(context.root, context.assertions);
  checkVocabulary(context, result, [...vocabulary, 'default']);
  context.assertions.equal('default retains original lexical binding', selection(result, ownerId(cOwner), 'default')[0]!.original.binding, 'defaultVocabulary');
});
add('I1-10:nested-interface', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/nested/extra.ts', 'export const extra = 1;\n');
  await append(root, pDescription, 'expose-src * from "interfaces/nested/extra.ts" to parent');
}, async context => {
  const result = await validated(context.root, context.assertions);
  context.assertions.equal('nested interface selected with its original', selection(result, 'fixture/provider', 'extra'),
    [{ name: 'extra', original: { kind: 'code', owner: 'fixture/provider', file: 'interfaces/nested/extra.ts', binding: 'extra' }, effective: true }]);
  context.assertions.equal('parent wildcard receives nested interface', selection(result, 'fixture', 'extra'), selection(result, 'fixture/provider', 'extra'));
});
add('I1-10:testing-module-interface', 'F', ({ root }) => pWildcard(root, 'interfaces/api.ts', 'ramify 1\nmodule provider tagged [testing]\n', ' tagged [testing]'), async context => {
  const result = await validated(context.root, context.assertions);
  const originals = result.linked.modelInput.originals.filter(item => item.id.owner === 'fixture/provider');
  context.assertions.equal('all seven interface originals selected', result.linked.selections.find(item => item.module === 'fixture/provider')!.pairs.length, 7);
  context.assertions.ok('ordinary source of testing module keeps testing tags', originals.every(item => item.origin.area.kind === 'ordinary'
    && JSON.stringify(item.origin.area.profile) === '["testing"]' && JSON.stringify(item.tags) === '["testing"]'));
});
for (const [id, path] of [['implementation', 'api.ts'], ['tests-interface', 'tests/interfaces/api.ts'], ['helpers-interface', 'helpers/interfaces/api.ts'],
  ['normalized-outside', 'interfaces/../api.ts']] as const) add(`I1-10:${id}`, 'F', async ({ root }) => {
  await put(root, `subs/provider/src/${path}`, projectFixtureFiles[apiFile]!);
  await pWildcard(root, path);
}, context => invalid(context, 'invalid-wildcard-target', pDescription));
for (const [id, path] of [['directory', 'interfaces/'], ['glob', 'interfaces/*.ts']] as const) add(`I1-10:${id}`, 'F',
  ({ root }) => pWildcard(root, path), context => invalid(context, 'invalid-path', pDescription));
add('I1-10:test-wildcard', 'F', ({ root }) => append(root, pDescription, 'expose-test * from "fixture.ts" to parent'),
  context => invalid(context, 'invalid-selection', pDescription));

async function alias(context: ProjectContext, name: string, id: { kind: 'code' | 'resource'; owner: string; file: string; binding: string }, tags: readonly string[]): Promise<void> {
  const result = await validated(context.root, context.assertions);
  const found = selection(result, 'fixture/provider', name);
  context.assertions.ok('alias selected', found.length > 0);
  context.assertions.ok('all alias selections preserve canonical identity', found.every(pair => JSON.stringify(pair.original) === JSON.stringify(id) && pair.effective));
  const original = result.linked.modelInput.originals.find(item => originalKey(item.id) === originalKey(id))!;
  context.assertions.equal('original tags preserved', original.tags, tags);
  context.assertions.equal('original area independent of alias location', original.origin.area.kind, 'ordinary');
  context.assertions.equal('origin file is defining code or physical resource', original.origin.file, `subs/provider/src/${id.file}`);
}
const valueId = { kind: 'code' as const, owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value' };
add('I1-11:owned-alias', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/alias.ts', "export { value as renamed } from './api.js';\n");
  await append(root, pDescription, 'expose-src * from "interfaces/alias.ts" to parent');
}, context => alias(context, 'renamed', valueId, ['browser']));
add('I1-11:resource-alias', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/theme.module.css', '.theme { color: red; }\n');
  await put(root, 'src/styles.d.ts', 'declare module "*.module.css" { const styles: Record<string, string>; export default styles; }\n');
  await put(root, 'subs/provider/src/interfaces/alias.ts', "export { default as styles } from '../theme.module.css';\n");
  await append(root, pDescription, 'expose-src * from "interfaces/alias.ts" to parent');
}, context => alias(context, 'styles', { kind: 'resource', owner: 'fixture/provider', file: 'theme.module.css', binding: 'default' }, []));
add('I1-11:foreign-forward', 'F', async ({ root }) => {
  await put(root, 'subs/consumer/src/interfaces/foreign.ts', "export { value } from '../../../provider/src/interfaces/api.js';\nexport const local = 1;\n");
  await append(root, 'subs/consumer/module.ramify', 'expose-src * from "interfaces/foreign.ts" to parent');
}, context => invalid(context, 'foreign-original', 'subs/consumer/module.ramify'));
add('I1-11:ambiguous-expansion', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/a.ts', 'export const clash = 1;\n');
  await put(root, 'subs/provider/src/interfaces/b.ts', 'export const clash = 2;\n');
  await put(root, 'subs/provider/src/interfaces/combined.ts', "export * from './a.js';\nexport * from './b.js';\nexport const independent = 1;\n");
  await append(root, pDescription, 'expose-src * from "interfaces/combined.ts" to parent');
}, context => invalid(context, 'ambiguous-expansion', pDescription));
add('I1-11:required-tag-omission', 'F', ({ root }) => pWildcard(root, 'interfaces/api.ts', 'ramify 1\nmodule provider tagged [ui]\n', ' tagged [browser]'),
  context => invalid(context, 'missing-required-tag', pDescription));
add('I1-11:assignment-conflict', 'F', ({ root }) => append(root, pDescription, 'expose-src * from "interfaces/api.ts" tagged [] to parent'),
  context => invalid(context, 'conflicting-tags', pDescription));
for (const variant of ['same-original', 'distinct-original']) add(`I1-11:cross-selection-collision/${variant}`, 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/alias.ts', variant === 'same-original' ? "export { value } from './api.js';\n" : 'export const value = 2;\n');
  await append(root, pDescription, 'expose-src * from "interfaces/alias.ts" to parent');
}, variant === 'distinct-original' ? context => invalid(context, 'name-collision', pDescription) : async context => {
  await alias(context, 'value', valueId, ['browser']);
});
add('I1-11:literal-star-name', 'F', async ({ root }) => {
  await put(root, 'subs/provider/src/interfaces/star.ts', "const starred = 1; export { starred as '*' };\n");
  await append(root, pDescription, 'expose-src "*" from "interfaces/star.ts" to parent');
}, async context => {
  const result = await validated(context.root, context.assertions);
  const star = result.linked.selections.find(item => item.provider === 'subs/provider/src/interfaces/star.ts')!;
  context.assertions.equal('quoted star is named selection', star.selector, 'named');
  context.assertions.equal('exactly one arbitrary export name', star.pairs,
    [{ name: '*', original: { kind: 'code', owner: 'fixture/provider', file: 'interfaces/star.ts', binding: 'starred' }, effective: true }]);
});
export const linkingHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
