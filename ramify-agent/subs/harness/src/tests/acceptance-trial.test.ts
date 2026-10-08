import { readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import { scenarioResultsOf } from '../checks/scenario-results.js';
import { scenarioListResponseSchema } from '../interfaces/protocol/runs.js';
import { RunQueries } from '../projections/queries.js';
import type { RunEvent } from '../run/log.js';
import { runLayout, type ReadinessAttempt } from '../run/records.js';
import { requestCompletion } from './helpers/analysis.js';
import {
  badgeAnalysis, badgeFeature, badgeImplementation, badgePlan, badgeStepFile, badgeSteps, sharedUi,
} from './helpers/badge-scenarios.js';
import {
  consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites, established, paths, providerWrites, type Seam,
} from './helpers/contracts.js';
import { accepted, added, answeredGit, modified, scenariosCommitted, unchanged, type CommitResponse } from './helpers/contracts-git.js';
import type { DirectCheckScript, ScriptedScenario } from './helpers/direct-check-execution.js';
import { copyFixture } from './helpers/fixture.js';
import {
  ancestorSteps, bindAtAncestor, bindTurn, integrationFeature, integrationAnalysis, noteFeature, noteSteps, noteStepFile, notes, notesDirectory,
  notesModule, plan, planScenario, reviews, tagFeature, tagSteps, tagStepFile, tags, tagsDirectory, tagsModule,
} from './helpers/integration-scenario.js';
import { addModule, assign, byWork, completionProposed, outline, partialReport, submit, treeInputs, write } from './helpers/iterations.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { approveRun, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, until } from './helpers/runs.js';
import { finalCandidate } from './helpers/final-candidate.js';

/*
 * The scripted acceptance trial, Plan 10's runnable outcome: one run on a
 * copy of the collection-review fixture that passes through every stage of
 * the acceptance scenarios with scripted agents.
 *
 * The run starts with the review stop and waits there until it is approved.
 * Readiness passes its configuration and audit steps, and the plan's feature files
 * are materialized. The plan states one integration scenario over two
 * entries, a note and its tags, which the analysis decomposes into one
 * sub-scenario each. The note's work item needs a limit it does not own: a
 * contract gives it a fake, and its engineer binds the sub-scenario against
 * that fake, so the scenario is `bound` with the fake on record. Its first
 * gate fails the scenario, the work item yields, and the scenario stays
 * `bound`: no gate or yield moves a state. The provider implements the
 * limit, the note's verification binds the sub-scenario again with no fake,
 * and the local architect reports it `done`. The tags' work item spends its
 * repair rounds with the scenario still `bound`, binds it again in a repair
 * iteration, and its architect reports it done; the second sub-scenario
 * reported done creates the integration work item at their common
 * ancestor, which binds the integration scenario through `expose-test`. The
 * final gate asks for the full audit, whose scenario check passes all three.
 *
 * Git is answered from the trial's own data. Every gate asks the scripted
 * configured audit, whose scenario check reports each scenario the tree
 * carries without its pending tag, as the project's own configured check
 * would run it. The harness runs no scenario itself.
 *
 * A second, smaller run binds the fixture plan `status-badge-tone`'s own two
 * scenarios in `shared-ui`.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const limits = 'collection-review/workspace/reviews/limits';
const limitsDirectory = 'subs/workspace/subs/reviews/subs/limits';
const finalSubject = (planId: string) => `final verification of plan "${planId}"`;

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
const note = paths(noteLimit);

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

/** A copy of the fixture with the trial's modules and plan scenario, and the toolchain its gates run. */
async function trialProject(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const root = fixture.root;
  await addModule(root, notesDirectory, 'notes', { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') });
  await addModule(root, tagsDirectory, 'tags', { 'src/tags.ts': consumerStub, 'src/tests/tags.test.ts': consumerTest('tags.ts') });
  await addModule(root, limitsDirectory, 'limits', {});
  const planPath = join(root, 'plans', plan, 'plan.md');
  await writeFile(planPath, [(await readFile(planPath, 'utf8')).trimEnd(), '', '## Scenarios', '', '```gherkin', ...planScenario, '```', ''].join('\n'));
  return root;
}

/** A plain copy of the fixture, for the badge's plan. */
async function badgeProject(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  return fixture.root;
}

/** Every tracked scenario the tree carries without its pending tag, passed where its feature file states it. */
function runnableScenarios(root: string): ScriptedScenario[] {
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter(path => path.endsWith('.feature') && !path.split('/').includes('node_modules'))
    .sort();
  return files.flatMap(file => readFileSync(join(root, file), 'utf8').split('\n').flatMap((text, index) => {
    const tags = text.trim().split(/\s+/);
    const identity = tags.find(tag => /^@ramify-sc-\d{3,}$/.test(tag));
    if (identity === undefined || tags.includes('@ramify-pending')) return [];
    return [{ id: identity.slice('@ramify-'.length), status: 'passed' as const, file, line: index + 1 }];
  }));
}

/**
 * The trial's configured audit: every check passes, and the scenario check
 * runs every runnable scenario. The first iteration gates whose scenario
 * check runs a scenario of `failing` fail it at its last step, as many
 * times as it says.
 */
function trialAudit(root: string, failing: Readonly<Record<string, number>>): DirectCheckScript {
  const left = new Map(Object.entries(failing));
  const step = 'Then the outcome promised is shown';
  return ({ check, context }) => {
    if (check.kind !== 'scenarios') return {};
    const scenarios = runnableScenarios(root);
    const id = context.checkpoint !== 'iteration' ? undefined
      : scenarios.map(scenario => scenario.id).find(scenario => (left.get(scenario) ?? 0) > 0);
    if (id === undefined) return { scenarios };
    left.set(id, left.get(id)! - 1);
    return {
      outcome: { kind: 'completed', exitCode: 1 },
      scenarios: scenarios.map(result => (result.id !== id ? result
        : { ...result, status: 'failed' as const, failure: { step, message: 'expected the outcome, got nothing' } })),
    };
  };
}

interface Trial {
  readonly root: string;
  readonly planId: string;
  readonly runId: string;
  readonly log: RunEvent[];
  readonly service: Awaited<ReturnType<typeof openRuns>>['service'];
  readonly git: ReturnType<typeof answeredGit>;
  readonly waiting: { phase: string | undefined; branch: string | null; commits: number };
}

/** Starts the plan with the review stop, approves it at the stop, and runs it to its end. */
async function reviewedRun(root: string, planId: string, script: Parameters<typeof byWork>[0], commits: readonly CommitResponse[], failing: Readonly<Record<string, number>>): Promise<Trial> {
  const before = commits.slice(0, -1).flatMap(commit => commit.commit ?? []).at(-1) ?? 'scenarios-00';
  const final = finalCandidate(root, before, commits.at(-1)?.commit ?? before);
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted(planId, 'scenarios-00'), ...commits],
    previews: final.previews });
  const opened = await openRuns(root, {
    script: byWork(script),
    inputs: treeInputs(),
    git,
    candidates: final.candidates,
    checkScript: trialAudit(root, failing),
    stopGraceMs: 30_000,
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(planId, 'scripted', undefined, true));
  await until(() => opened.service.getRun(planId, receipt.jobId)?.phase === 'awaiting-review');
  const waiting = { phase: opened.service.getRun(planId, receipt.jobId)?.phase, branch: git.branch(), commits: git.messages().length };
  await opened.service.execute(approveRun(planId, receipt.jobId, opened.service.getRun(planId, receipt.jobId)!.version, 'dana@example.com', 'The scenarios state the plan.'));
  await opened.service.settled(planId, receipt.jobId);
  return { root, planId, runId: receipt.jobId, log: await runEventsOnDisk(root, planId, receipt.jobId), service: opened.service, git, waiting };
}

async function gateOf(trial: Trial, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(trial.root, trial.planId, trial.runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

/**
 * The run's course as the events record it: the review, readiness,
 * materialization, each work item's start and completion, every scenario
 * event, the requirements and the end.
 */
function course(log: readonly RunEvent[]): string[] {
  return log.flatMap(event => {
    const data = event.data as Record<string, unknown>;
    switch (event.type) {
      case 'analysis-accepted': return [`analysis-accepted ${String(data['scenarios'])} scenarios`];
      case 'review-requested':
      case 'readiness-passed':
      case 'scenarios-materialized':
      case 'job-completed':
        return [event.type];
      case 'analysis-approved': return [`analysis-approved by ${String(data['reviewer'])}`];
      case 'work-item-started': return [`work-item-started ${String(data['workItem'])} (${String(data['origin'])}${data['scenario'] === undefined ? '' : ` ${String(data['scenario'])}`})`];
      case 'work-item-yielded':
      case 'work-item-completed':
        return [`${event.type} ${String(data['workItem'])}`];
      case 'contract-registered': return [`contract-registered ${(data['requirements'] as string[]).join(',')} (provider ${String(data['providerWorkItem'])})`];
      case 'work-item-resumed': return [`work-item-resumed ${String(data['workItem'])}`];
      case 'provider-conformed': return [`provider-conformed ${String(data['workItem'])}`];
      case 'iteration-closed': return data['outcome'] === 'accepted' ? [] : [`iteration-closed ${String(data['iteration'])} ${String(data['outcome'])}`];
      case 'requirement-verified': return [`requirement-verified ${String(data['requirement'])}`];
      case 'obligation-bound': {
        const fakes = data['fakes'] as string[];
        return [`bound ${String(data['id'])} (${fakes.length === 0 ? 'no fakes' : fakes.join(', ')})`];
      }
      case 'obligation-reported': return [`reported ${String(data['id'])} ${String(data['judgment'])}`];
      default: return [];
    }
  });
}

/** The trial's agents, per work item. */
const trialScript = (root: string) => ({
  'initial-architect': [submit(integrationAnalysis())],
  // wi-001, the note: a contract for the limit, the sub-scenario bound
  // against its fake, a yield, and the verification that rebinds it for real.
  'local-architect:wi-001': [
    submit({ ...assign(notes, {}, outline()), localDecisions: [placeTheLimit] }),
    submit(assign(notes, { goal: 'Bind the note\'s sub-scenario against the fake.', obligations: ['sc-001'] })),
    submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'This work item runs against its fake and waits for the real limit.' }),
    submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real limit, and bind the sub-scenario.', obligations: ['sc-001'] })),
    submit(requestCompletion()),
  ],
  'engineer:wi-001': [
    submit(contractNeeded(noteLimit)),
    submit(completionProposed('The sub-scenario runs against the fake.', { bindings: [{ id: 'sc-001', fakes: [`create${noteLimit.name}Fake`] }] }),
      write('tests/steps/review-note.steps.ts', noteStepFile)),
    submit(partialReport(['the step file'], ['the last step'])),
    submit(completionProposed('The notes use the real limit, and the sub-scenario is bound.', { bindings: [{ id: 'sc-001' }] }),
      write('notes.ts', consumerAgainstReal(noteLimit))),
  ],
  'contract-engineer': [submit(established(noteLimit), ...contractWrites(noteLimit))],
  // wi-002, the tags: the first iteration spends its repair rounds and the
  // scenario stays bound; a repair iteration binds it again.
  'local-architect:wi-002': [
    submit(assign(tags, { obligations: ['sc-002'] }, outline())),
    submit(assign(tags, { kind: 'repair', goal: 'Bind the last step of the tags\' sub-scenario for real.', obligations: ['sc-002'] })),
    submit(requestCompletion()),
  ],
  'engineer:wi-002': [
    submit(completionProposed('The tags\' sub-scenario is bound, I believe.', { bindings: [{ id: 'sc-002' }] }), write('tests/steps/review-tags.steps.ts', tagStepFile)),
    submit(completionProposed('Bound, I still believe.', { bindings: [{ id: 'sc-002' }] })),
    submit(completionProposed('Bound, once more.', { bindings: [{ id: 'sc-002' }] })),
    submit(completionProposed('The tags\' sub-scenario is bound.', { bindings: [{ id: 'sc-002' }] }), write('tests/steps/review-tags.steps.ts', `${tagStepFile}// bound\n`)),
  ],
  // wi-003, the limit's provider.
  'local-architect:wi-003': [submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))), submit(requestCompletion())],
  'engineer:wi-003': [submit(completionProposed('The real limit is implemented.'), ...providerWrites(noteLimit, root))],
  // wi-004, the integration work item at the common ancestor.
  'local-architect:wi-004': [submit(bindAtAncestor), submit(requestCompletion())],
  'engineer:wi-004': [bindTurn],
});

