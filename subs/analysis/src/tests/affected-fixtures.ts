import type { InventoryFile, InventoryModule, ProjectInventory, ProjectScope } from '../../subs/project/src/interfaces/project.js';
import type { AccessSelection, SourceAccess, SourceLimit, SourceTarget } from '../../subs/typescript/src/interfaces/source.js';
import type { SourceArea, SourceOrigin } from '../../subs/model/src/interfaces/model.js';
import type { AffectedFacts } from '../affected-query.js';

/**
 * Plain `AffectedFacts` builders for the projector's unit cases. Each module
 * has one ordinary source file `<directory>/src/<name>.ts`; an edge
 * `consumer -> provider` is one access from the consumer's file to the
 * provider's file. Expected answers are written by hand in the tests.
 */
export const scope: ProjectScope = { root: '/project', selection: 'given', invokedFrom: '/project', configuration: 'tsconfig.json',
  walkedAreas: [], independentScopes: [], ownership: { modules: [], exclusions: [] } };

const location = (file: string) => ({ file, start: 0, end: 1, line: 1, column: 1 });
const sourceRoot = (directory: string): string => directory === '.' ? 'src' : `${directory}/src`;

export function inventoryModule(id: string, directory: string): InventoryModule {
  const parent = id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null;
  const name = id.split('/').at(-1)!;
  const readme = directory === '.' ? 'README.md' : `${directory}/README.md`;
  return { id, name, parent, directory, headerTags: [],
    areas: [
      { owner: id, kind: 'ordinary', root: sourceRoot(directory), present: true },
      { owner: id, kind: 'tests', root: `${sourceRoot(directory)}/tests`, present: true },
    ],
    description: { status: 'invalid', file: directory === '.' ? 'module.ramify' : `${directory}/module.ramify`, tokens: [], issues: [] },
    purpose: { state: 'missing-file', readme } };
}

/** A module's one source file. */
export const sourceFile = (module: { readonly id: string; readonly directory: string }): string =>
  `${sourceRoot(module.directory)}/${module.id.split('/').at(-1)!}.ts`;

export function inventoryFile(path: string, owner: string, area: 'ordinary' | 'tests' = 'ordinary',
  kind: 'source' | 'resource' = 'source'): InventoryFile {
  return { path, owner, area, kind, sha256: '0'.repeat(64), bytes: 1 };
}

export function origin(file: string, owner: string, kind: 'ordinary' | 'tests' = 'ordinary'): SourceOrigin {
  const area: SourceArea = { owner, kind, root: file.slice(0, file.lastIndexOf('/')), profile: kind === 'tests' ? ['testing'] : [] };
  return { file, area };
}

let accessCount = 0;
export function access(importer: SourceOrigin, target: SourceTarget, selections: readonly AccessSelection[] = [],
  form: SourceAccess['form'] = 'import'): SourceAccess {
  return { id: `access-${++accessCount}`, location: location(importer.file), importer, specifier: './x.js', form,
    selectionForm: selections.length ? 'named' : 'none', runtimeLoad: true, target, selections, coverageIds: [] };
}

export function selection(original: { readonly owner: string; readonly file: string } | null,
  forwarding: readonly SourceOrigin[] = []): AccessSelection {
  return { location: location(original?.file ?? 'x.ts'), exportedName: 'value', localName: 'value',
    original: original ? { kind: 'code', owner: original.owner, file: original.file, binding: 'value' } : null,
    request: 'value', explicitType: false, forwarding, status: original ? 'resolved' : 'unresolved' };
}

export function note(code: SourceLimit['code'], file = 'src/x.ts', start = 0): SourceLimit {
  return { id: `${code}:${file}:${start}`, code, location: { ...location(file), start }, message: code, related: [] };
}

export interface GraphSpec {
  /** Module ID to project-relative directory. */
  readonly modules: Readonly<Record<string, string>>;
  /** `[consumer, provider]`: the consumer depends on the provider. */
  readonly edges?: readonly (readonly [string, string])[];
  readonly accesses?: readonly SourceAccess[];
  readonly files?: readonly InventoryFile[];
  readonly shims?: readonly { readonly file: string; readonly shims: readonly string[] }[];
  readonly coverage?: readonly SourceLimit[];
  readonly analysisCheck?: 'passed' | 'failed';
}

