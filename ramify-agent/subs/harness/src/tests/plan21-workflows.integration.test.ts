import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { ScriptStep, Script } from '../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { GateAttempt } from '../checks/records.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { createConfiguredAudit } from '../../subs/audit/src/check-execution.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { runSessionCommand } from '../sessions/command.js';
import type { SessionProgress } from '../sessions/single.js';
import { copyCapabilityFixture } from './helpers/capability.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { auditDefinition, commandCheck } from './helpers/configured-repository.js';
import {
  addModule, assign, completionProposed, edit, failureAnalystFake, installMiniRunner, outline, partialReport, submit, viewedInputs, write,
} from './helpers/iterations.js';
import { git, initRepository, openRuns, realRamify, runEventsOnDisk, runPath, startRun, until } from './helpers/runs.js';

/*
 * F5 and F6 of Plan 21 iteration 11: production-wired workflows with
 * scripted agents and every installed provider — the public constructor and
 * its fixed policy (run-policy/7, code, scope and design reviews), real Git,
 * a private Ramify daemon, and the published audit provider over the
 * project's committed definitions, root and nested.
 *
 * The notes module declares its `report` directory an owned nested project
 * with an audit definition of its own: a check that compares the limit the
 * report states with the limit it expects. Readiness and the final gate ask
 * the full nested audit; iteration and work-item gates the root's default.
 *
 * Setting PLAN21_ITERATION11_EVIDENCE to a directory writes each workflow's
 * gate attempts and obligation events there; PLAN21_ITERATION11_PROJECTS
 * keeps a copy of each finished project for the browser witness to serve.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

beforeAll(() => {
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

const plan = 'review-notes';
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const report = `${notesDirectory}/report`;
const inclusion = { directory: report, reason: 'The report project states the note limit the notes module enforces',
  instructions: 'Keep the report\'s stated and expected limits equal to the notes module\'s limit; its own audit compares them' };
const scope = { base: { module: notes, included: [inclusion] }, extra: [], read: [], rationale: 'The limit and the report that states it.' };

async function evidence(name: string, value: unknown): Promise<void> {
  const directory = process.env['PLAN21_ITERATION11_EVIDENCE'];
  if (directory === undefined) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

/** Keeps a finished project, its runs and its Git records for the browser witness to serve. */
async function keep(name: string, root: string): Promise<void> {
  const directory = process.env['PLAN21_ITERATION11_PROJECTS'];
  if (directory === undefined) return;
  await cp(root, join(directory, name), { recursive: true, verbatimSymlinks: true });
}

/** The revision a briefing shows for an obligation, which a report is based on. */
function revisionOf(prompt: string, id: string): number {
  const line = new RegExp(`^- ${id} \\([^)]*\\): (pending|bound|done), revision (\\d+);`, 'mu').exec(prompt);
  if (line === null) throw new Error(`The briefing lists no ${id}:\n${prompt.slice(-2000)}`);
  return Number(line[2]);
}

function stateOf(prompt: string, id: string): string {
  return new RegExp(`^- ${id} \\([^)]*\\): (pending|bound|done), revision`, 'mu').exec(prompt)?.[1] ?? 'absent';
}

/**
 * The production roles every workflow answers the same way: the design
 * orientation reads what it is shown, each reader diffs every changed path
 * and raises nothing, and a reconciliation with nothing to decide completes.
 */
