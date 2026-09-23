import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GateAttempt, ScenarioCheckSummary } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { trackedScenarios, incompleteScenarios } from '../run/feature-files.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { declarationErrors } from '../work/declarations.js';
import { validateEngineer } from '../work/engineer.js';
import { iterationLayout } from '../work/iterations.js';
import { scenarioRecordSchema, scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import {
  consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites, established, paths, providerWrites,
  type Seam,
} from './helpers/contracts.js';
import {
  accepted, added, answeredGit, modified, unchanged, withdrawn, scenariosCommitted, type AnsweredGit, type CommitResponse,
} from './helpers/contracts-git.js';
import { passingScenarioSummary, type DirectCheckScript, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import {
  addModule, assign, byRole, completionProposed, installMiniRunner, outline, partialReport, submit, treeInputs, write,
} from './helpers/iterations.js';
import { mockGit } from './helpers/mock-git.js';
import { forkDecision, localDecision, registryChange, requestPlacement, decision } from './helpers/placement.js';
import { freeze, onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, startRun, until } from './helpers/runs.js';

/*
 * The states of the tracked scenarios, architecture §7 to §9 and §11.
 *
 * An engineer declares the scenarios its iteration bound in its completion
 * proposal, and a local architect those existing step definitions bind in
 * its completion request. A declaration makes a pending scenario `bound`
 * while its work item holds fakes and `declared` otherwise; a passing gate
 * implements a declared one and records a bound one's fake-backed pass; the
 * last verified requirement makes a bound one due; a work item that leaves
 * its repair path without a pass withdraws what it declared; completion
 * requires every scenario of its entry implemented, and the final gate every
 * tracked one, in full mode.
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
const limits = 'collection-review/workspace/reviews/limits';
const limitsDirectory = 'subs/workspace/subs/reviews/subs/limits';

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

const noteLimit: Seam = {
  capability: 'note-limit',
  name: 'NoteLimit',
  providerDirectory: limitsDirectory,
  provider: limits,
  consumerDirectory: notesDirectory,
  consumerFile: 'notes.ts',
  reach: '../../limits',
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
};

const placeTheLimit = localDecision(
  {
    question: 'Where does the note limit belong?',
    outcome: 'reuse',
    capability: 'note-limit',
    owner: limits,
    rationale: 'The limit is a rule of its own, in a subtree this architect may place work in.',
  },
  [registryChange({ capability: 'note-limit', owner: limits, behavior: 'The module provides note-limit.' })],
);

const yieldFor = (requirements: readonly string[]) => ({
  kind: 'yield-for-providers' as const,
  requirements: [...requirements],
  summary: 'This work item runs against its fakes and waits for the real provider.',
});

/** A copy of the fixture with the modules a scenario works in, each with its own test. */
async function fixtureWith(...modules: ReadonlyArray<'notes' | 'tags' | 'limits'>): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  for (const module of modules) {
    if (module === 'notes') await addModule(fixture.root, notesDirectory, 'notes', { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') });
    if (module === 'tags') await addModule(fixture.root, tagsDirectory, 'tags', { 'src/tags.ts': consumerStub, 'src/tests/tags.test.ts': consumerTest('tags.ts') });
    if (module === 'limits') await addModule(fixture.root, limitsDirectory, 'limits', {});
  }
  await installMiniRunner(fixture.root);
  return fixture.root;
}

interface RunOptions {
  readonly checkScript?: DirectCheckScript | undefined;
  /** Wraps the scenario's Git, for a double that observes or interrupts one answer. */
  readonly git?: ((git: AnsweredGit) => AnsweredGit) | undefined;
  /** Returns once the run's driver is started, for a scenario that crashes it. */
  readonly detached?: boolean | undefined;
}

/** A run whose Git answers are the scenario's own data, after the commit of the feature files. */
async function run(root: string, script: Parameters<typeof byRole>[0], commits: readonly CommitResponse[], options: RunOptions = {}) {
  const answered = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted(plan, 'scenarios-00'), ...commits] });
  const git = options.git?.(answered) ?? answered;
  const opened = await openRuns(root, {
    script: byRole(script),
    inputs: treeInputs(),
    git,
    readinessExecution: directReadinessExecution(),
    ...(options.checkScript === undefined ? {} : { checkScript: options.checkScript }),
  });
  if (options.detached !== true) cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  if (options.detached !== true) await opened.service.settled(plan, receipt.jobId);
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

/** The scenario events of the log, as `type scenario (detail)` lines. */
function scenarioLines(log: readonly RunEvent[]): string[] {
  return log.flatMap(event => {
    const data = event.data as { scenario?: string; state?: string; gate?: string; cause?: string; reason?: string; commit?: string; scenarios?: string[] };
    switch (event.type) {
      case 'scenario-declared': return [`declared ${data.scenario} ${data.state}`];
      case 'scenario-due': return [`due ${data.scenario}`];
      case 'scenario-implemented': return [`implemented ${data.scenario}`];
      case 'scenario-bound-passed': return [`bound-passed ${data.scenario}`];
      case 'scenarios-withdrawing': return [`withdrawing ${data.scenarios!.join(',')} (${data.reason})`];
      case 'scenario-withdrawn': return [`withdrawn ${data.scenario} (${data.reason}) at ${data.commit}`];
      default: return [];
    }
  });
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

describe('§7: declaring, and the iteration gate', () => {
  test('with no open requirement a declaration is declared, the gate implements it, a request declares what existing steps bind, and the final gate runs every scenario in full mode', async () => {
    const root = await fixtureWith('notes', 'tags');
    const noteFeature = featureOf(notesDirectory, 'review-note');
    const tagFeature = featureOf(tagsDirectory, 'review-tags');
    const noteSteps = stepsOf(notesDirectory, 'review-note');
    // What each scenario check found in the files when it ran, by attempt.
    const seen = new Map<string, { note: string; tag: string }>();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-tags', tags)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        // wi-001's own request declares its scenario again: it is implemented, so the declaration is ignored.
        submit({ ...requestCompletion(), scenarios: ['sc-001'] }),
        // wi-002 needs no iteration: existing step definitions bind its scenario, which the request declares.
        submit({ ...requestCompletion(), scenarios: ['sc-002'] }),
      ],
      engineer: [submit(completionProposed('The note scenario is bound.', { scenarios: ['sc-001'] }), write(noteSteps, stepFile))],
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
    const invocations = log.filter(event => event.type === 'invocation-started').map(event => event.data as { invocation: string; role: string });
    const engineer = invocations.find(invocation => invocation.role === 'engineer')!.invocation;
    const tagArchitect = invocations.filter(invocation => invocation.role === 'local-architect').at(-1)!.invocation;

    // The row "no": declared, by the invocation whose submission declared it,
    // before the gate that verifies it.
    expect(log.find(event => event.type === 'scenario-declared' && (event.data as { scenario: string }).scenario === 'sc-001')!.data)
      .toEqual({ scenario: 'sc-001', by: engineer, state: 'declared' });
    expect(at(log, 'scenario-declared', data => data.scenario === 'sc-001'))
      .toBeLessThan(at(log, 'gate-committing', data => data.gate === iterationGate.id));
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 declared', 'implemented sc-001',
      'declared sc-002 declared', 'implemented sc-002',
    ]);
    expect(log.find(event => event.type === 'scenario-implemented' && (event.data as { scenario: string }).scenario === 'sc-001')!.data)
      .toEqual({ scenario: 'sc-001', gate: iterationGate.id });
    expect(log.find(event => event.type === 'scenario-declared' && (event.data as { scenario: string }).scenario === 'sc-002')!.data)
      .toEqual({ scenario: 'sc-002', by: tagArchitect, state: 'declared' });
    expect(log.find(event => event.type === 'scenario-implemented' && (event.data as { scenario: string }).scenario === 'sc-002')!.data)
      .toEqual({ scenario: 'sc-002', gate: tagGate!.id });

    // The iteration gate selected the declared scenario by identity, in its
    // owner's run, and its commit had removed the pending tag already.
    expect(summaryOf(iterationGate)).toMatchObject({
      mode: 'quick', selection: { kind: 'identity', scenarios: ['sc-001'] },
      runs: [{ module: notes }], scenarios: [{ id: 'sc-001', status: 'passed' }], failures: [],
    });
    expect(seen.get(iterationGate.id)!.note).toContain('  @ramify-sc-001\n');
    expect(seen.get(iterationGate.id)!.tag).toContain('  @ramify-sc-002 @ramify-pending\n');
    // wi-001's work-item gate ran the implemented scenario untagged; wi-002's
    // ran its declared one once its commit removed the tag.
    expect(summaryOf(noteGate!)).toMatchObject({ selection: { kind: 'all-untagged' }, excluded: 1, scenarios: [{ id: 'sc-001', status: 'passed' }] });
    expect(seen.get(tagGate!.id)!.tag).toContain('  @ramify-sc-002\n');
    expect(summaryOf(tagGate!)!.scenarios.map(result => result.id)).toEqual(['sc-001', 'sc-002']);

    // §11: the final gate ran everything in full mode, and the run completed
    // with every tracked scenario implemented.
    expect(summaryOf(finalGate)).toMatchObject({ mode: 'full', selection: { kind: 'all' }, dryRun: false, failures: [] });
    expect(summaryOf(finalGate)!.scenarios.map(result => `${result.id} ${result.status}`)).toEqual(['sc-001 passed', 'sc-002 passed']);
    expect(log.at(-1)!.type).toBe('job-completed');
    expect(onlyRun(service, plan).counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 2 });
    expect(read(root, noteFeature)).toContain('  @ramify-sc-001\n');
    expect(read(root, tagFeature)).toContain('  @ramify-sc-002\n');
    git.assertAnswered();
  }, 120_000);
});

