import { describe, expect, test } from 'vitest';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { emptyCheckFindingState, replayCheckFindingEvents } from '../../subs/check-findings/src/replay.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import type {
  CheckFindingCommand, CheckFindingEntry, CheckFindingEvent, CheckFindingState,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { GateAttempt, GateCommandRecord, ScenarioCheckResult, ScenarioCheckSummary } from '../checks/records.js';
import {
  classifyScenarioAttempts, coversBreadth, planScenarioFindings, scenarioGatesToRead, scenarioObservations,
  type ObservedGate, type ScenarioFacts, type ScenarioGateInputs, type ScenarioObservation,
} from '../checks/scenario-findings.js';

/*
 * The scenario-check producer adapter (Plan 12 iteration 6, appendix §7),
 * over literal gate attempts and the real CheckFinding child: what a gate's
 * scenario check establishes about each tracked scenario, when a failure is
 * promoted, and when a passing gate is a witness that fixes one. No run,
 * ledger or process is involved.
 */

const notes = 'collection-review/workspace/reviews/notes';
const tags = 'collection-review/workspace/reviews/tags';
const noteFile = 'subs/workspace/subs/reviews/subs/notes/src/tests/features/review-notes/review-note.feature';
const tagFile = 'subs/workspace/subs/reviews/subs/tags/src/tests/features/review-notes/review-tags.feature';
const tracked: ScenarioFacts[] = [
  { id: 'sc-001', owner: notes, file: noteFile },
  { id: 'sc-002', owner: tags, file: tagFile },
];
const argv = ['node_modules/.bin/cucumber-js'];

type Status = ScenarioCheckResult['status'];
const result = (id: string, status: Status, extra: Partial<ScenarioCheckResult> = {}): ScenarioCheckResult => ({
  id,
  run: id === 'sc-002' ? tags : notes,
  status,
  file: id === 'sc-002' ? tagFile : noteFile,
  line: 3,
  binding: [],
  undefined: [],
  ...(status === 'passed' || status === 'skipped' ? {} : { failure: { step: 'Then the note is shown', message: 'expected the note, got nothing' } }),
  ...extra,
});

interface GateOptions {
  readonly id: string;
  readonly results: readonly ScenarioCheckResult[];
  readonly selection?: ScenarioCheckSummary['selection'];
  readonly mode?: ScenarioCheckSummary['mode'];
  readonly dryRun?: boolean;
  readonly verdict?: GateAttempt['verdict'];
  readonly runs?: ScenarioCheckSummary['runs'];
  readonly command?: Partial<GateCommandRecord>;
  readonly untracked?: ScenarioCheckSummary['untracked'];
  readonly guarded?: GateAttempt['guardedChanges'];
  readonly scenarioCommand?: boolean;
}

/** One committing gate attempt of wi-001 with a scenario check of these results. */
function gate(options: GateOptions): GateAttempt {
  const failed = options.results.some(entry => entry.status !== 'passed');
  const verdict = options.verdict ?? (failed ? 'failed' : 'passed');
  const summary: ScenarioCheckSummary = {
    mode: options.mode ?? 'quick',
    selection: options.selection ?? { kind: 'identity', scenarios: ['sc-001'] },
    dryRun: options.dryRun ?? false,
    excluded: 0,
    setup: null,
    teardown: null,
    runs: options.runs ?? [
      { module: notes, exit: failed ? 1 : 0, profile: 'scenarios/notes.profile.mjs', messages: 'scenarios/notes.ndjson' },
      { module: tags, exit: 0, profile: 'scenarios/tags.profile.mjs', messages: 'scenarios/tags.ndjson' },
    ],
    scenarios: [...options.results],
    untracked: options.untracked ?? { passed: 0, skipped: 0, failed: 0 },
    failures: failed ? ['a tracked scenario did not pass'] : [],
  };
  const command: GateCommandRecord = {
    kind: 'scenarios',
    command: { argv, cwd: '/project', env: [], envAdditions: {}, timeoutMs: 600_000 },
    startedAt: '2026-09-24T12:00:00.000Z',
    elapsedMs: 10,
    exitCode: failed ? 1 : 0,
    outcome: verdict === 'not-verified' ? 'not-verified' : failed ? 'failed' : 'passed',
    runnerError: null,
    output: { path: 'out', bytes: 0, truncated: false, tail: '' },
    scenarios: summary,
    ...options.command,
  };
  return {
    schema: 'ramify-agent.gate-attempt/3',
    id: options.id,
    checkpoint: 'iteration',
    subject: { workItem: 'wi-001', iteration: 'wi-001.i01' },
    proposedBy: null,
    repairRound: 0,
    infrastructureAttempt: 0,
    head: 'revision-00',
    commit: null,
    audited: `commit-${options.id}`,
    evidence: null,
    guardedChanges: options.guarded ?? [],
    commands: options.scenarioCommand === false ? [] : [command],
    verdict,
    cause: verdict === 'passed' ? null : 'in-scope',
    next: verdict === 'passed' ? 'accept' : 'repair',
  };
}

