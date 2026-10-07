import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import type { GateAttempt } from '../checks/records.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { workLayout, type WorkItemOutline } from '../work/records.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { assign, byRole, completionProposed, outline, runScopeTests, submit, viewedInputs, write } from './helpers/iterations.js';
import { git, onlyRun, openRuns, realRamify, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { badgeAnalysis, badgeImplementation, badgeStepFile, badgeSteps } from './helpers/badge-scenarios.js';
import { gitService as productionGit } from '../../subs/evidence/src/git.js';

/*
 * The fixture trials: implementation runs on a disposable copy of the
 * `collection-review` fixture with its own toolchain installed. Readiness,
 * every gate and the final gate run the fixture's real `npm test`, its real
 * `npm run type-check` and a complete `ramify check --batch`; the architect
 * view is materialized and refreshed by the installed Ramify through a
 * private daemon, stopped before the copy is removed. The agent is the
 * scripted fake, which writes each stage's source through the implementation's
 * own `write` tool behind the write guard. There is no pi and no model.
 *
 * They are trials, not part of the default suite: preparing a copy runs
 * `npm ci`, which needs the registry or npm's cache. Run them with
 *
 *   RAMIFY_AGENT_TRIAL=status-badge-tone,reviewer-identity \
 *   RAMIFY_AGENT_TRIAL_OUT=<directory to retain the evidence in> \
 *   node_modules/.bin/vitest run subs/harness/src/tests/fixture-trials.test.ts
 *
 * With `RAMIFY_AGENT_TRIAL_KEEP=1` the copies are kept as well.
 *
 * Each copy is prepared by `scripts/live-trial.ts prepare`, and what the run
 * changed is checked by `scripts/live-trial.ts verify`, the same two commands
 * a person runs around a real pi trial.
 */

const exec = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const planDirectory = join(packageRoot, 'docs', 'plans', '03-autonomous-implementation-loop');
const tsx = join(packageRoot, 'node_modules', '.bin', 'tsx');
const selected = (process.env.RAMIFY_AGENT_TRIAL ?? '').split(',').map(name => name.trim()).filter(Boolean);
const out = process.env.RAMIFY_AGENT_TRIAL_OUT;
const keep = process.env.RAMIFY_AGENT_TRIAL_KEEP === '1';

const root = 'collection-review';
const workspace = `${root}/workspace`;
const contracts = `${workspace}/contracts`;
const sharedUi = `${workspace}/shared-ui`;
const reviews = `${workspace}/reviews`;
const core = `${reviews}/core`;
const ui = `${reviews}/ui`;
const pureUi = `${ui}/pure-ui`;
const integrationTests = `${root}/integration-tests`;

/** The environment a child gets: this one's, without the Node flags vitest runs under. */
function childEnvironment(): NodeJS.ProcessEnv {
  const { NODE_OPTIONS: _options, ...rest } = process.env;
  return rest;
}

/** The source each stage writes, recorded beside the trial. */
async function stages(plan: string): Promise<Array<Record<string, string>>> {
  const recorded = JSON.parse(await readFile(join(planDirectory, 'trial', plan, 'stages.json'), 'utf8')) as { stages: Array<{ files: Record<string, string> }> };
  return recorded.stages.map(stage => stage.files);
}

/** A stage's source, written file by file through the guarded `write` tool. */
function writes(files: Record<string, string>) {
  return Object.entries(files).map(([path, content]) => write(path, content));
}

interface TrialResult {
  readonly project: string;
  readonly runId: string;
  readonly events: RunEvent[];
  readonly snapshot: ReturnType<typeof onlyRun>;
  readonly verification: { exitCode: number; report: { counts: unknown; inScope: string[]; recordedOutside: string[]; defects: string[] } };
  readonly gate: (id: string) => Promise<GateAttempt>;
  readonly assignment: (number: number) => Promise<IterationAssignment>;
  readonly result: (number: number) => Promise<IterationResult>;
  readonly outline: (revision: number) => Promise<WorkItemOutline>;
}

/**
 * Prepares a copy, runs one plan on it with the scripted fake over the real
 * toolchain, verifies what it changed, retains the evidence and removes the
 * copy.
 */
async function trial(plan: string, script: Parameters<typeof byRole>[0], check: (result: TrialResult) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'ramify-agent-fixture-trial-'));
  try {
    const prepared = await exec(tsx, ['scripts/live-trial.ts', 'prepare', '--plan', plan, '--into', parent], {
      cwd: packageRoot, env: childEnvironment(), maxBuffer: 16 * 1024 * 1024,
    });
    const project = /^Trial copy: (.+)$/m.exec(prepared.stdout)?.[1];
    expect(project, prepared.stdout).toBeDefined();

    // The run, in this process, with a private daemon disposed before the
    // copy is verified or removed.
    const daemon = await realRamify();
    let runId: string;
    try {
      const opened = await openRuns(project!, {
        git: productionGit,
        script: byRole(script),
        ramify: daemon.ramify,
        inputs: viewedInputs(daemon.ramify),
        // The hardcoded default: the project's own npm test, type check and
        // a complete Ramify check.
        policy: undefined,
        stopGraceMs: 30_000,
      });
      try {
        const receipt = await opened.service.execute(startRun(plan));
        runId = receipt.jobId;
        await opened.service.settled(plan, runId);
      } finally {
        await opened.service.close();
      }
    } finally {
      await daemon.dispose();
    }

    const verified = await exec(tsx, ['scripts/live-trial.ts', 'verify', project!, '--run', runId, '--json', join(parent, 'verification.json')], {
      cwd: packageRoot, env: childEnvironment(), maxBuffer: 16 * 1024 * 1024,
    }).then(result => ({ exitCode: 0, stdout: result.stdout }), (error: { code?: number; stdout?: string }) => ({ exitCode: error.code ?? 2, stdout: error.stdout ?? '' }));
    const report = JSON.parse(await readFile(join(parent, 'verification.json'), 'utf8')) as TrialResult['verification']['report'];

    const events = await runEventsOnDisk(project!, plan, runId);
    const reopened = await openRuns(project!, { git: productionGit });
    const snapshot = onlyRun(reopened.service, plan);
    await reopened.service.close();

    if (out !== undefined) await retain(join(out, plan), project!, plan, runId, verified.stdout, report);

    const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(runPath(project!, plan, runId, path), 'utf8')) as T;
    await check({
      project: project!,
      runId,
      events,
      snapshot,
      verification: { exitCode: verified.exitCode, report },
      gate: id => read<GateAttempt>(runLayout.gate(id)),
      assignment: number => read<IterationAssignment>(iterationLayout.assignment('wi-001', number)),
      result: number => read<IterationResult>(iterationLayout.result('wi-001', number)),
      outline: revision => read<WorkItemOutline>(workLayout.outline('wi-001', revision)),
    });
  } finally {
    if (!keep) await rm(parent, { recursive: true, force: true });
  }
}

