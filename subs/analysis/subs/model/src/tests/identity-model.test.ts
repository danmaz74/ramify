import { describe, expect, it } from 'vitest';
import { buildModel, createDefaultTagRegistry, explainImport, explainVisibility, originalKey } from '../index.js';
import type { ModelInput, ModuleRecord, OriginalId } from '../index.js';
import { exposure, location, modelOf, moduleRecord, original, question, valid } from './fixtures.js';

describe('canonical identities', () => {
  it('keeps declared identities through physical grouping moves and changes them on rename/reparent', () => {
    const first = moduleRecord('app/worker', [], undefined, 'subs/worker/src');
    const grouped = moduleRecord('app/worker', [], undefined, 'subs/group/subgroup/worker/src');
    const symbol = original(first, 'Container/parse');
    expect(originalKey(symbol.id)).toBe('["code","app/worker","api.ts","Container/parse"]');
    expect(originalKey(original(grouped, 'Container/parse').id)).toBe(originalKey(symbol.id));
    expect(originalKey(original(moduleRecord('app/renamed'), 'Container/parse').id)).not.toBe(originalKey(symbol.id));
    expect(originalKey(original(moduleRecord('app/other/worker'), 'Container/parse').id)).not.toBe(originalKey(symbol.id));
  });

  it('distinguishes code, resource, owner, file and binding without alias or compiler IDs', () => {
    const id: OriginalId = { kind: 'code', owner: 'app', file: 'api.ts', binding: '#default' };
    const ids: OriginalId[] = [id, { ...id, kind: 'resource' }, { ...id, owner: 'app/child' },
      { ...id, file: 'other.ts' }, { ...id, binding: 'default' }, { ...id, binding: 'scope/#default' }];
    expect(new Set(ids.map(originalKey)).size).toBe(6);
    expect(originalKey({ ...id, file: 'UPPER.ts' })).not.toBe(originalKey({ ...id, file: 'upper.ts' }));
    expect(originalKey({ ...id, file: 'caf\u00e9.ts' })).not.toBe(originalKey({ ...id, file: 'cafe\u0301.ts' }));
  });

  it.each(['../escape.ts', './file.ts', '/absolute.ts', 'a//b.ts', 'a\\b.ts', 'C:/a.ts', 'file.ts/', 'tests/../api.ts', 'bad\u0000.ts'])('rejects noncanonical paths %s', (file) => {
    expect(() => originalKey({ kind: 'code', owner: 'app', file, binding: 'api' })).toThrow('Invalid canonical');
  });
});

