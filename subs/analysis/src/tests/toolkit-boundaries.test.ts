import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acquireInventory } from '../inventory-entry.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';
import { classifyProjectPath } from '../../subs/project/src/ownership.js';
import type { InventorySnapshot } from '../interfaces/analysis.js';
import type { PathOwnership, ProjectExclusion, ProjectScope } from '../../subs/project/src/interfaces/project.js';

// The toolkit's own committed root description, acquired as the self-check
// acquires it. Expectations are the nested trees the user decided on
// 2026-10-03, not acquisition output: their entry into the ownership table
// and, from iteration 8, their pruning before descent (PB1-32 for the harness).
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
const ownedIgnored = ['docs', 'examples/collection-review', 'scripts/probes/fixtures/compiler-api',
  'scripts/probes/fixtures/plan2a-symbol-details', 'scripts/reference-harness', 'site'];
const external = ['.cucumber-viz', '.history', '.playwright-mcp', '.reference-work', 'ramify-agent'];
const declared: readonly ProjectExclusion[] = [
  ...ownedIgnored.map(directory => ({ kind: 'owned-ignored' as const, directory, owner: 'ramify' })),
  ...external.map(directory => ({ kind: 'external' as const, directory, owner: null })),
];
const ignoredBy = (directory: string): PathOwnership =>
  ({ status: 'owned', module: 'ramify', directory: '.', exclusion: { kind: 'owned-ignored', directory, owner: 'ramify' } });
const externalBy = (directory: string): PathOwnership =>
  ({ status: 'excluded', module: null, exclusion: { kind: 'external', directory, owner: null } });
const rootOwned: PathOwnership = { status: 'owned', module: 'ramify', directory: '.', exclusion: null };

async function toolkitScope(): Promise<ProjectScope> {
  return (await toolkitInventory()).inventory.scope;
}
async function toolkitInventory(): Promise<InventorySnapshot> {
  const result = await acquireInventory({ project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), limits: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
      maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
      maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 } });
  if (result.status !== 'completed') throw new Error(JSON.stringify(result));
  return result.snapshot;
}

