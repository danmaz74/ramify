import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import { readdir, readFile, readlink, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, relative, sep } from 'node:path';
import type {
  BuiltinTool, GuardedCall, GuardDecision, SettledMutation, ToolDefinition, WriteTool,
} from '../../subs/agent/src/interfaces/port.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { ProjectCommands } from '../checks/checkpoint.js';
import { blockExplanation, decideWrite, type GuardedScope } from '../guard/write-guard.js';
import {
  completionCheckDeadlineMs, FindingsSeen, findingsOf, runHookCheck, type HookCheck, type HookFinding, type HookCheckReservation, type HookSubmissionPolicy,
} from '../hooks/post-write.js';
import { changesBetween, sharedMutationOrder, type MutationChange, type MutationLease, type MutationSnapshot } from '../hooks/mutation-order.js';
import { ownerOf } from '../kpi/lines.js';
import type { ObservationLog } from '../run/observations.js';
import type { TranscriptNotes } from '../transcripts/recorder.js';
import { ToolInputJudge, validateAgainst } from '../run/submissions.js';
import { createShellTool, shellInputSchemaFor, shellMaxTimeoutMs, shellToolName, type ShellTool, type ShellOptions } from '../tools/shell.js';

/*
 * The equipment of one implementation session: the shell, the write guard and the hook check that runs after each mutating
 * call. It is built from explicit inputs and knows nothing of a run, so an
 * implementation run and a standalone session give an engineer the same
 * tools, guarded the same way and recorded in the same observations.
 */

/** What an invocation's equipment is built from. */
export interface EquipContext {
  readonly invocation: string;
  readonly observations: ObservationLog;
  /** The identifier of the call in flight for one tool, as the port reported it. */
  readonly callId: (tool: string) => string;
  /**
   * Text the harness owes the running session, emptied by whoever can carry
   * it. The port reaches a running session with text through the result of a
   * mutating call and through nothing else, so a reminder waits for one.
   */
  readonly reminders: () => string[];
  /** The invocation's transcript, told what the harness decides and where a call's complete output is. */
  readonly transcript?: TranscriptNotes | undefined;
  /**
   * Holds the invocation's idle bound while one command the equipment runs
   * for it is in flight, for that command's own timeout; the returned
   * release is called when the command ends. Absent, nothing is held.
   */
  readonly hold?: ((timeoutMs: number) => () => void) | undefined;
}

/** The tools and the guard of one invocation. */
export interface Equipment {
  readonly builtinTools?: readonly (BuiltinTool | WriteTool)[] | undefined;
  readonly tools?: readonly ToolDefinition[] | undefined;
  readonly guard?: ((call: GuardedCall) => Promise<GuardDecision>) | undefined;
  /**
   * What runs after each mutating call that executed, whether it succeeded
   * or not: the mutation is observed and the hook check runs, and what the
   * engineer must know before its next step is appended to that call's
   * result.
   */
  readonly afterMutation?: ((call: SettledMutation) => Promise<{ readonly text: string } | null>) | undefined;
  /** Ends what the equipment itself started, before the writer is released. */
  readonly settle?: (() => Promise<void>) | undefined;
  /** Release orphaned guard leases only after the actual operation has drained. */
  readonly drained?: (() => Promise<void>) | undefined;
}

