import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { afterEach, describe, expect, it } from 'vitest';
import { originalKey } from '../../../model/src/identity.js';
import type { OriginalId } from '../../../model/src/interfaces/model.js';
import { companionSymbolRequests } from '../catalog.js';
import { createDescriptionSet, describeFiles, type DescriptionSet, type DescriptionUpdate } from '../descriptions.js';
import { createRetainedSourceAnalysis } from '../retained-source-analysis.js';
import type { CatalogExport, CatalogOriginal, FileDescription, SourceChangeSet } from '../interfaces/source.js';
import { acquire, areasFor, code, fixture, put, sourceLimits } from './fixtures.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function start(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await fixture(files);
  roots.push(root);
  return root;
}

/** Compiler requests by protocol method name. */
type Requests = Map<string, number>;
/** Count every request the API's client sends while `run` executes. */
function counted<T>(api: API, requests: Requests, run: () => T): T {
  const client = (api as unknown as { client: Record<string, (...args: unknown[]) => unknown> }).client;
  const originals = ['apiRequest', 'apiRequestBinary'].map(name => [name, client[name]!] as const);
  for (const [name, method] of originals) {
    client[name] = (...args: unknown[]) => {
      const key = String(args[0]);
      requests.set(key, (requests.get(key) ?? 0) + 1);
      return method.apply(client, args);
    };
  }
  try { return run(); } finally { for (const [name, method] of originals) client[name] = method; }
}

/** Describe over a real in-process compiler snapshot of the fixture's current disk state. */
async function describeState(root: string, set: DescriptionSet, files?: readonly string[], requests?: Requests): Promise<DescriptionUpdate> {
  const view = await acquire(root);
  const inputs = { inventory: view.inventory, areas: areasFor(view), limits: sourceLimits };
  const configuration = join(root, 'tsconfig.json');
  const api = new API({ cwd: root });
  let snapshot: ReturnType<API['updateSnapshot']> | undefined;
  try {
    snapshot = api.updateSnapshot({ openProjects: [configuration] });
    const project = snapshot.getProject(configuration);
    if (!project) throw new Error('The compiler could not create the fixture project');
    const host = { resourceWitness: '', fileExists: existsSync,
      realpath: (path: string) => existsSync(path) ? realpathSync(path) : path,
      directoryExists: (path: string) => existsSync(path) && statSync(path).isDirectory(), readFile: (path: string) => {
      try { return readFileSync(path, 'utf8'); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null; throw error; }
    } };
    const run = () => set.describe(project, inputs, host, new Map<CatalogExport, boolean>(),
      files ?? inputs.inventory.files.map(file => file.path));
    return requests ? counted(api, requests, run) : run();
  } finally { snapshot?.dispose(); api.close(); }
}

async function described(files: Readonly<Record<string, string>>): Promise<{ root: string; set: DescriptionSet }> {
  const root = await start(files);
  const set = createDescriptionSet();
  await describeState(root, set);
  return { root, set };
}
function originalOf(set: DescriptionSet, id: OriginalId): CatalogOriginal {
  const found = set.all().flatMap(entry => entry.originals).find(entry => originalKey(entry.id) === originalKey(id));
  if (!found) throw new Error(`No original ${JSON.stringify(id)}`);
  return found;
}
/** The named companions' files and bindings, in their recorded order. */
function named(set: DescriptionSet, id: OriginalId): readonly string[] {
  return originalOf(set, id).companions.named.map(entry => `${entry.file}:${entry.binding}`);
}
function facts(set: DescriptionSet, id: OriginalId): { named: readonly string[]; inferred: boolean; unresolved: number } {
  const { inferred, unresolved } = originalOf(set, id).companions;
  return { named: named(set, id), inferred, unresolved };
}

/** Owned types every row names, exported by one file and forwarded by a barrel. */
const types = {
  'src/types.ts': `export interface Order { readonly id: string }
export interface Item { readonly sku: string }
export type Money = number;
export interface Customer { readonly name: string }
export interface Cfg { readonly key: string }
export interface Result { readonly ok: boolean }
export interface Hidden { readonly h: number }
export interface Secret { readonly s: number }
export interface Guarded { readonly g: number }
export interface Access { readonly a: number }
export interface Written { readonly w: number }
export interface Built { readonly b: number }
export interface Kept { readonly k: number }
export class Store {}
export const seed = { size: 1 };
export namespace Shapes { export interface Circle { readonly r: number } }
export enum Mode { A, B }
`,
  'src/barrel.ts': 'export { Order as Forwarded } from "./types.js";\nexport * from "./types.js";\n',
};
const t = (binding: string): string => `types.ts:${binding}`;

