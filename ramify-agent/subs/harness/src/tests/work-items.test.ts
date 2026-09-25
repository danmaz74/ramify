import { localArchitectToolName } from '../work/submission.js';
import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { analysisLayout } from '../analysis/records.js';
import { workLayout } from '../work/records.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, hypothesis, requestCompletion, unresolved } from './helpers/analysis.js';
import { treeInputs } from './helpers/iterations.js';
import {
  installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy,
} from './helpers/runs.js';

/*
 * A run whose work items need no change: the initial analysis produces entry
 * assignments and separate hypotheses, one work item is created per entry
 * capability, each work item's local architect requests completion, the
 * `work-item` gate verifies it, and the run completes.
 *
 * Requesting completion with no iteration is a legitimate outcome. The goal
 * is already satisfied by existing behavior, which is verified reuse, and
 * the gate is what says so. The architect's submission asks; it never states.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

/** A copy of the fixture project, made a git repository with the runner readiness looks for. */
async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

const root = 'collection-review';
const reviews = 'collection-review/workspace/reviews';
const twoWorkItemCheckpoints = [scenariosCommit('review-notes'), 'wi-001', 'wi-002', 'final verification of plan "review-notes"'] as const;
const oneWorkItemCheckpoints = [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"'] as const;

/** The scripted fake, answering each role with its own submission. */
function script(initial: unknown, local: (spec: SessionSpec) => unknown) {
  return (spec: SessionSpec) => [{
    kind: 'submit' as const,
    input: spec.role === 'initial-architect' ? initial : local(spec),
  }];
}

describe('a run whose work items need no change', () => {
  test('two entry capabilities become two work items, two outlines, two passing gates and a completed run', async () => {
    const project = await target();
    const submitted = analysis(
      [entry('reviewer-note', reviews, 'A reviewer can attach one note to a completed review run.'),
        entry('note-in-panel', root, 'The review panel shows the note under the findings.')],
      [hypothesis('note-storage', { change: 'create', changesExistingSymbols: true, involvedModules: [reviews] }),
        hypothesis('note-validation', { change: 'create', suggestedOwner: reviews, anticipatedConsumers: [reviews] }),
        hypothesis('note-transport', { change: 'reuse', suggestedOwner: root, involvedModules: [root] }),
        hypothesis('note-rendering', { change: 'create', suggestedOwner: root, anticipatedConsumers: ['note-in-panel'] })],
      ['the view reports no dependency facts for this fixture'],
    );
    const architectDirectories: string[] = [];
    const { service } = await openRuns(project, {
      script: script(submitted, spec => {
        if (spec.role === 'local-architect') architectDirectories.push(spec.scope.workingDirectory);
        return requestCompletion();
      }),
      inputs: treeInputs(),
      unchangedCheckpoints: twoWorkItemCheckpoints,
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const run = onlyRun(service, 'review-notes');
    expect(run.state).toBe('completed');
    expect(run.counts.workItems).toBe(2);
    expect(run.counts.completedWorkItems).toBe(2);
    expect(architectDirectories).toEqual([
      join(project, 'subs/workspace/subs/reviews/src'),
      join(project, 'src'),
    ]);

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'document-manifest-committed', 'session-opened', 'invocation-started', 'invocation-ended', 'analysis-accepted',
      'gate-started', 'readiness-passed', 'scenarios-materializing', 'scenarios-materialized',
      // Each completion request declares its entry's scenario, and the
      // work item's gate implements it.
      'work-item-started', 'hypotheses-delivered', 'session-opened', 'invocation-started', 'invocation-ended',
      'work-orientation-recorded', 'session-opened', 'invocation-started', 'invocation-ended', 'context-selection-recorded',
      'context-package-append-requested', 'context-package-appended', 'invocation-started', 'context-package-prompt-bound', 'invocation-ended',
      'scenario-declared', 'outline-revised', 'gate-committing', 'gate-attempted', 'scenario-implemented', 'work-item-completed', 'session-finished',
      'work-item-started', 'hypotheses-delivered', 'session-opened', 'invocation-started', 'invocation-ended',
      'work-orientation-recorded', 'session-opened', 'invocation-started', 'invocation-ended', 'context-selection-recorded',
      'context-package-append-requested', 'context-package-appended', 'invocation-started', 'context-package-prompt-bound', 'invocation-ended',
      'scenario-declared', 'outline-revised', 'gate-committing', 'gate-attempted', 'scenario-implemented', 'work-item-completed', 'session-finished',
      'nonfunctional-phase-started', 'candidate-prepared', 'nonfunctional-assessed', 'nonfunctional-round-closed',
      'gate-committing', 'gate-attempted', 'candidate-bound-to-gate', 'session-finished', 'job-completed',
    ]);

    // One event holds every record of the analysis phase.
    const accepted = events.find(event => event.type === 'analysis-accepted')!;
    expect(accepted.data).toMatchObject({ entries: 2, hypotheses: 4, registry: 2, workItems: 2 });

    // One work item per entry capability, and each one's goal is the entry's description.
    const item = async (id: string) => JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, workLayout.item(id)), 'utf8')) as Record<string, unknown>;
    expect(await item('wi-001')).toMatchObject({ module: reviews, origin: { entry: 'reviewer-note' }, goal: 'A reviewer can attach one note to a completed review run.', startedFor: null });
    expect(await item('wi-002')).toMatchObject({ module: root, origin: { entry: 'note-in-panel' } });
    expect(existsSync(runPath(project, 'review-notes', receipt.jobId, workLayout.item('wi-003')))).toBe(false);

    // Two outlines, each recorded as a single iteration, each at revision 1.
    for (const id of ['wi-001', 'wi-002']) {
      const outline = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, workLayout.outline(id, 1)), 'utf8')) as Record<string, unknown>;
      expect(outline).toMatchObject({ workItem: id, revision: 1, decomposition: { kind: 'single-iteration' }, revisionReason: '' });
      expect(outline['invocation']).toMatch(/^inv-\d{4}$/);
    }

    // Two passing work-item gates and one passing final gate.
    const gates = events.filter(event => event.type === 'gate-attempted');
    expect(gates.map(event => event.data.checkpoint)).toEqual(['work-item', 'work-item', 'final']);
    expect(gates.every(event => event.data.verdict === 'passed')).toBe(true);
    const completed = events.find(event => event.type === 'job-completed')!;
    expect(completed.data).toMatchObject({ workItems: 2 });
  }, 300_000);

  test('hypotheses create no work, and a hypothesis appears in no work record', async () => {
    const project = await target();
    const submitted = analysis(
      [entry('reviewer-note', reviews), entry('note-in-panel', root)],
      [hypothesis('note-storage', { involvedModules: [reviews] }),
        hypothesis('note-validation', { suggestedOwner: reviews }),
        hypothesis('note-transport', { suggestedOwner: root }),
        hypothesis('note-rendering', { anticipatedConsumers: [root] })],
    );
    const { service } = await openRuns(project, {
      script: script(submitted, () => requestCompletion()),
      unchangedCheckpoints: twoWorkItemCheckpoints,
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    // Every hypothesis is committed at revision 1, and none of them is rewritten.
    for (const id of ['note-storage', 'note-validation', 'note-transport', 'note-rendering']) {
      const body = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, analysisLayout.hypothesis(id, 1)), 'utf8')) as Record<string, unknown>;
      expect(body).toMatchObject({ schema: 'ramify-agent.hypothesis/1', id, revision: 1, standing: 'tentative' });
      expect(body['cause']).toMatchObject({ initial: 'inv-0001' });
      expect(existsSync(runPath(project, 'review-notes', receipt.jobId, analysisLayout.hypothesis(id, 2)))).toBe(false);
    }

    // The frontier holds exactly one work item per entry capability, and no more.
    const registry = ['reviewer-note', 'note-in-panel'];
    for (const capability of registry) {
      expect(existsSync(runPath(project, 'review-notes', receipt.jobId, analysisLayout.registry(capability, 1)))).toBe(true);
    }
    for (const forecast of ['note-storage', 'note-validation', 'note-transport', 'note-rendering']) {
      expect(existsSync(runPath(project, 'review-notes', receipt.jobId, analysisLayout.registry(forecast, 1)))).toBe(false);
    }

    // No work record references a hypothesis. A work item and the event that
    // completes it are searched for every hypothesis ID.
    const forecasts = ['note-storage', 'note-validation', 'note-transport', 'note-rendering'];
    for (const path of [workLayout.item('wi-001'), workLayout.item('wi-002')]) {
      const text = await readFile(runPath(project, 'review-notes', receipt.jobId, path), 'utf8');
      for (const forecast of forecasts) expect(text).not.toContain(forecast);
    }
    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    const completions = JSON.stringify(events.filter(event => event.type === 'work-item-completed'));
    for (const forecast of forecasts) expect(completions).not.toContain(forecast);

    // An outline names the revisions its architect was given, and nothing
    // else about them. That is a record of delivery, not a reference that
    // creates work: outside `hypothesesSeen` no hypothesis appears.
    for (const id of ['wi-001', 'wi-002']) {
      const outline = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, workLayout.outline(id, 1)), 'utf8')) as Record<string, unknown>;
      const { hypothesesSeen, ...rest } = outline as { hypothesesSeen: unknown };
      expect(Array.isArray(hypothesesSeen)).toBe(true);
      for (const forecast of forecasts) expect(JSON.stringify(rest)).not.toContain(forecast);
    }
  }, 300_000);

  test('a work item receives the hypothesis revisions that involve it, not only the ones that suggest it as owner', async () => {
    const project = await target();
    const submitted = analysis(
      [entry('reviewer-note', reviews), entry('note-in-panel', root)],
      [
        // Suggested owner.
        hypothesis('owned-here', { suggestedOwner: reviews }),
        // Involves the module without suggesting it.
        hypothesis('involves-here', { suggestedOwner: root, involvedModules: [reviews] }),
        // Anticipates the module as a consumer.
        hypothesis('consumed-here', { suggestedOwner: root, anticipatedConsumers: [reviews] }),
        // Anticipates the work item's capability as a consumer.
        hypothesis('consumed-by-capability', { suggestedOwner: root, anticipatedConsumers: ['reviewer-note'] }),
        // Nothing to do with it.
        hypothesis('elsewhere', { suggestedOwner: root }),
      ],
    );
    const { service } = await openRuns(project, {
      script: script(submitted, () => requestCompletion()),
      unchangedCheckpoints: twoWorkItemCheckpoints,
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    const deliveries = events.filter(event => event.type === 'hypotheses-delivered');
    expect(deliveries).toHaveLength(2);
    const first = deliveries[0]!.data as { workItem: string; refs: Array<{ id: string; revision: number; hash: string }> };
    expect(first.workItem).toBe('wi-001');
    expect(first.refs.map(ref => ref.id).sort()).toEqual(['consumed-by-capability', 'consumed-here', 'involves-here', 'owned-here']);
    expect(first.refs.every(ref => ref.revision === 1 && /^[0-9a-f]{64}$/.test(ref.hash))).toBe(true);

    const second = deliveries[1]!.data as { workItem: string; refs: Array<{ id: string }> };
    expect(second.workItem).toBe('wi-002');
    // `owned-here` suggests the other module and involves nothing, so it is
    // not delivered here; `elsewhere` suggests this one.
    expect(second.refs.map(ref => ref.id).sort()).toEqual(['consumed-by-capability', 'consumed-here', 'elsewhere', 'involves-here']);

    // The outline records what the architect had been given, from the
    // delivery and not from the submission.
    const outline = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, workLayout.outline('wi-001', 1)), 'utf8')) as { hypothesesSeen: Array<{ id: string }> };
    expect(outline.hypothesesSeen.map(ref => ref.id).sort()).toEqual(['consumed-by-capability', 'consumed-here', 'involves-here', 'owned-here']);
  }, 300_000);

  test('the delivered hash is the hash of the materialized record file', async () => {
    const project = await target();
    const submitted = analysis([entry('reviewer-note', reviews)], [hypothesis('owned-here', { suggestedOwner: reviews })]);
    const { service } = await openRuns(project, {
      script: script(submitted, () => requestCompletion()),
      unchangedCheckpoints: oneWorkItemCheckpoints,
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    const delivered = (events.find(event => event.type === 'hypotheses-delivered')!.data as { refs: Array<{ id: string; hash: string }> }).refs[0]!;
    const bytes = await readFile(runPath(project, 'review-notes', receipt.jobId, analysisLayout.hypothesis('owned-here', 1)));
    const { createHash } = await import('node:crypto');
    expect(delivered.hash).toBe(createHash('sha256').update(bytes).digest('hex'));
  }, 300_000);
});

