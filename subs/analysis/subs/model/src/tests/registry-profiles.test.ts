import { describe, expect, it } from 'vitest';
import { assignOriginalTags, buildModel, createDefaultTagRegistry, deriveSourceAreas, resolveTagRegistry } from '../index.js';
import type { TagDefinition } from '../index.js';
import { location, moduleRecord, original, valid } from './fixtures.js';

const testing: TagDefinition = { name: 'testing', kind: 'required-importer' };

describe('the resolved registry boundary', () => {
  it('validates the defaults through the same constructor and exact content identity', () => {
    const registry = createDefaultTagRegistry();
    expect(registry.definitions).toEqual([
      { name: 'browser', kind: 'required-symbol' }, { name: 'dispatch', kind: 'required-importer' }, testing,
      { name: 'ui', kind: 'required-importer' },
    ]);
    expect(registry.id).toBe('registry/1:[["browser","required-symbol",null],["dispatch","required-importer",null],["testing","required-importer",null],["ui","required-importer",null]]');
    expect(registry.isDefault).toBe(true);
    expect(valid(resolveTagRegistry([...registry.definitions].reverse()))).toEqual(registry);
  });

  it('detaches and freezes definitions while descriptions participate in identity', () => {
    const input: TagDefinition[] = [testing, { name: 'worker', kind: 'required-symbol', description: 'Portable worker' }];
    const registry = valid(resolveTagRegistry(input));
    const before = registry.id;
    input[1] = { name: 'worker', kind: 'required-importer' };
    expect(registry.id).toBe(before);
    expect(registry.definitions[1]).toEqual({ name: 'worker', kind: 'required-symbol', description: 'Portable worker' });
    expect(Object.isFrozen(registry.definitions[1])).toBe(true);
    expect(() => (registry.definitions as TagDefinition[]).push(testing)).toThrow();
    expect(valid(resolveTagRegistry(input)).id).not.toBe(before);
    expect(registry.isDefault).toBe(false);
    expect(JSON.parse(JSON.stringify(registry))).toEqual(registry);
  });

  it.each([
    null, {}, 'testing', [], [testing, testing], [testing, { name: 'testing', kind: 'required-symbol' }],
    [{ name: 'testing', kind: 'required-symbol' }], [testing, { name: 'worker', kind: 'custom' }],
    [testing, { name: 'worker', kind: 'required-importer', description: 42 }],
    [testing, { name: 'Worker', kind: 'required-importer' }], [testing, { name: 'worker_', kind: 'required-importer' }],
    [testing, { name: '', kind: 'required-importer' }], [testing, { name: '__proto__', kind: 'required-importer' }],
    [testing, { name: 'worker', kind: 'required-importer', algorithm: 'custom' }],
  ].map((input) => ({ input })))('rejects malformed, duplicate and unsupported definitions $input', ({ input }) => {
    const result = resolveTagRegistry(input);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.issues.every(({ code }) => code === 'invalid-registry')).toBe(true);
  });

  it('permits replacing ordinary defaults and rejects forged default/identity claims', () => {
    const registry = valid(resolveTagRegistry([testing, { name: 'browser', kind: 'required-importer' }]));
    expect(registry.isDefault).toBe(false);
    expect(deriveSourceAreas({ ...registry, isDefault: true }, 'app', 'src', []).status).toBe('invalid');
    expect(deriveSourceAreas({ ...registry, id: 'borrowed' }, 'app', 'src', []).status).toBe('invalid');
    expect(createDefaultTagRegistry().isDefault).toBe(true);
  });
});

