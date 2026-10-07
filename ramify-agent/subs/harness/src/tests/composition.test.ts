import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runEventSchema } from '../run/log.js';
import { observationSchema } from '../run/observations.js';
import { runSchemas } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import { analysisSchemas } from '../analysis/records.js';
import { workSchemas } from '../work/records.js';
import { iterationSchemas } from '../work/iterations.js';
import { contractSchemas } from '../contracts/records.js';
import { architectureSchemas } from '../architecture/records.js';
import { reviewSchemas } from '../reviews/records.js';
import { reconciliationSchemas } from '../reviews/reconciliation.js';
import { deviationSchemas } from '../deviations/records.js';
import { initialAnalysisSubmissionSchema } from '../analysis/submission.js';
import { checkSubmissionSchema, intakeSubmissionSchema, principleSubmissionSchema } from '../analysis/extraction.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import { engineerSubmissionSchema, scopeTestsInputSchema } from '../work/engineer.js';
import { forkSubmissionSchema } from '../architecture/submission.js';
import { contractSubmissionSchema } from '../contracts/submission.js';
import { failureAnalysisSubmissionSchema } from '../work/failure.js';
import { shellInputSchema } from '../tools/shell.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema, metricsResponseSchema,
  runCommandSchema, runEventPageSchema, runListResponseSchema, runResponseSchema, scenarioListResponseSchema, workItemListResponseSchema,
  workItemResponseSchema,
} from '../interfaces/protocol/runs.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { RunQueries } from '../projections/queries.js';
import { crashAt, fileHashes, logLines, plan, runDirectory, runToEnd, scenarios, type ScenarioName } from './helpers/composition.js';
import { allRows, machineNames, type Machine } from './helpers/recovery-table.js';
import { observeValues, unionInventory } from './helpers/unions.js';
import { openRuns, startRun, stopRun } from './helpers/runs.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { scenarioGit } from './helpers/recovery-git.js';
import { copyFixture } from './helpers/fixture.js';

/*
 * The composition suite, T1: the whole loop on the scripted agent, with no
 * pi and no network. Git and the commands readiness would run are external
 * and are answered rather than run; every file the runs write, every record
 * they commit and every transition they make are their own.
 *
 * It holds four things. The recovery table of all ten state machines is
 * complete and is run, row by row, by the three `composition-recovery*`
 * files. No query appends an event, over completed runs with every query
 * exercised. Every value of every union has a producer: the suite walks
 * the schemas for the union list, walks what six composed runs wrote for the
 * values they produced, and holds every other value to a named producer
 * test or a named reason it has none. And every acceptance case of the main
 * plan's matrix has its owning test, present by name, in the iteration the
 * matrix names.
 */

const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const planDirectory = join(packageRoot, 'docs', 'plans', '03-autonomous-implementation-loop');

type Finished = Awaited<ReturnType<typeof runToEnd>>;
const finished = new Map<ScenarioName, Finished>();

/** What the queries answered while the composed runs were running, and over a run a crash interrupted. */
const answeredWhileRunning: Array<{ schema: unknown; value: unknown }> = [];

beforeAll(async () => {
  // Every scenario, each to its end, side by side: each is its own copy of
  // the fixture, its own repository and its own run service. While each one
  // runs, the queries a client would poll are asked after every durable
  // write, so the states and phases of a running run are answered too.
  const names = Object.keys(scenarios) as ScenarioName[];
  const results = await Promise.allSettled(names.map(name => runToEnd(scenarios[name], async (service, runId) => {
    const queries = new RunQueries(service);
    answeredWhileRunning.push({ schema: runResponseSchema, value: await queries.run(plan, runId) });
    answeredWhileRunning.push({ schema: analysisResponseSchema, value: await queries.analysis(plan, runId) });
    answeredWhileRunning.push({ schema: scenarioListResponseSchema, value: await queries.scenarios(plan, runId) });
  })));
  names.forEach((name, index) => { const result = results[index]!; if (result.status === 'fulfilled') finished.set(name, result.value); });
  const failed = results.flatMap((result, index) => result.status === 'rejected' ? [`${names[index]}: ${String(result.reason)}`] : []);
  expect(failed, 'composed scenario failures').toEqual([]);

  // Two run directories this harness cannot serve, as a client's run list
  // names them: one whose record is not JSON, one of a later version.
  const project = await copyFixture();
  const jobs = join(project.root, 'plans', plan, '.harness', 'jobs');
  await mkdir(join(jobs, '20260921T000000Z-000001'), { recursive: true });
  await writeFile(join(jobs, '20260921T000000Z-000001', 'job.json'), '{ this is not a record');
  await mkdir(join(jobs, '20260921T000000Z-000002'), { recursive: true });
  await writeFile(join(jobs, '20260921T000000Z-000002', 'job.json'), `${JSON.stringify({ schema: 'ramify-agent.job/9' })}\n`);
  const unserving = await openRuns(project.root, {
    git: scenarioGit(project.root, { head: 'source-00', commits: [] }),
    readinessExecution: directReadinessExecution(),
    inputs: scenarios.iteration.inputs(),
  });
  answeredWhileRunning.push({ schema: runListResponseSchema, value: await new RunQueries(unserving.service).list(plan) });
  await unserving.service.close();
  await project.remove();

  // A run a crash interrupted, as a client reads it after the restart.
  const crashed = await crashAt(scenarios.iteration, { write: 'work-item-started' });
  const reopened = await openRuns(crashed.root, {
    agent: crashed.agent,
    git: crashed.git,
    readinessExecution: directReadinessExecution(),
    inputs: scenarios.iteration.inputs(),
  });
  const queries = new RunQueries(reopened.service);
  answeredWhileRunning.push({ schema: runListResponseSchema, value: await queries.list(plan) });
  await reopened.service.close();
  await crashed.remove();
}, 600_000);

afterAll(async () => {
  for (const run of finished.values()) await run.dispose();
});

describe('the composed runs', () => {
  test('each scenario runs to the end it is written for, and asks Git exactly what it states', () => {
    for (const [name, run] of finished) {
      const snapshot = run.service.getRun(plan, run.runId)!;
      expect([name, snapshot.state]).toEqual([name, scenarios[name].ends]);
      // Each scenario states what its commits answer. A run that made
      // another commit, or one fewer, is a scenario whose fixture data no
      // longer describes it.
      expect([name, run.git.commits().map(call => call.commit)])
        .toEqual([name, scenarios[name].git.commits.map(response => response.commit)]);
      run.git.assertAnswered();
    }
  });
});

describe('the sessions of the composed runs', () => {
  test('every invocation belongs to a session the log derives, and no final run holds a live or suspended session', () => {
    for (const [name, run] of finished) {
      const events = run.service.events(plan, run.runId)!;
      const sessions = [...reduceSessions(events).values()];
      const started = events.flatMap(event => (event.type === 'invocation-started' ? [event.data.invocation] : []));
      expect([name, sessions.flatMap(session => session.invocations).sort()]).toEqual([name, [...started].sort()]);
      expect([name, sessions.filter(session => session.state !== 'finished').map(session => `${session.id} ${session.state}`)]).toEqual([name, []]);
    }
  });

  test('a yielded revision resumes its architect fresh with one recorded orientation and selection', () => {
    const run = finished.get('revision')!;
    const events = run.service.events(plan, run.runId)!;
    const yielded = events.find(event => event.type === 'invocation-ended'
      && event.data.session !== undefined && !event.data.kept && event.data.finished === 'not-kept'
      && events.some(started => started.type === 'invocation-started' && started.data.invocation === event.data.invocation
        && started.data.role === 'local-architect' && started.data.work.workItem === 'wi-001'));
    expect(yielded?.type).toBe('invocation-ended');
    if (yielded?.type !== 'invocation-ended') return;
    const resumed = events.find(event => event.type === 'invocation-started' && event.sequence > yielded.sequence
      && event.data.role === 'local-architect' && event.data.work.workItem === 'wi-001');
    expect(resumed?.type).toBe('invocation-started');
    if (resumed?.type !== 'invocation-started') return;
    expect(resumed.data.start).toBe('opened');
    expect(resumed.data.session).not.toBe(yielded.data.session);
    expect(events.filter(event => event.type === 'work-orientation-recorded' && event.data.workItem === 'wi-001')).toHaveLength(1);
    expect(events.filter(event => event.type === 'context-selection-recorded' && event.data.workItem === 'wi-001')).toHaveLength(1);
  });
});

