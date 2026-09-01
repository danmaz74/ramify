import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { DiagramDefinition } from './diagram-definition.js';
import { example1Diagram } from './diagrams/example1.js';
import { example2Diagram } from './diagrams/example2.js';
import { example3Diagram } from './diagrams/example3.js';
import { example4Diagram } from './diagrams/example4.js';
import { shopDiagram } from './diagrams/shop.js';
import { buildDiagramLayout } from './layout.js';
import { ModelDiagramSvg } from './ModelDiagram.js';

/**
 * The checked-in SVGs are the emitter's output, and this file is what keeps
 * them honest: it renders exactly what `scripts/emit-diagrams.ts` renders and
 * compares the result to the file on disk, byte for byte.
 *
 * Two things are therefore checked at once — that a diagram still emits what is
 * checked in, and that a change to the shared pipeline (the tag chips, the
 * context boxes, the row geometry they moved) leaves the diagrams that declare
 * no tag *exactly* as they were.
 */

/** Exactly what the emitter writes: no selection, both panels, standalone. */
function emitted(definition: DiagramDefinition): string {
  const markup = renderToStaticMarkup(
    createElement(ModelDiagramSvg, {
      definition,
      standalone: true,
      showChords: true,
      selectedSymbol: null,
    }),
  );
  return `${markup}\n`;
}

const untagged: readonly DiagramDefinition[] = [shopDiagram, example1Diagram, example2Diagram];
const tagged: readonly DiagramDefinition[] = [example3Diagram, example4Diagram];

describe('the checked-in SVGs', () => {
  it('is what the pipeline renders for the core model', async () => {
    await expect(emitted(shopDiagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/model-core.svg',
    );
  });

  it('is what the pipeline renders for example 1', async () => {
    await expect(emitted(example1Diagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/example1.svg',
    );
  });

  it('is what the pipeline renders for example 2', async () => {
    await expect(emitted(example2Diagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/example2.svg',
    );
  });

  it('is what the pipeline renders for example 3', async () => {
    await expect(emitted(example3Diagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/example3.svg',
    );
  });

  it('is what the pipeline renders for example 4', async () => {
    await expect(emitted(example4Diagram)).toMatchFileSnapshot(
      '../../site/static/diagrams/example4.svg',
    );
  });

  it('re-renders every diagram identically, run after run', () => {
    for (const definition of [...untagged, ...tagged]) {
      expect(emitted(definition)).toBe(emitted(definition));
    }
  });
});

describe('a universe that declares no tag', () => {
  it('grows no tag content: no chips, no notes, no contexts, nothing dark', () => {
    for (const definition of untagged) {
      const layout = buildDiagramLayout(definition);
      for (const node of layout.tree.nodes) {
        expect(node.moduleContext).toBeUndefined();
        expect(node.compartments.map((compartment) => compartment.kind)).not.toContain('context');
        for (const row of node.rows) {
          expect(row.tags).toBeUndefined();
          expect(row.annotations).toBeUndefined();
          // Availability and importability coincide where no tag is declared,
          // so every drawn row is one its module may import.
          expect(row.importable).toBe(true);
        }
      }
    }
  });

  it('grows no tag markup either — the affordances cost the old diagrams nothing', () => {
    for (const definition of untagged) {
      const markup = emitted(definition);
      for (const affordance of [
        'node-row-tags',
        'node-row-binding',
        'node-context',
        'data-tags',
        'data-importable',
      ]) {
        expect(markup).not.toContain(affordance);
      }
    }
  });

  it('never says denied, tags or not: an import that is not allowed is absence', () => {
    for (const definition of [...untagged, ...tagged]) {
      const withoutStylesheet = emitted(definition).replace(/<style[\s\S]*?<\/style>/u, '');
      // The shop is the one diagram that draws refusals, and it draws them as
      // chords rather than as prose about denial.
      if (definition !== shopDiagram) {
        expect(withoutStylesheet).not.toMatch(/deni|deny/iu);
      }
    }
  });

  it('is exactly where the tag examples differ', () => {
    for (const definition of tagged) {
      const markup = emitted(definition);
      expect(markup).toContain('data-kind="node-context"');
      expect(markup).toContain('data-kind="node-row-tags"');
      expect(markup).toContain('data-kind="node-row-tags-pill"');
    }
    // The binding note is example 4's alone: a testing requirement exempts no
    // binding, so example 3 has no disagreement to report.
    expect(emitted(example4Diagram)).toContain('data-kind="node-row-binding"');
    expect(emitted(example3Diagram)).not.toContain('data-kind="node-row-binding"');
  });
});