const observed = (attempt: GateAttempt, tree: string | null): ObservedGate => ({
  gate: attempt.id,
  tree,
  observations: scenarioObservations(attempt, tracked),
  record: `gates/${attempt.id}.json`,
  output: `gates/${attempt.id}`,
});

/** What a gate's completion decides from, with its earlier attempts. */
function inputs(current: GateAttempt, tree: string, earlier: ReadonlyArray<readonly [GateAttempt, string | null]> = []): ScenarioGateInputs {
  return {
    workItem: 'wi-001',
    verdict: current.verdict,
    changedFiles: current.guardedChanges.map(change => change.path),
    current: { ...observed(current, tree), tree },
    earlier: earlier.map(([attempt, at]) => observed(attempt, at)),
    tracked,
  };
}

/** Decides a plan's commands in order, as the transition will. */
function apply(state: CheckFindingState, commands: readonly CheckFindingCommand[]): { state: CheckFindingState; events: CheckFindingEvent[] } {
  const events: CheckFindingEvent[] = [];
  let current = state;
  for (const command of commands) {
    const change = decideCheckFindingChange(current, command);
    if (!change.ok) throw new Error(`refused: ${change.rejection.code} ${change.rejection.message}`);
    const replayed = replayCheckFindingEvents([...change.events], current);
    if (!replayed.ok) throw new Error('the events do not replay');
    current = replayed.state;
    events.push(...change.events);
  }
  return { state: current, events };
}

const entryOf = (state: CheckFindingState, id = 'cf-0001'): CheckFindingEntry => state.findings.get(id)!;

/** A state holding cf-0001 for sc-001: promoted from two failures of ga-0001 and ga-0002. */
function promoted(): { state: CheckFindingState; failures: Array<readonly [GateAttempt, string]> } {
  const failures: Array<readonly [GateAttempt, string]> = [
    [gate({ id: 'ga-0001', results: [result('sc-001', 'failed')] }), 'tree-01'],
    [gate({ id: 'ga-0002', results: [result('sc-001', 'failed')] }), 'tree-02'],
  ];
  const plan = planScenarioFindings(emptyCheckFindingState(), inputs(failures[1]![0], 'tree-02', [failures[0]!]));
  return { state: apply(emptyCheckFindingState(), plan.commands).state, failures };
}

