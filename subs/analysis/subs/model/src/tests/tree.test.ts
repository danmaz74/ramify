import { describe, expect, it } from 'vitest';
import { buildModel, createDefaultTagRegistry } from '../index.js';
import { exposure, modelOf, moduleRecord, original } from './fixtures.js';

// Construction/traversal expectations retained from the legacy tree tests.
// The current API records canonical declared chains, rather than a mutable
// insertion-ordered map with locally unique display IDs.
describe('the migrated declared tree', () => {
  const root = moduleRecord('root');
  const middle = moduleRecord('root/middle');
  const leaf = moduleRecord('root/middle/leaf');
  const aside = moduleRecord('root/aside');
  const symbols = [original(root, 'A'), original(leaf, 'B')];
  const model = modelOf([root, middle, leaf, aside], symbols);

  it('retains every module, its declared parent and all private originals', () => {
    expect(model.modules.map(({ id, parent }) => ({ id, parent }))).toEqual([
      { id: 'root', parent: null },
      { id: 'root/aside', parent: 'root' },
      { id: 'root/middle', parent: 'root' },
      { id: 'root/middle/leaf', parent: 'root/middle' },
    ]);
    expect(model.originals.map(({ id }) => id)).toEqual([
      { kind: 'code', owner: 'root', file: 'api.ts', binding: 'A' },
      { kind: 'code', owner: 'root/middle/leaf', file: 'api.ts', binding: 'B' },
    ]);
    expect(model.exposures).toEqual([]);
  });

  it('represents an empty owner explicitly with both intended source areas', () => {
    const solo = modelOf([moduleRecord('solo')], []);
    expect(solo.modules).toEqual([{
      id: 'solo', name: 'solo', parent: null, headerTags: [],
      areas: [
        { owner: 'solo', kind: 'ordinary', root: 'src', profile: [] },
        { owner: 'solo', kind: 'tests', root: 'src/tests', profile: ['testing'] },
      ],
    }]);
    expect(solo.originals).toEqual([]);
    expect(solo.exposures).toEqual([]);
  });

  it('rejects an empty module ID and a grandchild used as a direct-child provider', () => {
    expect(buildModel({ registry: createDefaultTagRegistry(), modules: [{ ...root, id: '' }],
      originals: [], exposures: [] })).toMatchObject({ status: 'invalid' });
    expect(buildModel({ registry: createDefaultTagRegistry(), modules: model.modules,
      originals: symbols, exposures: [exposure(leaf, symbols[1], ['parent']),
        exposure(root, symbols[1], ['descendants'], { provider: leaf.id })] }))
      .toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ code: 'ungrounded-exposure' })] });
  });
});