describe('§8: providers, fakes and bound scenarios', () => {
  test('a declaration while a requirement is open is bound and keeps its tag, passes against the fake, survives the yield, is due at requirement-verified and implemented by the work-item gate', async () => {
    const root = await fixtureWith('notes', 'limits');
    const note = paths(noteLimit);
    const feature = featureOf(notesDirectory, 'review-notes');
    const steps = stepsOf(notesDirectory, 'review-notes');
    const seen = new Map<string, string>();
    const { service, runId, git, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [placeTheLimit] }),
        submit(assign(notes, { goal: 'Bind the scenario against the fake.', scenarios: ['sc-001'] })),
        submit(yieldFor(['rq-001'])),
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real limit.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded(noteLimit)),
        submit(completionProposed('The scenario runs against the fake.', { scenarios: ['sc-001'] }), write(steps, stepFile)),
        submit(completionProposed('The real limit is implemented.'), ...providerWrites(noteLimit)),
        // A repeated declaration of a bound scenario changes nothing.
        submit(completionProposed('The notes now use the real limit.', { scenarios: ['sc-001'] }), write(note.consumer, consumerAgainstReal(noteLimit))),
      ],
      'contract-engineer': [submit(established(noteLimit), ...contractWrites(noteLimit))],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(note.contract, note.fake, note.subjects, note.conformance), ...modified(note.consumer)]),
      accepted('wi-001.i03', 'revision-02', added(steps)),
      accepted('wi-002.i01', 'revision-03', [...added(note.real), ...modified(note.subjects)]),
      unchanged('wi-002'),
      accepted('wi-001.i04', 'revision-04', modified(note.consumer)),
      accepted('wi-001', 'revision-05', modified(feature)),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind === 'scenarios') seen.set(context.attemptId, read(root, feature));
        return {};
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    const attempts = await gates(root, runId);
    const bindGate = attempts.find(attempt => attempt.subject.iteration === 'wi-001.i03')!;
    const verifyGate = attempts.find(attempt => attempt.subject.iteration === 'wi-001.i04')!;
    const itemGate = attempts.find(attempt => attempt.checkpoint === 'work-item' && attempt.subject.workItem === 'wi-001')!;
    const contractGate = attempts.find(attempt => attempt.checkpoint === 'contract')!;

    // The contract gate ran before anything was declared, so it selected nothing.
    expect(contractGate.scenarios).toBe('none-selected');
    // The row "yes": bound while rq-001 is open, and the pending tag stays,
    // yet the iteration gate selects it by identity and it passes against the fake.
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 bound', 'bound-passed sc-001', 'bound-passed sc-001', 'due sc-001', 'implemented sc-001',
    ]);
    expect(seen.get(bindGate.id)).toContain('  @ramify-sc-001 @ramify-pending\n');
    expect(summaryOf(bindGate)).toMatchObject({ selection: { kind: 'identity', scenarios: ['sc-001'] }, scenarios: [{ id: 'sc-001', status: 'passed' }] });
    expect(log.find(event => event.type === 'scenario-bound-passed')!.data).toEqual({ scenario: 'sc-001', gate: bindGate.id });

    // The provider order of §8: bound, its fake-backed pass, the yield (which
    // withdraws nothing that passed), the provider's conformance, the
    // verification's own pass with the real provider, requirement-verified,
    // due, and implemented by the work item's own gate, untagged.
    const order = [
      at(log, 'scenario-declared'),
      at(log, 'scenario-bound-passed', data => data.gate === bindGate.id),
      at(log, 'work-item-yielded'),
      at(log, 'provider-conformed'),
      at(log, 'scenario-bound-passed', data => data.gate === verifyGate.id),
      at(log, 'requirement-verified'),
      at(log, 'scenario-due'),
      at(log, 'scenario-implemented'),
      at(log, 'work-item-completed', data => data.workItem === 'wi-001'),
    ];
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(log.some(event => event.type === 'scenario-withdrawn' || event.type === 'scenarios-withdrawing')).toBe(false);
    expect(log.find(event => event.type === 'scenario-due')!.data).toEqual({ scenario: 'sc-001', cause: 'requirements-verified' });

    // The verification's gate ran it tagged, selected as bound; the work-item
    // gate ran it untagged, selected as declared, and implemented it.
    expect(seen.get(verifyGate.id)).toContain('  @ramify-sc-001 @ramify-pending\n');
    expect(seen.get(itemGate.id)).toContain('  @ramify-sc-001\n');
    expect(summaryOf(itemGate)).toMatchObject({ selection: { kind: 'all-untagged' }, scenarios: [{ id: 'sc-001', status: 'passed' }] });
    expect(log.find(event => event.type === 'scenario-implemented')!.data).toEqual({ scenario: 'sc-001', gate: itemGate.id });
    expect(onlyRun(service, plan).counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 1 });

    // The briefings: the assigned scenario under "Scenarios to bind", its
    // state as each architect turn finds it, and nothing about scenarios for
    // the provider work item.
    const sessions = agent!.sessions;
    const prompt = (role: string, start: string) => sessions.filter(session => session.spec.role === role && session.spec.prompt.startsWith(start)).map(session => session.spec.prompt);
    const assigned = JSON.parse(readFileSync(runPath(root, plan, runId, iterationLayout.assignment('wi-001', 3)), 'utf8')) as { scenarios?: string[] };
    expect(assigned.scenarios).toEqual(['sc-001']);
    expect(prompt('engineer', '# Iteration wi-001.i03')[0]).toContain('## Scenarios to bind\n\nThe architect expects this iteration to bind these:\n\n### sc-001 (pending)');
    expect(prompt('engineer', '# Iteration wi-001.i04')[0]).toContain('### sc-001 (bound)');
    const architect = prompt('local-architect', '# Work item wi-001');
    expect(architect[0]).toContain('### sc-001 (pending)');
    expect(architect.some(text => text.includes('### sc-001 (bound)'))).toBe(true);
    // After requirement-verified it is due, and the architect finds it declared.
    expect(architect.at(-1)).toContain('### sc-001 (declared)');
    for (const text of [...prompt('engineer', '# Iteration wi-002'), ...prompt('local-architect', '# Work item wi-002')]) {
      expect(text).not.toContain('## The scenarios of this work item');
      expect(text).not.toContain('## Binding a scenario');
    }
    expect(prompt('engineer', '# Iteration wi-002')).toHaveLength(1);
    git.assertAnswered();
  }, 120_000);
});