/** Everything the engineer equipment is built from; none of it names a run. */
export interface EngineerEquipmentInputs {
  /** External command execution. Tests script outcomes; actual process tests use the default. */
  readonly commandExecution?: CommandRunner | undefined;
  readonly registerProcessGroup?: ((invocation: string, pid: number, identity: string | null) => Promise<void>) | undefined;
  readonly projectRoot: string;
  /** The port session's cwd; built-in writes and the shell resolve relative paths here. */
  readonly workingDirectory?: string | undefined;
  /** The Ramify command line the hook check runs. */
  readonly ramify: RamifyCli;
  /** The project's own commands: the hook check's timeout. */
  readonly commands: ProjectCommands & { readonly hookTimeoutMs: number };
  /** How many invalid inputs one tool accepts in a turn before the session is ended. */
  readonly bounds: { readonly rejectedToolInputsPerTurn: number };
  /** The module inventory as the project stands now, or null when it cannot be refreshed. */
  readonly refresh: () => Promise<ArchitectIndex | null>;
  /** The module inventory last refreshed, which names the owner of each guarded target. */
  readonly index: () => ArchitectIndex | null;
  /** The scope the guard lets the session write, and the revision it was captured at. */
  readonly guarded: GuardedScope;
  readonly scopeRevision: number;
  readonly submissions?: HookSubmissionPolicy | undefined;
  readonly focusedCommands?: ShellOptions['focusedCommands'];
  /**
   * Where one invocation's numbered shell output or hook-check log is
   * written.
   */
  readonly outputPath: (kind: 'shell' | 'hook', invocation: string, number: number) => string;
  /** The longest one shell command may run: the policy's, or what the assignment raised it to. */
  readonly commandTimeoutMs?: number | undefined;
}

/** One shell call of the invocation now equipped, as the harness saw it start and end. */
export interface ShellCallRecord {
  readonly callId: string;
  readonly call: number;
  readonly command: string;
  readonly timeoutMs: number;
  /** The file the complete output is written to. */
  readonly outputFile: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  /** Epoch milliseconds; null while the command runs. */
  endedAt: number | null;
}

/**
 * What the fresh check at `completion-proposed` answered. A check that could
 * not run is never a pass and never a refusal either: it is stated, the
 * submission proceeds, and the gate's own complete check answers.
 */
export type CompletionCheck =
  | { readonly kind: 'checked' }
  | { readonly kind: 'not-checked'; readonly reason: string };

export interface EngineerEquipment {
  /**
   * Builds the equipment of one invocation. The context carries the
   * invocation's own observation log, so everything the session does is
   * recorded against the invocation that did it.
   */
  readonly equip: (session: EquipContext) => Equipment;
  /** Whether a tool's bound on invalid inputs was reached. */
  readonly exhausted: () => boolean;
  /** The Ramify findings this session's edits introduced that no later check has cleared. */
  readonly openFindings: () => readonly HookFinding[];
  /**
   * The findings that stand against one submission on its way to being
   * validated. An input that claims completion is checked afresh over the
   * whole write scope first, because the hook checks saw only the mutations
   * they covered: a violation written through the shell, or one written
   * while a check did not run, would otherwise reach the gate. Any other
   * input is answered with what the hook checks already saw.
   */
  readonly findingsAtCompletion: (input: unknown, signal?: AbortSignal) => Promise<readonly HookFinding[]>;
  /** What the last fresh check answered, or null where none has run. */
  readonly completionCheck: () => CompletionCheck | null;
  /** The shell calls of the invocation now equipped, in order. */
  readonly shellLog: () => readonly ShellCallRecord[];
  /** The submission policy the hook checks name their remedies in; the submission validator names the same one. */
  readonly submissions: HookSubmissionPolicy | undefined;
}

/**
 * The tools, the guard and the post-write hook of one implementation
 * session. An ordinary engineer and a contract sub-session are given the
 * same equipment: what differs between them is the scope they may write
 * and the submission they end with, never what they can do.
 */