describe('the recovery tables of the ten state machines', () => {
  test('there is a row for every durable boundary, every machine has rows, and the three recovery files run all of them', async () => {
    const rows = allRows();
    // `recoveryTable` is typed against the run service's own boundary union,
    // so a boundary without a row does not compile; this states the count.
    expect(new Set(rows.map(row => row.write)).size).toBe(43);
    const machines = new Set(rows.flatMap(row => row.machines));
    expect([...machines].sort()).toEqual((Object.keys(machineNames) as Machine[]).sort());

    // Every scenario a row names is run by exactly one of the three files.
    const files = ['composition-recovery.test.ts', 'composition-recovery-delegation.test.ts', 'composition-recovery-chains.test.ts'];
    const claimed: string[] = [];
    for (const file of files) {
      const text = await readFile(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8');
      const listed = /const scenarios: readonly string\[\] = \[([^\]]*)\]/.exec(text)?.[1] ?? '';
      claimed.push(...[...listed.matchAll(/'([a-z-]+)'/g)].map(match => match[1]!));
      expect(text).toContain('verifyRow(row)');
      expect(text).not.toMatch(/\.(skip|only|todo)\(/);
    }
    expect(claimed.sort()).toEqual([...new Set(rows.map(row => row.scenario))].sort());
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

describe('no query appends an event', () => {
  test('every query, over every completed and failed composed run, leaves its log, its files and its project as they were', async () => {
    for (const [name, run] of finished) {
      const directory = runDirectory(run.root, run.runId);
      const before = await fileHashes(directory);
      const lines = (await logLines(run.root, run.runId)).length;
      // What the run had asked Git by the time it ended. A query that
      // observed the project at all would ask it something more.
      const asked = run.git.operations();
      const queries = new RunQueries(run.service);
      for (let round = 0; round < 2; round += 1) {
        await queries.list(plan);
        await queries.run(plan, run.runId);
        for (let after = 0; after <= lines + 1; after += 1) await queries.events(plan, run.runId, after);
        await queries.analysis(plan, run.runId);
        await queries.decisions(plan, run.runId);
        const { workItems } = await queries.workItems(plan, run.runId);
        for (const item of workItems) await queries.workItem(plan, run.runId, item.id);
        await queries.capabilities(plan, run.runId);
        await queries.scenarios(plan, run.runId);
        await queries.metrics(plan, run.runId);
        await queries.checkFindings(plan, run.runId, { workItem: null, module: null, select: 'all', order: 'attention', after: null, limit: 100 });
        await queries.checkFindingModules(plan, run.runId);
        await queries.reviews(plan, run.runId, { workItem: null, after: null, limit: 100 });
        const page = await queries.events(plan, run.runId, 0);
        for (const gate of new Set(page.events.flatMap(event => event.refs.filter(ref => ref.kind === 'gate').map(ref => ref.id)))) {
          await queries.gate(plan, run.runId, gate);
        }
      }
      expect([name, (await logLines(run.root, run.runId)).length]).toEqual([name, lines]);
      expect(await fileHashes(directory)).toEqual(before);
      expect([name, run.git.operations()], 'a query asked Git something').toEqual([name, asked]);
    }
  }, 300_000);
});

/** Every schema a durable record, a log line, a submission, a harness tool or a projection is written against. */
function unionRoots(): Record<string, unknown> {
  const registries = { ...runSchemas, ...analysisSchemas, ...workSchemas, ...iterationSchemas, ...contractSchemas, ...architectureSchemas, ...reviewSchemas, ...reconciliationSchemas, ...deviationSchemas };
  return {
    'run log': runEventSchema,
    'observation log': observationSchema,
    ...Object.fromEntries(Object.values(registries).map(entry => [`record ${entry.schema}`, entry.body])),
    'submission initial-analysis': initialAnalysisSubmissionSchema,
    'submission intake': intakeSubmissionSchema,
    'submission principle-extraction': principleSubmissionSchema,
    'submission catalog-check': checkSubmissionSchema,
    'submission local-architect': localArchitectSubmissionSchema,
    'submission engineer': engineerSubmissionSchema,
    'submission fork': forkSubmissionSchema,
    'submission contract': contractSubmissionSchema,
    'submission failure-analysis': failureAnalysisSubmissionSchema,
    'tool shell': shellInputSchema,
    'tool run_scope_tests': scopeTestsInputSchema,
    'command': runCommandSchema,
    'error': errorResponseSchema,
    'query runs': runListResponseSchema,
    'query run': runResponseSchema,
    'query events': runEventPageSchema,
    'query analysis': analysisResponseSchema,
    'query decisions': decisionListResponseSchema,
    'query work-items': workItemListResponseSchema,
    'query work-item': workItemResponseSchema,
    'query capabilities': capabilityListResponseSchema,
    'query scenarios': scenarioListResponseSchema,
    'query gate': gateResponseSchema,
    'query metrics': metricsResponseSchema,
  };
}

const submissionSchemas: Readonly<Record<string, unknown>> = {
  'ramify-agent.initial-analysis/3': initialAnalysisSubmissionSchema,
  'ramify-agent.intake/1': intakeSubmissionSchema,
  'ramify-agent.principle-extraction/1': principleSubmissionSchema,
  'ramify-agent.catalog-check/1': checkSubmissionSchema,
  'ramify-agent.local-architect-submission/1': localArchitectSubmissionSchema,
  'ramify-agent.engineer-submission/1': engineerSubmissionSchema,
  'ramify-agent.fork-submission/1': forkSubmissionSchema,
  'ramify-agent.contract-submission/2': contractSubmissionSchema,
  'ramify-agent.failure-analysis-submission/1': failureAnalysisSubmissionSchema,
};

/** What the composed runs wrote, walked value by value against the schemas that describe it. */
async function observedInComposedRuns(): Promise<Map<unknown, Set<string>>> {
  const observed = new Map<unknown, Set<string>>();
  const registries = { ...runSchemas, ...analysisSchemas, ...workSchemas, ...iterationSchemas, ...contractSchemas, ...architectureSchemas, ...reviewSchemas, ...reconciliationSchemas, ...deviationSchemas };
  const bySchema = new Map<string, unknown>(Object.values(registries).map(entry => [entry.schema, entry.body]));
  for (const run of finished.values()) {
    const directory = runDirectory(run.root, run.runId);
    observeValues(runSchemas.run.body, JSON.parse(await readFile(join(directory, 'job.json'), 'utf8')), observed);
    for (const line of await logLines(run.root, run.runId)) {
      observeValues(runEventSchema, line.event, observed);
      for (const record of line.records) {
        const schema = bySchema.get(String((record.body as { schema?: unknown }).schema));
        expect(schema, `a record of an unknown schema: ${record.path}`).toBeDefined();
        observeValues(schema, record.body, observed);
      }
    }
    // Every file of the run that names its schema: the records the log
    // commits, and the files a run writes beside them, such as line events,
    // the prompt manifest, measurement snapshots and accepted submissions.
    for (const path of Object.keys(await fileHashes(directory))) {
      if (path.endsWith('observations.jsonl')) {
        for (const text of (await readFile(join(directory, path), 'utf8')).split('\n').filter(Boolean)) observeValues(observationSchema, JSON.parse(text), observed);
        continue;
      }
      if (!path.endsWith('.json')) continue;
      const { schema, ...body } = JSON.parse(await readFile(join(directory, path), 'utf8')) as { schema?: unknown };
      if (typeof schema !== 'string') continue;
      if (bySchema.has(schema)) observeValues(bySchema.get(schema), { schema, ...body }, observed);
      else if (submissionSchemas[schema] !== undefined) observeValues(submissionSchemas[schema], body, observed);
    }
    const queries = new RunQueries(run.service);
    observeValues(runListResponseSchema, await queries.list(plan), observed);
    observeValues(runResponseSchema, await queries.run(plan, run.runId), observed);
    const page = await queries.events(plan, run.runId, 0);
    observeValues(runEventPageSchema, page, observed);
    observeValues(analysisResponseSchema, await queries.analysis(plan, run.runId), observed);
    observeValues(decisionListResponseSchema, await queries.decisions(plan, run.runId), observed);
    const items = await queries.workItems(plan, run.runId);
    observeValues(workItemListResponseSchema, items, observed);
    for (const item of items.workItems) observeValues(workItemResponseSchema, await queries.workItem(plan, run.runId, item.id), observed);
    observeValues(capabilityListResponseSchema, await queries.capabilities(plan, run.runId), observed);
    observeValues(scenarioListResponseSchema, await queries.scenarios(plan, run.runId), observed);
    observeValues(metricsResponseSchema, await queries.metrics(plan, run.runId), observed);
    for (const gate of new Set(page.events.flatMap(event => event.refs.filter(ref => ref.kind === 'gate').map(ref => ref.id)))) {
      observeValues(gateResponseSchema, await queries.gate(plan, run.runId, gate), observed);
    }
  }
  for (const answer of answeredWhileRunning) observeValues(answer.schema, answer.value, observed);
  // The two commands the composed runs sent.
  observeValues(runCommandSchema, startRun(plan), observed);
  observeValues(runCommandSchema, stopRun(plan, 'a-run', 1), observed);
  return observed;
}

/**
 * Values the composed runs do not produce, each with the test in which the
 * harness produces it. The suite checks that the test is there by that name
 * and is not skipped; `scripts/composition-gate.ts` checks that it passed.
 * Most are failure paths a composed run cannot also be driven down without
 * becoming a second copy of the test that owns them.
 */
const producedElsewhere: ReadonlyArray<{ readonly union: string; readonly values: readonly string[]; readonly file: string; readonly test: string }> = [
  { union: 'record ramify-agent.iteration-assignment/1.coordination.kind', values: ['capability-task'], file: 'subs/harness/src/tests/capability-assignments.test.ts', test: 'CA06–CA10 CA28–CA30: consultation stays read-only and B, D, P, A receive task-owned scopes' },
  // Plan 16: the new-run capability path is driven in its own service tests.
  { union: 'run log.type', values: ['capability-requested', 'capability-qualified', 'capability-delegated'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'run log.type', values: ['capability-plan-revised', 'capability-exchange-opened', 'capability-exchange-answered', 'capability-assigned', 'capability-assignment-settled'], file: 'subs/harness/src/tests/capability-assignments.test.ts', test: 'CA06–CA10 CA28–CA30: consultation stays read-only and B, D, P, A receive task-owned scopes' },
  { union: 'run log.type', values: ['capability-coordinator-resumed'], file: 'subs/harness/src/tests/capability-recovery.test.ts', test: 'CA18 CA26 CA29: an ended B writer keeps dirty source and closes partial through ordinary failure analysis' },
  { union: 'run log.type', values: ['capability-verification-started', 'capability-handed-back'], file: 'subs/harness/src/tests/capability-acceptance.integration.test.ts', test: 'CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision' },
  { union: 'run log.type', values: ['capability-verification-failed'], file: 'subs/harness/src/tests/capability-tasks-projection.test.ts', test: 'CA23 CA34: request, design, consultation and failed verification remain distinct from registry capability' },
  { union: 'run log.type', values: ['capability-stopped'], file: 'subs/harness/src/tests/capability-recovery.test.ts', test: 'CA20 CA32: restart with a B writer lacking confirmed release stops the stack and frontier' },
  { union: 'run log.type', values: ['writer-process-registered'], file: 'subs/harness/src/tests/capability-recovery.test.ts', test: 'CA20: a registered real process group survives a service crash and is settled before any successor work' },
  { union: 'run log[session-opened].data.role', values: ['capability-architect'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'run log[session-opened].data.requestedBy.reason', values: ['capability-needed'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['capability-qualification'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['capability-returned'], file: 'subs/harness/src/tests/capability-acceptance.integration.test.ts', test: 'CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['capability-coordination'], file: 'subs/harness/src/tests/capability-recovery.test.ts', test: 'CA05 CA19 CA22 CA32: service restart reconstructs the active architect without dispatching the B entry' },
  { union: 'run log[capability-qualified].data.outcome', values: ['satisfied'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA02: local architect finds an existing API and the same engineer verifies it' },
  { union: 'run log[capability-qualified].data.outcome', values: ['request-placement'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'run log[capability-qualified].data.outcome', values: ['unresolved'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'an unresolved qualification returns through the global architect and the same local architect' },
  { union: 'run log[capability-assignment-settled].data.outcome', values: ['accepted'], file: 'subs/harness/src/tests/capability-assignments.test.ts', test: 'CA06–CA10 CA28–CA30: consultation stays read-only and B, D, P, A receive task-owned scopes' },
  { union: 'run log[capability-assignment-settled].data.outcome', values: ['partial'], file: 'subs/harness/src/tests/capability-state.test.ts', test: 'refuses an active assignment but preserves partial history for the verifier' },
  { union: 'run log[capability-review-recorded].data.outcome', values: ['passed', 'failed'], file: 'subs/harness/src/tests/capability-acceptance.integration.test.ts', test: 'CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision' },
  { union: 'submission engineer.kind', values: ['capability-needed'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'submission engineer[capability-needed].request.knownInterface.kind', values: ['none-known'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'submission engineer[capability-needed].request.knownInterface.kind', values: ['insufficient'], file: 'subs/harness/src/tests/capability-acceptance.integration.test.ts', test: 'CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision' },
  { union: 'submission engineer[capability-needed].request.examples[].designation', values: ['pseudocode'], file: 'subs/harness/src/tests/capability-delegation.test.ts', test: 'CA01 CA03 CA04 CA28 CA30 CA32: request reaches one fresh architect and keeps A and B separate' },
  { union: 'query events.events[].refs[].kind', values: ['capability-request', 'capability-task', 'capability-assignment'], file: 'subs/harness/src/tests/capability-tasks-projection.test.ts', test: 'CA23: capability event references identify requests, tasks and assignments' },
  // A path outside every module, assigned as outside-modules and written through the guard.
  { union: 'record ramify-agent.iteration-assignment/1.scope.extra[].purpose', values: ['outside-modules'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'the engineer writes it through the guard, and the gate runs its test on a run of its own' },
  { union: 'record ramify-agent.iteration-assignment/1.scope.extra[].kind', values: ['file'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'the engineer writes it through the guard, and the gate runs its test on a run of its own' },
  { union: 'submission local-architect[assign].assignment.scope.extra[].kind', values: ['file', 'directory'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'the engineer writes it through the guard, and the gate runs its test on a run of its own' },
  // Plan 12: CheckFindings committed through a driven run's own transition, and iteration reviews.
  { union: 'run log.type', values: ['check-findings-recorded'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[check-findings-recorded].data.cause.kind', values: ['producer'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  // H7: an unresolved request the global architect answers with a plan deviation, which may reword a pending scenario.
  { union: 'run log.type', values: ['plan-deviation-recorded'], file: 'subs/harness/src/tests/plan-deviations.test.ts', test: 'the deviation is recorded, the work item goes on under it, and the run completes with it to review' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['deviation-recorded'], file: 'subs/harness/src/tests/plan-deviations.test.ts', test: 'the deviation is recorded, the work item goes on under it, and the run completes with it to review' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.observation.kind', values: ['plan-deviation'], file: 'subs/harness/src/tests/plan-deviations.test.ts', test: 'the deviation is recorded, the work item goes on under it, and the run completes with it to review' },
  { union: 'submission fork.kind', values: ['deviation'], file: 'subs/harness/src/tests/plan-deviations.test.ts', test: 'the deviation is recorded, the work item goes on under it, and the run completes with it to review' },
  { union: 'run log.type', values: ['scenarios-rewording', 'scenarios-reworded'], file: 'subs/harness/src/tests/plan-deviations.test.ts', test: 'the harness renders the feature file from it, commits it, and the finding shows the old and the new text' },
  // A fake's parity: the real export each fake stands for, exposed to the parent in a run, re-exposed to descendants at registration.
  { union: 'record ramify-agent.contract/2.artifacts.fake[].standsFor[].exposure.to[]', values: ['parent'], file: 'subs/harness/src/tests/fake-exposure-parity.test.ts', test: 'a contract that re-exposes its fake where the real export will not be fails the gate in scope, and a repair that removes it passes' },
  { union: 'record ramify-agent.contract/2.artifacts.fake[].standsFor[].exposure.to[]', values: ['descendants'], file: 'subs/harness/src/tests/fake-exposure-parity.test.ts', test: 'the registered contract records what each fake stands for, as submitted' },
  // An unresolved request the global architect answers with an environment problem, which holds the run for the operator.
  { union: 'run log.type', values: ['environment-reported'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['environment-resumed'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.observation.kind', values: ['environment-problem'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes' },
  { union: 'submission fork.kind', values: ['environment'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes' },
  { union: 'query runs.runs[].environmentProblems[].answer', values: ['waiting', 'resumed'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the run holds with the diagnosis in its status; a resume returns the work item to its local architect, and the run completes' },
  { union: 'query runs.runs[].environmentProblems[].answer', values: ['ended'], file: 'subs/harness/src/tests/environment-problems.test.ts', test: 'the operator\'s answer end ends the run with the diagnosis and their note' },
  // Plan 12 iteration 7: a person's CheckFinding commands.
  { union: 'command.type', values: ['respond-to-check-finding', 'waive-check-finding', 'revoke-check-finding-waiver'], file: 'subs/harness/src/tests/check-findings-commands.test.ts', test: 'an answer, a waiver and a revocation commit one decision each; a retry returns its receipt; conflicts, stale revisions and stale versions are refused' },
  { union: 'run log[check-findings-recorded].data.cause.kind', values: ['user-command'], file: 'subs/harness/src/tests/check-findings-commands.test.ts', test: 'an answer, a waiver and a revocation commit one decision each; a retry returns its receipt; conflicts, stale revisions and stale versions are refused' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision.action', values: ['waive', 'revoke-waiver', 'answer-user-decision'], file: 'subs/harness/src/tests/check-findings-commands.test.ts', test: 'an answer, a waiver and a revocation commit one decision each; a retry returns its receipt; conflicts, stale revisions and stale versions are refused' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[waive].authority.kind', values: ['user-decision'], file: 'subs/harness/src/tests/check-findings-commands.test.ts', test: 'an answer, a waiver and a revocation commit one decision each; a retry returns its receipt; conflicts, stale revisions and stale versions are refused' },
  { union: 'run log[check-findings-recorded].data.cause.kind', values: ['user-response'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a changed revision refuses the assessment, a changed source and a later signal refuse completion, and a waiver outside the module is refused' },
  { union: 'run log[check-findings-recorded].data.cause.kind', values: ['recovery'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[].type', values: ['check-finding-opened'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.credibility', values: ['objective'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  // Plan 12 iteration 4b: a driven review's concerns, with the reviewer's risk and the harness's credibility.
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.judgment.risk', values: ['high', 'medium', 'low'], file: 'subs/harness/src/tests/review-signals.test.ts', test: 'the harness classifies what each concern names, on the candidate\'s own module tree, and refuses a ground the reviewer did not read' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.credibility', values: ['human-reviewed', 'agent-generated', 'ungrounded'], file: 'subs/harness/src/tests/review-signals.test.ts', test: 'the harness classifies what each concern names, on the candidate\'s own module tree, and refuses a ground the reviewer did not read' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[].type', values: ['check-finding-decided'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.owner.kind', values: ['work-item'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.source.kind', values: ['tree'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.verification.kind', values: ['assessment', 'check'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.observation.kind', values: ['check-failed', 'review-concern'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.judgment.actor.kind', values: ['agent'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.communication.mode', values: ['quiet'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision.action', values: ['plan-repair'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[plan-repair].repair.kind', values: ['intent'], file: 'subs/harness/src/tests/check-findings-run.test.ts', test: 'a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent' },
  { union: 'run log.type', values: ['review-request-recorded', 'review-attempt-started', 'review-attempt-finished'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'run log[session-opened].data.role', values: ['reviewer'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'run log[review-request-recorded].data.kind', values: ['code'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'run log[review-attempt-started].data.requestedStart', values: ['fresh'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'run log[review-attempt-finished].data.result', values: ['complete', 'partial'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'run log[review-attempt-finished].data.result', values: ['not-verified'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: 'malformed output is retried once, a hung reader times out and an unreadable candidate is unavailable' },
  // Plan 12 iteration 6: the scenario producer's promotions, witnesses and what a gate's line leaves out.
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[].type', values: ['check-finding-reported'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'two failures across repair rounds make one reproduced CheckFinding in the second gate\'s line, the third gate fixes it, and every verdict is the checks\' own' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision.action', values: ['fix-by-check'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'two failures across repair rounds make one reproduced CheckFinding in the second gate\'s line, the third gate fixes it, and every verdict is the checks\' own' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[fix-by-check].witness.coverage', values: ['complete'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'two failures across repair rounds make one reproduced CheckFinding in the second gate\'s line, the third gate fixes it, and every verdict is the checks\' own' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[fix-by-check].witness.outcome', values: ['passed'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'two failures across repair rounds make one reproduced CheckFinding in the second gate\'s line, the third gate fixes it, and every verdict is the checks\' own' },
  { union: 'run log[gate-attempted].data.scenarioFindings.refused.reason', values: ['source-unavailable'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'an audited tree that cannot be read refuses the part with its reason on the gate\'s line; the verdict and the run go on' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].step', values: ['witness'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'failed twice and passed on one unchanged tree: the gate passes and implements the scenario, the CheckFinding stays open with its classification, and a later changed candidate fixes it' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].step', values: ['promotion'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'a line holds at most 100 CheckFinding events; a scenario that does not fit is named and left for its next failure' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|0', values: ['failure-source'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'failed twice and passed on one unchanged tree: the gate passes and implements the scenario, the CheckFinding stays open with its classification, and a later changed candidate fixes it' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|0', values: ['incomparable-inputs', 'insufficient-coverage', 'obligation-changed'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'a narrower run, another mode, a pass on the failure\'s own tree and a changed obligation do not fix it' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|0', values: ['not-executed', 'not-passed'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'a witness that did not run, ran in part or did not pass is refused by the child' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|0', values: ['awaiting-user-decision'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'an open CheckFinding awaiting a user\'s answer is not fixed by a gate' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|1', values: ['event-bound'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'a line holds at most 100 CheckFinding events; a scenario that does not fit is named and left for its next failure' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|1', values: ['source-unavailable'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'a failure whose audited tree was not read is named and left out, and the other scenarios go on' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].classification', values: ['inconclusive'], file: 'subs/harness/src/tests/scenario-findings-run.test.ts', test: 'failed twice and passed on one unchanged tree: the gate passes and implements the scenario, the CheckFinding stays open with its classification, and a later changed candidate fixes it' },
  { union: 'run log[gate-attempted].data.scenarioFindings.notes[].classification', values: ['intermittent'], file: 'subs/harness/src/tests/scenario-findings.test.ts', test: 'two passes on the failure\'s own tree are provisionally intermittent, and still fix nothing' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['invalid-output', 'timed-out', 'unavailable'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: 'malformed output is retried once, a hung reader times out and an unreadable candidate is unavailable' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['stopped'], file: 'subs/harness/src/tests/review-lifecycle.test.ts', test: 'two live readers are stopped with the writer, each attempt is settled before job-stopped, and a reader that ignores its stop ingests nothing' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['deadline'], file: 'subs/harness/src/tests/review-lifecycle.test.ts', test: 'the settlement bound stops a reader that never answers, and the run completes with no reader left' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['execution-failed'], file: 'subs/harness/src/tests/review-lifecycle.test.ts', test: 'a crash while a reader runs finishes its attempt as not verified, and its session as interrupted' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['queue-overflow'], file: 'subs/harness/src/tests/review-lifecycle.test.ts', test: "a request beyond the queue's bound is finished as overflowed and never run" },
  { union: 'record ramify-agent.review-request/1.forkPoint.kind', values: ['none'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'record ramify-agent.review-attempt/1.requestedStart', values: ['fresh'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'record ramify-agent.review-attempt/1.actualStart', values: ['fresh'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'record ramify-agent.review-attempt/1.result.result', values: ['complete', 'partial'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: "two readers overlap the third iteration's writer, read only their own candidates, and every escape is refused" },
  { union: 'record ramify-agent.review-attempt/1.result.result', values: ['not-verified'], file: 'subs/harness/src/tests/review-attempts.test.ts', test: 'malformed output is retried once, a hung reader times out and an unreadable candidate is unavailable' },
  // Plan 12 iteration 4: the scope and design questions, their fork points and the bounded scheduler.
  { union: 'run log[review-request-recorded].data.kind', values: ['scope', 'design'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'run log[review-attempt-started].data.requestedStart', values: ['fork'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'record ramify-agent.review-request/1.forkPoint.kind', values: ['session', 'orientation'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'record ramify-agent.review-request/1.forkPoint.kind', values: ['unavailable'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'a candidate without guidance leaves its design review unavailable, never clean' },
  { union: 'record ramify-agent.review-attempt/1.requestedStart', values: ['fork'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'record ramify-agent.review-attempt/1.actualStart', values: ['fork'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'run log.type', values: ['review-orientation-recorded'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  // Plan 12 iteration 5: work-item reconciliation.
  { union: 'run log.type', values: ['reconciliation-started', 'reconciliation-assessed', 'reconciliation-brief-appended'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'run log[session-opened].data.fork.reason', values: ['reconciliation'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'run log[reconciliation-assessed].data.next', values: ['complete'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'run log[reconciliation-brief-appended].data.outcome', values: ['appended'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-basis/1.requests[].result', values: ['complete'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-basis/1.floor', values: ['any'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-assessment/1.requestedStart', values: ['fork'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-assessment/1.actualStart', values: ['fork'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.dispositions[].action.action', values: ['fixed', 'supersede', 'waive'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.next.kind', values: ['complete'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'record ramify-agent.reconciliation-assessment/1.next', values: ['complete'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'parallel reports of one behavior are linked, same-file concerns stay distinct, a judgment is superseded, a later repair is fixed and a weak tension is waived as a material choice' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['reconciliation'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'run log[work-item-completed].data.unresolved[].reason', values: ['below-floor'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'run log[reconciliation-assessed].data.next', values: ['correct', 'unresolved'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'record ramify-agent.reconciliation-basis/1.floor', values: ['non-low'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.dispositions[].action.action', values: ['repair', 'leave'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.next.kind', values: ['correct', 'unresolved'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'record ramify-agent.reconciliation-assessment/1.next', values: ['correct', 'unresolved'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a repair is planned with its intent, the architect assigns the correction, its acceptance claims the repair, and the next round fixes it within its floor' },
  { union: 'run log[work-item-completed].data.unresolved[].reason', values: ['rounds-exhausted', 'raised-after-last-round'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'at the last round no correction is planned, what is open stays unresolved, and a signal raised after it does not block completion' },
  { union: 'record ramify-agent.reconciliation-basis/1.floor', values: ['none'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'at the last round no correction is planned, what is open stays unresolved, and a signal raised after it does not block completion' },
  { union: 'run log[reconciliation-assessed].data.next', values: ['await-user'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'the conflict cites an element\'s exact text and the catalog\'s revision, the work item waits for the answer, and the next round assesses it' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.dispositions[].action.action', values: ['request-user-decision'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'the conflict cites an element\'s exact text and the catalog\'s revision, the work item waits for the answer, and the next round assesses it' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.next.kind', values: ['await-user'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'the conflict cites an element\'s exact text and the catalog\'s revision, the work item waits for the answer, and the next round assesses it' },
  { union: 'record ramify-agent.reconciliation-assessment/1.next', values: ['await-user'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'the conflict cites an element\'s exact text and the catalog\'s revision, the work item waits for the answer, and the next round assesses it' },
  { union: 'run log.type', values: ['reconciliation-refused'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a changed revision refuses the assessment, a changed source and a later signal refuse completion, and a waiver outside the module is refused' },
  { union: 'run log[reconciliation-refused].data.stage', values: ['assessment', 'completion'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a changed revision refuses the assessment, a changed source and a later signal refuse completion, and a waiver outside the module is refused' },
  { union: 'record ramify-agent.reconciliation-assessment/1.submission.dispositions[].action.action', values: ['defer'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a changed revision refuses the assessment, a changed source and a later signal refuse completion, and a waiver outside the module is refused' },
  { union: 'run log[reconciliation-brief-appended].data.outcome', values: ['session-lost'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a fork point that no longer exists starts fresh with the whole packet, and a brief that cannot be appended reaches the next architect input from the log' },
  { union: 'run log[reconciliation-brief-appended].data.outcome', values: ['failed'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'an append the executor fails is recorded as failed, the session is kept, and the next architect input carries the brief from the log' },
  { union: 'run log[reconciliation-brief-appended].data.outcome', values: ['no-session'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a round after the architect\'s session was lost has no session to append to, and records no-session' },
  { union: 'record ramify-agent.reconciliation-assessment/1.actualStart', values: ['fresh'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a fork point that no longer exists starts fresh with the whole packet, and a brief that cannot be appended reaches the next architect input from the log' },
  { union: 'run log[reconciliation-brief-appended].data.outcome', values: ['already-present'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a crash after the parent append is recovered once from the committed assessment, and the repair keeps its intent' },
  { union: 'record ramify-agent.reconciliation-basis/1.requests[].result', values: ['not-verified'], file: 'subs/harness/src/tests/reconciliation.test.ts', test: 'a reader still running at the deadline is fenced and stopped, the queue stays open, and the correction\'s review still runs' },
  { union: 'run log[session-opened].data.fork.reason', values: ['scope-review', 'design-orientation'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'run log[review-orientation-recorded].data.outcome', values: ['oriented'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'run log[review-orientation-recorded].data.outcome', values: ['failed'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'a failed orientation is recorded once, and the design reviews of its guidance start fresh with the reason' },
  { union: 'record ramify-agent.review-orientation/1.outcome', values: ['oriented'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'each accepted iteration binds code, scope and design requests to one candidate, scope forks the assignment point and design forks one orientation per guidance selection' },
  { union: 'record ramify-agent.review-orientation/1.outcome', values: ['failed'], file: 'subs/harness/src/tests/review-questions.test.ts', test: 'a failed orientation is recorded once, and the design reviews of its guidance start fresh with the reason' },
  { union: 'run log[review-attempt-finished].data.reason', values: ['no-time-before-deadline'], file: 'subs/harness/src/tests/review-scheduling.test.ts', test: "after the completion request, a waiting request that could not finish before the work item's deadline is finished at once" },
  { union: 'record ramify-agent.gate-audit-outcome/1.overall', values: ['pass'], file: 'subs/harness/src/tests/execution-map-durable.test.ts', test: 'replays the independent published audit result after restart' },
  { union: 'record ramify-agent.gate-audit-outcome/1.overall', values: ['fail'], file: 'subs/harness/src/tests/execution-map-projection.test.ts', test: 'reads old gates without an audit fact and a failed published audit independently of verdict' },
  { union: 'record ramify-agent.gate-audit-outcome/1.overall', values: ['indeterminate'], file: 'subs/harness/src/tests/audit-check-execution.test.ts', test: 'retains an indeterminate published audit outcome' },
  { union: 'run log.type', values: ['readiness-failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'run log.type', values: ['scratch-preserved'], file: 'subs/harness/src/tests/accepted-commit.test.ts', test: 'a forced-staged scratch file fails the run gate and closure preserves only indexed scratch' },
  { union: 'run log.type', values: ['global-context-rebuilt'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the generation rises, the pending brief is cleared, and the next fork is oriented from the records' },
  { union: 'run log.type', values: ['job-interrupted'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after publishing the run and captured inputs leaves a run that loads and is interrupted' },
  { union: 'run log[invocation-ended].data[false].finished', values: ['interrupted'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after invocation-started closes that invocation without an agent call and without a second one' },
  { union: 'run log[invocation-ended].data[false].finished', values: ['lost'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the generation rises, the pending brief is cleared, and the next fork is oriented from the records' },
  { union: 'run log[invocation-ended].data[false].finished', values: ['replaced'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a session the implementation can no longer read is reconstructed, and the counters are kept' },
  { union: 'run log[session-opened].data.replaces.reason', values: ['reconstructed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a session the implementation can no longer read is reconstructed, and the counters are kept' },
  { union: 'run log[session-opened].data.replaces.reason', values: ['context-rebuilt'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the generation rises, the pending brief is cleared, and the next fork is oriented from the records' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['repair'], file: 'subs/harness/src/tests/session-lifecycle.test.ts', test: 'a continued local architect, a global fork, a contract sub-session and a repaired engineer derive the expected state after every event' },
  { union: 'run log[invocation-started].data.continues.reason', values: ['completion-refused'], file: 'subs/harness/src/tests/requirement-verification.test.ts', test: 'a passing verification that left the fake in place closes nothing, and completion is refused until it is gone' },
  { union: 'run log[invocation-ended].data[true].degraded.requested', values: ['continue', 'fork'], file: 'subs/harness/src/tests/placement.test.ts', test: 'is recorded at the invocation\'s end with what was requested, what was actual and the executor\'s reason' },
  { union: 'run log[invocation-ended].data[true].degraded.actual', values: ['fresh'], file: 'subs/harness/src/tests/placement.test.ts', test: 'is recorded at the invocation\'s end with what was requested, what was actual and the executor\'s reason' },
  { union: 'run log[brief-appended].data.outcome', values: ['already-present'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'G4: a crash after the append and before its completion answers already-present, and one brief exists' },
  { union: 'run log[iteration-closed].data.notices[].kind', values: ['module-created'], file: 'subs/harness/src/tests/module-creation-integration.test.ts', test: 'a bootstrap assignment creates the module with nested source and its first test, and the notice is read from the commit' },
  { union: 'run log[job-failed].data.reason', values: ['readiness-failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'run log[job-failed].data.reason', values: ['project-config-invalid'], file: 'subs/harness/src/tests/project-config.test.ts', test: 'a project without the file starts, and fails readiness with project-config-invalid and no recovery' },
  { union: 'run log[job-failed].data.reason', values: ['acceptance-harness-missing'], file: 'subs/harness/src/tests/project-config.test.ts', test: 'a project without cucumber-js fails acceptance-runner with acceptance-harness-missing and no recovery' },
  { union: 'record ramify-agent.job/3.projectConfig|0.config.acceptance.modes.full.readiness', values: ['run'], file: 'subs/harness/src/tests/project-config.test.ts', test: 'a configuration asking readiness to run full mode is captured with it' },
  { union: 'observation log[coverage-gap].data.kind', values: ['unsupported-runner'], file: 'subs/harness/src/tests/iterations-integration.test.ts', test: 'a local architect assigns it, an engineer works it, the gate accepts it and the harness commits' },
  { union: 'run log[job-failed].data.reason', values: ['repair-exhausted'], file: 'subs/harness/src/tests/work-items.test.ts', test: 'returns to the same local architect, which revises its outline, and exhausts deterministically' },
  { union: 'run log[job-failed].data.reason', values: ['recovery-exhausted'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a failure that keeps recurring ends the run once the bounded recoveries are spent' },
  { union: 'run log[job-failed].data.reason', values: ['writer-unsettled'], file: 'subs/harness/src/tests/writer-settlement.test.ts', test: 'fails as writer-unsettled, and runs no gate against that tree' },
  { union: 'run log[iteration-closed].data.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'run log[gate-attempted].data.verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'observation log[hook-check].data.outcome', values: ['passed'], file: 'subs/harness/src/tests/hook-checks.test.ts', test: 'a check that passed with nothing new tells the engineer nothing' },
  { union: 'observation log[hook-check].data.outcome', values: ['findings'], file: 'subs/harness/src/tests/hook-checks.test.ts', test: 'findings are reported with their count, and the same finding reported again is not new' },
  { union: 'observation log[coverage-gap].data.kind', values: ['observation-truncated'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after writer-released keeps what the shell wrote, closes the invocation and releases no second writer' },
  { union: 'observation log[coverage-gap].data.kind', values: ['transcript-incomplete'], file: 'subs/harness/src/tests/transcript-run.test.ts', test: 'is a coverage gap in its invocation\'s observations, and the run completes' },
  { union: 'record ramify-agent.readiness-attempt/1.steps[].outcome', values: ['failed', 'not-verified'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a Ramify command line that does not answer is recovered by restarting the daemon, and the run ends when it still does not' },
  { union: 'record ramify-agent.readiness-attempt/1.verdict', values: ['failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'record ramify-agent.infrastructure-recovery/1.cause', values: ['infrastructure'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'missing nested dependencies consume a recovery attempt, and the run continues when it repairs them' },
  { union: 'record ramify-agent.infrastructure-recovery/1.cause', values: ['timeout'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a timed-out baseline is recoverable, and the rerun passes' },
  { union: 'record ramify-agent.infrastructure-recovery/1.cause', values: ['daemon-unavailable'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a Ramify command line that does not answer is recovered by restarting the daemon, and the run ends when it still does not' },
  { union: 'record ramify-agent.infrastructure-recovery/1.action', values: ['reinstall-nested'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'missing nested dependencies consume a recovery attempt, and the run continues when it repairs them' },
  { union: 'record ramify-agent.infrastructure-recovery/1.action', values: ['rerun-command'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a timed-out baseline is recoverable, and the rerun passes' },
  { union: 'record ramify-agent.infrastructure-recovery/1.action', values: ['restart-daemon'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a Ramify command line that does not answer is recovered by restarting the daemon, and the run ends when it still does not' },
  { union: 'record ramify-agent.infrastructure-recovery/1.outcome', values: ['recovered'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'missing nested dependencies consume a recovery attempt, and the run continues when it repairs them' },
  { union: 'record ramify-agent.infrastructure-recovery/1.outcome', values: ['failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a recovery that does not repair the failure ends the run at once, with the attempt it spent' },
  { union: 'record ramify-agent.invocation/1.scope.size.components[].state', values: ['unknown'], file: 'subs/harness/src/tests/measurement.test.ts', test: 'a module that does not exist yet has an unknown size, not a zero one' },
  { union: 'record ramify-agent.invocation/1.scope.size.coverage', values: ['complete'], file: 'subs/harness/src/tests/measurement.test.ts', test: 'the initial architect\'s invocation records its snapshot reference and its S_s components' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['idle-timeout'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'no port event for invocationIdleMs ends the invocation as failed, idle-timeout' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['absolute-timeout'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'a session that keeps talking past invocationAbsoluteMs ends as failed, absolute-timeout' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['adapter-fault'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'is an adapter fault: the invocation ends failed with that interruption, and the run fails agent-failed' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['session-lost'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after invocation-started closes that invocation without an agent call and without a second one' },
  { union: 'record ramify-agent.invocation-outcome/1.disposition', values: ['superseded'], file: 'subs/harness/src/tests/late-writes.test.ts', test: 'is settled with its process group, and its result completes nothing' },
  { union: 'record ramify-agent.gate-attempt/3.rules[].outcome', values: ['failed'], file: 'subs/harness/src/tests/requirement-verification.test.ts', test: 'a file without .fake, an export without Fake and a re-export that drops it each fail the gate' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].outcome', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/3.verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/3.cause', values: ['check-failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/3.next', values: ['repair', 'exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['timeout'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['runner-error'], file: 'subs/harness/src/tests/gate-not-verified.test.ts', test: 'records a runner error with the structured error the spawn gave it' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['command-missing'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['discovery-error'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a discovery that fails never falls back to an earlier list' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['required-suite-missing'], file: 'subs/harness/src/tests/gate-not-verified.test.ts', test: 'refuses a selection that lost a required suite, and one discovery could not establish' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['local-rule-failed'], file: 'subs/harness/src/tests/accepted-commit.test.ts', test: 'a nested ignore exception fails the gate before commit and repair retains scratch' },
  // The fixture declares no setup command, so no composed run runs one: a
  // run over a copy that declares a build, whose first iteration gate finds
  // it broken, and readiness running one in place produce them.
  { union: 'record ramify-agent.gate-attempt/3.commands[].kind', values: ['setup'], file: 'subs/harness/src/tests/setup-attribution.test.ts', test: 'the build the engineer broke fails its iteration gate in scope, and the engineer repairs it from the build\'s own output' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['setup-failed'], file: 'subs/harness/src/tests/setup-attribution.test.ts', test: 'the build the engineer broke fails its iteration gate in scope, and the engineer repairs it from the build\'s own output' },
  { union: 'record ramify-agent.gate-operation/1.request.checks[].kind', values: ['setup'], file: 'subs/harness/src/tests/setup-attribution.test.ts', test: 'the build the engineer broke fails its iteration gate in scope, and the engineer repairs it from the build\'s own output' },
  { union: 'run log[gate-command-started].data.kind', values: ['setup'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'runs first, at the project root, so the baseline reads what it built, and is announced and recorded as a gate command' },
  { union: 'run log.type', values: ['gate-command-waiting'], file: 'subs/harness/src/tests/gate-progress.test.ts', test: 'a composed readiness records the provider wait for tests and scenarios before their commands start' },
  { union: 'run log[gate-command-waiting].data.kind', values: ['tests', 'scenarios'], file: 'subs/harness/src/tests/gate-progress.test.ts', test: 'a composed readiness records the provider wait for tests and scenarios before their commands start' },
  { union: 'record ramify-agent.gate-attempt/3.cause', values: ['infrastructure'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a discovery that fails never falls back to an earlier list' },
  { union: 'record ramify-agent.gate-attempt/3.cause', values: ['timeout'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.gate-attempt/3.cause', values: ['guarded-change'], file: 'subs/harness/src/tests/breaking-work.test.ts', test: 'an unauthorized edit of the test-runner configuration is guarded-change, and the same edit under a recorded revision passes' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].scenarios.selection.kind', values: ['identity'], file: 'subs/harness/src/tests/scenario-check.test.ts', test: 'a passing identity run: the profile written outside the project, its argv, and a summary that passes' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].scenarios.scenarios[].status', values: ['passed', 'failed', 'undefined', 'pending', 'ambiguous'], file: 'subs/harness/src/tests/scenario-check.test.ts', test: 'all-untagged: every tracked failure by ID, the project\'s own by count, and the pending one excluded' },
  { union: 'record ramify-agent.gate-attempt/3.commands[].scenarios.scenarios[].status', values: ['skipped'], file: 'subs/harness/src/tests/scenario-check.test.ts', test: 'a dry run passes skipped scenarios and fails on undefined and ambiguous steps' },
  { union: 'record ramify-agent.gate-attempt/3.next', values: ['retry-infrastructure'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.capability/1.origin', values: ['global-decision'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the first creates a capability and revises its hypothesis; the second inherits its brief and reuses the entry' },
  { union: 'record ramify-agent.iteration-result/1.outcome', values: ['superseded'], file: 'subs/harness/src/tests/contract-revision.test.ts', test: 'an unfinished item is reused and its open assignment closes as superseded; a completed one is followed' },
  { union: 'record ramify-agent.iteration-result/1.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].result.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].gates[].verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].gates[].cause', values: ['check-failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].gates[].next', values: ['repair', 'exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.placement-decision/1.outcome', values: ['create'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the first creates a capability and revises its hypothesis; the second inherits its brief and reuses the entry' },
  { union: 'record ramify-agent.placement-decision/1.outcome', values: ['extract'], file: 'subs/harness/src/tests/placement.test.ts', test: 'it names what it affects, and the consequence reaches that work item before its own turn' },
  { union: 'submission engineer[unsuitable].reason', values: ['break-discovered'], file: 'subs/harness/src/tests/breaking-work.test.ts', test: 'break-discovered returns to the local architect, which restages, and the engineer widened nothing' },
  { union: 'submission contract.kind', values: ['incomplete'], file: 'subs/harness/src/tests/contract-delegation.test.ts', test: 'no contract and no obligation are committed, and its caller accounts for the partial work' },
  { union: 'error.error.code', values: ['invalid-request'], file: 'subs/harness/src/tests/run-protocol.test.ts', test: 'a start-run payload that breaks its schema is refused with every error and its path, and changes nothing' },
  { union: 'error.error.code', values: ['not-found', 'unreadable'], file: 'subs/harness/src/tests/http.test.ts', test: 'errors use the protocol shape and status' },
  { union: 'error.error.code', values: ['conflict', 'stale-version'], file: 'subs/harness/src/tests/run-protocol.test.ts', test: 'an identical retry returns its receipt; a conflicting reuse and a stale version are refused' },
  { union: 'error.error.code', values: ['busy'], file: 'subs/harness/src/tests/run-commands.test.ts', test: 'a second run while one is active is busy' },
  { union: 'error.error.code', values: ['unavailable'], file: 'subs/harness/src/tests/run-commands.test.ts', test: 'a start without a configured agent, or naming another one, is unavailable' },
  { union: 'error.error.code', values: ['unsupported-version'], file: 'subs/harness/src/tests/run-protocol.test.ts', test: 'surfaces as unsupported-version with evidence, never as an absent run' },
  { union: 'query runs.runs[].notices[].kind', values: ['module-created'], file: 'subs/harness/src/tests/run-protocol.test.ts', test: 'driven while only the file system is watched; read over HTTP, and again after two restarts' },
  { union: 'query work-items.workItems[].origin', values: ['verification'], file: 'subs/harness/src/tests/contract-revision-scripted.test.ts', test: 'two consumers complete revision 1, a third revises it, and the follow-ups finish the run' },
  { union: 'query metrics.baseline.state', values: ['measured'], file: 'subs/harness/src/tests/measurement.test.ts', test: 'a run freezes B from its first snapshot, and job.json names it' },
  // The composed runs work from plans without `gherkin` blocks, so their
  // analyses hold architect scenarios only and give no warning.
  { union: 'submission initial-analysis.scenarios[].origin.kind', values: ['plan'], file: 'subs/harness/src/tests/analysis-scenarios.test.ts', test: 'analysis-accepted commits one pending scenario record per scenario, with IDs, owners, hashes and the integration owner' },
  { union: 'record ramify-agent.scenario/1.kind', values: ['integration'], file: 'subs/harness/src/tests/analysis-scenarios.test.ts', test: 'analysis-accepted commits one pending scenario record per scenario, with IDs, owners, hashes and the integration owner' },
  { union: 'record ramify-agent.scenario/1.origin.kind', values: ['plan'], file: 'subs/harness/src/tests/analysis-scenarios.test.ts', test: 'analysis-accepted commits one pending scenario record per scenario, with IDs, owners, hashes and the integration owner' },
  // The composed runs start without the review stop.
  { union: 'run log.type', values: ['review-requested', 'analysis-approved'], file: 'subs/harness/src/tests/review-stop.test.ts', test: 'waits at awaiting-review holding the project, and an approval continues it to completion' },
  { union: 'run log.type', values: ['scenario-bound-passed', 'scenario-due'], file: 'subs/harness/src/tests/scenario-states.test.ts', test: 'a declaration while a requirement is open is bound and keeps its tag, passes against the fake, survives the yield, is due at requirement-verified and implemented by the work-item gate' },
  { union: 'run log[scenario-declared].data.state', values: ['bound'], file: 'subs/harness/src/tests/scenario-states.test.ts', test: 'a declaration while a requirement is open is bound and keeps its tag, passes against the fake, survives the yield, is due at requirement-verified and implemented by the work-item gate' },
  { union: 'run log.type', values: ['scenarios-withdrawing', 'scenario-withdrawn'], file: 'subs/harness/src/tests/scenario-states.test.ts', test: 'by exhaustion: the iteration spends its repair rounds, and "Withdraw sc-001" restores the pending tag at once' },
  { union: 'run log[work-item-started].data.origin', values: ['verification'], file: 'subs/harness/src/tests/contract-revision-scripted.test.ts', test: 'two consumers complete revision 1, a third revises it, and the follow-ups finish the run' },
  { union: 'run log[work-item-started].data.origin', values: ['integration'], file: 'subs/harness/src/tests/integration-scenarios.test.ts', test: 'created by the last sub-scenario\'s implementation at the common ancestor, queued, briefed, bound at the ancestor, implemented by its iteration gate, and completed' },
  { union: 'query work-items.workItems[].origin', values: ['integration'], file: 'subs/harness/src/tests/integration-scenarios.test.ts', test: 'created by the last sub-scenario\'s implementation at the common ancestor, queued, briefed, bound at the ancestor, implemented by its iteration gate, and completed' },
  { union: 'run log[job-failed].data.reason', values: ['acceptance-incomplete'], file: 'subs/harness/src/tests/scenario-states.test.ts', test: 'a passing final gate whose scenario check did not pass a tracked scenario does not complete the run' },
  { union: 'command.type', values: ['approve-analysis'], file: 'subs/harness/src/tests/review-stop.test.ts', test: 'start-run with reviewStop and approve-analysis are accepted as stop-job is, and a malformed approval is refused' },
  { union: 'query runs.runs[].phase', values: ['awaiting-review'], file: 'subs/harness/src/tests/review-stop.test.ts', test: 'start-run with reviewStop and approve-analysis are accepted as stop-job is, and a malformed approval is refused' },
  // The composed runs declare no scenario while a requirement is open; the
  // query projects the state from scenario-declared, whose bound value
  // scenario-states produces.
  { union: 'query scenarios.scenarios[].state', values: ['bound'], file: 'subs/harness/src/tests/scenario-projections.test.ts', test: 'every state, the entry\'s work item, an integration scenario without its work item yet, and no gate that did not run it' },
  // Where a failed gate's cause was read from: a Ramify report in a driven
  // run, a declared tsc output and both together at a gate of their own.
  { union: 'run log[analysis-accepted].data.warnings[].kind', values: ['names-view-symbol', 'names-view-file', 'sub-scenario-shares-no-step', 'duplicate-architect-steps'], file: 'subs/harness/src/tests/analysis-scenarios.test.ts', test: 'with an architect view: a module\'s own directory and testing area, and every warning, by scenario ID' },
  // An engineer that ends without a result returns to its architect, digested and analyzed first.
  { union: 'run log[session-opened].data.role', values: ['failure-analyst'], file: 'subs/harness/src/tests/engineer-failures.test.ts', test: 'is digested and analyzed before its architect is briefed, which raises the bound, and the next engineer\'s shell takes the larger timeout' },
  { union: 'record ramify-agent.iteration-result/1.failure.analysis.outcome', values: ['analyzed'], file: 'subs/harness/src/tests/engineer-failures.test.ts', test: 'is digested and analyzed before its architect is briefed, which raises the bound, and the next engineer\'s shell takes the larger timeout' },
  { union: 'record ramify-agent.iteration-result/1.failure.analysis[analyzed].cause', values: ['bound-too-tight'], file: 'subs/harness/src/tests/engineer-failures.test.ts', test: 'is digested and analyzed before its architect is briefed, which raises the bound, and the next engineer\'s shell takes the larger timeout' },
  { union: 'record ramify-agent.iteration-result/1.failure.analysis.outcome', values: ['unavailable'], file: 'subs/harness/src/tests/engineer-failures.test.ts', test: 'leaves the digest alone, says the analysis was unavailable, and never fails the run' },
  { union: 'record ramify-agent.iteration-result/1.failure.analysis[analyzed].cause', values: ['environment-problem', 'work-problem', 'agent-behavior', 'unknown'], file: 'subs/harness/src/tests/engineer-failures.test.ts', test: 'reaches the iteration\'s result and the next briefing' },
  // Plan 13's accepted source, complete assessment, repair and exhausted review have separate executable witnesses.
  { union: 'run log.type', values: ['nonfunctional-investigated'], file: 'subs/harness/src/tests/nonfunctional-phase.test.ts', test: 'reconstructs valid crash prefixes and the next permitted step' },
  { union: 'run log.type', values: ['nonfunctional-repair-assigned', 'nonfunctional-repair-committed'], file: 'subs/harness/src/tests/nonfunctional-repair.test.ts', test: 'one authorized repair edits two modules from the chosen src, then reassesses every NFR' },
  { union: 'run log.type', values: ['nonfunctional-deviation-recorded'], file: 'subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts', test: 'an NFR-only exhausted run completes pending review with an exact source-bound CheckFinding' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.owner.kind', values: ['run'], file: 'subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts', test: 'an NFR-only exhausted run completes pending review with an exact source-bound CheckFinding' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.source.kind', values: ['document'], file: 'subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts', test: 'an NFR-only exhausted run completes pending review with an exact source-bound CheckFinding' },
  { union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision.action', values: ['request-user-decision'], file: 'subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts', test: 'an NFR-only exhausted run completes pending review with an exact source-bound CheckFinding' },
  { union: 'run log[session-opened].data.role', values: ['nonfunctional-coordinator'], file: 'subs/harness/src/tests/plan13-composed-functional.test.ts', test: 'functional work cites one NFR while the coordinator assesses the complete two-NFR catalog' },
  { union: 'run log[session-opened].data.role', values: ['nonfunctional-repair-engineer'], file: 'subs/harness/src/tests/nonfunctional-repair.test.ts', test: 'one authorized repair edits two modules from the chosen src, then reassesses every NFR' },
  { union: 'run log[context-package-appended].data.outcome', values: ['session-lost'], file: 'subs/harness/src/tests/context-selection-runtime.test.ts', test: 'lost parent session reconstructs the exact package in a fresh organizing prompt from the record alone, without reselection' },
  { union: 'run log[nonfunctional-assessed].data.phase', values: ['after-repair'], file: 'subs/harness/src/tests/nonfunctional-repair.test.ts', test: 'one authorized repair edits two modules from the chosen src, then reassesses every NFR' },
  { union: 'run log[nonfunctional-round-closed].data.outcome', values: ['continue', 'exhausted'], file: 'subs/harness/src/tests/nonfunctional-recovery.test.ts', test: 'round three exhausts and a late source change still refuses the final gate' },
  { union: 'record ramify-agent.document-manifest/1.documents[].kind', values: ['principle'], file: 'subs/harness/subs/plan-evidence/src/tests/discovery.test.ts', test: 'records invalid text and excludes nested independent principles even under a foreign subs directory' },
  { union: 'record ramify-agent.document-manifest/1.missing[].judgment', values: ['unjudged'], file: 'subs/harness/subs/plan-evidence/src/tests/discovery.test.ts', test: 'reports missing local links with source offsets and refuses symlink escape' },
  { union: 'record ramify-agent.document-manifest/1.principlesScan.status', values: ['complete'], file: 'subs/harness/subs/plan-evidence/src/tests/discovery.test.ts', test: 'records invalid text and excludes nested independent principles even under a foreign subs directory' },
  { union: 'record ramify-agent.document-manifest/1.principlesScan.status', values: ['partial'], file: 'subs/harness/subs/plan-evidence/src/tests/discovery.test.ts', test: 'a root principles listing failure is partial coverage with an explicit root gap' },
  // Plan 14's element catalog: the intake's and the principles extraction's elements, and the checkers' corrections.
  { union: 'record ramify-agent.element-catalog/1.elements[].kind', values: ['non-functional', 'recommendation'], file: 'subs/harness/src/tests/analysis-plan-evidence.test.ts', test: 'accepts the intake\'s elements and incorporation once, and projects them by kind with an unclear source excerpt' },
  { union: 'record ramify-agent.element-catalog/1.elements[].kind', values: ['fixed'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'adds fixed requirements and recommendations of its own document, numbered past the intake\'s' },
  { union: 'record ramify-agent.element-catalog/1.elements[].kind', values: ['context'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'findings name the IDs each correction produced, in correction order' },
  { union: 'record ramify-agent.element-catalog/1.elements[].conditions[].source', values: ['stated', 'inferred'], file: 'subs/harness/src/tests/analysis-plan-evidence.test.ts', test: 'accepts the intake\'s elements and incorporation once, and projects them by kind with an unclear source excerpt' },
  { union: 'record ramify-agent.element-catalog/1.documents[].kind', values: ['principle'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'adds fixed requirements and recommendations of its own document, numbered past the intake\'s' },
  { union: 'record ramify-agent.document-incorporation/2.missing[].judgment', values: ['unclear'], file: 'subs/harness/src/tests/analysis-plan-evidence.test.ts', test: 'accepts the intake\'s elements and incorporation once, and projects them by kind with an unclear source excerpt' },
  { union: 'submission catalog-check.corrections[].action', values: ['add'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'adds a constraint its document states and the reading omitted, with a finding naming the new ID' },
  { union: 'submission catalog-check.corrections[].action', values: ['replace'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'splits a cited functional element, and the entry and its scenario are re-cited to the new IDs' },
  { union: 'submission catalog-check.corrections[].action', values: ['rewrite'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'rewrites a reading in place, and corrects only elements of its own document' },
  { union: 'run log[analysis-accepted].data.findings[].action', values: ['add', 'replace', 'rewrite'], file: 'subs/harness/src/tests/catalog-extraction.test.ts', test: 'findings name the IDs each correction produced, in correction order' },
  { union: 'record ramify-agent.nonfunctional-assessment/1.phase', values: ['after-repair'], file: 'subs/harness/src/tests/nonfunctional-repair.test.ts', test: 'one authorized repair edits two modules from the chosen src, then reassesses every NFR' },
  { union: 'record ramify-agent.nonfunctional-assessment/1.results[].result', values: ['satisfied'], file: 'subs/harness/src/tests/plan13-composed-functional.test.ts', test: 'functional work cites one NFR while the coordinator assesses the complete two-NFR catalog' },
  { union: 'record ramify-agent.nonfunctional-assessment/1.results[].result', values: ['not-satisfied'], file: 'subs/harness/src/tests/nonfunctional-repair.test.ts', test: 'one authorized repair edits two modules from the chosen src, then reassesses every NFR' },
  { union: 'record ramify-agent.nonfunctional-assessment/1.results[].result', values: ['undetermined'], file: 'subs/harness/src/tests/nonfunctional-phase.test.ts', test: 'reconstructs valid crash prefixes and the next permitted step' },
  { union: 'record ramify-agent.nonfunctional-round/1.outcome', values: ['continue', 'exhausted'], file: 'subs/harness/src/tests/nonfunctional-recovery.test.ts', test: 'round three exhausts and a late source change still refuses the final gate' },
  { union: 'query analysis.analysis[accepted].planEvidence[available].missing[].judgment', values: ['unclear'], file: 'subs/harness/src/tests/analysis-plan-evidence.test.ts', test: 'accepts the intake\'s elements and incorporation once, and projects them by kind with an unclear source excerpt' },
];

/**
 * Query unions that project a record union value for value. A projected
 * value has a producer exactly when the record value does, and is excused
 * exactly when the record value is; the suite checks the two value lists
 * are the same.
 */
const projections: ReadonlyArray<readonly [query: string, record: string]> = [
  ['query decisions.decisions[][placement].outcome', 'record ramify-agent.placement-decision/1.outcome'],
  ['query work-item.iterations[].result.outcome', 'record ramify-agent.iteration-result/1.outcome'],
  ['query work-item.iterations[].gates[].cause', 'record ramify-agent.gate-attempt/3.cause'],
  ['query work-item.iterations[].gates[].next', 'record ramify-agent.gate-attempt/3.next'],
  ['query gate.gate.rules[].outcome', 'record ramify-agent.gate-attempt/3.rules[].outcome'],
  ['query gate.gate.commands[].kind', 'record ramify-agent.gate-attempt/3.commands[].kind'],
  ['query gate.gate.commands[].notVerified', 'record ramify-agent.gate-attempt/3.commands[].notVerified'],
  ['query gate.gate.commands[].selection.policy', 'record ramify-agent.gate-attempt/3.commands[].selection.policy'],
  ['query analysis.analysis[accepted].scenarios[].kind', 'record ramify-agent.scenario/1.kind'],
  ['query analysis.analysis[accepted].scenarios[].origin.kind', 'record ramify-agent.scenario/1.origin.kind'],
  ['query analysis.analysis[accepted].warnings[].kind', 'run log[analysis-accepted].data.warnings[].kind'],
  ['query analysis.analysis[accepted].planEvidence[available].elements[].kind', 'record ramify-agent.element-catalog/1.elements[].kind'],
  ['query analysis.analysis[accepted].planEvidence[available].elements[].conditions[].source', 'record ramify-agent.element-catalog/1.elements[].conditions[].source'],
  ['query analysis.analysis[accepted].planEvidence[available].findings[].action', 'run log[analysis-accepted].data.findings[].action'],
  ['query scenarios.scenarios[].gates[].status', 'record ramify-agent.gate-attempt/3.commands[].scenarios.scenarios[].status'],
  ['query gate.gate.commands[].scenarios.selection.kind', 'record ramify-agent.gate-attempt/3.commands[].scenarios.selection.kind'],
];

/**
 * Values nothing produces, each with the reason. A value here is one the
 * rule "every value of every union has a producer" is not met for, and the
 * completion report lists every one of them. The suite fails when a value
 * with no producer is missing from this list, and when a value on it gains
 * a producer, so the list can neither hide a new gap nor outlive a closed one.
 */
const withoutProducer: ReadonlyArray<{ readonly union: string; readonly values: readonly string[]; readonly reason: string }> = [
  { union: 'record ramify-agent.gate-attempt/3.commands[].notVerified', values: ['audit-unselected'], reason: 'The current legacy registered executor falls back to a full audit when configured discovery is unavailable. An actual configured empty-selection consumer witness awaits iteration 9; iteration 0 only qualified the provider.' },
  { union: 'query work-item.iterations[].gates[].cause', values: ['in-scope'], reason: 'Historical iterations may project the former in-scope cause; new ordinary gates record the neutral check-failed cause without owner attribution.' },
  { union: 'record ramify-agent.gate-attempt/3.cause', values: ['in-scope', 'outside-assignment'], reason: 'Historical gates retain this inferred attribution, but current gates no longer assign failure ownership from locations or scope probes.' },
  { union: 'run log.type', values: ['capability-candidate-accepted', 'capability-review-recorded', 'capability-assignment-interrupted'],
    reason: 'Historical capability-only transitions remain readable; current policy records ordinary iteration gates, review requests and invocation endings instead.' },
  { union: 'record ramify-agent.gate-attempt/3.attribution.basis', values: ['ramify-findings', 'type-check-errors', 'ramify-findings-and-type-check-errors'],
    reason: 'Historical inferred repair ownership remains readable; current gates retain provider diagnostics and agents decide the repair owner without this field.' },
  {
    union: 'run log[capability-assignment-settled].data.outcome', values: ['failed', 'interrupted'],
    reason: 'Current driven capability runs recover interrupted writers into a later settlement or stop the stack; no test commits these terminal settlement outcomes yet.',
  },
  {
    union: 'submission engineer[capability-needed].request.examples[].designation', values: ['executable'],
    reason: 'Current capability service fixtures submit pseudocode examples; no driven engineer submission yet marks an example executable.',
  },
  {
    union: 'query analysis.analysis[accepted].planEvidence.status', values: ['unavailable'],
    reason: 'Legacy coverage unavailability is exercised at the record helper boundary, but the current query suite does not construct an accepted legacy run for this projection branch.',
  },
  {
    union: 'run log[context-package-appended].data.outcome', values: ['already-present', 'failed', 'no-session'],
    reason: 'The append effect retains distinct idempotent, failed and absent-parent outcomes. Current composed runs exercise appended and a lost parent; no focused runtime test drives these three outcomes yet.',
  },
  {
    union: 'run log[nonfunctional-round-closed].data.outcome', values: ['unavailable'],
    reason: 'The run can close a round as unavailable when evidence cannot be reconstructed; current executable trials instead refuse changed source before closing a round.',
  },
  {
    union: 'record ramify-agent.nonfunctional-round/1.outcome', values: ['unavailable'],
    reason: 'This record mirrors the unavailable round-close outcome, for which the current executable trials have no producer.',
  },
  {
    union: 'record ramify-agent.document-manifest/1.missing[].judgment', values: ['required', 'unclear', 'advisory'],
    reason: 'Capture records missing links as unjudged. The catalog intake submits the judgments in a separate incorporation record, leaving these manifest-schema values unused by the capture writer.',
  },
  {
    union: 'record ramify-agent.document-incorporation/2.missing[].judgment', values: ['required'],
    reason: 'A required missing reference fails the intake\'s acceptance, so no accepted incorporation record contains this judgment.',
  },
  {
    union: 'record ramify-agent.document-incorporation/2.missing[].judgment', values: ['advisory'],
    reason: 'An advisory judgment is allowed for a missing reference, but the current accepted-incorporation runtime witness only exercises unclear.',
  },
  {
    union: 'query analysis.analysis[accepted].planEvidence[available].missing[].judgment', values: ['advisory'],
    reason: 'The review projection supports advisory missing references, but the current browser and runtime fixtures show an unclear reference only.',
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[].type', values: ['check-finding-related'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.source.kind', values: ['file', 'artifact'],
    reason: 'The NFR deviation adapter reports its captured passage as a document source. The broader CheckFinding schema also permits file and artifact sources, but this carrier never emits them.',
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-opened].data.report.judgment.actor.kind', values: ['user', 'harness'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.communication.mode', values: ['report'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision.action', values: ['claim-repair', 'fix-by-assessment', 'supersede', 'defer', 'reopen', 'revise-obligation'],
    reason: 'The NFR deviation adapter asks for a user decision. Other disposition actions remain legal CheckFinding variants, but this event carrier does not emit them.',
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[plan-repair].repair.kind', values: ['assignment'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[fix-by-check].witness.coverage', values: ['partial', 'not-run'],
    reason: 'A witness the child accepts executed its obligation completely and passed. The scenario adapter offers partial and unrun witnesses, and the child refuses them before anything reaches the log; the refusal stays a note on the gate\'s line (scenario-findings.test.ts).',
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[fix-by-check].witness.outcome', values: ['failed', 'inconclusive'],
    reason: 'A witness the child accepts executed its obligation completely and passed. The scenario adapter offers failed and inconclusive witnesses, and the child refuses them before anything reaches the log; the refusal stays a note on the gate\'s line (scenario-findings.test.ts).',
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[waive].authority.kind', values: ['work-item-assessment', 'governing-record'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[defer].revisit.kind', values: ['condition', 'follow-up'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-decided].data.decision.decision[reopen].cause.kind', values: ['decision', 'report'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[nonfunctional-deviation-recorded].data.checkFindings[][check-finding-related].data.relation.relation', values: ['same-issue', 'related-but-distinct', 'distinct', 'uncertain'],
    reason: "The shared CheckFinding union permits this value, but the non-functional deviation event carries only its fixed source-grounded report and request-user-decision. This variant is not emitted by that carrier.",
  },
  {
    union: 'run log[gate-attempted].data.scenarioFindings.refused.reason', values: ['transition-refused'],
    reason: 'The scenario adapter decides every command of a gate\'s CheckFinding part in order before the transition decides them again, and leaves out each one the child refuses, so the transition has nothing left to refuse. The value keeps an unexpected refusal from failing the gate; it has never been reached.',
  },
  {
    union: 'run log[gate-attempted].data.scenarioFindings.notes[].code|0',
    values: ['invalid-command', 'invalid-report', 'report-key-conflict', 'ambiguous-issue-key', 'unknown-check-finding', 'unknown-report', 'stale-revision', 'invalid-transition', 'waived', 'not-waived', 'no-pending-user-decision', 'unknown-option', 'insufficient-authority', 'verification-kind-mismatch', 'factual-obligation', 'required-obligation', 'producer-mismatch', 'wrong-subject', 'source-mismatch', 'relation-self', 'cross-owner', 'relation-cycle', 'replay-conflict', 'invalid-query'],
    reason: 'A note carries the child\'s own rejection code. The scenario adapter reports only a failure of a tracked scenario it bound itself, attaching to the one CheckFinding its key names, and offers a witness only of the same scenario for an open scenario CheckFinding of its own work item, so none of these refusals can follow; the child\'s own tests produce each one.',
  },
  {
    union: 'run log[iteration-closed].data.outcome', values: ['superseded'],
    reason: 'No iteration-closed event carries it: a superseded result is committed by the evidence-reopened transaction, never by iteration-closed. The event\'s schema admits a value its only writer never writes.',
  },
  {
    union: 'run log[job-failed].data.reason', values: ['inputs-changed'],
    reason: 'Nothing fails a run with it. Plan 1 used it for a stale map approval, which Plan 3 removed; RunInputs.changes is never called by the run service, so a changed plan or source is never a run failure.',
  },
  {
    union: 'run log[job-failed].data.reason', values: ['internal'],
    reason: 'Written where the harness finds itself inconsistent: a prompt package that is not loaded, an assignment without an outline, a revision of an agreement the run never registered. No test builds any of those states, because the run service does not reach them from records it wrote itself.',
  },
  {
    union: 'record ramify-agent.job/3.agent', values: ['pi'],
    reason: 'A run started on pi. No pi session ran in this environment: there is no pi login, so the real trial (T2) was not run and nothing produced it. It is produced only by a real `serve --agent pi` run.',
  },
  {
    union: 'record ramify-agent.infrastructure-recovery/1.cause', values: ['check-failed', 'in-scope', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown', 'session-lost'],
    reason: 'An InfrastructureRecovery is written only by readiness, whose recoveries have three causes. The gate\'s own infrastructure retry reruns the gate and writes no recovery record, and a reconstructed session is recorded on the invocation, so these causes, shared with GateAttempt.cause and the session vocabulary, have no writer.',
  },
  {
    union: 'record ramify-agent.infrastructure-recovery/1.action', values: ['reconstruct-session', 'none'],
    reason: 'Readiness plans only reinstall-nested, restart-daemon and rerun-command; an unrecoverable failure records no recovery at all (iteration 4, deviation 9), and session reconstruction is recorded on the invocation, not as a recovery.',
  },
  {
    union: 'run log[invocation-ended].data[true].degraded.actual', values: ['continue', 'fork'],
    reason: 'The agent port degrades a start it cannot honor to fresh, and both of its implementations do. The field takes the port\'s mode as it is answered, so an executor that answered another is recorded rather than refused.',
  },
  {
    union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['provider-error'],
    reason: 'No code path writes it: a provider error reaches the harness as a failed session outcome, which is recorded as ended: failed with the error text and no interruption.',
  },
  {
    union: 'record ramify-agent.gate-attempt/3.commands[].kind', values: ['conformance'],
    reason: 'A conformance suite runs inside the project\'s own tests command, selected through extraSuites (iteration 9); no gate records a command of kind conformance.',
  },
  {
    union: 'run log[gate-command-started].data.kind', values: ['conformance'],
    reason: 'A gate announces the commands it plans, and no gate plans a command of kind conformance: a conformance suite runs inside the project\'s own tests command, selected through extraSuites (iteration 9).',
  },
  {
    union: 'record ramify-agent.gate-attempt/3.commands[].selection.policy', values: ['all-project'],
    reason: 'An all-project checkpoint attaches no TestSelection to its commands (iteration 4, deviation 10), so no recorded selection has this policy; current gates do not run scope probes.',
  },
  {
    union: 'record ramify-agent.gate-attempt/3.cause', values: ['invalid-session'],
    reason: 'A session the implementation can no longer read is detected before the gate and recorded on the invocation as a degraded session mode (iteration 6, deviation 8), so no gate attempt carries this cause.',
  },
  {
    union: 'record ramify-agent.iteration-assignment/1.kind', values: ['integration'],
    reason: 'Not assignable: the architect\'s assignment body has no integration kind, and no harness path creates one. It is in the record\'s vocabulary from the proposal and has never had a use.',
  },
  {
    union: 'record ramify-agent.iteration-assignment/1.scope.extra[].purpose', values: ['consumer'],
    reason: 'The consumer is a contract scope\'s base, not an extra location (iteration 9), so no writer names it.',
  },
  {
    union: 'record ramify-agent.iteration-assignment/1.evidenceObligations[].against', values: ['fake'],
    reason: 'The contract gate requires the suite against the fake through the selection it resolves at the gate, because the suite does not exist when the assignment is made (iteration 9); no assignment records an obligation against the fake.',
  },
  {
    union: 'record ramify-agent.iteration-assignment/1.gate.checkpoint', values: ['readiness', 'work-item', 'final'],
    reason: 'An assignment\'s checkpoint is derived from its kind and is iteration, contract or breaking-iteration; the field shares the checkpoint vocabulary of GateAttempt, where these three are produced.',
  },
  {
    union: 'record ramify-agent.reconciliation-basis/1.requests[].result', values: ['partial'],
    reason: 'A partial review settles its request like a complete one; the reconciliation tests\' reviewers submit complete reviews, and partial coverage is exercised by the review tests of iterations 3 and 4.',
  },
  {
    union: 'record ramify-agent.reconciliation-assessment/1.requestedStart', values: ['fresh'],
    reason: 'Every reconciliation requests the fork of its completion request; a missing point is a degraded fork request, recorded as requested fork and actually fresh (appendix §5), so no assessment requests a fresh start.',
  },
  {
    union: 'record ramify-agent.job/3.policy.limits.laterRoundMinimumRisk', values: ['high'],
    reason: 'The trial captures medium (appendix §4); high is a policy value no run captures yet, and the floor rule for it is exercised by reconciliation-submission.test.ts.',
  },
  {
    union: 'error.error.code', values: ['inputs-changed'],
    reason: 'Plan 1\'s answer to a stale map approval. Plan 3 removed the approval and nothing answers it now.',
  },
  {
    union: 'error.error.code', values: ['internal'],
    reason: 'The HTTP layer\'s answer to an exception it did not expect, and the command answer when the harness has lost its project lock. No test provokes either.',
  },
];
describe('every value of every union has a producer', () => {
  test('the union list is complete, and every value is produced by a composed run, by a named test, or is named with the reason it has none', async () => {
    const inventory = unionInventory(unionRoots());
    expect(inventory.size).toBeGreaterThan(50);
    const observed = await observedInComposedRuns();
    const byName = new Map([...inventory.entries()].map(([schema, site]) => [site.name, { schema, site }]));

    const cited = new Map<string, Set<string>>();
    for (const entry of producedElsewhere) {
      expect(byName.has(entry.union), `no union is named ${entry.union}`).toBe(true);
      const source = await readFile(join(packageRoot, entry.file), 'utf8');
      expect(titleLine(source, entry.test), `${entry.file} has no test named "${entry.test}"`).toBeDefined();
      for (const value of entry.values) {
        expect(byName.get(entry.union)!.site.values, `${entry.union} has no value ${value}`).toContain(value);
        (cited.get(entry.union) ?? cited.set(entry.union, new Set()).get(entry.union)!).add(value);
      }
    }
    const excused = new Map<string, Set<string>>();
    for (const entry of withoutProducer) {
      expect(byName.has(entry.union), `no union is named ${entry.union}`).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(20);
      for (const value of entry.values) (excused.get(entry.union) ?? excused.set(entry.union, new Set()).get(entry.union)!).add(value);
    }

    const producedIn = (name: string, value: string): boolean =>
      (observed.get(byName.get(name)!.schema)?.has(value) ?? false) || (cited.get(name)?.has(value) ?? false);
    const projected = new Map(projections.map(([query, record]) => [query, record]));
    for (const [query, record] of projections) {
      expect(byName.has(query) && byName.has(record), `${query} or ${record} is not a union`).toBe(true);
      expect(byName.get(query)!.site.values, `${query} does not project ${record} value for value`).toEqual(byName.get(record)!.site.values);
    }

    const unproduced: string[] = [];
    const stale: string[] = [];
    for (const [, site] of inventory) {
      const source = projected.get(site.name);
      for (const value of site.values) {
        const produced = producedIn(site.name, value) || (source !== undefined && producedIn(source, value));
        const isExcused = (excused.get(site.name)?.has(value) ?? false) || (source !== undefined && (excused.get(source)?.has(value) ?? false));
        if (!produced && !isExcused) unproduced.push(`${site.name} = ${value}`);
        if (isExcused && produced) stale.push(`${site.name} = ${value}`);
      }
    }
    // `COMPOSITION_UNIONS=<file>` writes the inventory and what produced each value, for the results note.
    if (process.env.COMPOSITION_UNIONS !== undefined) {
      const report = [...inventory.entries()].map(([schema, site]) => ({
        union: site.name,
        values: site.values.map(value => ({
          value,
          producer: observed.get(schema)?.has(value) === true ? 'composed run'
            : cited.get(site.name)?.has(value) === true ? 'named test'
              : projections.some(([query, record]) => query === site.name && producedIn(record, value)) ? 'projection of a produced record value'
                : excused.get(site.name)?.has(value) === true || projections.some(([query, record]) => query === site.name && excused.get(record)?.has(value) === true) ? 'none, with a reason'
                  : 'none',
        })),
      }));
      await writeFile(process.env.COMPOSITION_UNIONS, `${JSON.stringify(report, null, 2)}\n`);
    }
    expect(unproduced, 'values with no producer and no recorded reason').toEqual([]);
    expect(stale, 'values recorded as having no producer that now have one').toEqual([]);
  }, 300_000);
});

/** The line that declares a test or a suite by this title, where it is declared and not skipped. */
function titleLine(source: string, title: string): string | undefined {
  const escaped = title.replaceAll('\'', '\\\'');
  return source.split('\n').find(line =>
    // A conditional suite, such as the fixture trials' `describe.runIf(...)`, is declared all the same.
    /\b(test|it|describe)(\.(each|runIf)\(.*\))?\(/.test(line)
    && (line.includes(title) || line.includes(escaped))
    && !/\.(skip|todo|only)\(/.test(line));
}

interface MatrixCase {
  readonly case: string;
  readonly owner: number;
  readonly tests?: ReadonlyArray<{ readonly file: string; readonly titles: readonly string[] }>;
  readonly trial?: string;
  readonly document?: string;
}

/** The iteration results note that owns a case, and the files its row names. */
async function ownedCases(): Promise<Map<string, Array<{ iteration: number; files: string[] }>>> {
  const owned = new Map<string, Array<{ iteration: number; files: string[] }>>();
  const directory = join(planDirectory, 'iterations');
  for (const name of await readdir(directory)) {
    const match = /^iteration(\d+)-results\.md$/.exec(name);
    if (match === null) continue;
    const iteration = Number(match[1]);
    const text = await readFile(join(directory, name), 'utf8');
    for (const section of text.split(/\n(?=## )/)) {
      if (!/cceptance cases/.test(section.split('\n')[0] ?? '')) continue;
      let previous: string[] = [];
      for (const line of section.split('\n')) {
        const row = /^\|\s*([CGPKXMT]\d+[abc]?)\s*\|/.exec(line);
        if (row === null) continue;
        let files = [...line.matchAll(/`([\w./-]+\.test\.tsx?)`/g)].map(found => basename(found[1]!));
        if (files.length === 0 && /[Tt]he same test/.test(line)) files = previous;
        previous = files;
        const list = owned.get(row[1]!) ?? [];
        list.push({ iteration, files });
        owned.set(row[1]!, list);
      }
    }
  }
  return owned;
}

describe('the acceptance matrix, composed', () => {
  test('every case has exactly one owning iteration, and its owning tests are present by name and belong to that iteration', async () => {
    const matrix = JSON.parse(await readFile(join(planDirectory, 'acceptance-evidence.json'), 'utf8')) as { cases: MatrixCase[] };
    const cases = matrix.cases.map(entry => entry.case);
    // The main plan's matrix: five core cases, ten architecture cases, five
    // contract cases, nine check cases (K5 split in two), eight context and
    // boundary cases (X1 split in three), five measurement cases and four
    // trials.
    expect(cases).toHaveLength(46);
    expect(new Set(cases).size).toBe(46);

    const owned = await ownedCases();
    const problems: string[] = [];
    for (const entry of matrix.cases) {
      const claims = owned.get(entry.case) ?? [];
      if (claims.length !== 1) problems.push(`${entry.case}: claimed by iterations ${claims.map(claim => claim.iteration).join(', ') || 'none'}`);
      else if (claims[0]!.iteration !== entry.owner) problems.push(`${entry.case}: owned by iteration ${claims[0]!.iteration}, the matrix names ${entry.owner}`);
      for (const evidence of entry.tests ?? []) {
        const path = join(packageRoot, evidence.file);
        if (!existsSync(path)) {
          problems.push(`${entry.case}: ${evidence.file} does not exist`);
          continue;
        }
        const source = await readFile(path, 'utf8');
        for (const title of evidence.titles) {
          if (titleLine(source, title) === undefined) problems.push(`${entry.case}: ${evidence.file} has no test named "${title}"`);
        }
        if (claims.length === 1 && !claims[0]!.files.includes(basename(evidence.file))) {
          problems.push(`${entry.case}: iteration ${entry.owner}'s results note does not name ${basename(evidence.file)}`);
        }
      }
      if (entry.tests === undefined && entry.trial === undefined && entry.document === undefined) problems.push(`${entry.case}: no evidence named`);
    }
    expect(problems).toEqual([]);
  });
});