const trialCommits: CommitResponse[] = [
  accepted('wi-001.i02', 'revision-01', [...added(note.contract, note.fake, note.subjects, note.conformance), ...modified(note.consumer)]),
  accepted('wi-001.i03', 'revision-02', [...added(noteSteps), ...modified(noteFeature)]),
  accepted('wi-003.i01', 'revision-03', [...added(note.real), ...modified(note.subjects)]),
  unchanged('wi-003'),
  accepted('wi-001.i04', 'revision-04', modified(note.consumer)),
  unchanged('wi-001'),
  accepted('wi-002.i01', 'revision-05', [...added(tagSteps), ...modified(tagFeature)]),
  unchanged('wi-002.i01'),
  unchanged('wi-002.i01'),
  accepted('wi-002.i02', 'revision-06', modified(tagSteps)),
  unchanged('wi-002'),
  accepted('wi-004.i01', 'revision-07', [...added(ancestorSteps), ...modified(notesModule, tagsModule, integrationFeature)]),
  unchanged('wi-004'),
  unchanged(finalSubject(plan)),
];

/** The iteration gates that fail a scenario: the note's first, the tags' first three. */
const trialFailures = { 'sc-001': 1, 'sc-002': 3 };

/** What the trial asserts. */
async function expectTrial(trial: Trial): Promise<void> {
  const { service, log, root } = trial;
  const snapshot = onlyRun(service, plan);
  expect(snapshot.failure).toBeNull();
  expect(snapshot.state).toBe('completed');

  // The review stop: nothing was written to the tree while the run waited.
  expect(trial.waiting).toEqual({ phase: 'awaiting-review', branch: null, commits: 0 });
  expect(snapshot.review).toMatchObject({ reviewer: 'dana@example.com', duringRun: false });

  // Configured audit readiness passed, with no scenario runner of the harness's own.
  const readiness = JSON.parse(await readFile(runPath(root, plan, trial.runId, runLayout.readiness(1)), 'utf8')) as ReadinessAttempt;
  const steps = new Map(readiness.steps.map(step => [step.step, step.outcome]));
  expect((['project-config', 'audit-config', 'configured-full-audit'] as const).map(step => `${step} ${steps.get(step)}`))
    .toEqual(['project-config passed', 'audit-config passed', 'configured-full-audit passed']);
  expect(readiness.steps.map(step => step.step)).not.toContain('acceptance-runner');

  // The course of the run.
  expect(course(log)).toEqual([
    'analysis-accepted 3 scenarios',
    'review-requested',
    'analysis-approved by dana@example.com',
    'readiness-passed',
    'scenarios-materialized',
    'work-item-started wi-001 (entry)',
    'iteration-closed wi-001.i01 partial',
    'contract-registered rq-001 (provider wi-003)',
    'bound sc-001 (createNoteLimitFake)',
    'iteration-closed wi-001.i03 partial',
    'work-item-yielded wi-001',
    'work-item-started wi-003 (obligation)',
    'provider-conformed wi-003',
    'work-item-completed wi-003',
    'work-item-resumed wi-001',
    'bound sc-001 (no fakes)',
    'requirement-verified rq-001',
    'reported sc-001 done',
    'work-item-completed wi-001',
    'work-item-started wi-002 (entry)',
    'bound sc-002 (no fakes)',
    'bound sc-002 (no fakes)',
    'bound sc-002 (no fakes)',
    'iteration-closed wi-002.i01 exhausted',
    'bound sc-002 (no fakes)',
    'reported sc-002 done',
    'work-item-completed wi-002',
    'work-item-started wi-004 (integration sc-003)',
    'bound sc-003 (no fakes)',
    'reported sc-003 done',
    'work-item-completed wi-004',
    'job-completed',
  ]);

  // The feature files were committed once, before the first work item.
  expect(trial.git.subjects()[0]).toBe(`Scenarios of ${plan}`);
  expect(trial.git.messages()[0]).toContain('\nRamify-Scenarios: materialized');
  // No gate, yield or exhausted iteration restored a tag: nothing was withdrawn.
  expect(trial.git.messages().filter(message => message.startsWith('Withdraw'))).toEqual([]);

  // The final states: every scenario reported done, untagged in its file, and
  // passed by the final gate's full audit.
  expect(snapshot.counts.scenarios).toEqual({ pending: 0, bound: 0, done: 3 });
  const list = scenarioListResponseSchema.parse(await new RunQueries(service).scenarios(plan, trial.runId));
  expect(list.scenarios.map(scenario => `${scenario.id} ${scenario.kind} ${scenario.state} ${scenario.workItem} ${scenario.owner}`)).toEqual([
    `sc-001 entry done wi-001 ${notes}`,
    `sc-002 entry done wi-002 ${tags}`,
    `sc-003 integration done wi-004 ${reviews}`,
  ]);
  for (const [file, id] of [[noteFeature, 'sc-001'], [tagFeature, 'sc-002'], [integrationFeature, 'sc-003']] as const) {
    expect(readFileSync(join(root, file), 'utf8')).toContain(`  @ramify-${id}\n`);
    expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/^ +@ramify-sc-\d+ @ramify-pending$/mu);
  }
  const final = await gateOf(trial, (log.find(event => event.type === 'job-completed')!.data as { gate: string }).gate);
  expect(final.checkpoint).toBe('final');
  expect(final.commands).toEqual([]);
  expect(final.audit).toMatchObject({ mode: 'full', status: 'completed', verdict: 'pass' });
  expect(scenarioResultsOf(final).map(result => `${result.id} ${result.status} ${result.check} ${result.file}`).sort()).toEqual([
    `sc-001 passed scenarios ${noteFeature}`, `sc-002 passed scenarios ${tagFeature}`, `sc-003 passed scenarios ${integrationFeature}`,
  ]);
  // Plan 11's disk-backed provider witness: query the same completed scripted
  // run that drove real workflow records, then cross one bounded page boundary.
  const queries = new RunQueries(service);
  const execution = await queries.executionMap(plan, trial.runId);
  expect(execution.nodes.filter(node => node.kind === 'capability' && node.level === 'entry').map(node => node.key))
    .toEqual(['capability:review-note', 'capability:review-tags']);
  expect(execution.nodes.filter(node => node.kind === 'capability' && node.level === 'lower').map(node => node.key))
    .toContain('capability:note-limit');
  expect(execution.nodes.filter(node => node.kind === 'session').length).toBeGreaterThan(0);
  expect(execution.nodes.filter(node => node.kind === 'gate').length).toBeGreaterThan(1);
  expect(execution.nodes.find(node => node.key === 'requirement:rq-001')).toMatchObject({ state: 'verified', providerStage: 'conformed' });
  expect(execution.links.some(link => link.kind === 'provider-for' && link.from.key === 'capability:note-limit')).toBe(true);
  expect((await queries.executionCapabilityDetail(plan, trial.runId, 'review-note', execution.runVersion)).detail.state).toBe('available');
  const noteScenario = await queries.executionScenarioDetail(plan, trial.runId, 'sc-001', execution.runVersion);
  expect(noteScenario.detail).toMatchObject({ state: 'available' });
  if (noteScenario.detail.state === 'available') {
    expect(noteScenario.detail.source.join('\n')).toContain('Scenario:');
    expect(noteScenario.detail.gates.some(gate => gate.check === 'scenarios' && gate.status === 'passed')).toBe(true);
  }
  const firstPage = await queries.executionMapPage(plan, trial.runId, { version: execution.runVersion, limit: 1 });
  expect(firstPage.nextCursor).not.toBeNull();
  const secondPage = await queries.executionMapPage(plan, trial.runId,
    { version: execution.runVersion, cursor: firstPage.nextCursor, limit: 1 });
  expect(secondPage.cursor).toBe(firstPage.nextCursor);
  expect(new Set([...firstPage.nodes, ...secondPage.nodes].map(node => node.key)).size)
    .toBe(firstPage.nodes.length + secondPage.nodes.length);
  if (process.env.PLAN11_EXECUTION_EXPORT) {
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await queries.executionMapPage(plan, trial.runId,
        { version: execution.runVersion, cursor, limit: 10 });
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const capabilities = Object.fromEntries(await Promise.all(execution.nodes.filter(node => node.kind === 'capability').map(async node => [
      node.key.slice('capability:'.length), await queries.executionCapabilityDetail(plan, trial.runId,
        node.key.slice('capability:'.length), execution.runVersion),
    ] as const)));
    const scenarios = Object.fromEntries(await Promise.all(execution.nodes.filter(node => node.kind === 'scenario').map(async node => [
      node.key.slice('scenario:'.length), await queries.executionScenarioDetail(plan, trial.runId,
        node.key.slice('scenario:'.length), execution.runVersion),
    ] as const)));
    await writeFile(process.env.PLAN11_EXECUTION_EXPORT, JSON.stringify({ planId: plan, runId: trial.runId,
      pages, capabilities, scenarios }, null, 2));
  }
  trial.git.assertAnswered();
}