describe('a work-item gate that does not pass', () => {
  test('returns to the same local architect, which revises its outline, and exhausts deterministically', async () => {
    const project = await target();
    const submitted = analysis([entry('reviewer-note', reviews)]);
    let turn = 0;
    const { service, agent } = await openRuns(project, {
      // Readiness passes; every work-item attempt receives the same completed
      // test failure from the direct executor.
      checkScript: ({ check, context }) => context.checkpoint === 'work-item' && check.kind === 'tests'
        ? { outcome: { kind: 'completed', exitCode: 1 } }
        : {},
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'wi-001', 'wi-001', 'wi-001'],
      script: (spec: SessionSpec) => {
        if (spec.role === 'initial-architect') return [{ kind: 'submit' as const, input: submitted }];
        turn += 1;
        return [{ kind: 'submit' as const, input: requestCompletion({ revisionReason: turn === 1 ? '' : `Revision ${turn}` }) }];
      },
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const run = onlyRun(service, 'review-notes');
    expect(run.state).toBe('failed');
    expect(run.failure).toMatchObject({ reason: 'repair-exhausted' });
    // The original cause is preserved with the first attempt that recorded it.
    expect(run.failure!.message).toContain('the first cause was in-scope at gate');

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    // The original attempt plus the policy's three repair rounds.
    const gates = events.filter(event => event.type === 'gate-attempted').filter(event => event.data.checkpoint === 'work-item');
    expect(gates).toHaveLength(4);
    expect(gates.every(event => event.data.verdict === 'failed')).toBe(true);
    // Every verified changed attempt is committed before its exact revision is
    // audited, including a failing attempt that will be repaired next.
    expect(events.filter(event => event.type === 'gate-committing')).toHaveLength(4);

    // Four outline revisions, each from its own invocation of the same session.
    const outlines = events.filter(event => event.type === 'outline-revised');
    expect(outlines.map(event => event.data.revision)).toEqual([1, 2, 3, 4]);
    expect(existsSync(runPath(project, 'review-notes', receipt.jobId, workLayout.outline('wi-001', 4)))).toBe(true);
    const fourth = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, workLayout.outline('wi-001', 4)), 'utf8')) as { revisionReason: string };
    expect(fourth.revisionReason).toBe('Revision 4');

    // The work item is never completed, and the final gate never runs.
    expect(events.some(event => event.type === 'work-item-completed')).toBe(false);
    expect(events.some(event => event.type === 'job-completed')).toBe(false);

    // The local architect is one continuing session: every turn after the
    // first continues the point the last one reached.
    const local = agent!.sessions.filter(session => session.spec.submission.name === localArchitectToolName);
    expect(local).toHaveLength(4);
    expect(local[0]!.start.mode).toBe('continue'); // Continues the recorded orientation after selection.
    for (const session of local.slice(1)) expect(session.start).toEqual({ mode: 'continue' });
    // Each turn after the first is told what the gate found.
    expect(local[1]!.spec.prompt).toContain('The gate did not pass');
    expect(local[1]!.spec.prompt).toContain('- `tests`: failed');
  }, 300_000);
});