export function engineerEquipment(inputs: EngineerEquipmentInputs): EngineerEquipment {
  const projectRoot = realpathSync(inputs.projectRoot);
  const workingDirectory = inputs.workingDirectory ?? projectRoot;
  let seen: FindingsSeen | undefined;
  let hydrateFindings: (() => Promise<void>) | undefined;
  let shellJudge: ToolInputJudge<{ command: string; timeoutMs?: number }> | undefined;
  let shell: ShellTool | undefined;
  /** The invocation now equipped, which the check at completion records against. */
  let current: EquipContext | undefined;
  /** How many checks of this invocation have written a log, which names the next one's. */
  let hookChecks = 0;
  let completion: CompletionCheck | null = null;
  let shellLog: ShellCallRecord[] = [];
  const maxTimeoutMs = inputs.commandTimeoutMs ?? shellMaxTimeoutMs;
  const shellSchema = shellInputSchemaFor(maxTimeoutMs);
  const equip = (session: EquipContext): Equipment => {
    // The findings this invocation has already been told about, so a
    // hook check reports what is newly introduced and not the same
    // thing at every step.
    seen = new FindingsSeen();
    current = session;
    // A log is numbered in its basename alone: the directories above it
    // carry the plan and run identities, whose own digits are no count.
    hookChecks = Math.max(0, ...session.observations.observations.filter(item => item.type === 'hook-check').map(item => {
      const log = item.data.log;
      const match = log === null ? null : /(\d+)\D*$/u.exec(basename(log));
      return match === null ? 0 : Number(match[1]);
    }));
    completion = null;
    shellLog = [];
    const standing = seen;
    let hydration: Promise<void> | undefined;
    const hydrate = () => hydration ??= (async () => {
      for (const observation of session.observations.observations) {
        if (observation.type === 'mutation') standing.wrote(observation.data.paths);
        if (observation.type !== 'hook-check' || observation.data.provider === null || observation.data.log === null) continue;
        const check = observation.data;
        const bytes = await readFile(check.log!, 'utf8');
        const report = storedHookDocument(bytes) as { schemaVersion?: unknown; execution?: unknown; outcome?: { execution?: unknown }; removed?: readonly string[] };
        if (report.schemaVersion !== check.provider!.schema) throw new Error('Original hook evidence is missing or changed; standing findings cannot be recovered safely');
        const findings = findingsOf(report);
        const established = check.outcome !== 'not-checked';
        const evaluated = report.execution === 'completed' || report.outcome?.execution === 'completed';
        standing.settle({ covered: !established ? [] : check.mode === 'complete' ? 'all' : check.dispositions.filter(path => path.disposition === 'checked').map(path => path.path),
          removed: established && evaluated ? report.removed ?? [] : [] }, findings, evaluated || !established);
        standing.admit(findings);
      }
    })();
    const calls = new Map<number, ShellCallRecord>();
    // What each guarded call resolved to, which is what the mutation
    // observation of that call names.
    const queued = new Set<AbortController>();
    const admitted = new Map<string, { lease: MutationLease; before: MutationSnapshot; reservation: HookCheckReservation; resolved: string | null }>();
    const commandIds = new Map<unknown, string[]>();
    const shellReservations = new Map<number, HookCheckReservation>();
    let stopping = false;
    const observe = async (callId: string, tool: string, failed: boolean, change: MutationChange, lease: MutationLease, reservation: HookCheckReservation, signal?: AbortSignal) => {
      await hydrate();
      const paths = change.kind === 'known' ? change.paths : null;
      await session.observations.record({ type: 'mutation', data: { callId, paths: [...paths ?? []], added: null, deleted: null, observedBy: 'tool', toolFailed: failed, attributable: paths !== null } });
      const hook = await runHookCheck({ ramify: inputs.ramify, projectRoot, change, lease, reservation, submissions: inputs.submissions,
        hookTimeoutMs: inputs.commands.hookTimeoutMs, seen: seen!, ran: hookChecks, signal,
        logFile: check => inputs.outputPath('hook', session.invocation, check) });
      hookChecks += hook.checks.filter(check => check.log !== null).length;
      for (const check of hook.checks) await session.observations.record({ type: 'hook-check', data: observedCheck(check) });
      for (const gap of hook.gaps) await session.observations.record({ type: 'coverage-gap', data: gap });
      const reminders = session.reminders();
      session.transcript?.note({ kind: 'post-write-check', callId, atCompletion: false, checks: hook.checks, text: hook.text });
      for (const text of reminders) session.transcript?.note({ kind: 'read-reminder', callId, text });
      const text = [hook.text, ...reminders].filter(line => line !== null && line !== '').join('\n\n');
      return text === '' ? null : { text };
    };
    hydrateFindings = hydrate;
    let shellGapRecorded = false;
    // A command run for the session is the harness's work and not the
    // session's silence, so each one holds the idle bound for its own
    // timeout while it runs.
    const held = heldCommands(inputs.commandExecution ?? runCommand, session.hold);
    const commandExecution: CommandRunner = request => held({
      ...request,
      ...(inputs.registerProcessGroup === undefined ? {} : {
        registerProcessGroup: (pid: number, identity: string | null) => inputs.registerProcessGroup!(session.invocation, pid, identity),
      }),
    });

    shellJudge = new ToolInputJudge({
      tool: shellToolName,
      bound: inputs.bounds.rejectedToolInputsPerTurn,
      validate: input => validateAgainst(shellSchema, input),
      observations: session.observations,
    });
    shell = createShellTool({
      commandExecution,
      focusedCommands: inputs.focusedCommands,
      maxTimeoutMs,
      mutation: {
        worktree: projectRoot,
        reserve: call => shellReservations.set(call.call, seen!.reserveCheck(hookChecks)),
        snapshot: async () => { await hydrate(); return projectMutationSnapshot(projectRoot); },
        settled: (call, result, change, lease, signal) => observe(call.callId!, shellToolName, result.exitCode !== 0, change, lease, shellReservations.get(call.call)!, signal),
      },
      workingDirectory,
      callId: input => {
        const ids = commandIds.get(input);
        const id = ids?.shift();
        if (ids?.length === 0) commandIds.delete(input);
        return id ?? session.callId(shellToolName);
      },
      judge: (input, callId) => shellJudge!.judge(input, callId ?? session.callId(shellToolName)),
      refused: async explanation => {
        await session.observations.record({ type: 'activity', data: { activity: { kind: 'tool-error', callId: session.callId(shellToolName), tool: shellToolName, error: explanation } } });
      },
      outputFile: call => inputs.outputPath('shell', session.invocation, call),
      // The call itself is already an `activity` observation holding
      // the command text, recorded from the port's own event before
      // the command runs. What is added here is the gap that qualifies
      // the guarding counts: this invocation wrote through a tool no
      // guard judged. The line counts need no such gap, since they are
      // the net change the tree shows afterwards.
      starting: async call => {
        // The complete output is a file of the invocation, which the
        // call's result in the transcript names rather than copies.
        session.transcript?.output(call.callId!, call.outputFile);
        const record: ShellCallRecord = {
          callId: call.callId!, call: call.call, command: call.command, timeoutMs: call.timeoutMs,
          outputFile: call.outputFile, startedAt: Date.now(), endedAt: null,
        };
        calls.set(call.call, record);
        shellLog.push(record);
        if (shellGapRecorded) return;
        shellGapRecorded = true;
        await session.observations.record({
          type: 'coverage-gap',
          data: {
            kind: 'unguarded-shell',
            detail: 'this invocation ran commands through the shell, whose writes pass no guard; what they changed is seen only in the tree afterwards',
          },
        });
      },
      ended: async call => {
        const record = calls.get(call.call);
        if (record !== undefined) record.endedAt = Date.now();
      },
    });

    return {
      builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
      settle: async () => {
        stopping = true;
        // Refuse queued guards before awaiting drainage; active guards keep their lease.
        for (const controller of queued) controller.abort();
        await shell!.settle();
      },
      drained: async () => { for (const entry of admitted.values()) entry.lease.release(); admitted.clear(); },
      tools: [shell.definition],
      guard: async call => {
        if (call.action.kind === 'command') {
          await hydrate();
          commandIds.set(call.input, [...commandIds.get(call.input) ?? [], call.callId]);
          // The shell declares itself mutating so that the hook check
          // runs after it, but a command names no target to judge: its
          // writes are unguarded by design, seen afterwards in the tree
          // and reported in `outsideScope`. Nothing here prevents them.
          return { allow: true };
        }
        if (stopping) return { allow: false, text: 'The equipment is stopped.' };
        const reservation = seen!.reserveCheck(hookChecks);
        const controller = new AbortController();
        queued.add(controller);
        let lease: MutationLease;
        try { lease = await sharedMutationOrder.acquire(projectRoot, controller.signal); }
        catch { return { allow: false, text: 'The queued write was cancelled before execution.' }; }
        finally { queued.delete(controller); }
        try {
          if (stopping) { lease.release(); return { allow: false, text: 'The equipment is stopped.' }; }
          await hydrate();
          const decision = await decideWrite(inputs.guarded, workingDirectory, call.action);
          await session.observations.record({ type: 'guard', data: {
            callId: call.callId, tool: call.tool, requested: decision.requested, resolved: decision.resolved,
            owner: decision.resolved === null ? null : ownerOf(inputs.index(), relative(projectRoot, decision.resolved)),
            scopeRevision: inputs.scopeRevision, verdict: decision.verdict, reason: decision.reason,
          } });
          if (decision.verdict !== 'allowed') {
            lease.release();
            const text = blockExplanation(decision, inputs.guarded);
            session.transcript?.note({ kind: 'guard-denied', callId: call.callId, tool: call.tool, verdict: decision.verdict, requested: decision.requested, reason: decision.reason, text });
            return { allow: false, text };
          }
          admitted.set(call.callId, { lease, before: await projectMutationSnapshot(projectRoot), reservation, resolved: decision.resolved });
          return { allow: true };
        } catch (error) { lease.release(); throw error; }
      },
      afterMutation: async call => {
        // Commands already check under the shell's execution lease.
        if (call.action.kind === 'command') return null;
        const entry = admitted.get(call.callId);
        if (entry === undefined) throw new Error('Executed guarded mutation has no admitted lease');
        try {
          const observed = call.failed ? { kind: 'unknown' as const, reason: 'mutating handler failed' }
            : changesBetween(entry.before, await projectMutationSnapshot(projectRoot));
          // A built-in edit or write that succeeded wrote the one path the
          // guard resolved and nothing else: that is the tool's contract,
          // not the agent's claim, so it stands as the changed set where
          // the tree inventory could not be compared.
          const change: MutationChange = observed.kind === 'unknown' && !call.failed && entry.resolved !== null ? { kind: 'known', paths: [entry.resolved] } : observed;
          return await observe(call.callId, call.tool, call.failed, change, entry.lease, entry.reservation);
        } finally { admitted.delete(call.callId); entry.lease.release(); }
      },
    };
  };
  /**
   * The fresh check one claimed completion is judged against. It runs while
   * the session is still open, so the engineer can act on the answer, and it
   * covers the write scope rather than the paths the mutations named. A
   * check that could not run leaves the findings the hook checks saw as they
   * were: the submission proceeds to the gate, whose complete check answers.
   */
  const findingsAtCompletion = async (input: unknown, signal?: AbortSignal): Promise<readonly HookFinding[]> => {
    const standing = seen;
    const session = current;
    const claimed = typeof input === 'object' && input !== null ? (input as { readonly kind?: unknown }).kind : undefined;
    if (claimed !== 'completion-proposed' || standing === undefined || session === undefined) return standing?.open() ?? [];

    const record = async (check: HookCheck) => {
      await session.observations.record({ type: 'hook-check', data: { ...observedCheck(check), atCompletion: true } });
      session.transcript?.note({ kind: 'post-write-check', callId: null, atCompletion: true, checks: [check], text: null });
    };
    const notChecked = async (reason: string): Promise<readonly HookFinding[]> => {
      completion = { kind: 'not-checked', reason };
      await record({ paths: [], mode: 'changed', outcome: 'not-checked', reason, newFindings: 0, log: null, provider: null, dispositions: [] });
      return standing.open();
    };

    const reservation = standing.reserveCheck(hookChecks);
    // Unsafe original evidence cannot silently become an empty standing-findings set.
    await hydrateFindings?.();
    // Completion is an independent complete check, including empty/config-only scopes.
    return sharedMutationOrder.run(projectRoot, async lease => {
      const outcome = await runHookCheck({ ramify: inputs.ramify, projectRoot, paths: null, purpose: 'completion', lease, reservation,
        submissions: inputs.submissions, signal, hookTimeoutMs: completionCheckDeadlineMs, seen: standing,
        ran: hookChecks, relayNotices: false, logFile: check => inputs.outputPath('hook', session.invocation, check) })
        .catch(error => ({ checks: [], gaps: [], text: null, failure: message(error) }));
      if ('failure' in outcome) return notChecked(`the check could not be run: ${outcome.failure}`);
      hookChecks += outcome.checks.filter(check => check.log !== null).length;
      for (const check of outcome.checks) await record(check);
      for (const gap of outcome.gaps) await session.observations.record({ type: 'coverage-gap', data: gap });
      const answered = outcome.checks.find(check => check.outcome !== 'not-checked');
      completion = answered === undefined
        ? { kind: 'not-checked', reason: outcome.checks[0]?.reason ?? 'the check did not answer' }
        : { kind: 'checked' };
      return standing.open();
    }, signal).catch(error => notChecked(`the check could not be admitted: ${message(error)}`));
  };

  return {
    equip,
    exhausted: () => shellJudge?.exhausted === true,
    openFindings: () => seen?.open() ?? [],
    findingsAtCompletion,
    completionCheck: () => completion,
    shellLog: () => shellLog,
    submissions: inputs.submissions,
  };
}

