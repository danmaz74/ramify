import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acquireInventory } from '../../subs/analysis/src/inventory-entry.js';
import type { AcquisitionLimits } from '../../subs/analysis/src/inventory-entry.js';
import { createDefaultTagRegistry } from '../../subs/analysis/subs/model/src/index.js';

/*
 * PB1-31: production selection over the resolved profiles as the source
 * inventory widens with project boundaries. The fixture is the written provider
 * topology of the project-boundary plan (fixtures.md), with a resource in `b`
 * and a separately declared testing module `specs`. Expected values are
 * reasoned from the contracts ("Transport, observation and projections":
 * testing modules and nested testing areas are excluded, inert owned files are
 * not production because they have an owner, declared trees and scratch never
 * enter) and from the selection rule iteration 8C adopted: only files beneath
 * an owner's `src/` are package output, so auxiliary source, although
 * inventoried with its owner's ordinary profile, is never selected.
 *
 * The compiler configuration selects every `.ts` file, including both declared
 * trees and both scratch directories, so their exclusion is not the compiler's.
 *
 * The selection is the real `npm run production:files` command, run as a child
 * process, so no toolkit source imports the root's scripts; the profiles and
 * placements it reads come from the same inventory acquisition.
 */

const toolkit = fileURLToPath(new URL('../../', import.meta.url));
const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };

interface ProductionFiles { readonly schemaVersion: string; readonly root: string; readonly configuration: string; readonly files: readonly string[] }

/** `scripts/production-files.ts --root <root>`, the command behind `npm run production:files`. */
async function productionFiles(root: string): Promise<ProductionFiles> {
  const script = join(toolkit, 'scripts/production-files.ts');
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((accept, reject) => {
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), script, '--root', root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
    child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    child.once('error', reject);
    child.once('close', code => accept({ code, stdout, stderr }));
  });
  expect([result.code, result.stderr]).toEqual([0, '']);
  return JSON.parse(result.stdout) as ProductionFiles;
}

/** The whole-project inventory the selection consumes. */
async function inventory(root: string) {
  const result = await acquireInventory({ project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), limits });
  if (result.status !== 'completed') throw new Error(`Inventory ${result.status}`);
  return result.snapshot;
}

const topology: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nowned-nested-project "fixture-project"\nexternal "external-project"\nexpose-sub api from a to descendants\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
    strict: true, types: [], noEmit: true }, include: ['**/*.ts'] }),
  'README.md': '# App\n\nThe production-selection fixture root.\n',
  'notes/design.md': '# Design\n\nInert root-owned prose.\n',
  'notes/settings.json': '{ "inert": true }\n',
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nexport const checked: number = api();\n",
  'src/main.ts': 'export const main = 1;\n',
  'src/tmp/throwaway.test.ts': 'export const rootScratch = 1;\n',
  'tools/tmp/helper.ts': 'export const helper = 1;\n',
  'fixture-project/module.ramify': 'ramify 1\nroot module fixture\n',
  'fixture-project/src/index.ts': 'export const ignoredRoot = 1;\n',
  'external-project/src/index.ts': 'export const externalTree = 1;\n',
  'subs/a/module.ramify': 'ramify 1\nmodule a\nowned-nested-project "fixtures/sample"\nexpose-src api from "api.ts" to parent\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/tests/api.test.ts': "import { api } from '../api.js';\nexport const tested: number = api();\n",
  'subs/a/src/tests/tmp/real.test.ts': 'export const realTest = 1;\n',
  'subs/a/src/tmp/throwaway.ts': 'export const moduleScratch = 1;\n',
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nexport const reported: number = api();\n",
  'subs/a/scripts/report.test.ts': 'export const reportShape = 1;\n',
  'subs/a/fixtures/sample/module.ramify': 'ramify 1\nroot module sample\n',
  'subs/a/fixtures/sample/src/world.ts': 'export const ignoredSample = 1;\n',
  'subs/a/subs/grand/module.ramify': 'ramify 1\nmodule grand\n',
  'subs/a/subs/grand/notes.txt': 'Inert grandchild note.\n',
  'subs/a/subs/grand/src/grand.ts': 'export const grand = 3;\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const consumed: number = api();\n",
  'subs/b/src/style.css': '.consumer {}\n',
  'subs/specs/module.ramify': 'ramify 1\nmodule specs tagged [testing, dispatch]\n',
  'subs/specs/src/check.ts': 'export const specCheck = 1;\n',
  'subs/specs/src/tests/inner.test.ts': 'export const specInner = 1;\n',
  'subs/specs/scripts/tool.ts': 'export const specTool = 1;\n',
};

/** Ordinary, non-testing files beneath an owner's `src/`, in byte order. */
const expectedFiles = ['src/main.ts', 'subs/a/src/api.ts', 'subs/a/subs/grand/src/grand.ts', 'subs/b/src/consumer.ts', 'subs/b/src/style.css'];

