import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CapturedInput } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextSelection } from '../interfaces/contexts.js';
import { createContextId, createFingerprints, createGenerationId, createRevisionId } from '../tokens.js';

const selection: ContextSelection = Object.freeze({ root: '/work/a', scope: 'whole-project', configuration: 'discover',
  setup: Object.freeze({ registry: 'default', capabilities: Object.freeze(['registry', 'coverage'] as const) }) });
const engine = 'ramify.ts@0.0.0+typescript@7.0.2';

describe('context token primitives (no retained resources)', () => {
  it('hashes the canonical selection with a fixed digest and separates roots', () => {
    expect(createContextId(selection)).toBe('ctx/1:7dfca1b4690ada23bd1250a877e4af7bd8962f5e76205fc0190f2335f4dab591');
    expect(createContextId({ ...selection, root: '/work/b' })).not.toBe(createContextId(selection));
    expect(createContextId({ ...selection, setup: { registry: 'default', capabilities: ['registry'] } }))
      .not.toBe(createContextId(selection));
  });

  it('ignores invocation and branch facts and sorts capabilities without mutating the selection', () => {
    const other = { ...selection, cwd: '/work/a/subdir', branch: 'feature',
      setup: { registry: 'default' as const, capabilities: ['coverage', 'registry'] as const } };
    expect(createContextId(other)).toBe(createContextId(selection));
    expect(selection.setup.capabilities).toEqual(['registry', 'coverage']);
  });

  it('creates fresh UUID generations and embeds the generation UUID in each revision', () => {
    const first = createGenerationId();
    const second = createGenerationId();
    expect(first).toMatch(/^gen\/1:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(first).not.toBe(second);
    const generation = 'gen/1:00112233-4455-4677-8899-aabbccddeeff';
    expect([1, 2, 3, 4, 5].map(sequence => createRevisionId(generation, sequence))).toEqual([
      'rev/1:00112233-4455-4677-8899-aabbccddeeff:1',
      'rev/1:00112233-4455-4677-8899-aabbccddeeff:2',
      'rev/1:00112233-4455-4677-8899-aabbccddeeff:3',
      'rev/1:00112233-4455-4677-8899-aabbccddeeff:4',
      'rev/1:00112233-4455-4677-8899-aabbccddeeff:5',
    ]);
  });

  it('rejects malformed generations and nonpositive or unsafe revision sequences', () => {
    expect(() => createRevisionId('gen/1:not-a-uuid', 1)).toThrow('generation UUID');
    const generation = createGenerationId();
    for (const sequence of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createRevisionId(generation, sequence)).toThrow(RangeError);
    }
  });
});

