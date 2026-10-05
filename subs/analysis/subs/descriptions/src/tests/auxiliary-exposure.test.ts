import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkDescriptions } from '../link.js';
import { parseDescription } from '../parse.js';
import { buildModel, createDefaultTagRegistry, deriveSourceAreas, listCompanionViolations } from '../../../model/src/index.js';
import type { Exposure, Model, OriginalId, SourceArea, SourceLocation, SourceOrigin } from '../../../model/src/interfaces/model.js';
import type { LinkInputs, LinkIssue, LinkedDescriptions } from '../interfaces/linking.js';
import type { ExposureStatement } from '../interfaces/syntax.js';

// PB1-13: an original defined in auxiliary source (owned compiler source
// outside its owner's src/) cannot be exposed, through an exact selection, an
// interface-file wildcard, a same-owner forwarding chain of any length, an
// expose-test selection or a child re-exposure. Each such selection is an error
// that leaves no valid model (module description specification, validation
// table). A forwarding alias keeps its original's ownership and tags, so a
// chain passing through auxiliary source to an original beneath src/ is
// exposable. Every expected code and location below is derived from the
// description texts and the written facts, independently of the linker.
//
// The facts mirror the written provider topology: root `app` and its child
// `a`. The catalog has already followed each forwarding chain to its original,
// as the TypeScript source interpretation requires.

const registry = createDefaultTagRegistry();
type Facts = { file: string; placement: 'src' | 'auxiliary' };
const modules = [
  { id: 'app', name: 'app', parent: null, directory: '.', prefix: '' },
  { id: 'app/a', name: 'a', parent: 'app', directory: 'subs/a', prefix: 'subs/a/' },
] as const;
const areas = new Map(modules.map(module => {
  const derived = deriveSourceAreas(registry, module.id, `${module.prefix}src`, []);
  if (derived.status !== 'valid') throw new Error('Fixture areas invalid');
  return [module.id, derived.value] as const;
}));

/** The owner, origin and src/-relative original file of a project-relative path. */
function place(file: string): { owner: string; origin: SourceOrigin; relative: string } {
  const module = file.startsWith('subs/a/') ? modules[1] : modules[0];
  const [ordinary, tests] = areas.get(module.id)! as readonly [SourceArea, SourceArea];
  const local = file.slice(module.prefix.length);
  const auxiliary = !local.startsWith('src/');
  const area = local.startsWith('src/tests/') ? tests : ordinary;
  return { owner: module.id, origin: { file, area, auxiliary }, relative: auxiliary ? `../${local}` : local.slice('src/'.length) };
}

/** The location of the `occurrence`th `needle` in `text`, computed from the text alone. */
function site(file: string, text: string, needle: string, occurrence = 1): SourceLocation {
  let start = -1;
  for (let found = 0; found < occurrence; found++) start = text.indexOf(needle, start + 1);
  if (start < 0) throw new Error(`No ${needle} in ${file}`);
  const before = text.slice(0, start);
  return { file, start, end: start + needle.length, line: before.split('\n').length, column: start - before.lastIndexOf('\n') };
}

// Defining files with their originals; each declaration is the binding's name in a one-line source.
const sources: Record<string, string> = {
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\nexport function make(): Tool { return tool; }\nexport function build(): Api { return api; }\n',
  'subs/a/scripts/tool.ts': 'export const tool = 1;\n',
  'tools/helper.ts': 'export const helper = 1;\n',
  'src/main.ts': 'export const main = 1;\nexport function configure(): Helper { return helper; }\n',
};
const id = (file: string, binding: string): OriginalId => ({ kind: 'code', owner: place(file).owner, file: place(file).relative, binding });
const declaration = (file: string, binding: string): SourceLocation => site(file, sources[file]!, binding);
const API = id('subs/a/src/api.ts', 'api');
const MAKE = id('subs/a/src/api.ts', 'make');
const BUILD = id('subs/a/src/api.ts', 'build');
const TOOL = id('subs/a/scripts/tool.ts', 'tool');
const HELPER = id('tools/helper.ts', 'helper');
const MAIN = id('src/main.ts', 'main');
const CONFIGURE = id('src/main.ts', 'configure');
const definitions: readonly [OriginalId, string, OriginalId | null][] = [
  // `make` names the auxiliary `tool` in its signature, `build` names `api`, `configure` names the root's auxiliary `helper`.
  [API, 'subs/a/src/api.ts', null], [MAKE, 'subs/a/src/api.ts', TOOL], [BUILD, 'subs/a/src/api.ts', API],
  [TOOL, 'subs/a/scripts/tool.ts', null], [HELPER, 'tools/helper.ts', null],
  [MAIN, 'src/main.ts', null], [CONFIGURE, 'src/main.ts', HELPER],
];

