import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runEventSchema } from '../run/log.js';
import { observationSchema } from '../run/observations.js';
import { runSchemas } from '../run/records.js';
import { analysisSchemas } from '../analysis/records.js';
import { workSchemas } from '../work/records.js';
import { iterationSchemas } from '../work/iterations.js';
import { contractSchemas } from '../contracts/records.js';
import { architectureSchemas } from '../architecture/records.js';
import { initialAnalysisSubmissionSchema } from '../analysis/submission.js';
import { localArchitectSubmissionSchema } from '../work/submission.js';
import { engineerSubmissionSchema, scopeTestsInputSchema } from '../work/engineer.js';
import { forkSubmissionSchema } from '../architecture/submission.js';
import { contractSubmissionSchema } from '../contracts/submission.js';
import { shellInputSchema } from '../tools/shell.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema, metricsResponseSchema,
  runCommandSchema, runEventPageSchema, runListResponseSchema, runResponseSchema, workItemListResponseSchema,
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
  const runs = await Promise.all(names.map(name => runToEnd(scenarios[name], async (service, runId) => {
    const queries = new RunQueries(service);
    answeredWhileRunning.push({ schema: runResponseSchema, value: await queries.run(plan, runId) });
    answeredWhileRunning.push({ schema: analysisResponseSchema, value: await queries.analysis(plan, runId) });
  })));
  names.forEach((name, index) => finished.set(name, runs[index]!));

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

