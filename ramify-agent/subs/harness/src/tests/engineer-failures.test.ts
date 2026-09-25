import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import type { AgentSession, SessionOutcome, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { commandResult } from './helpers/command-result.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import {
  assign, byRole, failureAnalystFake, outline, partialReport, shell, submit, treeInputs, type Turn,
} from './helpers/iterations.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { assertUnchangedGit, openUnchangedRuns as openRuns } from './helpers/unchanged-run.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout, type RunPolicy } from '../run/records.js';
import { engineerBoundsOf } from '../run/policy.js';
import { InvocationBounds } from '../run/port-events.js';
import { validateLocalArchitect, type LocalArchitectSubmission } from '../work/submission.js';
import { createShellTool, shellToolName } from '../tools/shell.js';

/*
 * An engineer that ends without a result is its local architect's decision,
 * not the run's end, and the architect decides on a pre-analysis: the
 * harness's digest of what the engineer left, and a failure analysis a
 * model makes in a reader session of its own. Where a bound ended it, the
 * architect may raise that bound for the next iteration, up to the policy's
 * ceiling.
 *
 * Every run here is composed on the scripted fake: agents are scripts, Git
 * is scripted and a shell command is answered in this process, so no run
 * starts a process.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const reviews = 'collection-review/workspace/reviews';
const checkpoints = [scenariosCommit(plan), 'wi-001', `final verification of plan "${plan}"`];

/** What each shell command asked for, as the scripted runner received it. */
interface AskedCommand {
  readonly command: string;
  readonly timeoutMs: number;
}

/**
 * Answers every shell command in this process. `npm run test:slow` prints
 * the start of a long suite and runs until it is cancelled; any other
 * command passes at once. Nothing else is a command this run may start.
 */
function scriptedShell(asked: AskedCommand[]): CommandRunner {
  return async request => {
    if (request.argv[0] !== 'bash') throw new Error(`No process is started here: ${request.argv.join(' ')}`);
    const command = request.argv[2] ?? '';
    asked.push({ command, timeoutMs: request.timeoutMs });
    if (command !== 'npm run test:slow') return commandResult(request, { stdout: 'all suites passed\n' });
    const printed = Array.from({ length: 40 }, (_, index) => `suite ${index + 1} of 400 passed`).join('\n');
    if (request.outputFile !== undefined) {
      await mkdir(dirname(request.outputFile), { recursive: true });
      await writeFile(request.outputFile, `${printed}\n`);
    }
    await new Promise<void>(resolve => {
      if (request.signal?.aborted === true) resolve();
      request.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    return commandResult(request, { stdout: `${printed}\n`, outcome: { kind: 'cancelled' } });
  };
}

/** A run of the fixture's plan with one entry in `reviews`, driven by `turns`, whose sessions are kept. */
async function run(turns: Readonly<Record<string, readonly Turn[]>>, limits: Partial<RunPolicy['limits']> = {}, asked: AskedCommand[] = []) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const specs: SessionSpec[] = [];
  const scripted = byRole(turns) as (spec: SessionSpec) => ReturnType<Extract<Script, (spec: SessionSpec) => unknown>>;
  const opened = await openRuns(fixture.root, {
    script: spec => {
      specs.push(spec);
      return scripted(spec);
    },
    unchangedCheckpoints: checkpoints,
    inputs: treeInputs(),
    commandExecution: scriptedShell(asked),
    policy: projectRoot => {
      const policy = testPolicy(projectRoot);
      return { ...policy, limits: { ...policy.limits, ...limits } };
    },
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  const role = (name: string) => specs.filter(spec => spec.role === name);
  return { root: fixture.root, runId: receipt.jobId, service: opened.service, specs, role };
}

async function iterationResult(root: string, runId: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.result('wi-001', number)), 'utf8')) as IterationResult;
}

