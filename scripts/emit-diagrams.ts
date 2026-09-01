/**
 * Emit the checked-in static diagrams.
 *
 * This is the only file in the project that touches the filesystem. It renders
 * the same React component the site embeds, with no selection, once per
 * checked-in diagram definition:
 *
 * - `site/static/diagrams/model-core.svg` - the shop: Panel A (structure and
 *   propagation) and Panel B (import chords) of `docs/site/diagram1-spec.md`
 *   §4, composited;
 * - `site/static/diagrams/example1.svg` - Example 1 of
 *   `docs/model/illustrative-examples.md`: one decision, three reaches;
 * - `site/static/diagrams/example2.svg` - Example 2: both channels at once;
 * - `site/static/diagrams/example3.svg` - Example 3: the tag is the entire
 *   difference (testing);
 * - `site/static/diagrams/example4.svg` - Example 4: a promise about the
 *   closure (browser).
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
  ModelDiagramSvg,
  example1Diagram,
  example2Diagram,
  example3Diagram,
  example4Diagram,
  shopDiagram,
  type DiagramDefinition,
} from '../src/viz/index.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Emission {
  readonly definition: DiagramDefinition;
  /** Path relative to the project root. */
  readonly file: string;
}

const emissions: readonly Emission[] = [
  { definition: shopDiagram, file: 'site/static/diagrams/model-core.svg' },
  { definition: example1Diagram, file: 'site/static/diagrams/example1.svg' },
  { definition: example2Diagram, file: 'site/static/diagrams/example2.svg' },
  { definition: example3Diagram, file: 'site/static/diagrams/example3.svg' },
  { definition: example4Diagram, file: 'site/static/diagrams/example4.svg' },
];

async function main(): Promise<void> {
  for (const emission of emissions) {
    // The static export shows Panel A + Panel B composited, with no selection.
    const markup = renderToStaticMarkup(
      createElement(ModelDiagramSvg, {
        definition: emission.definition,
        standalone: true,
        showChords: true,
        selectedSymbol: null,
      }),
    );

    const file = `${markup}\n`;
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
