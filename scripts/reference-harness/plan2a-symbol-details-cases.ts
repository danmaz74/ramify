import { API } from 'typescript/unstable/sync';
import { rm } from 'node:fs/promises';
import { describeSymbolDetails } from '../../subs/analysis/subs/typescript/src/symbol-details.js';
import type { SymbolDetailLimits, SymbolDetailRequest } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import type { OriginalId } from '../../subs/analysis/subs/model/src/interfaces/model.js';
import { acquire, areasFor, fixture } from '../../subs/analysis/subs/typescript/src/tests/fixtures.js';
import type { InstanceHandler } from './runner.js';

/**
 * The eight `I2A-04` leaves, ported from
 * `subs/analysis/subs/typescript/src/tests/symbol-details.test.ts`'s own
 * fixture-F unit tests into harness-registered evidence, over a real,
 * independently opened `typescript/unstable/sync` compiler project (the same
 * pattern that test file and `descriptions.test.ts` use), so `--iteration 5`'s
 * transitive `--iteration 4` requirement has real, executed evidence rather
 * than an unregistered owner test. Only declaration kinds unaffected by the
 * concurrent class-rendering work on `symbol-details.ts` (function, plain
 * class with no heritage/static members, interface, type-alias, enum,
 * variable, default export) are exercised here, to avoid racing that edit.
 */
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

const roots: string[] = [];
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
async function detail(files: Readonly<Record<string, string>>, requests: readonly SymbolDetailRequest[],
  overrideLimits: SymbolDetailLimits = limits, signal?: AbortSignal) {
  return withProject(files, (project, inputs) => describeSymbolDetails(project, inputs, requests, overrideLimits, signal));
}
async function cleanup(): Promise<void> {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
}