describe('the toolkit root description declares its nested trees', () => {
  it('enters exactly the decided declarations beside the scratch and output exclusions', async () => {
    const { ownership } = await toolkitScope();
    const trees = ownership.exclusions.filter(exclusion => exclusion.kind === 'owned-ignored' || exclusion.kind === 'external');
    // The table is byte-ordered by directory.
    expect(trees).toEqual([...declared].sort((a, b) => a.directory < b.directory ? -1 : 1));
    // Every other exclusion is a module's scratch directory or the compiler output directory.
    expect(ownership.exclusions.filter(exclusion => !trees.includes(exclusion))).toEqual(expect.arrayContaining([
      { kind: 'output', directory: 'dist', owner: null },
      { kind: 'scratch', directory: 'src/tmp', owner: 'ramify' },
      { kind: 'scratch', directory: 'subs/analysis/subs/project/src/tmp', owner: 'ramify/analysis/project' },
    ]));
    expect(ownership.exclusions.filter(exclusion => !trees.includes(exclusion))
      .every(exclusion => exclusion.kind === 'scratch' || (exclusion.kind === 'output' && exclusion.directory === 'dist'))).toBe(true);
    expect(ownership.exclusions.filter(exclusion => exclusion.kind === 'scratch')).toHaveLength(ownership.modules.length);
  });

  it('classifies paths inside each declared tree and the controls beside them', async () => {
    const scope = await toolkitScope();
    const seeds: readonly (readonly [string, PathOwnership])[] = [
      ['docs', ignoredBy('docs')],
      ['docs/model/glossary.md', ignoredBy('docs')],
      ['docs/analysis/2026-09-10-cucumber-viz-iteration14-loop/reproduce.mjs', ignoredBy('docs')],
      ['examples/collection-review/module.ramify', ignoredBy('examples/collection-review')],
      ['examples/collection-review/subs/workspace/src/router.ts', ignoredBy('examples/collection-review')],
      // The example's own work directory lies inside the example's declared tree.
      ['examples/collection-review/.reference-work/run-1/project/module.ramify', ignoredBy('examples/collection-review')],
      ['scripts/probes/fixtures/compiler-api/src/consumer.ts', ignoredBy('scripts/probes/fixtures/compiler-api')],
      ['scripts/probes/fixtures/plan2a-symbol-details/tsconfig.json', ignoredBy('scripts/probes/fixtures/plan2a-symbol-details')],
      ['scripts/reference-harness/self.test.ts', ignoredBy('scripts/reference-harness')],
      ['scripts/reference-harness/fixtures/module-tree-consumer/package.json', ignoredBy('scripts/reference-harness')],
      ['site/docusaurus.config.ts', ignoredBy('site')],
      ['site/build/index.html', ignoredBy('site')],
      ['.cucumber-viz/state.json', externalBy('.cucumber-viz')],
      ['.history', externalBy('.history')],
      ['.playwright-mcp/page.png', externalBy('.playwright-mcp')],
      ['.reference-work/production-1/tsconfig.json', externalBy('.reference-work')],
      ['ramify-agent/module.ramify', externalBy('ramify-agent')],
      // Controls: root auxiliary source and data outside every declared tree,
      // near-miss names, and module, scratch and output paths.
      ['examples/hooks/claude-code-post-write.mjs', rootOwned],
      ['scripts/probes/fixtures/synthetic-owners.ts', rootOwned],
      ['scripts/probes/fast-check/p5-common.mjs', rootOwned],
      ['scripts/spikes/bun-cli-startup/entry.mjs', rootOwned],
      ['scripts/validate-final-contracts.ts', rootOwned],
      ['scripts/reference-harness-notes.md', rootOwned],
      ['docs.md', rootOwned],
      ['plans/self-explaining-denials/plan.md', rootOwned],
      ['subs/analysis/subs/project/src/ownership.ts',
        { status: 'owned', module: 'ramify/analysis/project', directory: 'subs/analysis/subs/project', exclusion: null }],
      ['src/tmp/scratch.ts', { status: 'owned', module: 'ramify', directory: '.',
        exclusion: { kind: 'scratch', directory: 'src/tmp', owner: 'ramify' } }],
      ['dist/src/cli-entry.js', { status: 'excluded', module: null, exclusion: { kind: 'output', directory: 'dist', owner: null } }],
    ];
    for (const [path, expected] of seeds) expect(classifyProjectPath(scope, path), path).toEqual(expected);
  });

  it('prunes every declared tree before descent: no file, warning, description or input beneath any of them', async () => {
    const { inventory, inputs } = await toolkitInventory();
    // The scope carries the ownership table and no inferred independent scopes.
    expect(Object.keys(inventory.scope).sort()).toEqual(['configuration', 'invokedFrom', 'ownership', 'root', 'selection', 'walkedAreas']);
    for (const directory of [...ownedIgnored, ...external]) {
      const inside = (path: string): boolean => path.startsWith(`${directory}/`);
      expect(inventory.files.filter(file => inside(file.path)), directory).toEqual([]);
      expect(inventory.warnings.filter(warning => warning.path === directory || inside(warning.path)
        || (warning.files ?? []).some(inside)), directory).toEqual([]);
      expect(inventory.modules.filter(module => inside(module.directory)), directory).toEqual([]);
      // At most the tree's own directory is observed, as boundary evidence; nothing beneath it is.
      expect(inputs.filter(input => inside(input.path)).map(input => input.path), directory).toEqual([]);
    }
    // The reference harness tree in particular (PB1-32), and the agent harness's unmarked roots, are never read.
    expect(inputs.some(input => input.path === 'scripts/reference-harness' && input.role === 'directory')).toBe(true);
    expect(inputs.filter(input => input.role === 'description').map(input => input.path)
      .filter(path => path.startsWith('ramify-agent/') || path.startsWith('scripts/reference-harness/'))).toEqual([]);
  });
});
