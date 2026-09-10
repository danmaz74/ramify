import {
  assignOriginalTags, buildModel, createDefaultTagRegistry, deriveSourceAreas, explainImport, resolveTagRegistry,
} from '../../subs/analysis/subs/model/src/index.js';
import type {
  BindingRequest, ModelResult, ModuleRecord, Original, ResolvedTagRegistry, SourceLocation, TagDefinition,
} from '../../subs/analysis/subs/model/src/index.js';
import type { Assertions, InstanceHandler } from './runner.js';

const testing: TagDefinition = { name: 'testing', kind: 'required-importer' };
const customDefinitions: readonly TagDefinition[] = [testing,
  { name: 'coupled', kind: 'required-importer' }, { name: 'transport', kind: 'required-importer' },
  { name: 'portable', kind: 'required-symbol' }, { name: 'deterministic', kind: 'required-symbol' },
];
const declaration: SourceLocation = { file: 'subs/provider/module.ramify', start: 40, end: 55, line: 3, column: 1 };

function valid<T>(result: ModelResult<T>): T {
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.issues));
  return result.value;
}

/** Constructed-tree input only. All permission decisions use the public model. */
function evaluate(registry: ResolvedTagRegistry, importerTags: readonly string[], symbolTags: readonly string[], request: BindingRequest = 'value') {
  function module(name: string, headerTags: readonly string[]): ModuleRecord {
    const id = name === 'app' ? 'app' : `app/${name}`;
    return { id, name, parent: name === 'app' ? null : 'app', headerTags,
      areas: valid(deriveSourceAreas(registry, id, name === 'app' ? 'src' : `subs/${name}/src`, headerTags)) };
  }
  const root = module('app', []);
  const provider = module('provider', []);
  const importer = module('consumer', importerTags);
  const tags = valid(assignOriginalTags(registry, provider.areas[0], [{ tags: symbolTags, location: declaration }]));
  const symbol: Original = {
    id: { kind: 'code', owner: provider.id, file: 'api.ts', binding: 'api' },
    origin: { file: 'subs/provider/src/api.ts', area: provider.areas[0] },
    hasValue: true, hasType: true, tags: tags.tags, tagEvidence: tags.evidence,
    declarations: [{ file: 'subs/provider/src/api.ts', start: 0, end: 24, line: 1, column: 1 }],
  };
  const model = valid(buildModel({ registry, modules: [root, provider, importer], originals: [symbol], exposures: [
    { module: provider.id, original: symbol.id, names: ['api'], destinations: ['parent'],
      provider: null, effective: true, evidence: [declaration] },
    { module: root.id, original: symbol.id, names: ['api'], destinations: ['descendants'],
      provider: provider.id, effective: true, evidence: [{ file: 'module.ramify', start: 25, end: 80, line: 3, column: 1 }] },
  ] }));
  const question = { importer: { file: 'subs/consumer/src/use.ts', area: importer.areas[0] },
    target: symbol.origin, forwarding: [], selection: { original: symbol.id, request },
    location: { file: 'subs/consumer/src/use.ts', start: 0, end: 35, line: 1, column: 1 } };
  return { model, question, decision: explainImport(model, question) };
}

function invalid(assertions: Assertions, name: string, result: ModelResult<unknown>, code: string): void {
  assertions.equal(`${name}: invalid`, result.status, 'invalid');
  if (result.status !== 'invalid') throw new Error('Expected invalid model input');
  assertions.ok(`${name}: reason`, result.issues.some((issue) => issue.code === code));
  assertions.ok(`${name}: explanation`, result.issues.every((issue) => issue.message.length > 0));
}

const handlers: [string, InstanceHandler][] = [];
function register(id: string, run: (assertions: Assertions) => void): void {
  handlers.push([`I1-14:${id}`, { kind: 'memory', run: ({ assertions }) => run(assertions) }]);
}

register('renamed-kinds', (assertions) => {
  const defaults = createDefaultTagRegistry();
  const renamed = valid(resolveTagRegistry([testing,
    { name: 'coupled', kind: 'required-importer' }, { name: 'portable', kind: 'required-symbol' }]));
  assertions.ok('different registry identities', defaults.id !== renamed.id);
  for (const [prefix, registry, coupled, portable] of [
    ['default', defaults, 'ui', 'browser'], ['renamed', renamed, 'coupled', 'portable'],
  ] as const) {
    // Literal expectations from the reviewed fixture details; no evaluator-derived answers.
    for (const [caseName, importer, symbol, expectedValue, expectedType] of [
      ['all-present', [coupled, portable], [coupled, portable], 'allowed', 'allowed'],
      ['missing-importer', [portable], [coupled, portable], 'denied', 'denied'],
      ['missing-symbol', [coupled, portable], [coupled], 'denied', 'allowed'],
    ] as const) {
      for (const [request, expected] of [['value', expectedValue], ['type-only', expectedType]] as const) {
        const { decision } = evaluate(registry, importer, symbol, request);
        const name = `${prefix}/${caseName}/${request}`;
        assertions.equal(`${name}: visible`, decision.visibility?.visible, true);
        assertions.equal(`${name}: outcome`, decision.status, expected);
        assertions.equal(`${name}: source profile`, decision.question.importer.area.profile, [...importer].sort());
        assertions.equal(`${name}: original`, decision.original?.id, { kind: 'code', owner: 'app/provider', file: 'api.ts', binding: 'api' });
      }
    }
  }
});

