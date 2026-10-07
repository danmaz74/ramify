import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GateAttempt, ScenarioCheckSummary } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { incompleteScenarios } from '../run/feature-files.js';
import { runEventSchema, type RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { bindingErrors, bindingEventsToRecord, obligationsOf } from '../work/obligations.js';
import { scenarioRecordSchema, scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { reduceScenarioStates, scenarioEventTypes, type ScenarioEvent } from '../../subs/scenarios/src/states.js';
import { fixtureProjection, line, reported, scenarioRecord, submissionHash } from './helpers/obligations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { consumerStub, consumerTest } from './helpers/contracts.js';
import {
  accepted, added, answeredGit, modified, unchanged, scenariosCommitted, type AnsweredGit, type CommitResponse,
} from './helpers/contracts-git.js';
import { passingScenarioSummary, type DirectCheckScript, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import { treeCandidates } from './helpers/candidates.js';
import { finalCandidate } from './helpers/final-candidate.js';
import {
  addModule, assign, byRole, completionProposed, installMiniRunner, outline, partialReport, submit, treeInputs, write,
} from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';

/*
 * The states of the tracked scenarios, architecture §7 to §9 and §11.
 *
 * Every scenario is a registered obligation in one of three states, each
 * entered by one accepted submission: `pending` at acceptance, `bound` at an
 * engineer's accepted binding, which names the fakes it relies on, and
 * `done` at its responsible architect's accepted report, which only that
 * architect's revision moves back to `bound`. No gate, audit, failure,
 * repair exit or source edit moves a state; the pending tag comes off at
 * `bound` or a direct `done`; completion requires every scenario of the
 * entry `done`, and the final gate every tracked one, whatever its scenario
 * check reported.
 *
 * Agents are scripted, Git is answered from each scenario's own data, and the
 * scenario runner is the direct executor: it reports every scenario its
 * selection reaches as passed unless the scenario says otherwise, reading
 * the pending tags from the feature files the harness wrote, as the runner
 * would.
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
const tags = 'collection-review/workspace/reviews/tags';
const tagsDirectory = 'subs/workspace/subs/reviews/subs/tags';

const featureOf = (directory: string, capability: string) => `${directory}/src/tests/features/${plan}/${capability}.feature`;
const stepsOf = (directory: string, capability: string) => `${directory}/src/tests/steps/${capability}.steps.ts`;
const stepFile = [
  "import { Given, When, Then } from '@cucumber/cucumber';",
  '',
  "Given('the project as the plan finds it', () => {});",
  "When(/^the person uses (.+)$/, () => {});",
  "Then(/^the outcome (.+) promises is shown$/, () => {});",
  '',
].join('\n');

/** A copy of the fixture with the modules a scenario works in, each with its own test. */
async function fixtureWith(...modules: ReadonlyArray<'notes' | 'tags'>): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  for (const module of modules) {
    if (module === 'notes') await addModule(fixture.root, notesDirectory, 'notes', { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') });
    if (module === 'tags') await addModule(fixture.root, tagsDirectory, 'tags', { 'src/tags.ts': consumerStub, 'src/tests/tags.test.ts': consumerTest('tags.ts') });
  }
  await installMiniRunner(fixture.root);
  return fixture.root;
}

interface RunOptions {
  readonly checkScript?: DirectCheckScript | undefined;
  /** Wraps the scenario's Git, for a double that observes or interrupts one answer. */
  readonly git?: ((git: AnsweredGit) => AnsweredGit) | undefined;
}

/** A run whose Git answers are the scenario's own data, after the commit of the feature files. */
async function run(root: string, script: Parameters<typeof byRole>[0], commits: readonly CommitResponse[], options: RunOptions = {}) {
  const hasFinal = commits.some(commit => commit.subject === finalSubject);
  const before = commits.slice(0, -1).flatMap(commit => commit.commit ?? []).at(-1) ?? 'scenarios-00';
  const final = hasFinal ? finalCandidate(root, before, commits.at(-1)?.commit ?? before) : null;
  const answered = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted(plan, 'scenarios-00'), ...commits],
    ...(final === null ? {} : { previews: final.previews }) });
  const git = options.git?.(answered) ?? answered;
  const baseCandidates = treeCandidates(root);
  const candidates = final === null ? baseCandidates : {
    ...baseCandidates,
    async commitTree(project: string, commit: string) {
      const answer = await baseCandidates.commitTree(project, commit);
      return commit === before ? final.previews[0]!.tree : answer;
    },
  };
  const opened = await openRuns(root, {
    script: byRole(script),
    inputs: treeInputs(),
    git,

    candidates,
    ...(options.checkScript === undefined ? {} : { checkScript: options.checkScript }),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { ...opened, git: answered, runId: receipt.jobId };
}

async function events(root: string, runId: string): Promise<RunEvent[]> {
  return runEventsOnDisk(root, plan, runId);
}

async function gateOf(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

/** Every gate attempt of the run, in order. */
async function gates(root: string, runId: string): Promise<GateAttempt[]> {
  const ids = [...new Set((await events(root, runId)).filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
  return Promise.all(ids.map(id => gateOf(root, runId, id)));
}

function summaryOf(attempt: GateAttempt): ScenarioCheckSummary | undefined {
  return attempt.commands.find(command => command.kind === 'scenarios')?.scenarios;
}

/** The obligation events of the log that name a scenario, as `bound sc (fakes)` and `reported sc judgment` lines. */
function scenarioLines(log: readonly RunEvent[]): string[] {
  return log.flatMap(event => {
    if (event.type === 'obligation-bound' && event.data.id.startsWith('sc-')) {
      return [`bound ${event.data.id} (${event.data.fakes.length === 0 ? 'no fakes' : event.data.fakes.join(', ')})`];
    }
    if (event.type === 'obligation-reported' && event.data.id.startsWith('sc-')) return [`reported ${event.data.id} ${event.data.judgment}`];
    return [];
  });
}

/** The invocation IDs of a role, in order. */
function invocationsOf(log: readonly RunEvent[], role: string): string[] {
  return log.flatMap(event => (event.type === 'invocation-started' && event.data.role === role ? [event.data.invocation] : []));
}

/** The prompts the local architects of a run were given, in order. */
function architectPrompts(agent: { readonly sessions: ReadonlyArray<{ readonly spec: { readonly submission: { readonly name: string }; readonly prompt: string } }> } | undefined): string[] {
  return (agent?.sessions ?? []).filter(session => session.spec.submission.name === 'submit_work_item_result').map(session => session.spec.prompt);
}

/** The structured errors of a rejected submission's verdict. */
function rejection(verdict: unknown): Array<{ path: string; message: string; expected?: string }> {
  return (JSON.parse((verdict as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string; expected?: string }> }).errors;
}

/** The index of the first event of a type that matches. */
function at(log: readonly RunEvent[], type: string, match: (data: Record<string, unknown>) => boolean = () => true): number {
  return log.findIndex(event => event.type === type && match(event.data as Record<string, unknown>));
}

/** A scenario check whose runs reached the scenario and failed it at its last step. */
function failingScenario(check: PlannedCheck, id: string): DirectCheckStep {
  const passing = passingScenarioSummary(check);
  return {
    outcome: { kind: 'completed', exitCode: 1 },
    scenarios: {
      ...passing,
      scenarios: passing.scenarios.map(result => (result.id !== id ? result : {
        ...result, status: 'failed' as const, failure: { step: 'Then the outcome review-note promises is shown', message: 'expected the note, got nothing' },
      })),
      failures: [`${id} failed at "Then the outcome review-note promises is shown": expected the note, got nothing`],
    },
  };
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

const done = (id: string, basedOnRevision: number) => ({ id, judgment: 'done' as const, basedOnRevision });
const revised = (id: string, basedOnRevision: number) => ({ id, judgment: 'bound' as const, basedOnRevision });

describe('PB3-D12, PB3-D06: binding, the done report and the pending tag', () => {
  test('a binding makes a scenario bound and takes its tag off before the gate that selects it; a done report finishes it, directly from pending too; the final gate runs every scenario in full mode', async () => {
    const root = await fixtureWith('notes', 'tags');
    const noteFeature = featureOf(notesDirectory, 'review-note');
    const tagFeature = featureOf(tagsDirectory, 'review-tags');
    const noteSteps = stepsOf(notesDirectory, 'review-note');
    // What each scenario check found in the files when it ran, by attempt.
    const seen = new Map<string, { note: string; tag: string }>();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-tags', tags)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit({ ...requestCompletion(), reports: [done('sc-001', 0)] }),
        // wi-002 needs no iteration: existing step definitions bind its
        // scenario, and its architect reports it done directly.
        submit({ ...requestCompletion(), reports: [done('sc-002', 0)] }),
      ],
      engineer: [submit(completionProposed('The note scenario is bound.', { bindings: [{ id: 'sc-001' }] }), write(noteSteps.slice(`${notesDirectory}/src/`.length), stepFile))],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(noteSteps), ...modified(noteFeature)]),
      unchanged('wi-001'),
      accepted('wi-002', 'revision-02', modified(tagFeature)),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind === 'scenarios') seen.set(context.attemptId, { note: read(root, noteFeature), tag: read(root, tagFeature) });
        return {};
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    const attempts = await gates(root, runId);
    const iterationGate = attempts.find(attempt => attempt.checkpoint === 'iteration')!;
    const [noteGate, tagGate] = attempts.filter(attempt => attempt.checkpoint === 'work-item');
    const finalGate = attempts.find(attempt => attempt.checkpoint === 'final')!;
    const [engineer] = invocationsOf(log, 'engineer');
    const architects = invocationsOf(log, 'local-architect');

    // The binding, with its provenance, before the gate that commits it.
    const binding = log.find(event => event.type === 'obligation-bound')!;
    expect(binding.data).toEqual({ id: 'sc-001', fakes: [], by: engineer, submission: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(at(log, 'obligation-bound')).toBeLessThan(at(log, 'gate-committing', data => data.gate === iterationGate.id));
    expect(scenarioLines(log)).toEqual(['bound sc-001 (no fakes)', 'reported sc-001 done', 'reported sc-002 done']);
    for (const report of log.filter(event => event.type === 'obligation-reported')) {
      expect(architects).toContain((report.data as { by: string }).by);
    }

    // The iteration gate selected the bound scenario by identity, in its
    // owner's run, and its commit had removed the pending tag already.
    expect(summaryOf(iterationGate)).toMatchObject({
      mode: 'quick', selection: { kind: 'identity', scenarios: ['sc-001'] },
      runs: [{ module: notes }], scenarios: [{ id: 'sc-001', status: 'passed' }], failures: [],
    });
    expect(seen.get(iterationGate.id)!.note).toContain('  @ramify-sc-001\n');
    expect(seen.get(iterationGate.id)!.tag).toContain('  @ramify-sc-002 @ramify-pending\n');
    // wi-002's direct done report took its tag off at its gate's commit.
    expect(summaryOf(noteGate!)).toMatchObject({ selection: { kind: 'all-untagged' }, excluded: 1, scenarios: [{ id: 'sc-001', status: 'passed' }] });
    expect(seen.get(tagGate!.id)!.tag).toContain('  @ramify-sc-002\n');
    expect(summaryOf(tagGate!)!.scenarios.map(result => result.id)).toEqual(['sc-001', 'sc-002']);

    // §11: the final gate ran everything in full mode, and the run completed
    // with every tracked scenario done.
    expect(summaryOf(finalGate)).toMatchObject({ mode: 'full', selection: { kind: 'all' }, dryRun: false, failures: [] });
    expect(summaryOf(finalGate)!.scenarios.map(result => `${result.id} ${result.status}`)).toEqual(['sc-001 passed', 'sc-002 passed']);
    expect(log.at(-1)!.type).toBe('job-completed');
    expect(onlyRun(service, plan).counts.scenarios).toEqual({ pending: 0, bound: 0, done: 2 });
    expect(read(root, noteFeature)).toContain('  @ramify-sc-001\n');
    expect(read(root, tagFeature)).toContain('  @ramify-sc-002\n');
    git.assertAnswered();
  }, 120_000);

  test('PB3-D12 the binding projection: bind with fakes, a done report over them, a rebinding of done with none, the revision and the last report', () => {
    const hash = submissionHash('b');
    const bound = (id: string, fakes: string[], by: string) => line('obligation-bound', { id, fakes, by, submission: hash });
    const report = (judgment: 'done' | 'bound', basedOnRevision: number, by: string) =>
      reported({ id: 'sc-001', judgment, basedOnRevision, revision: basedOnRevision + 1, by, submission: submissionHash('c') });
    const after = (...events: ReturnType<typeof line>[]) => fixtureProjection(events).obligations.get('sc-001')!;

    const withFakes = after(bound('sc-001', ['FakeMailer'], 'inv-0004'));
    expect([withFakes.status, withFakes.revision, withFakes.binding?.fakes, withFakes.binding?.by]).toEqual(['bound', 0, ['FakeMailer'], 'inv-0004']);
    // The architect's report is accepted whatever the list says.
    const reportedOverFakes = after(bound('sc-001', ['FakeMailer'], 'inv-0004'), report('done', 0, 'inv-0005'));
    expect([reportedOverFakes.status, reportedOverFakes.revision, reportedOverFakes.binding?.fakes]).toEqual(['done', 1, ['FakeMailer']]);
    // A later binding of a done obligation records its list and leaves it done.
    const rebound = after(bound('sc-001', ['FakeMailer'], 'inv-0004'), report('done', 0, 'inv-0005'), bound('sc-001', [], 'inv-0006'));
    expect([rebound.status, rebound.revision, rebound.binding?.fakes, rebound.binding?.by]).toEqual(['done', 1, [], 'inv-0006']);
    // Only the architect's revision moves it back, and its next report finishes it again.
    const revisedBack = after(bound('sc-001', ['FakeMailer'], 'inv-0004'), report('done', 0, 'inv-0005'), bound('sc-001', [], 'inv-0006'), report('bound', 1, 'inv-0007'));
    expect([revisedBack.status, revisedBack.revision]).toEqual(['bound', 2]);
    expect(after(bound('sc-001', [], 'inv-0004'), report('done', 0, 'inv-0005'), report('bound', 1, 'inv-0007'), report('done', 2, 'inv-0008')).status).toBe('done');
    // A direct report needs no binding.
    expect(after(report('done', 0, 'inv-0005'))).toMatchObject({ status: 'done', binding: null });

    // The scenario states are the same fold.
    const states = reduceScenarioStates(['sc-001', 'sc-002'], [
      { type: 'obligation-bound', data: { id: 'sc-001' } },
      { type: 'obligation-reported', data: { id: 'sc-001', judgment: 'done' } },
      { type: 'obligation-bound', data: { id: 'sc-001' } },
    ]);
    expect([...states]).toEqual([['sc-001', 'done'], ['sc-002', 'pending']]);
  });

  test('PB3-D12 a replayed binding is recorded once, and no declared, implemented, due or withdrawal event remains', () => {
    const identity = { by: 'inv-0004', submission: submissionHash('d') };
    const first = bindingEventsToRecord([{ id: 'sc-001', fakes: ['FakeMailer'] }, { id: 'test-001', fakes: [] }], identity, []);
    expect(first).toEqual([
      { type: 'obligation-bound', data: { id: 'sc-001', fakes: ['FakeMailer'], ...identity } },
      { type: 'obligation-bound', data: { id: 'test-001', fakes: [], ...identity } },
    ]);
    expect(bindingEventsToRecord([{ id: 'sc-001', fakes: ['FakeMailer'] }, { id: 'test-001', fakes: [] }], identity,
      [line('obligation-bound', first[0]!.data)])).toEqual([first[1]]);
    const types = runEventSchema.options.map(option => option.shape.type.value as string);
    expect(types).toContain('obligation-bound');
    for (const removed of ['scenario-declared', 'scenario-due', 'scenario-implemented', 'scenario-bound-passed', 'scenarios-withdrawing', 'scenario-withdrawn']) {
      expect(types).not.toContain(removed);
    }
  });
});

describe('PB3-D03: the audit result is evidence beside the state, never the state', () => {
  test('an iteration whose gate passes leaves the scenario bound: completion is refused until the architect reports it done, and the binding\'s fakes are shown to it', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    const { service, runId, agent, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit({ ...requestCompletion(), reports: [] }),
        submit({ ...requestCompletion(), reports: [done('sc-001', 0)] }),
      ],
      engineer: [submit(completionProposed('Bound against the fake limit.', { bindings: [{ id: 'sc-001', fakes: ['FakeNoteLimit'] }] }), write(steps.slice(`${notesDirectory}/src/`.length), stepFile))],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ]);

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    const iterationGate = (await gates(root, runId)).find(attempt => attempt.checkpoint === 'iteration')!;
    expect(iterationGate.verdict).toBe('passed');
    expect(summaryOf(iterationGate)!.scenarios).toEqual([expect.objectContaining({ id: 'sc-001', status: 'passed' })]);
    // The pass reported nothing: the only report is the architect's last.
    expect(scenarioLines(log)).toEqual(['bound sc-001 (FakeNoteLimit)', 'reported sc-001 done']);
    expect(at(log, 'obligation-reported')).toBeGreaterThan(at(log, 'gate-passed', data => data.gate === iterationGate.id));
    const [, refused, finishing] = architectPrompts(agent);
    expect(refused).toContain('- sc-001 (scenario): bound, revision 0; bound by inv-');
    expect(refused).toContain('relying on fakes FakeNoteLimit; no report yet');
    expect(finishing).toContain('## Completion was refused');
    expect(finishing).toContain('- sc-001 is bound and not reported done: report it done in `reports` where its binding holds, or assign the work that finishes it');
    // The refused request ran no gate and wrote no outline: the assignment's
    // and the accepted request's are the only two.
    expect(log.filter(event => event.type === 'outline-revised')).toHaveLength(2);
    expect(log.filter(event => event.type === 'gate-attempted' && (event.data as { checkpoint: string }).checkpoint === 'work-item')).toHaveLength(1);
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    git.assertAnswered();
  }, 120_000);

  test('a done report over a binding\'s fakes survives a failing gate, the iteration\'s repair exit and its source edit', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    const source = `${notesDirectory}/src/notes.ts`;
    let iterationGates = 0;
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        // The report is the architect's judgment: the fake is permanent here.
        submit({ ...assign(notes, { kind: 'repair', goal: 'Tidy the notes source.' }), reports: [{ ...done('sc-001', 0), where: 'review-note steps' }] }),
        submit({ ...requestCompletion(), reports: [] }),
      ],
      engineer: [
        submit(completionProposed('Bound against the fake limit.', { bindings: [{ id: 'sc-001', fakes: ['FakeNoteLimit'] }] }), write(steps.slice(`${notesDirectory}/src/`.length), stepFile)),
        submit(completionProposed('Tidied.'), write('notes.ts', `${consumerStub}// tidied\n`)),
        submit(completionProposed('Tidied, I still believe.')),
        submit(completionProposed('Tidied, once more.')),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      accepted('wi-001.i02', 'revision-02', modified(source)),
      unchanged('wi-001.i02'),
      unchanged('wi-001.i02'),
      // The exhausted iteration's reviews ask for one more work-item gate.
      unchanged('wi-001'),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration') return {};
        iterationGates += 1;
        return iterationGates === 1 ? {} : failingScenario(check, 'sc-001');
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    expect(log.filter(event => event.type === 'iteration-closed').map(event => (event.data as { outcome: string }).outcome)).toEqual(['accepted', 'exhausted']);
    const failed = (await gates(root, runId)).filter(attempt => attempt.checkpoint === 'iteration' && attempt.verdict === 'failed');
    expect(failed).toHaveLength(3);
    // Every failure stays raw in its gate; none moved the state.
    expect(summaryOf(failed[0]!)!.failures).toEqual(['sc-001 failed at "Then the outcome review-note promises is shown": expected the note, got nothing']);
    expect(scenarioLines(log)).toEqual(['bound sc-001 (FakeNoteLimit)', 'reported sc-001 done']);
    expect(log.find(event => event.type === 'obligation-reported')!.data).toMatchObject({ where: 'review-note steps', basedOnRevision: 0, revision: 1 });
    expect(onlyRun(service, plan).counts.scenarios).toEqual({ pending: 0, bound: 0, done: 1 });
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    git.assertAnswered();
  }, 120_000);

  test('only the architect\'s revision moves done back to bound; a rebinding of done with no fakes leaves it done', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    const source = `${notesDirectory}/src/notes.ts`;
    const { service, runId, agent, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit({ ...assign(notes, { goal: 'Replace the fake limit with the real one.', obligations: ['sc-001'] }), reports: [done('sc-001', 0)] }),
        submit({ ...requestCompletion(), reports: [revised('sc-001', 1)] }),
        submit({ ...requestCompletion(), reports: [done('sc-001', 2)] }),
      ],
      engineer: [
        submit(completionProposed('Bound against the fake limit.', { bindings: [{ id: 'sc-001', fakes: ['FakeNoteLimit'] }] }), write(steps.slice(`${notesDirectory}/src/`.length), stepFile)),
        submit(completionProposed('The notes use the real limit.', { bindings: [{ id: 'sc-001' }] }), write('notes.ts', `${consumerStub}// real limit\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      accepted('wi-001.i02', 'revision-02', modified(source)),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ]);

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    expect(scenarioLines(log)).toEqual([
      'bound sc-001 (FakeNoteLimit)', 'reported sc-001 done', 'bound sc-001 (no fakes)', 'reported sc-001 bound', 'reported sc-001 done',
    ]);
    const [, , rebound, revisedBack] = architectPrompts(agent);
    const engineers = invocationsOf(log, 'engineer');
    expect(rebound).toContain(`- sc-001 (scenario): done, revision 1; bound by ${engineers.at(-1)} with no fakes; last report done by`);
    expect(revisedBack).toContain('- sc-001 (scenario): bound, revision 2;');
    expect(revisedBack).toContain('- sc-001 is bound and not reported done');
    // A revision never brings the pending tag back.
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    expect(read(root, feature)).not.toContain('@ramify-sc-001 @ramify-pending');
    git.assertAnswered();
  }, 120_000);
});

describe('PB3-D11: a completion proposal binds every assigned obligation', () => {
  test('a proposal that leaves out an assigned scenario is rejected naming it, before any commit or gate; the complete proposal that follows is accepted', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    const { service, runId, agent, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit(requestCompletion()),
      ],
      engineer: [[
        write(steps.slice(`${notesDirectory}/src/`.length), stepFile),
        { kind: 'submit', input: completionProposed('Done.') },
        { kind: 'submit', input: completionProposed('Done.', { bindings: [{ id: 'sc-099' }] }) },
        { kind: 'submit', input: completionProposed('Done, with the binding.', { bindings: [{ id: 'sc-001' }] }) },
      ]],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const engineer = agent!.sessions.find(session => session.spec.role === 'engineer')!;
    expect(engineer.spec.prompt).toContain('## Obligations to bind');
    expect(engineer.spec.prompt).toContain('- `sc-001`: scenario "');
    expect(engineer.verdicts).toHaveLength(3);
    const missing = 'The assignment names sc-001, which this proposal does not bind. Bind every assigned obligation, with the fakes its binding relies on, or report "partial" with what is unfinished';
    expect(rejection(engineer.verdicts[0])).toEqual([{ path: 'bindings', message: missing, expected: 'each of sc-001 once' }]);
    expect(rejection(engineer.verdicts[1])).toEqual([
      { path: 'bindings.0.id', message: 'sc-099 is not assigned to this iteration, so this engineer cannot bind it', expected: 'each of sc-001 once' },
      { path: 'bindings', message: missing, expected: 'each of sc-001 once' },
    ]);
    expect(engineer.verdicts[2]).toMatchObject({ accepted: true });
    const log = await events(root, runId);
    // The rejected proposals committed, audited and reviewed nothing: one
    // iteration gate, after the accepted proposal's binding.
    expect(log.filter(event => event.type === 'gate-committing' && (event.data as { checkpoint: string }).checkpoint === 'iteration')).toHaveLength(1);
    expect(at(log, 'obligation-bound')).toBeLessThan(at(log, 'gate-committing'));
    expect(scenarioLines(log)).toEqual(['bound sc-001 (no fakes)', 'reported sc-001 done']);
    git.assertAnswered();
  }, 120_000);

  test('a partial report under the same assignment is accepted without a binding, and the architect may report the scenario done directly', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const { service, runId, agent, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit({ ...requestCompletion(), reports: [done('sc-001', 0)] }),
      ],
      engineer: [submit(partialReport(['nothing'], ['the step file: existing definitions already bind the scenario']))],
    }, [
      accepted('wi-001', 'revision-01', modified(feature)),
      unchanged(finalSubject),
    ]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const engineer = agent!.sessions.find(session => session.spec.role === 'engineer')!;
    expect(engineer.verdicts).toEqual([expect.objectContaining({ accepted: true })]);
    const log = await events(root, runId);
    expect(log.filter(event => event.type === 'iteration-closed').map(event => (event.data as { outcome: string }).outcome)).toEqual(['partial']);
    expect(scenarioLines(log)).toEqual(['reported sc-001 done']);
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    git.assertAnswered();
  }, 120_000);

  test('the structural check: unassigned, repeated and missing IDs, and a repeated fake', () => {
    expect(bindingErrors([{ id: 'sc-001', fakes: ['FakeClock', 'FakeClock'] }, { id: 'sc-001', fakes: [] }], ['sc-001', 'test-001'])).toEqual([
      { path: 'bindings.0.fakes.1', message: 'FakeClock is named twice', expected: 'each fake once' },
      { path: 'bindings.1.id', message: 'sc-001 is bound twice', expected: 'each of sc-001, test-001 once' },
      expect.objectContaining({ path: 'bindings', message: expect.stringContaining('The assignment names test-001, which this proposal does not bind.') }),
    ]);
    expect(bindingErrors([], [])).toEqual([]);
    expect(bindingErrors([{ id: 'sc-001', fakes: [] }], [])).toEqual([
      { path: 'bindings.0.id', message: 'sc-001 is not assigned to this iteration, so this engineer cannot bind it', expected: 'an empty list: this assignment names no obligation' },
    ]);
  });
});

describe('§9: work-item completion', () => {
  test('a request is refused while a scenario of its entry is pending, with the reason in the next turn; one that reports it done completes', async () => {
    const root = await fixtureWith('notes');
    const { service, runId, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit({ ...requestCompletion(), reports: [] }),
        submit({ ...requestCompletion(), reports: [done('sc-001', 0)] }),
      ],
    }, [unchanged('wi-001'), unchanged(finalSubject)]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const prompts = architectPrompts(agent);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('## Completion was refused');
    expect(prompts[1]).toContain('- sc-001 is pending and not reported done: report it done in `reports` where it holds, or assign an iteration that binds it');
    const log = await events(root, runId);
    // The refused request ran no gate and wrote no outline.
    expect(log.filter(event => event.type === 'outline-revised')).toHaveLength(1);
    expect(log.filter(event => event.type === 'gate-attempted' && (event.data as { checkpoint: string }).checkpoint === 'work-item')).toHaveLength(1);
    expect(scenarioLines(log)).toEqual(['reported sc-001 done']);
  }, 120_000);

  test('refused beyond the bound, the run fails with the scenarios as evidence', async () => {
    const root = await fixtureWith('notes');
    const { service } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit({ ...requestCompletion(), reports: [] })],
    }, []);
    const snapshot = onlyRun(service, plan);
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure).toMatchObject({
      reason: 'acceptance-incomplete',
      evidence: ['scenarios/sc-001.json'],
    });
    expect(snapshot.failure!.message).toContain('wi-001 asked for completion 4 times with scenarios of its entry not reported done: sc-001 is pending and not reported done');
  }, 120_000);

  test('a done scenario that fails a later gate fails that gate, and stays done', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    let regressions = 0;
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, { obligations: ['sc-001'] }, outline())),
        submit({ ...requestCompletion(), reports: [done('sc-001', 0)] }),
        submit({ ...requestCompletion(), reports: [] }),
      ],
      engineer: [submit(completionProposed('Bound.', { bindings: [{ id: 'sc-001' }] }), write(steps.slice(`${notesDirectory}/src/`.length), stepFile))],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001'),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'work-item' || regressions > 0) return {};
        regressions += 1;
        return failingScenario(check, 'sc-001');
      },
    });

    expect(onlyRun(service, plan).state).toBe('completed');
    const attempts = (await gates(root, runId)).filter(attempt => attempt.checkpoint === 'work-item');
    expect(attempts.map(attempt => attempt.verdict)).toEqual(['failed', 'passed']);
    expect(summaryOf(attempts[0]!)!.scenarios).toEqual([expect.objectContaining({ id: 'sc-001', status: 'failed' })]);
    // The failure changed no state and the file kept no pending tag.
    expect(scenarioLines(await events(root, runId))).toEqual(['bound sc-001 (no fakes)', 'reported sc-001 done']);
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    git.assertAnswered();
  }, 120_000);
});

describe('§11: the final gate', () => {
  test('acceptance-incomplete: a tracked scenario that is not done, integration scenarios included, is named with its record as evidence', () => {
    const records = [record('sc-001', 'entry', 'review-note'), record('sc-002', 'entry', 'review-tags'), record('sc-003', 'integration', null)];
    const tracked = { records, entries: [], states: new Map([['sc-001', 'done'], ['sc-002', 'bound'], ['sc-003', 'pending']] as const) };
    expect(incompleteScenarios(tracked)).toEqual([
      { id: 'sc-002', entry: 'review-tags', state: 'bound', evidence: 'scenarios/sc-002.json' },
      { id: 'sc-003', entry: null, state: 'pending', evidence: 'scenarios/sc-003.json' },
    ]);
    expect(incompleteScenarios({ ...tracked, states: new Map([['sc-001', 'done'], ['sc-002', 'done'], ['sc-003', 'pending']] as const) }))
      .toEqual([{ id: 'sc-003', entry: null, state: 'pending', evidence: 'scenarios/sc-003.json' }]);
    expect(incompleteScenarios({ ...tracked, states: new Map([['sc-001', 'done'], ['sc-002', 'done'], ['sc-003', 'done']] as const) })).toEqual([]);
  });

  test('a passing final gate completes the run whatever its scenario check reported: the results are raw evidence, never matched to the states', async () => {
    const root = await fixtureWith('notes');
    const { service, runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(requestCompletion())],
    }, [unchanged('wi-001'), unchanged(finalSubject)], {
      // The final run did not execute the scenario, and reported nothing failed.
      checkScript: ({ check, context }) => (check.kind === 'scenarios' && context.checkpoint === 'final'
        ? { scenarios: { ...passingScenarioSummary(check), scenarios: [] } }
        : {}),
    });

    const snapshot = onlyRun(service, plan);
    expect(snapshot.failure).toBeNull();
    expect(snapshot.state).toBe('completed');
    const finalGate = (await gates(root, runId)).find(attempt => attempt.checkpoint === 'final')!;
    expect(finalGate.verdict).toBe('passed');
    expect(summaryOf(finalGate)!.scenarios).toEqual([]);
  }, 120_000);
});

/** One scenario record, as acceptance commits it. */
function record(id: string, kind: 'entry' | 'integration', entryName: string | null): ScenarioRecord {
  const source = [`Scenario: ${id}`, '  Given a note', '  When it is saved', '  Then it is kept'];
  return scenarioRecordSchema.parse({
    schema: 'ramify-agent.scenario/1',
    id,
    kind,
    entry: entryName,
    owner: notes,
    origin: kind === 'entry' ? { kind: 'architect', refs: ['fr-002'] } : { kind: 'plan', planScenario: 'ps-01', ref: { lines: [1, 4] } },
    partOf: null,
    subScenarios: kind === 'entry' ? [] : ['sc-001', 'sc-002'],
    name: id,
    source,
    hash: scenarioSourceHash(source),
    file: kind === 'entry' ? featureOf(notesDirectory, entryName!) : `${notesDirectory}/src/tests/features/${plan}/integration.feature`,
  });
}

describe('PB3-D04: obligation reports and the scenario states are one fold', () => {
  test('PB3-D04 an architect report moves its scenario\'s obligation and state alike; a gate result moves neither', () => {
    const gate = line('gate-passed', { gate: 'ga-0004', kind: 'iteration' });
    const report = reported({ id: 'sc-002', judgment: 'done', basedOnRevision: 0, revision: 1, by: 'inv-0005', submission: submissionHash('d') });

    // Gate results move no obligation.
    const withoutReport = fixtureProjection([gate]).obligations;
    expect([...withoutReport.values()].map(one => [one.id, one.status, one.revision])).toEqual([
      ['sc-001', 'pending', 0], ['sc-002', 'pending', 0], ['sc-003', 'pending', 0], ['cap-001', 'pending', 0],
    ]);
    // An architect report moves its obligation alone.
    const withReport = fixtureProjection([gate, report]).obligations;
    expect([withReport.get('sc-001')?.status, withReport.get('sc-002')?.status, withReport.get('sc-002')?.revision]).toEqual(['pending', 'done', 1]);

    // An entry scenario whose work item is not committed has no responsible architect: no obligation, and no failure.
    const orphan = obligationsOf({ scenarios: [scenarioRecord('sc-009', 'unplanned-entry')], workItems: [], events: [] });
    expect([...orphan.obligations.keys()]).toEqual([]);

    // The scenario states read the same report, and nothing else.
    expect(scenarioEventTypes).toContain(report.type);
    const events: ScenarioEvent[] = [{ type: 'obligation-reported', data: { id: 'sc-002', judgment: 'done' } }];
    expect([...reduceScenarioStates(['sc-001', 'sc-002', 'sc-003'], events)]).toEqual([['sc-001', 'pending'], ['sc-002', 'done'], ['sc-003', 'pending']]);
  });
});
