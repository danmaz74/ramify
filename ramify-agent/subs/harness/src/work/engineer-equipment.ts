import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type {
  BuiltinTool, GuardedCall, GuardDecision, SettledMutation, ToolDefinition, WriteTool,
} from '../../subs/agent/src/interfaces/port.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { ProjectCommands } from '../checks/checkpoint.js';
import type { TestSelectionPolicy } from '../checks/records.js';
import { blockExplanation, decideWrite, type GuardedScope } from '../guard/write-guard.js';
import {
  completionCheckDeadlineMs, completionCheckFileLimit, FindingsSeen, runHookCheck, type HookFinding,
} from '../hooks/post-write.js';
import { ownerOf } from '../kpi/lines.js';
import type { ObservationLog } from '../run/observations.js';
import { ToolInputJudge, validateAgainst } from '../run/submissions.js';
import { createShellTool, shellInputSchema, shellToolName, type ShellTool } from '../tools/shell.js';
import { createScopeTestsTool, scopeTestsInputSchema, scopeTestsToolName } from './engineer.js';

/*
 * The equipment of one implementation session: the shell, the scoped test
 * tool, the write guard and the hook check that runs after each mutating
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
}

/** Everything the engineer equipment is built from; none of it names a run. */
export interface EngineerEquipmentInputs {
  /** External command execution. Tests script outcomes; actual process tests use the default. */
  readonly commandExecution?: CommandRunner | undefined;
  readonly projectRoot: string;
  /** The Ramify command line the hook check runs. */
  readonly ramify: RamifyCli;
  /** The project's own commands: the scoped test run's template and the hook check's timeout. */
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
  /** The tests the scoped test tool resolves on each call. */
  readonly tests: TestSelectionPolicy;
  /** Where one invocation's numbered shell output or hook-check log is written. */
  readonly outputPath: (kind: 'shell' | 'hook', invocation: string, number: number) => string;
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
  readonly shellCalls: () => number;
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
  readonly findingsAtCompletion: (input: unknown) => Promise<readonly HookFinding[]>;
  /** What the last fresh check answered, or null where none has run. */
  readonly completionCheck: () => CompletionCheck | null;
}

/**
 * The tools, the guard and the post-write hook of one implementation
 * session. An ordinary engineer and a contract sub-session are given the
 * same equipment: what differs between them is the scope they may write
 * and the submission they end with, never what they can do.
 */
