import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import type { SessionInputs } from '../interfaces/session.js';

/**
 * The `architect` fixture of Plan 2B's acceptance matrix, shared by the
 * projection and rendering tests.
 *
 * - `fixture` (root) exposes `Config` to descendants, relays `Engine`,
 *   `launch`, `loose` and `run` from `core` to descendants, and has an internal
 *   `main`. Its relay of `settings` is ineffective: `core` exposes `settings`
 *   to its descendants only.
 * - `fixture/core` exposes `run` to parent and descendants and `settings` to
 *   descendants, relays `Engine`, `launch` and `loose` from `engine` to parent,
 *   has an internal `helper` and `Mode`, forwards `Engine` from `index.ts`,
 *   lists `src/docs/` files, and has `src/tests/` with a test file that calls
 *   its own `run` and `helper`, and an exported testing helper.
 * - `fixture/core/engine` has no README. It exposes `Engine`, `EngineOptions`,
 *   `loose` and `start` (as `launch`) to parent. `start` is also exported as
 *   `begin`; `boot` is its `default`. Its `src/tests/` holds a test that only
 *   imports types and a JavaScript test the compiler options leave out.
 * - `fixture/alpha` constructs `Engine` from `engine` and names its type
 *   through `core`'s forwarding file: mixed use through two imported
 *   modules. Its ordinary `src/` holds a test-named file that calls `build`,
 *   a `.feature` file and a stylesheet resource, none of them test sources.
 * - `fixture/beta` (tagged `ui`) names `Engine` as a type only and calls `run`.
 * - `fixture/gamma` reads `loose`, whose `any` type leaves the use unknown.
 * - `fixture/checks` is a testing module whose ordinary `src/` imports
 *   production originals and holds a test file and a `.feature` file. The
 *   test file constructs `Engine` and names its type, calls `run` and reads
 *   `loose`.
 */
export const architectPaths = {
  config: 'src/interfaces/config.ts', main: 'src/main.ts',
  core: 'subs/core/src/core.ts', coreIndex: 'subs/core/src/index.ts', coreTest: 'subs/core/src/tests/core.test.ts',
  coreSupport: 'subs/core/src/tests/support.ts', guide: 'subs/core/src/docs/guide.md', usage: 'subs/core/src/docs/notes/usage.md',
  engine: 'subs/core/subs/engine/src/engine.ts', legacy: 'subs/core/subs/engine/src/tests/legacy.test.js',
  engineTest: 'subs/core/subs/engine/src/tests/options.test.ts',
  alpha: 'subs/alpha/src/alpha.ts', alphaTest: 'subs/alpha/src/alpha.test.ts', alphaFeature: 'subs/alpha/src/notes.feature',
  style: 'subs/alpha/src/style.css', styleTypes: 'subs/alpha/src/style.d.ts', view: 'subs/alpha/src/view.ts',
  beta: 'subs/beta/src/beta.ts', gamma: 'subs/gamma/src/gamma.ts',
  checks: 'subs/checks/src/engine.test.ts', checksSupport: 'subs/checks/src/support.ts', feature: 'subs/checks/src/features/review.feature',
} as const;