function production(roles: (spec: SessionSpec) => readonly ScriptStep[] | undefined): Script {
  return (spec: SessionSpec): readonly ScriptStep[] => {
    if (spec.submission.name === 'submit_reconciliation') {
      return submit({ relations: [], dispositions: [], next: { kind: 'complete' }, brief: 'No concern needs attention.' });
    }
    if (spec.role === 'reviewer') {
      if (spec.prompt.startsWith('Design orientation.')) {
        const read = [...spec.prompt.matchAll(/^## (\S+) \(sha256 /gmu)].map(match => match[1]!);
        return submit({ read, summary: 'The notes module keeps the note limit the plan asks for.' });
      }
      const changed = spec.prompt.split('## The changed paths\n\n')[1]?.split('\n\n')[0] ?? '';
      const paths = [...changed.matchAll(/^- [A-Z] (.+)$/gmu)].map(match => match[1]!);
      return [...paths.map(path => ({ kind: 'tool' as const, tool: 'snapshot_diff', input: { path } })),
        { kind: 'submit', input: { inspected: paths, missing: [], concerns: [] } }];
    }
    if (spec.role === 'failure-analyst') return failureAnalystFake();
    return roles(spec) ?? [{ kind: 'end', message: `no turn scripted for ${spec.role} (${spec.submission.name})` }];
  };
}

/** A completion request that forgets its reports. */
const forgotten = { ...requestCompletion(), reports: [] };
const done = (prompt: string, id: string, where?: string) =>
  ({ id, judgment: 'done' as const, basedOnRevision: revisionOf(prompt, id), ...(where === undefined ? {} : { where }) });
const registration = { kind: 'test' as const, description: 'The notes test states the plan limit' };

/** The notes project with its nested report project, committed on main. */
async function notesProject(): Promise<string> {
  const fixture = await copyFixture({ scratchRule: false });
  cleanups.push(fixture.remove);
  const root = fixture.root;
  await addModule(root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the note limit is what the plan asks for\', () => {',
      '  expect(noteLimit).toBe(400);',
      '});',
      '',
    ].join('\n'),
    'report/limit.json': '{ "limit": 400 }\n',
    'report/expected.json': '{ "limit": 400 }\n',
    'report/check.mjs': [
      'import { readFileSync } from \'node:fs\';',
      'const stated = JSON.parse(readFileSync(\'limit.json\', \'utf8\')).limit;',
      'const expected = JSON.parse(readFileSync(\'expected.json\', \'utf8\')).limit;',
      'if (stated !== expected) { console.error(`report states ${stated}, expects ${expected}`); process.exit(1); }',
      'console.log(`report states ${stated}`);',
      '',
    ].join('\n'),
    'report/ramify-audit.json': auditDefinition([commandCheck('report-limit', [{ name: 'report-limit', cmd: 'node', args: ['check.mjs'] }])],
      { packageDirectories: [] }),
  });
  await writeFile(join(root, notesDirectory, 'module.ramify'), 'ramify 1\nmodule notes\nowned-nested-project "report"\n');
  await installMiniRunner(root);
  // Nested discovery asks the project's own Ramify which trees it owns.
  await symlink(join(process.cwd(), 'node_modules/.bin/ramify'), join(root, 'node_modules/.bin/ramify'));
  await writeFile(join(root, 'ramify-audit.json'), auditDefinition([commandCheck('notes-tests', [
    { name: 'tests', cmd: 'node_modules/.bin/vitest', args: ['run', `${notesDirectory}/src/tests/notes.test.ts`] },
  ])]));
  await initRepository(root);
  return root;
}

async function providers(root: string) {
  const lockDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-plan21-workflow-lock-'));
  cleanups.push(() => rm(lockDirectory, { recursive: true, force: true }));
  const daemon = await realRamify();
  cleanups.push(() => daemon.dispose());
  return {
    git: gitService,
    ramify: daemon.ramify,
    inputs: viewedInputs(daemon.ramify),
    configuredAudit: createConfiguredAudit({ workspaceOwnership: createAuditWorkspaceOwnership(root),
      testLock: { lockPath: join(lockDirectory, 'machine-test.lock') } }),
  };
}

async function gateAttempts(root: string, runId: string, events: readonly RunEvent[]): Promise<GateAttempt[]> {
  return await Promise.all(events.flatMap(event => event.type === 'gate-attempted' ? [event.data.gate] : [])
    .map(async gate => JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(gate)), 'utf8')) as GateAttempt));
}

/** The obligation transitions of a run, as lines a reader can compare. */
function obligationLines(events: readonly RunEvent[]): string[] {
  return events.flatMap(event => {
    const data = event.data as { id?: string; judgment?: string; fakes?: string[]; where?: string; kind?: string };
    if (event.type === 'obligation-registered') return [`registered ${data.id}`];
    if (event.type === 'obligation-bound') return [`bound ${data.id} (${(data.fakes ?? []).join(', ') || 'no fakes'})`];
    if (event.type === 'obligation-reported') return [`reported ${data.id} ${data.judgment}${data.where === undefined ? '' : ' with where'}`];
    return [];
  });
}

const readFileSyncText = (path: string) => readFileSync(path, 'utf8');

function verdicts(spec: { readonly verdicts: readonly unknown[] }): string[] {
  return spec.verdicts.map(verdict => JSON.stringify(verdict));
}

