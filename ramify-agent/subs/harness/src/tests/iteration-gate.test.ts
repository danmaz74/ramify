import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { gateGit, type GateCommit, type GateGitOptions } from './helpers/gate-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * The iteration gate: what a failure is attributed to, what it returns for,
 * and how each of its causes is spent.
 *
 * The defect is real source in a real module and the repair is a real `edit`
 * through the port's own built-in, behind the real write guard. What each
 * command answered is stated by the scenario, and so is what Git reports at
 * every commit boundary, including the boundaries where the tree is
 * unchanged and no commit is made. The one scenario whose subject is a real
 * failing runner and the audit published against the revision it failed on
 * keeps every real tool, in `iteration-gate-integration.test.ts`.
 *
 * The process guard below is the negative control: every scenario here
 * starts no process at all, and one that tried would name itself.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/** The revision the fixture is on before a run commits anything. */
const base = 'revision-00';

/** A boundary Git reports as unchanged, which commits nothing and keeps the accepted revision. */
const unchanged: GateCommit = { commit: null };

/** A boundary Git reports as one modified file, answering the revision it made. */
const modified = (commit: string, ...paths: string[]): GateCommit => ({
  commit,
  changes: paths.map(path => ({ status: 'M', path })),
});

/** The same, for paths Git has not seen before. */
const added = (commit: string, ...paths: string[]): GateCommit => ({
  commit,
  changes: paths.map(path => ({ status: 'A', path })),
});

const limitTest = [
  'import { test, expect } from \'vitest\';',
  'import { noteLimit } from \'../notes.ts\';',
  '',
  'test(\'the note limit is what the plan asks for\', () => {',
  '  expect(noteLimit).toBe(500);',
  '});',
  '',
].join('\n');

async function target(options: { readonly limit?: number; readonly tests?: boolean } = {}) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': `export const noteLimit = ${options.limit ?? 400};\n`,
    ...(options.tests === false ? {} : { 'src/tests/notes.test.ts': limitTest }),
  });
  await installTestRunner(fixture.root);
  return fixture.root;
}

async function run(
  root: string,
  plan: Parameters<typeof byRole>[0],
  answers: Omit<GateGitOptions, 'head'>,
  options: Omit<Parameters<typeof openRuns>[1], 'git'> = {},
) {
  const scripted = gateGit(root, { head: base, ...answers });
  const opened = await openRuns(root, {
    script: byRole(plan),
    inputs: treeInputs(),
    git: scripted.git,
    readinessExecution: directReadinessExecution(),
    ...options,
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, runId: receipt.jobId, scripted };
}

async function readGate(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

async function readResult(root: string, runId: string, workItem: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, iterationLayout.result(workItem, number)), 'utf8')) as IterationResult;
}

/** Every gate attempt the run committed, in order. */
async function gates(root: string, runId: string): Promise<GateAttempt[]> {
  const events = await runEventsOnDisk(root, 'review-notes', runId);
  const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
  return Promise.all(ids.map(id => readGate(root, runId, id)));
}

