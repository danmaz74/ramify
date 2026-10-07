import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { CheckFindingEvent, CheckFindingSummary } from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import type { RunEvent, RunEventOf } from '../run/log.js';
import { runLayout } from '../run/records.js';
import type { RunService } from '../run/service.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { treeCandidates, type ScriptedCandidates } from './helpers/candidates.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { accepted, added, answeredGit, modified, scenariosCommitted, unchanged, type CommitResponse } from './helpers/contracts-git.js';
import { passingScenarioSummary, type DirectCheckScript, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import { freeze, onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, startRun, until } from './helpers/runs.js';
import { consumerStub, consumerTest } from './helpers/contracts.js';

/*
 * The factual scenario witness through driven runs (Plan 12 iteration 6):
 * a tracked scenario that fails more than one gate of its work item is
 * promoted in the gate's own line, a later passing gate of the same
 * scenario on a changed candidate fixes it, a pass on the tree that failed
 * fixes nothing, and every gate keeps the verdict its checks gave.
 *
 * Agents are scripted, Git's answers and the audited trees are scripted,
 * and the scenario runner is the direct executor, so no process starts.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const finalSubject = `final verification of plan "${plan}"`;
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const feature = `${notesDirectory}/src/tests/features/${plan}/review-note.feature`;
const steps = `${notesDirectory}/src/tests/steps/review-note.steps.ts`;
const stepFile = [
  "import { Given, When, Then } from '@cucumber/cucumber';",
  '',
  "Given('the project as the plan finds it', () => {});",
  "When(/^the person uses (.+)$/, () => {});",
  "Then(/^the outcome (.+) promises is shown$/, () => {});",
  '',
].join('\n');

async function fixture(): Promise<string> {
  const copy = await copyFixture();
  cleanups.push(copy.remove);
  await addModule(copy.root, notesDirectory, 'notes', { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') });
  await installMiniRunner(copy.root);
  return copy.root;
}

interface RunOptions {
  readonly checkScript: DirectCheckScript;
  readonly candidates?: (source: ScriptedCandidates) => void;
  readonly detached?: boolean;
  /** The local architect's reconciliation forks, by reconciliation ID; a fork with none scripted ends without a submission. */
  readonly reconcilers?: Readonly<Record<string, readonly ScriptStep[]>>;
}

/** A run of one work item on the notes module, with Git and the audited trees answered. */
async function run(root: string, script: Parameters<typeof byRole>[0], commits: readonly CommitResponse[], options: RunOptions) {
  const hasFinal = commits.some(commit => commit.subject === finalSubject);
  const before = commits.slice(0, -1).flatMap(commit => commit.commit ?? []).at(-1) ?? 'scenarios-00';
  const final = hasFinal ? finalCandidate(root, before, commits.at(-1)?.commit ?? before) : null;
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted(plan, 'scenarios-00'), ...commits],
    ...(final === null ? {} : { previews: final.previews }) });
  const baseCandidates = treeCandidates(root);
  options.candidates?.(baseCandidates);
  const candidates: ScriptedCandidates = final === null ? baseCandidates : {
    ...baseCandidates,
    async commitTree(project: string, commit: string) {
      const answer = await baseCandidates.commitTree(project, commit);
      return commit === before ? final.previews[0]!.tree : answer;
    },
  };
  const roles = byRole(script) as (spec: SessionSpec) => readonly ScriptStep[];
  const opened = await openRuns(root, {
    script: (spec: SessionSpec): readonly ScriptStep[] => {
      const reconciliation = /^# Reconciliation (\S+)/u.exec(spec.prompt)?.[1];
      if (spec.role !== 'local-architect' || reconciliation === undefined) return roles(spec);
      return options.reconcilers?.[reconciliation] ?? [{ kind: 'end', message: `no reconciliation scripted for ${reconciliation}` }];
    },
    inputs: treeInputs(),
    git,
    candidates,

    checkScript: options.checkScript,
  });
  if (options.detached !== true) cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  if (options.detached !== true) await opened.service.settled(plan, receipt.jobId);
  return { ...opened, git, candidates, runId: receipt.jobId };
}