describe('complete model validation', () => {
  const root = moduleRecord('app');
  const child = moduleRecord('app/child');
  const symbol = original(child);
  const input: ModelInput = { registry: createDefaultTagRegistry(), modules: [root, child], originals: [symbol],
    exposures: [exposure(child, symbol, ['parent'])] };

  it('retains empty owners and private exports and publishes detached immutable JSON', () => {
    const mutable = JSON.parse(JSON.stringify(input)) as ModelInput;
    const model = valid(buildModel(mutable));
    (mutable.modules as ModuleRecord[]).pop();
    expect(model.modules).toHaveLength(2);
    expect(model.modules[0].areas).toHaveLength(2);
    expect(model.originals).toHaveLength(1);
    expect(Object.isFrozen(model.originals[0].origin.area.profile)).toBe(true);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it.each([
    ['empty tree', { modules: [] }, 'invalid-tree'],
    ['duplicate module', { modules: [root, child, child] }, 'duplicate-module'],
    ['two roots', { modules: [root, moduleRecord('other')] }, 'invalid-tree'],
    ['absent parent', { modules: [root, moduleRecord('app/missing/leaf')] }, 'invalid-tree'],
    ['overlapping source roots', { modules: [root, moduleRecord('app/child', [], undefined, 'src/subs/child/src')] }, 'invalid-tree'],
    ['wrong chain', { modules: [root, { ...child, id: 'app/not-child' }] }, 'invalid-module-id'],
    ['invalid name', { modules: [{ ...root, name: 'UPPER' }] }, 'invalid-module-id'],
    ['cycle', { modules: [{ ...root, parent: child.id }, child] }, 'invalid-tree'],
    ['profile override', { modules: [root, { ...child, areas: child.areas.map((area) => ({ ...area, profile: ['browser'] })) }] }, 'invalid-tree'],
    ['registry override', { modules: [root, { ...child, registry: input.registry }] }, 'invalid-registry'],
    ['unknown original owner', { originals: [{ ...symbol, id: { ...symbol.id, owner: 'missing' } }] }, 'invalid-original'],
    ['wrong source origin', { originals: [{ ...symbol, origin: { ...symbol.origin, area: root.areas[0] } }] }, 'invalid-original'],
    ['missing binding existence', { originals: [{ ...symbol, hasType: false, hasValue: false }] }, 'invalid-original'],
    ['unestablished selection', { exposures: [exposure(child, original(child, 'missing'), ['parent'])] }, 'ungrounded-exposure'],
    ['foreign owned exposure', { exposures: [exposure(root, symbol, ['descendants'])] }, 'ungrounded-exposure'],
    ['wrong provider', { exposures: [exposure(root, symbol, ['parent'], { provider: 'absent' })] }, 'ungrounded-exposure'],
    ['fabricated effectiveness', { exposures: [exposure(child, symbol, ['descendants']), exposure(root, symbol, ['descendants'], { provider: child.id })] }, 'ungrounded-exposure'],
  ] as const)('rejects %s without returning a partial graph', (_name, change, code) => {
    const result = buildModel({ ...input, ...change } as ModelInput);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.issues.map((issue) => issue.code)).toContain(code);
    expect(result).not.toHaveProperty('value');
  });

  it('rejects cycles and runtime objects in retained input data', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.loop = cyclic;
    for (const extra of [cyclic, new Map(), () => true]) {
      expect(buildModel({ ...input, extra } as ModelInput).status).toBe('invalid');
    }
  });

  it('merges repeat identities and exposures without allowing conflicting assignments or collisions', () => {
    const duplicate = { ...symbol, declarations: [location(symbol.origin.file, 3)] };
    const repeated = valid(buildModel({ ...input, originals: [symbol, duplicate], exposures: [...input.exposures,
      exposure(child, symbol, ['descendants'], { names: ['renamed'], start: 7 })] }));
    expect(repeated.originals).toHaveLength(1);
    expect(repeated.originals[0].declarations).toHaveLength(2);
    expect(repeated.exposures).toHaveLength(1);
    expect(repeated.exposures[0]).toMatchObject({ names: ['api', 'renamed'], destinations: ['descendants', 'parent'] });
    expect(buildModel({ ...input, originals: [symbol, { ...symbol, tags: ['browser'], tagEvidence: [location()] }] }))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'conflicting-tags', locations: [location()] }] });
    const other = original(child, 'other');
    expect(buildModel({ ...input, originals: [symbol, other], exposures: [...input.exposures,
      exposure(child, other, ['parent'], { names: ['api'], start: 9 })] }))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'ungrounded-exposure', locations: expect.any(Array) }] });
  });

  it('canonicalizes property order and duplicate evidence for stable JSON', () => {
    const reordered = { ...symbol, id: { binding: symbol.id.binding, file: symbol.id.file, owner: symbol.id.owner, kind: symbol.id.kind },
      declarations: [symbol.declarations[0], { column: 1, line: 1, end: 1, start: 0, file: symbol.origin.file }] };
    expect(JSON.stringify(valid(buildModel({ ...input, originals: [reordered] })))).toBe(JSON.stringify(valid(buildModel(input))));
  });

  it('rejects query typos and forged area classifications instead of creating model symbols', () => {
    const model = valid(buildModel(input));
    expect(() => explainVisibility(model, 'app/typo', symbol.id)).toThrow('Unknown module');
    expect(() => explainVisibility(model, root.id, { ...symbol.id, binding: 'absent' })).toThrow('Unknown original');
    expect(() => explainImport(model, question({ ...root.areas[0], profile: ['testing'] }, symbol))).toThrow('established source origin');
    expect(() => explainImport(model, question(root, symbol, { target: { file: 'outside.ts', area: child.areas[0] } }))).toThrow('established source origin');
  });
});