export function graphFacts(spec: GraphSpec): AffectedFacts {
  const modules = Object.entries(spec.modules).map(([id, directory]) => inventoryModule(id, directory));
  const byId = new Map(modules.map(module => [module.id, module]));
  const fileOf = (id: string): string => {
    const module = byId.get(id);
    if (!module) throw new Error(`Fixture names unknown module ${id}`);
    return sourceFile(module);
  };
  const edgeAccesses = (spec.edges ?? []).map(([consumer, provider]) =>
    access(origin(fileOf(consumer), consumer), { kind: 'application', origin: origin(fileOf(provider), provider) },
      [selection({ owner: provider, file: fileOf(provider) })]));
  const files = [...modules.map(module => inventoryFile(sourceFile(module), module.id)), ...spec.files ?? []];
  const inventory: ProjectInventory = { scope, modules, files, references: [], outsideModuleFiles: [], warnings: [] };
  return { inventory, accesses: [...edgeAccesses, ...spec.accesses ?? []], shims: spec.shims ?? [], coverage: spec.coverage ?? [],
    scope, inputId: 'input/1', analysisCheck: spec.analysisCheck ?? 'passed' };
}

/** `a -> b -> c`, where an arrow means "depends on", and an unrelated `d`. */
export const chain = (): AffectedFacts => graphFacts({
  modules: { a: 'subs/a', b: 'subs/b', c: 'subs/c', d: 'subs/d' },
  edges: [['a', 'b'], ['b', 'c']],
});

/** Edges `a->b`, `a->c`, `b->d`, `c->d`, `d->b` and an isolated `z`. */
export const diamondCycle = (): AffectedFacts => graphFacts({
  modules: { a: 'subs/a', b: 'subs/b', c: 'subs/c', d: 'subs/d', z: 'subs/z' },
  edges: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'b']],
});

/** One module with no dependents and no dependencies. */
export const isolated = (): AffectedFacts => graphFacts({ modules: { z: 'subs/z', y: 'subs/y' }, edges: [['y', 'y']] });

/**
 * The root module `r` at `.` with children: `r/a` depends on the root and
 * the root depends on `r/b`.
 */
export const rootGraph = (): AffectedFacts => graphFacts({
  modules: { r: '.', 'r/a': 'subs/a', 'r/b': 'subs/b', 'r/c': 'subs/c' },
  edges: [['r/a', 'r'], ['r', 'r/b']],
});

/**
 * A resource `subs/styles/src/theme.module.css` of `styles` whose declaration
 * shim `subs/shims/src/resources.d.ts` belongs to `shims`, plus an external
 * shim outside the root that adds no edge.
 */
export const shimGraph = (): AffectedFacts => graphFacts({
  modules: { shims: 'subs/shims', styles: 'subs/styles', other: 'subs/other' },
  files: [inventoryFile('subs/shims/src/resources.d.ts', 'shims'),
    inventoryFile('subs/styles/src/theme.module.css', 'styles', 'ordinary', 'resource')],
  shims: [{ file: 'subs/styles/src/theme.module.css', shims: ['subs/shims/src/resources.d.ts'] },
    { file: 'subs/other/src/other.ts', shims: ['external:/elsewhere/shim.d.ts'] }],
});

/** The chain with the given coverage notes. */
export const coverageGraph = (...coverage: SourceLimit[]): AffectedFacts => ({ ...chain(), coverage });

/**
 * Overrides of the session test fixture's project for the source-form cases.
 * `p` exposes its interface to the root, which exposes it to every descendant.
 * Each consumer module reaches `p` through exactly one access form. `cand`
 * resolves through a `paths` mapping whose first candidate lies in `lonely`,
 * and `intruder` starts without imports. `styles` holds a resource whose
 * declaration shim lives in `shims`.
 */