/** A scenario check whose run reached sc-001 and failed it, with the project's own scenarios as given. */
function failing(check: PlannedCheck, untrackedFailed = 0): DirectCheckStep {
  const passing = passingScenarioSummary(check);
  return {
    outcome: { kind: 'completed', exitCode: 1 },
    scenarios: {
      ...passing,
      runs: passing.runs.map(entry => ({ ...entry, exit: 1 })),
      scenarios: passing.scenarios.map(result => (result.id !== 'sc-001' ? result : {
        ...result, status: 'failed' as const, failure: { step: 'Then the outcome review-note promises is shown', message: 'expected the note, got nothing' },
      })),
      untracked: { passed: 0, skipped: 0, failed: untrackedFailed },
      failures: [
        'sc-001 failed: Then the outcome review-note promises is shown: expected the note, got nothing',
        ...(untrackedFailed === 0 ? [] : [`${untrackedFailed} of the project's own scenarios in ${notes} did not pass`]),
      ],
    },
  };
}

/** Fails the iteration gates' scenario check the given number of times, then passes every check. */
function failingIterationGates(times: number, untrackedFailed = 0): DirectCheckScript {
  let failed = 0;
  return ({ check, context }) => {
    if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration' || failed >= times) return {};
    failed += 1;
    return failing(check, failed === 1 ? untrackedFailed : 0);
  };
}

const gateLines = (log: readonly RunEvent[]) => log.filter((event): event is RunEventOf<'gate-attempted'> => event.type === 'gate-attempted');