/** Stable relevant-project inventory: additions, deletion and configuration bytes are included.
 * Execution output, installed dependencies and generated views are outside this observation scope.
 * A symlink is identified by its target and is not followed; unreadable/unsupported entries are
 * uncertainty, never proof of emptiness. */
export async function projectMutationSnapshot(projectRoot: string): Promise<MutationSnapshot> {
  const excluded = new Set(['.git', 'node_modules', '.ramify', '.ramify-architect']);
  const files: Record<string, string> = {};
  try {
    const root = await realpath(projectRoot);
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const name = relative(root, path).split(sep).join('/');
        if (/^plans\/(?:[^/]+\/)?\.harness(?:\/|$)/u.test(name) || excluded.has(entry.name)) continue;
        if (entry.isSymbolicLink()) files[name] = `symlink:${await readlink(path)}`;
        else if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) files[name] = createHash('sha256').update(await readFile(path)).digest('hex');
        else throw new Error(`unsupported filesystem entry: ${name}`);
      }
    };
    await walk(root);
    return { kind: 'complete', scopeIdentity: `project-content-v1:${root}:exclude=.git,node_modules,.ramify,.ramify-architect,plans/.harness,plans/<plan>/.harness`, files };
  } catch (error) { return { kind: 'unknown', reason: `complete project inventory unavailable: ${message(error)}` }; }
}