describe('rejected declarations', () => {
  test('an unknown ID and another entry\'s scenario are rejected with the reason, and counted against the per-turn bound', async () => {
    const root = await fixtureWith('notes', 'tags');
    const { service, runId, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-tags', tags)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        // A request of wi-001 that names wi-002's scenario, then its own.
        submit({ ...requestCompletion(), scenarios: ['sc-002'] }, { kind: 'submit', input: { ...requestCompletion(), scenarios: ['sc-001'] } }),
      ],
      engineer: [
        [
          { kind: 'submit', input: completionProposed('Done.', { scenarios: ['sc-099'] }) },
          { kind: 'submit', input: completionProposed('Done.', { scenarios: ['sc-001', 'sc-002'] }) },
          { kind: 'submit', input: completionProposed('Done.', { scenarios: ['sc-099'] }) },
        ],
      ],
    }, []);

    // The third rejection is the bound: the invocation ends, and the run fails.
    const snapshot = onlyRun(service, plan);
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');
    const engineer = agent!.sessions.find(session => session.spec.role === 'engineer')!;
    const answers = engineer.verdicts.map(verdict => JSON.parse((verdict as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as {
      errors: Array<{ path: string; message: string; expected?: string }>;
    });
    expect(answers[0]!.errors).toEqual([{
      path: 'scenarios.0', message: '"sc-099" is no tracked scenario of this run', expected: 'IDs among sc-001',
    }]);
    expect(answers[1]!.errors).toEqual([{
      path: 'scenarios.1', message: 'sc-002 is a scenario of review-tags, not of review-note, which this work item implements', expected: 'IDs among sc-001',
    }]);
    expect(engineer.verdicts.at(-1)).toMatchObject({ accepted: false, final: true });
    const log = await events(root, runId);
    expect(log.some(event => event.type === 'scenario-declared')).toBe(false);
    expect(log.some(event => event.type === 'gate-attempted' && (event.data as { checkpoint: string }).checkpoint === 'iteration')).toBe(false);
  }, 120_000);

  test('a local architect\'s request is judged the same way, and a corrected request is accepted', async () => {
    const root = await fixtureWith('notes', 'tags');
    const { service, runId, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes), entry('review-tags', tags)]))],
      'local-architect': [
        [
          { kind: 'submit', input: { ...requestCompletion(), scenarios: ['sc-002'] } },
          { kind: 'submit', input: { ...requestCompletion(), scenarios: ['sc-001'] } },
        ],
        submit({ ...requestCompletion(), scenarios: ['sc-002'] }),
      ],
    }, [unchanged('wi-001'), unchanged('wi-002'), unchanged(finalSubject)]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const architect = agent!.sessions.find(session => session.spec.role === 'local-architect')!;
    expect(architect.verdicts).toHaveLength(2);
    const answer = JSON.parse((architect.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string }>; remainingAttempts: number };
    expect(answer.errors).toEqual([expect.objectContaining({ path: 'scenarios.0', message: 'sc-002 is a scenario of review-tags, not of review-note, which this work item implements' })]);
    expect(answer.remainingAttempts).toBe(2);
    expect(scenarioLines(await events(root, runId))).toEqual(['declared sc-001 declared', 'implemented sc-001', 'declared sc-002 declared', 'implemented sc-002']);
  }, 120_000);

  test('an integration scenario, and any scenario for a work item without an entry, are rejected; implemented and declared ones are accepted and ignored', () => {
    const records = [
      record('sc-001', 'entry', 'review-note'),
      record('sc-002', 'entry', 'review-tags'),
      record('sc-003', 'integration', null),
    ];
    const context = { entry: 'review-note', records };
    expect(declarationErrors(['sc-003'], context)).toEqual([{
      path: 'scenarios.0',
      message: 'sc-003 is an integration scenario; it is bound by its own integration work item once its sub-scenarios are implemented, never declared by an entry\'s',
      expected: 'IDs among sc-001',
    }]);
    expect(declarationErrors(['sc-001'], { entry: null, records })).toEqual([{
      path: 'scenarios.0',
      message: 'This work item implements no entry capability, so it declares no scenario; sc-001 belongs to review-note',
      expected: 'an empty list: this work item has no scenarios',
    }]);
    // The judge's rule is by entry, not by state: its own scenario is accepted
    // in every state, and the harness ignores the ones it cannot move.
    expect(declarationErrors(['sc-001', 'sc-001'], context)).toEqual([]);
    const judged = validateEngineer({ kind: 'completion-proposed', summary: 'Done.', findings: [], scenarios: ['sc-003'] }, { scenarios: context });
    expect(judged.ok).toBe(false);
    expect(validateEngineer({ kind: 'completion-proposed', summary: 'Done.', findings: [] }, { scenarios: context }))
      .toEqual({ ok: true, value: { kind: 'completion-proposed', summary: 'Done.', findings: [], scenarios: [] } });
  });
});