// Every file's exports, as `name -> [original, forwarding files]`.
const exports: Record<string, Record<string, readonly [OriginalId, readonly string[]]>> = {
  'subs/a/src/api.ts': { api: [API, []], make: [MAKE, []], build: [BUILD, []] },
  'subs/a/scripts/tool.ts': { tool: [TOOL, []] },
  // Auxiliary source forwarding an original beneath src/.
  'subs/a/scripts/relay.ts': { api: [API, ['subs/a/scripts/relay.ts']] },
  'subs/a/src/forward.ts': { tool: [TOOL, ['subs/a/src/forward.ts']], api: [API, ['subs/a/src/forward.ts']] },
  'subs/a/src/middle.ts': { tool: [TOOL, ['subs/a/src/middle.ts', 'subs/a/src/forward.ts']], api: [API, ['subs/a/src/middle.ts', 'subs/a/src/forward.ts']] },
  'subs/a/src/chain.ts': { tool: [TOOL, ['subs/a/src/chain.ts', 'subs/a/src/middle.ts', 'subs/a/src/forward.ts']],
    api: [API, ['subs/a/src/chain.ts', 'subs/a/src/middle.ts', 'subs/a/src/forward.ts']] },
  'subs/a/src/via-relay.ts': { api: [API, ['subs/a/src/via-relay.ts', 'subs/a/scripts/relay.ts']] },
  'subs/a/src/interfaces/contract.ts': { api: [API, ['subs/a/src/interfaces/contract.ts']], tool: [TOOL, ['subs/a/src/interfaces/contract.ts', 'subs/a/src/forward.ts']] },
  'subs/a/src/interfaces/clean.ts': { api: [API, ['subs/a/src/interfaces/clean.ts']] },
  'subs/a/src/tests/support.ts': { tool: [TOOL, ['subs/a/src/tests/support.ts']], api: [API, ['subs/a/src/tests/support.ts']] },
  'src/main.ts': { main: [MAIN, []], configure: [CONFIGURE, []] },
  'tools/helper.ts': { helper: [HELPER, []] },
  'src/forward.ts': { helper: [HELPER, ['src/forward.ts']], main: [MAIN, ['src/forward.ts']] },
  // A root file forwarding the child's auxiliary original: not the root's own.
  'src/peek.ts': { tool: [TOOL, ['src/peek.ts']] },
};

const text = (module: typeof modules[number], statements: readonly string[]): string =>
  `ramify 1\n${module.parent === null ? 'root ' : ''}module ${module.name}\n${statements.join('\n')}\n`;
const descriptionFile = (module: typeof modules[number]): string => `${module.prefix}module.ramify`;

