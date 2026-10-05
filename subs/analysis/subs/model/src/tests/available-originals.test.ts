import { describe, expect, it } from 'vitest';
import { explainImport, listAvailableOriginals, resolveTagRegistry } from '../index.js';
import type { Model, Original, SourceArea } from '../index.js';
import { exposure, modelOf, moduleRecord, original, question, valid } from './fixtures.js';

// A model must be frozen (buildModel's output) for listAvailableOriginals's
// requireArea/index lookups to retain their cache; modelOf always returns one.

describe('listAvailableOriginals', () => {
  const root = moduleRecord('shop');
  const provider = moduleRecord('shop/provider');
  const consumer = moduleRecord('shop/consumer');

  function build(originals: readonly Original[], extraExposures: Model['exposures'] = []) {
    const exposures = originals.flatMap((symbol) => [
      exposure(provider, symbol, ['parent']),
      exposure(root, symbol, ['descendants'], { provider: provider.id }),
    ]);
    return modelOf([root, provider, consumer], originals, [...exposures, ...extraExposures]);
  }

  it('I2A-03:value-available -- lists a value-only original as value', () => {
    const value = original(provider, 'runtimeOnly', { hasValue: true, hasType: false });
    const model = build([value]);
    expect(listAvailableOriginals(model, consumer.areas[0])).toEqual([{ original: value.id, form: 'value' }]);
  });

  it('I2A-03:pure-type -- lists a pure type original as type-only', () => {
    const type = original(provider, 'PureType', { hasValue: false, hasType: true });
    const model = build([type]);
    expect(listAvailableOriginals(model, consumer.areas[0])).toEqual([{ original: type.id, form: 'type-only' }]);
  });

  it('I2A-03:value-available -- lists a value/type original as value only, never both', () => {
    const both = original(provider, 'Both', { hasValue: true, hasType: true });
    const model = build([both]);
    const result = listAvailableOriginals(model, consumer.areas[0]);
    expect(result).toEqual([{ original: both.id, form: 'value' }]);
    expect(result).toHaveLength(1);
  });

  it('I2A-03:required-symbol-fallback -- falls back to type-only when a required-symbol tag is unsatisfied but a type binding exists', () => {
    const browserConsumer = moduleRecord('shop/browser-consumer', ['browser']);
    const untagged = original(provider, 'Untagged', { hasValue: true, hasType: true, tags: [] });
    const model = modelOf([root, provider, browserConsumer], [untagged],
      [exposure(provider, untagged, ['parent']), exposure(root, untagged, ['descendants'], { provider: provider.id })]);
    expect(listAvailableOriginals(model, browserConsumer.areas[0])).toEqual([{ original: untagged.id, form: 'type-only' }]);
    // Positive control: satisfying the required-symbol tag restores the value form.
    const tagged = original(provider, 'Tagged', { hasValue: true, hasType: true, tags: ['browser'] });
    const taggedModel = modelOf([root, provider, browserConsumer], [tagged],
      [exposure(provider, tagged, ['parent']), exposure(root, tagged, ['descendants'], { provider: provider.id })]);
    expect(listAvailableOriginals(taggedModel, browserConsumer.areas[0])).toEqual([{ original: tagged.id, form: 'value' }]);
  });

  it('I2A-03:required-symbol-fallback -- a value-only original with an unsatisfied required-symbol tag and no type binding is entirely absent', () => {
    const browserConsumer = moduleRecord('shop/browser-consumer', ['browser']);
    const untyped = original(provider, 'Untyped', { hasValue: true, hasType: false, tags: [] });
    const model = modelOf([root, provider, browserConsumer], [untyped],
      [exposure(provider, untyped, ['parent']), exposure(root, untyped, ['descendants'], { provider: provider.id })]);
    expect(listAvailableOriginals(model, browserConsumer.areas[0])).toEqual([]);
    expect(explainImport(model, question(browserConsumer, untyped)).status).toBe('denied');
  });

  it('I2A-03:required-importer-block -- a missing required-importer tag blocks both forms entirely, unlike a required-symbol shortfall', () => {
    const registry = valid(resolveTagRegistry([{ name: 'testing', kind: 'required-importer' },
      { name: 'ui', kind: 'required-importer' }, { name: 'browser', kind: 'required-symbol' }]));
    const openRoot = moduleRecord('open', [], registry), openProvider = moduleRecord('open/provider', [], registry);
    const closedConsumer = moduleRecord('open/closed-consumer', [], registry);
    const uiTagged = original(openProvider, 'UiOnly', { hasValue: true, hasType: true, tags: ['ui'], registry });
    const model = modelOf([openRoot, openProvider, closedConsumer], [uiTagged],
      [exposure(openProvider, uiTagged, ['parent']), exposure(openRoot, uiTagged, ['descendants'], { provider: openProvider.id })], registry);
    expect(listAvailableOriginals(model, closedConsumer.areas[0])).toEqual([]);
    expect(explainImport(model, question(closedConsumer, uiTagged)).reason).toBe('required-importer-tag');
    expect(explainImport(model, question(closedConsumer, uiTagged,
      { selection: { original: uiTagged.id, request: 'type-only' } })).reason).toBe('required-importer-tag');
    // Positive control: a consumer carrying the required-importer tag sees it.
    const uiConsumer = moduleRecord('open/ui-consumer', ['ui'], registry);
    const openModel = modelOf([openRoot, openProvider, uiConsumer], [uiTagged],
      [exposure(openProvider, uiTagged, ['parent']), exposure(openRoot, uiTagged, ['descendants'], { provider: openProvider.id })], registry);
    expect(listAvailableOriginals(openModel, uiConsumer.areas[0])).toEqual([{ original: uiTagged.id, form: 'value' }]);
  });

  it('I2A-03:testing-origin -- a testing-classified original is absent from a non-testing consumer and present from a testing one', () => {
    const testOnly = original(provider, 'TestHelper', { file: 'tests/helper.ts', hasValue: true, hasType: true });
    const model = build([testOnly]);
    expect(listAvailableOriginals(model, consumer.areas[0])).toEqual([]);
    expect(explainImport(model, question(consumer, testOnly)).reason).toBe('testing-origin');
    // Positive control: the consumer's own tests area carries the testing profile.
    const testArea = consumer.areas.find((area) => area.kind === 'tests')!;
    expect(listAvailableOriginals(model, testArea)).toEqual([{ original: testOnly.id, form: 'value' }]);
  });

  it('I2A-03:test-complete-reclassification -- the tests area repeats ordinary-visible originals and independently '
    + 'upgrades/downgrades their form from its own profile, not an overlay on the ordinary result', () => {
    const browserConsumer = moduleRecord('shop/reclass-consumer', ['browser']);
    // Untagged: ordinary sees only type-only (required-symbol 'browser' unsatisfied);
    // the tests profile never inherits a required-symbol tag, so the same
    // original independently UPGRADES to value there.
    const untagged = original(provider, 'Upgrades', { hasValue: true, hasType: true, tags: [] });
    // testing-classified: absent from ordinary (testing-origin), and independently
    // present (DOWNGRADES from absent to value) from the tests area, which carries
    // the testing profile.
    const testOnly = original(provider, 'Appears', { file: 'tests/appears.ts', hasValue: true, hasType: true });
    const model = modelOf([root, provider, browserConsumer], [untagged, testOnly], [
      exposure(provider, untagged, ['parent']), exposure(root, untagged, ['descendants'], { provider: provider.id }),
      exposure(provider, testOnly, ['parent']), exposure(root, testOnly, ['descendants'], { provider: provider.id }),
    ]);
    const testsArea = browserConsumer.areas.find((area) => area.kind === 'tests')!;
    expect(listAvailableOriginals(model, browserConsumer.areas[0])).toEqual([{ original: untagged.id, form: 'type-only' }]);
    expect(listAvailableOriginals(model, testsArea)).toEqual([
      { original: untagged.id, form: 'value' }, { original: testOnly.id, form: 'value' },
    ]);
  });

  it('I2A-03:same-owner-absent -- excludes same-owner originals even when otherwise fully exposed', () => {
    const ownSymbol = original(consumer, 'Local', { hasValue: true, hasType: true });
    const foreign = original(provider, 'Foreign', { hasValue: true, hasType: true });
    const model = modelOf([root, provider, consumer], [ownSymbol, foreign],
      [exposure(provider, foreign, ['parent']), exposure(root, foreign, ['descendants'], { provider: provider.id })]);
    expect(explainImport(model, question(consumer, ownSymbol)).reason).toBe('same-owner');
    const result = listAvailableOriginals(model, consumer.areas[0]);
    expect(result.map((entry) => entry.original.binding)).toEqual(['Foreign']);
  });

  it('I2A-03:enforcement-equivalence -- a redundant exposure path to the same original never duplicates its entry', () => {
    const symbol = original(provider, 'Redundant', { hasValue: true, hasType: true });
    const model = modelOf([root, provider, consumer], [symbol], [
      exposure(provider, symbol, ['parent']),
      exposure(root, symbol, ['descendants'], { provider: provider.id }),
      exposure(root, symbol, ['descendants'], { provider: provider.id, start: 9 }),
    ]);
    expect(listAvailableOriginals(model, consumer.areas[0])).toEqual([{ original: symbol.id, form: 'value' }]);
  });

  it('I2A-03:enforcement-equivalence -- is unique by original and byte-ordered by owner, then file, then binding', () => {
    const zOwner = moduleRecord('shop/z-owner'), aOwner = moduleRecord('shop/a-owner');
    const originals = [
      original(zOwner, 'zBinding', { file: 'b.ts' }), original(zOwner, 'aBinding', { file: 'b.ts' }),
      original(zOwner, 'aBinding', { file: 'a.ts' }), original(aOwner, 'zBinding'),
    ];
    const exposures = originals.flatMap((symbol, index) => {
      const owner = symbol.id.owner === zOwner.id ? zOwner : aOwner;
      const names = [`alias${index}`];
      return [exposure(owner, symbol, ['parent'], { names }),
        exposure(root, symbol, ['descendants'], { provider: symbol.id.owner, names })];
    });
    const model = modelOf([root, zOwner, aOwner, consumer], originals, exposures);
    const result = listAvailableOriginals(model, consumer.areas[0]);
    expect(result.map((entry) => [entry.original.owner, entry.original.file, entry.original.binding])).toEqual([
      [aOwner.id, 'api.ts', 'zBinding'], [zOwner.id, 'a.ts', 'aBinding'], [zOwner.id, 'b.ts', 'aBinding'], [zOwner.id, 'b.ts', 'zBinding'],
    ]);
  });

  it('throws TypeError for an area that is not a canonical area of the model', () => {
    const symbol = original(provider, 'Api');
    const model = build([symbol]);
    const foreignArea: SourceArea = { owner: consumer.id, kind: 'ordinary', root: 'nonexistent/src', profile: [] };
    expect(() => listAvailableOriginals(model, foreignArea)).toThrow(TypeError);
    const wrongProfile: SourceArea = { ...consumer.areas[0], profile: ['ui'] };
    expect(() => listAvailableOriginals(model, wrongProfile)).toThrow(TypeError);
    const unknownOwner: SourceArea = { ...consumer.areas[0], owner: 'shop/nonexistent' };
    expect(() => listAvailableOriginals(model, unknownOwner)).toThrow(TypeError);
  });

  it('the result is deeply frozen, detached JSON data', () => {
    const symbol = original(provider, 'Frozen', { hasValue: true, hasType: true });
    const model = build([symbol]);
    const result = listAvailableOriginals(model, consumer.areas[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  it('I2A-03:enforcement-equivalence -- agrees with explainImport for every combination in a mixed catalog (fixture F; real R/T evidence is scripts/reference-harness/plan2a-availability-cases.ts)', () => {
    const registry = valid(resolveTagRegistry([{ name: 'testing', kind: 'required-importer' },
      { name: 'ui', kind: 'required-importer' }, { name: 'browser', kind: 'required-symbol' }]));
    const fRoot = moduleRecord('f', [], registry), fProvider = moduleRecord('f/provider', [], registry);
    const consumers = [moduleRecord('f/plain', [], registry), moduleRecord('f/ui', ['ui'], registry),
      moduleRecord('f/browser', ['browser'], registry), moduleRecord('f/ui-browser', ['ui', 'browser'], registry)];
    const catalog: Original[] = [
      original(fProvider, 'valueOnly', { hasValue: true, hasType: false, registry }),
      original(fProvider, 'typeOnly', { hasValue: false, hasType: true, registry }),
      original(fProvider, 'both', { hasValue: true, hasType: true, registry }),
      original(fProvider, 'bothBrowser', { hasValue: true, hasType: true, tags: ['browser'], registry }),
      original(fProvider, 'uiOnly', { hasValue: true, hasType: true, tags: ['ui'], registry }),
      original(fProvider, 'uiBrowser', { hasValue: true, hasType: true, tags: ['ui', 'browser'], registry }),
      // No explicit tags: the tests-area default auto-derives the required 'testing' tag.
      original(fProvider, 'testHelper', { file: 'tests/helper.ts', hasValue: true, hasType: true, registry }),
    ];
    const exposures = catalog.flatMap((symbol) => [exposure(fProvider, symbol, ['parent']),
      exposure(fRoot, symbol, ['descendants'], { provider: fProvider.id })]);
    const model = modelOf([fRoot, fProvider, ...consumers], catalog, exposures, registry);
    for (const consumerModule of consumers) {
      for (const area of consumerModule.areas) {
        const available = listAvailableOriginals(model, area);
        const byBinding = new Map(available.map((entry) => [entry.original.binding, entry]));
        for (const symbol of catalog) {
          const entry = byBinding.get(symbol.id.binding);
          const importerFile = { file: `${area.root}/probe.ts`, area, auxiliary: false };
          const decide = (request: 'value' | 'type-only') => explainImport(model,
            { importer: importerFile, location: { file: importerFile.file, start: 0, end: 0, line: 1, column: 1 },
              target: symbol.origin, forwarding: [], selection: { original: symbol.id, request } });
          if (entry) {
            // A listed form must be explainImport-allowed.
            expect(decide(entry.form).status).toBe('allowed');
          } else {
            // A completely blocked original must be absent, for every request its
            // own bindings actually support. (explainImport does not itself guard
            // a type-only request against a missing type binding -- that binding
            // classification is the adapter's and this enumeration's job, per
            // README's "the adapter must classify binding requests ... before
            // asking the model" -- so only requests matching a real binding count.)
            if (symbol.hasValue) expect(decide('value').status).toBe('denied');
            if (symbol.hasType) expect(decide('type-only').status).toBe('denied');
          }
        }
      }
    }
  });
});
