import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../http/app.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, gateResponseSchema, runEventPageSchema, scenarioListResponseSchema,
  type ScenarioGateResult,
} from '../interfaces/protocol/runs.js';
import { runView } from '../projections/inputs.js';
import { capabilityProgressOf } from '../projections/progress.js';
import { RunQueries } from '../projections/queries.js';
import { analysisScenariosOf, scenarioListOf } from '../projections/scenarios.js';
import { scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { requestCompletion } from './helpers/analysis.js';
import { accepted, modified, unchanged } from './helpers/contracts-git.js';
import { at as recordAt, constructedRun, item, registered, type Line } from './helpers/constructed.js';
import { passingScenarioSummary, type DirectCheckScript } from './helpers/direct-check-execution.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import {
  bindAtAncestor, bindCommit, bindTurn, entryCommits, entryTurns, finalSubject, integrationFeature, integrationProject, noteFeature, notes, plan, planScenario,
  reviews, runIntegration, tagFeature, tags, tagStepFile, tagSteps, type Cleanups,
} from './helpers/integration-scenario.js';
import { completionProposed, submit, write } from './helpers/iterations.js';

/*
 * The scenarios a client reads, Plan 10 iteration 10: the scenario list with
 * each scenario's state and the gates that ran it, the review's frozen text
 * and warnings on the analysis, each entry's scenario count in the
 * capability progress, the compact summary on a gate attempt, and the
 * scenario references of projected events.
 *
 * The scripted run is the composition failure of
 * `helpers/integration-scenario.ts`: two entry sub-scenarios bound in their
 * own modules, and the integration scenario bound at their ancestor, which
 * fails once while its sub-scenarios pass and passes at the repair round.
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

const failure = { step: 'Then the outcome review-tags promises is shown', message: 'expected the tag on the note, got no note' };

/** The integration scenario's first iteration gate fails it while its sub-scenarios pass. */
function failingOnce(): DirectCheckScript {
  let failed = false;
  return ({ check, context }) => {
    if (check.kind !== 'scenarios' || context.checkpoint !== 'iteration' || failed) return {};
    if (!(check.scenarios?.selection.kind === 'identity' && check.scenarios.selection.scenarios.includes('sc-003'))) return {};
    failed = true;
    const passing = passingScenarioSummary(check);
    return {
      outcome: { kind: 'completed', exitCode: 1 },
      scenarios: {
        ...passing,
        scenarios: passing.scenarios.map(result => (result.id !== 'sc-003' ? result : { ...result, status: 'failed' as const, failure })),
        failures: [`sc-003 failed at "${failure.step}": ${failure.message}`],
      },
    };
  };
}

async function composedRun() {
  const root = await integrationProject(cleanups);
  const opened = await runIntegration(cleanups, root, {
    ...entryTurns,
    'local-architect:wi-003': [submit(bindAtAncestor), submit(requestCompletion())],
    'engineer:wi-003': [
      bindTurn,
      submit(completionProposed('The bridging Given now writes the note.', { scenarios: ['sc-003'] }),
        write(tagSteps, tagStepFile.replace("Given('a note was written with review-note', () => {});", "Given('a note was written with review-note', () => { /* as review-note does */ });"))),
    ],
  }, [...entryCommits, bindCommit, accepted('wi-003.i01', 'revision-04', modified(tagSteps)), unchanged('wi-003'), unchanged(finalSubject)],
  failingOnce());
  return { root, ...opened };
}

const where = (gate: ScenarioGateResult) => [gate.checkpoint, gate.subject.iteration ?? gate.subject.workItem ?? null, gate.mode, gate.status];