/** The badge's plan: one work item binds both plan scenarios in one iteration. */
async function badgeRun(root: string): Promise<Trial> {
  const implementation = await badgeImplementation();
  return reviewedRun(root, badgePlan, {
    'initial-architect': [submit(await badgeAnalysis())],
    'local-architect:wi-001': [
      submit(assign(sharedUi, { goal: 'Give the status badge a tone, with tests of its own, and bind the plan\'s two scenarios.', obligations: ['sc-001', 'sc-002'] }, outline({
        changes: 'The badge takes an optional tone and carries it as data-tone; it reads as neutral without one.',
      }))),
      submit(requestCompletion()),
    ],
    'engineer:wi-001': [submit(
      completionProposed('The badge carries its tone, neutral by default, and both scenarios bind to its step file.', { bindings: [{ id: 'sc-001' }, { id: 'sc-002' }] }),
      ...Object.entries(implementation).map(([path, content]) => write(join(root, path), content)),
      write(join(root, badgeSteps), badgeStepFile),
    )],
  }, [
    accepted('wi-001.i01', 'revision-01', [
      ...added(badgeSteps, ...Object.keys(implementation).filter(path => path.includes('/tests/'))),
      ...modified(badgeFeature, ...Object.keys(implementation).filter(path => !path.includes('/tests/'))),
    ]),
    unchanged('wi-001'),
    unchanged(finalSubject(badgePlan)),
  ], {});
}

