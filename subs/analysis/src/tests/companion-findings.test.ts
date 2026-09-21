import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisDiagnostic, AnalysisReport, RetainedSession, SessionInputs, SessionRevision } from '../index.js';
import type { SourceLimit } from '../../subs/typescript/src/interfaces/source.js';
import { audited, equalToBatch, fixture, instrumentCompiler, opened, put, replace, revised, timeout } from './session-test-fixture.js';

/**
 * Plan 8 iteration 3: the signature-companion finding and its coverage notes
 * in batch and on every retained revision path. The fixture follows the
 * reference example's shape: an owner exposing to its parent, a parent
 * re-exposing a child's symbol, and a tag violation, beside the session
 * fixture's existing modules.
 */
const files = {
  orders: 'subs/orders/module.ramify',
  placeOrder: 'subs/orders/src/place-order.ts',
  arrows: 'subs/orders/src/arrows.ts',
  limits: 'subs/orders/src/limits.ts',
  checkout: 'src/checkout.ts',
  extra: 'subs/orders/src/extra.ts',
} as const;
const ordersDescription = [
  'ramify 1', 'module orders',
  'expose-src placeOrder from "place-order.ts" to parent',
  'expose-src Receipt from "receipt.ts" to parent',
  'expose-src placeByArrow, placeByExpression, placePartial from "arrows.ts" to parent',
  'expose-src lookup, count from "limits.ts" to parent',
  '',
].join('\n');
const companionFixture: Record<string, string> = {
  [files.orders]: ordersDescription,
  'subs/orders/README.md': '# Orders\n\nThe orders owner places orders for its parent.\n',
  'subs/orders/src/order.ts': 'export interface Order { readonly id: string }\nexport interface Coupon { readonly code: string }\n',
  'subs/orders/src/receipt.ts': 'export interface Receipt { readonly id: string }\n',
  [files.placeOrder]: "import type { Order } from './order.js';\nimport type { Receipt } from './receipt.js';\n"
    + 'export function placeOrder(order: Order): Receipt {\n  return { id: order.id };\n}\n',
  [files.arrows]: "import type { Order } from './order.js';\n"
    + 'export const placeByArrow = (order: Order): void => { void order; };\n'
    + 'export const placeByExpression = function (order: Order): void { void order; };\n'
    + 'export const placePartial = (order: Order, note: string) => { void order; return note; };\n',
  [files.limits]: 'export function lookup(key: Missing): void { void key; }\n'
    + 'export function count(value: number) { return value; }\n'
    + 'export function later(value: number) { return value; }\n',
  'subs/orders/src/hidden.ts': 'export const hiddenValue: number = 1;\n',
  [files.checkout]: "import { hiddenValue } from '../subs/orders/src/hidden.js';\nvoid hiddenValue;\n",
  'subs/shop/module.ramify': 'ramify 1\nmodule shop\nexpose-sub addItem from cart to parent\n',
  'subs/shop/README.md': '# Shop\n\nThe shop relays its cart.\n',
  'subs/shop/subs/cart/module.ramify': 'ramify 1\nmodule cart\nexpose-src addItem, Item from "cart.ts" to parent\n',
  'subs/shop/subs/cart/README.md': '# Cart\n\nThe cart adds items.\n',
  'subs/shop/subs/cart/src/cart.ts': 'export interface Item { readonly sku: string }\nexport function addItem(item: Item): void { void item; }\n',
  'subs/views/module.ramify': 'ramify 1\nmodule views\nexpose-src render from "render.ts" to parent\nexpose-src Widget from "widget.ts" tagged [ui] to parent\n',
  'subs/views/README.md': '# Views\n\nThe views render widgets.\n',
  'subs/views/src/widget.ts': 'export interface Widget { readonly label: string }\n',
  'subs/views/src/render.ts': "import type { Widget } from './widget.js';\nexport function render(widget: Widget): void { void widget; }\n",
};

