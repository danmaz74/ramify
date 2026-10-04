import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisInputs, AnalysisReport, InventoryFile, SourceAccess, SourceArea, SourceOrigin, SourceTarget } from '../index.js';
import { evaluateAccesses } from '../evaluate-accesses.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

// Auxiliary provenance vocabulary (project-boundary contracts, "Source and
// exposure provenance"): the public types, src placement and false flags for
// source beneath src/, and auxiliary placement and true flags for the selected
// loose root file, which iteration 8C activates. Since project-boundary
// iteration 11 a nested-tree target is a definite boundary denial and an
// excluded target stays unverifiable; expected values follow the contracts.

const ordinary: SourceArea = { owner: 'fixture', kind: 'ordinary', root: 'src', profile: [] };

// Positive and negative type fixtures over the public analysis entry; the
// toolkit type-check enforces each `@ts-expect-error`.
const origins: readonly SourceOrigin[] = [
  { file: 'src/main.ts', area: ordinary, auxiliary: false },
  { file: 'scripts/check.ts', area: ordinary, auxiliary: true },
];
// @ts-expect-error every origin states whether it is auxiliary
const unstated: SourceOrigin = { file: 'src/main.ts', area: ordinary };
const placements: readonly InventoryFile['placement'][] = ['src', 'auxiliary'];
// @ts-expect-error placement is one of the two reviewed values
const outsidePlacement: InventoryFile['placement'] = 'outside';
// @ts-expect-error no stage produces a referenced-resource placement
const resourcePlacement: InventoryFile['placement'] = 'referenced-resource';
// @ts-expect-error every inventory file states its placement
const unplaced: InventoryFile = { path: 'src/main.ts', owner: 'fixture', area: 'ordinary', kind: 'source', sha256: '0'.repeat(64), bytes: 1 };
const targets: readonly SourceTarget[] = [
  { kind: 'outside-project', file: '../elsewhere/tool.ts' },
  { kind: 'nested-tree', file: 'fixture-project/src/main.ts', exclusion: { kind: 'owned-ignored', directory: 'fixture-project', owner: 'fixture' } },
  { kind: 'nested-tree', file: 'external-project/index.ts', exclusion: { kind: 'external', directory: 'external-project', owner: null } },
  { kind: 'excluded', file: 'src/tmp/throwaway.ts', exclusion: { kind: 'scratch', directory: 'src/tmp', owner: 'fixture' } },
  { kind: 'excluded', file: 'dist/main.js', exclusion: { kind: 'output', directory: 'dist', owner: null } },
  ...(['repository', 'packages', 'generated'] as const).map((kind): SourceTarget =>
    ({ kind: 'excluded', file: 'x/y.ts', exclusion: { kind, directory: 'x', owner: null } })),
];
// @ts-expect-error the outside target kind is renamed to outside-project
const renamed: SourceTarget = { kind: 'outside-module', file: 'loose.ts' };
// @ts-expect-error a nested-tree target names a declared tree, not a reserved exclusion
const scratchTree: SourceTarget = { kind: 'nested-tree', file: 'src/tmp/a.ts', exclusion: { kind: 'scratch', directory: 'src/tmp', owner: 'fixture' } };
// @ts-expect-error an excluded target is not a declared tree
const declaredExcluded: SourceTarget = { kind: 'excluded', file: 'external-project/a.ts', exclusion: { kind: 'external', directory: 'external-project', owner: null } };
// @ts-expect-error a boundary target carries its exclusion
const bareTree: SourceTarget = { kind: 'nested-tree', file: 'fixture-project/a.ts' };