export function engineerEquipment(inputs: EngineerEquipmentInputs): EngineerEquipment {
  const { projectRoot } = inputs;
  let seen: FindingsSeen | undefined;
  let toolJudge: ToolInputJudge<Record<string, never>> | undefined;
  let shellJudge: ToolInputJudge<{ command: string; timeoutMs?: number }> | undefined;
  let shell: ShellTool | undefined;
  /** The invocation now equipped, which the check at completion records against. */
  let current: EquipContext | undefined;
  /** How many checks of this invocation have written a log, which names the next one's. */
  let hookChecks = 0;
  let completion: CompletionCheck | null = null;
  const equip = (session: EquipContext): Equipment => {
    // The findings this invocation has already been told about, so a
    // hook check reports what is newly introduced and not the same
    // thing at every step.
    seen = new FindingsSeen();
    current = session;
    hookChecks = 0;
    completion = null;
    // What each guarded call resolved to, which is what the mutation
    // observation of that call names.
    const mutated = new Map<string, string[]>();
    let shellGapRecorded = false;

    shellJudge = new ToolInputJudge({
      tool: shellToolName,
      bound: inputs.bounds.rejectedToolInputsPerTurn,
      validate: input => validateAgainst(shellInputSchema, input),
      observations: session.observations,
    });
    shell = createShellTool({
      commandExecution: inputs.commandExecution,
      workingDirectory: projectRoot,
      judge: input => shellJudge!.judge(input, session.callId(shellToolName)),
      outputFile: call => inputs.outputPath('shell', session.invocation, call),
      // The call itself is already an `activity` observation holding
      // the command text, recorded from the port's own event before
      // the command runs. What is added here is the gap that qualifies
      // every later count: this invocation wrote through a tool no
      // guard judged.
      starting: async () => {
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
      ended: async () => undefined,
    });

    toolJudge = new ToolInputJudge({
      tool: scopeTestsToolName,
      bound: inputs.bounds.rejectedToolInputsPerTurn,
      validate: input => validateAgainst(scopeTestsInputSchema, input),
      observations: session.observations,
    });
    return {
      builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
      settle: () => shell!.settle(),
      tools: [shell.definition, createScopeTestsTool({
        commandExecution: inputs.commandExecution,
        projectRoot,
        commands: inputs.commands,
        policy: inputs.tests,
        refresh: inputs.refresh,
        judge: input => toolJudge!.judge(input, session.callId(scopeTestsToolName)),
        observe: async observation => {
          await session.observations.record({
            type: 'scope-tests',
            data: {
              callId: session.callId(scopeTestsToolName),
              resolved: [...observation.resolved],
              outcome: observation.outcome,
              notVerified: observation.notVerified,
              exitCode: observation.exitCode,
              elapsedMs: observation.elapsedMs,
            },
          });
        },
      })],
      guard: async call => {
        if (call.tool === shellToolName) {
          // The shell declares itself mutating so that the hook check
          // runs after it, but it names no target to judge: its writes
          // are unguarded by design, seen afterwards in the tree and
          // reported in `outsideScope`. Nothing here prevents them.
          return { allow: true };
        }
        const decision = await decideWrite(inputs.guarded, projectRoot, call.input);
        await session.observations.record({
          type: 'guard',
          data: {
            callId: call.callId,
            tool: call.tool,
            requested: decision.requested,
            resolved: decision.resolved,
            owner: decision.resolved === null ? null : ownerOf(inputs.index(), relative(projectRoot, decision.resolved)),
            scopeRevision: inputs.scopeRevision,
            verdict: decision.verdict,
            reason: decision.reason,
          },
        });
        if (decision.verdict === 'allowed' && decision.resolved !== null) {
          mutated.set(call.callId, [relative(projectRoot, decision.resolved)]);
        }
        return decision.verdict === 'allowed'
          ? { allow: true }
          : { allow: false, text: blockExplanation(decision, inputs.guarded) };
      },
      afterMutation: async call => {
        // The mutation is observed whether the tool succeeded or not.
        // The shell's changed set is unknown, which is a different
        // thing from an empty one and is recorded as such.
        const paths = call.tool === shellToolName ? null : mutated.get(call.callId) ?? null;
        await session.observations.record({
          type: 'mutation',
          data: {
            callId: call.callId,
            paths: paths ?? [],
            added: null,
            deleted: null,
            observedBy: 'tool',
            toolFailed: call.failed,
            attributable: paths !== null,
          },
        });
        const hook = await runHookCheck({
          ramify: inputs.ramify,
          projectRoot,
          paths,
          hookTimeoutMs: inputs.commands.hookTimeoutMs,
          seen: seen!,
          ran: hookChecks,
          logFile: check => inputs.outputPath('hook', session.invocation, check),
        }).catch(error => ({
          checks: [{
            paths: paths ?? [], mode: 'changed' as const, outcome: 'not-checked' as const,
            reason: `the hook check could not be run: ${message(error)}`, newFindings: 0, log: null,
          }],
          gaps: [],
          text: `Ramify hook check: it could not be run (${message(error)}). Nothing was verified.`,
        }));
        hookChecks += hook.checks.filter(check => check.log !== null).length;
        for (const check of hook.checks) {
          await session.observations.record({ type: 'hook-check', data: { ...check, paths: [...check.paths] } });
        }
        for (const gap of hook.gaps) await session.observations.record({ type: 'coverage-gap', data: gap });
        const text = [hook.text, ...session.reminders()].filter(line => line !== null && line !== '').join('\n\n');
        return text === '' ? null : { text };
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
  const findingsAtCompletion = async (input: unknown): Promise<readonly HookFinding[]> => {
    const standing = seen;
    const session = current;
    const claimed = typeof input === 'object' && input !== null ? (input as { readonly kind?: unknown }).kind : undefined;
    if (claimed !== 'completion-proposed' || standing === undefined || session === undefined) return standing?.open() ?? [];

    const record = async (check: {
      readonly paths: readonly string[]; readonly mode: 'changed' | 'complete';
      readonly outcome: 'passed' | 'findings' | 'not-checked'; readonly reason: string | null;
      readonly newFindings: number; readonly log: string | null;
    }) => {
      await session.observations.record({ type: 'hook-check', data: { ...check, paths: [...check.paths], atCompletion: true } });
    };
    const notChecked = async (reason: string): Promise<readonly HookFinding[]> => {
      completion = { kind: 'not-checked', reason };
      await record({ paths: [], mode: 'changed', outcome: 'not-checked', reason, newFindings: 0, log: null });
      return standing.open();
    };

    const scope = await writeScopeSource(projectRoot, inputs.guarded);
    if (scope.length === 0) return notChecked('the write scope holds no source file to check');
    if (scope.length > completionCheckFileLimit) {
      return notChecked(`the write scope holds ${scope.length} source files, more than the ${completionCheckFileLimit} one check is given`);
    }
    const outcome = await runHookCheck({
      ramify: inputs.ramify,
      projectRoot,
      paths: scope,
      hookTimeoutMs: completionCheckDeadlineMs,
      seen: standing,
      ran: hookChecks,
      logFile: check => inputs.outputPath('hook', session.invocation, check),
    }).catch(error => ({ checks: [], gaps: [], text: null, failure: message(error) }));
    if ('failure' in outcome) return notChecked(`the check could not be run: ${outcome.failure}`);

    hookChecks += outcome.checks.filter(check => check.log !== null).length;
    for (const check of outcome.checks) await record(check);
    const answered = outcome.checks.find(check => check.outcome !== 'not-checked');
    if (answered === undefined) {
      completion = { kind: 'not-checked', reason: outcome.checks[0]?.reason ?? 'the check did not answer' };
      return standing.open();
    }
    completion = { kind: 'checked' };
    return standing.open();
  };

  return {
    equip,
    exhausted: () => toolJudge?.exhausted === true || shellJudge?.exhausted === true,
    shellCalls: () => shell?.calls ?? 0,
    openFindings: () => seen?.open() ?? [],
    findingsAtCompletion,
    completionCheck: () => completion,
  };
}

/** Whether this file is source a Ramify check reads. */
function isSource(name: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/.test(name);
}

/** Directories no check of a write scope descends into. */
const skipped = new Set(['node_modules', '.git', '.ramify', 'dist', 'coverage']);

/**
 * The write scope's own source files, project-relative, as the changed check
 * takes them: everything beneath its roots and every file of it that is
 * source. It reads the tree as it stands, so a file the session has just
 * created is in it.
 */
async function writeScopeSource(projectRoot: string, guarded: GuardedScope): Promise<string[]> {
  const found = new Set<string>();
  const shorten = (path: string) => relative(projectRoot, path).split(sep).join('/');
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name)) await walk(join(directory, entry.name));
      } else if (entry.isFile() && isSource(entry.name)) {
        found.add(shorten(join(directory, entry.name)));
      }
    }
  };
  for (const root of guarded.roots) await walk(root);
  for (const file of guarded.files) if (isSource(file)) found.add(shorten(file));
  return [...found].filter(path => path !== '' && !path.startsWith('../')).sort();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
