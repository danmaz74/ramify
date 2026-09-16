import { join } from 'node:path';
import { explainImport, listAvailableOriginals, resolveTagRegistry } from '../../subs/analysis/subs/model/src/index.js';
import type { AvailableOriginal, ImportQuestion, Model, ModuleRecord, Original, SourceArea } from '../../subs/analysis/subs/model/src/index.js';
import { exposure, modelOf, moduleRecord, original, valid } from '../../subs/analysis/subs/model/src/tests/fixtures.js';
import { recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { sessionReport } from './session-expectations.js';
import type { Assertions, InstanceHandler } from './runner.js';

const referenceRoot = join(repositoryRoot, 'examples/collection-review');

function importerFor(area: SourceArea) {
  return { file: `${area.root}/__plan2a_availability_probe__.ts`, area };
}
const LOCATION = { start: 0, end: 0, line: 1, column: 1 };

function decide(model: Model, area: SourceArea, original: Original, request: 'value' | 'type-only') {
  const importer = importerFor(area);
  const question: ImportQuestion = { importer, location: { file: importer.file, ...LOCATION },
    target: original.origin, forwarding: [], selection: { original: original.id, request } };
  return explainImport(model, question);
}

interface Violation { readonly module: string; readonly area: 'ordinary' | 'tests'; readonly original: unknown;
  readonly kind: 'listed-but-not-allowed' | 'absent-but-value-allowed' | 'absent-but-type-allowed'; readonly detail?: unknown; }

/**
 * `listAvailableOriginals` membership over the model's real, exhaustive
 * originals catalog must equal `explainImport`'s independent per-question
 * decision: a listed form is always `explainImport`-allowed, and an original
 * absent from the list is `explainImport`-denied for every request its own
 * bindings actually support. Also checks uniqueness and byte order.
 */
function checkAvailability(label: string, model: Model): { checkedEntries: number; checkedAbsences: number; violations: readonly Violation[] } {
  const violations: Violation[] = [];
  let checkedEntries = 0, checkedAbsences = 0;
  for (const module of model.modules as readonly ModuleRecord[]) {
    for (const area of module.areas) {
      const available = listAvailableOriginals(model, area);
      const key = (id: AvailableOriginal['original']) => `${id.kind}:${id.owner}:${id.file}:${id.binding}`;
      const byKey = new Map(available.map((entry) => [key(entry.original), entry]));
      if (byKey.size !== available.length) {
        violations.push({ module: module.id, area: area.kind, original: null, kind: 'listed-but-not-allowed',
          detail: `${label}: duplicate original identity in one result` });
      }
      for (let index = 1; index < available.length; index++) {
        const a = available[index - 1].original, b = available[index].original;
        const order = (id: AvailableOriginal['original']) => [id.owner, id.file, id.binding, id.kind];
        if (JSON.stringify(order(a)) > JSON.stringify(order(b))) {
          violations.push({ module: module.id, area: area.kind, original: b, kind: 'listed-but-not-allowed',
            detail: `${label}: out of byte order at index ${index}` });
        }
      }
      for (const original of model.originals) {
        if (original.id.owner === module.id) continue; // Same-owner is out of scope for both engines.
        const entry = byKey.get(key(original.id));
        if (entry) {
          checkedEntries++;
          const outcome = decide(model, area, original, entry.form);
          if (outcome.status !== 'allowed') {
            violations.push({ module: module.id, area: area.kind, original: original.id, kind: 'listed-but-not-allowed', detail: outcome.reason });
          }
        } else {
          checkedAbsences++;
          if (original.hasValue && decide(model, area, original, 'value').status !== 'denied') {
            violations.push({ module: module.id, area: area.kind, original: original.id, kind: 'absent-but-value-allowed' });
          }
          if (original.hasType && decide(model, area, original, 'type-only').status !== 'denied') {
            violations.push({ module: module.id, area: area.kind, original: original.id, kind: 'absent-but-type-allowed' });
          }
        }
      }
    }
  }
  return { checkedEntries, checkedAbsences, violations };
}

async function runEquivalence(label: string, root: string, assertions: Assertions): Promise<void> {
  const report = await sessionReport(root);
  if (!report.snapshot?.model) throw new Error(`${label}: analysis produced no model snapshot`);
  const model = report.snapshot.model;
  const result = checkAvailability(label, model);
  recordObservation('plan2a-availability-equivalence', { label, root, ...result, sampleViolations: result.violations.slice(0, 20) });
  assertions.ok(`${label}: at least one foreign original checked`, result.checkedEntries + result.checkedAbsences > 0);
  assertions.equal(`${label}: listAvailableOriginals matches explainImport for every foreign original/form, ` +
    `unique and byte-ordered (checked ${result.checkedEntries} listed, ${result.checkedAbsences} absent)`, result.violations.length, 0);
}

/**
 * `I2A-03:enforcement-equivalence`'s real-project leaf (A/R,T). Exercises the
 * complete real R (`examples/collection-review`) and T (this toolkit) model
 * catalogs, independently of the synthetic fixture-F unit tests in
 * `subs/analysis/subs/model/src/tests/available-originals.test.ts`.
 *
 * NOT registered into any ledger or runtime here -- iteration 2 owns
 * `instances.ts`/`plan2a-instances.ts` and the capability wiring. Wire this
 * handler under the id below once that ledger accepts Plan 2A registrations.
 */

/**
 * The remaining seven `I2A-03` leaves, ported from
 * `subs/analysis/subs/model/src/tests/available-originals.test.ts`'s own
 * fixture-F unit tests into harness-registered evidence, using the same
 * `fixtures.ts` helpers (`moduleRecord`/`original`/`exposure`/`modelOf`) and
 * independently re-asserting each leaf's one claim so `--iteration 5`'s
 * transitive `--iteration 3` requirement has real, executed evidence rather
 * than an unregistered owner test.
 */
const root = moduleRecord('shop');
const provider = moduleRecord('shop/provider');
const consumer = moduleRecord('shop/consumer');
function buildShop(originals: readonly Original[]): Model {
  const exposures = originals.flatMap(symbol => [exposure(provider, symbol, ['parent']), exposure(root, symbol, ['descendants'], { provider: provider.id })]);
  return modelOf([root, provider, consumer], originals, exposures);
}

export const plan2aAvailabilityHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2A-03:enforcement-equivalence', { kind: 'memory', run: async ({ assertions }) => {
    await runEquivalence('R', referenceRoot, assertions);
    await runEquivalence('T', repositoryRoot, assertions);
  } }],
  ['I2A-03:value-available', { kind: 'memory', run: ({ assertions }) => {
    const value = original(provider, 'runtimeOnly', { hasValue: true, hasType: false });
    const model = buildShop([value]);
    assertions.equal('a value-only original lists once as value', listAvailableOriginals(model, consumer.areas[0]), [{ original: value.id, form: 'value' }]);
    const both = original(provider, 'Both', { hasValue: true, hasType: true });
    const bothModel = buildShop([both]);
    assertions.equal('a value/type original lists as value only, never both', listAvailableOriginals(bothModel, consumer.areas[0]), [{ original: both.id, form: 'value' }]);
  } }],
  ['I2A-03:pure-type', { kind: 'memory', run: ({ assertions }) => {
    const type = original(provider, 'PureType', { hasValue: false, hasType: true });
    const model = buildShop([type]);
    assertions.equal('a pure type original lists once as type-only', listAvailableOriginals(model, consumer.areas[0]), [{ original: type.id, form: 'type-only' }]);
  } }],
  ['I2A-03:required-symbol-fallback', { kind: 'memory', run: ({ assertions }) => {
    const browserConsumer = moduleRecord('shop/browser-consumer', ['browser']);
    const untagged = original(provider, 'Untagged', { hasValue: true, hasType: true, tags: [] });
    const untaggedModel = modelOf([root, provider, browserConsumer], [untagged],
      [exposure(provider, untagged, ['parent']), exposure(root, untagged, ['descendants'], { provider: provider.id })]);
    assertions.equal('an unsatisfied required-symbol tag falls back to type-only when a type binding exists',
      listAvailableOriginals(untaggedModel, browserConsumer.areas[0]), [{ original: untagged.id, form: 'type-only' }]);
    const untyped = original(provider, 'Untyped', { hasValue: true, hasType: false, tags: [] });
    const untypedModel = modelOf([root, provider, browserConsumer], [untyped],
      [exposure(provider, untyped, ['parent']), exposure(root, untyped, ['descendants'], { provider: provider.id })]);
    assertions.equal('a value-only original with an unsatisfied required-symbol tag and no type binding is entirely absent',
      listAvailableOriginals(untypedModel, browserConsumer.areas[0]), []);
  } }],
  ['I2A-03:required-importer-block', { kind: 'memory', run: ({ assertions }) => {
    const registry = valid(resolveTagRegistry([{ name: 'testing', kind: 'required-importer' },
      { name: 'ui', kind: 'required-importer' }, { name: 'browser', kind: 'required-symbol' }]));
    const openRoot = moduleRecord('open', [], registry), openProvider = moduleRecord('open/provider', [], registry);
    const closedConsumer = moduleRecord('open/closed-consumer', [], registry);
    const uiTagged = original(openProvider, 'UiOnly', { hasValue: true, hasType: true, tags: ['ui'], registry });
    const model = modelOf([openRoot, openProvider, closedConsumer], [uiTagged],
      [exposure(openProvider, uiTagged, ['parent']), exposure(openRoot, uiTagged, ['descendants'], { provider: openProvider.id })], registry);
    assertions.equal('a missing required-importer tag blocks both forms entirely', listAvailableOriginals(model, closedConsumer.areas[0]), []);
    const uiConsumer = moduleRecord('open/ui-consumer', ['ui'], registry);
    const openModel = modelOf([openRoot, openProvider, uiConsumer], [uiTagged],
      [exposure(openProvider, uiTagged, ['parent']), exposure(openRoot, uiTagged, ['descendants'], { provider: openProvider.id })], registry);
    assertions.equal('a consumer carrying the required-importer tag sees it (positive control)',
      listAvailableOriginals(openModel, uiConsumer.areas[0]), [{ original: uiTagged.id, form: 'value' }]);
  } }],
  ['I2A-03:testing-origin', { kind: 'memory', run: ({ assertions }) => {
    const testOnly = original(provider, 'TestHelper', { file: 'tests/helper.ts', hasValue: true, hasType: true });
    const model = buildShop([testOnly]);
    assertions.equal('a testing-classified original is absent from a non-testing consumer', listAvailableOriginals(model, consumer.areas[0]), []);
    const testArea = consumer.areas.find(area => area.kind === 'tests')!;
    assertions.equal('the same original is present from a compatible testing consumer',
      listAvailableOriginals(model, testArea), [{ original: testOnly.id, form: 'value' }]);
  } }],
  ['I2A-03:test-complete-reclassification', { kind: 'memory', run: ({ assertions }) => {
    const browserConsumer = moduleRecord('shop/reclass-consumer', ['browser']);
    const untagged = original(provider, 'Upgrades', { hasValue: true, hasType: true, tags: [] });
    const testOnly = original(provider, 'Appears', { file: 'tests/appears.ts', hasValue: true, hasType: true });
    const model = modelOf([root, provider, browserConsumer], [untagged, testOnly], [
      exposure(provider, untagged, ['parent']), exposure(root, untagged, ['descendants'], { provider: provider.id }),
      exposure(provider, testOnly, ['parent']), exposure(root, testOnly, ['descendants'], { provider: provider.id }),
    ]);
    const testsArea = browserConsumer.areas.find(area => area.kind === 'tests')!;
    assertions.equal('ordinary sees only the required-symbol-blocked type-only form',
      listAvailableOriginals(model, browserConsumer.areas[0]), [{ original: untagged.id, form: 'type-only' }]);
    assertions.equal('the tests profile independently upgrades one original to value and reclassifies a testing-only original as present, without an overlay',
      listAvailableOriginals(model, testsArea), [{ original: untagged.id, form: 'value' }, { original: testOnly.id, form: 'value' }]);
  } }],
  ['I2A-03:same-owner-absent', { kind: 'memory', run: ({ assertions }) => {
    const ownSymbol = original(consumer, 'Local', { hasValue: true, hasType: true });
    const foreign = original(provider, 'Foreign', { hasValue: true, hasType: true });
    const model = modelOf([root, provider, consumer], [ownSymbol, foreign],
      [exposure(provider, foreign, ['parent']), exposure(root, foreign, ['descendants'], { provider: provider.id })]);
    const result = listAvailableOriginals(model, consumer.areas[0]);
    assertions.equal('own originals are absent even when otherwise fully exposed', result.map(entry => entry.original.binding), ['Foreign']);
  } }],
]);