describe('K1: a module gate fails, is repaired and reruns the complete gate', () => {
  test('a gate that fails three times exhausts and returns the original cause to the local architect', async () => {
    const root = await target();
    const iterationAttempts = new Set<string>();
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        // The exhausted iteration returns here, and the architect assigns a
        // repair rather than asking for completion over a defect.
        submit(assign(notes, { kind: 'repair', goal: 'Repair what the exhausted iteration left.' })),
        submit(requestCompletion()),
      ],
      // The first three attempts propose completion without repairing
      // anything; the repair iteration's engineer fixes the defect.
      engineer: [
        submit(completionProposed('I believe this is done.')),
        submit(completionProposed('I still believe this is done.')),
        submit(completionProposed('I believe this once more.')),
        submit(completionProposed('Raised the limit to 500.'), edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
      ],
    }, {
      // The three attempts that repair nothing change nothing, so Git
      // reports no commit for any of them; the repair is the one revision.
      commits: [
        unchanged, unchanged, unchanged,
        modified('revision-01', `${notesDirectory}/src/notes.ts`),
        unchanged, unchanged,
      ],
    }, {
      checkScript: ({ check, context }) => {
        if (context.checkpoint !== 'iteration') return {};
        iterationAttempts.add(context.attemptId);
        return iterationAttempts.size <= 3 && check.kind === 'tests'
          ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' }
          : {};
      },
    });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    const exhausted = iterationGates.filter(gate => gate.subject.iteration === 'wi-001.i01');
    expect(exhausted.map(gate => gate.repairRound)).toEqual([0, 1, 2]);
    expect(exhausted.map(gate => gate.next)).toEqual(['repair', 'repair', 'exhausted']);
    expect(exhausted.every(gate => gate.cause === 'in-scope')).toBe(true);
    // Each failing attempt was audited over the revision it stood on, which
    // is the run's own boundary: none of them committed one of its own.
    expect(exhausted.map(gate => gate.commit)).toEqual([null, null, null]);
    expect(exhausted.map(gate => gate.audited)).toEqual([base, base, base]);

    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('exhausted');
    expect(result.gate).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.invocations).toHaveLength(3);
    // The cause the architect receives is the first attempt's, not the last.
    expect(result.findings.some(finding => finding.includes(`in-scope at gate ${exhausted[0]!.id}`))).toBe(true);
    // The repair iteration the architect then assigned is the one accepted,
    // and it is the only one whose commit boundary answered a revision.
    const repaired = await readResult(root, runId, 'wi-001', 2);
    expect(repaired.outcome).toBe('accepted');
    expect(repaired.commit).toBe('revision-01');
    expect(scripted.revisions()).toEqual(['revision-01']);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

describe('K8: every gate resolves the current tests under the captured policy', () => {
  test('a failing test added after the assignment, during repair, fails that attempt', async () => {
    const root = await target({ limit: 500 });
    let firstIteration: string | undefined;
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [
        // The first attempt passes the tests that exist, then writes a new
        // test that does not hold.
        submit(completionProposed('Stated a second rule about the limit.'),
          write(`${notesDirectory}/src/tests/second.test.ts`, [
            'import { test, expect } from \'vitest\';',
            'import { noteLimit } from \'../notes.ts\';',
            '',
            'test(\'the limit is also the minimum\', () => {',
            '  expect(noteLimit).toBe(1);',
            '});',
            '',
          ].join('\n'))),
        submit(completionProposed('Corrected the second rule.'),
          edit(`${notesDirectory}/src/tests/second.test.ts`, 'toBe(1)', 'toBe(500)')),
      ],
    }, {
      commits: [
        { ...added('revision-01', `${notesDirectory}/src/tests/second.test.ts`), against: base, subject: 'wi-001.i01' },
        // The repair is asked about the same accepted boundary, which the
        // failing attempt's own commit did not move.
        { ...modified('revision-02', `${notesDirectory}/src/tests/second.test.ts`), against: base, subject: 'wi-001.i01' },
        { commit: null, against: 'revision-02' },
        { commit: null, against: 'revision-02' },
      ],
      // The accepted boundary is reached from the revision the run started
      // on, because the attempt between them failed and accepted nothing.
      diffs: [{
        from: base,
        to: 'revision-02',
        changes: [{ status: 'A', path: `${notesDirectory}/src/tests/second.test.ts` }],
      }],
    }, {
      checkScript: ({ check, context }) => {
        if (context.checkpoint !== 'iteration') return {};
        firstIteration ??= context.attemptId;
        return context.attemptId === firstIteration && check.kind === 'tests'
          ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' }
          : {};
      },
    });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    // The first attempt ran the test the assignment had never seen, and failed on it.
    expect(iterationGates[0]!.commands[0]!.selection!.resolved).toEqual([
      `${notesDirectory}/src/tests/notes.test.ts`,
      `${notesDirectory}/src/tests/second.test.ts`,
    ]);
    expect(iterationGates[0]!.verdict).toBe('failed');
    expect(iterationGates[1]!.verdict).toBe('passed');
    expect(iterationGates[1]!.commands[0]!.selection!.resolved).toEqual(iterationGates[0]!.commands[0]!.selection!.resolved);
    // A failing attempt commits the revision it was audited over, and the
    // repair that follows is a revision of its own, over that one.
    expect(iterationGates.map(gate => gate.commit)).toEqual(['revision-01', 'revision-02']);
    expect(iterationGates.map(gate => gate.head)).toEqual([base, 'revision-01']);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);

  test('an owner with no test yet can add its first one; leaving it testless is not-verified', async () => {
    const root = await target({ tests: false, limit: 500 });
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        // An empty required selection is never a pass and is never the
        // engineer's to repair: it returns here, and the architect assigns
        // the evidence as work of its own.
        submit(assign(notes, { goal: 'Write the first test of this module.', completionEvidence: 'The module owns a passing test.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        // Nothing is written, so the selection is still empty.
        submit(completionProposed('I changed the source and wrote no test.')),
        // The first test of the owner, written by the iteration that needs it.
        submit(completionProposed('Added the first test of this module.'),
          write(`${notesDirectory}/src/tests/notes.test.ts`, limitTest)),
      ],
    }, {
      commits: [
        added('revision-01', `${notesDirectory}/src/tests/notes.test.ts`),
        unchanged,
        unchanged,
      ],
    });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    expect(iterationGates[0]!.verdict).toBe('not-verified');
    expect(iterationGates[0]!.commands[0]!.notVerified).toBe('empty-selection');
    expect(iterationGates[0]!.commands[0]!.selection!.resolved).toEqual([]);
    // Nothing ran: a checkpoint that cannot run what it requires runs nothing.
    expect(iterationGates[0]!.commands.every(command => command.outcome === 'not-verified')).toBe(true);
    expect(iterationGates[0]!.next).toBe('return-to-local-architect');
    expect((await readResult(root, runId, 'wi-001', 1)).outcome).toBe('unsuitable');
    // An attempt that runs nothing commits nothing either.
    expect(iterationGates[0]).toMatchObject({ commit: null, audited: null });

    expect(iterationGates.at(-1)!.verdict).toBe('passed');
    expect(iterationGates.at(-1)!.commands[0]!.selection!.resolved).toEqual([`${notesDirectory}/src/tests/notes.test.ts`]);
    expect((await readResult(root, runId, 'wi-001', 2)).outcome).toBe('accepted');
    expect(scripted.revisions()).toEqual(['revision-01']);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);

  test('a discovery that fails never falls back to an earlier list', async () => {
    const root = await target({ limit: 500 });
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [
        submit(completionProposed('Done.')),
        submit(completionProposed('Done again.')),
      ],
    }, { commits: [unchanged, unchanged] }, {
      // The second gate's refresh cannot answer, so its discovery fails.
      inputs: failingRefreshAfter(1),
    });

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    const failedDiscovery = iterationGates.find(gate => gate.commands[0]!.notVerified === 'discovery-error');
    expect(failedDiscovery).toBeDefined();
    expect(failedDiscovery!.verdict).toBe('not-verified');
    expect(failedDiscovery).toMatchObject({ commit: null, audited: null, evidence: null });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.some(event => event.type === 'gate-committing' && event.data.gate === failedDiscovery!.id)).toBe(false);
    // The selection is empty rather than the list the earlier attempt used.
    expect(failedDiscovery!.commands[0]!.selection!.resolved).toEqual([]);
    // An attempt that never reached the commit boundary asked Git for no
    // commit: the boundaries this run reached are the ones scripted here.
    expect(scripted.messages.every(message => !message.includes(failedDiscovery!.id))).toBe(true);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

describe('K5b: an invalid session, a timeout and an exhausted limit keep distinct causes', () => {
  test('a session the implementation can no longer read is reconstructed, and the counters are kept', async () => {
    const root = await target();
    let firstIteration: string | undefined;
    const scripted = gateGit(root, {
      head: base,
      commits: [unchanged, modified('revision-01', `${notesDirectory}/src/notes.ts`), unchanged, unchanged],
    });
    const opened = await openRuns(root, {
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
        engineer: [
          submit(completionProposed('I believe this is done.')),
          submit(completionProposed('Raised the limit.'), edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
        ],
      }),
      inputs: treeInputs(),
      git: scripted.git,
      readinessExecution: directReadinessExecution(),
      checkScript: ({ check, context }) => {
        if (context.checkpoint !== 'iteration') return {};
        firstIteration ??= context.attemptId;
        return context.attemptId === firstIteration && check.kind === 'tests'
          ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' }
          : {};
      },
    });
    cleanups.push(() => opened.service.close());
    // The engineer's session is forgotten between the failing gate and the
    // repair, exactly as an implementation that can no longer read it would.
    const agent = opened.agent!;
    const receipt = await opened.service.execute(startRun('review-notes'));
    const forget = setInterval(() => {
      for (const session of agent.sessions) {
        if (session.spec.role === 'engineer' && session.outcome !== undefined) agent.forget(session.ref);
      }
    }, 10);
    await opened.service.settled('review-notes', receipt.jobId);
    clearInterval(forget);
    const runId = receipt.jobId;

    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');
    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('accepted');
    expect(result.invocations).toHaveLength(2);

    // The second engineer invocation asked to continue and could not: it is
    // recorded as a reconstruction, with the reason, and the repair round it
    // belongs to is unchanged.
    const second = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.invocation(result.invocations[1]!)), 'utf8')) as {
      session: { requested: string; actual: string; degradedReason?: string }; attempt: number;
    };
    expect(second.session.requested).toBe('continued');
    expect(second.session.actual).toBe('fresh');
    expect(second.session.degradedReason).toContain('reconstructed from records');
    expect(second.attempt).toBe(2);
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    expect(iterationGates.map(gate => gate.repairRound)).toEqual([0, 1]);
    expect(result.commit).toBe('revision-01');
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);

  test('a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows', async () => {
    const root = await target();
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
      engineer: [submit(completionProposed('Done.'))],
    }, {
      // Every attempt commits before it runs its checks, and every one of
      // them stands on the tree the run started from: the iteration's two
      // attempts, the work item's two and the run's own two.
      commits: [unchanged, unchanged, unchanged, unchanged, unchanged, unchanged],
    }, {
      checkScript: ({ check }) => check.kind === 'tests'
        ? { outcome: { kind: 'timed-out', timeoutMs: check.command.timeoutMs } }
        : {},
    });

    // The scoped run is the same command at every checkpoint, so the work
    // item's own gate cannot answer either and the run ends with evidence.
    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    const iterationGates = (await gates(root, runId)).filter(gate => gate.checkpoint === 'iteration');
    expect(iterationGates).toHaveLength(2);
    expect(iterationGates.map(gate => gate.verdict)).toEqual(['not-verified', 'not-verified']);
    expect(iterationGates.map(gate => gate.cause)).toEqual(['timeout', 'timeout']);
    expect(iterationGates.map(gate => gate.infrastructureAttempt)).toEqual([0, 1]);
    expect(iterationGates.map(gate => gate.next)).toEqual(['retry-infrastructure', 'exhausted']);
    // A timeout is never repaired by the engineer: the same invocation is the
    // proposer of both attempts.
    expect(new Set(iterationGates.map(gate => gate.proposedBy)).size).toBe(1);

    const result = await readResult(root, runId, 'wi-001', 1);
    expect(result.outcome).toBe('exhausted');
    expect(result.findings.some(finding => finding.includes('timeout'))).toBe(true);
    // Neither attempt accepted anything, so the run's boundary never moved.
    expect(scripted.revisions()).toEqual([]);
    // No external tool was started for any of this.
    expectNoProcesses();
    scripted.assertComplete();
  }, 120_000);
});

/** Inputs whose refresh stops answering after `times`, so a later discovery fails. */
function failingRefreshAfter(times: number) {
  const base = treeInputs();
  let seen = 0;
  return {
    ...base,
    refresh: async (projectRoot: string) => {
      seen += 1;
      return seen > times ? null : base.refresh(projectRoot);
    },
  };
}