async function expectBadgeRun(trial: Trial): Promise<void> {
  const snapshot = onlyRun(trial.service, badgePlan);
  expect(snapshot.failure).toBeNull();
  expect(snapshot.state).toBe('completed');
  expect(course(trial.log)).toEqual([
    'analysis-accepted 2 scenarios', 'review-requested', 'analysis-approved by dana@example.com', 'readiness-passed', 'scenarios-materialized',
    'work-item-started wi-001 (entry)',
    'bound sc-001 (no fakes)', 'bound sc-002 (no fakes)',
    'reported sc-001 done', 'reported sc-002 done',
    'work-item-completed wi-001', 'job-completed',
  ]);
  // The plan's own text, in the badge owner's feature file.
  const feature = readFileSync(join(trial.root, badgeFeature), 'utf8');
  expect(feature).toContain('  @ramify-sc-001\n  Scenario: A badge given a tone carries that tone in its markup\n');
  expect(feature).toContain('    Then its markup carries the tone "neutral"\n');
  const final = await gateOf(trial, (trial.log.find(event => event.type === 'job-completed')!.data as { gate: string }).gate);
  expect(final.audit).toMatchObject({ mode: 'full', status: 'completed', verdict: 'pass' });
  expect(scenarioResultsOf(final).map(result => `${result.id} ${result.status} ${result.file}`)).toEqual([`sc-001 passed ${badgeFeature}`, `sc-002 passed ${badgeFeature}`]);
  trial.git.assertAnswered();
}

describe('the scripted acceptance trial', () => {
  test('passes the review stop, readiness, materialization, a binding over a fake, done reports, an exhausted iteration that leaves a binding, an integration work item and the final gate\'s full audit', async () => {
    const root = await trialProject();
    await expectTrial(await reviewedRun(root, plan, trialScript(root), trialCommits, trialFailures));
  }, 120_000);

  test('status-badge-tone: the plan\'s two scenarios are bound in shared-ui and pass the final gate\'s full audit', async () => {
    await expectBadgeRun(await badgeRun(await badgeProject()));
  }, 120_000);
});