describe('over a scripted run with an integration scenario', () => {
  test('the scenario list, the review, the progress counts, the gate summary and the event references agree with the run', async () => {
    const { service, runId } = await composedRun();
    const queries = new RunQueries(service);
    const snapshot = await queries.run(plan, runId);
    expect(snapshot.run.state).toBe('completed');

    // The scenario list: every tracked scenario with its state, origin, work item, owner and file.
    const list = scenarioListResponseSchema.parse(await queries.scenarios(plan, runId));
    expect(list.total).toBe(3);
    expect(list.scenarios.map(one => [one.id, one.kind, one.state, one.entry, one.partOf, one.subScenarios, one.workItem, one.owner, one.file])).toEqual([
      ['sc-001', 'entry', 'implemented', 'review-note', 'sc-003', [], 'wi-001', notes, noteFeature],
      ['sc-002', 'entry', 'implemented', 'review-tags', 'sc-003', [], 'wi-002', tags, tagFeature],
      ['sc-003', 'integration', 'implemented', null, null, ['sc-001', 'sc-002'], 'wi-003', reviews, integrationFeature],
    ]);
    expect(list.scenarios[0]!.origin).toEqual({ kind: 'architect', refs: [{ anchor: 'Acceptance' }] });
    const [first, , integration] = list.scenarios;
    expect(integration!.origin).toMatchObject({ kind: 'plan', planScenario: 'ps-01' });
    expect(integration!.name).toBe('A written note is shown with its tag');

    // The gates each ran in, with the status the attempt's summary gives
    // the scenario there: the integration scenario failed at its first
    // iteration gate while its sub-scenarios passed, and passed at the repair.
    const bindGates = integration!.gates.filter(gate => gate.subject.iteration === 'wi-003.i01');
    expect(bindGates.map(gate => [gate.status, gate.verdict, gate.failure])).toEqual([['failed', 'failed', failure], ['passed', 'passed', null]]);
    expect(integration!.implementedBy).toBe(bindGates[1]!.gate);
    expect(integration!.gates.map(where)).toEqual([
      ['iteration', 'wi-003.i01', 'quick', 'failed'],
      ['iteration', 'wi-003.i01', 'quick', 'passed'],
      ['work-item', 'wi-003', 'quick', 'passed'],
      ['final', null, 'full', 'passed'],
    ]);
    const firstBind = bindGates[0]!.gate;
    expect(first!.gates.find(gate => gate.gate === firstBind)).toMatchObject({ status: 'passed', verdict: 'failed' });
    expect(first!.gates.map(where)[0]).toEqual(['iteration', 'wi-001.i01', 'quick', 'passed']);
    expect(first!.gates.at(-1)).toMatchObject({ checkpoint: 'final', mode: 'full', status: 'passed', dryRun: false });
    expect(first!.implementedBy).toBe(first!.gates[0]!.gate);

    // The review: the frozen text of each scenario, the integration
    // scenario's being the plan's, beside its sub-scenarios.
    const analysis = analysisResponseSchema.parse(await queries.analysis(plan, runId)).analysis;
    if (analysis.status !== 'accepted') throw new Error('The analysis is accepted');
    expect(analysis.total.scenarios).toBe(3);
    expect(analysis.warnings).toEqual([]);
    expect(analysis.scenarios.map(one => [one.id, one.kind, one.entry, one.partOf, one.subScenarios])).toEqual([
      ['sc-001', 'entry', 'review-note', 'sc-003', []],
      ['sc-002', 'entry', 'review-tags', 'sc-003', []],
      ['sc-003', 'integration', null, null, ['sc-001', 'sc-002']],
    ]);
    expect(analysis.scenarios[2]!.source.map(line => line.trim())).toEqual(planScenario.map(line => line.trim()));
    expect(analysis.scenarios[1]!.source.map(line => line.trim())).toContain('Given a note was written with review-note');

    // Each entry's scenarios, implemented of all it has.
    const capabilities = capabilityListResponseSchema.parse(await queries.capabilities(plan, runId)).capabilities;
    expect(capabilities.filter(row => row.entry).map(row => [row.capability, row.scenarios])).toEqual([
      ['review-note', { implemented: 1, total: 1 }],
      ['review-tags', { implemented: 1, total: 1 }],
    ]);
    expect(capabilities.filter(row => !row.entry).every(row => row.scenarios === null)).toBe(true);

    // The failing attempt carries its summary in compact form; the other commands carry none.
    const gate = gateResponseSchema.parse(await queries.gate(plan, runId, firstBind)).gate;
    const scenarioCommand = gate.commands.find(command => command.kind === 'scenarios')!;
    expect(gate.commands.filter(command => command.kind !== 'scenarios').every(command => command.scenarios === null)).toBe(true);
    expect(scenarioCommand.scenarios).toMatchObject({
      mode: 'quick', dryRun: false, selection: { kind: 'identity', scenarios: ['sc-001', 'sc-002', 'sc-003'] },
      failures: [`sc-003 failed at "${failure.step}": ${failure.message}`],
    });
    expect(scenarioCommand.scenarios!.runs.map(run => run.module).sort()).toEqual([reviews, notes, tags].sort());
    expect(scenarioCommand.scenarios!.scenarios.map(result => [result.id, result.status, result.failure])).toEqual([
      ['sc-001', 'passed', null], ['sc-002', 'passed', null], ['sc-003', 'failed', failure],
    ]);

    // The projected events refer to the scenarios they move.
    const events = runEventPageSchema.parse(await queries.events(plan, runId, 0)).events;
    const refsOf = (transition: string) => events.filter(event => event.transition === transition).map(event => event.refs.filter(ref => ref.kind === 'scenario').map(ref => ref.id));
    expect(refsOf('scenario-declared')).toEqual([['sc-001'], ['sc-002'], ['sc-003']]);
    expect(refsOf('scenario-implemented')).toEqual([['sc-001'], ['sc-002'], ['sc-003']]);
    expect(refsOf('work-item-started')).toEqual([[], [], ['sc-003']]);

    // Over HTTP, the same answer.
    const server = createApp({ projectRoot: service.projectRoot, runs: service }).listen(0);
    try {
      await new Promise(resolve => server.once('listening', resolve));
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${protocolPaths.runScenarios(plan, runId)}`);
      expect(response.status).toBe(200);
      expect(scenarioListResponseSchema.parse(await response.json())).toEqual(list);
      const missing = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${protocolPaths.runScenarios(plan, '20990101T000000Z-000000')}`);
      expect(missing.status).toBe(404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }, 120_000);
});

describe('over constructed records', () => {
  const source = (name: string) => [`Scenario: ${name}`, '  Given a note', '  When it is written', '  Then it is shown'];
  const record = (id: string, entry: string | null, extra: Partial<ScenarioRecord> = {}): ScenarioRecord => ({
    schema: 'ramify-agent.scenario/1',
    id,
    kind: entry === null ? 'integration' : 'entry',
    entry,
    owner: reviews,
    origin: entry === null ? { kind: 'plan', planScenario: 'ps-01', ref: { lines: [12, 16] } } : { kind: 'architect', refs: [{ lines: [3, 4] }] },
    partOf: null,
    subScenarios: [],
    name: id,
    source: source(id),
    hash: scenarioSourceHash(source(id)),
    file: `subs/workspace/subs/reviews/src/tests/features/${plan}/${entry ?? 'integration'}.feature`,
    ...extra,
  });
  const warning = { kind: 'duplicate-architect-steps', scenarios: ['sc-002', 'sc-003'], message: 'sc-002 and sc-003 have identical steps' };
  const lines: Line[] = [
    { type: 'job-started', data: {} },
    {
      type: 'analysis-accepted', data: { invocation: 'inv-0001', entries: 2, hypotheses: 0, registry: 3, workItems: 2, scenarios: 5, warnings: [warning] },
      records: [
        { path: recordAt('registry', 'write-note'), body: registered('write-note') },
        { path: recordAt('registry', 'show-note'), body: registered('show-note') },
        { path: recordAt('registry', 'store-note'), body: registered('store-note', { origin: 'global-decision', decision: 'gd-001' }) },
        { path: 'work-items/wi-001/item.json', body: item('wi-001', { entry: 'write-note' }) },
        { path: 'work-items/wi-002/item.json', body: item('wi-002', { entry: 'show-note' }) },
        ...[
          record('sc-001', 'write-note', { partOf: 'sc-005' }),
          record('sc-002', 'show-note', { partOf: 'sc-005' }),
          record('sc-003', 'show-note'),
          record('sc-004', 'show-note'),
          record('sc-005', null, { subScenarios: ['sc-001', 'sc-002'] }),
        ].map(body => ({ path: `scenarios/${body.id}.json`, body })),
      ],
    },
    { type: 'scenario-declared', data: { scenario: 'sc-001', by: 'inv-0003', state: 'declared' } },
    { type: 'scenario-implemented', data: { scenario: 'sc-001', gate: 'ga-0003' } },
    { type: 'scenario-declared', data: { scenario: 'sc-002', by: 'inv-0005', state: 'bound' } },
    { type: 'scenario-declared', data: { scenario: 'sc-003', by: 'inv-0005', state: 'declared' } },
  ];

  test('every state, the entry\'s work item, an integration scenario without its work item yet, and no gate that did not run it', () => {
    const list = scenarioListResponseSchema.parse(scenarioListOf(runView(constructedRun(lines))));
    expect(list.scenarios.map(one => [one.id, one.state, one.workItem, one.implementedBy, one.gates])).toEqual([
      ['sc-001', 'implemented', 'wi-001', 'ga-0003', []],
      ['sc-002', 'bound', 'wi-002', null, []],
      ['sc-003', 'declared', 'wi-002', null, []],
      ['sc-004', 'pending', 'wi-002', null, []],
      ['sc-005', 'pending', null, null, []],
    ]);
    expect(list.scenarios[0]!.origin).toEqual({ kind: 'architect', refs: [{ lines: [3, 4] }] });
    expect(list.scenarios[4]!.origin).toEqual({ kind: 'plan', planScenario: 'ps-01', lines: [12, 16] });
    // Before the analysis is accepted there is nothing to list.
    expect(scenarioListOf(runView(constructedRun(lines.slice(0, 1))))).toEqual({ scenarios: [], total: 0 });
  });

  test('the review carries the warnings of the acceptance, and each entry counts its own scenarios only', () => {
    const view = runView(constructedRun(lines));
    const review = analysisScenariosOf(view);
    expect(review.warnings).toEqual([warning]);
    expect(review.scenarios.map(one => one.id)).toEqual(['sc-001', 'sc-002', 'sc-003', 'sc-004', 'sc-005']);
    expect(capabilityProgressOf(view).map(row => [row.capability, row.scenarios])).toEqual([
      ['write-note', { implemented: 1, total: 1 }],
      ['show-note', { implemented: 0, total: 3 }],
      ['store-note', null],
    ]);
  });
});
