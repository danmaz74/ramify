/**
 * Emit the checked-in static diagrams.
 *
 * This is the only file in the project that touches the filesystem. It renders
 * the same React component the site embeds, with no selection, once per
 * checked-in diagram definition:
 *
 * - `site/static/diagrams/model-core.svg` - the shop, the retired first
 *   diagram (`src/viz/diagrams/shop.ts`): structure and propagation with
 *   its import chords composited;
 * - `site/static/diagrams/example1.svg` - Example 1
 *   (`src/viz/diagrams/example1.ts`): one decision, three reaches;
 * - `site/static/diagrams/example1a.svg` / `example1b.svg` - the two
 *   build-up stages the site walks through before Example 1's full diagram;
 * - `site/static/diagrams/example2.svg` - Example 2: both channels at once;
 * - `site/static/diagrams/example3.svg` - Example 3: the tag is the entire
 *   difference (testing);
 * - `site/static/diagrams/example4.svg` - Example 4: a promise about the
 *   closure (browser);
 * - `site/static/diagrams/shop-tree.svg` - the shop as a classic tree
 *   (`src/viz/diagrams/shop-tree.ts`);
 * - `site/static/diagrams/shop-focus-payment.svg` - the view from inside
 *   `payment`: three cards and the tree at a distance.
 *
 * Output is deterministic: no ids are generated at render time, ordering comes
 * from the declaration, coordinates are rounded, and each file ends with a
 * single newline. Re-running the script on unchanged sources produces
 * byte-identical files, so a checked-in SVG only moves when its diagram does.
 *
 * Usage: `npm run diagrams`
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  FocusDiagramSvg,
  ModelDiagramSvg,
  TreeDiagramSvg,
  example1Diagram,
  example1aDiagram,
  example1bDiagram,
  example2Diagram,
  example3Diagram,
  example4Diagram,
  shopDiagram,
  shopFocusDiagram,
  shopTreeDiagram,
  type DiagramDefinition,
  type FocusDiagramDefinition,
  type TreeDiagramDefinition,
} from '../src/viz/index.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Emission {
  /** Path relative to the project root. */
  readonly file: string;
  readonly render: () => string;
}

/** The static export shows Panel A + Panel B composited, with no selection. */
function modelEmission(definition: DiagramDefinition, file: string): Emission {
  return {
    file,
    render: () =>
      renderToStaticMarkup(
        createElement(ModelDiagramSvg, {
          definition,
          standalone: true,
          showChords: true,
          selectedSymbol: null,
        }),
      ),
  };
}

function treeEmission(definition: TreeDiagramDefinition, file: string): Emission {
  return {
    file,
    render: () => renderToStaticMarkup(createElement(TreeDiagramSvg, { definition, standalone: true })),
  };
}

function focusEmission(definition: FocusDiagramDefinition, file: string): Emission {
  return {
    file,
    render: () =>
      renderToStaticMarkup(createElement(FocusDiagramSvg, { definition, standalone: true })),
  };
}

const emissions: readonly Emission[] = [
  modelEmission(shopDiagram, 'site/static/diagrams/model-core.svg'),
  modelEmission(example1Diagram, 'site/static/diagrams/example1.svg'),
  modelEmission(example1aDiagram, 'site/static/diagrams/example1a.svg'),
  modelEmission(example1bDiagram, 'site/static/diagrams/example1b.svg'),
  modelEmission(example2Diagram, 'site/static/diagrams/example2.svg'),
  modelEmission(example3Diagram, 'site/static/diagrams/example3.svg'),
  modelEmission(example4Diagram, 'site/static/diagrams/example4.svg'),
  treeEmission(shopTreeDiagram, 'site/static/diagrams/shop-tree.svg'),
  focusEmission(shopFocusDiagram, 'site/static/diagrams/shop-focus-payment.svg'),
];

async function main(): Promise<void> {
  for (const emission of emissions) {
    const file = `${emission.render()}\n`;
    const outputPath = resolve(projectRoot, emission.file);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, file, 'utf8');

    process.stdout.write(
      `${emission.file.split('/').pop() ?? emission.file}  ` +
        `${String(Buffer.byteLength(file, 'utf8'))} bytes  →  ${emission.file}\n`,
    );
  }
}

await main();