describe('F5/F6 ordinary workflow: failure, repair and full nested acceptance', () => {
  test('a failed nested final audit keeps its declarations and report; a repaired run reports, reassesses across an interruption and passes', async () => {
    const root = await notesProject();
    const main = (await git(root, 'rev-parse', 'HEAD')).trim();
    const external = await providers(root);
    const witnessed: Record<string, unknown> = {};

    // Run 1: the engineer raises the limit and the report's stated limit,
    // but not what the report expects.
    let firstEngineer = 0;
    let firstArchitect = 0;
    const first = production(spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('review-note', notes)]));
      if (spec.submission.name === 'submit_work_item_result') {
        firstArchitect += 1;
        if (firstArchitect === 1) {
          return submit({ ...assign(notes, { goal: 'Raise the note limit to 500 characters.', obligations: ['sc-001'], scope }, outline()),
            registrations: [registration] });
        }
        witnessed['run1-completion-briefing'] = { sc001: stateOf(spec.prompt, 'sc-001'), test001: stateOf(spec.prompt, 'test-001') };
        return [...submit(forgotten), ...submit({ ...requestCompletion(), reports: [
          done(spec.prompt, 'sc-001', 'notes.test.ts — the note limit test'), done(spec.prompt, 'test-001'),
        ] })];
      }
      if (spec.role === 'engineer') {
        firstEngineer += 1;
        if (firstEngineer === 1) {
          return [
            write('tmp/draft.txt', 'scratch kept through the repair\n'),
            edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
            edit('../report/limit.json', '400', '500'),
            { kind: 'submit', input: completionProposed('Raised the limit.') },
            { kind: 'submit', input: completionProposed('Raised the limit and the report\'s stated limit.', {
              bindings: [{ id: 'sc-001', fakes: ['FakeReportReader'] }] }) },
          ];
        }
        witnessed['run1-repair'] = {
          continued: spec.session.mode,
          gateDigest: spec.prompt.includes('## The gate did not pass'),
          scratchKept: existsSync(join(root, notesDirectory, 'src/tmp/draft.txt')),
        };
        return submit(completionProposed('The test states the new limit.', { bindings: [{ id: 'sc-001', fakes: ['FakeReportReader'] }] }),
          edit('tests/notes.test.ts', 'toBe(400)', 'toBe(500)'));
      }
      return undefined;
    });
    const opened = await openRuns(root, { production: true, ...external, script: first });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(plan));
    await opened.service.settled(plan, receipt.jobId);
    const failedRun = receipt.jobId;
    const failedEvents = await runEventsOnDisk(root, plan, failedRun);
    const failedGates = await gateAttempts(root, failedRun, failedEvents);
    const failedFinal = failedGates.find(gate => gate.checkpoint === 'final');
    const sessions = opened.agent!.sessions;
    await opened.service.close();

    // The production constructor fixed the policy and its reviews.
    const job = JSON.parse(await readFile(runPath(root, plan, failedRun, 'job.json'), 'utf8')) as { policy: { version: string; reviews: { kinds: string[] } } };
    expect(job.policy.version).toBe('run-policy/7');
    expect(job.policy.reviews.kinds).toEqual(expect.arrayContaining(['code', 'scope', 'design']));
    expect(failedEvents.filter(event => event.type === 'review-attempt-finished').length).toBeGreaterThan(0);

    // PB3-D11: the proposal without its binding was rejected before any gate.
    const engineerSessions = sessions.filter(session => session.spec.role === 'engineer');
    expect(verdicts(engineerSessions[0]!)[0]).toContain('sc-001');
    expect(witnessed['run1-repair']).toEqual({ continued: 'continue', gateDigest: true, scratchKept: true });
    // PB3-C01: the completion request without its reports was rejected naming both IDs.
    const architectSessions = sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
    expect(verdicts(architectSessions.at(-1)!)[0]).toContain('leaves sc-001, test-001 without a done report');
    // PB3-D03: the passing iteration gate left sc-001 bound; only the report made it done.
    expect(witnessed['run1-completion-briefing']).toEqual({ sc001: 'bound', test001: 'pending' });
    expect(obligationLines(failedEvents)).toEqual([
      'registered test-001', 'bound sc-001 (FakeReportReader)', 'bound sc-001 (FakeReportReader)',
      'reported sc-001 done with where', 'reported test-001 done',
    ]);

    // Readiness and the final gate asked the full nested audit; the
    // iteration gates asked the root's default. The repair's gate passed.
    const readiness = JSON.parse(await readFile(runPath(root, plan, failedRun, runLayout.readiness(1)), 'utf8')) as { verdict: string; audit?: unknown };
    expect(readiness.verdict).toBe('passed');
    expect(readiness.audit).toMatchObject({ requestedSourceCommit: main, reused: false });
    const iterationGates = failedGates.filter(gate => gate.checkpoint === 'iteration');
    expect(iterationGates.map(gate => gate.verdict)).toEqual(['failed', 'passed']);
    expect(iterationGates.every(gate => gate.audit?.nested !== true)).toBe(true);
    // PB3-R03: the failing nested project fails the final gate and the run;
    // the root passed beside it, and the declarations stand.
    expect(failedFinal).toBeDefined();
    expect(failedFinal!.verdict).toBe('failed');
    expect(failedFinal!.audit).toMatchObject({ mode: 'full', nested: true, verdict: 'fail' });
    const projects = failedFinal!.audit!.projects!;
    expect(projects.map(project => [project.projectRoot, project.verdict, project.execution])).toEqual([['.', 'pass', expect.stringMatching(/^(ran|reused)$/u)], [report, 'fail', 'ran']]);
    const failure = failedEvents.find(event => event.type === 'job-failed');
    expect(failure?.type === 'job-failed' ? failure.data.reason : null).toBe('repair-exhausted');
    expect(failedEvents.filter(event => event.type === 'obligation-reported' && event.data.judgment === 'bound')).toEqual([]);
    // PB3-S08: the scratch draft lived through the repair and went with the
    // run's last iteration; the included project tree was committed, never cleaned.
    expect(existsSync(join(root, notesDirectory, 'src/tmp/draft.txt'))).toBe(false);
    expect(await git(root, 'show', `${failedFinal!.audited}:${report}/limit.json`)).toBe('{ "limit": 500 }\n');
    const failedReportRef = projects[1]!.evidence!.reportCommit;
    await evidence('w1-run1', { runId: failedRun, final: failedFinal, gates: failedGates.map(gate => ({ id: gate.id, checkpoint: gate.checkpoint,
      verdict: gate.verdict, audit: gate.audit })), obligations: obligationLines(failedEvents), readiness: readiness.audit });

    // Run 2 from main: the repair states the report's expected limit too.
    await git(root, 'checkout', '--quiet', main);
    await git(root, 'checkout', '--quiet', '-B', 'main');
    let secondEngineer = 0;
    const architectTurns: Array<(spec: SessionSpec) => readonly ScriptStep[]> = [
      () => submit({ ...assign(notes, { goal: 'Raise the note limit to 500 characters, report included.', obligations: ['sc-001'], scope }, outline()),
        registrations: [registration] }),
      spec => {
        witnessed['run2-after-partial'] = { unfinished: spec.prompt.includes('The report project still states 400') };
        return submit(assign(notes, { goal: 'Finish the report project\'s limits.', obligations: ['sc-001'], scope }));
      },
      // A done report over a binding that names a fake is accepted.
      spec => submit({ ...assign(notes, { goal: 'Replace the fake report reader.', obligations: ['sc-001'], scope }),
        reports: [done(spec.prompt, 'sc-001', 'notes.test.ts')] }),
      spec => {
        witnessed['run2-reassessment-briefing'] = { sc001: stateOf(spec.prompt, 'sc-001'), test001: stateOf(spec.prompt, 'test-001') };
        // Reassessment: the architect revises its earlier done to bound.
        return submit({ ...assign(notes, { goal: 'State the limit at its edge.', obligations: ['sc-001'], scope }),
          reports: [{ id: 'sc-001', judgment: 'bound', basedOnRevision: revisionOf(spec.prompt, 'sc-001') }] });
      },
      spec => [...submit(forgotten), ...submit({ ...requestCompletion(), reports: [
        done(spec.prompt, 'sc-001', 'notes.test.ts — both limit tests'), done(spec.prompt, 'test-001'),
      ] })],
    ];
    let architectTurn = 0;
    const second = production(spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('review-note', notes)]));
      if (spec.submission.name === 'submit_work_item_result') {
        return architectTurns[architectTurn++]!(spec);
      }
      if (spec.role === 'engineer') {
        secondEngineer += 1;
        if (secondEngineer === 1) {
          return submit(partialReport(['Raised the note limit in the notes module'], ['The report project still states 400']),
            edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'), edit('tests/notes.test.ts', 'toBe(400)', 'toBe(500)'));
        }
        if (secondEngineer === 2) {
          return submit(completionProposed('The report states and expects 500.', { bindings: [{ id: 'sc-001', fakes: ['FakeReportReader'] }] }),
            edit('../report/limit.json', '400', '500'), edit('../report/expected.json', '400', '500'));
        }
        if (secondEngineer === 3) {
          return submit(completionProposed('The notes read the real report.', { bindings: [{ id: 'sc-001' }] }),
            edit('notes.ts', 'noteLimit = 500;', 'noteLimit = 500; // the report states the same limit'));
        }
        return submit(completionProposed('The limit holds at its edge.', { bindings: [{ id: 'sc-001' }] }),
          edit('tests/notes.test.ts', '});\n', '});\n\ntest(\'a note at the limit fits\', () => {\n  expect(noteLimit - 500).toBe(0);\n});\n'));
      }
      return undefined;
    });
    const reopened = await openRuns(root, { production: true, ...external, script: second });
    cleanups.push(() => reopened.service.close());
    const secondReceipt = await reopened.service.execute(startRun(plan));
    const repairedRun = secondReceipt.jobId;
    await reopened.service.settled(plan, repairedRun);
    const repairedEvents = await runEventsOnDisk(root, plan, repairedRun);
    const repairedGates = await gateAttempts(root, repairedRun, repairedEvents);
    const repairedFinal = repairedGates.find(gate => gate.checkpoint === 'final')!;

    expect(repairedEvents.at(-1)!.type, JSON.stringify(repairedEvents.slice(-8))).toBe('job-completed');
    // PB3-C02: the partial report's unfinished work reached the architect, who assigned it.
    expect(witnessed['run2-after-partial']).toEqual({ unfinished: true });
    expect(repairedEvents.filter(event => event.type === 'iteration-closed').map(event => (event.data as { outcome: string }).outcome))
      .toEqual(['partial', 'accepted', 'accepted', 'accepted']);
    // PB3-C06: the architect saw its own done report before revising it,
    // and every assignment kept the scope with its included project tree.
    expect(witnessed['run2-reassessment-briefing']).toEqual({ sc001: 'done', test001: 'pending' });
    const assignments = await Promise.all(repairedEvents.filter(event => event.type === 'iteration-assigned').map(async (_event, index) =>
      JSON.parse(await readFile(runPath(root, plan, repairedRun, iterationLayout.assignment('wi-001', index + 1)), 'utf8')) as IterationAssignment));
    expect(assignments).toHaveLength(4);
    expect(assignments.map(assignment => assignment.scope.resolved.included.map(entry => [entry.kind, entry.directory])))
      .toEqual(Array.from({ length: 4 }, () => [['owned-nested-project', report]]));
    // PB3-D12, PB3-C06: done over a fake, a rebinding that leaves it done,
    // the architect's revision back to bound, the rebinding and the final report.
    expect(obligationLines(repairedEvents)).toEqual([
      'registered test-001', 'bound sc-001 (FakeReportReader)', 'reported sc-001 done with where', 'bound sc-001 (no fakes)',
      'reported sc-001 bound', 'bound sc-001 (no fakes)', 'reported sc-001 done with where', 'reported test-001 done',
    ]);
    const repairedSessions = reopened.agent!.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
    expect(verdicts(repairedSessions.at(-1)!)[0]).toContain('leaves sc-001, test-001 without a done report');

    // PB3-R03: the full nested final gate passed on the repaired commit, and
    // the failing record of the first run remains retrievable beside it.
    expect(repairedFinal.verdict).toBe('passed');
    expect(repairedFinal.audit).toMatchObject({ mode: 'full', nested: true, verdict: 'pass' });
    expect(repairedFinal.audit!.projects!.map(project => [project.projectRoot, project.verdict, project.execution])).toEqual([['.', 'pass', expect.stringMatching(/^(ran|reused)$/u)], [report, 'pass', 'ran']]);
    expect(await git(root, 'show', `${repairedFinal.audited}:${report}/expected.json`)).toBe('{ "limit": 500 }\n');
    expect(await git(root, 'cat-file', '-t', failedReportRef)).toBe('commit\n');
    const failedRecord = await readFile(runPath(root, plan, failedRun, runLayout.gate(failedFinal!.id)), 'utf8');
    expect(JSON.parse(failedRecord)).toMatchObject({ verdict: 'failed' });
    await evidence('w1-run2', { runId: repairedRun, final: repairedFinal, gates: repairedGates.map(gate => ({ id: gate.id, checkpoint: gate.checkpoint,
      verdict: gate.verdict, audit: gate.audit })), obligations: obligationLines(repairedEvents),
    failedRunStillHolds: { runId: failedRun, gate: failedFinal!.id, report: failedReportRef }, witnessed });
    await reopened.service.close();
    await keep('w1', root);
  }, 1_200_000);
});