describe('an engineer ended by a bound in the middle of a command', () => {
  test('is digested and analyzed before its architect is briefed, which raises the bound, and the next engineer\'s shell takes the larger timeout', async () => {
    const asked: AskedCommand[] = [];
    const raised = {
      commandTimeoutMs: { ms: 1_200_000, reason: 'The whole suite runs for about fifteen minutes.' },
      absoluteMs: { ms: 3_600_000, reason: 'The suite has to finish inside one invocation.' },
    };
    const { root, runId, service, role } = await run({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [
        submit(assign(reviews, {}, outline())),
        submit(assign(reviews, { bounds: raised })),
        submit(requestCompletion()),
      ],
      engineer: [
        // The suite outlasts the invocation's absolute bound, which fires
        // while the command still holds the idle bound.
        [{ kind: 'message', text: 'The change is in; running the whole suite to confirm it.' }, shell('npm run test:slow', { timeoutMs: 600_000 })],
        submit(partialReport(['the suite passed'], ['nothing']), shell('npm run test:slow:rerun', { timeoutMs: 1_000_000 })),
      ],
      'failure-analyst': [failureAnalystFake('bound-too-tight', {
        recommendation: 'Raise the absolute bound and the command maximum so the suite can finish.',
      })],
    }, { invocationAbsoluteMs: 1_500 }, asked);

    expect(onlyRun(service, plan).state).toBe('completed');
    const events = await runEventsOnDisk(root, plan, runId);
    expect(events.some(event => event.type === 'job-failed')).toBe(false);
    expect(events.filter(event => event.type === 'iteration-closed').map(event => (event.data as { outcome: string }).outcome))
      .toEqual(['partial', 'partial']);

    // The first engineer ended failed, by its absolute bound.
    const started = events.filter(event => event.type === 'invocation-started').map(event => event.data as { invocation: string; role: string });
    const [first, second] = started.filter(entry => entry.role === 'engineer');
    const outcome = JSON.parse(await readFile(runPath(root, plan, runId, runLayout.outcome(first!.invocation)), 'utf8')) as { ended: string; interruption: string };
    expect(outcome).toMatchObject({ ended: 'failed', interruption: 'absolute-timeout' });

    // The digest: why, what was in flight with the end of its output, and what it said last.
    const result = await iterationResult(root, runId, 1);
    expect(result.outcome).toBe('partial');
    const digest = result.failure!.digest;
    expect(digest).toMatchObject({
      invocation: first!.invocation,
      role: 'engineer',
      ended: 'failed',
      interruption: 'absolute-timeout',
      cause: 'The absolute bound fired: the invocation ran for 1500 ms.',
      bounds: { commandTimeoutMs: 600_000, idleMs: engineerBoundsOf(testPolicy(root).limits).defaults.idleMs, absoluteMs: 1_500 },
      lastMessage: 'The change is in; running the whole suite to confirm it.',
      transcript: expect.stringMatching(/^transcripts\/ses-\d+\.jsonl$/) as unknown,
    });
    expect(digest.inFlight).toHaveLength(1);
    expect(digest.inFlight[0]).toMatchObject({ tool: shellToolName, command: { text: 'npm run test:slow', timeoutMs: 600_000 } });
    expect(digest.inFlight[0]!.runningMs).toBeGreaterThan(0);
    expect(digest.inFlight[0]!.command!.tail).toHaveLength(30);
    expect(digest.inFlight[0]!.command!.tail.at(-1)).toBe('suite 40 of 400 passed');
    expect(digest.outputs).toEqual([digest.inFlight[0]!.command!.output]);

    // The analysis ran in a reader session of its own, over the evidence the harness wrote.
    expect(result.failure!.analysis).toMatchObject({ outcome: 'analyzed', cause: 'bound-too-tight' });
    const [analyst] = role('failure-analyst');
    expect(analyst!.builtinTools).toEqual(['read', 'grep', 'ls']);
    expect(analyst!.tools).toEqual([]);
    const workspace = analyst!.scope.workingDirectory;
    expect(workspace).toBe(join(runPath(root, plan, runId, dirname(iterationLayout.result('wi-001', 1))), 'failure-evidence'));
    expect(await readFile(join(workspace, 'digest.md'), 'utf8')).toContain('The absolute bound fired');
    expect(await readFile(join(workspace, 'transcript.md'), 'utf8')).toContain('npm run test:slow');
    expect(existsSync(join(workspace, 'outputs'))).toBe(true);
    // Git cannot say in this scenario, and the analyst is told so rather than given nothing.
    expect(analyst!.prompt).toContain('the patch of the uncommitted work, which Git could not give');
    expect(analyst!.prompt).toContain('In flight when it ended: `shell` running `npm run test:slow`');

    // The architect's next turn reads the digest, then the analysis, then its options.
    const briefing = role('local-architect')[1]!.prompt;
    expect(briefing).toContain('### Its engineer ended without a result');
    expect(briefing).toContain('- Why it ended: The absolute bound fired: the invocation ran for 1500 ms.');
    expect(briefing).toContain('  suite 40 of 400 passed');
    expect(briefing).toContain('- What it said last: “The change is in; running the whole suite to confirm it.”');
    expect(briefing).toContain('### The failure analysis');
    expect(briefing).toContain('(`bound-too-tight`)');
    expect(briefing).toContain('- Recommendation: Raise the absolute bound and the command maximum so the suite can finish.');
    expect(briefing).toContain('The absolute bound of an invocation ended it, at 1500 ms. If the work needs more, raise `assignment.bounds.absoluteMs` in the next assignment, up to 10800000 ms');
    expect(briefing.indexOf('### The failure analysis')).toBeGreaterThan(briefing.indexOf('- Why it ended:'));
    expect(briefing).toContain('## The bounds of an engineer');

    // The raised bounds are the assignment's, and every engineer invocation of it runs under them.
    const assignment = JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.assignment('wi-001', 2)), 'utf8')) as IterationAssignment;
    expect(assignment.bounds).toEqual(raised);
    const [, next] = role('engineer');
    const tool = next!.tools.find(candidate => candidate.name === shellToolName)!;
    expect((tool.inputSchema as { properties: { timeoutMs: { maximum: number } } }).properties.timeoutMs.maximum).toBe(1_200_000);
    expect(next!.systemPrompt).toContain('at most 1200000 ms');
    expect(role('engineer')[0]!.systemPrompt).toContain('at most 600000 ms');
    // The larger timeout was accepted, and the command ran with it.
    expect(asked).toEqual([
      { command: 'npm run test:slow', timeoutMs: 600_000 },
      { command: 'npm run test:slow:rerun', timeoutMs: 1_000_000 },
    ]);
    const nextOutcome = JSON.parse(await readFile(runPath(root, plan, runId, runLayout.outcome(second!.invocation)), 'utf8')) as { ended: string; interruption?: string };
    expect(nextOutcome).toMatchObject({ ended: 'submitted' });
    expect(nextOutcome.interruption).toBeUndefined();

    // The analyst is a reader: it is in no commit's list of the invocations that wrote.
    const sessions = events.filter(event => event.type === 'session-opened').map(event => (event.data as { role: string }).role);
    expect(sessions).toContain('failure-analyst');
  }, 120_000);
});