describe('what a gate\'s scenario check establishes', () => {
  test('an executed scenario is complete, a gap in its stream partial, and what it failed is a failure only where a finished step observed it', () => {
    const attempt = gate({
      id: 'ga-0001',
      selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002'] },
      results: [result('sc-001', 'passed'), result('sc-002', 'failed')],
    });
    const [one, two] = scenarioObservations(attempt, tracked);
    expect(one).toMatchObject({ scenario: 'sc-001', coverage: 'complete', outcome: 'passed', file: noteFile, line: 3, run: notes, messages: 'scenarios/notes.ndjson' });
    expect(one!.selection).toMatch(new RegExp(`^quick/${notes}@[0-9a-f]{16}$`, 'u'));
    // Each run's breadth is its own module's identity selection.
    expect(one!.breadth).toEqual({ kind: 'identity', scenarios: ['sc-001'] });
    expect(two).toMatchObject({ scenario: 'sc-002', coverage: 'complete', outcome: 'failed', breadth: { kind: 'identity', scenarios: ['sc-002'] } });
    expect(two!.detail).toBe('failed at "Then the note is shown": expected the note, got nothing');

    const gaps = scenarioObservations(gate({
      id: 'ga-0002',
      selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002'] },
      results: [
        result('sc-001', 'failed', { unfinished: { pickles: 0, steps: 1, observed: 'passed' } }),
        result('sc-002', 'failed', { unfinished: { pickles: 1, steps: 0, observed: 'failed' } }),
      ],
    }), tracked);
    expect(gaps.map(entry => [entry.scenario, entry.coverage, entry.outcome])).toEqual([['sc-001', 'partial', 'inconclusive'], ['sc-002', 'partial', 'failed']]);
    // A scenario whose every step was skipped ran no assertion.
    expect(scenarioObservations(gate({ id: 'ga-0003', results: [result('sc-001', 'skipped')] }), tracked)[0]).toMatchObject({ coverage: 'partial', outcome: 'inconclusive' });
  });

  test('a scenario selected by identity with no result was not run: a timed-out run, a launch error or a missing stream', () => {
    const timedOut = gate({
      id: 'ga-0001',
      results: [],
      verdict: 'not-verified',
      runs: [{ module: notes, exit: null, profile: 'p', messages: 'm' }],
      command: { outcome: 'not-verified', notVerified: 'timeout', exitCode: null },
    });
    expect(scenarioObservations(timedOut, tracked)).toEqual([expect.objectContaining({
      scenario: 'sc-001', coverage: 'not-run', outcome: 'inconclusive', file: null, messages: null,
      detail: 'selected and not executed: the scenario check was not verified (timeout)',
    })]);
    const launch = gate({
      id: 'ga-0002', results: [], verdict: 'not-verified',
      runs: [{ module: notes, exit: null, profile: 'p', messages: 'm' }],
      command: { outcome: 'not-verified', notVerified: 'runner-error', exitCode: null, runnerError: { kind: 'spawn', message: 'ENOENT' } },
    });
    expect(scenarioObservations(launch, tracked)[0]).toMatchObject({ coverage: 'not-run', outcome: 'inconclusive', detail: expect.stringContaining('runner-error') });
    // The run exited, and its stream holds nothing for the scenario.
    const missing = gate({ id: 'ga-0003', results: [], verdict: 'failed', runs: [{ module: notes, exit: 1, profile: 'p', messages: 'm' }] });
    expect(scenarioObservations(missing, tracked)[0]).toMatchObject({ coverage: 'not-run', outcome: 'inconclusive', detail: 'selected and not executed: the run\'s stream holds no result for it' });
  });

  test('a dry run, an unselected scenario of a broad run and the project\'s own scenarios are not observed', () => {
    expect(scenarioObservations(gate({ id: 'ga-0001', dryRun: true, results: [result('sc-001', 'failed')] }), tracked)).toEqual([]);
    // All-untagged: sc-002 has no result, so nothing says it was selected.
    const broad = gate({ id: 'ga-0002', selection: { kind: 'all-untagged' }, results: [result('sc-001', 'passed')] });
    expect(scenarioObservations(broad, tracked).map(entry => [entry.scenario, entry.breadth])).toEqual([['sc-001', { kind: 'all-untagged' }]]);
    // Two of the project's own scenarios failed: they are counted on the attempt and never identified.
    const own = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')], untracked: { passed: 0, skipped: 0, failed: 2 }, verdict: 'failed' });
    expect(scenarioObservations(own, tracked).map(entry => entry.scenario)).toEqual(['sc-001']);
    // A gate with no scenario check observes nothing.
    expect(scenarioObservations(gate({ id: 'ga-0004', results: [], scenarioCommand: false }), tracked)).toEqual([]);
  });

  test('a run covers a failure\'s when it selected at least what the failure\'s run did', () => {
    const identity = (...scenarios: string[]) => ({ kind: 'identity' as const, scenarios });
    expect(coversBreadth(identity('sc-001', 'sc-003'), identity('sc-001'))).toBe(true);
    expect(coversBreadth(identity('sc-001'), identity('sc-001', 'sc-003'))).toBe(false);
    expect(coversBreadth({ kind: 'all-untagged' }, identity('sc-001'))).toBe(true);
    expect(coversBreadth(identity('sc-001'), { kind: 'all-untagged' })).toBe(false);
    expect(coversBreadth({ kind: 'all-untagged' }, { kind: 'all' })).toBe(false);
    expect(coversBreadth({ kind: 'all' }, { kind: 'all-untagged' })).toBe(true);
  });
});