describe('§7: withdrawal', () => {
  test('by exhaustion: the iteration spends its repair rounds, and "Withdraw sc-001" restores the pending tag at once', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    const failing = new Set<string>();
    let atWithdrawal: string | undefined;
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        submit(assign(notes, { kind: 'repair', goal: 'Bind the last step for real.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(completionProposed('Bound, I believe.', { scenarios: ['sc-001'] }), write(steps, stepFile)),
        submit(completionProposed('Bound, I still believe.', { scenarios: ['sc-001'] })),
        submit(completionProposed('Bound, once more.', { scenarios: ['sc-001'] })),
        submit(completionProposed('The last step is bound.', { scenarios: ['sc-001'] }), write(steps, `${stepFile}// bound\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001.i01'),
      unchanged('wi-001.i01'),
      withdrawn(['sc-001'], 'revision-02', [feature]),
      accepted('wi-001.i02', 'revision-03', [...modified(steps), ...modified(feature)]),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration') return {};
        failing.add(context.attemptId);
        return failing.size <= 3 ? failingScenario(check, 'sc-001') : {};
      },
      git: answered => Object.assign(Object.create(answered) as AnsweredGit, {
        commitAccepted: async (project: string, message: string) => {
          if (message.startsWith('Withdraw')) atWithdrawal = read(root, feature);
          return answered.commitAccepted(project, message);
        },
      }),
    });

    const log = await events(root, runId);
    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 declared',
      'withdrawing sc-001 (repair-exhausted)', 'withdrawn sc-001 (repair-exhausted) at revision-02',
      'declared sc-001 declared', 'implemented sc-001',
    ]);
    // The iteration closed exhausted, and the withdrawal followed before the
    // local architect's next turn.
    const closed = at(log, 'iteration-closed', data => data.iteration === 'wi-001.i01');
    expect((log[closed]!.data as { outcome: string }).outcome).toBe('exhausted');
    expect(at(log, 'scenarios-withdrawing')).toBe(closed + 1);
    expect(log[closed + 3]!.type).toBe('invocation-started');
    expect(log[at(log, 'scenarios-withdrawing')]!.data).toEqual({ withdrawal: 1, workItem: 'wi-001', scenarios: ['sc-001'], reason: 'repair-exhausted' });

    // The commit: its own subject, the file, the run's trailer and the
    // withdrawal's, no gate's; the tree it committed carries the tag again.
    const message = git.messages().find(text => text.startsWith('Withdraw'))!;
    expect(message.split('\n')[0]).toBe('Withdraw sc-001');
    expect(message).toContain(`\n  ${feature}\n`);
    expect(message).toContain(`\nRamify-Run: ${runId}\nRamify-Scenarios: withdrawn-1\n`);
    expect(message).not.toContain('Ramify-Gate');
    expect(atWithdrawal).toContain('  @ramify-sc-001 @ramify-pending\n');
    // It is an effect of the ledger, and it is not an accepted boundary: the
    // next engineer starts from the last passing gate's commit.
    const lines = (await readFile(runPath(root, plan, runId, runLayout.events), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { event: { type: string }; effect?: { key: string; phase: string } });
    expect(lines.filter(line => line.effect?.key === 'scenarios-withdraw:1').map(line => `${line.effect!.phase} ${line.event.type}`))
      .toEqual(['intent scenarios-withdrawing', 'completion scenario-withdrawn']);
    const repairer = JSON.parse(await readFile(runPath(root, plan, runId, runLayout.invocation(
      (log.filter(event => event.type === 'invocation-started' && (event.data as { role: string }).role === 'engineer').at(-1)!.data as { invocation: string }).invocation,
    )), 'utf8')) as { base: string };
    expect(repairer.base).toBe('scenarios-00');
    git.assertAnswered();
  }, 120_000);

  test('by a placement request: a declared scenario whose gate failed is withdrawn with its commit before the request', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    let failed = false;
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        submit(requestPlacement({
          forCapability: 'review-note',
          question: 'Does formatting a note belong in the notes module?',
          requiredBehavior: 'A note is shown as the reviewer wrote it.',
          candidates: [{ owner: notes, note: 'It holds the notes.' }],
        })),
        submit(assign(notes, { goal: 'Bind the scenario where the decision placed the work.' })),
        submit(requestCompletion()),
      ],
      'global-fork': [submit(forkDecision({
        decision: decision({
          question: 'Does formatting a note belong in the notes module?', capability: 'review-note', owner: notes,
          evidence: { citations: [{ module: notes }], gaps: [] },
        }),
      }))],
      engineer: [
        submit(completionProposed('Bound, I believe.', { scenarios: ['sc-001'] }), write(steps, stepFile)),
        submit(partialReport(['the step file'], ['the last step needs a decision on where formatting belongs'])),
        submit(completionProposed('The last step is bound.', { scenarios: ['sc-001'] }), write(steps, `${stepFile}// bound\n`)),
      ],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      withdrawn(['sc-001'], 'revision-02', [feature]),
      accepted('wi-001.i02', 'revision-03', [...modified(steps), ...modified(feature)]),
      unchanged('wi-001'),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration' || failed) return {};
        failed = true;
        return failingScenario(check, 'sc-001');
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 declared',
      'withdrawing sc-001 (placement-requested)', 'withdrawn sc-001 (placement-requested) at revision-02',
      'declared sc-001 declared', 'implemented sc-001',
    ]);
    expect(at(log, 'scenario-withdrawn')).toBeLessThan(at(log, 'placement-requested'));
    expect(git.subjects()).toContain('Withdraw sc-001');
    git.assertAnswered();
  }, 120_000);

  test('by a yield: a bound scenario no gate passed is withdrawn; its tag never left the tree, so it names the accepted boundary and commits nothing', async () => {
    const root = await fixtureWith('notes', 'limits');
    const note = paths(noteLimit);
    const steps = stepsOf(notesDirectory, 'review-notes');
    const feature = featureOf(notesDirectory, 'review-notes');
    let failed = false;
    const { service, runId, git, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
      'local-architect': [
        submit({ ...assign(notes, {}, outline()), localDecisions: [placeTheLimit] }),
        submit(assign(notes, { goal: 'Bind the scenario against the fake.', scenarios: ['sc-001'] })),
        submit(yieldFor(['rq-001'])),
        submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real limit, and bind the scenario.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded(noteLimit)),
        submit(completionProposed('The scenario runs against the fake.', { scenarios: ['sc-001'] }), write(steps, stepFile)),
        submit(partialReport(['the step file'], ['the last step'])),
        submit(completionProposed('The real limit is implemented.'), ...providerWrites(noteLimit)),
        submit(completionProposed('The notes use the real limit, and the scenario is bound.', { scenarios: ['sc-001'] }),
          write(note.consumer, consumerAgainstReal(noteLimit))),
      ],
      'contract-engineer': [submit(established(noteLimit), ...contractWrites(noteLimit))],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(note.contract, note.fake, note.subjects, note.conformance), ...modified(note.consumer)]),
      accepted('wi-001.i03', 'revision-02', added(steps)),
      accepted('wi-002.i01', 'revision-03', [...added(note.real), ...modified(note.subjects)]),
      unchanged('wi-002'),
      accepted('wi-001.i04', 'revision-04', modified(note.consumer)),
      accepted('wi-001', 'revision-05', modified(feature)),
      unchanged(finalSubject),
    ], {
      checkScript: ({ check, context }) => {
        if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration' || failed) return {};
        failed = true;
        return failingScenario(check, 'sc-001');
      },
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await events(root, runId);
    // The contract gate's commit is the accepted boundary when the work item yields.
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 bound',
      'withdrawn sc-001 (yielded) at revision-01',
      'declared sc-001 bound', 'bound-passed sc-001', 'due sc-001', 'implemented sc-001',
    ]);
    expect(at(log, 'scenario-withdrawn')).toBe(at(log, 'work-item-yielded') - 1);
    expect(log.some(event => event.type === 'scenarios-withdrawing')).toBe(false);
    expect(git.subjects().some(subject => subject.startsWith('Withdraw'))).toBe(false);
    git.assertAnswered();
  }, 120_000);
});

