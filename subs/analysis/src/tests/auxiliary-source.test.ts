import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisInputs, AnalysisReport } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

// PB1-07 (analysis part) and PB1-33 over the written provider topology
// (project-boundary fixtures.md, mutation 3): owned compiler source outside
// src/ is its owner's auxiliary source with that owner's ordinary profile. It
// may use same-owner internals, needs exposure for a foreign original, and
// cannot reach testing source, whatever its file name or a nested compiler
// configuration says. Expected decisions follow the module description
// specification, independently of the implementation.

const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\nexpose-sub api from a to descendants\n',
  'README.md': '# App\n\nThe written provider topology, auxiliary part.\n',
  'package.json': '{"type":"module"}',
  // Only module source is selected: auxiliary source is analyzed whether or not the configuration selects it.
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs/*/src'] }),
  'notes/design.md': 'Inert root-owned prose.\n',
  'src/main.ts': 'export const main = 1;\n',
  // Root auxiliary source: a received foreign original, and a foreign original nobody exposes.
  'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\nimport { hidden } from '../subs/b/src/consumer.js';\nvoid api; void hidden;\n",
  // A nested configuration that would select the scripts as tests changes nothing.
  'scripts/tsconfig.json': JSON.stringify({ compilerOptions: { types: ['vitest'] }, include: ['**/*.ts'] }),
  'tools/tmp/helper.ts': "import { main } from '../../src/main.js';\nexport const helper = main;\n",
  'subs/a/module.ramify': 'ramify 1\nmodule a\nexpose-src api from "api.ts" to parent\n',
  'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/a/src/tests/support.ts': 'export const fixture = 1;\n',
  // a's auxiliary source: same-owner ordinary internals are allowed, its testing source is not.
  'subs/a/scripts/report.ts': "import { api } from '../src/api.js';\nimport { fixture } from '../src/tests/support.js';\nvoid api; void fixture;\n",
  'subs/a/scripts/report.test.ts': "import { fixture } from '../src/tests/support.js';\nvoid fixture;\n",
  'subs/b/module.ramify': 'ramify 1\nmodule b\n',
  'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\nexport const hidden = api();\n",
};

async function report(mutation: Record<string, string> = {}): Promise<AnalysisReport> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-auxiliary-')));
  try {
    for (const [path, text] of Object.entries({ ...files, ...mutation })) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const inputs: AnalysisInputs = {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access', 'tags-origin', 'coverage'],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
    };
    const run = await analyzeProject(inputs);
    if (run.status !== 'reported') throw new Error('Expected an analysis report');
    return run.report;
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** Each access of an importer, as `[specifier, outcome, [status, reason, original file#binding]...]`. */
function decisions(value: AnalysisReport, importer: string): unknown[] {
  const snapshot = value.snapshot!;
  return snapshot.accesses.filter(access => access.importer.file === importer).map(access => {
    const result = snapshot.results.find(item => item.accessId === access.id)!;
    return [access.specifier, result.outcome, ...result.decisions.map(decision =>
      [decision.status, decision.reason, decision.original ? `${decision.original.id.owner}:${decision.original.id.file}#${decision.original.id.binding}` : null])];
  });
}

describe('auxiliary source analysis (PB1-07, PB1-33)', () => {
  it('inventories and catalogues owned compiler source outside src/ under its nearest owner, with no warning', async () => {
    const value = await report();
    const inventory = value.snapshot!.inventory;
    expect(inventory.files.filter(file => file.placement === 'auxiliary').map(file => [file.path, file.owner, file.area])).toEqual([
      ['scripts/check.ts', 'app', 'ordinary'],
      ['subs/a/scripts/report.test.ts', 'app/a', 'ordinary'],
      ['subs/a/scripts/report.ts', 'app/a', 'ordinary'],
      // tmp/ beneath an auxiliary directory is not a module scratch directory.
      ['tools/tmp/helper.ts', 'app', 'ordinary'],
    ]);
    expect(inventory.files.some(file => file.path.startsWith('notes/') || file.path === 'scripts/tsconfig.json')).toBe(false);
    expect(value.warnings).toEqual([]);
    expect(value.coverage).toEqual([]);
    // The auxiliary original keeps the src/-relative identity with one leading ../ and its owner's ordinary profile.
    expect(value.snapshot!.catalog!.originals.filter(original => original.origin.auxiliary).map(original => [original.id, original.origin.area.profile]))
      .toEqual([[{ kind: 'code', owner: 'app', file: '../tools/tmp/helper.ts', binding: 'helper' }, ['dispatch']]]);
  }, 60_000);

  it('allows same-owner and received imports, needs exposure for a foreign original, and never reaches testing source', async () => {
    const value = await report();
    expect(value.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'complete' });
    expect(decisions(value, 'scripts/check.ts')).toEqual([
      ['../subs/a/src/api.js', 'checked', ['allowed', 'exposed', 'app/a:api.ts#api']],
      ['../subs/b/src/consumer.js', 'checked', ['denied', 'not-visible', 'app/b:consumer.ts#hidden']],
    ]);
    expect(decisions(value, 'tools/tmp/helper.ts')).toEqual([['../../src/main.js', 'checked', ['allowed', 'same-owner', 'app:main.ts#main']]]);
    expect(decisions(value, 'subs/a/scripts/report.ts')).toEqual([
      ['../src/api.js', 'checked', ['allowed', 'same-owner', 'app/a:api.ts#api']],
      ['../src/tests/support.js', 'checked', ['denied', 'testing-origin', 'app/a:tests/support.ts#fixture']],
    ]);
    // A test-shaped name outside src/tests/ creates no testing classification.
    expect(decisions(value, 'subs/a/scripts/report.test.ts')).toEqual([
      ['../src/tests/support.js', 'checked', ['denied', 'testing-origin', 'app/a:tests/support.ts#fixture']],
    ]);
    // Positive control: an ordinary consumer receives the same exposed original.
    expect(decisions(value, 'subs/b/src/consumer.ts')).toEqual([['../../a/src/api.js', 'checked', ['allowed', 'exposed', 'app/a:api.ts#api']]]);
    expect(value.diagnostics.map(issue => [issue.code, issue.location?.file, issue.importer?.owner, issue.importer?.kind, issue.importer?.profile]))
      .toEqual([
        ['not-visible', 'scripts/check.ts', 'app', 'ordinary', ['dispatch']],
        ['testing-origin', 'subs/a/scripts/report.test.ts', 'app/a', 'ordinary', []],
        ['testing-origin', 'subs/a/scripts/report.ts', 'app/a', 'ordinary', []],
      ]);
  }, 60_000);
});