describe('grounded child contracts and evidence', () => {
  const root = moduleRecord('app');
  const middle = moduleRecord('app/middle', ['browser']);
  const leaf = moduleRecord('app/middle/leaf');
  const side = moduleRecord('app/side');
  const symbol = original(leaf);
  const declarations = [exposure(leaf, symbol, ['parent'], { names: ['local-name'] }),
    exposure(middle, symbol, ['parent'], { provider: leaf.id, names: ['renamed'] }),
    exposure(root, symbol, ['descendants'], { provider: middle.id, names: ['public-name'] })];
  const model = modelOf([root, middle, leaf, side], [symbol], declarations);

  it('uses owner and every one-hop relay with declaration evidence, independently of relay availability', () => {
    const decision = explainImport(model, question(side, symbol));
    expect(decision.status).toBe('allowed');
    expect(decision.visibility?.paths).toEqual([[...declarations.map((item, index) => ({
      module: item.module, destination: index === 2 ? 'descendants' : 'parent', evidence: item.evidence,
    }))]]);
    expect(explainImport(model, question(middle, symbol))).toMatchObject({ status: 'denied', reason: 'required-symbol-tag' });
    expect(decision.original?.id).toEqual(symbol.id);
    expect(decision.original?.tags).toEqual([]);
  });

  it('retains named ineffective selections and propagates their broken path without inventing visibility', () => {
    const exposures = declarations.map((item, index) => index === 0 ? { ...item, destinations: ['descendants'] as const }
      : { ...item, effective: false });
    const broken = modelOf([root, middle, leaf, side], [symbol], exposures);
    const decision = explainImport(broken, question(side, symbol));
    expect(decision).toMatchObject({ status: 'denied', reason: 'not-visible', visibility: { paths: [],
      ineffective: [expect.objectContaining({ module: root.id, original: symbol.id, evidence: declarations[2].evidence }),
        expect.objectContaining({ module: middle.id, original: symbol.id, evidence: declarations[1].evidence })] } });
    expect(explainVisibility(broken, middle.id, symbol.id).visible).toBe(false);
    expect(explainVisibility(model, side.id, symbol.id).visible).toBe(true);
  });

  it('checks child to-parent receipt by canonical original across aliases', () => {
    const withAliases = modelOf([root, middle, leaf, side], [symbol], [
      exposure(leaf, symbol, ['descendants'], { names: ['only-below'] }),
      exposure(leaf, symbol, ['parent'], { names: ['another-name'] }),
      ...declarations.slice(1),
    ]);
    expect(explainVisibility(withAliases, side.id, symbol.id).visible).toBe(true);
  });

  it('retains one deterministic shortest witness per receiving exposure', () => {
    const receivedTwice = modelOf([root, middle, leaf, side], [symbol], [...declarations,
      exposure(middle, symbol, ['descendants'], { provider: leaf.id, start: 8 })]);
    const result = explainVisibility(receivedTwice, leaf.id, symbol.id);
    expect(result.paths).toEqual([[]]);
    const nested = moduleRecord('app/middle/consumer');
    const extended = modelOf([...receivedTwice.modules, nested], [symbol], receivedTwice.exposures);
    expect(explainVisibility(extended, nested.id, symbol.id).paths.map((path) => path.length)).toEqual([3, 2]);
    const reversed = modelOf([...extended.modules].reverse(), [...extended.originals].reverse(), [...extended.exposures].reverse());
    expect(reversed).toEqual(extended);
    expect(explainVisibility(reversed, nested.id, symbol.id)).toEqual(explainVisibility(extended, nested.id, symbol.id));
  });
});
