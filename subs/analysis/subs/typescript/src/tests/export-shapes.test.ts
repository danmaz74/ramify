import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { API, SignatureKind, SymbolFlags, TypeFlags, type Project, type Symbol as CompilerSymbol, type Type,
  type UnionOrIntersectionType } from 'typescript/unstable/sync';
import { isBindingElement, isElementAccessExpression, isIdentifier, isPropertyAccessExpression, type Node } from 'typescript/unstable/ast';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyDependencyBehavior } from '../behavior-classifier.js';
import { BehaviorShapes, collapse, type BehaviorShape } from '../behavior-shapes.js';
import { describeExportShapes, shapeRuns } from '../export-shapes.js';
import type { ExportShapeRequest } from '../interfaces/source.js';
import { analyze, areasFor, code, definingExports, fixture, resource, shapesFixture, sourceLimits } from './fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

type Analyzed = Awaited<ReturnType<typeof analyze>>;
type Inputs = Parameters<typeof describeExportShapes>[1];

/** The fixture's catalog from the compiler helper, and an in-process compiler over the same disk. */
async function withCompiler<T>(files: Readonly<Record<string, string>>,
  owners: Parameters<typeof fixture>[1], run: (context: { readonly project: Project; readonly inputs: Inputs;
    readonly analyzed: Analyzed; readonly root: string }) => T | Promise<T>): Promise<T> {
  const root = await fixture(files, owners);
  roots.push(root);
  const analyzed = await analyze(root);
  const api = new API({ cwd: root });
  let snapshot: ReturnType<API['updateSnapshot']> | undefined;
  try {
    const configuration = join(root, 'tsconfig.json');
    snapshot = api.updateSnapshot({ openProjects: [configuration] });
    const project = snapshot.getProject(configuration);
    if (!project) throw new Error('The compiler could not create the fixture project');
    return await run({ project, inputs: { inventory: analyzed.view.inventory, areas: areasFor(analyzed.view) }, analyzed, root });
  } finally { snapshot?.dispose(); api.close(); await analyzed.dispose(); }
}

const expected: Record<string, readonly [string, string | null]> = {
  'behaviors.ts:run': ['function', 'callable'],
  'behaviors.ts:arrow': ['value', 'callable'],
  'behaviors.ts:Service': ['class', 'constructable'],
  'behaviors.ts:Base': ['class', 'constructable'],
  'behaviors.ts:hybrid': ['value', 'constructable'],
  'behaviors.ts:handlers': ['value', 'member'],
  'behaviors.ts:Tools': ['namespace', 'member'],
  'behaviors.ts:default': ['function', 'callable'],
  'behaviors.ts:twice': ['function', 'callable'],
  'behaviors.ts:again': ['function', 'callable'],
  'supporting.ts:data': ['value', null],
  'supporting.ts:list': ['value', null],
  'supporting.ts:Mode': ['enum', null],
  'supporting.ts:Shape': ['interface', null],
  'supporting.ts:Label': ['type', null],
  'supporting.ts:limit': ['value', null],
  'supporting.ts:title': ['value', null],
  'supporting.ts:loose': ['value', 'unknown'],
  'style.css:default': ['resource', null],
  'theme.ts:theme': ['value', null],
};

const shapeRule = BehaviorShapes.prototype.shape;
/** Run `body` while every `BehaviorShapes.shape` call, recursive ones included, is reported to `onCall`. */
function observingShapes<T>(onCall: (type: Type, depth: number) => void, body: () => T): T {
  const spy = vi.spyOn(BehaviorShapes.prototype, 'shape').mockImplementation(function (this: BehaviorShapes, type: Type, depth?: number) {
    onCall(type, depth ?? 0);
    return shapeRule.call(this, type, depth);
  });
  try { return body(); } finally { spy.mockRestore(); }
}