describe('classification of attempts on one source', () => {
  test('two passes after a failure are provisionally intermittent; two failures reproduced; a runner error or a single pass inconclusive', () => {
    expect(classifyScenarioAttempts(['failed', 'passed', 'passed'])).toEqual({ classification: 'intermittent', provisional: true, passed: 2, failed: 1, inconclusive: 0 });
    expect(classifyScenarioAttempts(['failed', 'failed'])).toMatchObject({ classification: 'reproduced', provisional: false });
    expect(classifyScenarioAttempts(['failed', 'inconclusive'])).toMatchObject({ classification: 'inconclusive', inconclusive: 1 });
    expect(classifyScenarioAttempts(['failed', 'passed'])).toMatchObject({ classification: 'inconclusive' });
    expect(classifyScenarioAttempts(['failed', 'failed', 'inconclusive', 'passed', 'passed'])).toMatchObject({ classification: 'intermittent', provisional: true });
  });
});

describe('promotion: only a failure that needs continuity', () => {
  test('a first failure stays on its gate attempt and reads no tree', () => {
    const first = gate({ id: 'ga-0001', results: [result('sc-001', 'failed')] });
    expect(planScenarioFindings(emptyCheckFindingState(), inputs(first, 'tree-01'))).toEqual({ commands: [], notes: [] });
    expect(scenarioGatesToRead(emptyCheckFindingState(), 'wi-001', 'failed', scenarioObservations(first, tracked), [])).toBeNull();
  });

  test('a second failure of the same work item reports both, oldest first: one reproduced, required, high-risk CheckFinding', () => {
    const one = gate({ id: 'ga-0001', results: [result('sc-001', 'failed')] });
    const two = gate({ id: 'ga-0002', results: [result('sc-001', 'failed')] });
    const earlier = [{ gate: one.id, observations: scenarioObservations(one, tracked) }];
    expect(scenarioGatesToRead(emptyCheckFindingState(), 'wi-001', 'failed', scenarioObservations(two, tracked), earlier)).toEqual(['ga-0001']);

    const plan = planScenarioFindings(emptyCheckFindingState(), inputs(two, 'tree-02', [[one, 'tree-01']]));
    expect(plan.notes).toEqual([]);
    const { state, events } = apply(emptyCheckFindingState(), plan.commands);
    expect(events.map(event => event.type)).toEqual(['check-finding-opened', 'check-finding-reported']);
    const entry = entryOf(state);
    expect(entry).toMatchObject({
      standing: 'open', reason: 'new', risk: 'high', credibility: 'objective-reproduced', modules: [notes],
      verification: { kind: 'check', producer: 'check:scenario', obligation: { subject: 'scenario:sc-001', revision: 1 }, required: true },
    });
    expect(entry.reports.map(report => [report.attempt, report.reportKey, report.issueKey, report.source.id, report.judgment])).toEqual([
      ['ga-0001', 'scenario:sc-001', 'scenario:sc-001', 'tree-01', null],
      ['ga-0002', 'scenario:sc-001', 'scenario:sc-001', 'tree-02', null],
    ]);
    expect(entry.reports[0]!.observation).toMatchObject({
      kind: 'check-failed',
      evidence: [{ kind: 'gate-attempt', ref: 'gates/ga-0001.json', hash: null }, { kind: 'message-stream', ref: 'gates/ga-0001/scenarios/notes.ndjson', hash: null }],
      locations: [{ path: noteFile, startLine: 3, endLine: null }],
    });
    expect(entry.reports[0]!.observation.summary).toContain('Scenario sc-001 failed gate ga-0001');

    // A third failure attaches to it: the key names the one CheckFinding, and the earlier failures are not reported again.
    const three = gate({ id: 'ga-0003', results: [result('sc-001', 'failed')] });
    const again = planScenarioFindings(state, inputs(three, 'tree-03', [[one, null], [two, null]]));
    expect(apply(state, again.commands).events.map(event => event.type)).toEqual(['check-finding-reported']);
    expect(scenarioGatesToRead(state, 'wi-001', 'failed', scenarioObservations(three, tracked), [])).toEqual([]);
  });

  test('another work item\'s failures, a different scenario\'s and an inconclusive run never make a failure repeated', () => {
    const one = gate({ id: 'ga-0001', results: [result('sc-002', 'failed')], selection: { kind: 'identity', scenarios: ['sc-002'] } });
    const timedOut = gate({ id: 'ga-0002', results: [], verdict: 'not-verified', runs: [{ module: notes, exit: null, profile: 'p', messages: 'm' }], command: { outcome: 'not-verified', notVerified: 'timeout' } });
    const now = gate({ id: 'ga-0003', results: [result('sc-001', 'failed')] });
    expect(planScenarioFindings(emptyCheckFindingState(), inputs(now, 'tree-03', [[one, 'tree-01'], [timedOut, 'tree-02']])).commands).toEqual([]);
    // A timeout is no failure to promote either.
    expect(planScenarioFindings(emptyCheckFindingState(), inputs(timedOut, 'tree-02', [[one, 'tree-01']])).commands).toEqual([]);
  });

  test('a failure after the check fixed it reopens the same CheckFinding', () => {
    const { state, failures } = promoted();
    const pass = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] });
    const fixed = apply(state, planScenarioFindings(state, inputs(pass, 'tree-03', failures)).commands).state;
    expect(entryOf(fixed)).toMatchObject({ standing: 'closed', reason: 'fixed-by-check' });
    const regression = gate({ id: 'ga-0004', results: [result('sc-001', 'failed')] });
    const reopened = apply(fixed, planScenarioFindings(fixed, inputs(regression, 'tree-04', [...failures, [pass, 'tree-03']])).commands);
    expect(reopened.events.map(event => event.type)).toEqual(['check-finding-reported', 'check-finding-decided']);
    expect(entryOf(reopened.state)).toMatchObject({ standing: 'open', reason: 'reopened', revision: 5 });
  });

  test('a failure whose audited tree was not read is named and left out, and the other scenarios go on', () => {
    const one = gate({ id: 'ga-0001', selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002'] }, results: [result('sc-001', 'failed'), result('sc-002', 'failed')] });
    const two = gate({ id: 'ga-0002', selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002'] }, results: [result('sc-001', 'failed'), result('sc-002', 'failed')] });
    const plan = planScenarioFindings(emptyCheckFindingState(), { ...inputs(two, 'tree-02', [[one, null]]) });
    expect(plan.notes).toEqual([
      { scenario: 'sc-001', checkFinding: null, step: 'promotion', code: 'source-unavailable' },
      { scenario: 'sc-002', checkFinding: null, step: 'promotion', code: 'source-unavailable' },
    ]);
    expect(plan.commands).toEqual([]);
  });

  test('a line holds at most 100 CheckFinding events; a scenario that does not fit is named and left for its next failure', () => {
    const many: ScenarioFacts[] = Array.from({ length: 51 }, (_, index) => ({ id: `sc-${String(index + 1).padStart(3, '0')}`, owner: notes, file: noteFile }));
    const results = many.map(fact => result(fact.id, 'failed'));
    const selection = { kind: 'identity' as const, scenarios: many.map(fact => fact.id) };
    const one = gate({ id: 'ga-0001', results, selection });
    const two = gate({ id: 'ga-0002', results, selection });
    const at = (attempt: GateAttempt, tree: string): ObservedGate => ({ gate: attempt.id, tree, observations: scenarioObservations(attempt, many), record: 'r', output: 'o' });
    const plan = planScenarioFindings(emptyCheckFindingState(), {
      workItem: 'wi-001', verdict: 'failed', changedFiles: [], current: { ...at(two, 'tree-02'), tree: 'tree-02' }, earlier: [at(one, 'tree-01')], tracked: many,
    });
    expect(plan.commands).toHaveLength(100);
    expect(plan.notes).toEqual([{ scenario: 'sc-051', checkFinding: null, step: 'promotion', code: 'event-bound' }]);
  });
});

describe('witness: a passing gate of the same scenario on the candidate being accepted (CF13)', () => {
  test('the same scenario passing completely on a changed tree fixes it by check', () => {
    const { state, failures } = promoted();
    const pass = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] });
    expect(scenarioGatesToRead(state, 'wi-001', 'passed', scenarioObservations(pass, tracked), failures.map(([attempt]) => ({ gate: attempt.id, observations: scenarioObservations(attempt, tracked) })))).toEqual(['ga-0001', 'ga-0002']);
    const plan = planScenarioFindings(state, inputs(pass, 'tree-03', failures));
    expect(plan.notes).toEqual([]);
    const { state: after } = apply(state, plan.commands);
    const entry = entryOf(after);
    expect(entry).toMatchObject({ standing: 'closed', reason: 'fixed-by-check' });
    expect(entry.decisions.at(-1)).toMatchObject({
      actor: { kind: 'harness' },
      source: { kind: 'tree', id: 'tree-03' },
      decision: {
        action: 'fix-by-check',
        candidate: { kind: 'tree', id: 'tree-03' },
        witness: {
          producer: 'check:scenario', attempt: 'ga-0003', obligation: { subject: 'scenario:sc-001', revision: 1 },
          source: { kind: 'tree', id: 'tree-03' }, coverage: 'complete', outcome: 'passed',
        },
      },
    });
    // The witness names the selection the failures were observed under.
    expect((entry.decisions.at(-1)!.decision as { witness: { selection: string } }).witness.selection).toBe(entry.verification.kind === 'check' ? entry.verification.selection : '');
  });

  test('a pass of another scenario, or a passing gate that did not run it, is no witness', () => {
    const { state, failures } = promoted();
    const other = gate({ id: 'ga-0003', selection: { kind: 'identity', scenarios: ['sc-002'] }, results: [result('sc-002', 'passed')] });
    expect(planScenarioFindings(state, inputs(other, 'tree-03', failures))).toEqual({ commands: [], notes: [] });
    expect(scenarioGatesToRead(state, 'wi-001', 'passed', scenarioObservations(other, tracked), [])).toBeNull();
    const none = gate({ id: 'ga-0004', results: [], scenarioCommand: false });
    expect(planScenarioFindings(state, inputs(none, 'tree-04', failures))).toEqual({ commands: [], notes: [] });
    expect(entryOf(state).standing).toBe('open');
  });

  test('a narrower run, another mode, a pass on the failure\'s own tree and a changed obligation do not fix it', () => {
    // Failures under the work-item gate's all-untagged run.
    const broad = { kind: 'all-untagged' as const };
    const failures: Array<readonly [GateAttempt, string]> = [
      [gate({ id: 'ga-0001', selection: broad, results: [result('sc-001', 'failed')] }), 'tree-01'],
      [gate({ id: 'ga-0002', selection: broad, results: [result('sc-001', 'failed')] }), 'tree-02'],
    ];
    const state = apply(emptyCheckFindingState(), planScenarioFindings(emptyCheckFindingState(), inputs(failures[1]![0], 'tree-02', [failures[0]!])).commands).state;

    const narrower = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] });
    expect(planScenarioFindings(state, inputs(narrower, 'tree-03', failures)).notes).toEqual([{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'insufficient-coverage' }]);

    const full = gate({ id: 'ga-0004', mode: 'full', selection: { kind: 'all' }, results: [result('sc-001', 'passed')] });
    expect(planScenarioFindings(state, inputs(full, 'tree-04', failures)).notes).toEqual([{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'incomparable-inputs' }]);

    const sameTree = gate({ id: 'ga-0005', selection: broad, results: [result('sc-001', 'passed')] });
    expect(planScenarioFindings(state, inputs(sameTree, 'tree-02', failures)).notes).toEqual([{
      scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'failure-source', classification: 'inconclusive',
    }]);

    // The feature file changed on the candidate: the adapter cannot attest the frozen scenario.
    const edited = gate({ id: 'ga-0006', selection: broad, results: [result('sc-001', 'passed')], guarded: [{ path: noteFile, before: 'a', after: 'b', authorizedBy: { id: 'x', revision: 1, hash: 'h' } }] });
    expect(planScenarioFindings(state, inputs(edited, 'tree-06', failures)).notes).toEqual([{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'obligation-changed' }]);

    // An authorized revision of the obligation: a pass of the frozen scenario verifies the old assertion only.
    const revised = apply(state, [{
      type: 'dispose', checkFinding: 'cf-0001', expectedRevision: entryOf(state).revision,
      decision: {
        actor: { kind: 'user', name: 'reviewer@example.com' }, source: { kind: 'tree', id: 'tree-02' }, rationale: 'The scenario is revised by its plan.',
        evidence: [], communication: { mode: 'quiet' },
        decision: { action: 'revise-obligation', authority: { kind: 'user-decision', ref: 'cmd-1' }, from: { subject: 'scenario:sc-001', revision: 1 }, to: { subject: 'scenario:sc-001', revision: 2 } },
      },
    }]).state;
    const after = gate({ id: 'ga-0007', selection: broad, results: [result('sc-001', 'passed')] });
    expect(planScenarioFindings(revised, inputs(after, 'tree-07', failures)).notes).toEqual([{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'obligation-changed' }]);

    // None of them changed the CheckFinding, and a comparable pass on a changed tree still fixes it.
    const comparable = gate({ id: 'ga-0008', selection: broad, results: [result('sc-001', 'passed')] });
    expect(entryOf(apply(state, planScenarioFindings(state, inputs(comparable, 'tree-08', failures)).commands).state).reason).toBe('fixed-by-check');
  });

  test('two passes on the failure\'s own tree are provisionally intermittent, and still fix nothing', () => {
    const failures: Array<readonly [GateAttempt, string]> = [
      [gate({ id: 'ga-0001', results: [result('sc-001', 'failed')] }), 'tree-01'],
      [gate({ id: 'ga-0002', results: [result('sc-001', 'failed')] }), 'tree-02'],
      [gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] }), 'tree-02'],
    ];
    const state = apply(emptyCheckFindingState(), planScenarioFindings(emptyCheckFindingState(), inputs(failures[1]![0], 'tree-02', [failures[0]!])).commands).state;
    const again = gate({ id: 'ga-0004', results: [result('sc-001', 'passed')] });
    const plan = planScenarioFindings(state, inputs(again, 'tree-02', failures));
    expect(plan).toEqual({ commands: [], notes: [{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'failure-source', classification: 'intermittent' }] });
    expect(entryOf(state).standing).toBe('open');
  });

  test('a witness that did not run, ran in part or did not pass is refused by the child', () => {
    const { state, failures } = promoted();
    const pass = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] });
    const base = inputs(pass, 'tree-03', failures);
    const [observation] = base.current.observations;
    const offered = (change: Partial<ScenarioObservation>) => planScenarioFindings(state, {
      ...base, current: { ...base.current, observations: [{ ...observation!, ...change }] },
    }).notes.map(note => note.code);
    // A missing message stream, a timeout or a launch error leave it not run.
    expect(offered({ coverage: 'not-run', outcome: 'inconclusive', file: noteFile })).toEqual(['not-executed']);
    expect(offered({ coverage: 'partial', outcome: 'inconclusive' })).toEqual(['insufficient-coverage']);
    expect(offered({ coverage: 'complete', outcome: 'failed' })).toEqual(['not-passed']);
  });

  test('an open CheckFinding awaiting a user\'s answer is not fixed by a gate', () => {
    const { state, failures } = promoted();
    const asked = apply(state, [{
      type: 'dispose', checkFinding: 'cf-0001', expectedRevision: entryOf(state).revision,
      decision: {
        actor: { kind: 'agent', role: 'local-architect', invocation: 'inv-0009' }, source: { kind: 'tree', id: 'tree-02' }, rationale: 'The scenario conflicts with the plan.',
        evidence: [], communication: { mode: 'quiet' },
        decision: {
          action: 'request-user-decision', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' },
          conflicts: [{ text: 'A note is shown', document: 'plan', revision: 'sha256:x' }],
          options: [{ id: 'a', summary: 'a', consequence: 'a' }, { id: 'b', summary: 'b', consequence: 'b' }],
        },
      },
    }]).state;
    const pass = gate({ id: 'ga-0003', results: [result('sc-001', 'passed')] });
    expect(planScenarioFindings(asked, inputs(pass, 'tree-03', failures)).notes).toEqual([{ scenario: 'sc-001', checkFinding: 'cf-0001', step: 'witness', code: 'awaiting-user-decision' }]);
  });

  test('a required scenario CheckFinding lists as a high-risk objective signal that no waiver or judgment settles', () => {
    const { state } = promoted();
    const list = selectCheckFindings(state, { kind: 'list', owner: null, select: 'all', limit: 10, order: 'attention' });
    if (!list.ok || list.view.kind !== 'list') throw new Error('no list');
    expect(list.view.items[0]).toMatchObject({ id: 'cf-0001', risk: 'high', credibility: 'objective-reproduced', awaiting: 'assessment', producers: ['check:scenario'] });
    const waive = decideCheckFindingChange(state, {
      type: 'dispose', checkFinding: 'cf-0001', expectedRevision: entryOf(state).revision,
      decision: {
        actor: { kind: 'user', name: 'reviewer@example.com' }, source: { kind: 'tree', id: 'tree-02' }, rationale: 'Accept it.', evidence: [],
        communication: { mode: 'quiet' }, decision: { action: 'waive', authority: { kind: 'user-decision', ref: 'cmd-2' }, acceptedRisk: 'high', uncertainty: 'none' },
      },
    });
    expect(waive).toMatchObject({ ok: false, rejection: { code: 'required-obligation' } });
    // CF02: a judgment cannot supersede a factual failure, nor fix it by assessment; only its witness can.
    const judged = (decision: Record<string, unknown>) => decideCheckFindingChange(state, {
      type: 'dispose', checkFinding: 'cf-0001', expectedRevision: entryOf(state).revision,
      decision: {
        actor: { kind: 'agent', role: 'local-architect', invocation: 'inv-0009' }, source: { kind: 'tree', id: 'tree-03' },
        rationale: 'The later code no longer fails it.', evidence: [], communication: { mode: 'quiet' }, decision,
      } as never,
    });
    const reports = entryOf(state).reports.map(report => report.id);
    expect(judged({ action: 'supersede', reassessed: reports, replacement: 'It passes now.' })).toMatchObject({ ok: false, rejection: { code: 'factual-obligation' } });
    expect(judged({ action: 'fix-by-assessment', reassessed: reports })).toMatchObject({ ok: false, rejection: { code: 'verification-kind-mismatch' } });
  });
});