describe('§9: work-item completion', () => {
  test('a request is refused while a scenario of its entry is pending, with the reason in the next turn; one that declares it completes', async () => {
    const root = await fixtureWith('notes');
    const { service, runId, agent } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit({ ...requestCompletion(), scenarios: [] }),
        submit(requestCompletion()),
      ],
    }, [unchanged('wi-001'), unchanged(finalSubject)]);

    expect(onlyRun(service, plan).state).toBe('completed');
    const architects = agent!.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects).toHaveLength(2);
    expect(architects[1]!.spec.prompt).toContain('## Completion was refused');
    expect(architects[1]!.spec.prompt).toContain('- sc-001 is pending: nothing has declared it; declare it with the request where existing step definitions bind it, or assign an iteration that writes them');
    const log = await events(root, runId);
    // The refused request ran no gate and wrote no outline.
    expect(log.filter(event => event.type === 'outline-revised')).toHaveLength(1);
    expect(log.filter(event => event.type === 'gate-attempted' && (event.data as { checkpoint: string }).checkpoint === 'work-item')).toHaveLength(1);
    expect(scenarioLines(log)).toEqual(['declared sc-001 declared', 'implemented sc-001']);
  }, 120_000);

  test('refused beyond the bound, the run fails with the scenarios as evidence', async () => {
    const root = await fixtureWith('notes');
    const { service } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit({ ...requestCompletion(), scenarios: [] })],
    }, []);
    const snapshot = onlyRun(service, plan);
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure).toMatchObject({
      reason: 'acceptance-incomplete',
      evidence: ['scenarios/sc-001.json'],
    });
    expect(snapshot.failure!.message).toContain('wi-001 asked for completion 4 times with scenarios of its entry not implemented: sc-001 is pending');
  }, 120_000);

  test('an implemented scenario that fails a later gate fails that gate as a regression, and stays implemented', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    let regressions = 0;
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [
        submit(assign(notes, {}, outline())),
        submit(requestCompletion()),
        submit(requestCompletion()),
      ],
      engineer: [submit(completionProposed('Bound.', { scenarios: ['sc-001'] }), write(steps, stepFile))],
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
    // The failure changed no state: no withdrawal, no second declaration, and
    // the file kept no pending tag.
    expect(scenarioLines(await events(root, runId))).toEqual(['declared sc-001 declared', 'implemented sc-001']);
    expect(read(root, feature)).toContain('  @ramify-sc-001\n');
    git.assertAnswered();
  }, 120_000);
});

