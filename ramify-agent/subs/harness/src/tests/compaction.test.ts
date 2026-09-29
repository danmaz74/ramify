import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit, type GitCheckpoint } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { runLayout } from '../run/records.js';
import { defaultRunPolicy } from '../run/policy.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { installTestRunner, onlyRun, runPath, startRun } from './helpers/runs.js';

/*
 * Compaction is allowed for an architect and forbidden for a writer, and it
 * is port policy rather than prompt text. Where it happens, the harness
 * records it: its trigger, whether it succeeded, and the sizes before and
 * after where the implementation reports them.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const reviews = 'collection-review/workspace/reviews';

interface Observation { readonly type: string; readonly data: Record<string, unknown> }

async function observations(root: string, runId: string, invocation: string): Promise<Observation[]> {
  const text = await readFile(runPath(root, 'review-notes', runId, runLayout.observations(invocation)), 'utf8');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation);
}

describe('compaction during a run', () => {
  test('an initial architect and a local architect that compact are both recorded', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      const submitted = analysis([entry('reviewer-note', reviews)]);

    const { service } = await openRuns(fixture.root, {
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"'],
      script: (spec: SessionSpec) => (spec.role === 'catalog-extractor' ? [] : spec.role === 'initial-architect'
        ? [
          { kind: 'context' as const, tokens: 90_000, window: 200_000 },
          { kind: 'compaction' as const, reason: 'threshold' as const, tokensBefore: 90_000, tokensAfter: 21_000 },
          { kind: 'context' as const, tokens: null, window: 200_000 },
          { kind: 'submit' as const, input: submitted },
        ]
        : [
          { kind: 'compaction' as const, reason: 'overflow' as const, tokensBefore: 140_000 },
          { kind: 'submit' as const, input: requestCompletion() },
        ]),
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    // The initial architect: the trigger, the success and both sizes.
    const initial = await observations(fixture.root, receipt.jobId, 'inv-0002');
    const compacted = initial.filter(line => line.type === 'compaction');
    expect(compacted).toHaveLength(1);
    expect(compacted[0]!.data).toEqual({ trigger: 'threshold', succeeded: true, before: 90_000, after: 21_000 });

    // The observation after it reports no size, which is unknown and never
    // room: it is recorded as it arrived.
    const contexts = initial.filter(line => line.type === 'context');
    expect(contexts.map(line => line.data['tokens'])).toEqual([90_000, null]);

    // The local architect: the same record, with the size the implementation
    // could not report left null rather than filled in.
    const local = await observations(fixture.root, receipt.jobId, 'inv-0006');
    const localCompaction = local.filter(line => line.type === 'compaction');
    expect(localCompaction).toHaveLength(1);
    expect(localCompaction[0]!.data).toEqual({ trigger: 'overflow', succeeded: true, before: 140_000, after: null });
  }, 300_000);

  test('production compaction is allowed for coordinating architects and forbidden for writers', () => {
    const policy = defaultRunPolicy({ projectRoot: '/work/project', nested: [] });
    expect(policy.context['initial-architect']).toMatchObject({ compaction: 'allowed' });
    expect(policy.context['local-architect']).toMatchObject({ compaction: 'allowed' });
    expect(policy.context['capability-architect']).toMatchObject({ compaction: 'allowed' });
    expect(policy.context['contract-engineer']).toBeUndefined();
    for (const role of ['global-fork', 'engineer'] as const) {
      expect(policy.context[role]).toMatchObject({ compaction: 'forbidden' });
    }
  });

  test('a session whose policy forbids compaction never compacts, whatever its script asks', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      const submitted = analysis([]);
    const { service, agent } = await openRuns(fixture.root, {
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
      script: (spec: SessionSpec) => {
        // The run's own policy for this role is what decides; the harness
        // never says so in the prompt.
        expect(spec.systemPrompt).not.toContain('compact');
        if (spec.role === 'catalog-extractor') return [];
        return [{ kind: 'compaction' as const, reason: 'threshold' as const }, { kind: 'submit' as const, input: submitted }];
      },
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    // The initial architect may compact, so this one did.
    expect(agent!.sessions.find(session => session.spec.role === 'initial-architect')!.suppressedCompactions).toBe(0);
    const recorded = (await observations(fixture.root, receipt.jobId, 'inv-0002')).filter(line => line.type === 'compaction');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.data).toMatchObject({ trigger: 'threshold', succeeded: true, before: null, after: null });
  }, 300_000);
});