describe('the recovery tables of the ten state machines', () => {
  test('there is a row for every durable boundary, every machine has rows, and the three recovery files run all of them', async () => {
    const rows = allRows();
    // `recoveryTable` is typed against the run service's own boundary union,
    // so a boundary without a row does not compile; this states the count.
    expect(new Set(rows.map(row => row.write)).size).toBe(33);
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
        await queries.metrics(plan, run.runId);
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
  const registries = { ...runSchemas, ...analysisSchemas, ...workSchemas, ...iterationSchemas, ...contractSchemas, ...architectureSchemas };
  return {
    'run log': runEventSchema,
    'observation log': observationSchema,
    ...Object.fromEntries(Object.values(registries).map(entry => [`record ${entry.schema}`, entry.body])),
    'submission initial-analysis': initialAnalysisSubmissionSchema,
    'submission local-architect': localArchitectSubmissionSchema,
    'submission engineer': engineerSubmissionSchema,
    'submission fork': forkSubmissionSchema,
    'submission contract': contractSubmissionSchema,
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
    'query gate': gateResponseSchema,
    'query metrics': metricsResponseSchema,
  };
}

const submissionSchemas: Readonly<Record<string, unknown>> = {
  'ramify-agent.initial-analysis/2': initialAnalysisSubmissionSchema,
  'ramify-agent.local-architect-submission/1': localArchitectSubmissionSchema,
  'ramify-agent.engineer-submission/1': engineerSubmissionSchema,
  'ramify-agent.fork-submission/1': forkSubmissionSchema,
  'ramify-agent.contract-submission/1': contractSubmissionSchema,
};

/** What the composed runs wrote, walked value by value against the schemas that describe it. */
async function observedInComposedRuns(): Promise<Map<unknown, Set<string>>> {
  const observed = new Map<unknown, Set<string>>();
  const registries = { ...runSchemas, ...analysisSchemas, ...workSchemas, ...iterationSchemas, ...contractSchemas, ...architectureSchemas };
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
  { union: 'run log.type', values: ['readiness-failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'run log.type', values: ['global-context-rebuilt'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the generation rises, the pending brief is cleared, and the next fork is oriented from the records' },
  { union: 'run log.type', values: ['job-interrupted'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after job.json, before the first event, leaves a run that loads and is interrupted' },
  { union: 'run log[brief-appended].data.outcome', values: ['already-present'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'G4: a crash after the append and before its completion answers already-present, and one brief exists' },
  { union: 'run log[iteration-closed].data.notices[].kind', values: ['module-created'], file: 'subs/harness/src/tests/module-creation-integration.test.ts', test: 'a bootstrap assignment creates the module with nested source and its first test, and the notice is read from the commit' },
  { union: 'run log[job-failed].data.reason', values: ['readiness-failed'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'run log[job-failed].data.reason', values: ['repair-exhausted'], file: 'subs/harness/src/tests/work-items.test.ts', test: 'returns to the same local architect, which revises its outline, and exhausts deterministically' },
  { union: 'run log[job-failed].data.reason', values: ['recovery-exhausted'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a failure that keeps recurring ends the run once the bounded recoveries are spent' },
  { union: 'run log[job-failed].data.reason', values: ['writer-unsettled'], file: 'subs/harness/src/tests/writer-settlement.test.ts', test: 'fails as writer-unsettled, and runs no gate against that tree' },
  { union: 'run log[iteration-closed].data.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'run log[gate-attempted].data.verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'observation log[hook-check].data.outcome', values: ['passed'], file: 'subs/harness/src/tests/hook-checks.test.ts', test: 'a check that passed with nothing new tells the engineer nothing' },
  { union: 'observation log[hook-check].data.outcome', values: ['findings'], file: 'subs/harness/src/tests/hook-checks.test.ts', test: 'findings are reported with their count, and the same finding reported again is not new' },
  { union: 'observation log[coverage-gap].data.kind', values: ['observation-truncated'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after writer-released keeps what the shell wrote, closes the invocation and releases no second writer' },
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
  { union: 'record ramify-agent.invocation/1.scope.size.coverage', values: ['complete'], file: 'subs/harness/src/tests/measurement.test.ts', test: 'the one invocation records its snapshot reference and its S_s components' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['idle-timeout'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'no port event for invocationIdleMs ends the invocation as failed, idle-timeout' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['absolute-timeout'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'a session that keeps talking past invocationAbsoluteMs ends as failed, absolute-timeout' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['adapter-fault'], file: 'subs/harness/src/tests/run-bounds.test.ts', test: 'is an adapter fault: the invocation ends failed with that interruption, and the run fails agent-failed' },
  { union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['session-lost'], file: 'subs/harness/src/tests/run-recovery.test.ts', test: 'a crash after invocation-started closes that invocation without an agent call and without a second one' },
  { union: 'record ramify-agent.invocation-outcome/1.disposition', values: ['superseded'], file: 'subs/harness/src/tests/late-writes.test.ts', test: 'is settled with its process group, and its result completes nothing' },
  { union: 'record ramify-agent.gate-attempt/2.rules[].outcome', values: ['failed'], file: 'subs/harness/src/tests/requirement-verification.test.ts', test: 'a file without .fake, an export without Fake and a re-export that drops it each fail the gate' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].outcome', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/2.verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/2.cause', values: ['in-scope'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/2.next', values: ['repair', 'exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].notVerified', values: ['timeout'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].notVerified', values: ['runner-error'], file: 'subs/harness/src/tests/gate-not-verified.test.ts', test: 'records a runner error with the structured error the spawn gave it' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].notVerified', values: ['command-missing'], file: 'subs/harness/src/tests/readiness.test.ts', test: 'a nonexistent command is a readiness failure that consumes no recovery attempt' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].notVerified', values: ['discovery-error'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a discovery that fails never falls back to an earlier list' },
  { union: 'record ramify-agent.gate-attempt/2.commands[].notVerified', values: ['required-suite-missing'], file: 'subs/harness/src/tests/gate-not-verified.test.ts', test: 'refuses a selection that lost a required suite, and one discovery could not establish' },
  { union: 'record ramify-agent.gate-attempt/2.cause', values: ['infrastructure'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a discovery that fails never falls back to an earlier list' },
  { union: 'record ramify-agent.gate-attempt/2.cause', values: ['timeout'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.gate-attempt/2.cause', values: ['outside-assignment'], file: 'subs/harness/src/tests/no-rewind.test.ts', test: 'the work-item gate returns it to the local architect, who assigns the owner that failed' },
  { union: 'record ramify-agent.gate-attempt/2.cause', values: ['guarded-change'], file: 'subs/harness/src/tests/breaking-work.test.ts', test: 'an unauthorized edit of the test-runner configuration is guarded-change, and the same edit under a recorded revision passes' },
  { union: 'record ramify-agent.gate-attempt/2.next', values: ['retry-infrastructure'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a test command that never answers is not-verified with cause timeout, and one infrastructure retry follows' },
  { union: 'record ramify-agent.capability/1.origin', values: ['global-decision'], file: 'subs/harness/src/tests/placement.test.ts', test: 'the first creates a capability and revises its hypothesis; the second inherits its brief and reuses the entry' },
  { union: 'record ramify-agent.iteration-result/1.outcome', values: ['superseded'], file: 'subs/harness/src/tests/contract-revision.test.ts', test: 'an unfinished item is reused and its open assignment closes as superseded; a completed one is followed' },
  { union: 'record ramify-agent.iteration-result/1.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].result.outcome', values: ['exhausted'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].gates[].verdict', values: ['failed'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
  { union: 'query work-item.iterations[].gates[].cause', values: ['in-scope'], file: 'subs/harness/src/tests/iteration-gate.test.ts', test: 'a gate that fails three times exhausts and returns the original cause to the local architect' },
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
  { union: 'command.type', values: ['approve-analysis'], file: 'subs/harness/src/tests/review-stop.test.ts', test: 'start-run with reviewStop and approve-analysis are accepted as stop-job is, and a malformed approval is refused' },
  { union: 'query runs.runs[].phase', values: ['awaiting-review'], file: 'subs/harness/src/tests/review-stop.test.ts', test: 'start-run with reviewStop and approve-analysis are accepted as stop-job is, and a malformed approval is refused' },
  { union: 'run log[analysis-accepted].data.warnings[].kind', values: ['names-view-symbol', 'names-view-file', 'sub-scenario-shares-no-step', 'duplicate-architect-steps'], file: 'subs/harness/src/tests/analysis-scenarios.test.ts', test: 'with an architect view: a module\'s own directory and testing area, and every warning, by scenario ID' },
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
  ['query work-item.iterations[].gates[].cause', 'record ramify-agent.gate-attempt/2.cause'],
  ['query work-item.iterations[].gates[].next', 'record ramify-agent.gate-attempt/2.next'],
  ['query gate.gate.rules[].outcome', 'record ramify-agent.gate-attempt/2.rules[].outcome'],
  ['query gate.gate.commands[].kind', 'record ramify-agent.gate-attempt/2.commands[].kind'],
  ['query gate.gate.commands[].notVerified', 'record ramify-agent.gate-attempt/2.commands[].notVerified'],
  ['query gate.gate.commands[].selection.policy', 'record ramify-agent.gate-attempt/2.commands[].selection.policy'],
];

/**
 * Values nothing produces, each with the reason. A value here is one the
 * rule "every value of every union has a producer" is not met for, and the
 * completion report lists every one of them. The suite fails when a value
 * with no producer is missing from this list, and when a value on it gains
 * a producer, so the list can neither hide a new gap nor outlive a closed one.
 */
const withoutProducer: ReadonlyArray<{ readonly union: string; readonly values: readonly string[]; readonly reason: string }> = [
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
    union: 'record ramify-agent.job/2.agent', values: ['pi'],
    reason: 'A run started on pi. No pi session ran in this environment: there is no pi login, so the real trial (T2) was not run and nothing produced it. It is produced only by a real `serve --agent pi` run.',
  },
  {
    union: 'record ramify-agent.infrastructure-recovery/1.cause', values: ['in-scope', 'invalid-session', 'outside-assignment', 'guarded-change', 'unknown', 'session-lost'],
    reason: 'An InfrastructureRecovery is written only by readiness, whose recoveries have three causes. The gate\'s own infrastructure retry reruns the gate and writes no recovery record, and a reconstructed session is recorded on the invocation, so these causes, shared with GateAttempt.cause and the session vocabulary, have no writer.',
  },
  {
    union: 'record ramify-agent.infrastructure-recovery/1.action', values: ['reconstruct-session', 'none'],
    reason: 'Readiness plans only reinstall-nested, restart-daemon and rerun-command; an unrecoverable failure records no recovery at all (iteration 4, deviation 9), and session reconstruction is recorded on the invocation, not as a recovery.',
  },
  {
    union: 'record ramify-agent.invocation-outcome/1.interruption', values: ['provider-error'],
    reason: 'No code path writes it: a provider error reaches the harness as a failed session outcome, which is recorded as ended: failed with the error text and no interruption.',
  },
  {
    union: 'record ramify-agent.gate-attempt/2.commands[].kind', values: ['conformance'],
    reason: 'A conformance suite runs inside the project\'s own tests command, selected through extraSuites (iteration 9); no gate records a command of kind conformance.',
  },
  {
    union: 'record ramify-agent.gate-attempt/2.commands[].selection.policy', values: ['all-project'],
    reason: 'An all-project checkpoint attaches no TestSelection to its commands (iteration 4, deviation 10), and the breaking gate\'s probe is an owned-by-scope selection (iteration 10), so no recorded selection has this policy.',
  },
  {
    union: 'record ramify-agent.gate-attempt/2.cause', values: ['invalid-session'],
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
    union: 'record ramify-agent.iteration-assignment/1.scope.extra[].kind', values: ['file'],
    reason: 'It is the default and is represented by the field\'s absence: an architect\'s extra location is recorded without a kind, and only a contract scope\'s directory writes one (iteration 9, deviation 3).',
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