// PB1-13 through the real catalog (fixtures.md, mutation 4): forward an
// auxiliary export through files beneath src/ and try to expose it. Linking
// rejects every selection that reaches the auxiliary original, whatever the
// forwarding chain, and no model is published; the same selections of an
// original beneath src/ are the positive control.
const root = (statements: readonly string[]) =>
  `ramify 1\nroot module app tagged [dispatch]\nexpose-sub api from a to descendants\n${statements.join('\n')}\n`;
const childDescription = (statements: readonly string[]) => `ramify 1\nmodule a\nexpose-src api from "api.ts" to parent\n${statements.join('\n')}\n`;
const forwarding: Record<string, string> = {
  'src/forward.ts': "export { helper } from '../tools/tmp/helper.js';\nexport { main } from './main.js';\n",
  'src/chain.ts': "export * from './forward.js';\n",
  'src/interfaces/contract.ts': "export { helper as tool, main } from '../chain.js';\n",
  'src/interfaces/clean.ts': "export { main } from '../chain.js';\n",
  'subs/a/scripts/tool.ts': 'export const tool = 2;\n',
  'subs/a/src/relay.ts': "export { tool } from '../scripts/tool.js';\nexport { api } from './api.js';\n",
};

/** The location of `needle` in `text`, computed from the text alone. */
function at(file: string, text: string, needle: string): { file: string; start: number; end: number; line: number; column: number } {
  const start = text.indexOf(needle);
  const before = text.slice(0, start);
  return { file, start, end: start + needle.length, line: before.split('\n').length, column: start - before.lastIndexOf('\n') };
}

describe('auxiliary original exposure through the real catalog (PB1-13)', () => {
  it('rejects exact, chained, wildcard and re-exposed selections of auxiliary originals with located findings', async () => {
    const app = root(['expose-src helper from "forward.ts" to descendants', 'expose-src helper as chained from "chain.ts" to descendants',
      'expose-src * from "interfaces/contract.ts" to descendants', 'expose-sub tool as received from a to descendants']);
    const a = childDescription(['expose-src tool from "relay.ts" to parent']);
    const value = await report({ ...forwarding, 'module.ramify': app, 'subs/a/module.ramify': a });
    // An invalid description set publishes no model, so no access is decided.
    expect(value.outcome).toEqual({ execution: 'invalid', check: 'failed', coverage: 'not-run' });
    expect(value.diagnostics.map(issue => [issue.code, issue.category, issue.location, issue.related.map(item => item.file)])).toEqual([
      ['auxiliary-original-exposure', 'description', at('module.ramify', app, 'helper'), ['tools/tmp/helper.ts']],
      ['auxiliary-original-exposure', 'description', at('module.ramify', app, 'helper as chained'), ['tools/tmp/helper.ts']],
      // The wildcard reaches `helper` under its interface alias `tool`; `main` is unreported.
      ['auxiliary-original-exposure', 'description', at('module.ramify', app, '*'), ['tools/tmp/helper.ts']],
      ['auxiliary-original-exposure', 'description', at('module.ramify', app, 'tool as received'), ['subs/a/scripts/tool.ts']],
      ['auxiliary-original-exposure', 'description', at('subs/a/module.ramify', a, 'tool'), ['subs/a/scripts/tool.ts']],
    ]);
    expect(value.diagnostics.every(issue => issue.message.includes('auxiliary source'))).toBe(true);
  }, 60_000);

  it('links the same forwarding chains and wildcard for originals beneath src/', async () => {
    const value = await report({ ...forwarding,
      'module.ramify': root(['expose-src main from "forward.ts" to descendants', 'expose-src main as chained from "chain.ts" to descendants',
        'expose-src * from "interfaces/clean.ts" to descendants', 'expose-sub api as received from a to descendants']),
      'subs/a/module.ramify': childDescription(['expose-src api as relayed from "relay.ts" to parent']) });
    expect(value.outcome.execution).toBe('completed');
    expect(value.diagnostics.filter(issue => issue.category === 'description')).toEqual([]);
    expect(value.snapshot!.model!.exposures.filter(item => item.module === 'app').map(item => [item.original.file, item.original.binding, item.names]))
      .toEqual([['main.ts', 'main', ['chained', 'main']], ['api.ts', 'api', ['api', 'received']]]);
    // The child exposes `api` to its parent under both of its names.
    expect(value.snapshot!.model!.exposures.filter(item => item.module === 'app/a').map(item => [item.original.binding, item.names]))
      .toEqual([['api', ['api', 'relayed']]]);
  }, 60_000);

  it('keeps the path rule for an exact reference that itself points outside src/', async () => {
    const value = await report({ 'module.ramify': root(['expose-src helper from "../tools/tmp/helper.ts" to descendants']) });
    expect(value.diagnostics.map(issue => issue.code)).toEqual(['invalid-path']);
  }, 60_000);
});
