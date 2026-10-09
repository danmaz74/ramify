import { describe, expect, test } from 'vitest';
import { effectiveBlocks, renderBlockRemoval, renderBlockSet, resolveBlockAdditions, type InstructionBlock } from '../prompts/blocks.js';
import { buildDeliveredManifest, exactInputHash, type DeliveredInput } from '../prompts/delivered-manifest.js';
import { briefingContentHash, buildBriefingDelivery, createBriefingOccurrence, taskBriefingRevision, type BriefingRevision } from '../prompts/briefings.js';
import { deliveredManifestViewSchema } from '../interfaces/protocol/runs.js';
import { readHarnessOperationIntent } from '../run/session-operations.js';

const key = 'procedure:engineer:main';
const setA = '# Block procedure:engineer:main\nCurrent value; replaces any earlier value for this key.\nA\n';
const removed = '# Block procedure:engineer:main\nWithdrawn; this block no longer applies.\n';
const aHash = '98644b57ccbb86b9611ac54ce76dc962b6068103d39aec62452cb258a8659d3e';
const oldHash = '06f961b802bc46ee168555f066d28f4f0e9afdf3f88174c1ee6f9de004fc30a0';
const block = (body = 'A\n', source = 'procedure.md'): InstructionBlock => ({ key, body, source, revision: 'pkg-1', kind: 'procedure' });
const delivered = (body = 'A\n', source = 'procedure.md'): DeliveredInput => ({ key: 'physical:add-1', kind: 'procedure', text: renderBlockSet(key, body), source, revision: 'pkg-1', block: { key, effect: 'set' } });

// Hand-authored wire expectations; their literal digests are frozen independently
// of the writer and the reader under test. Legacy ordering/hash representation stays intact.
const legacyWire = `{"schema":"ramify-agent.delivered-inputs/1","inheritedPoint":null,"entries":[{"key":"legacy:a","kind":"brief","source":"plan.md","revision":"r1","hash":"${oldHash}","bytes":2,"delivery":"appended","sources":[]}],"currentMessage":{"hash":"${oldHash}","bytes":2},"hash":"339988bc877555406651b38f3de01b8fc4fb1387226efe9594da7eb7304dbb80"}`;
const newWire = `{"schema":"ramify-agent.delivered-inputs/2","inheritedPoint":null,"entries":[{"key":"physical:add-1","kind":"procedure","source":"procedure.md","revision":"pkg-1","hash":"${aHash}","bytes":90,"delivery":"appended","sources":[],"block":{"key":"procedure:engineer:main","effect":"set"}}],"currentMessage":{"hash":"${aHash}","bytes":90},"hash":"fd3f6e7d60f24d3a094ee853ff0703c414f26f0f383b427d46461f920fa45f90"}`;

function wireIntent(version: 1 | 2): unknown {
  const input = version === 1 ? { key: 'legacy:a', kind: 'brief', text: 'A\n', source: 'plan.md', revision: 'r1' }
    : { key: 'physical:add-1', kind: 'procedure', text: setA, source: 'procedure.md', revision: 'pkg-1', block: { key, effect: 'set' } };
  return {
    schema: `ramify-agent.harness-operation/${version}`, runId: 'run-1', operationId: 'op-1', session: 'engineer-1', source: null, mode: 'fresh',
    packet: { roleInstructions: 'Pinned role\n', message: input.text, submissionTool: 'submit_engineer',
      declaration: { name: 'submit_engineer', description: 'Original schema bytes', inputSchema: { type: 'object' }, mutating: false },
      additions: [input], manifest: JSON.parse(version === 1 ? legacyWire : newWire) },
    context: version === 1 ? { inherited: [input], history: [{ revision: 'r1', sections: [{ key: 'goal', text: '# Goal\nG' }] }], revision: 'r1' }
      : { inherited: [input], history: [{ revision: '00db9fec6aedc86b9a26553446e24e5a2db2217a5d81fee4f1641653848ede22', contentHash: '7340de0304b7af91359688b6422dc6d867501bb60fcd352bd6477c6e4657a9bf',
        sections: [{ key: 'goal', text: '# Goal\nG' }, { key: 'requirements', text: '# Requirements\n- R' }, { key: 'starting-points', text: 'A', source: 'assignment.json' }] }], revision: '00db9fec6aedc86b9a26553446e24e5a2db2217a5d81fee4f1641653848ede22' },
    policy: { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { writes: [] }, validator: { schema: 'original/1' }, destination: { iteration: '1' } },
    task: { role: 'engineer', message: input.text, submissionTool: 'submit_engineer', environment: { workingDirectory: '/project', candidate: null, snapshot: null, limits: { stopSettleMs: 100 } }, policyIdentity: 'policy', validatorIdentity: 'validator', destinationIdentity: 'destination' },
    declarations: [{ name: 'submit_engineer', description: 'Original schema bytes', inputSchema: { type: 'object' }, mutating: false }],
  };
}