type Located = { readonly location: { readonly file: string; readonly line: number; readonly column: number } | null };
const place = (item: Located): string => item.location ? `${item.location.file}:${item.location.line}:${item.location.column}` : '';
const companionFindings = (list: readonly AnalysisDiagnostic[]): AnalysisDiagnostic[] => list.filter(item => item.code === 'exposed-without-companion');
const signatureNotes = (list: readonly SourceLimit[]): SourceLimit[] => list.filter(item => item.code.startsWith('signature-'));
const summary = (list: readonly AnalysisDiagnostic[]): string[][] => companionFindings(list)
  .map(item => [item.original!.binding, place(item), item.related.map(at => `${at.file}:${at.line}:${at.column}`).join(' ')])
  // Findings at one statement are ordered by identity in a report; compare them by symbol.
  .sort((a, b) => a[1]!.localeCompare(b[1]!, 'en', { numeric: true }) || a[0]!.localeCompare(b[0]!) || a[2]!.localeCompare(b[2]!));
const notes = (list: readonly SourceLimit[]): string[][] => signatureNotes(list).map(item => [item.code, place(item)]);

/** The complete retained report equals a fresh batch report, and the retained facts a whole recomputation. */
async function agreed(handle: RetainedSession, inputs: SessionInputs): Promise<AnalysisReport> {
  const report = await equalToBatch(handle, inputs);
  await audited(handle);
  expect(new Set(report.diagnostics.map(item => item.id)).size).toBe(report.diagnostics.length);
  expect(new Set(report.coverage.map(item => item.id)).size).toBe(report.coverage.length);
  return report;
}
const zeroCompiler = (revision: SessionRevision, compiler: ReturnType<typeof instrumentCompiler>): void => {
  expect([compiler.update.mock.calls.length, compiler.describe.mock.calls.length, compiler.interpret.mock.calls.length]).toEqual([0, 0, 0]);
  expect([revision.timings.compiler, revision.timings.descriptions, revision.timings.accesses]).toEqual([0, 0, 0]);
};

