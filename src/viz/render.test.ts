import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { example1Diagram } from './diagrams/example1.js';
import { ModelDiagramSvg, type ModelDiagramProps } from './ModelDiagram.js';

function render(props: ModelDiagramProps = {}): string {
  return renderToStaticMarkup(createElement(ModelDiagramSvg, props));
}

function count(markup: string, pattern: RegExp): number {
  return [...markup.matchAll(pattern)].length;
}

const markup = render();

describe('static markup', () => {
  it('is deterministic', () => {
    expect(render()).toBe(markup);
  });

  it('is a self-contained SVG carrying its own light-theme colors', () => {
    expect(markup.startsWith('<svg')).toBe(true);
    expect(markup).toContain('viewBox=');
    // Light values are the base definitions, so the file renders standalone.
    // The traced hues are numbered slots: ProductId wears slot 1 by the shop
    // definition's choice, not by anything the renderer knows.
    expect(markup).toContain('--rmf-traced1:#4C6EF5');
    expect(markup).toContain('prefers-color-scheme:dark');
    expect(markup).toContain('--rmf-traced1:#8DA2FB');
    // Quotes inside the stylesheet survive: it is not HTML-escaped.
    expect(markup).toContain('[data-theme="dark"]');
  });

  it('gives every traced symbol its own layer, beside the neutral bundle', () => {
    for (const layer of ['neutral', 'ProductId', 'PaymentApi', 'CartApi']) {
      expect(markup).toContain(`data-layer="propagation" data-symbol="${layer}"`);
    }
    for (const layer of ['tree', 'chords', 'nodes', 'legend']) {
      expect(markup).toContain(`data-layer="${layer}"`);
    }
    expect(count(markup, /data-kind="layer"/gu)).toBe(8);
  });

  it('carries stable ids and data attributes on every element', () => {
    expect(markup).toContain('id="node-checkout"');
    expect(markup).toContain('id="node-checkout-receives-CartApi"');
    expect(markup).toContain('id="edge-checkout-payment"');
    expect(markup).toContain('id="lane-to-descendants-shop-ProductId-catalog-search"');
    expect(markup).toContain('id="dot-to-parent-cart-CartApi"');
    expect(markup).toContain('id="chord-D4"');
    expect(markup).toContain('data-kind="decision-dot"');
    expect(markup).toContain('data-verdict="denied"');
    expect(markup).toContain('data-module="shipping"');
  });

  it('draws the whole universe: eight modules, seven edges, eight dots, six chords', () => {
    for (const id of ['shop', 'catalog', 'search', 'inventory', 'checkout', 'cart', 'payment', 'shipping']) {
      expect(markup).toContain(`data-module="${id}"`);
    }
    expect(count(markup, /data-kind="tree-edge"/gu)).toBe(7);
    expect(count(markup, /data-kind="decision-dot"/gu)).toBe(8);
    expect(count(markup, /data-kind="chord"/gu)).toBe(6);
    expect(count(markup, /data-kind="lane"/gu)).toBe(22);
    // The teaching pair: PaymentApi travels on, CartApi stops.
    expect(markup).toContain('data-symbol="PaymentApi" data-owner="payment" data-marker="▼"');
    expect(markup).toContain('data-symbol="CartApi" data-owner="cart" data-marker="·"');
  });

  it('shows Panel A + Panel B with no selection', () => {
    expect(markup).toContain('data-selected-symbol=""');
    // The dimming classes are defined in the stylesheet but applied nowhere.
    expect(markup).not.toContain('class="rmf-layer rmf-dim');
    expect(markup).not.toContain('class="rmf-dim');
  });

  it('carries no animation: selection is interactive-only', () => {
    // The keyframes ship with the stylesheet, so the same markup animates the
    // moment a host selects something - but nothing in the export wears the
    // classes, so the emitted picture is still.
    expect(markup).toContain('@keyframes rmf-march');
    expect(markup).toContain('@keyframes rmf-pulse');
    expect(markup).toContain('prefers-reduced-motion:reduce');
    expect(count(markup, /rmf-flow(?!\{|\})/gu)).toBe(0);
    expect(count(markup, /rmf-blink(?!\{|\})/gu)).toBe(0);
    expect(markup).not.toContain('class="rmf-s-traced1 rmf-flow"');
  });

  it('carries no tour toggle: playback belongs to the live component', () => {
    expect(markup).not.toContain('data-kind="play-toggle"');
  });

  it('carries no viewport machinery: the static export is a picture, not a widget', () => {
    // Zoom is viewBox arithmetic, so nothing about it reaches the emitted file:
    // no controls, no wrapper <g>, no transform, no inline sizing on the root.
    expect(markup).not.toContain('diagram-controls');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('transform=');
    expect(markup).not.toContain('touch-action');
    expect(markup.slice(0, markup.indexOf('>'))).not.toContain('style=');
    // The window shown is the whole diagram, at its intrinsic size.
    const root = markup.slice(0, markup.indexOf('>'));
    expect(root).toContain('width="1106" height="1172" viewBox="0 0 1106 1172"');
    // The ground is exactly diagram-sized, not the grown interactive one.
    expect(markup).toContain('data-kind="background" class="rmf-f-bg" x="0" y="0" width="1106" height="1172"');
  });

  it('scales to its container only when asked', () => {
    const responsive = render({ responsive: true, minWidth: 820 });
    expect(responsive).toContain('min-width:820px');
    expect(responsive).toContain('width:100%');
    // The intrinsic width/height stay put as the aspect-ratio fallback.
    expect(responsive).toContain('width="1106" height="1172"');
  });

  it('shows the window a caller asks for, without touching the element tree', () => {
    const zoomed = render({ view: { x: 100, y: 50, width: 400, height: 368.7 } });
    expect(zoomed).toContain('viewBox="100 50 400 368.7"');
    expect(zoomed).not.toContain('transform=');
    expect(count(zoomed, /data-kind="layer"/gu)).toBe(count(markup, /data-kind="layer"/gu));
  });

  it('drops the chord layer when only Panel A is wanted', () => {
    const panelA = render({ showChords: false });
    expect(panelA).not.toContain('data-layer="chords"');
    expect(panelA).toContain('data-layer="propagation"');
  });
});

