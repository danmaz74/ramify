import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEditFixture, consumerProbe, laterFile, providerApi } from './fixtures/plan2/project.js';
import type { EditFixtureVariant } from './fixtures/plan2/project.js';
import { coreDescription, coreDirectory, cssShim, prepareReferenceEdits, referenceEditFixture, referenceRoot,
  vocabulary, workspaceDescription } from './fixtures/plan2/reference.js';
import { projectFixtureFiles } from './fixtures/plan1/project.js';
import { applyTextMutation, createLaterFile, moveHistoryToTesting, residentTextMutations as edits } from './resident-mutations.js';
import { runIsolatedProject } from './mutation.js';
import type { ProjectFixture } from './mutation.js';
import { filesBelow } from './reference-baseline.js';
import { repositoryRoot } from './plan.js';
import { sessionReport } from './session-expectations.js';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';

const workRoot = join(repositoryRoot, '.reference-work/resident-fixture-tests');
async function inFixture(fixture: ProjectFixture, run: (root: string) => Promise<void>): Promise<void> {
  const result = await runIsolatedProject({ workRoot, fixture, instanceId: 'I2-09:fixture-test' }, ({ root }) => run(root));
  if (!result.ok) throw result.error;
}
const f = (variant: EditFixtureVariant): ProjectFixture => ({ kind: 'create', create: root => createEditFixture(root, variant) });
const decisions = (report: AnalysisReport) => report.snapshot!.results.flatMap(result => result.decisions);
async function fileMap(root: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all((await filesBelow(root)).map(async path => [path, await readFile(join(root, path), 'utf8')])));
}

