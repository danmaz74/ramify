import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { gitCandidateSource, gitService, type CandidateSource, type GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { readCommittedAuditConfiguration } from '../../subs/audit/src/check-execution.js';
import { isContained } from '../guard/resolve-contained-path.js';
import { canonicalJson } from '../jobs/commands.js';
import { loadPromptPackages, type LoadedPackage } from '../prompts/packages.js';
import { architectRunInputs } from '../run/inputs.js';
import { defaultRunPolicy, withProjectTimeouts } from '../run/policy.js';
import { captureProjectConfig, declaredModuleDirectories } from '../run/project-config.js';
import { invocationOutcomeSchema, runLayout, type InvocationOutcome } from '../run/records.js';
import { readSessionPointReference } from '../run/session-operations.js';
import type { ProcessGroups } from '../run/writer.js';
import { acquireProjectLock, ProjectLockError, type ProjectLock } from '../store/lock.js';
import { committedRecords } from '../work/committed.js';
import { iterationAcceptance, validateEngineer, type EngineerSubmission } from '../work/engineer.js';
import { engineerEquipment } from '../work/engineer-equipment.js';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import { createGitInspectionTool } from '../work/git-inspection.js';
import { protectedScopeOf } from '../work/scope.js';
import { ensureScratchRule, removeScratchDirectories, trackedScratchPaths } from '../work/scratch.js';
import { prepareAssignedCucumber } from '../work/session.js';
import { constructStep, freshFallback } from './construct.js';
import { constructEngineerStep } from './engineer.js';
import { parseStepInputs, StepInputsError, validateStepInputs, type StepInputs } from './inputs.js';
import { constructOrientationStep, constructSelectorStep, constructWorkTurnStep, judgeWorkTurn } from './local-architect.js';
import { manualRunLocationOf, manualRunner, unsettledWriter, openManualRun, recordAuthoredInputs, type ManualRun } from './manual.js';
import { constructDesignOrientationStep } from './reviewer.js';
import { prepareManualReview, ReviewRefusal, type ManualReview } from './review-step.js';
import { committedBody, finished, kept, type InvocationProgress, type InvocationRequest, type InvocationResult, type InvocationRunner } from './runner.js';

/*
 * `step run`: one invocation of one role, built from its step inputs by the
 * constructor a run uses, executed by the invocation runner a run uses, and
 * recorded in a manual run in a run's own layout.
 *
 * It holds the project lock, materializes the architect view and prepares
 * what the role works in as a run does: an engineer's source directory, its
 * scratch and its focused Cucumber command; a reader's empty workspace. It
 * uses the tree as it stands: the invocation records the commit HEAD names
 * and whether the tree differed from it, and nothing is snapshotted or
 * restored. Each run is a new invocation.
 *
 * A start the inputs continue or fork is taken where the manual run holds
 * the session point it names. A point of any other run, or one the manual
 * run does not hold, is a fresh start that records why; inputs imported
 * from a run start fresh already, with their original start as provenance.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What one `step run` is given. */
export interface StepRunOptions {
  /** The step inputs file. */
  readonly inputs: string;
  /** The manual run directory, `<project>/plans/<plan>/.harness/jobs/<run>`, created where it does not exist. */
  readonly run: string;
  readonly agent: AgentPort;
  /** The model the agent was asked to run; without one, the agent chose its own. */
  readonly model?: string | undefined;
  readonly ramify: RamifyCli;
  /** Git observations and the branch the run works on. Tests inject scenario answers; production uses Git. */
  readonly git?: GitService | undefined;
  /** The audited candidates a review reads; production reads them from Git. */
  readonly candidates?: CandidateSource | undefined;
  /** Shell and scoped-test command execution. Tests inject results; production runs commands. */
  readonly commandExecution?: CommandRunner | undefined;
  /** The architect view as the project stands now; by default the view, materialized. */
  readonly refresh?: ((projectRoot: string) => Promise<ArchitectIndex | null>) | undefined;
  /** The checks of the committed audit configuration, which a focused Cucumber command is prepared from. */
  readonly auditChecks?: ((projectRoot: string, head: string) => Promise<readonly unknown[]>) | undefined;
  readonly skillDirectory?: string | undefined;
  /** The prompt packages the step is built with; by default the installed ones. Tests inject a changed package as a harness fix. */
  readonly loadPackages?: ((capabilityWorkflow: StepInputs['capabilityWorkflow']) => Promise<ReadonlyMap<string, LoadedPackage>>) | undefined;
  readonly groups?: ProcessGroups | undefined;
  readonly now?: (() => Date) | undefined;
  /** Everything the invocation does, as it happens. */
  readonly onProgress?: ((event: StepRunProgress) => void) | undefined;
  /** Stops the invocation, as a person interrupting it does. */
  readonly signal?: AbortSignal | undefined;
}

/** How a step's session started, against what its inputs asked for. */
export interface StepRunStart {
  /** The start the inputs name. */
  readonly requested: string;
  /** The start that was taken: fresh, continued or a fork. */
  readonly actual: 'fresh' | 'continued' | 'fork';
  /** Why a start the inputs named was not taken, or null. */
  readonly reason: string | null;
  /** Where the inputs came from: a source run's invocation and its original start, authored records, or null. */
  readonly provenance: string | null;
}

/** What a finished step leaves: the facts its summary states and the records that hold them. */
export interface StepRunSummary {
  readonly run: string;
  readonly invocation: string;
  readonly session: string;
  readonly role: string;
  /** The role's phase or question, where it has one. */
  readonly variant: string | null;
  readonly ended: InvocationOutcome['ended'];
  /** The accepted submission, or null when none was accepted. */
  readonly submission: unknown;
  /** The accepted submission's kind, where it has one. */
  readonly submissionKind: string | null;
  readonly rejectedSubmissions: number;
  /** An engineer's Ramify findings that no later check cleared. */
  readonly standingViolations: readonly { readonly code: string; readonly message: string; readonly file: string | null; readonly line: number | null }[];
  /** Every path that differed from the base when the session settled. */
  readonly changed: readonly string[];
  readonly outsideScope: readonly string[];
  readonly settled: boolean;
  readonly usage: InvocationOutcome['usage'];
  readonly elapsedMs: number;
  /** The commit HEAD named when the invocation started. */
  readonly base: string;
  /** Whether the tree differed from the base when the invocation started, and where. */
  readonly dirty: boolean;
  readonly startingChanged: readonly string[];
  readonly start: StepRunStart;
  /** The records, absolute. */
  readonly records: {
    readonly run: string;
    readonly inputs: string;
    readonly invocation: string;
    readonly outcome: string;
    readonly submission: string | null;
    readonly observations: string;
    readonly transcript: string;
    readonly summary: string;
    /** A review's terminal attempt record, which settled the manual run's request; absent for other steps. */
    readonly review?: string | null | undefined;
  };
  readonly error?: string | undefined;
}

/** What a step run shows as it happens, in order. */
export type StepRunProgress =
  | {
      readonly type: 'step-started';
      readonly role: string;
      readonly variant: string | null;
      readonly invocation: string;
      readonly session: string;
      readonly run: string;
      readonly created: boolean;
      readonly base: string;
      readonly dirty: boolean;
      readonly startingChanged: readonly string[];
      readonly start: StepRunStart;
      /** The task message the session starts from. */
      readonly message: string;
    }
  | { readonly type: 'tool-call'; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: 'tool-error'; readonly callId: string; readonly tool: string; readonly text: string }
  | { readonly type: 'message'; readonly text: string }
  /** Text of the harness's own in a tool result: a guard's refusal, or what is appended after a mutation, such as hook findings. */
  | { readonly type: 'harness-text'; readonly callId: string; readonly tool: string; readonly kind: 'refusal' | 'appended'; readonly text: string }
  | { readonly type: 'submission'; readonly input: unknown; readonly accepted: boolean; readonly answer: string }
  | { readonly type: 'step-summary'; readonly summary: StepRunSummary };

/**
 * How a step run ended. Exit status 0 is an accepted submission of a session
 * that settled; 1 is any other ending; 2 is a step that was refused or
 * could not start.
 */
export type StepRunResult =
  | { readonly status: 'not-started'; readonly reason: string; readonly records: string | null; readonly exitStatus: 2 }
  | { readonly status: 'finished'; readonly summary: StepRunSummary; readonly exitStatus: 0 | 1 };

const notStarted = (reason: string, records: string | null = null): StepRunResult => ({ status: 'not-started', reason, records, exitStatus: 2 });

/** The project root and identities a run directory names, or why it names none. */
export const manualRunLocation = manualRunLocationOf;

/** Runs one step from its inputs in a manual run, from the lock to the records. */
export async function runStep(options: StepRunOptions): Promise<StepRunResult> {
  const inputsPath = resolve(options.inputs);
  let bytes: string;
  try { bytes = await readFile(inputsPath, 'utf8'); }
  catch (error) { return notStarted(`The inputs file ${inputsPath} cannot be read: ${message(error)}`); }
  let inputs: StepInputs;
  try { inputs = parseStepInputs(bytes); }
  catch (error) {
    if (error instanceof StepInputsError) return notStarted(error.message);
    throw error;
  }
  const location = manualRunLocation(options.run);
  if (typeof location === 'string') return notStarted(location);
  let projectRoot: string;
  try { projectRoot = await realpath(location.projectRoot); }
  catch (error) { return notStarted(`The project root ${location.projectRoot} cannot be read: ${message(error)}`); }
  let lock: ProjectLock;
  try { lock = await acquireProjectLock(projectRoot); }
  catch (error) {
    // A held lock is someone else's and is left exactly as it is.
    return notStarted(error instanceof ProjectLockError ? error.message : `The project lock could not be taken: ${message(error)}`);
  }
  let releaseLock = true;
  try {
    return await runLocked(options, inputs, { ...location, projectRoot }, () => { releaseLock = false; });
  } finally {
    if (releaseLock) await lock.release();
  }
}

/** The start the manual run can take for the inputs: theirs, or a fresh one with the reason. */
function takenStart(inputs: StepInputs, run: ManualRun, sessionOf: (ref: string, session: string | undefined) => string | null): { readonly inputs: StepInputs; readonly reason: string | null } {
  const start = inputs.start;
  if (start.kind === 'fresh') return { inputs, reason: null };
  const point = 'point' in start ? start.point : null;
  const session = 'session' in start ? start.session : undefined;
  const reference = point === null ? null : readSessionPointReference(point);
  let reason: string | null = null;
  if (reference === null) reason = 'the inputs name no session point';
  else if (reference.runId !== run.jobId) reason = `the session point belongs to run ${reference.runId}, not this manual run ${run.jobId}; no provider history is imported`;
  else if (sessionOf(point!, session) === null) reason = `this manual run holds no session at the point the inputs name${session === undefined ? '' : ` (${session})`}`;
  if (reason === null) return { inputs, reason: null };
  if (inputs.role === 'engineer') {
    // A fresh engineer keeps a failed gate to repair; guidance belongs to a resumption only.
    const fields = Object.fromEntries(Object.entries(inputs).filter(([key]) => key !== 'guidance' && key !== 'start'));
    return { inputs: validateStepInputs({ ...fields, start: { kind: 'fresh', degraded: { requested: 'continued', reason } } }), reason };
  }
  const fresh = freshFallback(inputs, reason);
  if (fresh === null) throw new Error('unreachable: a start that is not fresh has a fresh fallback');
  return { inputs: fresh, reason };
}

async function runLocked(options: StepRunOptions, original: StepInputs, location: { readonly projectRoot: string; readonly planId: string; readonly runId: string },
  retainProjectLock: () => void): Promise<StepRunResult> {
  const { agent, ramify } = options;
  const { projectRoot } = location;
  const git = options.git ?? gitService;
  const progress = (event: StepRunProgress) => {
    try { options.onProgress?.(event); } catch { /* A reader that fails does not end the step. */ }
  };

  // The architect view as the project stands, before any model call.
  const refreshFrom = options.refresh ?? architectRunInputs({ ramify }).refresh;
  let index: ArchitectIndex | null = null;
  const refresh = async (): Promise<ArchitectIndex | null> => {
    const refreshed = await refreshFrom(projectRoot).catch(() => null);
    if (refreshed !== null) index = refreshed;
    return refreshed;
  };
  if (await refresh() === null) return notStarted('The architect view could not be materialized.');

  const policy = withProjectTimeouts(defaultRunPolicy({ projectRoot }), await captureProjectConfig(projectRoot));
  const opened = await openManualRun({ projectRoot, planId: location.planId, runId: location.runId, git, policy, origin: 'step-run', branch: true,
    now: options.now, groups: options.groups });
  if (opened.status === 'refused') return notStarted(`The manual run cannot be used: ${opened.reason}`);
  const run = opened.run;
  run.index = index;
  // A writer of an earlier invocation that is not known to be settled may still be writing.
  const unsettled = unsettledWriter(run.log);
  if (unsettled !== null) return notStarted(`The manual run cannot be used: ${unsettled}`, run.directory);

  // The inputs are the manual run's own; where they came from stays their provenance.
  let inputs: StepInputs;
  try { inputs = validateStepInputs({ ...original, run: { planId: run.planId, runId: run.jobId } }); }
  catch (error) { return notStarted(error instanceof StepInputsError ? error.message : message(error), run.directory); }
  const { runner, close } = manualRunner({ projectRoot, git, model: options.model ?? null, agent, ...(options.now === undefined ? {} : { now: options.now }) });
  const sessionOf = (ref: string, session: string | undefined): string | null => {
    for (const ended of [...run.log.all('invocation-ended')].reverse()) {
      if (session !== undefined && ended.data.session !== session) continue;
      const outcome = invocationOutcomeSchema.safeParse(committedBody(run, runLayout.outcome(ended.data.invocation)));
      if (outcome.success && outcome.data.session?.ref === ref) return ended.data.session;
    }
    return null;
  };
  const taken = takenStart(inputs, run, sessionOf);
  inputs = taken.inputs;
  const provenance = provenanceText(inputs.provenance);
  const variant = inputs.role === 'local-architect' ? inputs.phase : inputs.role === 'reviewer' ? inputs.question : null;

  const packages = options.loadPackages !== undefined ? await options.loadPackages(inputs.capabilityWorkflow)
    : (await loadPromptPackages({ capabilityWorkflow: inputs.capabilityWorkflow,
      ...(options.skillDirectory === undefined ? {} : { skillDirectory: options.skillDirectory }) })).packages;

  let settlementConfirmed = true;
  let scratch: { readonly directory: string } | undefined;
  try {
    let prepared: Prepared<unknown>;
    try {
      prepared = await prepareRequest(inputs, { projectRoot, packages, git, ramify, run, runner, refresh, index: () => index,
        commandExecution: options.commandExecution, auditChecks: options.auditChecks, candidates: options.candidates ?? gitCandidateSource,
        now: options.now ?? (() => new Date()) });
    } catch (error) {
      return notStarted(error instanceof Refusal || error instanceof ReviewRefusal ? error.message : `The ${inputs.role} step cannot be prepared: ${message(error)}`, run.directory);
    }
    scratch = prepared.scratch;

    // The tree it starts on: the commit HEAD names and whether the tree differs from it.
    const base = await git.currentHead(projectRoot).catch(() => '');
    const startingChanged = base === '' ? [] : await git.changedPaths(projectRoot).catch(() => []);
    run.invocationBase = base;
    run.invocationLimits = inputs.limits;
    const start: StepRunStart = {
      requested: original.start.kind,
      actual: inputs.start.kind === 'fresh' ? 'fresh' : inputs.start.kind === 'fork' ? 'fork' : 'continued',
      reason: taken.reason,
      provenance,
    };
    const result: InvocationResult<unknown> = await runner.runInvocation(run, agent, {
      ...prepared.request,
      startingTree: { dirty: startingChanged.length > 0, changed: [...startingChanged] },
      signal: options.signal,
      progress: event => {
        if (event.type === 'started') {
          progress({ type: 'step-started', role: inputs.role, variant, invocation: event.invocation, session: event.session, run: run.directory,
            created: opened.created, base, dirty: startingChanged.length > 0, startingChanged, start, message: event.message });
        } else progress(event);
      },
    });
    if (result.id === '') return notStarted(result.error ?? 'The invocation was not started', run.directory);
    // An agent session that could not start is a step that did not start; its invocation's records name why.
    if (result.notStarted === true) return notStarted(result.error ?? 'The agent session could not start', run.directory);

    const outcome = invocationOutcomeSchema.parse(committedBody(run, runLayout.outcome(result.id)));
    settlementConfirmed = outcome.settled.confirmed;
    // A review of the manual run's own request ends in its terminal attempt record, which settles it.
    const reviewRecord = prepared.review === undefined ? undefined
      : await prepared.review.finish(result, result.actual === undefined ? null : result.actual === 'fork' ? 'fork' : 'fresh');
    const submissionValue = result.value;
    const kind = submissionValue !== null && typeof submissionValue === 'object' && 'kind' in submissionValue && typeof submissionValue.kind === 'string'
      ? submissionValue.kind : null;
    const at = (path: string) => run.path(path);
    const summary: StepRunSummary = {
      run: run.directory,
      invocation: result.id,
      session: result.session,
      role: inputs.role,
      variant,
      ended: result.ended,
      submission: submissionValue ?? null,
      submissionKind: kind,
      rejectedSubmissions: outcome.rejectedSubmissions,
      standingViolations: (prepared.standing?.() ?? []).map(finding => ({ code: finding.code, message: finding.message, file: finding.file, line: finding.line })),
      changed: [...(result.changed ?? [])],
      outsideScope: [...outcome.outsideScope],
      settled: outcome.settled.confirmed,
      usage: outcome.usage,
      elapsedMs: outcome.elapsedMs,
      base,
      dirty: startingChanged.length > 0,
      startingChanged: [...startingChanged],
      start: { ...start, actual: result.actual === undefined ? start.actual : result.actual === 'continue' ? 'continued' : result.actual,
        reason: start.reason ?? (result.actual === 'fresh' && start.actual !== 'fresh' ? result.error ?? 'the session was not available' : null) },
      records: {
        run: run.directory,
        inputs: at(runLayout.stepInputs(result.id)),
        invocation: at(runLayout.invocation(result.id)),
        outcome: at(runLayout.outcome(result.id)),
        submission: outcome.submission === null ? null : at(runLayout.submission(result.id)),
        observations: at(runLayout.observations(result.id)),
        transcript: at(runLayout.transcript(result.session)),
        summary: at(runLayout.stepSummary(result.id)),
        ...(reviewRecord === undefined ? {} : { review: reviewRecord === null ? null : at(reviewRecord) }),
      },
      ...(result.error === undefined ? {} : { error: result.error }),
    };
    await writeFileAtomic(summary.records.summary, `${JSON.stringify({ schema: 'ramify-agent.step-run/1', ...summary }, null, 2)}\n`);
    progress({ type: 'step-summary', summary });
    const passed = outcome.settled.confirmed && result.ended === 'submitted';
    return { status: 'finished', summary, exitStatus: passed ? 0 : 1 };
  } finally {
    if (!(await close())) settlementConfirmed = false;
    if (!settlementConfirmed) retainProjectLock();
    // Scratch the run would remove at the iteration's close goes once the session settled.
    if (settlementConfirmed && scratch !== undefined) await removeScratchDirectories(projectRoot, [scratch.directory], git).catch(() => undefined);
  }
}

/** A refusal before anything starts, with its reason. */
class Refusal extends Error {}

/** One step's request, without what the manual run adds when it starts, and what the summary reads afterwards. */
interface Prepared<T> {
  readonly request: Omit<InvocationRequest<T>, 'progress' | 'signal' | 'startingTree'>;
  readonly standing?: (() => readonly { readonly code: string; readonly message: string; readonly file: string | null; readonly line: number | null }[]) | undefined;
  /** The module directory whose scratch the engineer was given. */
  readonly scratch?: { readonly directory: string } | undefined;
  /** A review question's attempt records. */
  readonly review?: ManualReview | undefined;
}

interface PrepareContext {
  readonly projectRoot: string;
  readonly packages: ReadonlyMap<string, LoadedPackage>;
  readonly git: GitService;
  readonly ramify: RamifyCli;
  readonly run: ManualRun;
  readonly runner: InvocationRunner<ManualRun>;
  readonly refresh: () => Promise<ArchitectIndex | null>;
  readonly index: () => ArchitectIndex | null;
  readonly commandExecution: CommandRunner | undefined;
  readonly auditChecks: StepRunOptions['auditChecks'];
  readonly candidates: CandidateSource;
  readonly now: () => Date;
}

const readerScope = { write: null, measurement: null, size: null };

/** A reader's working directory beneath the manual run, made empty where it does not exist. */
async function readerDirectory(context: PrepareContext, directory: string): Promise<string> {
  if (isContained(context.run.directory, directory)) await mkdir(directory, { recursive: true });
  return directory;
}

/** The fresh construction a step whose session is unavailable falls back to, where its role has one. */
function fallbackOf(inputs: StepInputs, environment: { readonly projectRoot: string; readonly packages: ReadonlyMap<string, LoadedPackage> }) {
  return (reason: string) => {
    const fresh = freshFallback(inputs, reason);
    if (fresh === null) return undefined;
    const step = constructStep(fresh, environment);
    return { prompt: step.prompt, brief: step.brief, stepInputs: step.before.inputs };
  };
}

async function prepareRequest(inputs: StepInputs, context: PrepareContext): Promise<Prepared<unknown>> {
  const { projectRoot, packages } = context;
  const environment = { projectRoot, packages };
  switch (inputs.role) {
    case 'engineer': return prepareEngineer(inputs, context);
    case 'local-architect': {
      if (inputs.phase === 'orientation') {
        const step = constructOrientationStep(inputs, environment);
        return { request: {
          role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs, work: step.work, attempt: step.attempt, loaded: step.loaded,
          systemPrompt: step.systemPrompt, prompt: step.prompt, workingDirectory: step.equipment.workingDirectory, start: { mode: 'fresh' },
          toolName: step.submission.toolName, description: step.submission.description,
          inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
          validate: step.validate, equip: () => ({ builtinTools: [...step.equipment.builtinTools] }),
          scope: readerScope,
          keep: (ended, value) => (ended === 'submitted' && value !== undefined ? kept : finished('not-kept')),
        } };
      }
      const step = constructWorkTurnStep(inputs, environment);
      const session = step.start.mode === 'continue' ? step.start.session : undefined;
      return { request: {
        role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs,
        fallback: fallbackOf(step.inputs, environment),
        work: step.work, attempt: step.attempt, loaded: step.loaded, systemPrompt: step.systemPrompt, prompt: step.prompt,
        workingDirectory: step.equipment.workingDirectory,
        start: step.start.mode === 'continue' ? { mode: 'continue', ref: step.start.ref } : { mode: 'fresh' },
        ...(session === undefined ? {} : { session: session as InvocationRequest<unknown>['session'] }),
        continuing: step.continuing,
        ...(step.start.mode === 'fresh' && step.start.degraded !== undefined ? { degraded: step.start.degraded } : {}),
        keep: (ended, value) => (ended === 'submitted' && value !== null && typeof value === 'object' && (value as { kind?: unknown }).kind !== 'yield-for-providers'
          ? kept : finished('not-kept')),
        toolName: step.submission.toolName, description: step.submission.description,
        inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
        equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [createGitInspectionTool(projectRoot)] }),
        validate: async input => (await judgeWorkTurn(step, input, { index: context.index(), ramify: context.ramify, projectRoot })).verdict,
        scope: readerScope,
      } };
    }
    case 'context-selector': {
      const step = constructSelectorStep(inputs, environment);
      await readerDirectory(context, step.equipment.workingDirectory);
      return { request: {
        role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs,
        fallback: fallbackOf(step.inputs, environment),
        work: step.work, attempt: step.attempt, loaded: step.loaded,
        systemPrompt: step.systemPrompt, prompt: step.prompt, freshPrompt: step.freshPrompt,
        start: step.start.mode === 'fork' ? { mode: 'fork', from: step.start.ref } : { mode: 'fresh' },
        ...(step.fork === undefined ? {} : { fork: step.fork }),
        ...(step.start.mode === 'fresh' && step.start.degraded !== undefined ? { degraded: step.start.degraded } : {}),
        toolName: step.submission.toolName, description: step.submission.description,
        inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
        validate: step.validate,
        scope: readerScope, workingDirectory: step.equipment.workingDirectory,
        equip: () => ({ builtinTools: [...step.equipment.builtinTools] }), keep: () => finished('not-kept'),
      } };
    }
    case 'reviewer': {
      if (inputs.question !== 'design-orientation') return prepareReviewRequest(inputs, context);
      const step = constructDesignOrientationStep(inputs, environment);
      await readerDirectory(context, step.equipment.workingDirectory);
      return { request: {
        role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs, work: step.work, attempt: step.attempt,
        loaded: step.loaded, systemPrompt: step.systemPrompt, prompt: step.prompt, start: { mode: 'fresh' },
        toolName: step.submission.toolName, description: step.submission.description,
        inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
        validate: step.validate,
        keep: ended => (ended === 'submitted' ? kept : finished('not-kept')),
        scope: readerScope, reader: true, workingDirectory: step.equipment.workingDirectory, absoluteMs: step.bounds.absoluteMs,
        equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [] }),
      } };
    }
  }
}