describe('focus view', () => {
  const focused = render({ selectedSymbol: 'ProductId' });

  it('dims every other layer rather than hiding it, so the tree never reflows', () => {
    expect(focused).toContain('data-symbol="ProductId" class="rmf-layer rmf-clickable"');
    expect(focused).toContain('data-symbol="neutral" class="rmf-layer rmf-dim');
    expect(focused).toContain('data-symbol="CartApi" class="rmf-layer rmf-dim');
    // Nothing is removed: the same eight layers are present.
    expect(count(focused, /data-kind="layer"/gu)).toBe(8);
    expect(count(focused, /data-kind="tree-edge"/gu)).toBe(7);
  });

  it('draws no chord it did not declare, selected or not', () => {
    // Selection animates the flow; it never adds arcs.
    expect(count(focused, /data-kind="chord"/gu)).toBe(6);
    expect(count(focused, /data-kind="chord"/gu)).toBe(count(markup, /data-kind="chord"/gu));
  });

  it('sets the flow marching on exactly the selected symbol’s lanes', () => {
    // ProductId's two decisions: one exposure to the parent and a flow to descendants down seven edges.
    expect(count(focused, /class="rmf-s-traced1 rmf-flow"/gu)).toBe(8);
    expect(count(focused, /rmf-flow"/gu)).toBe(8);
    const cartApi = render({ selectedSymbol: 'CartApi' });
    // CartApi's ribbon is one hop long, and that one hop is what animates.
    expect(count(cartApi, /rmf-flow"/gu)).toBe(1);
  });

  it('pulses the rows that say the symbol is available there', () => {
    // `shop` receives ProductId; `catalog` owns it, and an owner does not pulse.
    expect(focused).toContain(
      'id="node-shop-receives-ProductId" data-kind="node-row" data-compartment="receives" ' +
        'data-symbol="ProductId" data-owner="catalog" data-marker="▼" data-gray="false" ' +
        'class="rmf-blink rmf-clickable"',
    );
    // Once in the markup; the other two mentions are the stylesheet's rules.
    expect(count(focused, /rmf-blink(?!\{)/gu)).toBe(1);
    expect(focused).toContain(
      'id="node-catalog-owns-ProductId" data-kind="node-row" data-compartment="owns" ' +
        'data-symbol="ProductId" data-owner="catalog" data-marker="▲" data-gray="false" ' +
        'class="rmf-clickable"',
    );
  });

  it('reports the selection on the root element', () => {
    expect(focused).toContain('data-selected-symbol="ProductId"');
  });
});

describe('a second diagram, from a second definition', () => {
  const example1 = render({ definition: example1Diagram, standalone: true });

  it('is deterministic', () => {
    expect(render({ definition: example1Diagram, standalone: true })).toBe(example1);
  });

  it('draws example 1’s universe, not the shop’s', () => {
    for (const id of [
      'app',
      'globalLibrary',
      'moneyUtils',
      'invoicing',
      'invoicingLibrary',
      'invoiceComputation',
      'invoicePDF',
      'shipping',
      'routingOptimization',
    ]) {
      expect(example1).toContain(`data-module="${id}"`);
    }
    expect(example1).not.toContain('data-module="catalog"');
    expect(count(example1, /data-kind="decision-dot"/gu)).toBe(7);
    expect(count(example1, /data-kind="chord"/gu)).toBe(0);
    // No drawn title: the page's heading introduces the example.
    expect(example1).not.toContain('One decision, three reaches');
    expect(example1).not.toContain('data-kind="title"');
  });

  it('shows the shipping handshake: a type flowing down, a function flowing up', () => {
    expect(example1).toContain(
      'id="node-shipping-owns-ShipmentPlan" data-kind="node-row" data-compartment="owns" ' +
        'data-symbol="ShipmentPlan" data-owner="shipping" data-marker="▼" data-gray="false"',
    );
    expect(example1).toContain('>from shipping</text>');
    expect(example1).toContain(
      'id="node-routingOptimization-receives-ShipmentPlan-label" data-kind="node-row-label" class="rmf-f-traced4"',
    );
  });

  it('defines every chevron marker it references', () => {
    for (const svg of [markup, example1]) {
      const referenced = new Set(
        [...svg.matchAll(/url\(#(rmf-chevron-[a-z0-9]+)\)/gu)].map((match) => match[1] as string),
      );
      expect(referenced.size).toBeGreaterThan(0);
      for (const id of referenced) {
        expect(svg).toContain(`id="${id}"`);
      }
    }
  });

  it('never says denied: non-allowed imports are absence, not prose', () => {
    const withoutStylesheet = example1.replace(/<style[\s\S]*?<\/style>/u, '');
    expect(withoutStylesheet).not.toMatch(/deni|deny/iu);
  });

  it('titles the arrival compartment “receives”', () => {
    expect(example1).toContain('>receives</text>');
    expect(example1).toContain('data-compartment="receives"');
  });

  it('draws arrivals from an ancestor as marker-less rows naming that ancestor', () => {
    expect(example1).toContain(
      'id="node-invoiceComputation-receives-computeTotal" data-kind="node-row" ' +
        'data-compartment="receives" data-row-kind="from-ancestor" data-symbol="computeTotal"',
    );
    expect(example1).toContain('>from app</text>');
    expect(example1).toContain('>from invoicing</text>');
    // No marker glyph, and the name carries the symbol's traced color.
    expect(example1).not.toContain('id="node-invoiceComputation-receives-computeTotal-marker"');
    expect(example1).toContain(
      'id="node-invoiceComputation-receives-computeTotal-label" data-kind="node-row-label" class="rmf-f-traced1"',
    );
  });

  it('keeps its own traced layers and its own accessible name', () => {
    for (const layer of ['neutral', 'computeTotal', 'InvoiceModel', 'optimizeRoute', 'ShipmentPlan']) {
      expect(example1).toContain(`data-layer="propagation" data-symbol="${layer}"`);
    }
    expect(example1).toContain('aria-label="Example 1: three modules expose a symbol to their parent');
    // The shop's own markup is untouched by the second definition existing.
    expect(markup).toContain(
      'aria-label="The ramify core tree model: ownership, the two exposure channels, and availability"',
    );
  });
});

describe('affordances', () => {
  it('makes traced chips, lanes and rows clickable', () => {
    expect(markup).toContain('data-kind="header-chip" data-symbol="ProductId"');
    expect(markup).toContain('data-kind="header-chip" data-symbol="CartApi"');
    expect(count(markup, /rmf-clickable/gu)).toBeGreaterThanOrEqual(6);
  });

  it('honours a pinned theme', () => {
    expect(render({ theme: 'dark' })).toContain('<svg class="rmf" data-theme="dark"');
    // Unpinned: the palette follows the reader's system setting.
    expect(markup.slice(0, 120)).not.toContain('data-theme=');
  });

  it('namespaces ids so two diagrams can share a page', () => {
    const second = render({ idPrefix: 'second' });
    expect(second).toContain('id="second-diagram"');
    expect(second).toContain('url(#second-chevron-traced1)');
  });
});