type BaseShape = 'capable' | 'data' | 'unknown';
const behaviorSymbols = SymbolFlags.Function | SymbolFlags.Method | SymbolFlags.Class | SymbolFlags.Constructor;
const emptyConstituents = TypeFlags.Nullable | TypeFlags.Void | TypeFlags.Never;
/**
 * The consumer classifier's rule at commit 577b980, kept verbatim apart from
 * its name and the `onCall` witness: the independent expected answer for AV02.
 */
class BaseShapes {
  readonly #types = new Map<number, BaseShape>();
  constructor(private readonly project: Project, private readonly onCall: (type: Type, depth: number) => void) {}

  of(type: Type, depth = 0): BaseShape {
    this.onCall(type, depth);
    const cached = this.#types.get(type.id);
    if (cached) return cached;
    let result: BaseShape;
    if (depth > 8 || type.flags & TypeFlags.AnyOrUnknown) result = 'unknown';
    else if (type.flags & TypeFlags.UnionOrIntersection) {
      const parts = (type as UnionOrIntersectionType).getTypes().filter(part => !(part.flags & emptyConstituents))
        .map(part => this.of(part, depth + 1));
      result = parts.includes('capable') ? 'capable' : parts.includes('unknown') ? 'unknown' : 'data';
    } else if (type.flags & TypeFlags.InstantiableNonPrimitive) {
      const constraint = this.project.checker.getBaseConstraintOfType(type);
      result = constraint && constraint.id !== type.id ? this.of(constraint, depth + 1) : 'unknown';
    } else if (type.flags & TypeFlags.Object) result = this.#structured(type);
    else result = 'data';
    this.#types.set(type.id, result);
    return result;
  }