const paths = architectPaths;
export const architectFixture: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nroot module fixture\n'
    + 'expose-src Config from "interfaces/config.ts" to descendants\n'
    + 'expose-sub Engine, launch, loose, run, settings from core to descendants\n',
  'README.md': '# Fixture\n\nA three-level project for the architect view.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  [paths.config]: '/** The project configuration. */\nexport interface Config { readonly name: string }\n',
  [paths.main]: "import { run } from '../subs/core/src/core.js';\n\nexport function main(): void {\n  run();\n}\n",

  'subs/core/module.ramify': 'ramify 1\nmodule core\n'
    + 'expose-src run from "core.ts" to parent, descendants\n'
    + 'expose-src settings from "core.ts" to descendants\n'
    + 'expose-sub Engine, launch, loose from engine to parent\n',
  'subs/core/README.md': '# Core\n\nCore runs the engine for the rest of the project.\n',
  [paths.core]: "import { Engine } from '../subs/engine/src/engine.js';\n\n"
    + '/** Run the engine once.\n *\n * The engine is started before it is returned. */\n'
    + 'export function run(): Engine {\n  const engine = new Engine();\n  engine.start();\n  return engine;\n}\n'
    + 'export const settings = { level: 1 };\n'
    + 'export function helper(): number {\n  return settings.level;\n}\n'
    + "export type Mode = 'fast' | 'slow';\n",
  [paths.coreIndex]: "export { Engine } from '../subs/engine/src/engine.js';\n",
  [paths.guide]: '# Guide\n\nHow core runs the engine.\n',
  [paths.usage]: '# Usage\n\nCall run.\n',
  [paths.coreTest]: "import { helper, run } from '../core.js';\n\n"
    + "describe('run', () => {\n  it('starts the engine', () => {\n    run();\n  });\n  it('returns the engine', () => {\n    helper();\n  });\n});\n",
  [paths.coreSupport]: 'export const sample = 1;\n',

  'subs/core/subs/engine/module.ramify': 'ramify 1\nmodule engine\n'
    + 'expose-src Engine, EngineOptions, loose from "engine.ts" to parent\n'
    + 'expose-src start as launch from "engine.ts" to parent\n',
  [paths.engine]: "import type { Config } from '../../../../../src/interfaces/config.js';\n\n"
    + '/** Starts and stops work. */\nexport class Engine {\n  start(): void {}\n}\n'
    + 'export function start(config?: Config): Engine {\n  void config;\n  return new Engine();\n}\n'
    + 'export { start as begin };\n'
    + 'export interface EngineOptions { readonly size: number }\n'
    + 'export const loose: any = 1;\n'
    + 'export default function boot(): void {}\n',
  [paths.legacy]: "describe('legacy', () => {\n  it('is outside the program', () => {});\n});\n",
  [paths.engineTest]: "import type { Engine, EngineOptions } from '../engine.js';\n\n"
    + "describe('options', () => {\n  it('names the engine and its options as types', () => {\n"
    + "    const engine: Engine | null = null;\n    const options: EngineOptions = { size: 1 };\n    void engine;\n    void options;\n  });\n});\n",

  'subs/alpha/module.ramify': 'ramify 1\nmodule alpha\n',
  'subs/alpha/README.md': '# Alpha\n\nAlpha builds engines.\n',
  [paths.alpha]: "import { Engine } from '../../core/subs/engine/src/engine.js';\n"
    + "import type { Engine as Forwarded } from '../../core/src/index.js';\n\n"
    + 'export function build(): Forwarded {\n  return new Engine();\n}\n',
  [paths.alphaTest]: "import { build } from './alpha.js';\n\ndescribe('ignored', () => {\n  it('is ordinary source', () => {\n    build();\n  });\n});\n",
  [paths.alphaFeature]: 'Feature: Ignored\n  Scenario: Not a test source\n',
  [paths.style]: '.view {}\n',
  [paths.styleTypes]: 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n',
  [paths.view]: "import styles from './style.css';\n\nexport const view = styles;\n",

  'subs/beta/module.ramify': 'ramify 1\nmodule beta tagged [ui]\n',
  'subs/beta/README.md': '# Beta\n\nBeta drives the engine.\n',
  [paths.beta]: "import type { Engine } from '../../core/src/index.js';\nimport { run } from '../../core/src/core.js';\n\n"
    + 'export function drive(): Engine {\n  return run();\n}\n',

  'subs/gamma/module.ramify': 'ramify 1\nmodule gamma\n',
  'subs/gamma/README.md': '# Gamma\n\nGamma reads a loose value.\n',
  [paths.gamma]: "import { loose } from '../../core/subs/engine/src/engine.js';\n\nexport const total: number = loose + 1;\n",

  'subs/checks/module.ramify': 'ramify 1\nmodule checks tagged [testing]\n',
  'subs/checks/README.md': '# Checks\n\nChecks exercise the engine.\n',
  [paths.checks]: "import { Engine, loose } from '../../core/subs/engine/src/engine.js';\nimport { run } from '../../core/src/core.js';\n\n"
    + "describe('engine', () => {\n  it('constructs', () => {\n    const engine: Engine = new Engine();\n    void engine;\n  });\n"
    + "  it('runs', () => {\n    run();\n  });\n});\n"
    + "test('outside any suite', () => {\n  void (loose + 1);\n});\n",
  [paths.checksSupport]: "import { Engine } from '../../core/subs/engine/src/engine.js';\n\nexport function makeEngine(): Engine {\n  return new Engine();\n}\n",
  [paths.feature]: 'Feature: Review\n\n  Scenario: A reviewer starts the engine\n    Given an engine\n\n'
    + '  Scenario Outline: A reviewer runs <count> times\n    Examples:\n      | count |\n      | 1     |\n',
};

/** Write the fixture with `overrides` (a `null` removes a file) to a fresh root and run `check` on it. */
export async function architectProject(check: (root: string, inputs: SessionInputs) => Promise<void>,
  overrides: Readonly<Record<string, string | null>> = {}): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-architect-')));
  try {
    for (const [path, text] of Object.entries({ ...architectFixture, ...overrides })) {
      if (text === null) continue;
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    await check(root, {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
      session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 512, maxRetainedFactBytes: 96 * 1024 ** 2 },
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** The plan's limits: 240-byte signatures, 280-byte documentation, four overloads, 240-byte titles, 40 titles a record. */
export const architectLimits = {
  details: { maxSignatureBytes: 240, maxDocumentationBytes: 280, maxOverloads: 4, maxResultBytes: 32 * 1024 ** 2 },
  tests: { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 ** 2 },
  maxProjectionBytes: 64 * 1024 ** 2,
} as const;
