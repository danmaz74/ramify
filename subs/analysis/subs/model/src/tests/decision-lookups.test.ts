import { buildModel } from '../model.js';
import { recorded } from './recorded-decisions.js';
import { expect, it, vi } from 'vitest';
import { explainImport, explainVisibility } from '../decisions.js';
import { originalKey } from '../identity.js';
import { modelOf, moduleRecord, original, question } from './fixtures.js';

vi.mock('../identity.js', { spy: true });

it('does not revalidate every established identity for each import decision', () => {
  const owner = moduleRecord('app');
  const model = modelOf([owner], Array.from({ length: 128 }, (_, i) => original(owner, `binding${i}`)));
  const selected = model.originals.at(-1)!;
  const key = vi.mocked(originalKey);
  key.mockClear();
  try {
    const decision = explainImport(model, question(owner, selected));
    expect(decision).toMatchObject({ status: 'allowed', reason: 'same-owner', original: selected,
      visibility: { visible: true, paths: [[]] } });
    // Model construction already validated its candidates. Revalidating and
    // serializing all of them per question made large completed checks time out.
    expect(key.mock.calls.length).toBeLessThanOrEqual(2);
  } finally { key.mockRestore(); }
});

it('keeps all four identity fields distinct and validates requested identities', () => {
  const owner = moduleRecord('app');
  const child = moduleRecord('app/child');
  const symbols = [original(owner, 'value'), original(owner, 'value', { kind: 'resource' }),
    original(owner, 'value', { file: 'API.ts' }), original(owner, 'other'), original(child, 'value')];
  const model = modelOf([owner, child], symbols);
  for (const symbol of symbols) {
    const importer = symbol.id.owner === owner.id ? owner : child;
    expect(explainImport(model, question(importer, symbol)).original).toEqual(symbol);
    expect(explainVisibility(model, importer.id, { ...symbol.id }).original).toEqual(symbol.id);
  }
  // One leading `../` is the canonical auxiliary form (an absent original here); two leave the owner.
  expect(() => explainVisibility(model, owner.id, { ...symbols[0].id, file: '../../api.ts' })).toThrow('Invalid canonical');
  expect(() => explainVisibility(model, owner.id, { ...symbols[0].id, file: '../api.ts' })).toThrow('Unknown original');
  expect(() => explainVisibility(model, owner.id, { ...symbols[0].id, binding: 'absent' })).toThrow('Unknown original');
});

it('equals the pre-change decisions in order, including denied paths and evidence identities', () => {
  const built = buildModel(recorded.model);
  expect(built.status).toBe('valid');
  if (built.status !== 'valid') throw new Error(JSON.stringify(built));
  for (let pass = 0; pass < 20; pass++) {
    expect(recorded.questions.map(question => explainImport(built.value, question))).toEqual(recorded.decisions);
  }
  expect(recorded.decisions.map(decision => decision.reason)).toEqual([
    'same-owner', 'exposed', 'not-visible', 'testing-origin', 'symbol-free',
  ]);
  // An independent immutable model must not reuse another model's exposures.
  const hidden = buildModel({ ...recorded.model, exposures: [] });
  if (hidden.status !== 'valid') throw new Error(JSON.stringify(hidden));
  expect(explainImport(hidden.value, recorded.questions[1]).reason).toBe('not-visible');
  expect(explainImport(built.value, recorded.questions[1])).toEqual(recorded.decisions[1]);
});