describe('Plan 25 D01–D03: ordered exact block effects', () => {
  test('set framing is invariant, preserves body bytes and hashes the complete rendered input', () => {
    expect(renderBlockSet(key, 'A\n')).toBe(setA);
    expect(exactInputHash(setA)).toBe(aHash);
    expect(renderBlockSet(key, 'A')).toBe(setA.slice(0, -1));
    expect(renderBlockSet(key, '')).toBe('# Block procedure:engineer:main\nCurrent value; replaces any earlier value for this key.\n');
    expect(renderBlockRemoval(key)).toBe(removed);
    expect(exactInputHash(removed)).toBe('880a890692956c28edb94da5bfccfac6eb1528cbe6cbc1495dc68bb232725385');
  });
  test('latest set wins; unannotated prose cannot replace a block or invent a delivery', () => {
    const a = delivered(); const b = delivered('B');
    const adHoc: DeliveredInput = { ...b, block: undefined, text: 'Current environment is C' };
    expect(effectiveBlocks([a, b, adHoc]).get(key)).toBe(b);
    expect(resolveBlockAdditions({ inherited: [a, b, adHoc], desired: [block('B')] })).toEqual([]);
    expect(resolveBlockAdditions({ inherited: [adHoc], desired: [block()] })).toEqual([expect.objectContaining({ text: setA })]);
  });
  test('returning from B to A delivers A despite older matching history, then inherits it unchanged', () => {
    const inherited = [delivered(), delivered('B')];
    const additions = resolveBlockAdditions({ inherited, desired: [block()] });
    expect(additions).toEqual([{ key, kind: 'procedure', text: setA, source: 'procedure.md', revision: 'pkg-1', block: { key, effect: 'set' } }]);
    expect(resolveBlockAdditions({ inherited: [...inherited, ...additions], desired: [block()] })).toEqual([]);
  });
  test('withdraw once, repeat nothing, reintroduce once, and preserve other families', () => {
    const other = { ...delivered('Orientation'), block: { key: 'procedure:engineer:consultation', effect: 'set' as const } };
    const withdrawals = resolveBlockAdditions({ inherited: [delivered(), other], desired: [], withdraw: [key, key] });
    expect(withdrawals).toEqual([{ key, kind: 'procedure', text: removed, source: null, revision: null, block: { key, effect: 'remove' } }]);
    const inherited = [delivered(), other, ...withdrawals];
    expect(effectiveBlocks(inherited).has(key)).toBe(false);
    expect(effectiveBlocks(inherited).get('procedure:engineer:consultation')).toBe(other);
    expect(resolveBlockAdditions({ inherited, desired: [], withdraw: [key] })).toEqual([]);
    const restored = resolveBlockAdditions({ inherited, desired: [block()] });
    expect(restored.map(input => input.text)).toEqual([setA]);
    expect(resolveBlockAdditions({ inherited: [...inherited, ...restored], desired: [block()] })).toEqual([]);
  });
  test('identical bytes preserve actual inherited provenance; desired omission does not withdraw', () => {
    const actual = delivered('A\n', 'original.md');
    expect(resolveBlockAdditions({ inherited: [actual], desired: [block('A\n', 'new-source.md')] })).toEqual([]);
    expect(resolveBlockAdditions({ inherited: [actual], desired: [] })).toEqual([]);
    expect(effectiveBlocks([actual]).get(key)?.source).toBe('original.md');
  });
  test('duplicate desired keys and ambiguous effects fail before dispatch', () => {
    expect(() => resolveBlockAdditions({ inherited: [], desired: [block(), block('B')] })).toThrow('Duplicate desired block');
    expect(() => resolveBlockAdditions({ inherited: [], desired: [block()], withdraw: [key] })).toThrow('both set and withdrawn');
    expect(() => renderBlockSet('a\nb', 'B')).toThrow('single-line key');
  });
});

