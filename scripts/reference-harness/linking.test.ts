import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateProject } from '../../subs/analysis/src/validation-entry.js';
import { plan1Instances } from './cases.js';
import { linkingHandlers } from './linking-cases.js';
import { assertReference, validated, validationInputs } from './linking-expectations.js';
import { Assertions } from './runner.js';
import { runIsolatedProject } from './mutation.js';
import { repositoryRoot } from './plan.js';

async function isolated(sourceRoot: string, run: (root: string) => Promise<void>): Promise<void> {
  const workRoot = await mkdtemp(join(tmpdir(), 'ramify-linking-'));
  try {
    const result = await runIsolatedProject({ workRoot, instanceId: 'I1-01:baseline',
      fixture: { kind: 'copy', sourceRoot } }, async ({ root }) => {
      await symlink(join(sourceRoot, 'node_modules'), join(root, 'node_modules'));
      await run(root);
    });
    if (!result.ok) throw result.error;
  } finally { await rm(workRoot, { recursive: true, force: true }); }
}

describe('iteration 7 integration evidence', () => {
  it('implements exactly every assigned matrix instance and syntax variant', () => {
    expect([...linkingHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 7).map(instance => instance.id).sort());
  });
  it('matches the unchanged reference contract map statement by statement', async () => {
    await isolated(join(repositoryRoot, 'examples/collection-review'), async root => {
      const assertions = new Assertions();
      const result = await validated(root, assertions);
      assertReference(result, assertions);
      expect(assertions.finish().every(item => item.status === 'passed')).toBe(true);
    });
  }, 90_000);
  it('validates all nine current toolkit descriptions against actual final exports', async () => {
    await isolated(repositoryRoot, async root => {
    const result = await validateProject(validationInputs(root));
    expect(result.status, JSON.stringify('diagnostics' in result ? result.diagnostics : '')).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.input.inventory.modules.map(module => module.id).sort()).toEqual([
      'ramify', 'ramify/analysis', 'ramify/analysis/model', 'ramify/analysis/descriptions', 'ramify/analysis/project',
      'ramify/analysis/typescript', 'ramify/presentation', 'ramify/presentation/layout', 'ramify/cli',
    ].sort());
    expect(result.linked.selections.some(item => item.pairs.some(pair => pair.name === 'validateProject'))).toBe(true);
    expect(result.linked.selections.flatMap(item => item.pairs).some(pair => pair.name === 'createAnalysisSession')).toBe(true);
    });
  }, 90_000);
});