function inputs(child: readonly string[], root: readonly string[] = []): LinkInputs {
  const inventoryModules = modules.map(module => {
    const description = parseDescription(descriptionFile(module), text(module, module.parent === null ? root : child));
    if (description.status !== 'valid') throw new Error(JSON.stringify(description));
    return { id: module.id, name: module.name, parent: module.parent, directory: module.directory, headerTags: [], description,
      areas: areas.get(module.id)!.map(area => ({ owner: area.owner, kind: area.kind, root: area.root, present: true })),
      purpose: { state: 'missing-file' as const, readme: `${module.prefix}README.md` } };
  });
  const files: Facts[] = Object.keys(exports).map(file => ({ file, placement: place(file).origin.auxiliary ? 'auxiliary' : 'src' }));
  // Exact references are resolved as acquisition does: relative to src/ or src/tests/, an escape is not a file.
  const references = inventoryModules.flatMap((module, index) => module.description.document.statements
    .filter((statement): statement is ExposureStatement => 'from' in statement && statement.kind !== 'expose-sub')
    .map(statement => {
      const base = `${modules[index]!.prefix}src${statement.kind === 'expose-test' ? '/tests' : ''}`;
      const normalized = posix.normalize(statement.from.value);
      const escape = normalized.startsWith('../');
      const target = posix.join(base, normalized);
      return { description: module.description.document.file, statement: statement.index, decoded: statement.from.value, normalized: target,
        status: escape ? 'escape' as const : exports[target] ? 'file' as const : 'missing' as const,
        interfaceEligible: !escape && target.startsWith(`${modules[index]!.prefix}src/interfaces/`) };
    }));
  return { registry,
    inventory: { scope: { root: '/app', invokedFrom: '/app', selection: 'given', configuration: 'tsconfig.json', walkedAreas: ['src', 'subs/a/src'],
      ownership: { modules: [], exclusions: [] } },
    modules: inventoryModules,
    files: files.map(({ file, placement }) => ({ path: file, owner: place(file).owner, area: place(file).origin.area.kind, kind: 'source' as const,
      placement, sha256: 'fixture', bytes: 1 })),
    references, warnings: [] },
    catalog: {
      originals: definitions.map(([original, file, companion]) => ({ id: original, origin: place(file).origin, declarations: [declaration(file, original.binding)],
        hasValue: true, hasType: false, companions: companion
          ? { named: [companion], evidence: [site(file, sources[file]!, companion.binding[0]!.toUpperCase() + companion.binding.slice(1))], inferred: false, unresolved: 0 }
          : { named: [], evidence: [], inferred: false, unresolved: 0 } })),
      files: Object.entries(exports).map(([file, entries]) => ({ file, state: 'complete' as const, issueIds: [], descriptionFiles: [],
        exports: Object.entries(entries).map(([name, [original, forwarding]]) => ({ name, original, namespace: null,
          forwarding: forwarding.map(path => place(path).origin) })) })),
      coverage: [] } };
}

const child = (statements: readonly string[], root: readonly string[] = []) => ({ inputs: inputs(statements, root),
  a: text(modules[1], statements), app: text(modules[0], root) });
const valid = (result: LinkedDescriptions): Model => {
  if (result.status !== 'valid') throw new Error(JSON.stringify(result));
  return result.modelInput;
};
const issues = (result: LinkedDescriptions): readonly LinkIssue[] => result.status === 'invalid' ? result.issues : [];
const toolDeclaration = declaration('subs/a/scripts/tool.ts', 'tool');
const helperDeclaration = declaration('tools/helper.ts', 'helper');
/** The finding at a selection, related to the auxiliary original's declaration. */
const finding = (selected: SourceLocation, original: SourceLocation) =>
  ({ code: 'auxiliary-original-exposure', locations: [selected, original] });

