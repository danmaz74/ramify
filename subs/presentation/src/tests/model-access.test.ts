import { describe, expect, it } from 'vitest';
import { defineDiagramModel } from '../diagrams/fixture-model.js';
import { example3Declaration } from '../diagrams/example3.js';
import { example4Declaration } from '../diagrams/example4.js';
import { shopTreeDeclaration } from '../diagrams/shop-tree.js';
import { buildDiagramModel, diagramImport, diagramOriginal, diagramVisibility, moduleKey, moduleView } from '../model-access.js';

describe('teaching facts use the definitive model', () => {
  it('keeps canonical original, source-area and every relay hop behind the readable labels', () => {
    const model = buildDiagramModel(shopTreeDeclaration);
    const arrival = diagramVisibility(model, 'payment', 'logging', 'Logger');
    expect(arrival.kind).toBe('ancestor');
    expect(arrival.via).toBe('shop');
    expect(arrival.decision.original).toEqual({ kind: 'code', owner: 'shop/platform/logging', file: 'fixtures.ts', binding: 'Logger' });
    expect(arrival.decision.paths).toHaveLength(1);
    expect(arrival.decision.paths[0]!.map(hop => [hop.module, hop.destination])).toEqual([
      ['shop/platform/logging', 'parent'], ['shop/platform', 'parent'], ['shop', 'descendants'],
    ]);
    expect(diagramOriginal(model, 'logging', 'Logger').origin.area.owner).toBe('shop/platform/logging');
    expect(moduleView(model, 'payment').canonicalId).toBe('shop/checkout/payment');
  });

  it('retains the independent testing and browser teaching decisions with current reasons', () => {
    const testing = buildDiagramModel(example3Declaration);
    expect(diagramImport(testing, 'billing', 'orders', 'resetOrderStore').reason).toBe('required-importer-tag');
    expect(diagramImport(testing, 'integration-tests', 'orders', 'resetOrderStore').status).toBe('allowed');
    const browser = buildDiagramModel(example4Declaration);
    expect(diagramImport(browser, 'ui', 'shared', 'queryDb').reason).toBe('required-symbol-tag');
    expect(diagramImport(browser, { module: 'ui', binding: 'type' }, 'shared', 'queryDb').status).toBe('allowed');
  });

  it('does not interpret a readable label as original identity when names repeat', () => {
    const model = buildDiagramModel(defineDiagramModel({ name: 'app', children: [
      { name: 'left', children: [{ name: 'core', symbols: [{ name: 'api' }] }] },
      { name: 'right', children: [{ name: 'core', symbols: [{ name: 'api' }] }] },
    ] }));
    expect(moduleKey(model, 'app/left/core')).toBe('app/left/core');
    expect(() => moduleView(model, 'core')).toThrow('Unknown module');
    expect(diagramOriginal(model, 'app/left/core', 'api').id).not.toEqual(diagramOriginal(model, 'app/right/core', 'api').id);
  });

  it('validates mandatory tags and preserves testing-origin isolation before same-owner access', () => {
    expect(() => defineDiagramModel({ name: 'ui', tags: ['ui'], symbols: [{ name: 'api', tags: ['browser'] }] })).toThrow();
    const original = example4Declaration.originals[0]!;
    const area = example4Declaration.modules.find(module => module.id === original.id.owner)!.areas.find(area => area.kind === 'tests')!;
    const changed = { ...original, id: { ...original.id, file: 'tests/fixture.ts' },
      origin: { file: `${area.root}/fixture.ts`, area }, tags: ['testing'] };
    const model = buildDiagramModel({ ...example4Declaration, originals: [changed], exposures: [] });
    expect(diagramImport(model, 'shared', 'shared', changed.id.binding).reason).toBe('testing-origin');
  });
});