describe('source profiles and mandatory symbol tags', () => {
  it('retains required importer tags in tests, omits required symbol tags and never inherits parents', () => {
    const owner = moduleRecord('app', ['browser', 'ui', 'dispatch']);
    expect(owner.areas.map(({ profile }) => profile)).toEqual([
      ['browser', 'dispatch', 'ui'], ['dispatch', 'testing', 'ui'],
    ]);
    expect(moduleRecord('app/child').areas.map(({ profile }) => profile)).toEqual([[], ['testing']]);
    expect(original(owner).tags).toEqual(['dispatch', 'ui']);
    expect(original(owner, 'fixture', { file: 'tests/fixture.ts' }).tags).toEqual(['dispatch', 'testing', 'ui']);
  });

  it('derives generic kinds, including a separate browser testing module', () => {
    const registry = valid(resolveTagRegistry([testing, { name: 'coupled', kind: 'required-importer' },
      { name: 'portable', kind: 'required-symbol' }]));
    const owner = moduleRecord('app', ['testing', 'coupled', 'portable'], registry);
    expect(owner.areas.map(({ profile }) => profile)).toEqual([['coupled', 'portable', 'testing'], ['coupled', 'testing']]);
    expect(original(owner, 'api', { registry }).tags).toEqual(['coupled', 'testing']);
  });

  it.each(['example.test.ts', 'helpers/tests/helper.ts', 'interfaces/vocabulary.ts', 'tests-like/helper.ts'])('keeps %s ordinary', (file) => {
    expect(original(moduleRecord('app', ['browser']), 'api', { file }).origin.area.profile).toEqual(['browser']);
  });

  it.each(['tests/helper.ts', 'tests/interfaces/types.ts', 'tests/helpers/nested.ts'])('keeps %s testing', (file) => {
    const symbol = original(moduleRecord('app', ['browser', 'ui']), 'api', { file });
    expect(symbol.origin.area.profile).toEqual(['testing', 'ui']);
    expect(symbol.tags).toEqual(['testing', 'ui']);
  });

  it('checks unknown header and assignment names, with supplied assignment locations', () => {
    const registry = createDefaultTagRegistry();
    const header = deriveSourceAreas(registry, 'app', 'src', ['unregistered']);
    expect(header).toMatchObject({ status: 'invalid', issues: [{ code: 'unknown-tag', message: expect.stringContaining('app') }] });
    expect(assignOriginalTags(registry, moduleRecord('app').areas[0], [{ tags: ['unregistered'], location: location() }]))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'unknown-tag', locations: [location()] }] });
  });

  it('collects explicit assignments before defaults and compares sets with all evidence', () => {
    const registry = createDefaultTagRegistry();
    const area = moduleRecord('app', ['ui', 'browser']).areas[0];
    const assignments = [{ tags: ['ui', 'browser'], location: location('module.ramify', 4) },
      { tags: ['browser', 'ui'], location: location('module.ramify', 2) }];
    const result = valid(assignOriginalTags(registry, area, assignments));
    expect(result).toEqual({ tags: ['browser', 'ui'], evidence: [location('module.ramify', 2), location('module.ramify', 4)] });
    expect(valid(assignOriginalTags(registry, area, [...assignments].reverse()))).toEqual(result);
    expect(assignOriginalTags(registry, area, [assignments[0], { tags: ['ui'], location: location() }]))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'conflicting-tags', locations: expect.arrayContaining([location(), assignments[0].location]) }] });
  });

  it.each([[], ['browser']].map((tags) => ({ tags })))('refuses explicit omissions $tags from testing originals', ({ tags }) => {
    const owner = moduleRecord('app', ['testing']);
    expect(assignOriginalTags(createDefaultTagRegistry(), owner.areas[0], [{ tags, location: location() }]))
      .toMatchObject({ status: 'invalid', issues: [{ code: 'missing-required-tag' }] });
  });

  it('enforces defaults on unexposed originals, wrappers, aliases and resources at the model boundary', () => {
    const owner = moduleRecord('app', ['ui', 'dispatch']);
    for (const symbol of [original(owner), original(owner, 'wrapper', { file: 'tests/wrapper.ts' }),
      original(owner, 'NewType', { hasValue: false }), original(owner, 'default', { kind: 'resource', file: 'style.css' })]) {
      const result = buildModel({ registry: createDefaultTagRegistry(), modules: [owner], exposures: [], originals: [{ ...symbol, tags: [] }] });
      expect(result).toMatchObject({ status: 'invalid', issues: [{ code: 'missing-required-tag' }] });
    }
  });
});