describe('a local architect that cannot meet the request', () => {
  test('`unresolved` the global architect finds nothing possible for ends the run with the conflict and its evidence, and no gate runs', async () => {
    const project = await target();
    const submitted = analysis([entry('reviewer-note', reviews)]);
    const { service } = await openRuns(project, {
      script: script(submitted, spec => (spec.role === 'global-fork'
        ? { kind: 'nothing-possible', reason: 'A note that outlives its run contradicts the plan.', evidence: ['README.md'] }
        : unresolved('The note would outlive the run it belongs to.'))),
      unchangedCheckpoints: [scenariosCommit('review-notes')],
    });
    cleanups.push(() => service.close());

    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const run = onlyRun(service, 'review-notes');
    expect(run.state).toBe('failed');
    expect(run.failure).toMatchObject({ reason: 'unresolvable-requirement' });
    expect(run.failure!.message).toContain('The note would outlive the run it belongs to.');
    expect(run.failure!.evidence).toContain('README.md');

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    expect(events.some(event => event.type === 'outline-revised')).toBe(false);
    expect(events.filter(event => event.type === 'gate-attempted')).toHaveLength(0);
    expect(events.some(event => event.type === 'work-item-completed')).toBe(false);
    // The submission is stored verbatim before anything is derived from it.
    const stored = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.submission('inv-0004')), 'utf8')) as Record<string, unknown>;
    expect(stored).toMatchObject({ schema: 'ramify-agent.local-architect-submission/1', kind: 'unresolved' });
  }, 300_000);
});
