import { rm } from 'node:fs/promises';
import { API } from 'typescript/unstable/sync';
import { afterEach, describe, expect, it } from 'vitest';
import { describeSymbolDetails } from '../symbol-details.js';
import type { SymbolDetailLimits, SymbolDetailRequest } from '../interfaces/source.js';
import type { OriginalId } from '../../../model/src/interfaces/model.js';
import { acquire, areasFor, fixture } from './fixtures.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const limits: SymbolDetailLimits = { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 * 1024 };
const code = (file: string, binding: string): OriginalId => ({ kind: 'code', owner: 'fixture', file, binding });

const originals = `/** Adds two values of the same kind together.
 *
 * This second paragraph, with its own    irregular   whitespace, must never
 * appear in a first-paragraph extraction.
 */
export function add(a: number, b: number): number;
export function add(a: string, b: string): string;
export function add(a: number | string, b: number | string): number | string {
  return (a as number) + (b as number);
}

/** A minimal widget with one rendering method. */
export class Widget {
  constructor(public readonly id: string) {}
  private secret = 1;
  render(): string { return this.id; }
}

/** A shape that can report its own area. */
export interface Shape {
  readonly kind: string;
  area(): number;
}

/** An identifier is either numeric or textual. */
export type Id = string | number;

/** The fixed total used by every fixture request. */
export const total: number = 42;

/** Primary colors used by the fixture. */
export enum Color { Red, Green, Blue }

/** 日本語のドキュメント文字列で、複数バイト文字が境界で分割されないことを確認するために十分な長さを持つ説明文です。これはさらに長くするための追加の文章です。 */
export const unicodeDoc: string = 'x';

// No documentation comment at all: the details entry must omit \`documentation\`.
export const undocumented: number = 7;

/** The default export greets a name. */
export default function defaultGreeter(name: string): string { return \`Hello, \${name}\`; }

/** A namespace export: unsupported by symbol-detail rendering. */
export namespace Grouped { export const hidden = 1; }
`;

/** Open a real compiler snapshot over the fixture's current disk state and
 * call `describeSymbolDetails` against it, mirroring the retained adapter's
 * own in-process use (no compiler-helper child process is involved). */
async function withProject<T>(files: Readonly<Record<string, string>>,
  run: (project: import('typescript/unstable/sync').Project, inputs: { inventory: Awaited<ReturnType<typeof acquire>>['inventory']; areas: ReturnType<typeof areasFor> }) => T | Promise<T>): Promise<T> {
  const root = await fixture(files);
  roots.push(root);
  const view = await acquire(root);
  const inputs = { inventory: view.inventory, areas: areasFor(view) };
  const configuration = `${root}/tsconfig.json`;
  const api = new API({ cwd: root });
  let snapshot: ReturnType<API['updateSnapshot']> | undefined;
  try {
    snapshot = api.updateSnapshot({ openProjects: [configuration] });
    const project = snapshot.getProject(configuration);
    if (!project) throw new Error('The compiler could not create the fixture project');
    return await run(project, inputs);
  } finally { snapshot?.dispose(); api.close(); }
}

function detail(files: Readonly<Record<string, string>>, requests: readonly SymbolDetailRequest[],
  overrideLimits: SymbolDetailLimits = limits, signal?: AbortSignal) {
  return withProject(files, (project, inputs) => describeSymbolDetails(project, inputs, requests, overrideLimits, signal));
}