const allTags = ['coupled', 'transport', 'portable', 'deterministic'];
for (const [name, importerMissing, symbolMissing, expectedReason] of [
  ['all-present', null, null, 'exposed'],
  ['missing-importer-coupled', 'coupled', null, 'required-importer-tag'],
  ['missing-importer-transport', 'transport', null, 'required-importer-tag'],
  ['missing-symbol-portable', null, 'portable', 'required-symbol-tag'],
  ['missing-symbol-deterministic', null, 'deterministic', 'required-symbol-tag'],
] as const) register(`conjunction/${name}`, (assertions) => {
  const registry = valid(resolveTagRegistry(customDefinitions));
  assertions.equal('all-present baseline', evaluate(registry, allTags, allTags).decision.status, 'allowed');
  const { decision } = evaluate(registry, allTags.filter((tag) => tag !== importerMissing), allTags.filter((tag) => tag !== symbolMissing));
  assertions.equal('visibility established', decision.visibility?.visible, true);
  assertions.equal('outcome', decision.status, name === 'all-present' ? 'allowed' : 'denied');
  assertions.equal('reason', decision.reason, expectedReason);
  assertions.equal('applicable requirements', decision.requirements.length, 4);
  assertions.equal('exact unsatisfied requirement', decision.requirements.filter(({ satisfied }) => !satisfied).map(({ tag }) => tag),
    name === 'all-present' ? [] : [importerMissing ?? symbolMissing]);
  assertions.equal('original tag evidence', decision.original?.tagEvidence, [declaration]);
  assertions.equal('declaration hops', decision.visibility?.paths[0].map(({ module }) => module), ['app/provider', 'app']);
});

register('unknown/header', (assertions) => {
  const registry = createDefaultTagRegistry();
  assertions.equal('valid header baseline', deriveSourceAreas(registry, 'app/consumer', 'subs/consumer/src', []).status, 'valid');
  const result = deriveSourceAreas(registry, 'app/consumer', 'subs/consumer/src', ['unregistered']);
  invalid(assertions, 'header tag', result, 'unknown-tag');
  if (result.status === 'invalid') {
    // This API receives an owner/root but no parser span. Do not invent coordinates.
    assertions.ok('responsible module and source root', result.issues.some(({ message }) => message.includes('app/consumer') && message.includes('subs/consumer/src')));
  }
});

register('unknown/symbol', (assertions) => {
  const registry = createDefaultTagRegistry();
  const area = valid(deriveSourceAreas(registry, 'app/provider', 'subs/provider/src', []))[0];
  assertions.equal('valid assignment baseline', assignOriginalTags(registry, area, [{ tags: [], location: declaration }]).status, 'valid');
  const result = assignOriginalTags(registry, area, [{ tags: ['unregistered'], location: declaration }]);
  invalid(assertions, 'symbol tag', result, 'unknown-tag');
  if (result.status === 'invalid') assertions.equal('exact declaration location', result.issues[0].locations, [declaration]);
});

for (const [variant, kind] of [['same-kind', 'required-importer'], ['conflicting-kind', 'required-symbol']] as const) {
  register(`duplicate/${variant}`, (assertions) => {
    assertions.equal('unique registry baseline', resolveTagRegistry(customDefinitions).status, 'valid');
    const result = resolveTagRegistry([...customDefinitions, { name: 'coupled', kind }]);
    invalid(assertions, 'duplicate', result, 'invalid-registry');
    if (result.status === 'invalid') assertions.ok('duplicate named', result.issues.some(({ message }) => message.includes('Duplicate') && message.includes('coupled')));
  });
}
register('invalid-kind', (assertions) => {
  assertions.equal('valid kind baseline', resolveTagRegistry([testing, { name: 'coupled', kind: 'required-importer' }]).status, 'valid');
  invalid(assertions, 'custom algorithm', resolveTagRegistry([testing, { name: 'coupled', kind: 'custom' }]), 'invalid-registry');
});
register('remove-testing', (assertions) => {
  assertions.equal('reserved tag baseline', resolveTagRegistry(customDefinitions).status, 'valid');
  invalid(assertions, 'reserved removal', resolveTagRegistry(customDefinitions.filter(({ name }) => name !== 'testing')), 'invalid-registry');
});
register('rebind-testing', (assertions) => {
  assertions.equal('reserved kind baseline', resolveTagRegistry(customDefinitions).status, 'valid');
  invalid(assertions, 'reserved rebinding', resolveTagRegistry(customDefinitions.map((definition) => definition.name === 'testing'
    ? { name: 'testing', kind: 'required-symbol' } : definition)), 'invalid-registry');
});

register('two-evaluations', (assertions) => {
  const first = valid(resolveTagRegistry([testing, { name: 'coupled', kind: 'required-importer' }]));
  const one = evaluate(first, [], ['coupled']);
  assertions.equal('first visible', one.decision.visibility?.visible, true);
  assertions.equal('first denied by importer kind', one.decision.reason, 'required-importer-tag');
  const second = valid(resolveTagRegistry([testing, { name: 'coupled', kind: 'required-symbol' }]));
  const two = evaluate(second, [], ['coupled']);
  assertions.equal('second visible', two.decision.visibility?.visible, true);
  assertions.equal('second allowed without symbol requirement', two.decision.status, 'allowed');
  assertions.equal('second has no applicable requirement', two.decision.requirements, []);
  assertions.ok('distinct identities', one.model.registry.id !== two.model.registry.id);
  assertions.equal('first result stable after second evaluation', explainImport(one.model, one.question), one.decision);
  assertions.equal('first definitions unchanged', one.model.registry.definitions.find(({ name }) => name === 'coupled')?.kind, 'required-importer');
});

/** Exact implementing membership, independent of the inventory and gate membership. */
export const modelHandlers: ReadonlyMap<string, InstanceHandler> = new Map(handlers);