describe('§11: the final gate', () => {
  test('acceptance-incomplete: a tracked scenario that is not implemented, integration scenarios included, is named with its record as evidence', () => {
    const records = [record('sc-001', 'entry', 'review-note'), record('sc-002', 'entry', 'review-tags'), record('sc-003', 'integration', null)];
    const tracked = { records, entries: [], states: new Map([['sc-001', 'implemented'], ['sc-002', 'declared'], ['sc-003', 'pending']] as const) };
    expect(incompleteScenarios(tracked)).toEqual([
      { id: 'sc-002', entry: 'review-tags', state: 'declared', evidence: 'scenarios/sc-002.json' },
      { id: 'sc-003', entry: null, state: 'pending', evidence: 'scenarios/sc-003.json' },
    ]);
    expect(incompleteScenarios({ ...tracked, states: new Map([['sc-001', 'implemented'], ['sc-002', 'implemented'], ['sc-003', 'pending']] as const) }))
      .toEqual([{ id: 'sc-003', entry: null, state: 'pending', evidence: 'scenarios/sc-003.json' }]);
    expect(incompleteScenarios({ ...tracked, states: new Map([['sc-001', 'implemented'], ['sc-002', 'implemented'], ['sc-003', 'implemented']] as const) })).toEqual([]);
  });

  test('a passing final gate whose scenario check did not pass a tracked scenario does not complete the run', async () => {
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
    expect(snapshot.state).toBe('failed');
    const finalGate = (await gates(root, runId)).find(attempt => attempt.checkpoint === 'final')!;
    expect(finalGate.verdict).toBe('passed');
    expect(snapshot.failure).toEqual({
      reason: 'acceptance-incomplete',
      message: 'The final gate passed, and its scenario check does not prove the plan\'s scenarios: sc-001 did not pass in it',
      evidence: [runLayout.gate(finalGate.id)],
    });
    expect((await events(root, runId)).some(event => event.type === 'job-completed')).toBe(false);
  }, 120_000);
});