describe('a failure analysis that fails', () => {
  test('leaves the digest alone, says the analysis was unavailable, and never fails the run', async () => {
    const { root, runId, service, role } = await run({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(assign(reviews, {}, outline())), submit(requestCompletion())],
      engineer: [[{ kind: 'fail', error: 'the provider refused the request' }]],
      'failure-analyst': [[{ kind: 'fail', error: 'the analyst\'s provider refused the request too' }]],
    });

    expect(onlyRun(service, plan).state).toBe('completed');
    const result = await iterationResult(root, runId, 1);
    expect(result.failure!.digest).toMatchObject({ ended: 'failed', interruption: null, cause: 'The session failed: the provider refused the request', inFlight: [] });
    expect(result.failure!.analysis).toMatchObject({ outcome: 'unavailable', reason: 'the analysis ended `failed` (the analyst\'s provider refused the request too)' });

    const briefing = role('local-architect')[1]!.prompt;
    expect(briefing).toContain('- Why it ended: The session failed: the provider refused the request');
    expect(briefing).toContain('The failure analysis is unavailable');
    expect(briefing).toContain('Decide on the digest above.');
    expect(briefing).not.toContain('If the work needs more, raise');
  }, 120_000);

  test('that ends without a submission is unavailable too', async () => {
    const { root, runId, service } = await run({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [submit(assign(reviews, {}, outline())), submit(requestCompletion())],
      engineer: [[{ kind: 'end', message: 'I have nothing more to add.' }]],
      'failure-analyst': [[{ kind: 'end', message: 'No account.' }]],
    });
    expect(onlyRun(service, plan).state).toBe('completed');
    const result = await iterationResult(root, runId, 1);
    expect(result.failure!.digest).toMatchObject({ ended: 'ended', cause: 'The session stopped on its own without an accepted submission.' });
    expect(result.failure!.analysis).toMatchObject({ outcome: 'unavailable', reason: 'the analysis ended `ended`' });
  }, 120_000);
});

describe('every cause an analyst judges', () => {
  test('reaches the iteration\'s result and the next briefing', async () => {
    const { root, runId, service, role } = await run({
      'initial-architect': [submit(analysis([entry('reviewer-note', reviews)]))],
      'local-architect': [
        submit(assign(reviews, {}, outline())),
        submit(assign(reviews)),
        submit(assign(reviews)),
        submit(assign(reviews)),
        submit(requestCompletion()),
      ],
      engineer: [[{ kind: 'fail', error: 'the provider refused the request' }]],
      'failure-analyst': [
        failureAnalystFake('environment-problem'),
        failureAnalystFake('work-problem'),
        failureAnalystFake('agent-behavior'),
        failureAnalystFake('unknown'),
      ],
    });
    expect(onlyRun(service, plan).state).toBe('completed');
    const causes = [];
    for (const number of [1, 2, 3, 4]) {
      const analysisOf = (await iterationResult(root, runId, number)).failure!.analysis;
      causes.push(analysisOf.outcome === 'analyzed' ? analysisOf.cause : null);
    }
    expect(causes).toEqual(['environment-problem', 'work-problem', 'agent-behavior', 'unknown']);
    expect(role('local-architect')[4]!.prompt).toContain('(`unknown`)');
  }, 120_000);
});