/**
 * A code, scope or design review: the audited candidate opened again, its
 * patches and validator prepared as a run prepares them, and the attempt
 * recorded where the request is the manual run's own.
 */
async function prepareReviewRequest(inputs: Extract<StepInputs, { role: 'reviewer'; question: 'code' | 'scope' | 'design' }>, context: PrepareContext): Promise<Prepared<unknown>> {
  const { projectRoot, packages, run } = context;
  const review = await prepareManualReview(inputs, { projectRoot, packages, run, candidates: context.candidates, now: context.now,
    warn: () => undefined });
  const { step, prepared } = review;
  let fenced = false;
  return {
    review,
    request: {
      role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs,
      fallback: fallbackOf(step.inputs, { projectRoot, packages }),
      work: step.work, attempt: step.attempt, loaded: step.loaded, systemPrompt: step.systemPrompt, prompt: step.prompt,
      start: step.start.mode === 'fork' ? { mode: 'fork', from: step.start.ref } : { mode: 'fresh' },
      ...(step.fork === undefined ? {} : { fork: step.fork }),
      ...(step.start.mode === 'fresh' && step.start.degraded !== undefined ? { degraded: step.start.degraded } : {}),
      toolName: step.submission.toolName, description: step.submission.description,
      inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
      validate: prepared.validate,
      keep: () => finished('work-closed'),
      scope: readerScope, reader: true, workingDirectory: step.equipment.workingDirectory, absoluteMs: step.bounds.absoluteMs,
      equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [...prepared.tools.definitions] }),
      // The start is recorded only for a request still unsettled; a settled one's reader never starts.
      onStarted: async (invocation, session) => { fenced = !await review.onStarted(invocation, session); },
      fenced: () => fenced,
    },
  };
}

