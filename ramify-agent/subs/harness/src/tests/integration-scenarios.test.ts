import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PlannedCheck } from '../checks/verify.js';
import { workItemListResponseSchema } from '../interfaces/protocol/runs.js';
import { RunQueries } from '../projections/queries.js';
import { runLayout } from '../run/records.js';
import { assignmentErrors } from '../work/assignment.js';
import { declarationErrors } from '../work/declarations.js';
import { childrenOnPaths, dueIntegrations, integrationScopeOf, integrationWorkItem, stepDirectoryOf } from '../work/integration.js';
import { iterationLayout } from '../work/iterations.js';
import type { WorkItem } from '../work/records.js';
import { scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { RunEvent } from '../run/log.js';
import { requestCompletion } from './helpers/analysis.js';
import { accepted, modified, unchanged } from './helpers/contracts-git.js';
import { passingScenarioSummary, type DirectCheckStep } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import {
  at, bindAtAncestor, bindCommit, bindTurn, entryCommits, entryTurns, featureOf, finalSubject, gates, integrationFeature,
  integrationProject, noteFeature, notes, noteSteps, notesDirectory, plan, planScenario, reviews, reviewsDirectory, runIntegration,
  summaryOf, tagFeature, tags, tagsDirectory, tagSteps, tagStepFile, type Cleanups,
} from './helpers/integration-scenario.js';
import { assign, completionProposed, submit, write } from './helpers/iterations.js';
import { onlyRun, runEventsOnDisk, runPath } from './helpers/runs.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * Integration scenarios, architecture §10, on the scenario of
 * `helpers/integration-scenario.ts`: a note is written in one module and
 * tagged in its sibling, and the plan's scenario combines the two.
 *
 * The last sub-scenario's implementation creates the integration work item
 * at their common ancestor, queued behind the item that implemented it. Its
 * local architect is briefed with the scenario, the sub-scenarios, their
 * owners and those owners' step files, and its engineer works at the
 * ancestor with the children on both paths in scope. A failure of the
 * integration scenario while its sub-scenarios pass is a composition
 * failure, reported with the sub-scenario whose bridging Given is suspect.
 * No process starts here; the real checker's verdict on what the engineer
 * wrote is `integration-scenarios-integration.test.ts`'s.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Cleanups = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const project = () => integrationProject(cleanups);
const run = (root: string, ...rest: Parameters<typeof runIntegration> extends [Cleanups, string, ...infer R] ? R : never) => runIntegration(cleanups, root, ...rest);

/** A scenario check whose runs reached the integration scenario and failed it, while everything else passed. */
function failingIntegration(check: PlannedCheck): DirectCheckStep {
  const passing = passingScenarioSummary(check);
  return {
    outcome: { kind: 'completed', exitCode: 1 },
    scenarios: {
      ...passing,
      scenarios: passing.scenarios.map(result => (result.id !== 'sc-003' ? result : {
        ...result, status: 'failed' as const, failure: { step: 'Then the outcome review-tags promises is shown', message: 'expected the tag on the note, got no note' },
      })),
      failures: ['sc-003 failed at "Then the outcome review-tags promises is shown": expected the tag on the note, got no note'],
    },
  };
}

describe('the integration work item', () => {
  test('created by the last sub-scenario\'s implementation at the common ancestor, queued, briefed, bound at the ancestor, implemented by its iteration gate, and completed', async () => {
    const root = await project();
    const { service, runId, git, agent } = await run(root, {
      ...entryTurns,
      // The first assignment leaves out the path to the tags' owner and is
      // refused with the scope the harness expects; the second is accepted.
      'local-architect:wi-003': [
        submit(bindAtAncestor, { kind: 'submit', input: { ...bindAtAncestor, assignment: { ...bindAtAncestor.assignment, scope: { ...bindAtAncestor.assignment.scope, base: { module: reviews, includedChildren: [notes] } } } } }),
        submit(requestCompletion()),
      ],
      'engineer:wi-003': [bindTurn],
    }, [...entryCommits, bindCommit, unchanged('wi-003'), unchanged(finalSubject)]);

    const snapshot = onlyRun(service, plan);
    expect(snapshot.failure).toBeNull();
    expect(snapshot.state).toBe('completed');
    const log = await runEventsOnDisk(root, plan, runId);
    const attempts = await gates(root, runId, log);

    // Creation: the scenario-implemented of sc-002, the last sub-scenario,
    // committed the work item beside it, and no earlier event did.
    const lines = (await readFile(runPath(root, plan, runId, runLayout.events), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { event: RunEvent; records: Array<{ path: string; body: unknown }> });
    const creating = lines.filter(line => line.records.some(record => record.path === 'work-items/wi-003/item.json'));
    expect(creating.map(line => [line.event.type, (line.event.data as { scenario?: string }).scenario])).toEqual([['scenario-implemented', 'sc-002']]);
    const tagIterationGate = attempts.find(attempt => attempt.subject.iteration === 'wi-002.i01')!;
    expect(creating[0]!.event.data).toEqual({ scenario: 'sc-002', gate: tagIterationGate.id });
    // At the ancestor, with the scenario's ID in place of an entry and the plan's lines as its acceptance.
    const item = creating[0]!.records.find(record => record.path === 'work-items/wi-003/item.json')!.body as WorkItem;
    expect(item).toMatchObject({ id: 'wi-003', module: reviews, origin: { integration: 'sc-003' }, requirementRefs: [], startedFor: null });
    expect(item.acceptanceRefs).toHaveLength(1);

    // Queueing: the item that implemented the last sub-scenario completed
    // first; the integration work item started after it, with its origin.
    expect(at(log, 'scenario-implemented', data => data.scenario === 'sc-002')).toBeLessThan(at(log, 'work-item-completed', data => data.workItem === 'wi-002'));
    expect(at(log, 'work-item-completed', data => data.workItem === 'wi-002')).toBeLessThan(at(log, 'work-item-started', data => data.workItem === 'wi-003'));
    expect(log.filter(event => event.type === 'work-item-started').map(event => event.data)).toEqual([
      { workItem: 'wi-001', module: notes, origin: 'entry' },
      { workItem: 'wi-002', module: tags, origin: 'entry' },
      { workItem: 'wi-003', module: reviews, origin: 'integration', scenario: 'sc-003' },
    ]);

    // The briefing: the scenario, its sub-scenarios and their owners, the
    // bridging Given, the owners' step files as the tree held them, and the
    // scope the engineer must be given.
    const sessions = agent!.sessions;
    const briefing = sessions.find(session => session.spec.role === 'local-architect' && session.spec.prompt.startsWith('# Work item wi-003'))!.spec.prompt;
    expect(briefing).toContain(`## The integration scenario sc-003: A written note is shown with its tag`);
    expect(briefing).toContain(['```gherkin', ...planScenario, '```'].join('\n'));
    expect(briefing).toContain(`The harness wrote it into \`${integrationFeature}\``);
    expect(briefing).toContain(`- \`sc-001\` (A note is written for tagging), owned by \`${notes}\`, in \`${noteFeature}\`.\n`);
    expect(briefing).toContain(`- \`sc-002\` (A written note is tagged), owned by \`${tags}\`, in \`${tagFeature}\`. Its bridging Given, stating what another entry leaves instead of taking its action: "Given a note was written with review-note".`);
    expect(briefing).toContain(`- \`${notes}\`, in \`${notesDirectory}/src/tests/steps/\`: \`${noteSteps}\`.`);
    expect(briefing).toContain(`- \`${tags}\`, in \`${tagsDirectory}/src/tests/steps/\`: \`${tagSteps}\`.`);
    expect(briefing).toContain(`Assign an iteration whose scope base is \`${reviews}\` with the children \`${notes}\`, \`${tags}\` included`);
    expect(briefing).toContain(`writes a step file in \`${reviewsDirectory}/src/tests/steps/\``);
    // Its origin is the integration scenario, so it has no entry scenarios of its own.
    expect(briefing).not.toContain('## The scenarios of this work item');
    // An entry's local architect is given its entry's scenario, and the integration scenario it came from.
    const entryBriefing = sessions.find(session => session.spec.role === 'local-architect' && session.spec.prompt.startsWith('# Work item wi-001'))!.spec.prompt;
    expect(entryBriefing).toContain('## The scenarios of this work item');
    expect(entryBriefing).toContain(`### sc-001 (pending): A note is written for tagging\n\n- Feature file: \`${noteFeature}\`.\n- A sub-scenario of the integration scenario \`sc-003\``);
    // Its engineer, each scenario not implemented and the rules; the
    // integration item's engineer, the scenario and the step files it imports.
    const engineerOf = (iteration: string) => sessions.find(session => session.spec.role === 'engineer' && session.spec.prompt.startsWith(`# Iteration ${iteration}`))!.spec.prompt;
    expect(engineerOf('wi-001.i01')).toContain('### sc-001 (pending): A note is written for tagging');
    expect(engineerOf('wi-001.i01')).toContain('## Binding a scenario');
    const binder = engineerOf('wi-003.i01');
    expect(binder).toContain('## The integration scenario to bind: sc-003 (pending): A written note is shown with its tag');
    expect(binder).toContain(`- \`${notes}\`, in \`${notesDirectory}/src/tests/steps/\`: \`${noteSteps}\`.`);
    expect(binder).toContain(`- Write one step file in \`${reviewsDirectory}/src/tests/steps/\``);
    expect(binder).not.toContain('## Binding a scenario');
    // The narrower scope was refused through the judge, with the one expected.
    const architect = sessions.find(session => session.spec.prompt.startsWith('# Work item wi-003'))!;
    const refused = JSON.parse((architect.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string; expected: string }> };
    expect(refused.errors).toEqual([{
      path: 'assignment.scope.base.includedChildren',
      message: `The scope leaves out "${tags}", on the path to a sub-scenario's owner whose step files the scenario imports`,
      expected: `the base { module: "${reviews}", includedChildren: ["${notes}", "${tags}"] }`,
    }]);

    // The engineer's scope, the declaration, and the iteration gate that ran
    // the ancestor's feature file with the scenario selected by identity,
    // beside the implemented sub-scenarios of its children.
    const assignment = JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.assignment('wi-003', 1)), 'utf8')) as { scope: { base: unknown } };
    expect(assignment.scope.base).toEqual({ module: reviews, includedChildren: [notes, tags] });
    const bindGate = attempts.find(attempt => attempt.subject.iteration === 'wi-003.i01')!;
    expect(summaryOf(bindGate)).toMatchObject({ selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002', 'sc-003'] }, failures: [] });
    expect(summaryOf(bindGate)!.runs.map(one => one.module).sort()).toEqual([reviews, notes, tags].sort());
    expect(summaryOf(bindGate)!.scenarios.find(result => result.id === 'sc-003')).toMatchObject({ run: reviews, status: 'passed' });
    const engineer = log.filter(event => event.type === 'invocation-started' && (event.data as { role: string }).role === 'engineer').at(-1)!.data as { invocation: string };
    expect(log.filter(event => event.type === 'scenario-declared' || event.type === 'scenario-implemented').map(event => `${event.type} ${(event.data as { scenario: string }).scenario}`)).toEqual([
      'scenario-declared sc-001', 'scenario-implemented sc-001',
      'scenario-declared sc-002', 'scenario-implemented sc-002',
      'scenario-declared sc-003', 'scenario-implemented sc-003',
    ]);
    expect(log.find(event => event.type === 'scenario-declared' && (event.data as { scenario: string }).scenario === 'sc-003')!.data)
      .toEqual({ scenario: 'sc-003', by: engineer.invocation, state: 'declared' });
    expect(log.find(event => event.type === 'scenario-implemented' && (event.data as { scenario: string }).scenario === 'sc-003')!.data)
      .toEqual({ scenario: 'sc-003', gate: bindGate.id });

    // The work item completed at its own work-item gate, and the final gate
    // ran every scenario in full mode with the integration scenario required.
    expect(at(log, 'work-item-completed', data => data.workItem === 'wi-003')).toBeGreaterThan(at(log, 'scenario-implemented', data => data.scenario === 'sc-003'));
    const finalGate = attempts.find(attempt => attempt.checkpoint === 'final')!;
    expect(summaryOf(finalGate)!.scenarios.map(result => `${result.id} ${result.status}`).sort()).toEqual(['sc-001 passed', 'sc-002 passed', 'sc-003 passed']);
    expect(log.at(-1)!.type).toBe('job-completed');
    expect(snapshot.counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 3 });
    // The work items a client reads: the integration one by its origin, with no capability of its own.
    const listed = workItemListResponseSchema.parse(await new RunQueries(service).workItems(plan, runId));
    expect(listed.workItems.map(one => [one.id, one.module, one.origin, one.capability, one.state])).toEqual([
      ['wi-001', notes, 'entry', 'review-note', 'completed'],
      ['wi-002', tags, 'entry', 'review-tags', 'completed'],
      ['wi-003', reviews, 'integration', null, 'completed'],
    ]);
    expect(readFileSync(join(root, integrationFeature), 'utf8')).toContain('  @ramify-sc-003\n');
    git.assertAnswered();
  }, 120_000);

  test('a composition failure: the integration scenario fails while its sub-scenarios pass, the finding names the bridging Given, and the repair round resolves it', async () => {
    const root = await project();
    let failed = false;
    const { service, runId, git, agent } = await run(root, {
      ...entryTurns,
      'local-architect:wi-003': [submit(bindAtAncestor), submit(requestCompletion())],
      'engineer:wi-003': [
        bindTurn,
        submit(completionProposed('The bridging Given now writes the note the way review-note does.', { scenarios: ['sc-003'] }),
          write(tagSteps, tagStepFile.replace("Given('a note was written with review-note', () => {});", "Given('a note was written with review-note', () => { /* write it as review-note does */ });"))),
      ],
    }, [...entryCommits, bindCommit, accepted('wi-003.i01', 'revision-04', modified(tagSteps)), unchanged('wi-003'), unchanged(finalSubject)],
    ({ check, context }) => {
      if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration' || failed) return {};
      if (!(check.scenarios?.selection.kind === 'identity' && check.scenarios.selection.scenarios.includes('sc-003'))) return {};
      failed = true;
      return failingIntegration(check);
    });

    expect(onlyRun(service, plan).failure).toBeNull();
    expect(onlyRun(service, plan).state).toBe('completed');
    const log = await runEventsOnDisk(root, plan, runId);
    const attempts = (await gates(root, runId, log)).filter(attempt => attempt.subject.iteration === 'wi-003.i01');
    expect(attempts.map(attempt => attempt.verdict)).toEqual(['failed', 'passed']);
    expect(summaryOf(attempts[0]!)!.scenarios.map(result => `${result.id} ${result.status}`)).toEqual(['sc-001 passed', 'sc-002 passed', 'sc-003 failed']);

    // The repair round's briefing carries the finding: the failure is a
    // composition failure, and the tags' bridging Given is the suspect.
    const repair = agent!.sessions.filter(session => session.spec.role === 'engineer' && session.spec.prompt.includes('wi-003')).at(-1)!.spec.prompt;
    expect(repair).toContain('- composition failure: `sc-003` failed while its sub-scenarios `sc-001`, `sc-002` passed, so their step definitions work one by one and not together.');
    expect(repair).toContain('  - The bridging Given of `sc-002` is suspect: "Given a note was written with review-note" assumes what the real behavior may not do.');
    expect(repair).not.toContain('The bridging Given of `sc-001`');
    // And the failing scenario itself, with its name, file, line, step and
    // message; each passing one with its binding.
    expect(repair).toMatch(/ {2}- `sc-003` "A written note is shown with its tag" failed, at `[^`]+\.feature:\d+`:\n {4}- The failing step: `Then the outcome review-tags promises is shown`\.\n {4}- Its message: expected the tag on the note, got no note/);
    expect(repair).toMatch(/ {2}- `sc-001` "A note is written for tagging" passed/);
    // The scenario stayed declared through the repair and was implemented by the passing attempt.
    expect(log.filter(event => (event.type === 'scenario-declared' || event.type === 'scenario-implemented') && (event.data as { scenario: string }).scenario === 'sc-003')
      .map(event => event.type)).toEqual(['scenario-declared', 'scenario-implemented']);
    expect(log.find(event => event.type === 'scenario-implemented' && (event.data as { scenario: string }).scenario === 'sc-003')!.data)
      .toEqual({ scenario: 'sc-003', gate: attempts[1]!.id });
    expect(at(log, 'work-item-completed', data => data.workItem === 'wi-003')).toBeGreaterThan(0);
    git.assertAnswered();
  }, 120_000);
});

describe('the rules, over literal records', () => {
  const source = (name: string) => [`Scenario: ${name}`, '  Given a note', '  When it is tagged', '  Then the tag is shown'];
  const scenario = (id: string, kind: ScenarioRecord['kind'], owner: string, extra: Partial<ScenarioRecord> = {}): ScenarioRecord => ({
    schema: 'ramify-agent.scenario/1',
    id,
    kind,
    entry: kind === 'entry' ? `entry-${id}` : null,
    owner,
    origin: kind === 'entry' ? { kind: 'architect', refs: [] } : { kind: 'plan', planScenario: 'ps-01', ref: { lines: [12, 17] } },
    partOf: null,
    subScenarios: [],
    name: id,
    source: source(id),
    hash: scenarioSourceHash(source(id)),
    file: kind === 'entry' ? featureOf(`${reviewsDirectory}/subs/${owner.split('/').at(-1)!}`, `entry-${id}`) : integrationFeature,
    ...extra,
  });
  const deep = `${reviews}/core/tasks`;
  const records = [
    scenario('sc-001', 'entry', notes, { partOf: 'sc-004' }),
    scenario('sc-002', 'entry', deep, { partOf: 'sc-004' }),
    scenario('sc-003', 'entry', tags),
    scenario('sc-004', 'integration', reviews, { subScenarios: ['sc-001', 'sc-002'] }),
  ];

  test('an integration scenario is due once every sub-scenario is implemented and it has no work item yet; its item is at its owner', () => {
    const states = (second: 'declared' | 'implemented') => new Map([['sc-001', 'implemented'], ['sc-002', second], ['sc-003', 'pending'], ['sc-004', 'pending']] as const);
    expect(dueIntegrations(records, states('declared'), [])).toEqual([]);
    expect(dueIntegrations(records, states('implemented'), []).map(record => record.id)).toEqual(['sc-004']);
    const item = integrationWorkItem(records[3]!, 3);
    expect(item).toMatchObject({ id: 'wi-004', module: reviews, origin: { integration: 'sc-004' }, acceptanceRefs: [{ lines: [12, 17] }], startedFor: null });
    expect(dueIntegrations(records, states('implemented'), [item])).toEqual([]);
  });

  test('the engineer\'s scope is the ancestor with the direct child on each path, and a step directory sits beside its features', () => {
    expect(childrenOnPaths(reviews, [notes, deep, `${reviews}/core/controller`, reviews])).toEqual([notes, `${reviews}/core`]);
    expect(integrationScopeOf(records[3]!, records)).toEqual({ module: reviews, includedChildren: [notes, `${reviews}/core`] });
    expect(stepDirectoryOf(integrationFeature)).toBe(`${reviewsDirectory}/src/tests/steps`);
    expect(stepDirectoryOf('subs/integration-tests/src/features/review-notes/integration.feature')).toBe('subs/integration-tests/src/steps');

    const index = architectIndex([
      moduleEntry(reviews, reviewsDirectory, null),
      moduleEntry(notes, notesDirectory, reviews),
      moduleEntry(`${reviews}/core`, `${reviewsDirectory}/subs/core`, reviews),
    ]);
    const body = (base: { module: string; includedChildren: string[] }) => ({
      ...assign(base.module).assignment,
      scope: { base, extra: [], read: [], rationale: 'r' },
    });
    const evidence = { index, registry: new Map(), outline: null, integration: integrationScopeOf(records[3]!, records) };
    expect(assignmentErrors(body({ module: reviews, includedChildren: [notes, `${reviews}/core`] }), evidence)).toEqual([]);
    expect(assignmentErrors(body({ module: notes, includedChildren: [] }), evidence).map(error => error.path)).toEqual(['assignment.scope.base']);
  });

  test('an integration work item declares its own scenario and nothing else; an entry\'s work item still cannot declare one', () => {
    const context = { entry: null, integration: 'sc-004', records };
    expect(declarationErrors(['sc-004', 'sc-004'], context)).toEqual([]);
    expect(declarationErrors(['sc-001', 'sc-009'], context)).toEqual([
      { path: 'scenarios.0', message: `sc-001 is an entry scenario of entry-sc-001; this integration work item binds sc-004 alone`, expected: 'IDs among sc-004' },
      { path: 'scenarios.1', message: '"sc-009" is no tracked scenario of this run', expected: 'IDs among sc-004' },
    ]);
    expect(declarationErrors(['sc-004'], { entry: 'entry-sc-001', records }).map(error => error.message))
      .toEqual(['sc-004 is an integration scenario; it is bound by its own integration work item once its sub-scenarios are implemented, never declared by an entry\'s']);
  });
});
