import { taskSupportSections } from '../work/task-support.js';
import { declaredCheckInputs, moduleInputPointers } from '../work/starting-inputs.js';
import { randomBytes } from 'node:crypto';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { gitService, type GitService } from '../../subs/evidence/src/git.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { inPlaceCheckExecution, type CheckExecutionPort } from '../checks/execution.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import { placementDecisions } from '../guard/write-guard.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { HookFinding } from '../hooks/post-write.js';
import { loadPromptPackages, renderEngineerPrompt, sha256 } from '../prompts/packages.js';
import { deliveredSupportPaths } from '../prompts/tasks.js';
import type { HarnessTaskBrief } from '../run/session-operations.js';
import { runCheckpoint } from '../run/gates.js';
import { captureProjectConfig } from '../run/project-config.js';
import { readCommittedAuditConfiguration } from '../../subs/audit/src/check-execution.js';
import { declaredModuleDirectories, moduleTestAreas } from '../run/project-config.js';
import { architectRunInputs } from '../run/inputs.js';
import { defaultRunPolicy } from '../run/policy.js';
import { gateAttemptId, gateAttemptSchema, invocationOutcomeSchema, runLayout, type InvocationOutcome, type RunPolicy } from '../run/records.js';
import { acquireProjectLock, ProjectLockError, type ProjectLock } from '../store/lock.js';
import { engineerBuiltinTools, engineerEquipment } from '../work/engineer-equipment.js';
import { shellToolName } from '../tools/shell.js';
import { manualRunner, openManualRun } from '../steps/manual.js';
import { committedBody, finished } from '../steps/runner.js';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import { ensureScratchRule, removeScratchDirectories, scratchSafetyRule, trackedScratchPaths } from '../work/scratch.js';
import { capabilityEngineerJsonSchema, capabilityEngineerSubmissionSchema, engineerSubmissionDescription, engineerToolName, iterationMessage, validateEngineer, type EngineerSubmission } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { auditPreparationPaths, scopeConfigurationPaths, captureGuardedFiles, deniedFiles, guardedScopeOf, resolveWriteScope, scopePaths, testPolicyOf } from '../work/scope.js';
import { iterationApiViews } from '../work/session.js';

/*
 * One engineer session on one module, from a prompt a person writes.
 *
 * The session is given what an implementation run gives its engineers: the
 * engineer prompt, the module's API views, the write guard, the Ramify hook
 * check after each mutation, the shell and the validated submission. It
 * holds the project lock for its whole life, so it never runs beside an
 * implementation run. Nothing follows its submission: no capability task,
 * no architect turn and no commit. With the gate option the in-place
 * diagnosis runs over the current bytes afterwards, and its verdict is
 * recorded; the changes stay in the working tree either way.
 *
 * It runs on the invocation runner a run uses, and its records are a
 * manual run's, in a run's own layout, under
 * `plans/sessions/.harness/jobs/<id>/`: the session is that run's one
 * invocation, and `invocations/<invocation>/step.json` holds its summary and
 * the gate's verdict. Earlier sessions' records under
 * `plans/.harness/sessions/` are left where they are.
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
  /** A path changed by the harness while preparing scratch, rather than by the engineer. */
  readonly harnessChanged: readonly string[];
  /** Indexed scratch kept at session end; it must be removed from the index before readiness. */
  readonly preservedTracked: readonly string[];
  /** Changed paths outside the write scope. */
  readonly outsideScope: readonly string[];
  readonly usage: InvocationOutcome['usage'];
  readonly elapsedMs: number;
  /** The session's manual run directory, absolute: the run's records of its one invocation. */
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
  return `${what} Nothing follows it in this session: no capability task, architect or further session acts on it. A person reads your report. Nothing more is asked of you in this session.`;
}

/** Runs one engineer session on one module, from the lock to the records. */
export async function runSingleSession(options: SingleSessionOptions): Promise<SingleSessionResult> {
  if (options.policy !== undefined && options.policy.version !== 'run-policy/7') return notStarted(`Run policy ${options.policy.version} is refused by run-policy/7; a fresh run is required`);
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
  let releaseLock = true;
  try {
    return await runLocked({ ...options, projectRoot }, () => { releaseLock = false; });
  } finally {
    if (releaseLock) await lock.release();
  }
}

function notStarted(reason: string, records: string | null = null): SingleSessionResult {
  return { status: 'not-started', reason, records, exitStatus: 2 };
}

