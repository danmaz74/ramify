// @vitest-environment jsdom

/**
 * The one test that needs a DOM: clicking a symbol really does light its layers
 * and dim the rest, in the live component.
 *
 * Everything else about the view is asserted against static markup. This file
 * exists because "click a symbol to see its propagation" is behaviour, not
 * markup - the component owns the selection state, and a controlled-prop test
 * would not prove that the handlers are wired to it.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { example1Diagram } from './diagrams/example1.js';
import { example3Diagram } from './diagrams/example3.js';
import { example4Diagram } from './diagrams/example4.js';
import { ModelDiagram, TOUR_DWELL_MS } from './ModelDiagram.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/**
 * Mounts with the tour off so every test starts from a quiet diagram; the
 * tour's own tests pass `autoPlay: true` (or render directly, to prove the
 * default).
 */
function mount(props: Parameters<typeof ModelDiagram>[0] = {}): void {
  act(() => {
    root.render(createElement(ModelDiagram, { autoPlay: false, ...props }));
  });
}

function find(selector: string): Element {
  const target = container.querySelector(selector);
  if (target === null) {
    throw new Error(`No element matches "${selector}".`);
  }
  return target;
}

function click(selector: string): void {
  const target = find(selector);
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/**
 * A pointer gesture: press, move through the given offsets, release, and then
 * the click the browser sends afterwards. jsdom has no PointerEvent, but React
 * dispatches on the event *name*, and a MouseEvent carries everything the
 * handlers read.
 */
function gesture(selector: string, moves: readonly [number, number][]): void {
  const target = find(selector);
  const pointer = (type: string, x: number, y: number): MouseEvent =>
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  act(() => {
    target.dispatchEvent(pointer('pointerdown', 0, 0));
    for (const [x, y] of moves) {
      target.dispatchEvent(pointer('pointermove', x, y));
    }
    const last = moves[moves.length - 1] ?? [0, 0];
    target.dispatchEvent(pointer('pointerup', last[0], last[1]));
    target.dispatchEvent(pointer('click', last[0], last[1]));
  });
}

function viewBox(): number[] {
  return (find('svg').getAttribute('viewBox') ?? '')
    .split(' ')
    .map((value) => Number(value));
}

const layerClass = (symbol: string): string =>
  container.querySelector(`g[data-layer="propagation"][data-symbol="${symbol}"]`)?.getAttribute('class') ??
  '';

/** Every lane path currently marching its dashes. */
const flowing = (): string[] =>
  [...container.querySelectorAll('[data-kind="lane"].rmf-flow')].map(
    (element) => element.getAttribute('data-symbol') ?? '',
  );

/** Every node row currently pulsing, as `<module>/<symbol>`. */
const blinking = (): string[] =>
  [...container.querySelectorAll('[data-kind="node-row"].rmf-blink')].map(
    (element) =>
      `${element.closest('[data-kind="node"]')?.getAttribute('data-module') ?? '?'}/${
        element.getAttribute('data-symbol') ?? '?'
      }`,
  );

/** How many lanes a symbol has, selected or not. */
const lanesOf = (symbol: string): number =>
  container.querySelectorAll(`[data-kind="lane"][data-symbol="${symbol}"]`).length;

/** Every declared importer context currently pulsing, as `<module>/<context>`. */
const litContexts = (): string[] =>
  [...container.querySelectorAll('[data-kind="node-context"].rmf-blink')].map(
    (element) =>
      `${element.getAttribute('data-module') ?? '?'}/${
        element.getAttribute('data-context') ?? element.getAttribute('data-context-scope') ?? '?'
      }`,
  );

describe('clicking a symbol', () => {
  it('lights its layer and dims the rest', () => {
    mount();
    expect(layerClass('ProductId')).not.toContain('rmf-dim');
    expect(layerClass('neutral')).not.toContain('rmf-dim');

    click('[data-kind="header-chip"][data-symbol="ProductId"]');

    expect(layerClass('ProductId')).not.toContain('rmf-dim');
    expect(layerClass('neutral')).toContain('rmf-dim');
    expect(layerClass('CartApi')).toContain('rmf-dim');
    // Dimmed, never hidden: the tree does not reflow.
    expect(container.querySelectorAll('g[data-kind="layer"]')).toHaveLength(8);
    expect(container.querySelectorAll('[data-kind="tree-edge"]')).toHaveLength(7);
    // Selection adds no arcs: the diagram draws the chords it declared.
    expect(container.querySelectorAll('[data-kind="chord"]')).toHaveLength(6);
  });

  it('sets its whole ribbon marching, and nothing else', () => {
    mount();
    expect(flowing()).toEqual([]);

    click('[data-kind="header-chip"][data-symbol="ProductId"]');
    // Both of ProductId's decisions animate, over every edge they travel.
    expect(flowing()).toHaveLength(lanesOf('ProductId'));
    expect(new Set(flowing())).toEqual(new Set(['ProductId']));

    // CartApi's ribbon is one hop; the absent second hop cannot animate.
    click('[data-kind="header-chip"][data-symbol="CartApi"]');
    expect(flowing()).toEqual(['CartApi']);
  });

  it('pulses every row that says the symbol is available there', () => {
    mount();
    expect(blinking()).toEqual([]);

    click('[data-kind="header-chip"][data-symbol="ProductId"]');
    // `shop` holds it; `catalog` owns it, and ownership is not an arrival.
    expect(blinking()).toEqual(['shop/ProductId']);

    click('[data-kind="header-chip"][data-symbol="PaymentApi"]');
    expect(blinking()).toEqual(['checkout/PaymentApi']);
  });

  it('deselects when the same symbol is clicked again', () => {
    mount();
    click('[data-kind="header-chip"][data-symbol="PaymentApi"]');
    expect(layerClass('neutral')).toContain('rmf-dim');
    expect(flowing()).not.toEqual([]);

    click('[data-kind="header-chip"][data-symbol="PaymentApi"]');
    expect(layerClass('neutral')).not.toContain('rmf-dim');
    // Both animations stop with the selection that started them.
    expect(flowing()).toEqual([]);
    expect(blinking()).toEqual([]);
  });

  it('deselects when the background is clicked', () => {
    mount({ defaultSelectedSymbol: 'CartApi' });
    expect(layerClass('neutral')).toContain('rmf-dim');

    click('[data-kind="background"]');
    expect(layerClass('neutral')).not.toContain('rmf-dim');
  });

  it('selects from a node row and from a lane, not only from the legend', () => {
    mount();
    click('#node-checkout-holds-CartApi');
    expect(layerClass('CartApi')).not.toContain('rmf-dim');
    expect(layerClass('ProductId')).toContain('rmf-dim');

    click('#lane-grant-shop-ProductId-shop-catalog');
    expect(layerClass('ProductId')).not.toContain('rmf-dim');
    expect(layerClass('CartApi')).toContain('rmf-dim');
  });

  it('lets a host drive the selection and observe it', () => {
    const seen: (string | null)[] = [];
    mount({ selectedSymbol: 'PaymentApi', onSelectSymbol: (symbol) => seen.push(symbol) });
    expect(layerClass('neutral')).toContain('rmf-dim');

    click('[data-kind="header-chip"][data-symbol="PaymentApi"]');
    // Controlled: the component reports the intent and leaves the state alone.
    expect(seen).toEqual([null]);
    expect(layerClass('neutral')).toContain('rmf-dim');
  });

  it('takes the room it is given, with a legibility floor and a scrolling wrapper', () => {
    mount();
    const root = find('[data-kind="diagram-root"]') as HTMLElement;
    // Takes whatever room the container offers, up to its own natural width -
    // magnifying past 1:1 would only make the figure taller.
    expect(root.style.width).toBe('100%');
    expect(root.style.maxWidth).toBe('1135px');
    expect(root.style.marginInline).toBe('auto');
    const wrapper = find('[data-kind="diagram-scroll"]') as HTMLElement;
    expect(wrapper.style.overflowX).toBe('auto');
    const svg = find('svg') as SVGSVGElement;
    // Scales to the container's width, but never below legibility (§3.9).
    expect(svg.style.width).toBe('100%');
    expect(svg.style.height).toBe('auto');
    expect(svg.style.minWidth).toBe('820px');
    // The intrinsic size stays, as the aspect-ratio fallback.
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(900);
  });
});

describe('a second diagram', () => {
  it('is live in exactly the same way, with its own symbols', () => {
    mount({ definition: example1Diagram });
    expect(container.querySelector('[data-module="invoiceComputation"]')).not.toBeNull();
    expect(layerClass('computeTotal')).not.toContain('rmf-dim');

    click('[data-kind="header-chip"][data-symbol="InvoiceModel"]');
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('InvoiceModel');
    expect(layerClass('computeTotal')).toContain('rmf-dim');
    // One up-hop and a grant down three edges, all marching.
    expect(flowing()).toHaveLength(lanesOf('InvoiceModel'));
    // Its arrivals: received at `invoicing`, granted to the two consumers.
    expect(blinking()).toEqual([
      'invoicing/InvoiceModel',
      'invoiceComputation/InvoiceModel',
      'invoicePDF/InvoiceModel',
    ]);

    // A granted row is clickable too: it carries the symbol's traced layer.
    click('#node-invoiceComputation-exposed-to-it-computeTotal');
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('computeTotal');
    // computeTotal arrives everywhere except its owner: one received row at
    // `app` and at `globalLibrary`, and a granted row in each of the six
    // modules below the root that neither owns nor passed it up.
    expect(blinking()).toEqual([
      'app/computeTotal',
      'globalLibrary/computeTotal',
      'invoicing/computeTotal',
      'invoicingLibrary/computeTotal',
      'invoiceComputation/computeTotal',
      'invoicePDF/computeTotal',
      'shipping/computeTotal',
      'routingOptimization/computeTotal',
    ]);
    // `moneyUtils` owns it, and an owns row never pulses.
    expect(blinking()).not.toContain('moneyUtils/computeTotal');
  });

  it('writes each contract’s role in its header row', () => {
    mount({ definition: example1Diagram });
    expect(find('[data-kind="header-chip"][data-symbol="computeTotal"]').textContent).toBe(
      'computeTotal - owner → parent → root → everywhere',
    );
  });

  it('shows a downward-only exposure as one flow and one arrival', () => {
    mount({ definition: example1Diagram });
    click('[data-kind="header-chip"][data-symbol="ShipmentPlan"]');
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('ShipmentPlan');
    // One decision, one marching grant flow, one blinking arrival - nothing
    // above `shipping` ever moves, because nothing above was ever involved.
    expect(flowing()).toHaveLength(lanesOf('ShipmentPlan'));
    expect(blinking()).toEqual(['routingOptimization/ShipmentPlan']);
  });

  it('pans and zooms its own viewBox', () => {
    mount({ definition: example1Diagram });
    const base = viewBox();
    click('[data-kind="zoom-in"]');
    expect(viewBox()[2]).toBeLessThan(base[2] as number);
    click('[data-kind="zoom-reset"]');
    expect(viewBox()).toEqual(base);
  });
});

/**
 * The two selection stories of `docs/model/illustrative-examples.md` examples 3
 * and 4, in the live component: selecting a tagged symbol must light exactly
 * the arrivals that may actually import it, and leave the rest dark.
 */
describe('selecting a symbol in a tag universe', () => {
  it('lights the test context and leaves production dark', () => {
    mount({ definition: example3Diagram });
    expect(blinking()).toEqual([]);
    expect(litContexts()).toEqual([]);

    // "Selecting resetOrderStore: the test module blinks, billing stays dark."
    click('[data-kind="header-chip"][data-symbol="resetOrderStore"]');
    expect(blinking()).toEqual(['integration-tests/resetOrderStore']);
    expect(litContexts()).toEqual(['integration-tests/module']);
    // The row is still drawn in `billing`, and still says where it came from -
    // it just goes dark, which is a contrast that survives reduced motion.
    const dark = find('#node-billing-exposed-to-it-resetOrderStore');
    expect(dark.getAttribute('data-importable')).toBe('false');
    expect(dark.getAttribute('class')).toContain('rmf-dim-soft');
    expect(dark.getAttribute('class')).not.toContain('rmf-blink');
    expect(find('#node-billing-exposed-to-it-resetOrderStore-tags').textContent).toBe(
      '⇥ testing',
    );
    // The strike is the static version of the same statement.
    expect(
      find('#node-billing-exposed-to-it-resetOrderStore-label').getAttribute('text-decoration'),
    ).toBe('line-through');
    // `app` routed the grant and its own production files are dark all the
    // same: routing a symbol earns no right to import it.
    expect(find('#node-app-exposed-to-it-resetOrderStore').getAttribute('class')).toContain(
      'rmf-dim-soft',
    );

    // "Selecting OrderService: both blink - the contrast is the picture."
    click('[data-kind="header-chip"][data-symbol="OrderService"]');
    expect(blinking()).toEqual([
      'app/OrderService',
      'billing/OrderService',
      'integration-tests/OrderService',
    ]);
    expect(litContexts()).toEqual(['integration-tests/module']);
  });

  it('mirrors it for the browser module', () => {
    mount({ definition: example4Diagram });

    // "Selecting queryDb: server blinks, ui stays dark."
    click('[data-kind="header-chip"][data-symbol="queryDb"]');
    expect(blinking()).toEqual(['app/queryDb', 'server/queryDb']);
    expect(litContexts()).toEqual([]);
    // …and the strike states the same verdict statically, with the unstruck
    // asterisk saying the type import still passes. No binding note exists.
    expect(
      find('#node-ui-exposed-to-it-queryDb-label').getAttribute('text-decoration'),
    ).toBe('line-through');
    expect(find('#node-ui-exposed-to-it-queryDb-type-available').textContent).toBe('∗');
    expect(container.querySelectorAll('[data-kind="node-row-type-available"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-kind="node-row-binding"]')).toHaveLength(0);

    // "Selecting formatMoney: both blink."
    click('[data-kind="header-chip"][data-symbol="formatMoney"]');
    expect(blinking()).toEqual(['app/formatMoney', 'ui/formatMoney', 'server/formatMoney']);
    expect(litContexts()).toEqual(['ui/module']);
  });

  it('draws the whole module as the context box, and nothing extra', () => {
    mount({ definition: example4Diagram });
    // The dashed box *fills* the node: a context can be a subtree of a
    // module's files or an entire module, and here it is the module.
    const attr = (selector: string, name: string): number =>
      Number(find(selector).getAttribute(name));
    for (const [name, inset] of [
      ['x', 3],
      ['y', 3],
      ['width', -6],
      ['height', -6],
    ] as const) {
      expect(attr('#node-ui-context-frame', name)).toBeCloseTo(
        attr('#node-ui-box', name) + inset,
        6,
      );
    }
    expect(find('#node-ui-context-label').textContent).toBe('⇤ browser');
    // One context in the diagram, and it belongs to `ui`.
    expect(container.querySelectorAll('[data-kind="node-context"]')).toHaveLength(1);
    expect(find('[data-kind="node-context"]').getAttribute('data-module')).toBe('ui');
  });
});

describe('the traced-contract tour', () => {
  const selected = (): string => find('svg').getAttribute('data-selected-symbol') ?? '';
  const dwell = (steps = 1): void => {
    act(() => {
      vi.advanceTimersByTime(steps * TOUR_DWELL_MS);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays by default: first contract selected at mount, and the toggle says stop', () => {
    act(() => {
      root.render(createElement(ModelDiagram, { definition: example1Diagram }));
    });
    expect(selected()).toBe('computeTotal');
    expect(find('[data-kind="play-toggle"]').getAttribute('data-playing')).toBe('true');
  });

  it('holds each contract for the dwell, ends the lap on none selected, forever', () => {
    mount({ definition: example1Diagram, autoPlay: true });
    expect(selected()).toBe('computeTotal');
    dwell();
    expect(selected()).toBe('InvoiceModel');
    dwell();
    expect(selected()).toBe('optimizeRoute');
    dwell();
    expect(selected()).toBe('ShipmentPlan');
    // The lap ends on a none-selected beat: the whole picture, one dwell.
    dwell();
    expect(selected()).toBe('');
    // Then the loop wraps and keeps going.
    dwell();
    expect(selected()).toBe('computeTotal');
    dwell(5);
    expect(selected()).toBe('computeTotal');
  });

  it('stops the moment the reader selects anything, and stays stopped', () => {
    mount({ definition: example1Diagram, autoPlay: true });
    click('[data-kind="header-chip"][data-symbol="optimizeRoute"]');
    expect(selected()).toBe('optimizeRoute');
    expect(find('[data-kind="play-toggle"]').getAttribute('data-playing')).toBe('false');
    dwell(4);
    expect(selected()).toBe('optimizeRoute');
  });

  it('the toggle stops holding the current selection, and play resumes from it', () => {
    mount({ definition: example1Diagram, autoPlay: true });
    dwell();
    expect(selected()).toBe('InvoiceModel');
    click('[data-kind="play-toggle"]');
    dwell(3);
    expect(selected()).toBe('InvoiceModel');
    click('[data-kind="play-toggle"]');
    // Resuming restarts the current contract's dwell rather than skipping on.
    expect(selected()).toBe('InvoiceModel');
    dwell();
    expect(selected()).toBe('optimizeRoute');
  });

  it('does not run when mounted with the tour off', () => {
    mount({ definition: example1Diagram });
    expect(selected()).toBe('');
    dwell(4);
    expect(selected()).toBe('');
  });
});

describe('pan and zoom', () => {
  it('makes the live component unselectable, so a drag never selects label text', () => {
    mount();
    const root = find('[data-kind="diagram-root"]') as HTMLElement;
    expect(root.style.userSelect).toBe('none');
  });

  it('pans on a real drag, and does not change the selection', () => {
    mount();
    const before = viewBox();
    gesture('[data-kind="background"]', [
      [10, 0],
      [40, 20],
    ]);
    const after = viewBox();
    // The window moved opposite the drag; the picture followed the pointer.
    expect(after[0]).toBeLessThan(before[0] as number);
    expect(after[1]).toBeLessThan(before[1] as number);
    // A drag is not a click: the trailing click must not deselect anything.
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('');
  });

  it('treats a gesture under the threshold as a click, not a pan', () => {
    mount({ defaultSelectedSymbol: 'ProductId' });
    const before = viewBox();
    // Two pixels of tremor while clicking the background still deselects.
    gesture('[data-kind="background"]', [[2, 0]]);
    expect(viewBox()).toEqual(before);
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('');
  });

  it('does not swallow the click after the drag that follows it', () => {
    mount();
    gesture('[data-kind="background"]', [[60, 0]]);
    click('[data-kind="header-chip"][data-symbol="CartApi"]');
    expect(layerClass('neutral')).toContain('rmf-dim');
  });

  it('stays armed for exactly one gesture, even when a drag produces no click', async () => {
    mount();
    const target = find('[data-kind="background"]');
    const pointer = (type: string, x: number, y: number): MouseEvent =>
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    act(() => {
      target.dispatchEvent(pointer('pointerdown', 0, 0));
      target.dispatchEvent(pointer('pointermove', 60, 0));
      target.dispatchEvent(pointer('pointerup', 60, 0));
      // No click follows: the pointer came up over canvas nothing listens on.
    });

    // A later click is a new gesture and must work, rather than being eaten by
    // a flag the previous drag left armed.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    click('[data-kind="header-chip"][data-symbol="ProductId"]');
    expect(find('svg').getAttribute('data-selected-symbol')).toBe('ProductId');
  });

  it('zooms with the buttons and clamps at both limits', () => {
    mount();
    const base = viewBox();
    click('[data-kind="zoom-in"]');
    expect(viewBox()[2]).toBeLessThan(base[2] as number);

    for (let step = 0; step < 30; step += 1) {
      click('[data-kind="zoom-in"]');
    }
    // 4x: the window is a quarter of the diagram, and the button is spent.
    expect(viewBox()[2]).toBeCloseTo((base[2] as number) / 4, 3);
    expect((find('[data-kind="zoom-in"]') as HTMLButtonElement).disabled).toBe(true);

    for (let step = 0; step < 40; step += 1) {
      click('[data-kind="zoom-out"]');
    }
    expect(viewBox()[2]).toBeCloseTo((base[2] as number) * 2, 3);
    expect((find('[data-kind="zoom-out"]') as HTMLButtonElement).disabled).toBe(true);
  });

  /** Dispatch a wheel over the diagram and hand back the event. */
  function wheel(init: WheelEventInit): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 100, clientY: 100, ...init });
    act(() => {
      find('svg').dispatchEvent(event);
    });
    return event;
  }

  it('zooms on a plain wheel, with no modifier to discover', () => {
    mount();
    const base = viewBox();
    const event = wheel({ deltaY: -120 });
    expect(viewBox()[2]).toBeLessThan(base[2] as number);
    // Scrolling is trapped over the figure on purpose: the page must not also
    // scroll while the reader is zooming.
    expect(event.defaultPrevented).toBe(true);
  });

  it('zooms the same way with Ctrl or Cmd held, so a trackpad pinch works', () => {
    mount();
    const base = viewBox();
    const withCtrl = wheel({ deltaY: -120, ctrlKey: true });
    const zoomed = viewBox()[2] as number;
    expect(zoomed).toBeLessThan(base[2] as number);
    // The browser's own Ctrl-wheel page zoom must not also fire.
    expect(withCtrl.defaultPrevented).toBe(true);

    click('[data-kind="zoom-reset"]');
    wheel({ deltaY: -120, metaKey: true });
    expect(viewBox()[2]).toBeCloseTo(zoomed, 6);
  });

  it('zooms perceptibly on a line-mode wheel, not by a fraction of a percent', () => {
    mount();
    const base = viewBox();
    // Firefox's units. Before normalisation this moved the view by 0.7% and
    // the user reported the wheel as doing nothing at all.
    wheel({ deltaY: -3, deltaMode: 1 });
    const ratio = (base[2] as number) / (viewBox()[2] as number);
    expect(ratio).toBeGreaterThan(1.1);
  });

  /**
   * Pointer capture retargets the whole gesture - including the `click` - to
   * the capturing element. Taking it on pointerdown therefore makes every
   * click land on the <svg>, and nothing inside the diagram is selectable
   * again. jsdom implements no pointer capture, so the only way to catch that
   * regression here is to watch when the call is made.
   */
  it('captures the pointer only once a gesture becomes a drag', () => {
    mount();
    const svg = find('svg') as SVGSVGElement & { setPointerCapture: (id: number) => void };
    const captured: number[] = [];
    svg.setPointerCapture = (id: number): void => {
      captured.push(id);
    };
    svg.releasePointerCapture = (): void => undefined;

    const pointer = (type: string, x: number, y: number): MouseEvent =>
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });

    act(() => {
      svg.dispatchEvent(pointer('pointerdown', 0, 0));
    });
    expect(captured).toEqual([]);

    act(() => {
      svg.dispatchEvent(pointer('pointermove', 2, 0));
    });
    expect(captured).toEqual([]);

    act(() => {
      svg.dispatchEvent(pointer('pointermove', 40, 0));
      svg.dispatchEvent(pointer('pointermove', 80, 0));
      svg.dispatchEvent(pointer('pointerup', 80, 0));
    });
    // Taken once the drag was real, and only once.
    expect(captured).toHaveLength(1);
  });

  it('zooms out on a downward wheel', () => {
    mount();
    click('[data-kind="zoom-in"]');
    const zoomedIn = viewBox()[2] as number;
    wheel({ deltaY: 120 });
    expect(viewBox()[2]).toBeGreaterThan(zoomedIn);
  });

  it('restores the whole diagram on reset', () => {
    mount();
    const base = viewBox();
    click('[data-kind="zoom-in"]');
    gesture('[data-kind="background"]', [[50, 30]]);
    expect(viewBox()).not.toEqual(base);

    click('[data-kind="zoom-reset"]');
    expect(viewBox()).toEqual(base);
    expect((find('[data-kind="zoom-reset"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops the controls and the handlers when interactivity is off', () => {
    mount({ interactive: false });
    expect(container.querySelector('[data-kind="diagram-controls"]')).toBeNull();
    const base = viewBox();
    gesture('[data-kind="background"]', [[60, 40]]);
    expect(viewBox()).toEqual(base);
  });
});