describe('the bounds an assignment raises', () => {
  const policy = engineerBoundsOf(testPolicy('/project').limits);

  /** An `assign` submission with `bounds`, judged as the architect's turn judges it. */
  function judged(bounds: unknown) {
    const submission = assign(reviews, { bounds: bounds as never }, outline()) as LocalArchitectSubmission;
    return validateLocalArchitect(submission, { index: null, registry: new Map(), bounds: policy });
  }

  function errors(bounds: unknown) {
    const verdict = judged(bounds);
    return verdict.ok ? [] : verdict.errors;
  }

  test('the policy\'s defaults and ceilings are the ones the plan fixed', () => {
    expect(policy.ceilings).toEqual({ commandTimeoutMs: 1_800_000, idleMs: 1_800_000, absoluteMs: 10_800_000 });
    expect(policy.defaults.commandTimeoutMs).toBe(600_000);
  });

  test('raised within the ceilings, with their reasons, they are accepted', () => {
    expect(judged({
      commandTimeoutMs: { ms: 1_800_000, reason: 'The suite runs for twenty minutes.' },
      idleMs: { ms: 1_800_000, reason: 'The build prints nothing for long stretches.' },
      absoluteMs: { ms: 10_800_000, reason: 'The migration and its suite run for two hours.' },
    }).ok).toBe(true);
  });

  test('a command timeout above its ceiling is refused, naming the ceiling', () => {
    expect(errors({ commandTimeoutMs: { ms: 1_800_001, reason: 'r' }, absoluteMs: { ms: 3_600_000, reason: 'r' } })).toEqual([{
      path: 'assignment.bounds.commandTimeoutMs.ms',
      message: '1800001 ms is above the policy\'s ceiling for a shell command\'s timeout, which is 1800000 ms',
      expected: 'at most 1800000',
    }]);
  });

  test('an idle bound above its ceiling is refused, naming the ceiling', () => {
    expect(errors({ idleMs: { ms: 1_800_001, reason: 'r' } })).toEqual([{
      path: 'assignment.bounds.idleMs.ms',
      message: '1800001 ms is above the policy\'s ceiling for the idle bound, which is 1800000 ms',
      expected: 'at most 1800000',
    }]);
  });

  test('an absolute bound above its ceiling is refused, naming the ceiling', () => {
    expect(errors({ absoluteMs: { ms: 10_800_001, reason: 'r' } })).toEqual([{
      path: 'assignment.bounds.absoluteMs.ms',
      message: '10800001 ms is above the policy\'s ceiling for the absolute bound of an invocation, which is 10800000 ms',
      expected: 'at most 10800000',
    }]);
  });

  test('a command timeout longer than the invocation that runs it is refused', () => {
    // A policy whose invocations are shorter than the command ceiling.
    const tight = engineerBoundsOf({ ...testPolicy('/project').limits, invocationAbsoluteMs: 900_000 });
    const messages = (bounds: unknown) => {
      const verdict = validateLocalArchitect(assign(reviews, { bounds: bounds as never }, outline()) as LocalArchitectSubmission,
        { index: null, registry: new Map(), bounds: tight });
      return verdict.ok ? [] : verdict.errors;
    };
    // Against the absolute bound the assignment raised.
    expect(messages({ commandTimeoutMs: { ms: 1_500_000, reason: 'r' }, absoluteMs: { ms: 1_200_000, reason: 'r' } })).toEqual([{
      path: 'assignment.bounds.commandTimeoutMs.ms',
      message: 'A command\'s timeout of 1500000 ms is longer than the 1200000 ms its invocation may run; raise `absoluteMs` with it, up to 10800000 ms',
      expected: 'at most 1200000',
    }]);
    // Against the policy's own, where the assignment raised none.
    expect(messages({ commandTimeoutMs: { ms: 1_000_000, reason: 'r' } }).map(error => error.message)).toEqual([
      'A command\'s timeout of 1000000 ms is longer than the 900000 ms its invocation may run, the policy\'s absolute bound; raise `absoluteMs` with it, up to 10800000 ms',
    ]);
  });

  test('a bound below the policy\'s is refused: a bound is raised, never lowered', () => {
    expect(errors({ idleMs: { ms: 1_000, reason: 'r' } }).map(error => error.path)).toEqual(['assignment.bounds.idleMs.ms']);
    expect(errors({ idleMs: { ms: 1_000, reason: 'r' } })[0]!.message).toContain('a bound is raised here, never lowered');
  });

  test('a bound without its reason, or not a positive integer, is refused by the schema', () => {
    expect(errors({ idleMs: { ms: 1_000_000 } }).map(error => error.path)).toEqual(['assignment.bounds.idleMs.reason']);
    expect(errors({ idleMs: { ms: 0, reason: 'r' } }).map(error => error.path)).toEqual(['assignment.bounds.idleMs.ms']);
    expect(errors({ idleMs: { ms: 1.5, reason: 'r' } }).map(error => error.path)).toEqual(['assignment.bounds.idleMs.ms']);
    expect(errors({ wallMs: { ms: 1_000_000, reason: 'r' } }).map(error => error.path)).toEqual(['assignment.bounds']);
  });
});