describe('describeSymbolDetails', () => {
  it('renders a body-free overloaded function signature with its first documentation paragraph', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'add'), exportName: 'add' }]);
    expect(result).toEqual({
      state: 'described', original: code('originals.ts', 'add'), exportName: 'add',
      signature: 'function add(a: number, b: number): number;\nfunction add(a: string, b: string): string;',
      documentation: 'Adds two values of the same kind together.',
    });
  });

  it('normalizes irregular internal whitespace in the retained first paragraph and drops later paragraphs', async () => {
    const irregular = `/** First   paragraph\twith\n   irregular whitespace.
 *
 * A second paragraph that must never appear.
 */
export const spaced: number = 1;
`;
    const [result] = await detail({ 'src/originals.ts': irregular }, [{ original: code('originals.ts', 'spaced'), exportName: 'spaced' }]);
    expect(result).toMatchObject({ state: 'described', documentation: 'First paragraph with irregular whitespace.' });
  });

  it('marks overloads truncated and keeps only the retained overload when maxOverloads is exceeded', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'add'), exportName: 'add' }],
      { ...limits, maxOverloads: 1 });
    expect(result).toEqual({
      state: 'truncated', original: code('originals.ts', 'add'), exportName: 'add',
      signature: 'function add(a: number, b: number): number;',
      documentation: 'Adds two values of the same kind together.', truncated: ['overloads'],
    });
  });

  it('renders a body-free class from checker facts, omitting the private field', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'Widget'), exportName: 'Widget' }]);
    expect(result).toEqual({
      state: 'described', original: code('originals.ts', 'Widget'), exportName: 'Widget',
      signature: 'class Widget { constructor(id: string); readonly id: string; render(): string; }',
      documentation: 'A minimal widget with one rendering method.',
    });
    expect((result as { signature: string }).signature).not.toContain('secret');
  });

  it('renders interface, type-alias and enum declarations by direct printing, without the export keyword', async () => {
    const [shape, id, color] = await detail({ 'src/originals.ts': originals }, [
      { original: code('originals.ts', 'Shape'), exportName: 'Shape' },
      { original: code('originals.ts', 'Id'), exportName: 'Id' },
      { original: code('originals.ts', 'Color'), exportName: 'Color' },
    ]);
    expect(shape).toMatchObject({ state: 'described', signature: 'interface Shape {\n    readonly kind: string;\n    area(): number;\n}' });
    expect(id).toMatchObject({ state: 'described', signature: 'type Id = string | number;' });
    expect(color).toMatchObject({ state: 'described', signature: 'enum Color {\n    Red,\n    Green,\n    Blue\n}' });
  });

  it('renders a variable as const name: Type without its initializer', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }]);
    expect(result).toEqual({
      state: 'described', original: code('originals.ts', 'total'), exportName: 'total',
      signature: 'const total: number', documentation: 'The fixed total used by every fixture request.',
    });
  });

  it('renders a named default export using the catalog export name, not the declared identifier', async () => {
    const [result] = await detail({ 'src/originals.ts': originals },
      [{ original: code('originals.ts', 'defaultGreeter'), exportName: 'default' }]);
    expect(result).toEqual({
      state: 'described', original: code('originals.ts', 'defaultGreeter'), exportName: 'default',
      signature: 'function default(name: string): string;', documentation: 'The default export greets a name.',
    });
  });

  it('omits the documentation field entirely for an export with no documentation comment', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'undocumented'), exportName: 'undocumented' }]);
    expect(result).toEqual({ state: 'described', original: code('originals.ts', 'undocumented'), exportName: 'undocumented', signature: 'const undocumented: number' });
    expect(result).not.toHaveProperty('documentation');
  });

  it('keeps a full-budget multibyte documentation paragraph undisturbed', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'unicodeDoc'), exportName: 'unicodeDoc' }]);
    expect(result).toMatchObject({ state: 'described', documentation: '日本語のドキュメント文字列で、複数バイト文字が境界で分割されないことを確認するために十分な長さを持つ説明文です。これはさらに長くするための追加の文章です。' });
  });

  it('truncates multibyte documentation on a byte boundary without a replacement character', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'unicodeDoc'), exportName: 'unicodeDoc' }],
      { ...limits, maxDocumentationBytes: 40 });
    expect(result).toMatchObject({ state: 'truncated', truncated: ['documentation'] });
    const documentation = (result as { documentation: string }).documentation;
    expect(documentation).not.toContain('�');
    expect(Buffer.byteLength(documentation, 'utf8')).toBeLessThanOrEqual(40);
  });

  it('marks the signature truncated at a byte-safe boundary under a tight signature bound', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }],
      { ...limits, maxSignatureBytes: 6 });
    expect(result).toMatchObject({ state: 'truncated', signature: 'const ', truncated: ['signature'] });
  });

  it('returns unavailable/missing-export for a name absent from the defining file, isolated from other requests', async () => {
    const [missing, later] = await detail({ 'src/originals.ts': originals }, [
      { original: code('originals.ts', 'doesNotExist'), exportName: 'doesNotExist' },
      { original: code('originals.ts', 'total'), exportName: 'total' },
    ]);
    expect(missing).toEqual({ state: 'unavailable', original: code('originals.ts', 'doesNotExist'), exportName: 'doesNotExist', reason: 'missing-export' });
    expect(later).toMatchObject({ state: 'described' });
  });

  it('returns unavailable/unsupported-declaration for a namespace export', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'Grouped'), exportName: 'Grouped' }]);
    expect(result).toEqual({ state: 'unavailable', original: code('originals.ts', 'Grouped'), exportName: 'Grouped', reason: 'unsupported-declaration' });
  });

  it('returns unavailable/unsupported-declaration for a resource-kind original without touching the compiler', async () => {
    const [result] = await detail({ 'src/originals.ts': originals },
      [{ original: { kind: 'resource', owner: 'fixture', file: 'originals.ts', binding: 'total' }, exportName: 'total' }]);
    expect(result).toEqual({ state: 'unavailable', original: { kind: 'resource', owner: 'fixture', file: 'originals.ts', binding: 'total' }, exportName: 'total', reason: 'unsupported-declaration' });
  });

  it('returns unavailable/identity-mismatch when the requested original does not match the resolved declaration', async () => {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'wrongBinding'), exportName: 'total' }]);
    expect(result).toEqual({ state: 'unavailable', original: code('originals.ts', 'wrongBinding'), exportName: 'total', reason: 'identity-mismatch' });
  });

  it('never resolves a forwarding-alias export name against the defining file, since that name is not its own export', async () => {
    const [result] = await detail({
      'src/originals.ts': originals,
      'src/forward.ts': "export { total as forwardedTotal } from './originals.js';\n",
    }, [{ original: code('originals.ts', 'total'), exportName: 'forwardedTotal' }]);
    expect(result).toEqual({ state: 'unavailable', original: code('originals.ts', 'total'), exportName: 'forwardedTotal', reason: 'missing-export' });
  });

  it('returns one result per unique request in first-occurrence order', async () => {
    const results = await detail({ 'src/originals.ts': originals }, [
      { original: code('originals.ts', 'total'), exportName: 'total' },
      { original: code('originals.ts', 'add'), exportName: 'add' },
      { original: code('originals.ts', 'total'), exportName: 'total' },
    ]);
    expect(results).toHaveLength(2);
    expect(results.map(entry => entry.exportName)).toEqual(['total', 'add']);
  });

  it('rejects the whole call when the total encoded result exceeds maxResultBytes', async () => {
    await expect(detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }],
      { ...limits, maxResultBytes: 10 })).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('rejects the whole call for a structurally invalid request instead of an isolated unavailable entry', async () => {
    await expect(detail({ 'src/originals.ts': originals },
      [{ original: { kind: 'code', owner: '', file: '', binding: '' }, exportName: 'total' }]))
      .rejects.toMatchObject({ code: 'protocol-error' });
    await expect(detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: '' }]))
      .rejects.toMatchObject({ code: 'protocol-error' });
  });

  it('rejects an already-cancelled call with no result', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }],
      limits, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('rejects when the supplied limits are not positive safe integers', async () => {
    await expect(detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }],
      { ...limits, maxOverloads: 0 })).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('renders a class\'s own type parameters and extends/implements heritage clauses as written', async () => {
    const src = `export class Base { greet(): string { return 'hi'; } }
export interface Labeled { readonly label: string }
export class Shape<T extends Base = Base> extends Base implements Labeled {
  readonly label: string = '';
}
`;
    const [result] = await detail({ 'src/originals.ts': src }, [{ original: code('originals.ts', 'Shape'), exportName: 'Shape' }]);
    expect(result).toMatchObject({
      state: 'described',
      signature: 'class Shape<T extends Base = Base> extends Base implements Labeled { constructor(); greet(): string; readonly label: string; }',
    });
  });

  it('renders an abstract class as abstract, with a constructor parameter list stripped of the repeated class type parameters', async () => {
    const src = `export abstract class Container<T> {
  constructor(readonly value: T) {}
  abstract read(): T;
}
`;
    const [result] = await detail({ 'src/originals.ts': src }, [{ original: code('originals.ts', 'Container'), exportName: 'Container' }]);
    expect(result).toMatchObject({
      state: 'described',
      signature: 'abstract class Container<T> { constructor(value: T); abstract read(): T; readonly value: T; }',
    });
  });

  it('renders static members before instance members, keeps public and protected modifiers, and omits private and #private members', async () => {
    const src = `export class Base {
  readonly baseId: string = 'base';
}
export abstract class Shape extends Base {
  static readonly kind: string = 'shape';
  static count = 0;
  private static secret = 1;
  #hidden = true;
  protected owner: string;
  readonly id: string = 'shape-id';
  optionalLabel?: string;
  abstract area(): number;
  protected describe(): string { return this.owner; }
  private helper(): void {}
  render(): string;
  render(prefix: string): string;
  render(prefix?: string): string { return prefix ? prefix + this.owner : this.owner; }
  constructor(owner: string) { super(); this.owner = owner; }
}
`;
    const [result] = await detail({ 'src/originals.ts': src }, [{ original: code('originals.ts', 'Shape'), exportName: 'Shape' }]);
    expect(result).toMatchObject({
      state: 'described',
      signature: 'abstract class Shape extends Base { constructor(owner: string); static count: number; static readonly kind: string; '
        + 'abstract area(): number; readonly baseId: string; protected describe(): string; readonly id: string; '
        + 'optionalLabel?: string; protected owner: string; render(): string; render(prefix: string): string; }',
    });
    const signature = (result as { signature: string }).signature;
    expect(signature).not.toContain('secret');
    expect(signature).not.toContain('hidden');
    expect(signature).not.toContain('helper');
  });

  it('renders a getter-only accessor as a readonly property and a getter/setter pair as a writable property, never as get/set syntax', async () => {
    const src = `export class Store {
  #value = '';
  get readOnlyView(): string { return this.#value; }
  get writableView(): string { return this.#value; }
  set writableView(next: string) { this.#value = next; }
}
`;
    const [result] = await detail({ 'src/originals.ts': src }, [{ original: code('originals.ts', 'Store'), exportName: 'Store' }]);
    expect(result).toMatchObject({
      state: 'described',
      signature: 'class Store { constructor(); readonly readOnlyView: string; writableView: string; }',
    });
  });

  it('renders an unannotated exported const with its narrow literal type but widens an unannotated let/var to its base type, matching real .d.ts emission', async () => {
    const src = `export const constLiteral = 'literal';
export let letLiteral = 'literal';
export var varLiteral = 'literal';
`;
    const [constResult, letResult, varResult] = await detail({ 'src/originals.ts': src }, [
      { original: code('originals.ts', 'constLiteral'), exportName: 'constLiteral' },
      { original: code('originals.ts', 'letLiteral'), exportName: 'letLiteral' },
      { original: code('originals.ts', 'varLiteral'), exportName: 'varLiteral' },
    ]);
    expect(constResult).toMatchObject({ state: 'described', signature: 'const constLiteral: "literal"' });
    expect(letResult).toMatchObject({ state: 'described', signature: 'const letLiteral: string' });
    expect(varResult).toMatchObject({ state: 'described', signature: 'const varLiteral: string' });
  });
});
