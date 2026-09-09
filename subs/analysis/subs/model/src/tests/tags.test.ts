import { describe, expect, it } from 'vitest';
import { explainImport, explainVisibility } from '../index.js';
import type { BindingRequest } from '../index.js';
import { exposure, modelOf, moduleRecord, original, question } from './fixtures.js';

// Independent teaching universes retained from the legacy tags tests. Fixture
// declarations and expected outcomes do not import presentation or its adapter.
describe('testing support across the original teaching exposure chains', () => {
  const owners = {
    app: moduleRecord('app'), sales: moduleRecord('app/sales'),
    orders: moduleRecord('app/sales/orders'), salesTests: moduleRecord('app/sales/sales-tests', ['testing']),
    integration: moduleRecord('app/integration-tests', ['testing']), billing: moduleRecord('app/billing'),
    unit: moduleRecord('app/billing/unit-tests', ['testing']), shipping: moduleRecord('app/shipping'),
  };
  const service = original(owners.orders, 'OrderService');
  const reset = original(owners.orders, 'resetOrderStore', { tags: ['testing'] });
  const fixture = original(owners.orders, 'orderFixtures', { tags: ['testing'] });
  const internals = original(owners.orders, 'orderStoreInternals', { tags: ['testing'] });
  const model = modelOf(Object.values(owners), [service, reset, fixture, internals], [
    ...[service, reset].flatMap((symbol) => [
      exposure(owners.orders, symbol, ['parent']),
      exposure(owners.sales, symbol, ['parent'], { provider: owners.orders.id }),
      exposure(owners.app, symbol, ['descendants'], { provider: owners.sales.id }),
    ]),
    exposure(owners.orders, fixture, ['parent']),
    exposure(owners.sales, fixture, ['descendants'], { provider: owners.orders.id }),
  ]);

  it('preserves the ordinary/test-support difference at every exposure breadth for both request forms', () => {
    for (const owner of Object.values(owners)) for (const request of ['value', 'type-only'] as const) {
      expect(explainVisibility(model, owner.id, service.id).visible).toBe(true);
      expect(explainVisibility(model, owner.id, reset.id).visible).toBe(true);
      expect(explainImport(model, question(owner, service, { selection: { original: service.id, request } })).status)
        .toBe('allowed');
      const receivesTesting = owner.id === owners.orders.id || owner.headerTags.includes('testing');
      expect(explainImport(model, question(owner, reset, { selection: { original: reset.id, request } })))
        .toMatchObject({ status: receivesTesting ? 'allowed' : 'denied',
          reason: owner.id === owners.orders.id ? 'same-owner' : receivesTesting ? 'exposed' : 'required-importer-tag',
          original: { id: reset.id, tags: ['testing'] } });
    }
  });

  it('distinguishes missing exposure from a visible contract with an unmet testing tag', () => {
    for (const owner of [owners.integration, owners.unit]) {
      expect(explainImport(model, question(owner, fixture))).toMatchObject({
        status: 'denied', reason: 'not-visible', requirements: [],
      });
    }
    expect(explainImport(model, question(owners.sales, fixture)))
      .toMatchObject({ status: 'denied', reason: 'required-importer-tag' });
    expect(explainImport(model, question(owners.salesTests, fixture))).toMatchObject({ status: 'allowed' });
    for (const owner of Object.values(owners)) {
      expect(explainImport(model, question(owner, internals)))
        .toMatchObject({ status: owner.id === owners.orders.id ? 'allowed' : 'denied',
          reason: owner.id === owners.orders.id ? 'same-owner' : 'not-visible' });
    }
    expect(model.originals.filter(({ id }) => id.binding === reset.id.binding).map(({ id }) => id.owner))
      .toEqual([owners.orders.id]);
  });
});