async function withProject(check: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-production-boundary-')));
  try {
    await write(root, topology);
    await check(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function write(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

describe('PB1-31: production selection over project boundaries', () => {
  it('selects ordinary src files by resolved profile, excluding testing modules and areas, auxiliary and inert files, declared trees and scratch', async () => withProject(async root => {
    const document = await productionFiles(root), snapshot = await inventory(root);
    expect(document).toEqual({ schemaVersion: 'ramify.production-files/1', root: '.', configuration: 'tsconfig.json', files: expectedFiles });

    const profile = (owner: string, kind: 'ordinary' | 'tests') => snapshot.areas.find(area => area.owner === owner && area.kind === kind)?.profile;
    // Testing is decided by the resolved profiles: the testing module's ordinary
    // `src/` and every nested `src/tests/` carry `testing`.
    expect(profile('app/specs', 'ordinary')).toContain('testing');
    expect(profile('app/a', 'tests')).toContain('testing');
    expect(profile('app/specs', 'tests')).toContain('testing');
    for (const owner of ['app', 'app/a', 'app/a/grand', 'app/b']) expect(profile(owner, 'ordinary')).not.toContain('testing');

    // Auxiliary source is inventoried with its owner's ordinary area and placement
    // `auxiliary`; the selection leaves it out by placement, not by profile.
    const files = new Map(snapshot.inventory.files.map(file => [file.path, file]));
    const auxiliary = [...files.values()].filter(file => file.placement === 'auxiliary').map(file => [file.path, file.owner, file.area]);
    expect(auxiliary.sort()).toEqual([
      ['scripts/check.ts', 'app', 'ordinary'], ['subs/a/scripts/report.test.ts', 'app/a', 'ordinary'],
      ['subs/a/scripts/report.ts', 'app/a', 'ordinary'], ['subs/specs/scripts/tool.ts', 'app/specs', 'ordinary'],
      ['tools/tmp/helper.ts', 'app', 'ordinary']]);
    // Testing source is inventoried and analyzed, never selected.
    for (const path of ['subs/a/src/tests/api.test.ts', 'subs/a/src/tests/tmp/real.test.ts', 'subs/specs/src/check.ts', 'subs/specs/src/tests/inner.test.ts']) {
      expect(files.get(path)?.placement).toBe('src');
      expect(document.files).not.toContain(path);
    }
    // Inert owned files, declared trees and scratch directories never enter the inventory.
    for (const path of ['README.md', 'notes/design.md', 'notes/settings.json', 'subs/a/subs/grand/notes.txt', 'src/tmp/throwaway.test.ts',
      'subs/a/src/tmp/throwaway.ts', 'fixture-project/src/index.ts', 'external-project/src/index.ts', 'subs/a/fixtures/sample/src/world.ts']) {
      expect(files.has(path)).toBe(false);
    }
    // The compiler selected them; the owned nested trees and scratch directories warn, the external tree does not.
    expect(snapshot.inventory.warnings.map(warning => [warning.code, warning.path]).sort()).toEqual([
      ['compiler-selected-owned-nested-project', 'fixture-project'], ['compiler-selected-owned-nested-project', 'subs/a/fixtures/sample'],
      ['compiler-selected-scratch', 'src/tmp'], ['compiler-selected-scratch', 'subs/a/src/tmp']]);
  }), 30_000);

  it('adds no production file for new inert, auxiliary, testing, declared-tree or scratch files, and adds a new ordinary src file', async () => withProject(async root => {
    await write(root, {
      'notes/new.md': 'New inert prose.\n',
      'subs/a/subs/grand/new.txt': 'New inert note.\n',
      'scripts/extra.ts': 'export const extraAuxiliary = 1;\n',
      'subs/b/tools/extra.ts': 'export const extraModuleAuxiliary = 1;\n',
      'subs/b/src/tests/extra.test.ts': 'export const extraTest = 1;\n',
      'subs/specs/src/extra.ts': 'export const extraSpec = 1;\n',
      'fixture-project/src/extra.ts': 'export const extraIgnored = 1;\n',
      'external-project/src/extra.ts': 'export const extraExternal = 1;\n',
      'subs/a/src/tmp/extra.ts': 'export const extraScratch = 1;\n',
    });
    expect((await productionFiles(root)).files).toEqual(expectedFiles);
    // Positive control: the same selection admits a new ordinary source file.
    await write(root, { 'subs/b/src/extra.ts': 'export const extraOrdinary = 1;\n' });
    expect((await productionFiles(root)).files).toEqual([...expectedFiles, 'subs/b/src/extra.ts'].sort((a, b) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b))));
  }), 30_000);

  it('keeps the toolkit selection within non-testing src areas while its inventory holds auxiliary source', async () => {
    const document = await productionFiles(toolkit), snapshot = await inventory(toolkit);
    const files = new Map(snapshot.inventory.files.map(file => [file.path, file]));
    const testing = new Set(snapshot.areas.filter(area => area.profile.includes('testing')).map(area => `${area.owner}:${area.kind}`));
    expect(document.files).toContain('src/cli-entry.ts');
    expect(document.files).toContain('subs/presentation/src/index.ts');
    for (const path of document.files) {
      const file = files.get(path);
      expect(file?.placement, path).toBe('src');
      expect(testing.has(`${file!.owner}:${file!.area}`), path).toBe(false);
    }
    // The widened inventory: root and owner scripts are auxiliary source, the
    // integration-tests module and every src/tests/ area are testing; none is selected.
    const auxiliary = [...files.values()].filter(file => file.placement === 'auxiliary').map(file => file.path);
    expect(auxiliary).toContain('scripts/production-selection.ts');
    expect(auxiliary).toContain('subs/presentation/scripts/emit-diagrams.ts');
    expect(document.files.filter(path => auxiliary.includes(path))).toEqual([]);
    expect(document.files.filter(path => path.startsWith('subs/integration-tests/') || path.startsWith('src/tests/')
      || path.includes('/src/tests/'))).toEqual([]);
    for (const prefix of ['docs/', 'site/', 'examples/collection-review/', 'scripts/reference-harness/', 'ramify-agent/', 'src/tmp/']) {
      expect([...files.keys()].filter(path => path.startsWith(prefix)), prefix).toEqual([]);
    }
  }, 60_000);
});