describe('detached input fingerprints (no retained resources)', () => {
  it('keeps the supplied input identity and hashes independent classes with fixed digests', () => {
    const value = createFingerprints('input/1:sealed-invalid', [
      { path: 'module.ramify', role: 'description', sha256: 'a', bytes: 1 },
    ], 'default', engine);
    expect(value).toEqual({
      inputId: 'input/1:sealed-invalid',
      declarations: 'c856fcb885cdb9bb1a868b1bf05a8b24f2e50455ac74d939ea22c35e5ed589eb',
      source: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      configuration: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      registry: '1080a60800d9e5bddc69f51489c636a776bacaadb5368f46db4aa0947c67e3ba',
      engine: '15ffbb4f9f5a3d2d22aa435e1835d6bfe262aca8bdfdc376f1245df846065b97',
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  const classes = [
    ['description', 'declarations'], ['source', 'source'], ['resource', 'source'],
    ['dependency', 'source'], ['directory', 'source'], ['absent', 'source'],
    ['configuration', 'configuration'], ['readme', null],
  ] as const;
  it.each(classes)('isolates a %s edit to its fingerprint class and the overall input identity', (role, changedClass) => {
    const input: CapturedInput = { path: 'observed', role, sha256: 'before', bytes: 10 };
    const before = createFingerprints('input/1:before', [input], 'default', engine);
    const after = createFingerprints('input/1:after', [{ ...input, sha256: 'after' }], 'default', engine);
    expect(Object.keys(after).filter(key => before[key as keyof typeof before] !== after[key as keyof typeof after]))
      .toEqual(['inputId', ...(changedClass === null ? [] : [changedClass])]);
  });

  it('does not depend on observation or property order and does not retain mutable inputs', () => {
    const a: CapturedInput = { path: 'src/a.ts', role: 'source', sha256: 'a', bytes: 1 };
    const b: CapturedInput = { bytes: 2, sha256: 'b', role: 'source', path: 'src/b.ts' };
    const observations = [a, b];
    const first = createFingerprints('input/1:a', observations, 'default', engine);
    expect(createFingerprints('input/1:a', [b, { bytes: 1, sha256: 'a', role: 'source', path: 'src/a.ts' }], 'default', engine))
      .toEqual(first);
    const serialized = JSON.stringify(first);
    observations.splice(0);
    expect(JSON.stringify(first)).toBe(serialized);
    expect(createFingerprints('input/1:a', [], 'default', engine).source).not.toBe(first.source);
  });

  it('changes only registry and engine fingerprints when those identities change', () => {
    const before = createFingerprints('input/1:a', [], 'default', engine);
    const after = createFingerprints('input/1:a', [], 'other-registry', 'other-engine');
    expect(after.registry).not.toBe(before.registry);
    expect(after.engine).not.toBe(before.engine);
    expect({ ...after, registry: before.registry, engine: before.engine }).toEqual(before);
  });
});

describe('fingerprint order without serializing comparisons (no retained resources)', () => {
  /** The comparator `createFingerprints` used before: serialized tuples compared as strings. */
  function serializedFingerprints(inputId: string, inputs: readonly CapturedInput[], registryIdentity: string, engineIdentity: string) {
    const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const observations = inputs.map(input => [input.path, input.role, input.sha256, input.bytes] as const).sort((left, right) => {
      const a = JSON.stringify(left); const b = JSON.stringify(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return { inputId, declarations: digest(observations.filter(input => input[1] === 'description')),
      source: digest(observations.filter(input => ['source', 'resource', 'dependency', 'directory', 'absent'].includes(input[1]))),
      configuration: digest(observations.filter(input => input[1] === 'configuration')),
      registry: digest(registryIdentity), engine: digest(engineIdentity) };
  }
  // Pieces whose encodings reorder: the closing quote against space and `!`, short and
  // unicode escapes, non-ASCII units, and paired or lone surrogates.
  const units = [0x00, 0x01, 0x08, 0x09, 0x0a, 0x0c, 0x0d, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x2f, 0x41, 0x5c, 0x61, 0x62, 0x7e, 0x7f,
    0x85, 0xa0, 0xe9, 0x2028, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xffff];
  const pieces = ['', 'src/', 'ab', 'a b', String.fromCodePoint(0x1f600), ...units.map(unit => String.fromCharCode(unit))];
  const roles = ['description', 'readme', 'source', 'resource', 'configuration', 'dependency', 'directory', 'absent'] as const;
  function random(seed: number) { return () => { seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31; return seed / 2 ** 31; }; }

  it('fingerprint-order: createFingerprints output is unchanged with a non-serializing comparator', () => {
    const next = random(7);
    const pick = <T>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
    const text = () => Array.from({ length: Math.floor(next() * 4) }, () => pick(pieces)).join('');
    const bytes = [0, 1, 2, 12, 123, 9, 10, 100, 1.5, -0, Number.NaN];
    for (let round = 0; round < 400; round++) {
      // Few distinct values per round force ties on earlier fields, so later fields decide.
      const paths = Array.from({ length: 3 }, text), hashes = Array.from({ length: 3 }, text);
      const inputs: CapturedInput[] = Array.from({ length: 1 + Math.floor(next() * 12) },
        () => ({ path: pick(paths), role: pick(roles), sha256: pick(hashes), bytes: pick(bytes) }));
      expect(createFingerprints(`input/1:${round}`, inputs, 'default', engine)).toEqual(serializedFingerprints(`input/1:${round}`, inputs, 'default', engine));
    }
    // Every ordered pair of pieces, as a path suffix, a hash suffix and a longer path with differing sizes.
    for (const left of pieces) for (const right of pieces) {
      const inputs: CapturedInput[] = [{ path: `p${left}`, role: 'source', sha256: 'h', bytes: 1 }, { path: `p${right}`, role: 'source', sha256: 'h', bytes: 2 },
        { path: 'q', role: 'source', sha256: `h${left}`, bytes: 1 }, { path: 'q', role: 'source', sha256: `h${right}`, bytes: 1 },
        { path: `p${left}x`, role: 'source', sha256: 'h', bytes: 12 }, { path: `p${left}x`, role: 'source', sha256: 'h', bytes: 123 }];
      const expected = serializedFingerprints('input/1:pair', inputs, 'default', engine).source;
      expect(createFingerprints('input/1:pair', inputs, 'default', engine).source).toBe(expected);
      expect(createFingerprints('input/1:pair', [...inputs].reverse(), 'default', engine).source).toBe(expected);
    }
  });
});