describe('every command stays bounded under raised bounds', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A session that ends only when it is stopped, and says when that was. */
  function silentSession() {
    let end: (outcome: SessionOutcome) => void = () => undefined;
    const outcome = new Promise<SessionOutcome>(resolve => { end = resolve; });
    const stops: number[] = [];
    const session: AgentSession = {
      outcome, start: { mode: 'fresh' }, ref: 'silent', settled: async () => 'settled',
      stop: async () => { stops.push(Date.now()); end({ kind: 'stopped' }); },
    };
    return { session, stops };
  }

  test('a hold lasts the command\'s raised timeout and the margin, and no longer', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const bounds = new InvocationBounds({ invocationIdleMs: 1_800_000, invocationAbsoluteMs: 10_800_000, writerSettleMs: 1_000 }, 60_000);
    const { session, stops } = silentSession();
    const ended = bounds.outcome(session);
    bounds.hold(1_800_000);
    await vi.advanceTimersByTimeAsync(1_859_000);
    expect(stops).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stops.map(at => at - started)).toEqual([1_860_000]);
    expect(bounds.interruption).toBe('idle-timeout');
    await vi.advanceTimersByTimeAsync(1_000);
    await ended;
  });

  test('the raised absolute bound keeps running during a hold', async () => {
    vi.useFakeTimers();
    const started = Date.now();
    const bounds = new InvocationBounds({ invocationIdleMs: 1_800_000, invocationAbsoluteMs: 1_000_000, writerSettleMs: 1_000 }, 60_000);
    const { session, stops } = silentSession();
    const ended = bounds.outcome(session);
    bounds.hold(1_800_000);
    await vi.advanceTimersByTimeAsync(1_000_000);
    expect(stops.map(at => at - started)).toEqual([1_000_000]);
    expect(bounds.interruption).toBe('absolute-timeout');
    await vi.advanceTimersByTimeAsync(1_000);
    await ended;
  });
});

describe('the shell of an engineer whose assignment raised its command maximum', () => {
  test('accepts a timeout up to it and refuses one above it, and runs the command with the timeout asked for', async () => {
    const asked: AskedCommand[] = [];
    const judgedInputs: unknown[] = [];
    const outputs = await temporaryDirectory();
    cleanups.push(outputs.remove);
    const tool = createShellTool({
      commandExecution: scriptedShell(asked),
      workingDirectory: '/project',
      maxTimeoutMs: 1_200_000,
      judge: async input => {
        judgedInputs.push(input);
        const timeout = (input as { timeoutMs?: number }).timeoutMs ?? 0;
        return timeout > 1_200_000 ? { ok: false, text: 'too long' } : { ok: true };
      },
      outputFile: call => join(outputs.path, `${call}.log`),
      starting: async () => undefined,
      ended: async () => undefined,
    });
    const schema = tool.definition.inputSchema as { properties: { timeoutMs: { maximum: number } } };
    expect(schema.properties.timeoutMs.maximum).toBe(1_200_000);
    expect(tool.definition.description).toContain('up to 1200000 ms');
    const ran = await tool.definition.execute({ command: 'npm run build', timeoutMs: 1_100_000 }, new AbortController().signal);
    expect(ran.isError).toBe(false);
    expect(asked).toEqual([{ command: 'npm run build', timeoutMs: 1_100_000 }]);
    const refused = await tool.definition.execute({ command: 'npm run build', timeoutMs: 1_300_000 }, new AbortController().signal);
    expect(refused).toEqual({ isError: true, text: 'too long' });
    expect(asked).toHaveLength(1);
  });
});
