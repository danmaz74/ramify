import { describe, expect, it } from 'vitest';
import { FactLedger, deepFreeze, factBytes } from '../session-facts.js';
import type { SessionFacts } from '../session-facts.js';

const json = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));
const facts = (value: unknown): SessionFacts => value as SessionFacts;

describe('retained-fact accounting by identity', () => {
  it('equals the serialized length of facts that share no object', () => {
    const tree = deepFreeze({ text: 'plain', escaped: 'quote " slash \\ tab \t', unicode: 'café 😀', 'key "quoted"': 1,
      numbers: [0, -1, 2.5, 1e21, Number.NaN], flags: [true, false, null], empty: {}, list: [], nested: { a: [{ b: 'c' }] },
      skipped: undefined, holes: [undefined] });
    expect(factBytes(facts(tree))).toBe(json(tree));
  });

  it('counts an object once however many parents refer to it', () => {
    const shared = deepFreeze({ file: 'src/shared.ts', start: 1, end: 2 });
    const tree = deepFreeze({ left: shared, right: shared, list: [shared, shared] });
    const unshared = JSON.parse(JSON.stringify(tree)) as unknown;
    expect(factBytes(facts(unshared))).toBe(json(tree));
    expect(factBytes(facts(tree))).toBe(json(tree) - 3 * json(shared));
  });

  it('counts versions jointly and releases only what no retained version reaches', () => {
    const common = deepFreeze({ catalog: ['a'.repeat(100)] });
    const first = deepFreeze({ common, own: 'first' });
    const second = deepFreeze({ common, own: 'second' });
    const ledger = new FactLedger();
    const firstBytes = ledger.retain(first);
    expect(firstBytes).toBe(json(first));
    const added = ledger.retain(second);
    expect(added).toBe(json(second) - json(common));
    expect(ledger.total).toBe(firstBytes + added);
    // The same facts published again add nothing.
    expect(ledger.retain(second)).toBe(0);
    expect(ledger.release(second)).toBe(0);
    expect(ledger.release(first)).toBe(json(first) - json(common));
    expect(ledger.total).toBe(json(second));
    expect(ledger.release(second)).toBe(json(second));
    expect(ledger.total).toBe(0);
    expect(() => ledger.release(second)).toThrow('not retained');
  });

  it('keeps counts beyond the packed range', () => {
    const shared = deepFreeze({ a: 1 });
    const many = Object.freeze(Array.from({ length: 2 ** 21 + 3 }, () => shared));
    const ledger = new FactLedger();
    ledger.retain(many);
    const bytes = ledger.total;
    expect(bytes).toBe(json(many) - (many.length - 1) * json(shared));
    ledger.retain(shared);
    expect(ledger.release(many)).toBe(bytes - json(shared));
    expect(ledger.total).toBe(json(shared));
    expect(ledger.release(shared)).toBe(json(shared));
    ledger.clear();
    expect(ledger.total).toBe(0);
  });
});