describe('Plan 25 D04: compatible retained wire readers', () => {
  test('legacy manifest bytes, hashes and writer representation are unchanged', () => {
    const old = JSON.parse(legacyWire);
    expect(deliveredManifestViewSchema.parse(old)).toEqual(old);
    expect(JSON.stringify(old)).toBe(legacyWire);
    expect(buildDeliveredManifest({ inheritedPoint: null, inherited: [], appended: [{ key: 'legacy:a', kind: 'brief', text: 'A\n', source: 'plan.md', revision: 'r1' }], currentMessage: 'A\n' })).toEqual(old);
  });
  test('new manifest retains physical identity and optional logical effects', () => {
    const current = JSON.parse(newWire);
    expect(deliveredManifestViewSchema.parse(current)).toEqual(current);
    expect(buildDeliveredManifest({ schema: 'ramify-agent.delivered-inputs/2', inheritedPoint: null, inherited: [], appended: [delivered()], currentMessage: setA })).toEqual(current);
    const withdrawal = buildDeliveredManifest({ schema: 'ramify-agent.delivered-inputs/2', inheritedPoint: 'P:T1', inherited: [delivered()], appended: [{ key: 'physical:remove-2', kind: 'procedure', text: removed, source: null, revision: null, block: { key, effect: 'remove' } }] });
    expect(deliveredManifestViewSchema.parse(withdrawal).entries.map(entry => entry.delivery)).toEqual(['inherited', 'appended']);
    expect(withdrawal.entries[1]).toMatchObject({ bytes: 73, hash: '880a890692956c28edb94da5bfccfac6eb1528cbe6cbc1495dc68bb232725385' });
    expect(() => buildDeliveredManifest({ inheritedPoint: null, inherited: [], appended: [delivered()] })).toThrow('requires delivered-inputs/2');
  });
  test('strict manifests reject unknown versions, fields, malformed effects and annotations on /1', () => {
    const old = JSON.parse(legacyWire); const current = JSON.parse(newWire);
    expect(deliveredManifestViewSchema.safeParse({ ...old, schema: 'ramify-agent.delivered-inputs/3' }).success).toBe(false);
    expect(deliveredManifestViewSchema.safeParse({ ...current, hiddenEffectiveMap: {} }).success).toBe(false);
    expect(deliveredManifestViewSchema.safeParse({ ...old, entries: current.entries }).success).toBe(false);
    expect(deliveredManifestViewSchema.safeParse({ ...current, entries: [{ ...current.entries[0], block: { key, effect: 'activate' } }] }).success).toBe(false);
    expect(deliveredManifestViewSchema.safeParse({ ...current, entries: [{ ...current.entries[0], block: { key, effect: 'set', inferred: true } }] }).success).toBe(false);
  });
  test.each([1, 2] as const)('intent /%i accepts original packet without mutating retry bytes, schema or provenance', version => {
    const original = wireIntent(version); const bytes = JSON.stringify(original);
    expect(readHarnessOperationIntent(original)).toBe(original);
    expect(JSON.stringify(original)).toBe(bytes);
    expect(readHarnessOperationIntent(JSON.parse(bytes)).packet.declaration.description).toBe('Original schema bytes');
    expect(readHarnessOperationIntent(original).context.history[0]?.contentHash).toBe(version === 1 ? undefined : '7340de0304b7af91359688b6422dc6d867501bb60fcd352bd6477c6e4657a9bf');
  });
  test('strict intent readers reject unknown fields, versions and malformed nested retained inputs', () => {
    const old = readHarnessOperationIntent(wireIntent(1));
    const current = readHarnessOperationIntent(wireIntent(2));
    expect(() => readHarnessOperationIntent({ ...old, schema: 'ramify-agent.harness-operation/3' })).toThrow();
    expect(() => readHarnessOperationIntent({ ...current, recompute: true })).toThrow();
    expect(() => readHarnessOperationIntent({ ...old, context: { ...old.context, inherited: current.context.inherited } })).toThrow();
    expect(() => readHarnessOperationIntent({ ...old, packet: { ...old.packet, manifest: current.packet.manifest } })).toThrow('legacy manifest');
    expect(() => readHarnessOperationIntent({ ...current, context: { ...current.context, history: [{ revision: 'r1', sections: [], counter: 1 }] } })).toThrow();
  });
});