/** The log holds JSON stdout followed by optional stderr. Read the one original JSON value. */
function storedHookDocument(bytes: string): unknown {
  let depth = 0; let quoted = false; let escaped = false;
  const start = bytes.search(/\S/u);
  if (start < 0 || bytes[start] !== '{') throw new Error('Original hook evidence is not a JSON object');
  for (let index = start; index < bytes.length; index++) {
    const character = bytes[index]!;
    if (quoted) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') quoted = false; continue; }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') { if (--depth === 0) return JSON.parse(bytes.slice(start, index + 1)); }
  }
  throw new Error('Original hook evidence is incomplete');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A command runner whose every command holds an invocation's idle bound
 * while it runs, for its own timeout. Without a hold it is the runner itself.
 */
export function heldCommands(runner: CommandRunner, hold: ((timeoutMs: number) => () => void) | undefined): CommandRunner {
  if (hold === undefined) return runner;
  return async request => {
    const release = hold(request.timeoutMs);
    try {
      return await runner(request);
    } finally {
      release();
    }
  };
}

/** One hook check as its observation records it: the project verdict, and each named path's own disposition. */
function observedCheck(check: HookCheck) {
  return {
    ...check,
    paths: [...check.paths],
    provider: check.provider === null ? null : { ...check.provider },
    dispositions: check.dispositions.map(path => ({ ...path, exclusion: path.exclusion === null ? null : { ...path.exclusion } })),
  };
}