// These tests qualify the fixture causes against batch analysis. They register
// no I2 handler and cannot establish synchronization, reuse or publication.
describe('resident edit fixture variants', () => {
  it('changes an unmarked Type import from type-only to value without changing the importer', async () => {
    await inFixture(f('type-to-runtime-merge'), async root => {
      const probe = await readFile(join(root, consumerProbe), 'utf8');
      const before = await sessionReport(root);
      expect(before.diagnostics).toEqual([]);
      expect(decisions(before).map(d => d.question.selection?.request)).toEqual(['type-only']);
      expect(await applyTextMutation(root, edits['type-to-runtime-merge'])).toEqual([providerApi]);
      const after = await sessionReport(root);
      expect(decisions(after).map(d => [d.question.selection?.request, d.status])).toEqual([['value', 'allowed']]);
      expect(after.diagnostics).toEqual([]);
      expect(await readFile(join(root, consumerProbe), 'utf8')).toBe(probe);
    });
  }, 60_000);

  it('preserves the actual value original under two default-export spellings', async () => {
    await inFixture(f('alias-identity'), async root => {
      const before = await sessionReport(root);
      await applyTextMutation(root, edits['alias-identity']);
      const after = await sessionReport(root);
      const original = { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value' };
      for (const report of [before, after]) {
        expect(report.diagnostics).toEqual([]);
        expect(decisions(report).map(d => [d.status, d.original?.id])).toEqual([['allowed', original]]);
      }
      expect(after.snapshot!.catalog!.originals).toEqual(before.snapshot!.catalog!.originals);
      expect(await readFile(join(root, consumerProbe), 'utf8')).toBe("import chosen from '../../provider/src/interfaces/api.js'; void chosen;\n");
    });
  }, 60_000);

  it('removes only the provider mapping and restores the independently allowed decision', async () => {
    await inFixture(f('config-change'), async root => {
      const initial = await fileMap(root);
      const before = await sessionReport(root);
      expect(decisions(before).map(d => [d.status, d.original?.id.binding])).toEqual([['allowed', 'value']]);
      await applyTextMutation(root, edits['config-change']);
      expect(JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8')).compilerOptions.paths).toEqual({});
      const after = await sessionReport(root);
      expect(after.coverage.some(c => c.code === 'unresolved-target' && c.location.file === consumerProbe)).toBe(true);
      expect(decisions(after)).toEqual([]);
      await applyTextMutation(root, edits['config-change'], true);
      expect(await fileMap(root)).toEqual(initial);
      const restored = await sessionReport(root);
      expect(restored.coverage).toEqual([]);
      expect(decisions(restored)).toEqual(decisions(before));
    });
  }, 60_000);

  it('creates the previously missing same-owner target and refuses to overwrite it', async () => {
    await inFixture(f('missing-file-appears'), async root => {
      const before = await sessionReport(root);
      expect(before.coverage.some(c => c.code === 'unresolved-target' && c.location.file === consumerProbe)).toBe(true);
      expect(decisions(before)).toEqual([]);
      expect(await createLaterFile(root)).toEqual([laterFile]);
      const after = await sessionReport(root);
      expect(after.coverage).toEqual([]);
      expect(decisions(after).map(d => [d.status, d.reason, d.original?.id])).toEqual([
        ['allowed', 'same-owner', { kind: 'code', owner: 'fixture/consumer', file: 'later.ts', binding: 'later' }],
      ]);
      await expect(createLaterFile(root)).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(join(root, laterFile), 'utf8')).toBe('export const later = 1;\n');
    });
  }, 60_000);

  it('keeps the inherited F recipe intact outside each explicit setup change', async () => {
    for (const variant of ['type-to-runtime-merge', 'config-change', 'missing-file-appears'] as const) {
      await inFixture(f(variant), async root => {
        const actual = await fileMap(root);
        delete actual[consumerProbe];
        const expected = { ...projectFixtureFiles };
        delete expected[consumerProbe];
        expect(actual).toEqual(expected);
      });
    }
  });

  it('requires the later import anchor before creating any file', async () => {
    await inFixture(f('missing-file-appears'), async root => {
      await writeFile(join(root, consumerProbe), 'export {};\n');
      await expect(createLaterFile(root)).rejects.toThrow('exactly one mutation anchor');
      await expect(lstat(join(root, laterFile))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});

describe('reference resident mutations', () => {
  it.each([
    ['remove-hop', workspaceDescription], ['tag-change', coreDescription], ['wildcard-add', vocabulary],
    ['wildcard-remove', vocabulary], ['foreign-wildcard-invalid', vocabulary],
    ['readme-edit', 'subs/workspace/README.md'], ['invalid-description', coreDescription],
  ] as const)('%s changes exactly its authored file and reverses byte-for-byte', async (name, path) => {
    await inFixture(referenceEditFixture, async root => {
      const before = await fileMap(root);
      expect(await applyTextMutation(root, edits[name])).toEqual([path]);
      const after = await fileMap(root);
      expect(Object.keys(after).filter(file => after[file] !== before[file])).toEqual([path]);
      await applyTextMutation(root, edits[name], true);
      expect(await fileMap(root)).toEqual(before);
      expect(await readFile(join(referenceRoot, path), 'utf8')).toBe(before[path]);
    });
  });

  it('rejects missing and repeated W2 anchors before writing', async () => {
    await inFixture(referenceEditFixture, async root => {
      const path = join(root, workspaceDescription);
      const original = await readFile(path, 'utf8');
      for (const text of ['ramify 1\nmodule workspace\n', original + original]) {
        await writeFile(path, text);
        await expect(applyTextMutation(root, edits['remove-hop'])).rejects.toThrow('exactly one mutation anchor');
        expect(await readFile(path, 'utf8')).toBe(text);
      }
    });
  });

  it('moves the private helper, repairs relative imports and restores all bytes', async () => {
    await inFixture(referenceEditFixture, async root => {
      await prepareReferenceEdits(root);
      const before = await fileMap(root);
      expect(await moveHistoryToTesting(root)).toEqual([
        `${coreDirectory}/src/catalog.ts`, `${coreDirectory}/src/history.ts`,
        `${coreDirectory}/src/tests/catalog.test.ts`, `${coreDirectory}/src/tests/history.ts`,
      ]);
      const moved = await sessionReport(root);
      expect(moved.outcome.execution).toBe('completed');
      expect(moved.coverage).toEqual([]);
      expect(decisions(moved).filter(d => d.reason === 'testing-origin').map(d =>
        [d.question.importer.file, d.original?.id.binding])).toEqual([
        [`${coreDirectory}/src/catalog.ts`, 'resolvePredecessors'],
      ]);
      await moveHistoryToTesting(root, true);
      expect(await fileMap(root)).toEqual(before);
      expect((await sessionReport(root)).summary.denied).toBe(0);
    });
  }, 60_000);

  it('preflights every move anchor and destination without partially editing files', async () => {
    await inFixture(referenceEditFixture, async root => {
      const caller = `${coreDirectory}/src/tests/catalog.test.ts`;
      const original = await readFile(join(root, caller), 'utf8');
      await writeFile(join(root, caller), 'export {};\n');
      const drifted = await fileMap(root);
      await expect(moveHistoryToTesting(root)).rejects.toThrow('exactly one mutation anchor');
      expect(await fileMap(root)).toEqual(drifted);
      await writeFile(join(root, caller), original);
      await writeFile(join(root, `${coreDirectory}/src/tests/history.ts`), 'unrelated file\n');
      const occupied = await fileMap(root);
      await expect(moveHistoryToTesting(root)).rejects.toThrow('Expected absent mutation destination');
      expect(await fileMap(root)).toEqual(occupied);
    });
  });

  it('refuses shim edits through shared dependency symlinks', async () => {
    const shared = await readFile(join(referenceRoot, cssShim), 'utf8');
    await inFixture(referenceEditFixture, async root => {
      await prepareReferenceEdits(root);
      await expect(applyTextMutation(root, edits['shim-change'])).rejects.toThrow('requires a private Vite copy');
    });
    expect(await readFile(join(referenceRoot, cssShim), 'utf8')).toBe(shared);
  });

  it('edits a private Vite shim with located errors and stable resource targets', async () => {
    const shared = await readFile(join(referenceRoot, cssShim), 'utf8');
    await inFixture(referenceEditFixture, async root => {
      await prepareReferenceEdits(root, true);
      expect(await realpath(join(root, cssShim))).toBe(join(await realpath(root), cssShim));
      const before = await sessionReport(root);
      expect(before.diagnostics).toEqual([]);
      expect(before.coverage).toEqual([]);
      await applyTextMutation(root, edits['shim-change']);
      const after = await sessionReport(root);
      expect(after.diagnostics.filter(d => d.code === 'missing-export').map(d => d.location?.file).sort()).toEqual([
        'subs/workspace/subs/catalog/subs/ui/src/catalog-card.tsx',
        'subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx',
      ]);
      expect(after.diagnostics.filter(d => d.code === 'missing-export').every(d => d.location!.line > 0 && d.location!.column > 0)).toBe(true);
      const targets = (report: AnalysisReport) => report.snapshot!.accesses
        .filter(access => access.specifier?.endsWith('.module.css')).map(access => access.target);
      expect(targets(after)).toEqual(targets(before));
      await applyTextMutation(root, edits['shim-change'], true);
      expect(await readFile(join(root, cssShim), 'utf8')).toBe(shared);
    });
    expect(await readFile(join(referenceRoot, cssShim), 'utf8')).toBe(shared);
  }, 60_000);
});