export const formFiles: Record<string, string> = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-src rootValue, RootType from "interfaces/api.ts" to descendants\n'
    + 'expose-sub * from p to descendants\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true, paths: { '@probe/*': ['./subs/lonely/src/*', './subs/p/src/*'] } }, include: ['src', 'subs'] }),
  'subs/p/module.ramify': 'ramify 1\nmodule p\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/p/src/interfaces/api.ts': 'export const pValue: number = 1;\nexport interface PType { readonly n: number }\n',
  'subs/p/src/internal.ts': 'export const hidden: number = 3;\n',
  'subs/barrel/module.ramify': 'ramify 1\nmodule barrel\n',
  'subs/barrel/src/index.ts': "export { pValue } from '../../p/src/interfaces/api.js';\n",
  'subs/viabarrel/module.ramify': 'ramify 1\nmodule viabarrel\n',
  'subs/viabarrel/src/use.ts': "import { pValue } from '../../barrel/src/index.js';\nvoid pValue;\n",
  'subs/star/module.ramify': 'ramify 1\nmodule star\n',
  'subs/star/src/star.ts': "export * from '../../p/src/interfaces/api.js';\n",
  'subs/ns/module.ramify': 'ramify 1\nmodule ns\n',
  'subs/ns/src/ns.ts': "import * as api from '../../p/src/interfaces/api.js';\nvoid api.pValue;\n",
  'subs/typeonly/module.ramify': 'ramify 1\nmodule typeonly\n',
  'subs/typeonly/src/types.ts': "import type { PType } from '../../p/src/interfaces/api.js';\nexport type Local = PType;\n",
  'subs/dyn/module.ramify': 'ramify 1\nmodule dyn\n',
  'subs/dyn/src/load.ts': "export async function load(): Promise<number> {\n  return (await import('../../p/src/interfaces/api.js')).pValue;\n}\n",
  'subs/effect/module.ramify': 'ramify 1\nmodule effect\n',
  'subs/effect/src/effect.ts': "import '../../p/src/interfaces/api.js';\n",
  'subs/shims/module.ramify': 'ramify 1\nmodule shims\n',
  'subs/shims/src/resources.d.ts': 'declare module "*.module.css" {\n  const classes: { readonly [key: string]: string };\n'
    + '  export default classes;\n}\n',
  'subs/styles/module.ramify': 'ramify 1\nmodule styles\n',
  'subs/styles/src/theme.module.css': '.root { color: red; }\n',
  'subs/ptests/module.ramify': 'ramify 1\nmodule ptests tagged [testing]\n',
  'subs/ptests/src/check.ts': "import { pValue } from '../../p/src/interfaces/api.js';\nexport const checked = pValue + 1;\n",
  'subs/cand/module.ramify': 'ramify 1\nmodule cand\n',
  'subs/cand/src/probe.ts': "import { pValue } from '@probe/interfaces/api.js';\nvoid pValue;\n",
  'subs/lonely/module.ramify': 'ramify 1\nmodule lonely\n',
  'subs/lonely/src/alone.ts': 'export const alone: number = 1;\n',
  'subs/intruder/module.ramify': 'ramify 1\nmodule intruder\n',
  'subs/intruder/src/take.ts': 'export const idle: number = 0;\n',
};
export const formPaths = { api: 'subs/p/src/interfaces/api.ts', alone: 'subs/lonely/src/alone.ts', take: 'subs/intruder/src/take.ts',
  candidate: 'subs/cand/src/probe.ts', theme: 'subs/styles/src/theme.module.css', shim: 'subs/shims/src/resources.d.ts',
  dynamic: 'subs/dyn/src/load.ts', pDescription: 'subs/p/module.ramify' } as const;
/** Every module of the source-form project, in byte order. */
export const formModules = ['fixture', 'fixture/barrel', 'fixture/branch', 'fixture/branch/leaf', 'fixture/cand', 'fixture/dyn',
  'fixture/effect', 'fixture/intruder', 'fixture/lonely', 'fixture/ns', 'fixture/p', 'fixture/ptests', 'fixture/shims',
  'fixture/sibling', 'fixture/star', 'fixture/styles', 'fixture/typeonly', 'fixture/viabarrel'];
/** The dependents of `p` in the source-form project, one per access form, in byte order. */
export const formDependentsOfP = ['fixture/barrel', 'fixture/cand', 'fixture/dyn', 'fixture/effect', 'fixture/ns', 'fixture/ptests',
  'fixture/star', 'fixture/typeonly', 'fixture/viabarrel'];