describe('Plan 25 D05: briefing content and ordered occurrence identities', () => {
  const sections = (body: string): BriefingRevision['sections'] => [{ key: 'goal', text: '# Goal\nG' }, { key: 'requirements', text: '# Requirements\n- R' }, { key: 'starting-points', text: body, source: 'assignment.json' }];
  test('A1 → B2 → A3 returns to equal content after its actual predecessor', () => {
    const a1 = createBriefingOccurrence({ previous: null, operationId: 'op-1', sections: sections('A') });
    const b2 = createBriefingOccurrence({ previous: a1, operationId: 'op-2', sections: sections('B') });
    const a3 = createBriefingOccurrence({ previous: b2, operationId: 'op-3', sections: sections('A') });
    expect(a1).toMatchObject({ revision: '00db9fec6aedc86b9a26553446e24e5a2db2217a5d81fee4f1641653848ede22', contentHash: '7340de0304b7af91359688b6422dc6d867501bb60fcd352bd6477c6e4657a9bf' });
    expect(b2).toMatchObject({ revision: 'c3dd357ec467a1f5cb32c4f42ac6ec62796524284e9d1ae3afdd4bfb13878733', contentHash: 'e05c3a7d5742c190bca22cf1442ecd5401bf4a17de85f2350bc6a5ba3a971f49' });
    expect(a3.revision).toBe('30c880f1ffca73886dc216f4004580fd7089a4b005eec53e25268314ea662c11');
    expect(a1.contentHash).toBe(a3.contentHash);
    expect(a3.revision).not.toBe(a1.revision);
    expect(createBriefingOccurrence({ previous: b2, operationId: 'op-3', sections: sections('A') })).toEqual(a3);
    expect(createBriefingOccurrence({ previous: b2, operationId: 'different-op', sections: sections('A') }).revision).not.toBe(a3.revision);
    expect(createBriefingOccurrence({ previous: a3, operationId: 'op-4', sections: sections('A') })).toBe(a3);
    const history = [a1, b2, a3]; const before = JSON.stringify(history);
    expect(buildBriefingDelivery({ mode: 'continue', current: a3, inheritedRevision: b2.revision, history })).toMatchObject({ kind: 'available', additions: [{ key: 'brief:starting-points', text: 'A', revision: a3.revision }] });
    expect(JSON.stringify(history)).toBe(before);
    const fork = buildBriefingDelivery({ mode: 'fork', current: a3, inheritedRevision: a1.revision, history });
    expect(fork).toMatchObject({ kind: 'available', additions: [{ text: 'B', revision: b2.revision }, { text: 'A', revision: a3.revision }] });
    expect(buildBriefingDelivery({ mode: 'continue', current: a3, inheritedRevision: a3.revision, history })).toMatchObject({ additions: [] });
  });
  test('legacy contexts retain recorded repeated entries and create new occurrences without rewriting legacy identities', () => {
    const a: BriefingRevision = { revision: 'legacy-content-A', sections: sections('A') };
    const b: BriefingRevision = { revision: 'legacy-content-B', sections: sections('B') };
    const history = [a, b, a]; const bytes = JSON.stringify(history);
    expect(buildBriefingDelivery({ mode: 'fork', current: a, inheritedRevision: b.revision, history })).toMatchObject({ kind: 'available', additions: [{ text: 'A', revision: a.revision }] });
    expect(createBriefingOccurrence({ previous: a, operationId: 'new-op', sections: sections('A') })).toBe(a);
    const current = createBriefingOccurrence({ previous: b, operationId: 'new-op', sections: sections('A') });
    expect(current.revision).not.toBe(a.revision);
    expect(buildBriefingDelivery({ mode: 'continue', current, inheritedRevision: b.revision, history: [a, b] })).toMatchObject({ kind: 'available', additions: [{ text: 'A', revision: current.revision }] });
    expect(JSON.stringify(history)).toBe(bytes);
  });
  test('same-occurrence conflicts and invalid content hashes fail; unknown ancestry stays unavailable', () => {
    const a = createBriefingOccurrence({ previous: null, operationId: 'op-1', sections: sections('A') });
    expect(() => buildBriefingDelivery({ mode: 'continue', current: { ...a, sections: sections('B'), contentHash: briefingContentHash(sections('B')) }, inheritedRevision: a.revision, history: [a] })).toThrow('Conflicting briefing revision');
    expect(() => buildBriefingDelivery({ mode: 'fresh', current: { ...a, contentHash: 'wrong' }, inheritedRevision: null, history: [] })).toThrow('Invalid briefing content hash');
    expect(buildBriefingDelivery({ mode: 'continue', current: a, inheritedRevision: 'unknown', history: [] })).toMatchObject({ kind: 'unavailable' });
    expect(() => createBriefingOccurrence({ previous: null, operationId: '', sections: [] })).toThrow('durable operation identity');
  });
  test('canonical goal/requirements remain structured content before framing', () => {
    const canonical = taskBriefingRevision({ revision: 'legacy', goal: 'G', requirements: ['R'], sections: [{ key: 'starting-points', text: 'A' }] });
    const occurrence = createBriefingOccurrence({ previous: null, operationId: 'op-1', sections: canonical.sections });
    expect(occurrence.sections).toEqual([{ key: 'goal', text: '# Goal\nG' }, { key: 'requirements', text: '# Requirements\n- R' }, { key: 'starting-points', text: 'A' }]);
    expect(occurrence.contentHash).toBe(briefingContentHash(canonical.sections));
    expect(() => taskBriefingRevision({ revision: 'r', goal: 'G', requirements: ['R'], sections: [{ key: 'goal', text: 'other' }] })).toThrow('reserved');
  });
  test('content identity retains section order and recorded provenance', () => {
    const original = sections('A');
    expect(briefingContentHash([...original].reverse())).not.toBe(briefingContentHash(original));
    expect(briefingContentHash(original.map(section => section.key === 'starting-points' ? { ...section, source: 'result.json' } : section))).not.toBe(briefingContentHash(original));
    expect(briefingContentHash([{ key: 'goal', text: 'G' }])).toBe(briefingContentHash([{ key: 'goal', text: 'G', source: null }]));
  });
});
