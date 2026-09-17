import { describe, expect, it } from 'vitest';
import type { DependencyBehaviorFacts } from '../interfaces/dependency-behavior.js';
import { withCatalog } from './fixtures.js';

const api = `export function run(): number { return 1; }
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
`;

/** Classification and evidence of each fact of one consumer file, keyed by original binding. */
function byBinding(facts: DependencyBehaviorFacts, consumer: string): Record<string, readonly [string, readonly string[]]> {
  return Object.fromEntries(facts.facts.filter(fact => fact.consumer.file === consumer)
    .map(fact => [fact.original.binding, [fact.classification, fact.evidence] as const]));
}

describe('dependency behavior classification through the real compiler', () => {
  it('classifies call, construction, reference, data, type, forwarding, unused and unknown evidence', async () => withCatalog({
    'src/api.ts': api,
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
  }, async ({ source }) => {
    const { accesses } = await source.accesses();
    const facts = await source.dependencyBehavior();
    expect(facts.status).toBe('completed');
    expect(byBinding(facts, 'src/use.ts')).toEqual({
      run: ['behavioral', ['call']],
      Service: ['behavioral', ['construction']],
      handlers: ['behavioral', ['call']],
      helpers: ['behavioral', ['callable-reference']],
      limit: ['non-behavioral', ['data']],
      list: ['non-behavioral', ['data']],
      Mode: ['non-behavioral', ['data']],
      constants: ['non-behavioral', ['data']],
      Shape: ['non-behavioral', ['type']],
      Label: ['non-behavioral', ['type']],
      callback: ['behavioral', ['callable-reference']],
      Tools: ['behavioral', ['call']],
      loose: ['unknown', []],
      unusedFn: ['unused', []],
      mixed: ['behavioral', ['call', 'type']],
      optional: ['behavioral', ['call']],
    });
    const loose = facts.facts.find(fact => fact.consumer.file === 'src/use.ts' && fact.original.binding === 'loose')!;
    expect(loose.limitIds).toHaveLength(1);
    expect(facts.limits).toEqual([expect.objectContaining({ id: loose.limitIds[0], code: 'unclassified-capability',
      location: expect.objectContaining({ file: 'src/use.ts', line: 13, column: 7 }) })]);
    const forwarded = byBinding(facts, 'src/forward.ts');
    expect(forwarded.run).toEqual(['non-behavioral', ['forwarding']]);
    expect(forwarded.limit).toEqual(['non-behavioral', ['forwarding']]);
    expect(forwarded.callback).toEqual(['non-behavioral', ['forwarding']]);
    expect(Object.values(forwarded).every(([classification, evidence]) => classification === 'non-behavioral' && evidence.join() === 'forwarding')).toBe(true);
    expect(byBinding(facts, 'src/lazy.ts')).toEqual({
      run: ['behavioral', ['call']],
      limit: ['non-behavioral', ['data']],
      Service: ['behavioral', ['construction']],
      Shape: ['non-behavioral', ['type']],
    });

    // One fact per distinct (consumer file, original) over every resolved application selection,
    // including same-owner ones, with every contributing access id in byte order.
    const resolved = new Set(accesses.flatMap(access => access.target.kind !== 'application' ? []
      : access.selections.filter(selection => selection.status === 'resolved' && selection.original)
        .map(selection => JSON.stringify([access.importer.file, selection.original]))));
    expect(facts.facts.map(fact => JSON.stringify([fact.consumer.file, fact.original]))).toEqual(expect.arrayContaining([...resolved]));
    expect(facts.facts).toHaveLength(resolved.size);
    const forwardedRun = facts.facts.find(fact => fact.consumer.file === 'src/forward.ts' && fact.original.binding === 'run')!;
    expect(forwardedRun.accessIds).toHaveLength(2);
    expect(forwardedRun.accessIds).toEqual([...forwardedRun.accessIds].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    const keys = facts.facts.map(fact => [fact.consumer.file, fact.original.file, fact.original.binding, fact.original.kind].join('\u0000'));
    expect(keys).toEqual([...keys].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    expect(facts.facts.every(fact => fact.consumer.area.owner === 'fixture')).toBe(true);
    expect(Object.isFrozen(facts) && Object.isFrozen(facts.facts[0]) && Object.isFrozen(facts.facts[0]!.evidence)).toBe(true);
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  }), 60_000);

  it('classifies without prior access collection and keeps unused and forwarded selections distinct', async () => withCatalog({
    'src/api.ts': 'export const value = 1;\nexport function act(): void {}\n',
    'src/use.ts': "import { value, act } from './api.js';\nexport { act };\n",
  }, async ({ source }) => {
    const facts = await source.dependencyBehavior();
    expect(byBinding(facts, 'src/use.ts')).toEqual({ value: ['unused', []], act: ['non-behavioral', ['forwarding']] });
    expect(facts.limits).toEqual([]);
  }), 60_000);
});
