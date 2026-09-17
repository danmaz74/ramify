import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { DependencyBehaviorFact, DependencyBehaviorFacts } from '../interfaces/dependency-behavior.js';
import type { SourceAccess } from '../interfaces/source.js';
import { analyze, fixture, withCatalog } from './fixtures.js';

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
    expect(facts.facts.every(fact => JSON.stringify(fact.accessIds) === JSON.stringify(fact.accesses.map(item => item.accessId)))).toBe(true);
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
    // The helper reports its classifier runs with every result; the catalog opened this lifetime without one.
    expect(source.behaviorRuns()).toBe(0);
    const facts = await source.dependencyBehavior();
    expect(source.behaviorRuns()).toBe(1);
    expect(byBinding(facts, 'src/use.ts')).toEqual({ value: ['unused', []], act: ['non-behavioral', ['forwarding']] });
    expect(facts.limits).toEqual([]);
  }), 60_000);

  describe('path-facts: one original reached through imported modules B and C', () => {
    const core = `export function act(): void {}
export class Service { start(): void {} }
export const settings = { size: 1 };
export interface Shape { size: number }
export const loose: any = 1;
`;
    const forwarder = "export { act, Service, settings, type Shape, loose } from '../../core/src/index.js';\n";
    const B = "'../subs/b/src/index.js'", C = "'../subs/c/src/index.js'";
    const consumers: Record<string, string> = {
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
      // The defaulted destructure gives the local an any type, so only the B path records a limit.
      'src/settled.ts': `import * as viaB from ${B};\nimport { act } from ${C};\nconst { act: run = undefined as any } = viaB;\nvoid run;\nact();\n`,
    };
    const owners = ['core', 'b', 'c'].map(name => ({ name, directory: `subs/${name}`, tags: [] as string[] }));

    async function pathFacts(check: (facts: DependencyBehaviorFacts, accesses: readonly SourceAccess[]) => void): Promise<void> {
      const root = await fixture({
        'subs/core/src/index.ts': core, 'subs/b/src/index.ts': forwarder, 'subs/c/src/index.ts': forwarder, ...consumers,
      }, owners);
      let result: Awaited<ReturnType<typeof analyze>> | undefined;
      try {
        result = await analyze(root);
        const { accesses } = await result.source.accesses();
        check(await result.source.dependencyBehavior(), accesses);
      } finally { await result?.dispose(); await rm(root, { recursive: true, force: true }); }
    }

    /** The fact of one consumer file and original binding owned by `core`. */
    const factOf = (facts: DependencyBehaviorFacts, consumer: string, binding: string): DependencyBehaviorFact => {
      const found = facts.facts.find(fact => fact.consumer.file === `src/${consumer}.ts` && fact.original.binding === binding
        && fact.original.owner === 'fixture/core');
      if (!found) throw new Error(`No fact for ${consumer} ${binding}`);
      return found;
    };
    /** Each access fact joined to the module its access imports: [imported module, classification, evidence, limit codes]. */
    const paths = (facts: DependencyBehaviorFacts, accesses: readonly SourceAccess[], fact: DependencyBehaviorFact) =>
      fact.accesses.map(item => {
        const access = accesses.find(candidate => candidate.id === item.accessId);
        if (!access || access.target.kind !== 'application') throw new Error(`Access ${item.accessId} has no application target`);
        return [access.target.origin.area.owner, item.classification, item.evidence,
          item.limitIds.map(id => facts.limits.find(limit => limit.id === id)?.code)] as const;
      });
    const precedence = ['behavioral', 'unknown', 'non-behavioral', 'unused'] as const;
    const evidenceOrder = ['call', 'construction', 'callable-reference', 'data', 'type', 'forwarding'];
    const order = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

    it('keeps every import path of one original separately classified and reproduces each aggregate from them', () => pathFacts((facts, accesses) => {
      expect(facts.status).toBe('completed');
      // BD01: only the B path is used; the C path stays unused while the headline fact is behavioral.
      const onlyB = factOf(facts, 'only-b', 'act');
      expect(onlyB.classification).toBe('behavioral');
      expect(paths(facts, accesses, onlyB).sort()).toEqual([
        ['fixture/b', 'behavioral', ['call'], []],
        ['fixture/c', 'unused', [], []],
      ]);
      // BD02: both paths used, each with its own evidence; neither used is one unused dependency with no used path.
      expect(paths(facts, accesses, factOf(facts, 'both', 'act')).sort()).toEqual([
        ['fixture/b', 'behavioral', ['call'], []],
        ['fixture/c', 'non-behavioral', ['type'], []],
      ]);
      expect(factOf(facts, 'both', 'act')).toMatchObject({ classification: 'behavioral', evidence: ['call', 'type'] });
      const neither = factOf(facts, 'neither', 'act');
      expect(neither).toMatchObject({ classification: 'unused', evidence: [], limitIds: [] });
      expect(paths(facts, accesses, neither).map(([, classification]) => classification)).toEqual(['unused', 'unused']);
      // BD03: repeated references add no access fact and aliases add no aggregate fact. The interpreter records one
      // selection per access, so each specifier is its own path to B; every access ID is kept for later deduplication.
      const aliases = factOf(facts, 'aliases', 'act');
      expect(facts.facts.filter(fact => fact.consumer.file === 'src/aliases.ts')).toHaveLength(1);
      expect(paths(facts, accesses, aliases).sort()).toEqual([
        ['fixture/b', 'behavioral', ['call'], []],
        ['fixture/b', 'behavioral', ['call'], []],
        ['fixture/b', 'unused', [], []],
      ]);
      expect(aliases).toMatchObject({ classification: 'behavioral', evidence: ['call'] });
      expect(new Set(aliases.accessIds).size).toBe(3);
      // BD04: evidence and precedence per access and per aggregate.
      expect(factOf(facts, 'kinds', 'Service')).toMatchObject({ classification: 'behavioral', evidence: ['construction'] });
      expect(paths(facts, accesses, factOf(facts, 'kinds', 'Shape'))).toEqual([['fixture/b', 'non-behavioral', ['type'], []]]);
      const act = factOf(facts, 'kinds', 'act');
      expect(act).toMatchObject({ classification: 'behavioral', evidence: ['call', 'callable-reference', 'forwarding'] });
      expect(paths(facts, accesses, act).sort()).toEqual([
        ['fixture/b', 'non-behavioral', ['forwarding'], []],
        ['fixture/c', 'behavioral', ['call', 'callable-reference'], []],
      ]);
      const settings = factOf(facts, 'kinds', 'settings');
      expect(settings).toMatchObject({ classification: 'non-behavioral', evidence: ['data', 'forwarding'] });
      expect(paths(facts, accesses, settings).sort()).toEqual([
        ['fixture/b', 'non-behavioral', ['data'], []],
        ['fixture/c', 'non-behavioral', ['forwarding'], []],
      ]);
      // BD05: a limit on the B path leaves the C path unused and makes the unsettled aggregate unknown.
      const limited = factOf(facts, 'limited', 'loose');
      expect(paths(facts, accesses, limited).sort()).toEqual([
        ['fixture/b', 'unknown', [], ['unclassified-capability']],
        ['fixture/c', 'unused', [], []],
      ]);
      expect(limited).toMatchObject({ classification: 'unknown', evidence: [], limitIds: limited.accesses[0]!.limitIds.length
        ? limited.accesses[0]!.limitIds : limited.accesses[1]!.limitIds });
      // BD05: behavioral evidence on the C path settles the aggregate; the B path keeps its own limit.
      const settled = factOf(facts, 'settled', 'act');
      expect(settled).toMatchObject({ classification: 'behavioral', evidence: ['call'], limitIds: [] });
      const settledPaths = paths(facts, accesses, settled).sort();
      expect(settledPaths.map(([owner, classification]) => [owner, classification])).toEqual([['fixture/b', 'unknown'], ['fixture/c', 'behavioral']]);
      expect(settledPaths[0]![3]).toHaveLength(1);

      // Every aggregate equals the access-ID set and the fixed precedence over its access facts.
      for (const fact of facts.facts) {
        expect(fact.accesses.length).toBeGreaterThan(0);
        expect(fact.accessIds).toEqual(fact.accesses.map(item => item.accessId));
        expect(fact.accessIds).toEqual([...new Set(fact.accessIds)].sort(order));
        const classification = precedence.find(candidate => fact.accesses.some(item => item.classification === candidate));
        expect(fact.classification).toBe(classification);
        expect(fact.limitIds).toEqual(classification === 'unknown'
          ? [...new Set(fact.accesses.flatMap(item => item.limitIds))].sort(order) : []);
        expect(fact.evidence).toEqual(classification === 'unknown' ? []
          : evidenceOrder.filter(kind => fact.accesses.some(item => item.evidence.includes(kind as never))));
        for (const item of fact.accesses) {
          expect(item.limitIds.length > 0).toBe(item.classification === 'unknown');
          expect(item.classification === 'unused').toBe(!item.evidence.length && !item.limitIds.length);
        }
      }
      // Limits named by any access fact are present once, ordered and frozen.
      const named = new Set(facts.facts.flatMap(fact => fact.accesses.flatMap(item => item.limitIds)));
      expect(facts.limits.map(limit => limit.id)).toEqual([...named].sort(order));
      expect(Object.isFrozen(settled.accesses) && Object.isFrozen(settled.accesses[0]) && Object.isFrozen(facts.limits)).toBe(true);
      expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
    }), 60_000);
  });
});