describe('auxiliary original exposure in linking (PB1-13)', () => {
  it('links every positive control: src originals selected directly, through forwarding chains, wildcards, tests and auxiliary relays', () => {
    const statements = [
      'expose-src api from "api.ts" to parent',
      'expose-src api from "forward.ts" to parent',
      'expose-src api as chained from "chain.ts" to parent',
      // The chain passes through auxiliary source, but the original lies beneath src/.
      'expose-src api as relayed from "via-relay.ts" to parent',
      'expose-src * from "interfaces/clean.ts" to parent',
      'expose-test api as tested from "support.ts" to parent',
    ];
    const model = valid(linkDescriptions(inputs(statements, ['expose-sub * from a to descendants', 'expose-src main from "forward.ts" to descendants'])));
    const exposed = (module: string) => model.exposures.filter(item => item.module === module).map(item => [item.original.binding, item.names, item.effective]);
    expect(exposed('app/a')).toEqual([['api', ['api', 'chained', 'relayed', 'tested'], true]]);
    // Exposures are ordered by original key, in which app's own `main` precedes app/a's `api`.
    expect(exposed('app')).toEqual([['main', ['main'], true], ['api', ['api', 'chained', 'relayed', 'tested'], true]]);
    // Auxiliary originals remain catalogued with their owner, auxiliary origin and the owner's ordinary tags, unexposed.
    expect(model.originals.filter(original => original.origin.auxiliary).map(original => [original.id, original.origin.file, original.tags]))
      .toEqual([[HELPER, 'tools/helper.ts', []], [TOOL, 'subs/a/scripts/tool.ts', []]]);
  });

  const denials: readonly [string, readonly string[], (a: string) => SourceLocation][] = [
    ['an exact selection of a forwarding file', ['expose-src tool from "forward.ts" to parent'], a => site('subs/a/module.ramify', a, 'tool')],
    ['a three-file forwarding chain', ['expose-src tool from "chain.ts" to parent'], a => site('subs/a/module.ramify', a, 'tool')],
    ['an aliased selection', ['expose-src tool as renamed from "middle.ts" to descendants'], a => site('subs/a/module.ramify', a, 'tool as renamed')],
    ['an interface-file wildcard', ['expose-src * from "interfaces/contract.ts" to parent'], a => site('subs/a/module.ramify', a, '*')],
    ['an expose-test selection', ['expose-test tool from "support.ts" to parent'], a => site('subs/a/module.ramify', a, 'tool')],
    // The tag clause names a known tag; it is not applied to the auxiliary original and adds no finding.
    ['a selection with a tag clause', ['expose-src tool from "forward.ts" tagged [browser] to parent'], a => site('subs/a/module.ramify', a, 'tool')],
  ];
  it.each(denials)('rejects %s with one located finding and no model', (_label, statements, selected) => {
    const fixture = child(statements);
    const result = linkDescriptions(fixture.inputs);
    expect(result).toEqual({ status: 'invalid', issues: [{ ...finding(selected(fixture.a), toolDeclaration), message: expect.any(String) }] });
    expect(issues(result)[0]!.message).toContain('subs/a/scripts/tool.ts');
  });

  it('keeps the positive control valid for each denied path when the selection names the src original instead', () => {
    for (const statements of [['expose-src api from "forward.ts" to parent'], ['expose-src api from "chain.ts" to parent'],
      ['expose-src api as renamed from "middle.ts" to descendants'], ['expose-src * from "interfaces/clean.ts" to parent'],
      ['expose-test api from "support.ts" to parent'], ['expose-src api from "forward.ts" tagged [browser] to parent']]) {
      expect(linkDescriptions(inputs(statements)).status).toBe('valid');
    }
  });

  it('reports each auxiliary selection in a statement and leaves its ordinary selections unreported, publishing no model', () => {
    const fixture = child(['expose-src api, tool from "forward.ts" to parent', 'expose-src absent from "api.ts" to parent']);
    const result = linkDescriptions(fixture.inputs);
    expect(result.status).toBe('invalid');
    expect(issues(result).map(item => [item.code, item.locations[0]])).toEqual([
      ['auxiliary-original-exposure', site('subs/a/module.ramify', fixture.a, 'tool')],
      // Linking continues after the finding: an unrelated statement's own error is still reported.
      ['missing-export', site('subs/a/module.ramify', fixture.a, 'absent')],
    ]);
  });

  it('rejects each re-exposure of a child selection that should never have been exposed, by name and by wildcard', () => {
    const named = child(['expose-src tool from "forward.ts" to parent'], ['expose-sub tool as received from a to descendants']);
    expect(issues(linkDescriptions(named.inputs)).map(item => [item.code, item.locations])).toEqual([
      ['auxiliary-original-exposure', [site('module.ramify', named.app, 'tool as received'), toolDeclaration]],
      ['auxiliary-original-exposure', [site('subs/a/module.ramify', named.a, 'tool'), toolDeclaration]],
    ]);
    const wildcard = child(['expose-src api, tool from "forward.ts" to parent'], ['expose-sub * from a to descendants']);
    expect(issues(linkDescriptions(wildcard.inputs)).map(item => [item.code, item.locations])).toEqual([
      ['auxiliary-original-exposure', [site('module.ramify', wildcard.app, '*'), toolDeclaration]],
      ['auxiliary-original-exposure', [site('subs/a/module.ramify', wildcard.a, 'tool'), toolDeclaration]],
    ]);
    // Positive control: the child's src original is received and re-exposed by name and by wildcard.
    const model = valid(linkDescriptions(inputs(['expose-src api from "forward.ts" to parent'], ['expose-sub api as received from a to descendants', 'expose-sub * from a to descendants'])));
    expect(model.exposures.filter(item => item.module === 'app').map(item => [item.original, item.names, item.provider])).toEqual([[API, ['api', 'received'], 'app/a']]);
  });

  it('rejects the root exposing its own auxiliary original to descendants', () => {
    const fixture = child([], ['expose-src helper, main from "forward.ts" to descendants']);
    expect(linkDescriptions(fixture.inputs)).toEqual({ status: 'invalid',
      issues: [{ ...finding(site('module.ramify', fixture.app, 'helper'), helperDeclaration), message: expect.any(String) }] });
  });

  it('keeps the earlier errors: a path outside src/ and a foreign original', () => {
    // The path rule is decided by the exact reference before any original is selected.
    const outside = child(['expose-src tool from "../scripts/tool.ts" to parent']);
    expect(issues(linkDescriptions(outside.inputs)).map(item => [item.code, item.locations])).toEqual([
      ['invalid-prerequisite', [site('subs/a/module.ramify', outside.a, '"../scripts/tool.ts"')]]]);
    // The root does not own the child's auxiliary original that its file forwards.
    const foreign = child([], ['expose-src tool from "peek.ts" to descendants']);
    expect(issues(linkDescriptions(foreign.inputs)).map(item => [item.code, item.locations])).toEqual([
      ['foreign-original', [site('module.ramify', foreign.app, 'tool'), toolDeclaration]]]);
  });
});