describe('§12: a crash between the withdrawal commit and its record', () => {
  test('recovery finds the commit by its trailers, records every withdrawal with it and makes no second commit', async () => {
    const root = await fixtureWith('notes');
    const feature = featureOf(notesDirectory, 'review-note');
    const steps = stepsOf(notesDirectory, 'review-note');
    let committed = false;
    const { runId } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-note', notes)]))],
      'local-architect': [submit(assign(notes, {}, outline()))],
      engineer: [submit(completionProposed('Bound, I believe.', { scenarios: ['sc-001'] }), write(steps, stepFile))],
    }, [
      accepted('wi-001.i01', 'revision-01', [...added(steps), ...modified(feature)]),
      unchanged('wi-001.i01'),
      unchanged('wi-001.i01'),
      withdrawn(['sc-001'], 'revision-02', [feature]),
    ], {
      detached: true,
      checkScript: ({ check }) => (check.kind === 'scenarios' ? failingScenario(check, 'sc-001') : {}),
      // Git makes the commit, and the harness stops before it hears back.
      git: answered => Object.assign(Object.create(answered) as AnsweredGit, {
        commitAccepted: async (project: string, message: string) => {
          const made = await answered.commitAccepted(project, message);
          if (!message.startsWith('Withdraw')) return made;
          committed = true;
          return freeze().then(() => made);
        },
      }),
    });
    await until(() => committed, 60_000);
    await staleCrashLock(root);

    const lookups: string[] = [];
    const recoveryGit = mockGit({
      async findCommitByTrailers(_project, trailers) {
        lookups.push(trailers.map(trailer => `${trailer.key}: ${trailer.value}`).join(', '));
        return 'revision-02';
      },
      async currentHead() { return 'revision-02'; },
    });
    const reopened = await openRuns(root, { git: recoveryGit, inputs: treeInputs(), readinessExecution: directReadinessExecution() });
    cleanups.push(() => reopened.service.close());
    expect(reopened.recovery.effects).toEqual([`${plan}/${runId}: the withdrawal commit of sc-001`]);
    expect(lookups).toEqual([`Ramify-Run: ${runId}, Ramify-Scenarios: withdrawn-1`]);
    expect(recoveryGit.commitAccepted).not.toHaveBeenCalled();
    const log = await events(root, runId);
    expect(scenarioLines(log)).toEqual([
      'declared sc-001 declared', 'withdrawing sc-001 (repair-exhausted)', 'withdrawn sc-001 (repair-exhausted) at revision-02',
    ]);
    expect(log.at(-1)!.type).toBe('job-interrupted');
    expect(read(root, feature)).toContain('  @ramify-sc-001 @ramify-pending\n');
    expect(trackedScenarios((await readFile(runPath(root, plan, runId, runLayout.events), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { event: { type: string; data: unknown }; records: Array<{ body: unknown }> })
      .map(line => ({ transaction: { event: line.event, records: line.records } }))).states.get('sc-001')).toBe('pending');
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
    origin: kind === 'entry' ? { kind: 'architect', refs: [{ anchor: 'Acceptance' }] } : { kind: 'plan', planScenario: 'ps-01', ref: { lines: [1, 4] } },
    partOf: null,
    subScenarios: kind === 'entry' ? [] : ['sc-001', 'sc-002'],
    name: id,
    source,
    hash: scenarioSourceHash(source),
    file: kind === 'entry' ? featureOf(notesDirectory, entryName!) : `${notesDirectory}/src/tests/features/${plan}/integration.feature`,
  });
}