describe('signature companions', () => {
  it('names what every row of the harvesting table declares, through forwarding aliases (SC11)', async () => {
    const { set } = await described({ ...types,
      'src/functions.ts': `import type { Order, Item, Money, Customer } from "./barrel.js";
export function place(order: Order): Money;
export function place(order: Order, item: Item): Money;
export function place(order: Order, item?: Item | Customer): Money { const local: Customer = { name: '' }; void local; void item; return order.id.length; }
`,
      'src/interfaces.ts': `import type { Order, Item, Money, Access } from "./types.js";
export interface Merged extends Access { readonly order: Order }
export interface Merged { total(item: Item): Money }
`,
      'src/aliases.ts': `import type { Forwarded, Customer } from "./barrel.js";
import { seed } from "./types.js";
import * as Types from "./types.js";
export type Pair<C extends Customer = Customer> = [Forwarded, C];
export type SeedShape = typeof seed;
export type Lazy = import("./types.js").Item;
export type Round = Types.Shapes.Circle;
export type Picked = Types.Mode;
`,
      'src/values.ts': `import type { Order, Money } from "./types.js";
export const total: (order: Order) => Money = order => order.id.length;
export enum Local { A = 1 }
export namespace Space { export const inner: Order = { id: '' }; }
`,
    });
    expect(named(set, code('functions.ts', 'place'))).toEqual([t('Item'), t('Money'), t('Order')]);
    expect(named(set, code('interfaces.ts', 'Merged'))).toEqual([t('Access'), t('Item'), t('Money'), t('Order')]);
    expect(named(set, code('aliases.ts', 'Pair'))).toEqual([t('Customer'), t('Order')]);
    expect(named(set, code('aliases.ts', 'SeedShape'))).toEqual([t('seed')]);
    expect(named(set, code('aliases.ts', 'Lazy'))).toEqual([t('Item')]);
    expect(named(set, code('aliases.ts', 'Round'))).toEqual([t('Shapes/Circle')]);
    expect(named(set, code('aliases.ts', 'Picked'))).toEqual([t('Mode')]);
    expect(named(set, code('values.ts', 'total'))).toEqual([t('Money'), t('Order')]);
    expect(facts(set, code('values.ts', 'Local'))).toEqual({ named: [], inferred: false, unresolved: 0 });
    expect(facts(set, code('values.ts', 'Space'))).toEqual({ named: [], inferred: false, unresolved: 0 });
    expect(named(set, code('values.ts', 'Space/inner'))).toEqual([t('Order')]);
    // Evidence is the first naming position of each entry, aligned with `named`.
    const place = originalOf(set, code('functions.ts', 'place')).companions;
    expect(place.evidence.map(at => [at.file, at.line])).toEqual([['src/functions.ts', 3], ['src/functions.ts', 2], ['src/functions.ts', 2]]);
    expect(place.evidence[2]).toMatchObject({ column: 30 });
  }, 60_000);

  it('reads equivalent declarations, arrows and function expressions alike, and nothing past the signature (SC11)', async () => {
    const signature = '<K extends Cfg = Cfg>(order: Order, fallback: Item = {} as Customer): Money';
    const body = '{ const unused: Result = { ok: true }; void unused; void fallback; return order.id.length; }';
    const { set } = await described({ ...types,
      'src/equivalent.ts': `import type { Order, Item, Money, Customer, Cfg, Result, Kept } from "./types.js";
export function declared${signature} ${body}
export const arrow = ${signature} => ${body};
export const expression = function ${signature} ${body};
export const parenthesized = ((${signature} => ${body}));
export class Holder {
  public open = ${signature} => ${body};
  protected guarded = function ${signature} ${body};
}
export const annotated: (order: Order) => Money = (order: Order, extra?: Customer): Kept => ({ k: order.id.length + (extra ? 1 : 0) });
export class Annotated { public field: (order: Order) => Money = (order: Order, extra?: Customer): Kept => ({ k: 0 }); }
export function bodyOnly(): void { const value: Customer = { name: '' }; void value; }
export function defaultOnly(value: number = ({} as Customer).name.length): void { void value; }
export const initializerOnly: number = ({} as Customer).name.length;
`,
    });
    const expected = [t('Cfg'), t('Item'), t('Money'), t('Order')];
    for (const binding of ['declared', 'arrow', 'expression', 'parenthesized']) {
      expect(facts(set, code('equivalent.ts', binding))).toEqual({ named: expected, inferred: false, unresolved: 0 });
    }
    expect(facts(set, code('equivalent.ts', 'Holder'))).toEqual({ named: expected, inferred: false, unresolved: 0 });
    expect(facts(set, code('equivalent.ts', 'annotated'))).toEqual({ named: [t('Money'), t('Order')], inferred: false, unresolved: 0 });
    expect(facts(set, code('equivalent.ts', 'Annotated'))).toEqual({ named: [t('Money'), t('Order')], inferred: false, unresolved: 0 });
    for (const binding of ['bodyOnly', 'defaultOnly', 'initializerOnly']) {
      expect(facts(set, code('equivalent.ts', binding))).toEqual({ named: [], inferred: false, unresolved: 0 });
    }
  }, 60_000);

  it('drops external, library, type-parameter, self and hidden-member references (SC12)', async () => {
    const { set } = await described({ ...types,
      'node_modules/external-kit/package.json': '{"name":"external-kit","types":"index.d.ts"}\n',
      'node_modules/external-kit/index.d.ts': 'export interface Widget { readonly w: number }\n',
      'src/foreign.ts': `import type { Widget } from "external-kit";
import type { Order } from "./types.js";
export interface Linked<T extends Order> { readonly next: Linked<T>; readonly widget: Widget; readonly when: Promise<Date>; readonly item: T }
export function echo<V>(value: V): V { return value; }
`,
      'src/members.ts': `import type { Access, Built, Cfg, Guarded, Hidden, Item, Order, Result, Secret, Written, Kept } from "./types.js";
import { Store } from "./types.js";
export class Service<C extends Cfg = Cfg> extends Store implements Access {
  readonly a = 1;
  constructor(private readonly dependency: Built, protected written: Written) { super(); }
  public order: Order = { id: '' };
  protected guard(value: Guarded): void { void value; }
  private hidden(value: Hidden): void { void value; }
  #secret: Secret = { s: 0 };
  get result(): Result { return { ok: !!this.dependency && !!this.#secret }; }
  set item(value: Item) { void value; }
  static make(config: Kept): void { void config; }
  pick<D extends C>(value: D): D { return value; }
}
export class Sealed { private constructor(value: Hidden) { void value; } }
`,
    });
    expect(facts(set, code('foreign.ts', 'Linked'))).toEqual({ named: [t('Order')], inferred: false, unresolved: 0 });
    expect(facts(set, code('foreign.ts', 'echo'))).toEqual({ named: [], inferred: false, unresolved: 0 });
    expect(facts(set, code('members.ts', 'Service'))).toEqual({ named: [t('Access'), t('Built'), t('Cfg'), t('Guarded'), t('Item'),
      t('Kept'), t('Order'), t('Result'), t('Store'), t('Written')], inferred: true, unresolved: 0 });
    expect(facts(set, code('members.ts', 'Sealed'))).toEqual({ named: [], inferred: false, unresolved: 0 });
  }, 60_000);

  it('records inferred and unresolved facts for every exported original (SC13)', async () => {
    const { set } = await described({ ...types,
      'outside/shared.ts': 'export interface Shared { readonly s: number }\n',
      'src/limits.ts': `import type { Order, Money, Customer } from "./types.js";
import type { Shared } from "../outside/shared.js";
function make(): Order { return { id: '' }; }
export function noReturn(order: Order) { return order; }
export const fromCall = make();
export class Loose { value = 1; typed: Customer = { name: '' }; }
export const full = (order: Order): Money => order.id.length;
export const partial = (order: Order, extra): Money => order.id.length + (extra ? 1 : 0);
export const expressionPartial = function (order: Order) { return order; };
export function broken(value: Missing): void { void value; }
export function outside(value: Shared): void { void value; }
function unexposed(order: Order) { return order; }
export { unexposed };
`,
    });
    expect(facts(set, code('limits.ts', 'noReturn'))).toEqual({ named: [t('Order')], inferred: true, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'fromCall'))).toEqual({ named: [], inferred: true, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'Loose'))).toEqual({ named: [t('Customer')], inferred: true, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'full'))).toEqual({ named: [t('Money'), t('Order')], inferred: false, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'partial'))).toEqual({ named: [t('Money'), t('Order')], inferred: true, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'expressionPartial'))).toEqual({ named: [t('Order')], inferred: true, unresolved: 0 });
    expect(facts(set, code('limits.ts', 'broken'))).toEqual({ named: [], inferred: false, unresolved: 1 });
    expect(facts(set, code('limits.ts', 'outside'))).toEqual({ named: [], inferred: false, unresolved: 1 });
    expect(facts(set, code('limits.ts', 'unexposed'))).toEqual({ named: [t('Order')], inferred: true, unresolved: 0 });
  }, 60_000);
  it('adds one batched symbol request and no type-level request for forty signature references (SC14)', async () => {
    const references = Array.from({ length: 4 }, (_, index) =>
      `export function fn${index}(a: Order, b: Item, c: Types.Shapes.Circle): Money { void a; void b; void c; return 0; }\n`
      + `export const arrow${index} = <K extends Kept>(a: Customer, b: Cfg): Result => ({ ok: !!a && !!b });\n`).join('')
      + Array.from({ length: 2 }, (_, index) =>
        `export const expression${index} = function (a: Built, b: import("./types.js").Item): Order | Money { void a; void b; return 0; };\n`).join('');
    const bodies = Array.from({ length: 4 }, (_, index) =>
      `export function fn${index}(a: unknown, b: unknown, c: unknown): number { const x: Order | Item | Types.Shapes.Circle | Money = 0 as never; void a; void b; void c; void x; return 0; }\n`
      + `export const arrow${index} = <K extends unknown>(a: unknown, b: unknown): unknown => { const y: Customer | Cfg | Result | Kept = 0 as never; void a; void b; return y; };\n`).join('')
      + Array.from({ length: 2 }, (_, index) =>
        `export const expression${index} = function (a: unknown, b: unknown): unknown { const z: Built | import("./types.js").Item | Order | Money = 0 as never; void a; void b; return z; };\n`).join('');
    const header = 'import type { Order, Item, Money, Customer, Cfg, Result, Kept, Built } from "./types.js";\nimport type * as Types from "./types.js";\n';
    const measure = async (content: string): Promise<{ requests: Requests; witness: number; set: DescriptionSet }> => {
      const root = await start({ ...types, 'src/wide.ts': header + content });
      const set = createDescriptionSet(), requests: Requests = new Map();
      const before = companionSymbolRequests();
      await describeState(root, set, undefined, requests);
      return { requests, witness: companionSymbolRequests() - before, set };
    };
    const signatures = await measure(references), control = await measure(bodies);
    const harvested = [0, 1, 2, 3].flatMap(index => [`fn${index}`, `arrow${index}`]).concat(['expression0', 'expression1'])
      .reduce((total, binding) => total + originalOf(signatures.set, code('wide.ts', binding)).companions.named.length, 0);
    expect(harvested).toBe(4 * 4 + 4 * 4 + 2 * 4);
    expect(facts(signatures.set, code('wide.ts', 'expression0'))).toEqual({ named: [t('Built'), t('Item'), t('Money'), t('Order')], inferred: false, unresolved: 0 });
    // Every described file of one round shares the round's single batched request.
    expect(signatures.witness).toBe(1);
    const added = new Map([...signatures.requests].flatMap(([method, count]) => {
      const difference = count - (control.requests.get(method) ?? 0);
      return difference ? [[method, difference] as const] : [];
    }));
    expect([...added]).toEqual([['getSymbolsAtLocations', 1]]);
    expect([...control.requests.keys()].filter(method => method !== 'getSymbolsAtLocations'))
      .toEqual([...signatures.requests.keys()].filter(method => method !== 'getSymbolsAtLocations'));
    for (const method of ['getTypeOfSymbol', 'getTypesOfSymbols', 'getSignaturesOfType', 'typeToTypeNode', 'getDeclaredTypeOfSymbol']) {
      expect(signatures.requests.get(method) ?? 0).toBe(control.requests.get(method) ?? 0);
    }
  }, 60_000);

  const none: SourceChangeSet = { changed: [], created: [], deleted: [], inventory: null, invalidateAll: false };
  async function retained(root: string) {
    const view = await acquire(root);
    const inventory = view.inventory, areas = areasFor(view);
    const analysis = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'), inventory, areas,
      limits: sourceLimits, sink: { file() {}, directory() {}, absent() {}, probe() {} } });
    await analysis.describe([]);
    return analysis;
  }
  /** A fresh batch description of `path` over the current disk state. */
  async function batch(root: string, path: string): Promise<FileDescription> {
    // The fixture's view is not disposed: that would forget the fixture's definition.
    const view = await acquire(root);
    const descriptions = await describeFiles({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits },
      view.inventory.files.map(file => file.path));
    return descriptions.find(entry => entry.file === path)!;
  }
  const retainedOf = (update: { readonly descriptions: readonly FileDescription[] }, path: string): FileDescription =>
    update.descriptions.find(entry => entry.file === path)!;

  it('classifies a moved signature as moved with refreshed evidence and a new companion as changed (SC15)', async () => {
    const root = await start({ ...types,
      'src/moving.ts': 'import type { Order, Item } from "./types.js";\nexport function move(order: Order): void { void order; }\n' });
    const analysis = await retained(root);
    try {
      await put(root, 'src/moving.ts', 'import type { Order, Item } from "./types.js";\n\nexport function move(order: Order): void { void order; }\n');
      await analysis.update({ ...none, changed: ['src/moving.ts'] });
      const moved = await analysis.describe(['src/moving.ts']);
      expect([moved.delta.changed, moved.delta.moved]).toEqual([[], ['src/moving.ts']]);
      const refreshed = retainedOf(moved, 'src/moving.ts').originals.find(entry => entry.id.binding === 'move')!.companions;
      expect(refreshed.evidence.map(at => [at.file, at.line, at.column])).toEqual([['src/moving.ts', 3, 29]]);
      expect(retainedOf(moved, 'src/moving.ts')).toEqual(await batch(root, 'src/moving.ts'));

      await put(root, 'src/moving.ts', 'import type { Order, Item } from "./types.js";\n\nexport function move(order: Order, item: Item): void { void order; void item; }\n');
      await analysis.update({ ...none, changed: ['src/moving.ts'] });
      const changed = await analysis.describe(['src/moving.ts']);
      expect([changed.delta.changed, changed.delta.moved]).toEqual([['src/moving.ts'], []]);
      expect(changed.delta.changedOriginals.map(id => id.binding)).toEqual(['move']);
      const grown = retainedOf(changed, 'src/moving.ts').originals.find(entry => entry.id.binding === 'move')!.companions;
      expect(grown.named.map(id => id.binding)).toEqual(['Item', 'Order']);
      expect(retainedOf(changed, 'src/moving.ts')).toEqual(await batch(root, 'src/moving.ts'));
    } finally { await analysis.dispose(); }
  }, 90_000);

  it('recomputes a declaring file when only its barrel forwards a different original (SC27)', async () => {
    const root = await start({
      'src/a.ts': 'export interface Alpha { readonly a: number }\n',
      'src/b.ts': 'export interface Beta { readonly b: number }\n',
      'src/forward.ts': 'export type { Alpha as Target } from "./a.js";\n',
      'src/user.ts': 'import type { Target } from "./forward.js";\nexport function use(target: Target): void { void target; }\n',
    });
    const analysis = await retained(root);
    try {
      const before = analysis.catalog().originals.find(entry => entry.id.binding === 'use')!;
      expect(before.companions.named).toEqual([code('a.ts', 'Alpha')]);
      await put(root, 'src/forward.ts', 'export type { Beta as Target } from "./b.js";\n');
      await analysis.update({ ...none, changed: ['src/forward.ts'] });
      const update = await analysis.describe(['src/forward.ts']);
      expect(update.delta.recomputed).toContain('src/user.ts');
      const user = retainedOf(update, 'src/user.ts');
      expect(user.originals.find(entry => entry.id.binding === 'use')!.companions.named).toEqual([code('b.ts', 'Beta')]);
      expect(user.dependencies.files).toContain('src/forward.ts');
      expect(user).toEqual(await batch(root, 'src/user.ts'));
    } finally { await analysis.dispose(); }
  }, 90_000);
  it('describes the harvesting fixture equally in the retained session and in batch', async () => {
    const root = await start({ ...types,
      'src/limits.ts': 'import type { Order, Money } from "./types.js";\nexport const full = (order: Order): Money => order.id.length;\nexport function loose(order: Order) { return order; }\n',
      'src/aliases.ts': 'import type { Forwarded } from "./barrel.js";\nimport * as Types from "./types.js";\nexport type Pair = [Forwarded, Types.Shapes.Circle, import("./types.js").Item];\n' });
    const analysis = await retained(root);
    try {
      const view = await acquire(root);
      const files = view.inventory.files.map(file => file.path);
      const { descriptions } = await analysis.describe(files);
      const batched = await describeFiles({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits }, files);
      expect(descriptions).toEqual(batched);
      expect(descriptions.flatMap(entry => entry.originals).find(entry => entry.id.binding === 'Pair')!.companions.named
        .map(id => id.binding)).toEqual(['Item', 'Order', 'Shapes/Circle']);
    } finally { await analysis.dispose(); }
  }, 90_000);
});
