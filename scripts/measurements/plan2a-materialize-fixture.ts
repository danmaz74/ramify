import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * A small, independently transcribed real project (not imported from any
 * production test fixture, matching iteration 5/7's own precedent) shared by
 * the reference harness's `plan2a-service-cases.ts` and `plan2a-cli-cases.ts`
 * I2A-09/I2A-10 quick and process handlers and by `plan2a-platform.mjs`. It
 * lives beside that measurement, outside the harness tree, so the measurement
 * imports nothing from the tree. Three modules:
 *
 * - `lib` (`subs/lib`) exposes `widget` to its parent (the root).
 * - The root re-exposes `widget` to its descendants.
 * - `app` (`subs/app`) imports `widget` from `lib` (a sibling, so the
 *   category is `external`, never `children`), and owns a `src/tests/` area
 *   too, so a module-scoped materialize and `--all` are distinguishable by
 *   target count (2 targets for `--from subs/app` vs 4 for `--all`).
 *
 * `app`'s ordinary area has exactly one available entry (`widget`); every
 * other area (root, `lib`, `app`'s tests) has zero, so entry counts are
 * unambiguous across every leaf that inspects them.
 */
export const materializeFixtureFiles: Record<string, string> = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true } }),
  'module.ramify': 'ramify 1\nroot module "materialize-fixture"\n\nexpose-sub widget from lib to descendants\n',
  'subs/lib/module.ramify': 'ramify 1\nmodule lib\n\nexpose-src widget from "api.ts" to parent\n',
  'subs/lib/src/api.ts': "export function widget(): string { return 'w'; }\n",
  'subs/app/module.ramify': 'ramify 1\nmodule app\n',
  'subs/app/src/index.ts': "import { widget } from '../../lib/src/api.js';\nexport function run(): string { return widget(); }\n",
  'subs/app/src/tests/index.test.ts': 'export {};\n',
};

export async function writeMaterializeFixture(root: string): Promise<void> {
  for (const [path, contents] of Object.entries(materializeFixtureFiles)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
}