/**
 * The engineer's request, with what a run prepares before it starts: the
 * authored records, the scratch, the source directory, the focused Cucumber
 * command and the guarded scope its equipment is bound to.
 */
async function prepareEngineer(original: Extract<StepInputs, { role: 'engineer' }>, context: PrepareContext): Promise<Prepared<unknown>> {
  const { projectRoot, git, run, runner, ramify } = context;
  const step = constructEngineerStep(original, { projectRoot, packages: context.packages });
  const { assignment } = step.inputs;

  // Scratch is prepared as a session prepares it: indexed scratch refuses, and the scratch rule is ensured.
  const modules = await declaredModuleDirectories(projectRoot);
  const tracked = await trackedScratchPaths(projectRoot, modules, git);
  if (tracked.length > 0) throw new Refusal(`Tracked scratch prevents this step: ${tracked.join(', ')}; nothing was deleted`);
  const removed = await removeScratchDirectories(projectRoot, modules, git);
  if (removed.preservedTracked.length > 0) throw new Refusal(`Tracked scratch appeared during preparation: ${removed.preservedTracked.join(', ')}`);
  await ensureScratchRule(projectRoot, modules, git);

  // The source directory the run would start the engineer in, made as the run makes it.
  let workingDirectory: string;
  try { workingDirectory = await engineerWorkingDirectory(projectRoot, assignment.scope, context.index(), git); }
  catch (error) { throw new Refusal(`The engineer cannot start in the module's src directory: ${message(error)}`); }
  if (workingDirectory !== step.equipment.workingDirectory) {
    throw new Refusal(`The inputs start the engineer in ${step.equipment.workingDirectory}, and the assignment's source directory is now ${workingDirectory}`);
  }
  const scratch = { directory: relative(projectRoot, dirname(workingDirectory)).split(sep).join('/') };

  // The focused Cucumber command, prepared again in this scratch as the run prepares it.
  const featurePaths = step.inputs.focused.featurePaths.map(path => path.project);
  if (featurePaths.length > 0) {
    const head = await git.currentHead(projectRoot).catch(() => '');
    const checks = await (context.auditChecks ?? (async (root: string, commit: string) => (await readCommittedAuditConfiguration(root, commit)).checks))(projectRoot, head)
      .catch(error => { throw new Refusal(`The committed audit configuration cannot be read for the focused Cucumber command: ${message(error)}`); });
    const focused = await prepareAssignedCucumber({ projectRoot, scratchDirectory: join(workingDirectory, 'tmp', 'ramify-focused', assignment.id),
      featurePaths, checks, runner: context.commandExecution ?? runCommand });
    if (canonicalJson(focused.command) !== canonicalJson(step.inputs.focused.command)) {
      throw new Refusal('The focused Cucumber command prepared now differs from the one the inputs captured; import or author the inputs again');
    }
  }

  // Authored records are the manual run's before its invocation starts.
  const authored = await recordAuthoredInputs(runner, run, step.inputs);
  if (authored !== null) throw new Refusal(authored);

  const guarded = await protectedScopeOf(projectRoot, assignment.scope, step.equipment.protectedFiles, ramify);
  const tools = engineerEquipment({
    commandExecution: context.commandExecution,
    registerProcessGroup: async (invocation, pid, identity) => {
      const committed = await runner.write(run, { type: 'writer-process-registered', data: { invocation, pid, identity } });
      if (committed === 'ended') throw new Error(`Run ${run.jobId} ended before process group ${pid} was registered`);
      run.writer.register(invocation, pid);
    },
    projectRoot,
    workingDirectory: step.equipment.workingDirectory,
    ramify,
    commands: run.record.policy.commands,
    bounds: step.limits,
    refresh: context.refresh,
    index: context.index,
    guarded,
    scopeRevision: step.equipment.scopeRevision,
    submissions: step.equipment.submissions,
    focusedCommands: step.equipment.focusedCommands,
    commandTimeoutMs: step.equipment.commandTimeoutMs,
    outputPath: (kind, invocation, number) => run.path(kind === 'shell' ? runLayout.shellOutput(invocation, number) : runLayout.hookOutput(invocation, number)),
  });
  const request: Prepared<EngineerSubmission>['request'] = {
    role: step.role,
    task: step.task,
    brief: step.brief,
    context: step.context,
    stepInputs: step.before.inputs,
    workingDirectory: step.equipment.workingDirectory,
    work: step.work,
    attempt: step.attempt,
    loaded: step.loaded,
    systemPrompt: step.systemPrompt,
    prompt: step.prompt,
    start: step.start.mode === 'continue' ? { mode: 'continue', ref: step.start.ref } : { mode: 'fresh' },
    ...(step.start.mode === 'continue' ? { session: step.start.session as InvocationRequest<unknown>['session'], continuing: step.start.continuing } : {}),
    ...(step.start.mode === 'fresh' && step.start.degraded !== undefined ? { degraded: step.start.degraded } : {}),
    // A proposed completion and a capability handback are kept, as the run keeps them, for a repair or a resumption to continue.
    keep: (ended, value) => (ended === 'submitted' && value !== undefined && (value.kind === 'completion-proposed' || value.kind === 'capability-needed')
      ? kept : finished('not-kept')),
    toolName: step.submission.toolName,
    description: step.submission.description,
    inputSchema: step.submission.inputSchema,
    submissionSchema: step.submission.submissionSchema,
    beforeSubmission: async (input, signal) => { await tools.findingsAtCompletion(input, signal); },
    validate: input => validateEngineer(input, {
      capabilityWorkflow: step.validator.capabilityWorkflow,
      obligation: step.validator.obligation,
      kind: step.validator.kind,
      openFindings: tools.openFindings(),
      submissions: tools.submissions,
      assigned: step.validator.assigned,
      seams: {
        index: context.index(),
        consumer: step.validator.consumer,
        providerOf: capability => committedRecords(run.log.ledger.replay()).registry.find(entry => entry.capability === capability)?.owner,
      },
    }),
    acceptedText: value => {
      const check = tools.completionCheck();
      return iterationAcceptance(value.kind, check?.kind === 'not-checked' ? check.reason : null);
    },
    scope: { write: assignment.scope.revision, measurement: null, size: null },
    writer: true,
    guarded,
    equip: tools.equip,
    bounds: step.bounds,
    endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
  };
  return {
    // The runner is generic in the submission; the engineer's request is one of its values.
    request: request as Prepared<unknown>['request'],
    standing: () => tools.openFindings(),
    scratch,
  };
}

/** Where the inputs came from, as the step's start names it. */
function provenanceText(provenance: StepInputs['provenance']): string | null {
  if (provenance === undefined) return null;
  if (!('origin' in provenance)) {
    return `${provenance.run.planId}/${provenance.run.runId} ${provenance.invocation} (original start ${provenance.originalStart})`;
  }
  return provenance.origin === 'authored'
    ? `authored (${provenance.authored.join(', ')})`
    : `the assignment ${provenance.assignment.run} of ${provenance.run.planId}/${provenance.run.runId} ${provenance.invocation}`;
}