async function runLocked(options: SingleSessionOptions, retainProjectLock: () => void): Promise<SingleSessionResult> {
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
  const base = { module: entry.module, included: [] as { directory: string; reason: string; instructions: string }[] };
  let own = await resolveWriteScope({ ramify,
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
  const files = [...own.resolved.files];
  const extra = [...new Set(options.write ?? [])];
  for (const path of extra) {
    const target = isAbsolute(path) ? null : await resolveRealTarget(projectRoot, path);
    if (target === null || !target.ok || !isContained(projectRoot, target.resolved) || target.resolved === projectRoot) {
      return notStarted(`The write path "${path}" is not a project-relative path inside the project.`);
    }
    const directory = path.endsWith('/') || await stat(target.resolved).then(found => found.isDirectory(), () => false);
    if (directory) {
      const requested = path.replace(/\/$/u, '');
      const topology = own.resolved.ownership;
      const wholeTree = topology.modules.some(module => module.parent === entry.module && module.directory === requested)
        || topology.exclusions.some(exclusion => exclusion.kind === 'owned-nested-project' && exclusion.directory === requested);
      if (wholeTree) base.included.push({ directory: requested, reason: 'The user assigned this whole tree to the standalone session', instructions: options.prompt });
      else if ((await placementDecisions(guardedScopeOf(own, [], ramify), projectRoot, [requested]))[0] !== true) return notStarted(`The directory ${path} is not one whole immediate child or declared owned nested project root`);
    } else if (!files.includes(target.resolved)) files.push(target.resolved);
  }
  if (base.included.length > 0) own = await resolveWriteScope({ ramify, projectRoot, index: initial, view: own.resolved.view, revision: 1,
    base, extra: [], read: [], bootstrap: [], rationale: 'A standalone session with explicitly included whole trees' });
  const scope = { ...own, resolved: { ...own.resolved, files } };
  let harnessChanged: string[] = [];
  let alreadyChanged: string[];
  try {
    const modules = await declaredModuleDirectories(projectRoot);
    const tracked = await trackedScratchPaths(projectRoot, modules, git);
    if (tracked.length > 0) return notStarted(`Tracked scratch prevents this session: ${tracked.join(', ')}; nothing was deleted`);
    const removed = await removeScratchDirectories(projectRoot, modules, git);
    if (removed.preservedTracked.length > 0) return notStarted(`Tracked scratch appeared during preparation: ${removed.preservedTracked.join(', ')}`);
    alreadyChanged = await git.changedPaths(projectRoot);
    const prepared = await ensureScratchRule(projectRoot, modules, git);
    if (prepared.appended) harnessChanged = ['.gitignore'];
  } catch (error) {
    return notStarted(`Scratch preparation refused this session: ${message(error)}`);
  }
  const workingDirectory = await engineerWorkingDirectory(projectRoot, scope, initial, git)
    .catch(error => ({ error: message(error) }));
  if (typeof workingDirectory !== 'string') return notStarted(`The engineer cannot start in the module's src directory: ${workingDirectory.error}`);
  let scratchSettled = false;
  let settlementConfirmed = true;
  let closeOperations: (() => Promise<boolean>) | undefined;
  try {
  // A standalone session guards the same committed preparation inputs where a definition exists.
  const head = await git.currentHead(projectRoot);
  const auditExists = await stat(join(projectRoot, 'ramify-audit.json')).then(found => found.isFile(), () => false);
  let auditPaths: string[] = [];
  let declaredChecks: readonly unknown[] = [];
  if (auditExists) {
    try {
      const configuration = await readCommittedAuditConfiguration(projectRoot, head);
      auditPaths = await auditPreparationPaths(configuration, projectRoot);
      declaredChecks = configuration.checks;
    }
    catch (error) { return notStarted(`Committed audit configuration cannot be guarded: ${message(error)}`); }
  }
  const guardedFiles = await captureGuardedFiles(projectRoot, [], {}, [...auditPaths, ...scopeConfigurationPaths(scope)]);
  const guarded: GuardedScope = guardedScopeOf(scope, await deniedFiles(projectRoot, guardedFiles.map(file => file.path)), ramify);
  const tests = testPolicyOf('ordinary', base, [], [], scope.resolved.included);

  const policy = options.policy ?? defaultRunPolicy({ projectRoot });
  const { limits } = policy;
  const { packages } = await loadPromptPackages();
  const loaded = packages.get('engineer');
  if (loaded === undefined) return notStarted('No prompt package is loaded for the engineer.');

  const views = await iterationApiViews(ramify, projectRoot, initial, scope.base);


  const id = sessionId();
  // The session's records are a manual run's, in a run's own layout:
  // `plans/sessions/.harness/jobs/<id>/`, with the session its one invocation.
  const opened = await openManualRun({ projectRoot, planId: sessionsPlan, runId: id, git, policy, origin: 'session', branch: false, base: head });
  if (opened.status === 'refused') return notStarted(`The session's records cannot be created: ${opened.reason}`);
  const run = opened.run;
  run.index = initial;
  run.invocationBase = head;
  const records = run.directory;
  const { runner, close } = manualRunner({ projectRoot, git, model: options.model ?? null, agent });
  closeOperations = close;

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
  const testAreas = (await moduleTestAreas(projectRoot, initial)).filter(area => tests.exactOwners.includes(area.module)
    || tests.subtrees.some(subtree => area.module === subtree || area.module.startsWith(`${subtree}/`)));
  const setupPaths = [...auditPaths];
  for (const path of ['ramify-agent.json', 'package.json']) {
    if ((await stat(join(projectRoot, path)).catch(() => null))?.isFile()) setupPaths.push(path);
  }
  const setup = declaredCheckInputs({ projectRoot, checks: declaredChecks, paths: [...new Set(setupPaths)] });
  const modulePointers = moduleInputPointers({ projectRoot, testAreas, modules: views.flatMap(view => {
    const module = initial === null ? undefined : findModule(initial, view.module);
    return module === undefined ? [] : [{ module: module.module, directory: module.dir, apiPaths: view.views.map(view => view.path) }];
  }) });
  const prompt = [iterationMessage({ assignment, projectRoot, workingDirectory, base: head, views, testAreas, setup }), modulePointers].filter(Boolean).join('\n\n');
  const shown = scopePaths(projectRoot, scope);

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
    submissions: { legalOutcomes: ['completion-proposed', 'partial', 'unsuitable', 'capability-needed'], completionOutcome: 'completion-proposed' },
    outputPath: (kind, invocation, number) => run.path(kind === 'shell' ? runLayout.shellOutput(invocation, number) : runLayout.hookOutput(invocation, number)),
  });
  const brief: HarnessTaskBrief = { kind: 'standalone-command', objective: 'Carry out this standalone module command and submit its observed result.',
    goal: assignment.goal, requirements: [assignment.completionEvidence],
    sections: taskSupportSections(prompt, [`## Goal\n\n${assignment.goal}`, `## Completion evidence\n\n${assignment.completionEvidence}`]),
    environment: { projectRoot, workingDirectory, candidate: null, snapshot: null, limits,
      availableTools: [...engineerBuiltinTools, shellToolName, engineerToolName],
      views: views.flatMap(view => view.views.map(item => ({ path: item.path, revision: item.revision, modules: [view.module], coverage: item.coverage === null ? [] : [`${item.coverage} coverage limits`] }))),
      supportPaths: deliveredSupportPaths(loaded, 'standalone-command'), cucumberConfiguration: JSON.stringify({ kind: 'not-applicable', reason: 'Standalone assignment selects no registered feature files' }) } };

  // One invocation through the runner a run uses: its records, transcript,
  // equipment, bounds and outcome are a run's. Nothing follows its
  // submission, so the session is not kept.
  const result = await runner.runInvocation<EngineerSubmission>(run, agent, {
    role: 'engineer',
    work: {},
    attempt: 1,
    loaded,
    systemPrompt,
    prompt,
    brief,
    workingDirectory,
    start: { mode: 'fresh' },
    toolName: engineerToolName,
    description: engineerSubmissionDescription,
    inputSchema: capabilityEngineerJsonSchema,
    submissionSchema: 'ramify-agent.engineer-submission/1',
    // A claimed completion is checked afresh over the write scope before it
    // is judged: the hook checks saw only the mutations they covered.
    beforeSubmission: async (input, signal) => { await tools.findingsAtCompletion(input, signal); },
    validate: input => capabilityEngineerSubmissionSchema.safeParse(input).success
      ? validateEngineer(input, {
        capabilityWorkflow: true, kind: 'ordinary', obligation: null, openFindings: tools.openFindings(), submissions: tools.submissions,
      })
      : { ok: false, errors: [{ path: 'kind', message: 'This session accepts only the current capability engineer submissions' }] },
    acceptedText: value => {
      const check = tools.completionCheck();
      return sessionAcceptance(value.kind, options.gate === true, check?.kind === 'not-checked' ? check.reason : null);
    },
    scope: { write: scope.revision, measurement: null, size: null },
    writer: true,
    guarded,
    equip: tools.equip,
    endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
    keep: () => finished('not-kept'),
    startingTree: { dirty: alreadyChanged.length > 0, changed: alreadyChanged.map(path => path.split(sep).join('/')).sort() },
    signal: options.signal,
    progress: event => {
      if (event.type === 'started') {
        progress({ type: 'started', session: id, module: entry.module, directory: entry.dir, records, scope: shown, message: event.message });
      } else progress(event);
    },
  });
  if (result.id === '' || result.notStarted === true) {
    await removeScratchDirectories(projectRoot, [entry.dir], git);
    scratchSettled = true;
    return notStarted(result.error ?? 'The agent session could not start', records);
  }
  const outcome = invocationOutcomeSchema.parse(committedBody(run, runLayout.outcome(result.id)));
  settlementConfirmed = outcome.settled.confirmed;
  if (!settlementConfirmed) retainProjectLock();
  const changed = [...(result.changed ?? [])];
  const outsideScope = outcome.outsideScope.filter(path => !harnessChanged.includes(path));
  const removed = settlementConfirmed ? await removeScratchDirectories(projectRoot, [entry.dir], git) : { preservedTracked: [] };
  scratchSettled = settlementConfirmed;
  const safety = await scratchSafetyRule(projectRoot, await declaredModuleDirectories(projectRoot), git);

  // The gate: an in-place diagnosis of the tree the session left, its
  // setup, type check and Ramify check, with the guarded files as they
  // stood at the start. It never commits and runs no test or scenario: the
  // project's tests run only through its committed audit.
  let gate: SessionGateResult | null = null;
  if (options.gate === true) {
    if (!settlementConfirmed) {
      gate = { ran: false, reason: 'the session did not settle, so a check of the tree it may still be writing would prove nothing' };
    } else {
      progress({ type: 'gate-started' });
      // The project's declared setup, such as its build, runs first, as at
      // every gate of a run.
      const config = await captureProjectConfig(projectRoot);
      const setup = 'config' in config ? config.config.setup : undefined;
      const attemptPath = run.path(runLayout.diagnosis(result.id));
      const attempt = await runCheckpoint(options.checkExecution ?? inPlaceCheckExecution, {
        id: gateAttemptId(1),
        checkpoint: 'iteration',
        projectRoot,
        directory: run.path(runLayout.diagnosisOutput(result.id)),
        head: await git.currentHead(projectRoot),
        policy,
        proposedBy: result.id,
        subject: {},
        guarded: guardedFiles,
        authorizations: [],
        rules: [safety, { rule: 'write-scope', outcome: outcome.outsideScope.length > 0 ? 'failed' : 'passed', violations: outcome.outsideScope.map(path => ({ rule: 'write-scope', path, detail: 'Candidate change is outside current and captured write authority' })) }],
        ...(setup === undefined ? {} : { setup }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      const { auditOverall: _auditOverall, ...durableAttempt } = attempt;
      await mkdir(dirname(attemptPath), { recursive: true });
      await writeFile(attemptPath, `${JSON.stringify(gateAttemptSchema.parse(durableAttempt), null, 2)}\n`);
      gate = {
        ran: true,
        verdict: attempt.verdict,
        cause: attempt.cause,
        attempt: attemptPath,
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
  const summary: SessionSummary = {
    session: id,
    module: entry.module,
    ended: result.ended,
    submission: result.ended === 'submitted' ? result.value ?? null : null,
    rejectedSubmissions: outcome.rejectedSubmissions,
    standingViolations: standing,
    changed,
    harnessChanged,
    preservedTracked: removed.preservedTracked,
    outsideScope,
    usage: outcome.usage,
    elapsedMs: outcome.elapsedMs,
    records,
    gate,
    ...(result.error === undefined ? {} : { error: result.error }),
  };
  // What the session's summary states beside the run's records: the paths
  // the harness and the tree accounted for, and the gate.
  await writeFileAtomic(run.path(runLayout.stepSummary(result.id)), `${JSON.stringify({
    schema: 'ramify-agent.session-summary/1', ...summary,
    alreadyChanged: alreadyChanged.map(path => path.split(sep).join('/')).sort(),
    gate: gate === null ? null : gate.ran ? { attempt: relative(records, gate.attempt), verdict: gate.verdict, cause: gate.cause } : { skipped: gate.reason },
  }, null, 2)}\n`);
  progress({ type: 'summary', summary });
  const passed = settlementConfirmed && result.ended === 'submitted' && (gate === null || (gate.ran && gate.verdict === 'passed'));
  return { status: 'finished', summary, exitStatus: passed ? 0 : 1 };
  } finally {
    const closed = await closeOperations?.();
    if (closed === false) { settlementConfirmed = false; retainProjectLock(); }
    if (settlementConfirmed && !scratchSettled) await removeScratchDirectories(projectRoot, [entry.dir], git);
  }
}

/** The plan directory every session's manual run is under: `plans/sessions/.harness/jobs/<id>/`. */
export const sessionsPlan = 'sessions';

/** `20260921T101500Z-a1b2c3`: when it started, and unique beside another started the same second. */
function sessionId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