async function gateOf(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

/** Each iteration gate's line: its gate, verdict, carried event types and notes. */
async function iterationGates(root: string, runId: string) {
  const lines = gateLines(await runEventsOnDisk(root, plan, runId)).filter(line => line.data.checkpoint === 'iteration');
  return lines.map(line => ({
    gate: line.data.gate,
    verdict: line.data.verdict,
    carried: (line.data.checkFindings ?? []).map(event => event.type),
    findings: line.data.scenarioFindings,
  }));
}

function listOf(service: RunService, runId: string): CheckFindingSummary[] {
  const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', limit: 100 });
  if (list === undefined || !list.ok || list.view.kind !== 'list') throw new Error('no list');
  return [...list.view.items];
}

/** The obligation events naming a scenario, as `bound sc` and `reported sc judgment` lines. */
const scenarioObligations = (log: readonly RunEvent[]) => log.flatMap(event => (event.type === 'obligation-bound' ? [`bound ${event.data.id}`]
  : event.type === 'obligation-reported' ? [`reported ${event.data.id} ${event.data.judgment}`] : []));

/** The index of the first event of a type whose data matches. */
const at = (log: readonly RunEvent[], type: string, match: (data: Record<string, unknown>) => boolean = () => true) =>
  log.findIndex(event => event.type === type && match(event.data as Record<string, unknown>));

const reportsOf = (events: readonly CheckFindingEvent[]) => events.flatMap(event => (event.type === 'check-finding-opened' || event.type === 'check-finding-reported' ? [event.data.report] : []));

describe('CF13: a repeated failure is promoted and a passing gate of the same scenario fixes it', () => {
  test('two failures across repair rounds make one reproduced CheckFinding in the second gate\'s line, the third gate fixes it, and every verdict is the checks\' own', async () => {
    const root = await fixture();
    const { service, runId, candidates, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, { obligations: ['sc-001'] }, outline())), submit(requestCompletion())],
      engineer: [
        submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(steps, stepFile)),
        submit(completionProposed('Bound again.', { bindings: [{ id: 'sc-001' }] }), write(steps, `${stepFile}// 2\n`)),
        submit(completionProposed('Bound for real.', { bindings: [{ id: 'sc-001' }] }), write(steps, `${stepFile}// 3\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      accepted('wi-001.i01', 'revision-02', modified(steps)),
      accepted('wi-001.i01', 'revision-03', modified(steps)),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], { checkScript: failingIterationGates(2, 1) });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const gates = await iterationGates(root, runId);
    // The verdicts are the checks' own: failed twice, then passed.
    expect(gates.map(gate => gate.verdict)).toEqual(['failed', 'failed', 'passed']);
    const [first, second, third] = gates;
    // The first failure stays on its attempt: the immediate repair answers it, and no tree is read for it.
    expect(first).toMatchObject({ carried: [], findings: undefined });
    expect((await gateOf(root, runId, first!.gate)).commands.find(command => command.kind === 'scenarios')!.scenarios!.untracked).toEqual({ passed: 0, skipped: 0, failed: 1 });
    // The second failure promotes it, with both failures as reports, in the gate's own line.
    expect(second).toMatchObject({ carried: ['check-finding-opened', 'check-finding-reported'], findings: undefined });
    // The passing gate fixes it by check.
    expect(third).toMatchObject({ carried: ['check-finding-decided'], findings: undefined });
    expect(candidates.calls).toEqual([
      'commitTree revision-02', 'commitTree revision-01',
      'commitTree revision-03', 'commitTree revision-01', 'commitTree revision-02', 'commitTree revision-03',
    ]);

    const log = await runEventsOnDisk(root, plan, runId);
    const promoted = gateLines(log).find(line => line.data.gate === second!.gate)!;
    expect(reportsOf(promoted.data.checkFindings!).map(report => [report.attempt, report.source.id, report.producer, report.issueKey, report.credibility])).toEqual([
      [first!.gate, 'tree-of-revision-01', 'check:scenario', 'scenario:sc-001', 'objective'],
      [second!.gate, 'tree-of-revision-02', 'check:scenario', 'scenario:sc-001', 'objective'],
    ]);
    const fixed = gateLines(log).find(line => line.data.gate === third!.gate)!.data.checkFindings![0]!;
    expect(fixed).toMatchObject({
      type: 'check-finding-decided',
      data: {
        checkFinding: 'cf-0001',
        decision: {
          actor: { kind: 'harness' },
          decision: {
            action: 'fix-by-check',
            candidate: { kind: 'tree', id: 'a'.repeat(40) },
            witness: { attempt: third!.gate, source: { kind: 'tree', id: 'a'.repeat(40) }, coverage: 'complete', outcome: 'passed', obligation: { subject: 'scenario:sc-001', revision: 1 } },
          },
        },
      },
    });

    // One CheckFinding: the project's own failed scenario was counted and never identified.
    expect(listOf(service, runId)).toEqual([expect.objectContaining({
      id: 'cf-0001', standing: 'closed', reason: 'fixed-by-check', risk: 'high', credibility: 'objective-reproduced',
      modules: [notes], producers: ['check:scenario'], reports: 2, decisions: 1,
      verification: expect.objectContaining({ kind: 'check', required: true }),
    })]);
    // It was closed before the completion request, so no reconciliation was needed.
    expect(log.filter(event => event.type.startsWith('reconciliation-'))).toEqual([]);
    // The passing gate reported nothing: the scenario stayed bound until its architect's report.
    expect(scenarioObligations(log)).toEqual(['bound sc-001', 'bound sc-001', 'bound sc-001', 'reported sc-001 done']);
    expect(at(log, 'obligation-reported')).toBeGreaterThan(at(log, 'gate-passed', data => data.gate === third!.gate));
    git.assertAnswered();
  }, 120_000);
});

describe('CF13: a pass on the tree that failed is intermittent evidence, and the required gate keeps its own verdict', () => {
  test('failed twice and passed on one unchanged tree: the gate passes and the scenario stays bound, the CheckFinding stays open with its classification, and a later changed candidate fixes it', async () => {
    const root = await fixture();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit(assign(notes, { goal: 'Make the note scenario robust.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(steps, stepFile)),
        submit(completionProposed('Nothing to change, it seems.', { bindings: [{ id: 'sc-001' }] })),
        submit(completionProposed('Still nothing to change.', { bindings: [{ id: 'sc-001' }] })),
        submit(completionProposed('The step waits for the note.'), write(steps, `${stepFile}// waits\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001.i01'),
      unchanged('wi-001.i01'),
      accepted('wi-001.i02', 'revision-02', modified(steps)),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], { checkScript: failingIterationGates(2) });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const gates = await iterationGates(root, runId);
    expect(gates.map(gate => gate.verdict)).toEqual(['failed', 'failed', 'passed', 'passed']);
    const [, second, third, fourth] = gates;
    expect(second!.carried).toEqual(['check-finding-opened', 'check-finding-reported']);
    // The third attempt ran on the tree of both failures: the required gate
    // passes, the witness is refused, and no state moves.
    expect(third).toEqual({
      gate: third!.gate, verdict: 'passed', carried: [],
      findings: { refused: null, notes: [{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'failure-source', classification: 'inconclusive' }] },
    });
    const log = await runEventsOnDisk(root, plan, runId);
    expect(scenarioObligations(log)).toEqual(['bound sc-001', 'bound sc-001', 'bound sc-001', 'reported sc-001 done']);
    expect(at(log, 'obligation-reported')).toBeGreaterThan(at(log, 'gate-passed', data => data.gate === fourth!.gate));
    expect(log.find(event => event.type === 'iteration-closed' && (event.data as { iteration: string }).iteration === 'wi-001.i01')!.data)
      .toMatchObject({ outcome: 'accepted', gate: third!.gate });
    // The next iteration's gate passes it on a changed candidate, which fixes it.
    expect(fourth!.carried).toEqual(['check-finding-decided']);
    const [summary] = listOf(service, runId);
    expect(summary).toMatchObject({ id: 'cf-0001', standing: 'closed', reason: 'fixed-by-check', credibility: 'objective-reproduced', reports: 2 });
    const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
    if (detail === undefined || !detail.ok || detail.view.kind !== 'detail') throw new Error('no detail');
    // Both failures were on one tree; the failed executions stay in the history.
    expect(detail.view.reports.items.map(report => report.source.id)).toEqual(['tree-of-revision-01', 'tree-of-revision-01']);
    expect(detail.view.decisions.items.map(decision => [decision.decision.action, decision.source.id])).toEqual([['fix-by-check', 'a'.repeat(40)]]);
    git.assertAnswered();
  }, 120_000);
});

