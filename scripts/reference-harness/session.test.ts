import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { sessionHandlers } from './session-cases.js';
import { inspectPlainReport } from './session-expectations.js';

describe('iteration 12 matrix registration and retention evidence', () => {
  it('registers every resource, coverage, lifecycle and coherence syntax variant', () => {
    expect([...sessionHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 12).map(instance => instance.id).sort());
    expect(sessionHandlers.size).toBe(23);
  });
  it('rejects hidden references and accessor closures that JSON serialization would hide', () => {
    const hidden = Object.freeze(Object.defineProperty({}, 'compiler', { value: new Map(), enumerable: false }));
    const accessor = Object.freeze({ get compiler() { return {}; } });
    expect(() => inspectPlainReport(hidden)).toThrow('hidden property');
    expect(() => inspectPlainReport(accessor)).toThrow('accessor');
    expect(() => inspectPlainReport(Object.freeze({ compiler: new Map() }))).toThrow('non-plain object prototype');
    expect(inspectPlainReport(Object.freeze({ plain: Object.freeze([1, 'value', null]) })).objects).toBe(2);
  });
});
