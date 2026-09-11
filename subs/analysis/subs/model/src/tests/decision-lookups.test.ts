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
  expect(() => explainVisibility(model, owner.id, { ...symbols[0].id, file: '../api.ts' })).toThrow('Invalid canonical');
  expect(() => explainVisibility(model, owner.id, { ...symbols[0].id, binding: 'absent' })).toThrow('Unknown original');
});