describe('forged auxiliary exposures in model validation (PB1-13)', () => {
  const base = valid(linkDescriptions(inputs(['expose-src api from "api.ts" to parent'], ['expose-sub api from a to descendants'])));
  const evidence = { file: 'forged', start: 0, end: 1, line: 1, column: 1 };
  const forge = (module: string, original: OriginalId, destinations: Exposure['destinations'], provider: string | null = null): Exposure =>
    ({ module, original, names: [original.binding], destinations, evidence: [evidence], provider, effective: true });

  it.each([
    ['an owner exposing its auxiliary original to its parent', [forge('app/a', TOOL, ['parent'])]],
    ['the root exposing its auxiliary original to descendants', [forge('app', HELPER, ['descendants'])]],
    ['a re-exposure of a forged child exposure', [forge('app/a', TOOL, ['parent']), forge('app', TOOL, ['descendants'], 'app/a')]],
  ] as const)('refuses %s, located at each forged exposure', (_label, forged) => {
    const result = buildModel({ ...base, exposures: [...base.exposures, ...forged] });
    expect(result).toEqual({ status: 'invalid', issues: forged.map(() => ({ code: 'ungrounded-exposure', message: expect.stringContaining('Auxiliary original'), locations: [evidence] })) });
  });

  it('accepts the same forged shapes for src originals', () => {
    const result = buildModel({ ...base, exposures: [...base.exposures, forge('app/a', MAKE, ['parent']), forge('app', MAKE, ['descendants'], 'app/a'),
      forge('app', MAIN, ['descendants'])] });
    expect(result.status).toBe('valid');
  });
});

describe('a signature companion defined in auxiliary source (PB1-13)', () => {
  it('reports exposed-without-companion data where the exposure makes the symbol visible, keeping the model and exposures', () => {
    const fixture = child(['expose-src make, build, api from "api.ts" to parent'], ['expose-src configure from "main.ts" to descendants']);
    const model = valid(linkDescriptions(fixture.inputs));
    // The auxiliary companion is visible only in its owner; it can never be exposed, so it is missing in the receiving modules.
    expect(listCompanionViolations(model)).toEqual([
      { module: 'app', original: CONFIGURE, companion: HELPER, destination: 'descendants', reason: 'not-visible', tags: [],
        statement: site('module.ramify', fixture.app, 'expose-src configure from "main.ts" to descendants') },
      { module: 'app/a', original: MAKE, companion: TOOL, destination: 'parent', reason: 'not-visible', tags: [],
        statement: site('subs/a/module.ramify', fixture.a, 'expose-src make, build, api from "api.ts" to parent') },
    ]);
    // `build`'s companion `api` is exposed alongside it: the positive control has no violation.
    expect(model.exposures.map(item => [item.module, item.original.binding, item.effective])).toEqual([
      ['app', 'configure', true], ['app/a', 'api', true], ['app/a', 'build', true], ['app/a', 'make', true]]);
  });
});