const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module fixture\nexpose-src publicValue from "interfaces/api.ts" to descendants\nowned-ignored "vendor"\n',
  'README.md': '# Fixture\n\nOne project with source beneath src, one loose root file and an owned-ignored tree.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs', 'loose.ts'] }),
  'loose.ts': 'export const loose = 1;\n',
  'vendor/tool.ts': 'export const tool = 1;\n',
  'src/interfaces/api.ts': 'export const publicValue: number = 1;\n',
  'src/barrel.ts': "export { publicValue } from './interfaces/api.js';\n",
  'src/use.ts': "import { publicValue } from './barrel.js';\nimport { loose } from '../loose.js';\nimport { tool } from '../vendor/tool.js';\nvoid publicValue; void loose; void tool;\n",
  'src/style.css': '.a { color: red; }\n',
  'src/tests/use.test.ts': "import { publicValue } from '../interfaces/api.js';\nvoid publicValue;\n",
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
  'subs/consumer/src/probe.ts': "import { publicValue } from '../../../src/interfaces/api.js';\nvoid publicValue;\n",
};
async function report(): Promise<AnalysisReport> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-provenance-')));
  try {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const inputs: AnalysisInputs = {
      project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), capabilities: ['static-access'],
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

/** Every origin the snapshot carries: originals, forwarding, importers, targets and decisions. */
function snapshotOrigins(value: AnalysisReport): SourceOrigin[] {
  const snapshot = value.snapshot!;
  return [
    ...snapshot.catalog!.originals.map(original => original.origin),
    ...snapshot.catalog!.files.flatMap(file => file.exports.flatMap(entry => entry.forwarding)),
    ...snapshot.accesses.flatMap(access => [access.importer, ...(access.target.kind === 'application' ? [access.target.origin] : []),
      ...access.selections.flatMap(selection => selection.forwarding)]),
    ...snapshot.results.flatMap(result => result.decisions.flatMap(decision => [decision.question.importer, decision.question.target,
      ...decision.question.forwarding, ...decision.checkedOrigins, ...decision.blockingOrigins, ...(decision.original ? [decision.original.origin] : [])])),
    ...snapshot.model!.originals.map(original => original.origin),
  ];
}

describe('auxiliary provenance vocabulary', () => {
  it('types origins, placements and boundary targets', () => {
    expect([origins.length, placements.length, targets.length]).toEqual([2, 2, 8]);
    expect([unstated, outsidePlacement, resourcePlacement, unplaced, renamed, scratchTree, declaredExcluded, bareTree]).toHaveLength(8);
  });

  it('gives files beneath src/ src placement and false flags, and the loose root file auxiliary placement and true flags', async () => {
    const value = await report();
    // The import into the owned-ignored vendor tree is a definite finding, not a
    // limit, so the check fails with complete coverage (see the next test).
    expect(value.outcome).toEqual({ execution: 'completed', check: 'failed', coverage: 'complete' });
    const inventory = value.snapshot!.inventory;
    expect(inventory.files.map(file => [file.path, file.area, file.kind, file.placement])).toEqual([
      ['loose.ts', 'ordinary', 'source', 'auxiliary'],
      ['src/barrel.ts', 'ordinary', 'source', 'src'],
      ['src/interfaces/api.ts', 'ordinary', 'source', 'src'],
      ['src/style.css', 'ordinary', 'resource', 'src'],
      ['src/tests/use.test.ts', 'tests', 'source', 'src'],
      ['src/use.ts', 'ordinary', 'source', 'src'],
      ['subs/consumer/src/probe.ts', 'ordinary', 'source', 'src'],
    ]);
    const all = snapshotOrigins(value);
    expect(all.length).toBeGreaterThan(0);
    // Exactly the loose file's origins are auxiliary, with the root's ordinary area; no other origin is.
    expect(all.filter(origin => origin.auxiliary !== false).length).toBeGreaterThan(0);
    expect(all.filter(origin => origin.auxiliary !== (origin.file === 'loose.ts'))).toEqual([]);
    expect(all).toContainEqual({ file: 'loose.ts', area: ordinary, auxiliary: true });
    expect(value.snapshot!.catalog!.originals.filter(original => original.origin.auxiliary).map(original => original.id))
      .toEqual([{ kind: 'code', owner: 'fixture', file: '../loose.ts', binding: 'loose' }]);
    // The same-owner import of auxiliary source is allowed.
    const loose = value.snapshot!.accesses.find(access => access.specifier === '../loose.js')!;
    expect(value.snapshot!.results.find(result => result.accessId === loose.id)).toMatchObject({ outcome: 'checked',
      decisions: [{ status: 'allowed', reason: 'same-owner' }] });
    // The barrel's forwarding origin is a src origin too.
    expect(all).toContainEqual({ file: 'src/barrel.ts', area: { owner: 'fixture', kind: 'ordinary', root: 'src', profile: [] }, auxiliary: false });
  });

  it('reports an import into an owned-ignored tree as a nested-tree target that is never checked', async () => {
    const value = await report();
    // Owned source outside src/ is an application target; a file in an
    // owned-ignored tree is not inventoried and is classified at its physical
    // location as a nested-tree target with its declaration. Its outcome is the
    // definite boundary denial: one located finding, no symbol decision, no limit.
    const tool = value.snapshot!.accesses.filter(access => access.specifier === '../vendor/tool.js');
    expect(tool.map(access => access.target)).toEqual([{ kind: 'nested-tree', file: 'vendor/tool.ts',
      exclusion: { kind: 'owned-ignored', directory: 'vendor', owner: 'fixture' } }]);
    const result = value.snapshot!.results.find(item => item.accessId === tool[0]!.id)!;
    expect(result).toMatchObject({ outcome: 'denied', decisions: [], coverage: [] });
    expect(value.diagnostics.map(item => [item.id, item.code, item.category, item.location?.file, item.location?.line, item.accessId]))
      .toEqual([[result.diagnostics[0], 'project-boundary-import', 'import', 'src/use.ts', 3, tool[0]!.id]]);
    expect(value.coverage).toEqual([]);
    expect([value.summary.denied, value.summary.errors, value.summary.coverageNotes]).toEqual([1, 1, 0]);
  });

  it('never lets a nested-tree or excluded target pass as checked', async () => {
    const value = await report();
    const probe = value.snapshot!.accesses.find(access => access.importer.file === 'subs/consumer/src/probe.ts')!;
    const boundary: readonly SourceAccess[] = [
      { ...probe, id: 'nested-tree', target: targets[1]! },
      { ...probe, id: 'external-tree', target: targets[2]! },
      { ...probe, id: 'scratch', target: targets[3]! },
    ];
    const { results, diagnostics } = evaluateAccesses(value.snapshot!.model!, [probe, ...boundary], 100);
    // Positive control: the same application access is checked and allowed.
    expect(results.find(result => result.accessId === probe.id)).toMatchObject({ outcome: 'checked',
      decisions: [{ status: 'allowed', reason: 'exposed' }] });
    // Either declared tree is a boundary denial; the scratch target stays unverifiable.
    expect(results.filter(result => result.accessId !== probe.id).map(result => [result.accessId, result.outcome, result.decisions]))
      .toEqual([['external-tree', 'denied', []], ['nested-tree', 'denied', []], ['scratch', 'unverifiable', []]]);
    expect(diagnostics.map(item => [item.code, item.accessId, item.location])).toEqual(expect.arrayContaining([
      ['project-boundary-import', 'external-tree', probe.selections[0]!.location],
      ['project-boundary-import', 'nested-tree', probe.selections[0]!.location]]));
    expect(diagnostics).toHaveLength(2);
  });
});