const capabilityPlan = 'need';
const consumer = 'capability-coordination/a';
const provider = 'capability-coordination/b';

/** The capability fixture with its committed audit definition, its tests run by the real Vitest and its types by tsc. */
async function capabilityProject(): Promise<string> {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  const root = fixture.root;
  // The provider links the project's dependencies into each audit workspace.
  await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
  // Git sees the link as a file, which `node_modules/` does not ignore; the
  // installed Ramify materializes its views beside the source.
  await writeFile(join(root, '.gitignore'), `${await readFile(join(root, '.gitignore'), 'utf8')}node_modules\n.ramify/\n.ramify-architect/\n`);
  // The fixture's assembly imports what A does not expose, which only a
  // scripted Ramify overlooks; the installed one reports it on every write.
  await writeFile(join(root, 'src/assembly.ts'), 'export const assembly = \'P assembles the result after A and B agree\';\n');
  await writeFile(join(root, 'ramify-audit.json'), auditDefinition([
    commandCheck('tests', [{ name: 'vitest', cmd: 'node_modules/.bin/vitest', args: ['run', 'subs'] }]),
    commandCheck('type-check', [{ name: 'tsc', cmd: 'node_modules/.bin/tsc', args: ['--noEmit', '-p', 'tsconfig.json'] }]),
  ]));
  await initRepository(root);
  return root;
}

