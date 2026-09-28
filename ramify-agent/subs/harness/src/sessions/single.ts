import { randomBytes } from 'node:crypto';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { AgentPort, AgentSession, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { gitService, type GitService } from '../../subs/evidence/src/git.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { resolveTestSelection } from '../checks/selection.js';
import { inPlaceCheckExecution, type CheckExecutionPort } from '../checks/execution.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { HookFinding } from '../hooks/post-write.js';
import { inputsHash, loadPromptPackages, renderEngineerPrompt, sha256 } from '../prompts/packages.js';
import { ExcursionWatcher } from '../run/excursions.js';
import { runCheckpoint } from '../run/gates.js';
import { captureProjectConfig } from '../run/project-config.js';
import { architectRunInputs } from '../run/inputs.js';
import { recordSettledSnapshot } from '../run/mutations.js';
import { ObservationLog } from '../run/observations.js';
import { contextPolicyOf, defaultRunPolicy, discoverNestedPackages } from '../run/policy.js';
import { endedOf, InvocationBounds, PortEventRecorder } from '../run/port-events.js';
import { gateAttemptId, gateAttemptSchema, type InvocationOutcome, type RunPolicy } from '../run/records.js';
import { SubmissionJudge } from '../run/submissions.js';
import { WriterOwnership } from '../run/writer.js';
import { acquireProjectLock, ProjectLockError, type ProjectLock } from '../store/lock.js';
import { InvocationTranscript, verdictNote } from '../transcripts/recorder.js';
import { ContentStore } from '../transcripts/store.js';
import { TranscriptWriter } from '../transcripts/writer.js';
import { engineerEquipment } from '../work/engineer-equipment.js';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import {
  engineerJsonSchema, engineerSubmissionDescription, engineerToolName, iterationMessage, validateEngineer,
  type EngineerSubmission,
} from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { captureGuardedFiles, deniedFiles, guardedScopeOf, resolveWriteScope, scopePaths, testPolicyOf } from '../work/scope.js';
import { iterationApiViews } from '../work/session.js';
import {
  sessionLayout, sessionOutcomeSchema, sessionRecordSchema, sessionsDirectory,
  type SessionOutcomeRecord, type SessionRecord,
} from './records.js';

/*
 * One engineer session on one module, from a prompt a person writes.
 *
 * The session is given what an implementation run gives its engineers: the
 * engineer prompt, the module's API views, the write guard, the Ramify hook
 * check after each mutation, the shell, the scoped test tool and the
 * validated submission. It holds the project lock for its whole life, so it
 * never runs beside an implementation run. Nothing follows its submission:
 * no contract iteration, no architect turn and no commit. With the gate
 * option the iteration checkpoint runs over the module afterwards, and its
 * verdict is recorded; the changes stay in the working tree either way.
 *
 * Its records are plain files under `plans/.harness/sessions/<id>/`, and
 * its transcript is `transcript.jsonl` beside them, written as a run's is.
 */

/** What starts one single engineer session. */
export interface SingleSessionOptions {
  readonly projectRoot: string;
  /** The module, by its declared-name path or its project-relative directory. */
  readonly module: string;
  /** The person's prompt, which becomes the iteration's goal. */
  readonly prompt: string;
  readonly agent: AgentPort;
  /** The model the agent was asked to run, which the session records; without one, the agent chose its own. */
  readonly model?: string | undefined;
  /** The Ramify command line the hook check and the API views use. */
  readonly ramify: RamifyCli;
  /** Git observations. Tests inject scenario answers; production uses Git. */
  readonly git?: GitService | undefined;
  /** Gate command execution. Tests inject direct results; production runs commands. */
  readonly checkExecution?: CheckExecutionPort | undefined;
  /** Shell and scoped-test command execution. Tests inject results; production runs commands. */
  readonly commandExecution?: CommandRunner | undefined;
  /** Project-relative paths the session may write beside the module's own contents. */
  readonly write?: readonly string[] | undefined;
  /** Runs the iteration checkpoint over the module after the session. It never commits. */
  readonly gate?: boolean | undefined;
  /** The module inventory as the project stands now; by default the architect view, materialized. */
  readonly refresh?: ((projectRoot: string) => Promise<ArchitectIndex | null>) | undefined;
  /** The commands and limits; by default the policy an implementation run captures. */
  readonly policy?: RunPolicy | undefined;
  /** Everything the session observes, as it happens. */
  readonly onProgress?: ((event: SessionProgress) => void) | undefined;
  /** Stops the session, as a person interrupting it does. */
  readonly signal?: AbortSignal | undefined;
}

/** The iteration checkpoint's verdict on the tree the session left, or why it did not run. */
export type SessionGateResult =
  | {
      readonly ran: true;
      readonly verdict: 'passed' | 'failed' | 'not-verified';
      readonly cause: string | null;
      /** The attempt record, absolute. */
      readonly attempt: string;
      /** One line per command: its kind, its outcome and its output tail's last line. */
      readonly commands: readonly string[];
    }
  | { readonly ran: false; readonly reason: string };

/** What a finished session leaves: the facts its summary states. */
export interface SessionSummary {
  readonly session: string;
  readonly module: string;
  readonly ended: InvocationOutcome['ended'];
  /** The accepted submission, or null when none was accepted. */
  readonly submission: EngineerSubmission | null;
  readonly rejectedSubmissions: number;
  /** Ramify findings the session's edits introduced that no later check cleared. */
  readonly standingViolations: readonly HookFinding[];
  /** Every uncommitted path when the session settled. */
  readonly changed: readonly string[];
  /** Changed paths outside the write scope. */
  readonly outsideScope: readonly string[];
  readonly usage: InvocationOutcome['usage'];
  readonly elapsedMs: number;
  /** The session's records directory, absolute. */
  readonly records: string;
  /** Null without the gate option: then nothing verified the work. */
  readonly gate: SessionGateResult | null;
  readonly error?: string | undefined;
}

/** What the session observed, in the order it happened. */
export type SessionProgress =
  | {
      readonly type: 'started';
      readonly session: string;
      readonly module: string;
      readonly directory: string;
      readonly records: string;
      readonly scope: { readonly roots: readonly string[]; readonly files: readonly string[] };
      /** The iteration message the engineer starts from. */
      readonly message: string;
    }
  | { readonly type: 'tool-call'; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: 'tool-error'; readonly callId: string; readonly tool: string; readonly text: string }
  | { readonly type: 'message'; readonly text: string }
  /** Text of the harness's own in a tool result: a refusal by the guard, or what is appended after a mutation. */
  | { readonly type: 'harness-text'; readonly callId: string; readonly tool: string; readonly kind: 'refusal' | 'appended'; readonly text: string }
  | { readonly type: 'submission'; readonly input: unknown; readonly accepted: boolean; readonly answer: string }
  | { readonly type: 'gate-started' }
  | { readonly type: 'gate'; readonly result: SessionGateResult }
  | { readonly type: 'summary'; readonly summary: SessionSummary };

/**
 * How the session ended. `not-started` is every refusal before the agent
 * ran: an unknown module, a held lock, a path outside the project. Exit
 * status 0 is a submission and, with the gate option, a passing gate; 1 is
 * any other ending; 2 is a session that could not start.
 */
export type SingleSessionResult =
  | { readonly status: 'not-started'; readonly reason: string; readonly records: string | null; readonly exitStatus: 2 }
  | { readonly status: 'finished'; readonly summary: SessionSummary; readonly exitStatus: 0 | 1 };

/**
 * What an accepted submission is answered with in a session. Nothing
 * follows it but a person's review, so it says that instead of claiming
 * that the work is complete, and it says it by the kind that was submitted.
 *
 * `checkNotRun` is the reason the fresh Ramify check over the write scope
 * could not run, where it could not: a check that did not run is never
 * reported as a pass.
 */
export function sessionAcceptance(kind: EngineerSubmission['kind'], gate: boolean, checkNotRun: string | null = null): string {
  if (kind === 'completion-proposed') {
    const note = checkNotRun === null
      ? ''
      : ` The Ramify check over your write scope could not be run (${checkNotRun}), so nothing here verified it.`;
    return gate
      ? `The submission was accepted. The iteration checkpoint now runs over your module and a person reviews its verdict and your changes; nothing is committed.${note} Nothing more is asked of you in this session.`
      : `The submission was accepted. Nothing verifies or commits your changes in this session: they stay in the working tree for a person to review.${note} Nothing more is asked of you in this session.`;
  }
  const what = kind === 'partial'
    ? 'The report of what is done and what is unfinished was accepted and recorded.'
    : kind === 'unsuitable'
      ? 'The report that this assignment is unsuitable was accepted and recorded.'
      : 'The report that the behavior you need is owned elsewhere was accepted and recorded.';
  return `${what} Nothing follows it in this session: no contract, no architect and no further session act on it. A person reads your report. Nothing more is asked of you in this session.`;
}

/** Runs one engineer session on one module, from the lock to the records. */
export async function runSingleSession(options: SingleSessionOptions): Promise<SingleSessionResult> {
  if (options.prompt.trim() === '') return notStarted('The prompt is empty, so there is no goal to work on.');
  let projectRoot: string;
  try {
    projectRoot = await realpath(options.projectRoot);
  } catch (error) {
    return notStarted(`The project root ${options.projectRoot} cannot be read: ${message(error)}`);
  }
  let lock: ProjectLock;
  try {
    lock = await acquireProjectLock(projectRoot);
  } catch (error) {
    // A held lock is someone else's and is left exactly as it is.
    return notStarted(error instanceof ProjectLockError ? error.message : `The project lock could not be taken: ${message(error)}`);
  }
  try {
    return await runLocked({ ...options, projectRoot });
  } finally {
    await lock.release();
  }
}

function notStarted(reason: string, records: string | null = null): SingleSessionResult {
  return { status: 'not-started', reason, records, exitStatus: 2 };
}

async function runLocked(options: SingleSessionOptions): Promise<SingleSessionResult> {
  const { projectRoot, agent, ramify } = options;
  const git = options.git ?? gitService;
  const progress = (event: SessionProgress) => {
    try {
      options.onProgress?.(event);
    } catch {
      // A reader that fails does not end the session.
    }
  };
  const refreshFrom = options.refresh ?? architectRunInputs({ ramify }).refresh;
  let index: ArchitectIndex | null = null;
  const refresh = async (): Promise<ArchitectIndex | null> => {
    const refreshed = await refreshFrom(projectRoot).catch(() => null);
    if (refreshed !== null) index = refreshed;
    return refreshed;
  };

  // The module, resolved in the architect view before any model call.
  const initial = await refresh();
  if (initial === null) return notStarted('The architect view could not be materialized, so the module cannot be resolved.');
  const entry = findModule(initial, options.module);
  if (entry === undefined) return notStarted(`"${options.module}" is not a module of this project's architect view.`);

  // The write scope: the module's own contents, as a run's ordinary
  // assignment has it, and each extra path the person named.
  const base = { module: entry.module, includedChildren: [] as string[] };
  const own = await resolveWriteScope({
    projectRoot,
    index: initial,
    view: { status: 'materialized', revision: initial.revision, input: initial.input, coverageLimits: [] },
    revision: 1,
    base,
    extra: [],
    read: [],
    bootstrap: [],
    rationale: 'A single engineer session on this module.',
  });
  const roots = [...own.resolved.roots];
  const files = [...own.resolved.files];
  const extra = [...new Set(options.write ?? [])];
  for (const path of extra) {
    const target = isAbsolute(path) ? null : await resolveRealTarget(projectRoot, path);
    if (target === null || !target.ok || !isContained(projectRoot, target.resolved) || target.resolved === projectRoot) {
      return notStarted(`The write path "${path}" is not a project-relative path inside the project.`);
    }
    const directory = path.endsWith('/') || await stat(target.resolved).then(found => found.isDirectory(), () => false);
    const list = directory ? roots : files;
    if (!list.includes(target.resolved)) list.push(target.resolved);
  }
  const scope = { ...own, resolved: { ...own.resolved, roots, files } };
  const workingDirectory = await engineerWorkingDirectory(projectRoot, scope, initial)
    .catch(error => ({ error: message(error) }));
  if (typeof workingDirectory !== 'string') return notStarted(`The engineer cannot start in the module's src directory: ${workingDirectory.error}`);
  // The project's configuration for the harness is never an agent's to write.
  const guarded: GuardedScope = guardedScopeOf(scope, await deniedFiles(projectRoot, []));
  const tests = testPolicyOf('ordinary', base, []);

  const policy = options.policy ?? defaultRunPolicy({ projectRoot, nested: await discoverNestedPackages(projectRoot) });
  const { limits } = policy;
  const { packages } = await loadPromptPackages();
  const loaded = packages.get('engineer');
  if (loaded === undefined) return notStarted('No prompt package is loaded for the engineer.');

  const views = await iterationApiViews(ramify, projectRoot, initial, [entry.module]);
  const head = await git.currentHead(projectRoot);
  const guardedFiles = await captureGuardedFiles(projectRoot);
  const alreadyChanged = await git.changedPaths(projectRoot).catch(() => [] as string[]);

  const id = sessionId();
  const records = join(projectRoot, sessionsDirectory, id);
  const at = (path: string) => join(records, path);
  await mkdir(at(sessionLayout.executorSession), { recursive: true });

  // The prompt is the goal; what the person did not give reads "not stated".
  const assignment: IterationAssignment = {
    schema: 'ramify-agent.iteration-assignment/1',
    id,
    workItem: id,
    outline: { id: 'none', revision: 0, hash: sha256('') },
    stage: 0,
    kind: 'ordinary',
    goal: options.prompt.trim(),
    approach: 'Not stated.',
    scope,
    externalCapabilities: [],
    completionEvidence: 'Not stated.',
    evidenceObligations: [],
    gate: { checkpoint: 'iteration', tests },
    guarded: guardedFiles,
    authorizations: [],
  };
  const systemPrompt = renderEngineerPrompt(loaded, projectRoot, undefined, workingDirectory);
  const prompt = iterationMessage({ assignment, projectRoot, workingDirectory, base: head, views });
  const shown = scopePaths(projectRoot, scope);

  const record: SessionRecord = sessionRecordSchema.parse({
    schema: 'ramify-agent.session/2',
    id,
    role: 'engineer',
    module: entry.module,
    directory: entry.dir,
    prompt: options.prompt.trim(),
    agent: agent.name,
    model: options.model ?? null,
    startedAt: new Date().toISOString(),
    base: head,
    scope: { roots: shown.roots, files: shown.files, extra },
    tests,
    gate: options.gate === true,
    guarded: guardedFiles,
    views: views.map(view => ({ module: view.module, views: view.views.map(item => ({ ...item })), unavailable: view.unavailable })),
    prompts: { package: loaded.package, hash: loaded.hash, inputsHash: inputsHash([systemPrompt, prompt]) },
  } satisfies SessionRecord);
  await writeFile(at(sessionLayout.session), `${JSON.stringify(record, null, 2)}\n`);
  progress({ type: 'started', session: id, module: entry.module, directory: entry.dir, records, scope: shown, message: prompt });

  const observations = await ObservationLog.open(at(sessionLayout.observations));
  // The session is its own one invocation, so its identifier names both.
  const transcript = new InvocationTranscript(new TranscriptWriter({
    session: id,
    path: at(sessionLayout.transcript),
    root: records,
    store: new ContentStore(at(sessionLayout.blobs)),
    inlineBytes: policy.transcript.inlineBodyBytes,
  }), id, async detail => {
    await observations.record({ type: 'coverage-gap', data: { kind: 'transcript-incomplete', detail } });
  });
  const tools = engineerEquipment({
    commandExecution: options.commandExecution,
    projectRoot,
    workingDirectory,
    ramify,
    commands: policy.commands,
    bounds: limits,
    refresh,
    index: () => index,
    guarded,
    scopeRevision: scope.revision,
    tests,
    outputPath: (kind, _invocation, number) => at(kind === 'shell' ? sessionLayout.shellOutput(number) : sessionLayout.hookOutput(number)),
  });

  let accepted: EngineerSubmission | null = null;
  let submissionHash: string | null = null;
  const judge = new SubmissionJudge<EngineerSubmission>({
    target: engineerToolName,
    bound: limits.rejectedSubmissionsPerTurn,
    // A claimed completion is checked afresh over the write scope before it
    // is judged: the hook checks saw only the mutations they covered.
    validate: async input => validateEngineer(input, {
      kind: 'ordinary', obligation: null, openFindings: await tools.findingsAtCompletion(input),
    }),
    accept: async value => {
      const content = `${JSON.stringify({ schema: 'ramify-agent.engineer-submission/1', ...value }, null, 2)}\n`;
      await writeFileAtomic(at(sessionLayout.submission), content);
      accepted = value;
      submissionHash = sha256(content);
    },
    acceptedText: value => {
      const check = tools.completionCheck();
      return sessionAcceptance(value.kind, options.gate === true, check?.kind === 'not-checked' ? check.reason : null);
    },
    observations,
  });

  const excursions = new ExcursionWatcher({ projectRoot, index: initial, scope: guarded });
  const context = contextPolicyOf(policy, 'engineer');
  const recorder = new PortEventRecorder({ projectRoot, workingDirectory, observations, judge, excursions, context, transcript });
  const bounds = new InvocationBounds(limits);
  const equipment = tools.equip({
    invocation: id,
    observations,
    callId: tool => recorder.callId(tool),
    reminders: () => excursions.takeReminders(),
    transcript,
    hold: timeoutMs => bounds.hold(timeoutMs),
  });
  const { guard, afterMutation } = equipment;

  const spec: SessionSpec = {
    role: 'engineer',
    scope: { workingDirectory },
    systemPrompt,
    prompt,
    session: { mode: 'fresh' },
    context,
    builtinTools: equipment.builtinTools ?? ['read', 'grep', 'ls'],
    tools: [...(equipment.tools ?? [])],
    ...(guard === undefined ? {} : {
      guard: async call => {
        const decision = await guard(call);
        if (!decision.allow) progress({ type: 'harness-text', callId: call.callId, tool: call.tool, kind: 'refusal', text: decision.text });
        return decision;
      },
    }),
    ...(afterMutation === undefined ? {} : {
      afterMutation: async call => {
        const appended = await afterMutation(call);
        if (appended !== null) progress({ type: 'harness-text', callId: call.callId, tool: call.tool, kind: 'appended', text: appended.text });
        return appended;
      },
    }),
    submission: {
      name: engineerToolName,
      description: engineerSubmissionDescription,
      inputSchema: engineerJsonSchema,
      accept: async input => {
        const verdict = await judge.judge(input);
        transcript.note(verdictNote(recorder.callId(engineerToolName), engineerToolName, verdict));
        progress({
          type: 'submission',
          input,
          accepted: verdict.accepted,
          answer: verdict.accepted ? verdict.text ?? '' : verdict.errors.join('\n'),
        });
        return verdict;
      },
    },
    sessionDirectory: at(sessionLayout.executorSession),
    onEvent: event => {
      bounds.touch();
      if (event.type === 'tool-started' && event.tool !== engineerToolName) {
        progress({ type: 'tool-call', callId: event.callId, tool: event.tool, input: event.input });
      } else if (event.type === 'tool-finished' && event.isError && event.tool !== engineerToolName) {
        progress({ type: 'tool-error', callId: event.callId, tool: event.tool, text: event.errorText ?? '' });
      } else if (event.type === 'message' && event.role === 'assistant' && event.blocks.some(block => block.type === 'text' && block.text.trim() !== '')) {
        // The assistant's own text; its tool calls are shown as calls.
        progress({ type: 'message', text: event.text });
      }
      void recorder.record(event).catch(() => undefined);
    },
  };

  // The session writes, so it holds the writer, and its settlement is the
  // harness's own observation: the session idle and the tree read around it.
  const writer = new WriterOwnership({ settleMs: limits.writerSettleMs, tree: { changed: () => git.changedPaths(projectRoot).catch(() => []) } });
  writer.acquire(id);
  // The start holds the prompts and is written before the model is called.
  await transcript.started({
    role: 'engineer', work: {}, start: 'opened', requested: 'fresh',
    executor: agent.name, model: options.model ?? null, systemPrompt, prompt,
  });
  const started = Date.now();
  let agentSession: AgentSession;
  try {
    agentSession = agent.startSession(spec);
  } catch (error) {
    const settled = await writer.release(id);
    const reason = `The agent session could not start: ${message(error)}`;
    await transcript.end({ ended: 'failed', interruption: 'adapter-fault', error: reason, actual: null });
    await writeOutcome(at(sessionLayout.outcome), {
      session: id, ended: 'failed', interruption: 'adapter-fault', error: reason, submission: null, rejectedSubmissions: 0,
      standingViolations: [], settled, changed: alreadyChanged, alreadyChanged, outsideScope: [],
      usage: recorder.outcomeUsage(agent), elapsedMs: Date.now() - started, gate: null,
    });
    return notStarted(reason, records);
  }

  let stoppedByCaller = false;
  const stop = () => {
    stoppedByCaller = true;
    void agentSession.stop().catch(() => undefined);
  };
  if (options.signal?.aborted === true) stop();
  else options.signal?.addEventListener('abort', stop, { once: true });
  let outcome: Awaited<AgentSession['outcome']>;
  try {
    outcome = await bounds.outcome(agentSession);
  } finally {
    options.signal?.removeEventListener('abort', stop);
  }
  const elapsedMs = Date.now() - started;
  await recorder.recordGaps(agent);
  await equipment.settle?.().catch(() => undefined);
  const settled = await writer.release(id, agentSession);
  const snapshot = await recordSettledSnapshot({ projectRoot, changed: () => git.changedPaths(projectRoot), scope: guarded }, observations);

  const interruption = bounds.interruption ?? (stoppedByCaller ? 'stopped-by-caller' as const : undefined);
  const ended: InvocationOutcome['ended'] = bounds.interruption !== undefined
    ? 'failed'
    : tools.exhausted() ? 'invalid-submission' : endedOf(outcome.kind, judge.boundReached);
  const error = outcome.kind === 'failed' ? outcome.error : bounds.interruption === 'idle-timeout'
    ? `No port event for ${limits.invocationIdleMs} ms`
    : bounds.interruption === 'absolute-timeout' ? `The session ran for ${limits.invocationAbsoluteMs} ms, its absolute bound` : undefined;
  const submission: EngineerSubmission | null = ended === 'submitted' ? accepted : null;
  if (outcome.kind === 'context-budget-reached') {
    transcript.note({ kind: 'budget-reached', tokens: outcome.tokens, threshold: context.budgetTokens, reportDelivered: outcome.report !== undefined });
  }
  await transcript.end({
    ended,
    interruption: interruption ?? null,
    error: error ?? null,
    actual: { mode: agentSession.start.mode, degradedReason: agentSession.start.degradedReason ?? null },
  });

  // The gate: the iteration checkpoint over the tree the session left,
  // with the module's own tests resolved anew and the guarded files as
  // they stood at the start. It never commits.
  let gate: SessionGateResult | null = null;
  if (options.gate === true) {
    if (!settled.confirmed) {
      gate = { ran: false, reason: 'the session did not settle, so a check of the tree it may still be writing would prove nothing' };
    } else {
      progress({ type: 'gate-started' });
      const selection = await resolveTestSelection({ projectRoot, index: await refresh(), policy: tests });
      // The project's declared setup, such as its build, runs first, as at
      // every gate of a run.
      const config = await captureProjectConfig(projectRoot);
      const setup = 'config' in config ? config.config.setup : undefined;
      const attempt = await runCheckpoint(options.checkExecution ?? inPlaceCheckExecution, {
        id: gateAttemptId(1),
        checkpoint: 'iteration',
        projectRoot,
        directory: at(sessionLayout.gateOutput),
        head: await git.currentHead(projectRoot),
        policy,
        proposedBy: id,
        subject: {},
        tests: selection,
        guarded: guardedFiles,
        authorizations: [],
        ...(setup === undefined ? {} : { setup }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      const { auditOverall: _auditOverall, ...durableAttempt } = attempt;
      await writeFile(at(sessionLayout.gate), `${JSON.stringify(gateAttemptSchema.parse(durableAttempt), null, 2)}\n`);
      gate = {
        ran: true,
        verdict: attempt.verdict,
        cause: attempt.cause,
        attempt: at(sessionLayout.gate),
        commands: attempt.commands.map(command => {
          const outcomeText = command.notVerified === 'setup-failed'
            ? 'not run, because a setup command did not pass'
            : command.outcome === 'not-verified' ? `not verified (${command.notVerified ?? 'unknown'})` : command.outcome;
          const last = command.output.tail.trim().split('\n').at(-1) ?? '';
          return `${command.kind}${command.name === undefined ? '' : ` "${command.name}"`}: ${outcomeText}${last === '' ? '' : ` — ${last}`}`;
        }),
      };
    }
    progress({ type: 'gate', result: gate });
  }

  const standing = tools.openFindings();
  await writeOutcome(at(sessionLayout.outcome), {
    session: id,
    ended,
    ...(interruption === undefined ? {} : { interruption }),
    ...(error === undefined ? {} : { error }),
    submission: submission === null || submissionHash === null || (submission as EngineerSubmission).kind === 'capability-needed'
      ? null : { kind: (submission as Exclude<EngineerSubmission, { kind: 'capability-needed' }>).kind, hash: submissionHash },
    rejectedSubmissions: judge.rejections,
    standingViolations: standing.map(finding => ({ code: finding.code, message: finding.message, file: finding.file, line: finding.line })),
    settled,
    changed: [...snapshot.paths],
    alreadyChanged: alreadyChanged.map(path => path.split(sep).join('/')).sort(),
    outsideScope: [...snapshot.outsideScope],
    usage: recorder.outcomeUsage(agent),
    elapsedMs,
    gate: gate === null ? null : gate.ran
      ? { attempt: relative(records, gate.attempt), verdict: gate.verdict, cause: gate.cause }
      : { skipped: gate.reason },
  });

  const summary: SessionSummary = {
    session: id,
    module: entry.module,
    ended,
    submission,
    rejectedSubmissions: judge.rejections,
    standingViolations: standing,
    changed: [...snapshot.paths],
    outsideScope: [...snapshot.outsideScope],
    usage: recorder.outcomeUsage(agent),
    elapsedMs,
    records,
    gate,
    ...(error === undefined ? {} : { error }),
  };
  progress({ type: 'summary', summary });
  const passed = ended === 'submitted' && (gate === null || (gate.ran && gate.verdict === 'passed'));
  return { status: 'finished', summary, exitStatus: passed ? 0 : 1 };
}

async function writeOutcome(path: string, body: Omit<SessionOutcomeRecord, 'schema' | 'finishedAt'>): Promise<void> {
  const outcome = sessionOutcomeSchema.parse({ schema: 'ramify-agent.session-outcome/1', ...body, finishedAt: new Date().toISOString() });
  await writeFile(path, `${JSON.stringify(outcome, null, 2)}\n`);
}

/** `20260921T101500Z-a1b2c3`: when it started, and unique beside another started the same second. */
function sessionId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