describe('the browser promise remains per original and source area', () => {
  const owners = {
    app: moduleRecord('app'), shared: moduleRecord('app/shared'),
    ui: moduleRecord('app/ui', ['browser']), renderer: moduleRecord('app/ui/renderer'),
    widgets: moduleRecord('app/ui/widgets', ['browser']), server: moduleRecord('app/server'),
  };
  const money = original(owners.shared, 'formatMoney', { tags: ['browser'] });
  const database = original(owners.shared, 'queryDb');
  const model = modelOf(Object.values(owners), [money, database], [money, database].flatMap((symbol) => [
    exposure(owners.shared, symbol, ['parent']),
    exposure(owners.app, symbol, ['descendants'], { provider: owners.shared.id }),
  ]));

  it.each([
    ['server', 'value', 'allowed', 'allowed'], ['ui', 'value', 'allowed', 'denied'],
    ['ui', 'type-only', 'allowed', 'allowed'], ['renderer', 'value', 'allowed', 'allowed'],
    ['widgets', 'value', 'allowed', 'denied'],
  ] as const)('%s %s keeps the independently expected browser decisions', (owner, request, moneyStatus, databaseStatus) => {
    for (const [symbol, status] of [[money, moneyStatus], [database, databaseStatus]] as const) {
      expect(explainVisibility(model, owners[owner].id, symbol.id).visible).toBe(true);
      expect(explainImport(model, question(owners[owner], symbol, { selection: { original: symbol.id, request } })).status)
        .toBe(status);
    }
  });
});

describe('declared testing owners and their independently classified children', () => {
  const app = moduleRecord('app');
  const support = moduleRecord('app/test-support', ['testing']);
  const internals = moduleRecord('app/test-support/internals', ['testing']);
  const formatting = moduleRecord('app/test-support/formatting');
  const browserTests = moduleRecord('app/ui-tests', ['testing', 'browser']);
  const ui = moduleRecord('app/ui', ['browser']);
  const clock = original(support, 'fakeClock');
  const timer = original(internals, 'stubTimer');
  const format = original(formatting, 'formatDate', { tags: [] });
  const browserFake = original(support, 'browserFake', { tags: ['testing', 'browser'] });
  const model = modelOf([app, support, internals, formatting, browserTests, ui], [clock, timer, format, browserFake], [
    ...[clock, browserFake].map((symbol) => exposure(support, symbol, ['parent'])),
    exposure(internals, timer, ['parent']), exposure(support, timer, ['parent'], { provider: internals.id }),
    exposure(formatting, format, ['parent']), exposure(support, format, ['parent'], { provider: formatting.id }),
    ...[clock, timer, format, browserFake].map((symbol) => exposure(app, symbol, ['descendants'], { provider: support.id })),
  ]);

  it('does not inherit testing into a production child or transfer a relay owner to its original', () => {
    expect(clock.tags).toEqual(['testing']);
    expect(timer.tags).toEqual(['testing']);
    expect(format.tags).toEqual([]);
    expect(explainImport(model, question(app, format))).toMatchObject({ status: 'allowed', original: { id: format.id } });
    for (const symbol of [clock, timer]) {
      expect(explainVisibility(model, app.id, symbol.id).visible).toBe(true);
      // The definitive source-origin guard now explains this legacy denial.
      expect(explainImport(model, question(app, symbol))).toMatchObject({ status: 'denied', reason: 'testing-origin' });
    }
  });

  it.each<readonly [BindingRequest, 'allowed' | 'denied', 'allowed' | 'denied']>([
    ['value', 'denied', 'allowed'], ['type-only', 'allowed', 'allowed'],
  ])('combines a browser testing profile with the %s request', (request, clockStatus, promisedStatus) => {
    for (const [symbol, status] of [[clock, clockStatus], [browserFake, promisedStatus]] as const) {
      expect(explainImport(model, question(browserTests, symbol, { selection: { original: symbol.id, request } })).status)
        .toBe(status);
      expect(explainImport(model, question(ui, symbol, { selection: { original: symbol.id, request } })))
        .toMatchObject({ status: 'denied', reason: 'testing-origin' });
    }
  });
});