/**
 * The trial's evidence, beside the plan: the run directory as the harness
 * left it, the verification, the run branch's log, and a summary of what
 * each gate ran.
 */
async function retain(directory: string, project: string, plan: string, runId: string, verification: string, report: unknown): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await cp(runPath(project, plan, runId), join(directory, 'run'), { recursive: true });
  await writeFile(join(directory, 'verification.txt'), verification);
  await writeFile(join(directory, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, 'branch.txt'), await git(project, 'log', '--format=%H %s%n%b', `ramify-agent-run/${runId}`));
  const gates = [];
  for (const id of (await readdir(runPath(project, plan, runId, 'gates'))).sort()) {
    const attempt = JSON.parse(await readFile(runPath(project, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
    gates.push({
      id,
      checkpoint: attempt.checkpoint,
      subject: attempt.subject,
      verdict: attempt.verdict,
      cause: attempt.cause,
      commit: attempt.commit,
      commands: attempt.commands.map(command => ({
        kind: command.kind,
        argv: command.command.argv.map(part => (part.startsWith(project) ? `<project>${part.slice(project.length)}` : part)),
        outcome: command.outcome,
        exitCode: command.exitCode,
        elapsedMs: command.elapsedMs,
        selection: command.selection?.resolved ?? null,
      })),
    });
  }
  await writeFile(join(directory, 'gates.json'), `${JSON.stringify(gates, null, 2)}\n`);
}

/** The every-command-passed shape of a gate over the real toolchain. */
function expectRealGatePassed(attempt: GateAttempt, checkpoint: GateAttempt['checkpoint']): void {
  expect(attempt.checkpoint).toBe(checkpoint);
  expect(attempt.verdict).toBe('passed');
  expect(attempt.cause).toBeNull();
  expect(attempt.commands.every(command => command.outcome === 'passed')).toBe(true);
  const argv = attempt.commands.map(command => command.command.argv.join(' '));
  // The project's own suite and type check through npm, and a complete Ramify check.
  expect(argv.some(line => /\bnpm\b.*\btest\b/.test(line))).toBe(true);
  expect(argv.some(line => /\bnpm\b.*\btype-check\b/.test(line))).toBe(true);
  expect(argv.some(line => /ramify check --batch --root /.test(line))).toBe(true);
}

describe.runIf(selected.includes('status-badge-tone'))('the status-badge-tone trial on the real fixture toolchain', () => {
  test('one work item, one iteration: the outline records single-iteration and one accepted iteration completes it', async () => {
    // Plan 3's recorded stage, with the tone type exposed beside the props.
    const stage = await badgeImplementation();
    await trial('status-badge-tone', {
      // The plan's two scenarios, assigned to its one entry and bound by a
      // step file in the badge's own test area.
      'initial-architect': [submit(await badgeAnalysis())],
      'local-architect': [
        submit(assign(sharedUi, { goal: 'Give the status badge a tone, with tests of its own.', obligations: ['sc-001', 'sc-002'] }, outline({
          changes: 'The badge takes an optional tone and carries it as data-tone; it reads as neutral without one.',
          decomposition: { kind: 'single-iteration', rationale: 'One component and its tests; nothing else changes and nothing depends on the change.' },
        }))),
        submit(requestCompletion({ changes: 'The tone is there and its tests pass.', revisionReason: 'The one iteration is accepted.' })),
      ],
      engineer: [submit(
        completionProposed('The badge carries its tone, neutral by default, with its own tests; both scenarios bind to its step file.', { bindings: [{ id: 'sc-001' }, { id: 'sc-002' }] }),
        ...writes(stage), write(badgeSteps, badgeStepFile), runScopeTests(),
      )],
    }, async result => {
      expect(result.snapshot.state).toBe('completed');
      const types = result.events.map(event => event.type);
      expect(types.filter(type => type === 'iteration-assigned')).toHaveLength(1);
      expect((await result.outline(1)).decomposition.kind).toBe('single-iteration');
      expect((await result.result(1)).outcome).toBe('accepted');
      expect(types.filter(type => type === 'work-item-completed')).toHaveLength(1);
      expect(types.filter(type => type === 'obligation-bound')).toHaveLength(2);
      expect(result.events.filter(event => event.type === 'obligation-reported' && (event.data as { judgment: string }).judgment === 'done')).toHaveLength(2);
      const readiness = result.events.find(event => event.type === 'readiness-passed')!.data as { gate: string };
      expectRealGatePassed(await result.gate(readiness.gate), 'readiness');
      const final = result.events.find(event => event.type === 'job-completed')!.data as { gate: string };
      expectRealGatePassed(await result.gate(final.gate), 'final');
      expect(result.verification.exitCode).toBe(0);
      expect(result.verification.report.defects).toEqual([]);
    });
  }, 1_800_000);
});

describe.runIf(selected.includes('reviewer-identity'))('T3: reviewer-identity on the real fixture toolchain', () => {
  test('the break is staged, and every accepted boundary passes the whole project\'s real suite, type check and Ramify check', async () => {
    const [prepare, surfaces, views] = await stages('reviewer-identity');
    await trial('reviewer-identity', {
      'initial-architect': [submit(analysis([entry('reviewer-identity', reviews)]))],
      'local-architect': [
        submit(assign(contracts, { goal: 'Add the structured reviewer to the shared vocabulary, where both sides can name it.' }, outline({
          changes: 'A review outcome carries a structured reviewer; both surfaces take it and report it; the views show it.',
          decomposition: { kind: 'staged', rationale: 'The outcome has four kinds of reader, and each boundary must compile and pass.' },
          breakingChanges: [
            {
              guarantee: 'reviews.run is called with a record id and an optional scope, and answers an outcome with no reviewer',
              reason: 'The request requires every review to be attributed to a structured reviewer, supplied by the caller.',
              affectedConsumers: [reviews, ui, workspace, root, integrationTests],
              citations: [],
            },
            {
              guarantee: 'ReviewResultProps carries no reviewer',
              reason: 'The review panel must show the reviewer\'s display name and role.',
              affectedConsumers: [ui],
              citations: [],
            },
          ],
          stages: [
            { title: 'The reviewer in the shared vocabulary', approach: 'non-breaking', dependsOn: [], note: 'Nothing reads it yet.' },
            { title: 'The outcome and both surfaces carry the reviewer', approach: 'breaking', dependsOn: [0], note: 'Every caller of reviews.run moves in the same step.' },
            { title: 'The views show the reviewer', approach: 'breaking', dependsOn: [1], note: 'The pure view\'s props and the panel that fills them move together.' },
          ],
        }))),
        submit(assign(reviews, {
          kind: 'breaking',
          stage: 1,
          goal: 'Make the review outcome carry the structured reviewer, required, through the runtime, both surfaces and every caller.',
          scope: {
            base: {
              modules: [core, reviews, ui, workspace, root, integrationTests],
              rationale: 'The runtime\'s signature and the tRPC input change together, and every caller of either must move in the same boundary or the project stops compiling.',
            },
            extra: [],
            read: [contracts],
            rationale: 'The break and every adaptation it forces are one accepted boundary.',
          },
        })),
        submit(assign(ui, {
          kind: 'breaking',
          stage: 2,
          goal: 'Show the reviewer\'s display name and role above the verdict.',
          scope: {
            base: { modules: [ui, pureUi], rationale: 'The pure view\'s props gain a required reviewer, and the panel that fills them must supply it in the same step.' },
            extra: [],
            read: [],
            rationale: 'The view and its one filler move together.',
          },
        })),
        submit(requestCompletion({ changes: 'Every stage is accepted; the reviewer is carried and shown.', revisionReason: 'The last stage is accepted.' })),
      ],
      engineer: [
        submit(completionProposed('The shared vocabulary has the structured reviewer.'), ...writes(prepare!), runScopeTests()),
        submit(completionProposed('The outcome requires the reviewer, and the runtime, both surfaces and every caller carry it.'), ...writes(surfaces!), runScopeTests()),
        submit(completionProposed('The review panel shows the reviewer\'s name and role above the verdict.'), ...writes(views!), runScopeTests()),
      ],
    }, async result => {
      expect(result.snapshot.failure).toBeNull();
      expect(result.snapshot.state).toBe('completed');

      const staged = await result.outline(1);
      expect(staged.decomposition.kind).toBe('staged');
      expect(staged.stages.map(stage => stage.approach)).toEqual(['non-breaking', 'breaking', 'breaking']);
      expect(staged.breakingChanges).toHaveLength(2);

      // Three accepted iterations: the compatible preparation, then two
      // breaking ones, each closed by a gate over the real toolchain. Every
      // breaking boundary is the whole project.
      const kinds: string[] = [];
      for (const number of [1, 2, 3]) {
        const assignment = await result.assignment(number);
        const closed = await result.result(number);
        kinds.push(assignment.kind);
        expect([number, closed.outcome]).toEqual([number, 'accepted']);
        const attempt = await result.gate(closed.gate!);
        if (assignment.kind === 'breaking') {
          expectRealGatePassed(attempt, 'breaking-iteration');
          expect(assignment.gate.tests.policy).toBe('all-project');
        } else {
          expect(attempt.checkpoint).toBe('iteration');
          expect(attempt.verdict).toBe('passed');
        }
      }
      expect(kinds).toEqual(['ordinary', 'breaking', 'breaking']);
      const readiness = result.events.find(event => event.type === 'readiness-passed')!.data as { gate: string };
      expectRealGatePassed(await result.gate(readiness.gate), 'readiness');
      const final = result.events.find(event => event.type === 'job-completed')!.data as { gate: string };
      expectRealGatePassed(await result.gate(final.gate), 'final');

      // The run changed the project only inside its recorded write scopes.
      expect(result.verification.exitCode).toBe(0);
      expect(result.verification.report.defects).toEqual([]);

      // The old representation is gone: no caller of reviews.run omits the
      // reviewer. Every call site names one, or is a call the project itself
      // asserts is refused: a `@ts-expect-error` directly above it, or a
      // `.rejects` expectation around it (iteration 12 part 2 corrected this
      // check, whose substring also matched `{ recordId, reviewer }`).
      // A call's argument may span the three lines after it.
      const { stdout } = await exec('git', ['-C', result.project, 'grep', '-n', '-B2', '-A3', 'reviews.run.mutate('], { env: childEnvironment() });
      const omitting: string[] = [];
      const lines = stdout.split('\n');
      lines.forEach((line, index) => {
        const call = /^(.+?):(\d+):(.*)$/.exec(line);
        if (call === null || !call[3]!.includes('reviews.run.mutate(')) return;
        const before = lines.slice(Math.max(0, index - 2), index).join('\n');
        const argument = [call[3]!, ...lines.slice(index + 1, index + 4)].join('\n').split('\n--')[0]!;
        const refused = argument.includes('.rejects') || before.includes('@ts-expect-error');
        if (!argument.includes('reviewer') && !refused) omitting.push(line);
      });
      expect(stdout).toContain('reviews.run.mutate(');
      expect(omitting).toEqual([]);
    });
  }, 3_600_000);
});