describe('CF02 and CF13: an open scenario CheckFinding reaches the work item\'s reconciliation', () => {
  test('the architect cannot waive it and plans a repair; the correction\'s gate fixes it by check on a changed tree; the next completion needs no round', async () => {
    const root = await fixture();
    const disposition = (action: Record<string, unknown>) => ({
      relations: [],
      dispositions: [{ checkFinding: 'cf-0001', rationale: 'The note scenario failed twice and passed once on one tree.', communication: { mode: 'quiet' }, action }],
      next: action['action'] === 'repair' ? { kind: 'correct', goal: 'Make the note scenario pass for a reason.' } : { kind: 'complete' },
      brief: 'The scenario failure was assessed.',
    });
    const { service, runId, agent, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit(requestCompletion()),
        submit(assign(notes, { goal: 'Make the note scenario pass for a reason.', kind: 'repair' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(steps, stepFile)),
        submit(completionProposed('Nothing to change, it seems.', { bindings: [{ id: 'sc-001' }] })),
        submit(completionProposed('Still nothing to change.', { bindings: [{ id: 'sc-001' }] })),
        submit(completionProposed('The step waits for the note.'), write(steps, `${stepFile}// waits\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001.i01'),
      unchanged('wi-001.i01'),
      accepted('wi-001.i02', 'revision-02', modified(steps)),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], {
      checkScript: failingIterationGates(2),
      reconcilers: {
        // A waiver of a required scenario is refused and returned to the fork, which then plans a repair.
        'wi-001.rc01': [{ kind: 'submit', input: disposition({ action: 'waive', uncertainty: 'It passed once.' }) }, { kind: 'submit', input: disposition({ action: 'repair' }) }],
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await runEventsOnDisk(root, plan, runId);
    // The promoted CheckFinding was open at the completion request, so a round assessed it.
    expect(log.filter(event => event.type === 'reconciliation-started').map(event => (event.data as { reconciliation: string }).reconciliation)).toEqual(['wi-001.rc01']);
    const fork = agent!.sessions.find(session => session.spec.prompt.startsWith('# Reconciliation wi-001.rc01'))!;
    expect(JSON.stringify(fork.verdicts[0])).toContain('required-obligation');
    expect(fork.verdicts[1]).toMatchObject({ accepted: true });
    const assessed = log.find(event => event.type === 'reconciliation-assessed')!;
    expect(assessed.data).toMatchObject({ next: 'correct' });
    // The correction's gate passed the same scenario on a changed tree: a factual fix, not an assessment.
    const gates = await iterationGates(root, runId);
    expect(gates.map(gate => gate.verdict)).toEqual(['failed', 'failed', 'passed', 'passed']);
    expect(gates[3]!.carried).toEqual(['check-finding-decided']);
    const [summary] = listOf(service, runId);
    expect(summary).toMatchObject({ id: 'cf-0001', standing: 'closed', reason: 'fixed-by-check', verification: expect.objectContaining({ kind: 'check', required: true }) });
    const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
    if (detail === undefined || !detail.ok || detail.view.kind !== 'detail') throw new Error('no detail');
    expect(detail.view.decisions.items.map(decision => decision.decision.action)).toEqual(['plan-repair', 'fix-by-check']);
    // The second completion request found nothing to assess.
    expect(log.filter(event => event.type === 'reconciliation-started')).toHaveLength(1);
    expect(log.find(event => event.type === 'work-item-completed')!.data).toEqual({ workItem: 'wi-001', gate: expect.any(String) });
    git.assertAnswered();
  }, 120_000);
});

describe('the gate is committed when its CheckFinding part cannot be', () => {
  test('an audited tree that cannot be read refuses the part with its reason on the gate\'s line; the verdict and the run go on', async () => {
    const root = await fixture();
    const { service, runId, warnings } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, { obligations: ['sc-001'] }, outline())), submit(requestCompletion())],
      engineer: [
        submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(steps, stepFile)),
        submit(completionProposed('Bound again.', { bindings: [{ id: 'sc-001' }] }), write(steps, `${stepFile}// 2\n`)),
        submit(completionProposed('Bound for real.', { bindings: [{ id: 'sc-001' }] }), write(steps, `${stepFile}// 3\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      accepted('wi-001.i01', 'revision-02', modified(steps)),
      accepted('wi-001.i01', 'revision-03', modified(steps)),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], { checkScript: failingIterationGates(2), candidates: source => source.fail('commitTree', 'revision-01') });

    expect(onlyRun(service, plan).state).toBe('completed');
    const gates = await iterationGates(root, runId);
    expect(gates.map(gate => gate.verdict)).toEqual(['failed', 'failed', 'passed']);
    expect(gates[1]).toMatchObject({
      carried: [],
      findings: { refused: { reason: 'source-unavailable', message: expect.stringContaining('revision-01') }, notes: [] },
    });
    expect(gates[2]).toMatchObject({ carried: [], findings: undefined });
    expect(listOf(service, runId)).toEqual([]);
    expect(warnings.some(warning => warning.includes('without its CheckFinding part'))).toBe(true);
  }, 120_000);
});

describe('a crash inside the promoting gate', () => {
  test('recovery audits the commit again and commits the gate with its CheckFinding part once', async () => {
    const root = await fixture();
    let frozen = false;
    let iterationScenarios = 0;
    const { runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, { obligations: ['sc-001'] }, outline()))],
      engineer: [
        submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(steps, stepFile)),
        submit(completionProposed('Bound again.', { bindings: [{ id: 'sc-001' }] }), write(steps, `${stepFile}// 2\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      accepted('wi-001.i01', 'revision-02', modified(steps)),
    ], {
      detached: true,
      // The second gate's audit never answers: the commit is made and its attempt is not written.
      checkScript: async ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration') return {};
        iterationScenarios += 1;
        if (iterationScenarios === 1) return failing(check);
        frozen = true;
        return freeze().then(() => failing(check));
      },
    });
    await until(() => frozen, 60_000);
    await staleCrashLock(root);

    const recoveryGit = mockGit({
      async findCommitByTrailers() { return 'revision-02'; },
      async currentHead() { return 'revision-02'; },
    });
    const reopened = await openRuns(root, {
      git: recoveryGit,
      inputs: treeInputs(),

      candidates: treeCandidates(root),
      checkScript: ({ check }) => (check.kind === 'scenarios' ? failing(check) : {}),
    });
    cleanups.push(() => reopened.service.close());
    expect(reopened.recovery.effects).toEqual([`${plan}/${runId}: the commit and audit of gate ga-0003`]);
    expect(recoveryGit.commitAccepted).not.toHaveBeenCalled();

    const log = await runEventsOnDisk(root, plan, runId);
    const lines = gateLines(log).filter(line => line.data.checkpoint === 'iteration');
    expect(lines.map(line => [line.data.gate, line.data.verdict, (line.data.checkFindings ?? []).map(event => event.type)])).toEqual([
      ['ga-0002', 'failed', []],
      ['ga-0003', 'failed', ['check-finding-opened', 'check-finding-reported']],
    ]);
    expect(reportsOf(lines[1]!.data.checkFindings!).map(report => [report.attempt, report.source.id])).toEqual([
      ['ga-0002', 'tree-of-revision-01'], ['ga-0003', 'tree-of-revision-02'],
    ]);
    expect(log.at(-1)!.type).toBe('job-interrupted');
    const list = reopened.service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all', limit: 10 });
    expect(list !== undefined && list.ok && list.view.kind === 'list' ? list.view.items.map(item => [item.id, item.standing, item.reports]) : []).toEqual([['cf-0001', 'open', 2]]);
  }, 120_000);
});