describe('F5/F6 capability workflow: delegation, handback and suspended consumer resumption', () => {
  test('a delegated handback reports its own outcome only; the suspended consumer resumes across a restart, and its architect reports the consumer scenario', async () => {
    const root = await capabilityProject();
    const external = await providers(root);
    const witnessed: Record<string, unknown> = {};
    let continuationStarted = false;
    let consumerTurn = 0;
    let capabilityArchitect = 0;
    let localArchitect = 0;
    const script = production(spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('richer-a-fact', consumer)]));
      if (spec.submission.name === 'submit_capability_qualification') {
        const [, request, invocation] = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return submit({ kind: 'delegate-capability', request, invocation, provider,
          placementReason: 'B owns the fact and its interface', constraints: [], requirementRefs: [] });
      }
      if (spec.submission.name === 'submit_work_item_result') {
        localArchitect += 1;
        if (localArchitect === 1) return submit({ ...assign(consumer, { goal: 'Show the fact with its source.', obligations: ['sc-001'] }, outline()) });
        if (localArchitect === 2) {
          // The restart interrupted the resumed consumer; its architect sees
          // the delegated outcome reported and its own scenario still open.
          witnessed['consumer-after-interruption'] = { sc001: stateOf(spec.prompt, 'sc-001') };
          return submit(assign(consumer, { goal: 'Integrate the returned B result.', obligations: ['sc-001'] }));
        }
        // PB3-D10: the delegated outcome was reported done; the consumer's
        // own scenario is bound, its architect's to judge.
        witnessed['consumer-completion-briefing'] = { sc001: stateOf(spec.prompt, 'sc-001') };
        return [...submit(forgotten), ...submit({ ...requestCompletion(), reports: [done(spec.prompt, 'sc-001', 'subs/a/src/tests/caller.test.ts')] })];
      }
      if (spec.role === 'capability-architect') {
        const [, task, revision, invocation] = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        const basis = { task, planRevision: Number(revision), invocation };
        capabilityArchitect += 1;
        if (capabilityArchitect === 1) {
          return submit({ ...basis, kind: 'assign', assignment: assign(provider, {
            goal: 'Let readFact name its source on request', approach: 'Add an optional flag; the default keeps D\'s text',
            completionEvidence: 'B\'s own tests and D\'s unchanged test pass',
          }).assignment });
        }
        const outcome = new RegExp(`^- ${task} \\(delegated outcome\\): (pending|bound|done), revision (\\d+)`, 'mu').exec(spec.prompt);
        if (outcome === null) throw new Error(`The capability briefing lacks ${task}'s obligation line`);
        const handback = (reports: unknown[]) => ({ ...basis, kind: 'request-handback',
          summary: 'readFact(true) returns the fact with its source; readFact() keeps the old text for D',
          interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFact'], use: 'Call readFact(true) for the sourced text' }], limitations: [], reports });
        // PB3-C01 for a handback: the first request forgets its report.
        return [...submit(handback([])), ...submit(handback([{ id: task, judgment: 'done', basedOnRevision: Number(outcome[2]),
          where: 'subs/b/src/tests/fact.test.ts' }]))];
      }
      if (spec.role === 'engineer') {
        const owner = /Your starting module is `([^`]+)`/u.exec(spec.prompt)?.[1];
        if (spec.prompt.includes('# Iteration cap-') && owner === provider) {
          return submit(completionProposed('readFact names its source on request.'),
            write('fact.ts', 'export function readFact(withSource = false): string { return withSource ? \'old from B\' : \'old\'; }\n'),
            write('tests/fact.test.ts', [
              'import { expect, test } from \'vitest\';',
              'import { readFact } from \'../fact.js\';',
              'test(\'B retains its existing fact\', () => expect(readFact()).toBe(\'old\'));',
              'test(\'B names its source on request\', () => expect(readFact(true)).toBe(\'old from B\'));',
              '',
            ].join('\n')));
        }
        consumerTurn += 1;
        if (consumerTurn === 1) {
          return submit({ kind: 'capability-needed', summary: 'A needs the fact with its source', request: {
            need: 'Read the fact together with its source',
            usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Render the sourced fact', prospective: false }],
            constraints: ['D keeps the old text'], knownInterface: { kind: 'none-known' },
            examples: [{ title: 'shows the source', code: 'expect(renderSourced()).toBe(\'Fact: old from B\')', designation: 'pseudocode' }],
          } }, write('tmp/draft.txt', 'scratch kept through the suspension\n'),
          edit('caller.ts', 'export function renderA', '// renderSourced waits for B.\nexport function renderA'));
        }
        if (consumerTurn === 2) {
          // The continuation after the handback, which the restart interrupts.
          continuationStarted = true;
          witnessed['consumer-continued'] = {
            handback: spec.prompt.includes('readFact(true) returns the fact with its source'),
            scratchKept: existsSync(join(root, 'subs/a/src/tmp/draft.txt')),
            suspendedEditKept: readFileSyncText(join(root, 'subs/a/src/caller.ts')).includes('renderSourced waits for B'),
          };
          return [{ kind: 'wait', ms: 120_000 }];
        }
        witnessed['consumer-reassigned'] = {
          scratchGone: !existsSync(join(root, 'subs/a/src/tmp/draft.txt')),
          suspendedEditKept: readFileSyncText(join(root, 'subs/a/src/caller.ts')).includes('renderSourced waits for B'),
        };
        return submit(completionProposed('A renders the sourced fact from B.', { bindings: [{ id: 'sc-001' }] }),
          write('caller.ts', [
            'import { readFact } from \'../../b/src/fact.js\';',
            'export function renderA(value: string): string { return `Fact: ${value}`; }',
            'export function renderSourced(): string { return renderA(readFact(true)); }',
            '',
          ].join('\n')),
          write('tests/caller.test.ts', [
            'import { expect, test } from \'vitest\';',
            'import { renderA, renderSourced } from \'../caller.js\';',
            'test(\'A renders a fact\', () => expect(renderA(\'old\')).toBe(\'Fact: old\'));',
            'test(\'A shows the source\', () => expect(renderSourced()).toBe(\'Fact: old from B\'));',
            '',
          ].join('\n')));
      }
      return undefined;
    });
    const opened = await openRuns(root, { production: true, ...external, script });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun(capabilityPlan));
    const runId = receipt.jobId;
    const handedBack = () => (opened.service.events(capabilityPlan, runId) ?? []).find(event => event.type === 'capability-handed-back');
    await until(() => {
      const events = opened.service.events(capabilityPlan, runId) ?? [];
      const back = handedBack();
      // The consumer's continuation holds the writer and its session has started.
      return events.some(event => event.type === 'job-failed') || (back !== undefined && continuationStarted && events.some(event =>
        event.sequence > back.sequence && event.type === 'writer-acquired'));
    }, 900_000);
    const suspendedSessions = opened.agent!.sessions;
    const beforeRestart = await runEventsOnDisk(root, capabilityPlan, runId);
    expect(beforeRestart.filter(event => event.type === 'job-failed'), JSON.stringify(beforeRestart.slice(-12))).toEqual([]);
    await opened.service.close();

    const reopened = await openRuns(root, { production: true, ...external, script });
    cleanups.push(() => reopened.service.close());
    await reopened.service.settled(capabilityPlan, runId);
    const events = await runEventsOnDisk(root, capabilityPlan, runId);
    const gates = await Promise.all(events.flatMap(event => event.type === 'gate-attempted' ? [event.data.gate] : [])
      .map(async gate => JSON.parse(await readFile(runPath(root, capabilityPlan, runId, runLayout.gate(gate)), 'utf8')) as GateAttempt));
    const final = gates.find(gate => gate.checkpoint === 'final');

    expect(events.at(-1)!.type, JSON.stringify(events.slice(-10))).toBe('job-completed');
    // PB3-R01: the new-policy run resumed its capability coordination.
    expect(reopened.recovery.effects).toContainEqual(expect.stringContaining('resumed capability coordination'));
    const job = JSON.parse(await readFile(runPath(root, capabilityPlan, runId, 'job.json'), 'utf8')) as { policy: { version: string } };
    expect(job.policy.version).toBe('run-policy/7');
    // PB3-C01: the handback without the outcome's report was rejected naming it.
    const capabilitySessions = suspendedSessions.filter(session => session.spec.role === 'capability-architect');
    expect(capabilitySessions.flatMap(session => verdicts(session)).join('\n')).toContain('cap-001');
    // PB3-D08, PB3-D10: the handback followed the architect's done report on
    // its outcome only; the consumer's scenario was its own architect's.
    const outcome = events.find(event => event.type === 'obligation-reported' && event.data.id === 'cap-001');
    const back = events.find(event => event.type === 'capability-handed-back')!;
    expect(outcome!.sequence).toBeLessThan(back.sequence);
    expect(witnessed['consumer-after-interruption']).toEqual({ sc001: 'pending' });
    expect(witnessed['consumer-completion-briefing']).toEqual({ sc001: 'bound' });
    const consumerArchitects = reopened.agent!.sessions.filter(session => session.spec.submission.name === 'submit_work_item_result');
    expect(verdicts(consumerArchitects.at(-1)!)[0]).toContain('leaves sc-001 without a done report');
    expect(obligationLines(events)).toEqual(['reported cap-001 done with where', 'bound sc-001 (no fakes)', 'reported sc-001 done with where']);
    // PB3-C04: recovery closed the interrupted continuation through its
    // failure analysis, and the architect assigned the rest.
    expect(events.flatMap(event => event.type === 'iteration-closed' && event.data.workItem === 'wi-001'
      ? [[event.data.iteration, event.data.outcome]] : [])).toEqual([['cap-001.i01', 'accepted'], ['wi-001.i01', 'partial'], ['wi-001.i02', 'accepted']]);
    // PB3-S08: the consumer's scratch and suspended edit lived through the
    // suspension, the provider's closed iteration and the restart; the
    // scratch went when the consumer's own iteration closed, the edit stayed.
    expect(witnessed['consumer-continued']).toEqual({ handback: true, scratchKept: true, suspendedEditKept: true });
    expect(witnessed['consumer-reassigned']).toEqual({ scratchGone: true, suspendedEditKept: true });
    // PB3-R03, PB3-R04: the full nested final gate passed on the integrated commit.
    expect(final?.verdict).toBe('passed');
    expect(final!.audit).toMatchObject({ mode: 'full', nested: true, verdict: 'pass' });
    expect(final!.audit!.projects!.map(project => project.projectRoot)).toEqual(['.']);
    expect(await git(root, 'show', `${final!.audited}:subs/a/src/caller.ts`)).toContain('readFact(true)');
    await evidence('w2-capability', { runId, final, gates: gates.map(gate => ({ id: gate.id, checkpoint: gate.checkpoint, verdict: gate.verdict,
      audit: gate.audit })), obligations: obligationLines(events), recovery: reopened.recovery, witnessed });
    await reopened.service.close();
    await keep('w2', root);
  }, 1_500_000);
});

describe('F5 standalone work: the same scope, hooks and diagnosis, with no commit', () => {
  test('a standalone session through the command entry diagnoses its tree in place and commits nothing', async () => {
    const root = await capabilityProject();
    await writeFile(join(root, 'subs/b/module.ramify'), 'ramify 1\nmodule b\nexpose-src readFact from "fact.ts" to parent\nowned-nested-project "report"\n');
    await mkdir(join(root, 'subs/b/report'), { recursive: true });
    await writeFile(join(root, 'subs/b/report/ramify-audit.json'), auditDefinition([commandCheck('report', [{ name: 'report', cmd: 'node', args: ['-e', '0'] }])],
      { packageDirectories: [] }));
    await writeFile(join(root, 'subs/b/report/limit.json'), '{ "limit": 400 }\n');
    await git(root, 'add', '--all');
    await git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '--message', 'B owns a nested report project');
    const head = (await git(root, 'rev-parse', 'HEAD')).trim();
    const refsBefore = await git(root, 'for-each-ref', '--format=%(refname)');
    const scriptDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-plan21-session-'));
    cleanups.push(() => rm(scriptDirectory, { recursive: true, force: true }));
    const scriptFile = join(scriptDirectory, 'script.json');
    await writeFile(scriptFile, JSON.stringify([
      write('fact.ts', 'export function readFact(withSource = false): string { return withSource ? \'old from B\' : \'old\'; }\n'),
      write('tmp/notes.txt', 'standalone scratch\n'),
      // The nested project is not part of a standalone session's scope.
      write('../report/limit.json', '{ "limit": 500 }\n'),
      write('../docs/source.md', 'B names its source on request.\n'),
      { kind: 'submit', input: completionProposed('readFact names its source on request.') },
    ]));
    const progress: SessionProgress[] = [];
    const result = await runSessionCommand({ projectRoot: root, module: provider, prompt: 'Let readFact name its source on request.',
      agent: { name: 'fake', script: scriptFile }, gate: true, onProgress: event => progress.push(event) });
    if (result.status !== 'finished') throw new Error(`The session did not finish: ${JSON.stringify(result)}`);
    const summary = result.summary;

    expect(summary.submission?.kind).toBe('completion-proposed');
    // PB3-R02: the write scope is the ordinary one: B's own tree and its
    // documentation, never its nested project, which no inclusion names.
    const refused = progress.filter((event): event is Extract<SessionProgress, { type: 'tool-error' }> => event.type === 'tool-error');
    expect(refused.map(event => event.tool)).toEqual(['write']);
    expect(refused[0]!.text).toContain('subs/b/report');
    expect(await readFile(join(root, 'subs/b/report/limit.json'), 'utf8')).toBe('{ "limit": 400 }\n');
    expect([...summary.changed].sort()).toEqual(expect.arrayContaining(['subs/b/docs/source.md', 'subs/b/src/fact.ts']));
    expect(summary.outsideScope).toEqual([]);
    // The installed Ramify's hook checked the source and named the scratch not analyzed.
    const transcript = await readFile(join(summary.records, 'transcript.jsonl'), 'utf8');
    expect(transcript).toMatch(/"path":"subs\/b\/src\/fact\.ts","disposition":"checked"/u);
    expect(transcript).toMatch(/"path":"subs\/b\/src\/tmp\/notes\.txt","disposition":"not-analyzed","reason":"scratch"/u);
    // The diagnosis ran in place over the current bytes and passed; it made
    // no commit, published no audit record and left the work uncommitted.
    expect(summary.gate).toMatchObject({ ran: true, verdict: 'passed' });
    const commands = summary.gate!.ran ? summary.gate!.commands : [];
    expect(commands.map(command => command.split(':')[0])).toEqual(['type-check', 'ramify-check']);
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(await git(root, 'for-each-ref', '--format=%(refname)')).toBe(refsBefore);
    expect(await git(root, 'status', '--porcelain', '--', 'subs/b/src/fact.ts')).toContain('fact.ts');
    await evidence('w3-standalone', { head, refsUnchanged: true, session: summary.session, gate: summary.gate, changed: summary.changed,
      refused: refused.map(event => event.text) });
    await keep('w3', root);
  }, 600_000);
});
