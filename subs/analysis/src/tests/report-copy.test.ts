import { describe, expect, it } from 'vitest';
import { copyReport } from '../report-copy.js';

describe('detached report data with shared immutable subtrees', () => {
  it('shares equal source facts while preserving the complete serialized result', () => {
    const scope = { root: 'src', profile: ['browser'] };
    const input = { scope, inventory: { scope: { root: 'src', profile: ['browser'] } },
      accesses: [{ area: scope }, { area: { root: 'src', profile: ['browser'] } }] };
    const report = copyReport(input);
    expect(JSON.stringify(report)).toBe(JSON.stringify(input));
    expect(report).not.toBe(input);
    expect(report.scope).not.toBe(scope);
    expect(report.scope).toBe(report.inventory.scope);
    expect(report.scope).toBe(report.accesses[0].area);
    expect(report.scope).toBe(report.accesses[1].area);
    expect(report.accesses[0]).toBe(report.accesses[1]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.scope)).toBe(true);
    expect(Object.isFrozen(report.scope.profile)).toBe(true);
    input.scope.root = 'changed';
    input.inventory.scope.profile.push('dispatch');
    input.accesses.push({ area: { root: 'other', profile: [] } });
    expect(report.scope).toEqual({ root: 'src', profile: ['browser'] });
    expect(report.accesses).toHaveLength(2);
  });

  it('does not merge different original identities, tag sets, value types or property orders', () => {
    const input = {
      originals: [{ kind: 'code', owner: 'a', file: 'api.ts', binding: 'Value' },
        { kind: 'code', owner: 'b', file: 'api.ts', binding: 'Value' },
        { kind: 'code', owner: 'a', file: 'other.ts', binding: 'Value' }],
      profiles: [['browser'], ['dispatch']], values: [[1], ['1'], [true], [null], [], {}],
      ordered: [{ first: 1, second: 2 }, { second: 2, first: 1 }],
    };
    const report = copyReport(input);
    expect(JSON.stringify(report)).toBe(JSON.stringify(input));
    expect(new Set(report.originals).size).toBe(3);
    expect(new Set(report.profiles).size).toBe(2);
    expect(new Set(report.values).size).toBe(6);
    expect(report.ordered[0]).not.toBe(report.ordered[1]);
  });

  it('matches JSON normalization without exposing special property names to prototype setters', () => {
    const input = Object.fromEntries([
      ['__proto__', { retained: true }], ['constructor', 'ordinary data'],
      ['omitted', undefined], ['zero', -0], ['array', [undefined, , -0, { missing: undefined }]],
    ]);
    const report = copyReport(input);
    expect(JSON.stringify(report)).toBe(JSON.stringify(input));
    expect(Object.getPrototypeOf(report)).toBe(Object.prototype);
    expect(Object.hasOwn(report, '__proto__')).toBe(true);
    expect(Object.hasOwn(report, 'omitted')).toBe(false);
    expect(Object.is(report.zero, -0)).toBe(false);
    expect(report.array).toEqual([null, null, 0, {}]);
  });

  it('keeps sharing invocation-local even when calls use the same input', () => {
    const input = { first: { nested: ['testing'] }, second: { nested: ['testing'] } };
    const first = copyReport(input), second = copyReport(input);
    expect(first.first).toBe(first.second);
    expect(second.first).toBe(second.second);
    expect(first.first).not.toBe(second.first);
    expect(first.first.nested).not.toBe(second.first.nested);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.first)).toBe(false);
  });

  it('reuses object shapes without mixing values or changing escaped and integer-like keys', () => {
    const keys = ['10', '2', '01', '"quoted\\key\n', '__proto__', 'constructor'];
    const input = [1, 2].map(value => Object.fromEntries(keys.map(key => [key, { value }])));
    const report = copyReport(input);
    expect(JSON.stringify(report)).toBe(JSON.stringify(input));
    expect(Object.keys(report[0])).toEqual(Object.keys(input[0]));
    expect(Object.getPrototypeOf(report[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(report[1])).toBe(Object.prototype);
    for (const key of keys) {
      expect(Object.hasOwn(report[0], key)).toBe(true);
      expect(report[0][key]).toEqual({ value: 1 });
      expect(report[1][key]).toEqual({ value: 2 });
      expect(report[0][key]).not.toBe(report[1][key]);
    }
  });

  it('rejects cycles but accepts existing acyclic sharing', () => {
    const shared = { value: 1 };
    expect(copyReport({ one: shared, two: shared })).toEqual({ one: { value: 1 }, two: { value: 1 } });
    const cycle: unknown[] = []; cycle.push(cycle);
    expect(() => copyReport(cycle)).toThrow('acyclic');
    const indirect: { next?: object } = {}; indirect.next = { back: indirect };
    expect(() => copyReport(indirect)).toThrow('acyclic');
  });

  it('rejects hidden state and accessors without invoking them', () => {
    let accessed = false;
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { accessed = true; return 1; } });
    expect(() => copyReport(accessor)).toThrow('accessors');
    expect(accessed).toBe(false);
    expect(() => copyReport(Object.defineProperty({}, 'state', { value: {} }))).toThrow('hidden');
    expect(() => copyReport({ [Symbol('state')]: {} })).toThrow('symbol');
    const array = [1]; Object.defineProperty(array, 'state', { value: {} });
    expect(() => copyReport(array)).toThrow('hidden');
    expect(() => copyReport(Object.assign([1], { retained: {} }))).toThrow('non-index');
  });

  it.each([new Date(), new Map(), new Set(), new (class CompilerState {})(),
    { value: () => {} }, { value: Symbol('state') }, { value: 1n },
    { value: NaN }, { value: Infinity }, undefined])('rejects non-JSON runtime state %#', value => {
    expect(() => copyReport(value)).toThrow(TypeError);
  });
});