describe('signature-companion findings in batch and the retained session', () => {
  it('SC16/SC17: reports the finding with its location, related location and message, beside every import decision', () => fixture(async (_root, inputs) => {
    const { session: _session, ...request } = inputs;
    const batch = await analyzeProject(request);
    if (batch.status !== 'reported') throw new Error('Batch was cancelled');
    const report = batch.report;
    expect(report.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
    expect(report.stages.map(stage => [stage.stage, stage.status])).toEqual(['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report']
      .map(stage => [stage, 'completed']));
    const placed = companionFindings(report.diagnostics).find(item => item.original?.binding === 'placeOrder');
    expect(placed).toEqual({ id: expect.stringMatching(/^companion-diagnostic\/1:[0-9a-f]{64}$/), category: 'exposure', code: 'exposed-without-companion',
      message: '`placeOrder` is exposed to parent without `Order`, which its signature names (subs/orders/src/place-order.ts:3:35). '
        + 'Expose `Order` to parent, or remove it from the signature.',
      location: expect.objectContaining({ file: files.orders, line: 3, column: 1 }),
      related: [expect.objectContaining({ file: files.placeOrder, line: 3, column: 35 })],
      importer: null, original: { kind: 'code', owner: 'fixture/orders', file: 'place-order.ts', binding: 'placeOrder' }, accessId: null });
    expect(summary(report.diagnostics)).toEqual([
      ['placeOrder', `${files.orders}:3:1`, `${files.placeOrder}:3:35`],
      ['placeByArrow', `${files.orders}:5:1`, `${files.arrows}:2:37`],
      ['placeByExpression', `${files.orders}:5:1`, `${files.arrows}:3:51`],
      ['placePartial', `${files.orders}:5:1`, `${files.arrows}:4:37`],
      ['addItem', 'subs/shop/module.ramify:3:1', 'subs/shop/subs/cart/src/cart.ts:2:31'],
      ['render', 'subs/views/module.ramify:3:1', 'subs/views/src/render.ts:2:32'],
    ]);
    // The re-exposure is reported at the relaying parent only, never at the cart that exposes both.
    expect(companionFindings(report.diagnostics).filter(item => item.location?.file.startsWith('subs/shop/subs/cart/'))).toEqual([]);
    const tagged = companionFindings(report.diagnostics).find(item => item.original?.binding === 'render')!;
    expect(tagged.message).toBe('`render` is exposed without the required-importer tags [ui] of `Widget`, which its signature names '
      + '(subs/views/src/render.ts:2:32). Tag the exposure of `render` [ui], or remove `Widget` from the signature.');
    // SC17: the unrelated denial is still decided and reported in the same run.
    expect(report.diagnostics.filter(item => item.category === 'import').map(item => [item.code, item.location?.file])).toEqual([['not-visible', files.checkout]]);
    expect(report.summary).toMatchObject({ denied: 1, errors: 7 });
    expect(report.snapshot!.results).toHaveLength(report.snapshot!.accesses.length);
    // Explicitly typed arrows and function expressions set no inference note; the partial one does.
    expect(notes(report.coverage)).toEqual([
      ['signature-inferred', `${files.arrows}:4:14`],
      ['signature-unresolved', `${files.limits}:1:1`],
      ['signature-inferred', `${files.limits}:2:1`],
    ]);
    // No note for the unexposed `later`, and notes are never findings.
    expect(report.diagnostics.some(item => (item.code as string).startsWith('signature-'))).toBe(false);
  }, companionFixture), timeout);

  it('SC18/SC20: every revision path reports the findings and notes a fresh batch check reports', () => fixture(async (root, inputs) => {
    const { handle, state, revision: cold } = await opened(inputs);
    try {
      expect(cold.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'partial' });
      let report = await agreed(handle, inputs);
      expect(summary(report.diagnostics)).toHaveLength(6);
      expect(report.diagnostics.filter(item => item.code === 'not-visible')).toHaveLength(1);

      // A signature edit adds a finding on the source path.
      let compiler = instrumentCompiler(state);
      await replace(root, files.placeOrder, "import type { Order } from './order.js';", "import type { Coupon, Order } from './order.js';");
      await replace(root, files.placeOrder, 'placeOrder(order: Order): Receipt', 'placeOrder(order: Order, coupon: Coupon): Receipt');
      const signature = await revised(handle, [files.placeOrder]);
      expect(signature.checked).toMatchObject({ path: 'source', modelRebuilt: true });
      expect(signature.delta.added.map(item => item.message)).toEqual([
        '`placeOrder` is exposed to parent without `Coupon`, which its signature names (subs/orders/src/place-order.ts:3:50). '
          + 'Expose `Coupon` to parent, or remove it from the signature.']);
      expect(signature.timings.companions).toBeGreaterThan(0);
      expect(signature.timings.companions).toBeLessThanOrEqual(signature.timings.decide);
      report = await agreed(handle, inputs);
      const beforeBody = report.diagnostics;

      // A body edit leaving the signature evidence in place keeps every identity.
      compiler = instrumentCompiler(state);
      await replace(root, files.placeOrder, '  return { id: order.id };', '  void coupon;\n  return { id: order.id };');
      const body = await revised(handle, [files.placeOrder]);
      expect(body.checked).toMatchObject({ path: 'unchanged-surface', modelRebuilt: false });
      expect(body.delta).toEqual({ added: [], removed: [], positionOnly: [] });
      report = await agreed(handle, inputs);
      expect(report.diagnostics).toEqual(beforeBody);

      // A blank line before the violating signature is a move: no relink, one description, refreshed evidence.
      compiler = instrumentCompiler(state);
      await replace(root, files.placeOrder, 'export function placeOrder', '\nexport function placeOrder');
      const blank = await revised(handle, [files.placeOrder]);
      expect(blank.checked).toMatchObject({ path: 'unchanged-surface', modelRebuilt: false });
      expect(compiler.update).toHaveBeenCalledTimes(1);
      expect(compiler.describe.mock.calls.map(call => call[0])).toEqual([[files.placeOrder]]);
      report = await agreed(handle, inputs);
      expect(summary(report.diagnostics).filter(item => item[0] === 'placeOrder').map(item => item[2]).sort())
        .toEqual([`${files.placeOrder}:4:35`, `${files.placeOrder}:4:50`]);

      // Moving only the naming position within the declaration is a move too.
      compiler = instrumentCompiler(state);
      await replace(root, files.placeOrder, 'placeOrder(order: Order,', 'placeOrder(order:  Order,');
      const naming = await revised(handle, [files.placeOrder]);
      expect(naming.checked).toMatchObject({ path: 'unchanged-surface', modelRebuilt: false });
      expect(compiler.describe.mock.calls.map(call => call[0])).toEqual([[files.placeOrder]]);
      report = await agreed(handle, inputs);
      expect(companionFindings(report.diagnostics).filter(item => item.original?.binding === 'placeOrder').map(item => item.related[0]!.column).sort()).toEqual([36, 51]);

      // Position-only edits of exposed originals with inferred and unresolved signatures refresh their notes.
      const beforeNotes = notes(report.coverage);
      compiler = instrumentCompiler(state);
      await replace(root, files.limits, 'export function lookup', '// Every declaration below moves.\nexport function lookup');
      const shifted = await revised(handle, [files.limits]);
      expect(shifted.checked.modelRebuilt).toBe(false);
      report = await agreed(handle, inputs);
      expect(notes(report.coverage)).toEqual(beforeNotes.map(([code, at]) => [code, at!.startsWith(files.limits)
        ? at!.replace(/:(\d+):1$/, (_all, line: string) => `:${Number(line) + 1}:1`) : at!]));

      // Fixing the description removes the findings on the description path, with no compiler work.
      compiler = instrumentCompiler(state);
      await replace(root, files.orders, 'expose-src Receipt from', 'expose-src Order, Coupon from "order.ts" to parent\nexpose-src Receipt from');
      const fixed = await revised(handle, [files.orders]);
      expect(fixed.checked).toMatchObject({ path: 'description', modelRebuilt: true });
      zeroCompiler(fixed, compiler);
      expect(fixed.delta.added).toEqual([]);
      expect(fixed.delta.removed).toHaveLength(5);
      report = await agreed(handle, inputs);
      expect(summary(report.diagnostics).map(item => item[0])).toEqual(['addItem', 'render']);
      // The explicitly typed arrow and function expression pass now, with no inference note.
      expect(signatureNotes(report.coverage).map(item => item.message.split(' ')[0])).toEqual(['`placePartial`', '`lookup`', '`count`']);

      // SC20: exposing an original whose `inferred` fact is set adds its note on the description path.
      compiler = instrumentCompiler(state);
      await replace(root, files.orders, 'expose-src lookup, count from', 'expose-src lookup, count, later from');
      const exposed = await revised(handle, [files.orders]);
      expect(exposed.checked.path).toBe('description');
      zeroCompiler(exposed, compiler);
      report = await agreed(handle, inputs);
      expect(signatureNotes(report.coverage).map(item => item.message.split(' ')[0])).toEqual(['`placePartial`', '`lookup`', '`count`', '`later`']);
      expect(exposed.outcome.check).toBe('failed');

      // Membership and broad paths agree with batch too.
      await put(root, files.extra, 'export const extra: number = 1;\n');
      const created = await revised(handle, [files.extra], 'created');
      expect(created.checked.path).toBe('membership');
      await agreed(handle, inputs);
      await replace(root, 'tsconfig.json', '"skipLibCheck":true', '"skipLibCheck":true,"allowUnreachableCode":true');
      const configured = await revised(handle, ['tsconfig.json']);
      expect(configured.checked.path).toBe('broad');
      report = await agreed(handle, inputs);
      expect(summary(report.diagnostics).map(item => item[0])).toEqual(['addItem', 'render']);
      expect(report.diagnostics.filter(item => item.code === 'not-visible')).toHaveLength(1);
    } finally { await handle.dispose(); }
  }, companionFixture), timeout);

  it('SC20: coverage notes alone never fail the check', () => fixture(async (_root, inputs) => {
    const { session: _session, ...request } = inputs;
    const batch = await analyzeProject(request);
    if (batch.status !== 'reported') throw new Error('Batch was cancelled');
    expect(batch.report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(batch.report.diagnostics).toEqual([]);
    expect(notes(batch.report.coverage)).toEqual([['signature-inferred', 'subs/branch/src/provider.ts:1:14']]);
  }, { 'subs/branch/src/provider.ts': 'export const value = 1;\nexport function compute(): number {\n  return 2;\n}\n' }), timeout);
});