export const plan2aSymbolDetailsHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2A-04:declaration-kinds', { kind: 'memory', run: async ({ assertions }) => { try {
    const [fn, widget, shape, id, color, variable, defaultExport] = await detail({ 'src/originals.ts': originals }, [
      { original: code('originals.ts', 'add'), exportName: 'add' }, { original: code('originals.ts', 'Widget'), exportName: 'Widget' },
      { original: code('originals.ts', 'Shape'), exportName: 'Shape' }, { original: code('originals.ts', 'Id'), exportName: 'Id' },
      { original: code('originals.ts', 'Color'), exportName: 'Color' }, { original: code('originals.ts', 'total'), exportName: 'total' },
      { original: code('originals.ts', 'defaultGreeter'), exportName: 'default' },
    ]);
    assertions.ok('a function renders a body-free overloaded signature', fn!.state === 'described' && (fn as { signature: string }).signature.startsWith('function add('));
    assertions.ok('a class renders body-free, omitting the private field', widget!.state === 'described'
      && (widget as { signature: string }).signature.startsWith('class Widget {') && !(widget as { signature: string }).signature.includes('secret'));
    assertions.ok('an interface is printed directly without the export keyword', shape!.state === 'described' && (shape as { signature: string }).signature.startsWith('interface Shape {'));
    assertions.equal('a type-alias is printed directly', id, { state: 'described', original: code('originals.ts', 'Id'), exportName: 'Id', signature: 'type Id = string | number;', documentation: 'An identifier is either numeric or textual.' });
    assertions.ok('an enum is printed directly', color!.state === 'described' && (color as { signature: string }).signature.startsWith('enum Color {'));
    assertions.equal('a variable renders as const name: Type without its initializer', variable, { state: 'described', original: code('originals.ts', 'total'), exportName: 'total', signature: 'const total: number', documentation: 'The fixed total used by every fixture request.' });
    assertions.equal('a named default export uses the catalog export name, not the declared identifier', defaultExport, { state: 'described', original: code('originals.ts', 'defaultGreeter'), exportName: 'default', signature: 'function default(name: string): string;', documentation: 'The default export greets a name.' });
  } finally { await cleanup(); } } }],
  ['I2A-04:overloads', { kind: 'memory', run: async ({ assertions }) => { try {
    const [full] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'add'), exportName: 'add' }]);
    assertions.equal('both distinct overloads are retained in compiler order, with no implementation body', full,
      { state: 'described', original: code('originals.ts', 'add'), exportName: 'add',
        signature: 'function add(a: number, b: number): number;\nfunction add(a: string, b: string): string;', documentation: 'Adds two values of the same kind together.' });
    const [bounded] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'add'), exportName: 'add' }], { ...limits, maxOverloads: 1 });
    assertions.equal('the overload bound retains only the first overload and marks it truncated', bounded,
      { state: 'truncated', original: code('originals.ts', 'add'), exportName: 'add', signature: 'function add(a: number, b: number): number;',
        documentation: 'Adds two values of the same kind together.', truncated: ['overloads'] });
  } finally { await cleanup(); } } }],
  ['I2A-04:first-documentation-paragraph', { kind: 'memory', run: async ({ assertions }) => { try {
    const irregular = '/** First   paragraph\twith\n   irregular whitespace.\n *\n * A second paragraph that must never appear.\n */\nexport const spaced: number = 1;\n';
    const [result] = await detail({ 'src/originals.ts': irregular }, [{ original: code('originals.ts', 'spaced'), exportName: 'spaced' }]);
    assertions.equal('internal whitespace is normalized and only the first paragraph is retained', result,
      { state: 'described', original: code('originals.ts', 'spaced'), exportName: 'spaced', signature: 'const spaced: number', documentation: 'First paragraph with irregular whitespace.' });
  } finally { await cleanup(); } } }],
  ['I2A-04:no-documentation', { kind: 'memory', run: async ({ assertions }) => { try {
    const [result] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'undocumented'), exportName: 'undocumented' }]);
    assertions.equal('missing documentation omits the field, never a placeholder', result,
      { state: 'described', original: code('originals.ts', 'undocumented'), exportName: 'undocumented', signature: 'const undocumented: number' });
    assertions.ok('the documentation key is genuinely absent, not an empty string', !Object.hasOwn(result as object, 'documentation'));
  } finally { await cleanup(); } } }],
  ['I2A-04:byte-truncation', { kind: 'memory', run: async ({ assertions }) => { try {
    const [full] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'unicodeDoc'), exportName: 'unicodeDoc' }]);
    assertions.ok('a full-budget multibyte documentation paragraph is undisturbed', full!.state === 'described'
      && (full as { documentation: string }).documentation === '日本語のドキュメント文字列で、複数バイト文字が境界で分割されないことを確認するために十分な長さを持つ説明文です。これはさらに長くするための追加の文章です。');
    const [truncatedDoc] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'unicodeDoc'), exportName: 'unicodeDoc' }], { ...limits, maxDocumentationBytes: 40 });
    const documentation = truncatedDoc!.state === 'truncated' ? (truncatedDoc as { documentation: string }).documentation : '';
    assertions.ok('multibyte documentation truncates on a byte boundary with no replacement character, staying within the byte bound',
      truncatedDoc!.state === 'truncated' && !documentation.includes('�') && Buffer.byteLength(documentation, 'utf8') <= 40);
    const [truncatedSig] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }], { ...limits, maxSignatureBytes: 6 });
    assertions.ok('a tight signature bound truncates at a byte-safe boundary and names the bound',
      truncatedSig!.state === 'truncated' && (truncatedSig as { signature: string }).signature === 'const ' && (truncatedSig as { truncated: readonly string[] }).truncated.includes('signature'));
  } finally { await cleanup(); } } }],
  ['I2A-04:identity-and-alias', { kind: 'memory', run: async ({ assertions }) => { try {
    const [mismatch] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'wrongBinding'), exportName: 'total' }]);
    assertions.equal('a claimed original that disagrees with the resolved declaration is identity-mismatch', mismatch,
      { state: 'unavailable', original: code('originals.ts', 'wrongBinding'), exportName: 'total', reason: 'identity-mismatch' });
    const [forwarded] = await detail({ 'src/originals.ts': originals, 'src/forward.ts': "export { total as forwardedTotal } from './originals.js';\n" },
      [{ original: code('originals.ts', 'total'), exportName: 'forwardedTotal' }]);
    assertions.equal('a forwarding-alias export name is not the defining file\'s own export, so lookup finds nothing', forwarded,
      { state: 'unavailable', original: code('originals.ts', 'total'), exportName: 'forwardedTotal', reason: 'missing-export' });
  } finally { await cleanup(); } } }],
  ['I2A-04:isolated-unavailable', { kind: 'memory', run: async ({ assertions }) => { try {
    const [missing, later] = await detail({ 'src/originals.ts': originals }, [
      { original: code('originals.ts', 'doesNotExist'), exportName: 'doesNotExist' }, { original: code('originals.ts', 'total'), exportName: 'total' },
    ]);
    assertions.equal('a missing export is isolated, unavailable/missing-export', missing,
      { state: 'unavailable', original: code('originals.ts', 'doesNotExist'), exportName: 'doesNotExist', reason: 'missing-export' });
    assertions.ok('a later valid request in the same batch still resolves', later!.state === 'described');
    const [namespaceResult] = await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'Grouped'), exportName: 'Grouped' }]);
    assertions.equal('a namespace export is unsupported-declaration', namespaceResult,
      { state: 'unavailable', original: code('originals.ts', 'Grouped'), exportName: 'Grouped', reason: 'unsupported-declaration' });
    const [resourceResult] = await detail({ 'src/originals.ts': originals },
      [{ original: { kind: 'resource', owner: 'fixture', file: 'originals.ts', binding: 'total' }, exportName: 'total' }]);
    assertions.equal('a resource-kind original is unsupported-declaration without touching the compiler', resourceResult,
      { state: 'unavailable', original: { kind: 'resource', owner: 'fixture', file: 'originals.ts', binding: 'total' }, exportName: 'total', reason: 'unsupported-declaration' });
  } finally { await cleanup(); } } }],
  ['I2A-04:protocol-lifecycle', { kind: 'memory', run: async ({ assertions }) => { try {
    let rejectedOversized = false;
    try { await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }], { ...limits, maxResultBytes: 10 }); }
    catch (error) { rejectedOversized = (error as { code?: string }).code === 'resource-limit'; }
    assertions.ok('exceeding maxResultBytes rejects the whole call with no partial result', rejectedOversized);

    let rejectedInvalid = false;
    try { await detail({ 'src/originals.ts': originals }, [{ original: { kind: 'code', owner: '', file: '', binding: '' }, exportName: 'total' }]); }
    catch (error) { rejectedInvalid = (error as { code?: string }).code === 'protocol-error'; }
    assertions.ok('a structurally invalid request rejects the whole call, never an isolated unavailable entry', rejectedInvalid);

    const controller = new AbortController();
    controller.abort();
    let rejectedCancelled = false;
    try { await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }], limits, controller.signal); }
    catch (error) { rejectedCancelled = (error as { code?: string }).code === 'cancelled'; }
    assertions.ok('an already-cancelled call rejects with no result', rejectedCancelled);

    let rejectedLimits = false;
    try { await detail({ 'src/originals.ts': originals }, [{ original: code('originals.ts', 'total'), exportName: 'total' }], { ...limits, maxOverloads: 0 }); }
    catch (error) { rejectedLimits = (error as { code?: string }).code === 'resource-limit'; }
    assertions.ok('non-positive-safe-integer limits are rejected', rejectedLimits);
  } finally { await cleanup(); } } }],
]);