  #signatures(type: Type): boolean {
    const { checker } = this.project;
    return checker.getSignaturesOfType(type, SignatureKind.Call).length > 0
      || checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0;
  }

  #structured(type: Type): BaseShape {
    if (this.#signatures(type)) return 'capable';
    const { checker, program } = this.project;
    const declared = (symbol: CompilerSymbol): boolean => symbol.declarations.some(handle => {
      const metadata = program.getSourceFileMetadataByPath(handle.path);
      return !!metadata && !metadata.isDefaultLibrary && !metadata.isFromExternalLibrary;
    });
    const members = checker.getPropertiesOfType(type).filter(declared);
    if (members.some(member => member.flags & behaviorSymbols)) return 'capable';
    if (!members.length) return 'data';
    for (const member of checker.getTypeOfSymbol(members)) {
      if (!member) continue;
      const parts = member.flags & TypeFlags.Union
        ? (member as UnionOrIntersectionType).getTypes().filter(part => !(part.flags & emptyConstituents)) : [member];
      if (parts.some(part => part.flags & TypeFlags.Object && this.#signatures(part))) return 'capable';
    }
    return 'data';
  }
}

/** A consumer of every `shapes` export, by call, construction, reference and data use. */
const shapesConsumer = `import greet, { run, arrow, Service, Base, hybrid, handlers, Tools, twice, again } from './behaviors.js';
import { data, list, Mode, limit, title, loose, type Shape, type Label } from './supporting.js';
import styles from './style.css';
import { theme } from './theme.js';
run(); [0].map(arrow); new Service().start(); class Square extends Base { area(): number { return 1; } }
new hybrid(); hybrid(); handlers.save(); Tools.tool(); void Tools.version; greet('x'); twice(); void again;
const shape: Shape = { size: data.list.length + list.length + Mode.A + limit + title.length };
const label: Label = String(loose) + styles.value + theme.value;
void new Square(); void shape; void label; void data.pending;
`;

/**
 * The dependency-behavior test's fixtures, copied so that file stays unchanged,
 * and the `shapes` fixture with a consumer.
 */
const B = "'../subs/b/src/index.js'", C = "'../subs/c/src/index.js'";
const forwarder = "export { act, Service, settings, type Shape, loose } from '../../core/src/index.js';\n";
const classifierFixtures: Record<string, { readonly files: Readonly<Record<string, string>>; readonly owners: Parameters<typeof fixture>[1] }> = {
  shapes: { files: { ...shapesFixture, 'src/use.ts': shapesConsumer }, owners: [] },
  evidence: { owners: [], files: {
    'src/api.ts': `export function run(): number { return 1; }
export class Service { start(): void {} }
export const handlers = { save(): void {} };
export const helpers = { format: (value: string): string => value, label: 'helpers' };
export const limit = 10;
export enum Mode { A, B }
export const constants = { A: 'a' } as const;
export const list = [1, 2, 3];
export interface Shape { size: number }
export type Label = string;
export const callback = (value: number): number => value;
export namespace Tools { export function tool(): void {} export const version = 1; }
export const loose: any = 1;
export function unusedFn(): void {}
export const mixed = (): void => {};
export const optional: (() => void) | undefined = undefined;
`,
    'src/use.ts': `import { run, Service, handlers, helpers, limit, Mode, constants, list, type Shape, callback, Tools, loose, unusedFn, mixed, optional } from './api.js';
import type { Label } from './api.js';
run();
const service = new Service();
handlers.save();
void helpers.label;
const total: number = limit + list.length;
const mode = Mode.A + constants.A.length;
const shape: Shape = { size: total + mode };
const label: Label = String(shape.size);
[1, 2].map(callback);
Tools.tool();
void (loose + 1);
type Signature = typeof mixed;
mixed();
optional?.();
void service; void label;
export type { Signature };
`,
    'src/forward.ts': `export { run as forwardedRun } from './api.js';
export * from './api.js';
import { limit, callback } from './api.js';
export { limit as localLimit };
export default callback;
`,
    'src/lazy.ts': `import * as api from './api.js';
api.run();
const lazy = await import('./api.js');
void lazy.limit;
void import('./api.js').then(({ Service }) => new Service());
export type Loaded = import('./api.js').Shape;
`,
  } },
  unused: { owners: [], files: {
    'src/api.ts': 'export const value = 1;\nexport function act(): void {}\n',
    'src/use.ts': "import { value, act } from './api.js';\nexport { act };\n",
  } },
  'path-facts': { owners: ['core', 'b', 'c'].map(name => ({ name, directory: `subs/${name}`, tags: [] as string[] })), files: {
    'subs/core/src/index.ts': `export function act(): void {}
export class Service { start(): void {} }
export const settings = { size: 1 };
export interface Shape { size: number }
export const loose: any = 1;
`,
    'subs/b/src/index.ts': forwarder, 'subs/c/src/index.ts': forwarder,
    'src/only-b.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\nact();\n`,
    'src/both.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\nact();\nexport type Signature = typeof actC;\n`,
    'src/neither.ts': `import { act } from ${B};\nimport { act as actC } from ${C};\n`,
    'src/aliases.ts': `import { act, act as again } from ${B};\nimport { act as second } from ${B};\nact();\nact();\nagain();\n`,
    'src/kinds.ts': `import { Service, settings, type Shape } from ${B};
import { act, settings as settingsC } from ${C};
new Service();
[0].forEach(act);
act();
export const shape: Shape = settings;
export { settingsC };
export { act as forwardedAct } from ${B};
`,
    'src/limited.ts': `import { loose } from ${B};\nimport { loose as looseC } from ${C};\nvoid (loose + 1);\n`,
    'src/settled.ts': `import * as viaB from ${B};\nimport { act } from ${C};\nconst { act: run = undefined as any } = viaB;\nvoid run;\nact();\n`,
  } },
  forwarding: { owners: [{ name: 'b', directory: 'subs/b', tags: [] }, { name: 'a', directory: 'subs/b/subs/a', tags: [] }], files: {
    'subs/b/subs/a/src/index.ts': 'export function act(): void {}\nexport const secret = { level: 1 };\nexport interface Settings { size: number }\n',
    'subs/b/src/index.ts': "export { act, secret, type Settings } from '../subs/a/src/index.js';\n",
    'src/use.ts': "import { act, secret } from '../subs/b/src/index.js';\nimport type { Settings } from '../subs/b/src/index.js';\nact();\nexport const settings: Settings = { size: 1 };\n",
    'src/reexport.ts': "export * from '../subs/b/src/index.js';\n",
  } },
};

describe('export shapes', () => {
  it('classifies every defining-file export of the shapes fixture by kind and behavior (AV01)', () => withCompiler(shapesFixture, [],
    ({ project, inputs, analyzed }) => {
      const requests = definingExports(analyzed.catalog);
      const shapes = describeExportShapes(project, inputs, requests);
      expect(shapes.map(shape => [shape.original, shape.exportName])).toEqual(requests.map(request => [request.original, request.exportName]));
      expect(Object.fromEntries(shapes.map(shape => [`${shape.original.file}:${shape.exportName}`, [shape.kind, shape.behavior]])))
        .toEqual(expected);
      // The default export and the second export name keep their original's binding.
      expect(shapes.find(shape => shape.exportName === 'default')!.original).toEqual(code('behaviors.ts', 'greet'));
      expect(shapes.find(shape => shape.exportName === 'again')!.original).toEqual(code('behaviors.ts', 'twice'));
      expect(shapes.find(shape => shape.kind === 'resource')!.original).toEqual(resource('style.css'));
      expect(Object.isFrozen(shapes) && Object.isFrozen(shapes[0])).toBe(true);
      expect(JSON.parse(JSON.stringify(shapes))).toEqual(shapes);
    }), 60_000);

  it('answers one shape per request in request order and unknown for an export the compiler cannot resolve', () => withCompiler({
    ...shapesFixture, 'src/forward.ts': "export { limit as forwardedLimit } from './supporting.js';\n",
  }, [], ({ project, inputs }) => {
    const requests: ExportShapeRequest[] = [
      { original: code('supporting.ts', 'limit'), exportName: 'limit' },
      { original: code('behaviors.ts', 'run'), exportName: 'run' },
      { original: code('supporting.ts', 'limit'), exportName: 'limit' },
      // Absent from the defining file, a name only a forwarding file exports, another
      // original's export name, a missing file and an unknown owner.
      { original: code('supporting.ts', 'absent'), exportName: 'absent' },
      { original: code('supporting.ts', 'limit'), exportName: 'forwardedLimit' },
      { original: code('supporting.ts', 'wrongBinding'), exportName: 'limit' },
      { original: code('missing.ts', 'run'), exportName: 'run' },
      { original: code('behaviors.ts', 'run', 'fixture/elsewhere'), exportName: 'run' },
      { original: resource('style.css'), exportName: 'default' },
    ];
    const shapes = describeExportShapes(project, inputs, requests);
    expect(shapes.map(shape => [shape.original, shape.exportName, shape.kind, shape.behavior])).toEqual([
      [code('supporting.ts', 'limit'), 'limit', 'value', null],
      [code('behaviors.ts', 'run'), 'run', 'function', 'callable'],
      [code('supporting.ts', 'limit'), 'limit', 'value', null],
      [code('supporting.ts', 'absent'), 'absent', 'value', 'unknown'],
      [code('supporting.ts', 'limit'), 'forwardedLimit', 'value', 'unknown'],
      [code('supporting.ts', 'wrongBinding'), 'limit', 'value', 'unknown'],
      [code('missing.ts', 'run'), 'run', 'value', 'unknown'],
      [code('behaviors.ts', 'run', 'fixture/elsewhere'), 'run', 'value', 'unknown'],
      [resource('style.css'), 'default', 'resource', null],
    ]);
    expect(describeExportShapes(project, inputs, [])).toEqual([]);
  }), 60_000);

  it('rejects an invalid or cancelled call with no result and counts every call', () => withCompiler(shapesFixture, [],
    ({ project, inputs }) => {
      const valid: ExportShapeRequest = { original: code('supporting.ts', 'limit'), exportName: 'limit' };
      const before = shapeRuns();
      expect(() => describeExportShapes(project, inputs, [valid, { original: { kind: 'code', owner: '', file: '', binding: '' }, exportName: 'limit' }]))
        .toThrow(expect.objectContaining({ code: 'protocol-error' }));
      expect(() => describeExportShapes(project, inputs, [{ ...valid, exportName: '' }])).toThrow(expect.objectContaining({ code: 'protocol-error' }));
      expect(() => describeExportShapes(project, inputs, [valid], AbortSignal.abort())).toThrow(expect.objectContaining({ code: 'cancelled' }));
      // Cancellation during the call answers no partial result.
      const controller = new AbortController();
      expect(() => observingShapes(() => controller.abort(), () => describeExportShapes(project, inputs, [valid, valid], controller.signal)))
        .toThrow(expect.objectContaining({ code: 'cancelled' }));
      expect(describeExportShapes(project, inputs, [valid])).toHaveLength(1);
      expect(shapeRuns() - before).toBe(5);
    }), 60_000);

  it('shares one shape rule with the consumer classifier, whose capability is unchanged for every type it meets (AV02)', async () => {
    const tally: Record<BehaviorShape, number> = { constructable: 0, callable: 0, member: 0, data: 0, unknown: 0 };
    const mismatches: string[] = [];
    const counts: Record<string, number> = {};
    for (const [name, { files, owners }] of Object.entries(classifierFixtures)) {
      await withCompiler(files, owners, async ({ project, inputs, analyzed, root }) => {
        const { accesses } = await analyzed.source.accesses();
        const helperFacts = await analyzed.source.dependencyBehavior();
        // Every type the real classifier meets, at every depth, on an in-process compiler over the same disk;
        // on `shapes` also every type the export shapes meet.
        const met = new Map<number, Type>();
        const facts = observingShapes(type => { if (!met.has(type.id)) met.set(type.id, type); }, () => {
          const result = classifyDependencyBehavior(project, { ...inputs, limits: sourceLimits }, accesses);
          if (name === 'shapes') describeExportShapes(project, inputs, definingExports(analyzed.catalog));
          return result;
        });
        // The in-process classifier is the helper's: equal facts over equal inputs.
        expect(JSON.stringify(facts), name).toBe(JSON.stringify(helperFacts));
        counts[name] = met.size;
        // Beyond them, the type of every identifier, member access and binding element in the fixture.
        const nodes: Node[] = [];
        const visit = (node: Node): void => {
          if (isIdentifier(node) || isPropertyAccessExpression(node) || isElementAccessExpression(node) || isBindingElement(node)) nodes.push(node);
          node.forEachChild(child => { visit(child); });
        };
        for (const file of Object.keys(files).filter(path => /\.tsx?$/.test(path))) visit(project.program.getSourceFile(join(root, file))!);
        for (const type of project.checker.getTypeAtLocation(nodes)) if (type && !met.has(type.id)) met.set(type.id, type);
        const types = [...met.values()];

        // The rule as of 577b980 and the shared rule, on fresh instances in the same order, make
        // the same calls at the same depths, cache hits included, and give the same capability.
        const baseCalls: string[] = [], currentCalls: string[] = [];
        const base = new BaseShapes(project, (type, depth) => { baseCalls.push(`${type.id}@${depth}`); });
        const current = new BehaviorShapes(project);
        const capabilities = observingShapes((type, depth) => { currentCalls.push(`${type.id}@${depth}`); },
          () => types.map(type => [base.of(type), current.of(type)] as const));
        expect(currentCalls, name).toEqual(baseCalls);
        types.forEach((type, index) => {
          const [before, after] = capabilities[index]!;
          const shape = current.shape(type);
          tally[shape]++;
          if (after !== before || collapse(shape) !== after) mismatches.push(`${name}: type ${type.id} was ${before}, is ${after} (${shape})`);
        });
      });
    }
    expect(mismatches).toEqual([]);
    // Unused and forwarded selections meet no type; every other fixture does.
    expect(Object.entries(counts).map(([name, count]) => [name, name === 'unused' ? count === 0 : count > 0]))
      .toEqual(Object.keys(classifierFixtures).map(name => [name, true]));
    // Every branch of the rule is reached.
    expect(Object.values(tally).every(count => count > 0), JSON.stringify(tally)).toBe(true);
  }, 240_000);
});

