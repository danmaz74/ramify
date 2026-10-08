import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { z } from 'zod';
import type { JsonSchema, ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import { childEnvironment, runCommand, type CommandOutcome } from '../../subs/evidence/src/run-command.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { classifyShellTestRun, shellTestDirectories, type FocusedCucumberSelection } from './shell-tests.js';
import { changesBetween, sharedMutationOrder, type MutationChange, type MutationLease, type MutationOrder, type MutationSnapshot } from '../hooks/mutation-order.js';

/*
 * The engineer's shell.
 *
 * By decision 12 of the core records proposal an engineer has a shell, and
 * the implementation's own is withheld: what it receives is this harness
 * tool, run through the lifted executor. The command gets its own process
 * group, a built environment, a bounded timeout and an 8 KiB tail; the
 * complete output is a file beside the invocation's observations. Direct
 * whole-suite Vitest and Cucumber runs are refused before any chained
 * command starts; focused runs use this ordinary command boundary.
 *
 * Its environment is `childEnvironment`'s allowlist, the same one every other
 * child of the harness gets, and this is a decision and not an omission: the
 * command here is one an agent wrote, so an environment wider than the
 * allowlist would hand an arbitrary command every secret of the person's
 * session. A project whose own tooling needs a variable the allowlist does
 * not name would need it added there, for every child at once; whether
 * `shell` alone should receive more is Dan's to decide and is open.
 *
 * What it writes passes no guard. That is the MVP's stated limit, not an
 * oversight: there is no sandbox and no write allowlist, the writes are seen
 * afterwards in `git status`, reported in `InvocationOutcome.outsideScope`,
 * and every invocation that used the shell carries the `unguarded-shell`
 * coverage gap. Zero blocked calls is never proof that every write respected
 * a scope while this tool exists.
 *
 * The tool declares itself mutating, so the post-write hook check runs after
 * it. Its changed set is unknown, which is why that check is a complete one.
 */

export const shellToolName = 'shell';

/** What a command is given when it names no timeout of its own. */
export const shellDefaultTimeoutMs = 120_000;

/**
 * The longest a single command may run, whatever it asks for, unless its
 * iteration's assignment raised it; the run policy's `commandTimeoutMs`
 * holds the same default.
 */
export const shellMaxTimeoutMs = 600_000;

/**
 * The tool's input, strict as rule 10 requires: one command and an optional
 * timeout up to the maximum the session was given. Nothing else, and no
 * field for anything the harness already knows.
 */
export function shellInputSchemaFor(maxTimeoutMs: number) {
  return z.object({
    command: z.string().min(1),
    timeoutMs: z.int().positive().max(maxTimeoutMs).optional(),
  }).strict();
}

/** The input with the shell's own maximum. */
export const shellInputSchema = shellInputSchemaFor(shellMaxTimeoutMs);
export type ShellInput = z.infer<typeof shellInputSchema>;

export const shellJsonSchema = z.toJSONSchema(shellInputSchema) as JsonSchema;

/** What the run observed of one shell call, recorded before the command runs. */
export interface ShellCall {
  /** The call's own number in this invocation, from 1. */
  readonly call: number;
  readonly callId?: string | undefined;
  readonly command: string;
  readonly timeoutMs: number;
  /** The file the complete output is written to. */
  readonly outputFile: string;
}

/** How one shell call ended, from the executor's outcome and never from what it printed. */
export interface ShellResult {
  readonly outcome: CommandOutcome;
  readonly exitCode: number | null;
  readonly elapsedMs: number;
  readonly change?: MutationChange | undefined;
}

/** Integrated callers settle mutation observations and checks before releasing the worktree. */
export interface ShellMutationOptions {
  /** The canonical project root, shared with guarded tools and completion checks. */
  readonly worktree: string;
  readonly order?: MutationOrder | undefined;
  /** Reserve check/log identities synchronously before queueing or executing. */
  readonly reserve?: ((call: ShellCall) => void) | undefined;
  /** Actual complete content identities; omissions or errors remain unknown. */
  readonly snapshot?: (() => Promise<MutationSnapshot>) | undefined;
  readonly settled: (call: ShellCall, result: ShellResult, change: MutationChange, lease: MutationLease, signal: AbortSignal) => Promise<{ readonly text: string } | null>;
}

export interface ShellOptions {
  /** External command execution. Tests script outcomes; actual process tests use the default. */
  readonly commandExecution?: CommandRunner | undefined;
  /** Where the command runs: the invocation's working directory. */
  readonly workingDirectory: string;
  /**
   * Judges the call's input against this tool's own schema. The
   * implementation may have judged it first; the harness judges again
   * whatever reaches it, so it never relies on that having happened.
   */
  readonly callId?: ((input: unknown) => string) | undefined;
  readonly judge: (input: unknown, callId?: string) => Promise<{ readonly ok: true } | { readonly ok: false; readonly text: string }>;
  /** The complete output file of the nth call. */
  readonly outputFile: (call: number) => string;
  /** Records the call before the command runs, so a command that never returns still has its record. */
  readonly starting: (call: ShellCall) => Promise<void>;
  /** Records how the call ended. */
  readonly ended: (call: ShellCall, result: ShellResult) => Promise<void>;
  /** Records a refused whole-suite command as an observation. */
  readonly refused?: ((explanation: string) => Promise<void>) | undefined;
  /** The longest one command may run; the shell's own maximum when absent. */
  readonly maxTimeoutMs?: number | undefined;
  readonly mutation?: ShellMutationOptions | undefined;
  /** Exact prepared commands alone receive the declared runner environment. */
  readonly focusedCommands?: readonly { readonly shellCommand: string; readonly selection: FocusedCucumberSelection;
    readonly environment: Readonly<Record<string, string>>; readonly sourceFiles: Readonly<Record<string, string>> }[] | undefined;
}

/**
 * The shell as the run holds it: the definition the session is given, and
 * the settlement the harness performs before it releases the writer.
 */
export interface ShellTool {
  readonly definition: ToolDefinition;
  /** How many commands this tool has been asked to run. */
  readonly calls: number;
  /**
   * Ends every command still running and waits for it. Aborting the executor
   * sends TERM to the wrapper that leads the command's process group, and
   * the wrapper kills that group, so a descendant the command left behind
   * goes with it.
   */
  settle(): Promise<void>;
}

export function createShellTool(options: ShellOptions): ShellTool {
  interface Running {
    readonly controller: AbortController;
    readonly done: Promise<unknown>;
  }
  const running = new Set<Running>();
  let calls = 0;
  let stopped = false;
  const maxTimeoutMs = options.maxTimeoutMs ?? shellMaxTimeoutMs;
  const inputSchema = shellInputSchemaFor(maxTimeoutMs);
  // A command asked for no timeout of its own gets the default, and never
  // more than the maximum this session was given.
  const defaultTimeoutMs = Math.min(shellDefaultTimeoutMs, maxTimeoutMs);

  const definition: ToolDefinition = {
    name: shellToolName,
    description: [
      'Runs one shell command in the project\'s working directory, in its own process group and with a',
      'built environment. The complete output is kept in a file; you receive the last 8 KiB of it.',
      'What this writes passes no write guard: it is observed afterwards, and a change outside your scope is',
      'reported rather than prevented. Stay inside your scope here as you do with `edit` and `write`.',
      'Whole-suite Vitest and Cucumber runs are refused: the gate\'s audit runs them. Name test files instead.',
      `A command runs for ${defaultTimeoutMs} ms unless \`timeoutMs\` asks for more, up to ${maxTimeoutMs} ms.`,
    ].join(' '),
    inputSchema: z.toJSONSchema(inputSchema) as JsonSchema,
    mutating: true,
    // A shell call is a command; its text is the one field of the input read.
    action: input => {
      const command = typeof input === 'object' && input !== null ? (input as { readonly command?: unknown }).command : undefined;
      return { kind: 'command', command: typeof command === 'string' ? command : null };
    },
    async execute(input: unknown, signal: AbortSignal): Promise<ToolResult> {
      if (stopped || signal?.aborted) return { isError: true, text: 'Cancelled, nothing ran: the shell is stopped.' };
      const callId = options.callId?.(input);
      const judged = await options.judge(input, callId);
      if (!judged.ok) return { isError: true, text: judged.text };
      const request = inputSchema.parse(input);
      const testScripts: Record<string, string | null> = {};
      for (const directory of shellTestDirectories(request.command, options.workingDirectory)) {
        let candidate = directory;
        testScripts[directory] = null;
        while (true) {
          try {
            const manifest = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8')) as { scripts?: { test?: unknown } };
            testScripts[directory] = typeof manifest.scripts?.test === 'string' ? manifest.scripts.test : null;
            break;
          } catch { /* npm searches parent directories for the package too. */ }
          const parent = dirname(candidate);
          if (parent === candidate) break;
          candidate = parent;
        }
      }
      const focused = options.focusedCommands?.find(command => command.shellCommand === request.command);
      const verified = focused !== undefined && await focusedFilesMatch(focused.selection, focused.sourceFiles);
      const testRun = classifyShellTestRun(request.command, { workingDirectory: options.workingDirectory, testScripts,
        focusedCucumber: verified ? [focused!.selection] : [] });
      if (testRun.kind === 'unverified') {
        const text = `Refused, nothing ran: Cucumber selection is unverified (${testRun.reason}). Use the current prepared focused command; paths plus a default profile are not selection evidence.`;
        await options.refused?.(text);
        return { isError: true, text };
      }
      if (testRun.kind === 'whole-suite') {
        const explanation = `Refused, nothing ran: \`${testRun.segment}\` runs the project's whole test suite (${testRun.reason}). The whole suite is not run from \`shell\`: it runs through ramify-audit at the gates, a full run takes minutes and waits behind every other suite run on this machine, and it verifies far more than this iteration is judged on. To run particular tests, name their files: \`npx vitest run <path/to/file.test.ts> …\` or \`npm test -- <path/to/file.test.ts>\`. Watch mode is refused for the same reason: it never ends on its own.`;
        await options.refused?.(explanation);
        return { isError: true, text: explanation };
      }
      if (stopped || signal?.aborted) return { isError: true, text: 'Cancelled, nothing ran: the shell is stopped.' };

      calls += 1;
      const call: ShellCall = {
        call: calls,
        callId,
        command: request.command,
        timeoutMs: request.timeoutMs ?? defaultTimeoutMs,
        outputFile: options.outputFile(calls),
      };
      options.mutation?.reserve?.(call);
      const controller = new AbortController();
      const executionSignal = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);
      const execute = async (lease?: MutationLease): Promise<ToolResult> => {
        executionSignal.throwIfAborted();
        await options.starting(call);
        const before = options.mutation === undefined ? null : await snapshot(options.mutation);
        // Revalidate after queueing and snapshot capture, at the actual process dispatch seam.
        if (focused !== undefined && !await focusedFilesMatch(focused.selection, focused.sourceFiles)) {
          return { isError: true, text: 'Refused, nothing ran: prepared Cucumber configuration or source changed before dispatch.' };
        }
        executionSignal.throwIfAborted();
        const began = Date.now();
        let completed;
        try {
          completed = await (options.commandExecution ?? runCommand)({
            argv: ['bash', '-c', request.command],
            cwd: options.workingDirectory,
            env: verified ? focused!.environment : childEnvironment(),
            timeoutMs: call.timeoutMs,
            outputFile: call.outputFile,
            signal: executionSignal,
          });
        } catch (error) {
          // The production runner returns structured outcomes, but an injected
          // executor can throw after changing files. Observe/settle that case
          // before propagating the original error, without inventing output.
          if (options.mutation !== undefined) {
            await snapshot(options.mutation);
            const change: MutationChange = { kind: 'unknown', reason: 'command executor rejected without established effect settlement' };
            const result: ShellResult = {
              outcome: { kind: 'runner-error', error: { kind: 'executor-rejected', message: error instanceof Error ? error.message : String(error) } },
              exitCode: null, elapsedMs: Date.now() - began, change,
            };
            const settlementErrors: unknown[] = [];
            try { await options.ended(call, result); } catch (failure) { settlementErrors.push(failure); }
            try { await options.mutation.settled(call, result, change, lease!, executionSignal); } catch (failure) { settlementErrors.push(failure); }
            if (settlementErrors.length > 0) throw new AggregateError([error, ...settlementErrors], 'command and mutation settlement failed', { cause: error });
          }
          throw error;
        }
        let change = before === null ? undefined : changesBetween(before, await snapshot(options.mutation!));
        if (change?.kind === 'known' && change.paths.length === 0 && completed.outcome.kind !== 'completed') {
          change = { kind: 'unknown', reason: `${completed.outcome.kind} command has no established complete mutation result` };
        }
        const exitCode = completed.outcome.kind === 'completed' ? completed.outcome.exitCode : null;
        const result: ShellResult = { outcome: completed.outcome, exitCode, elapsedMs: completed.elapsedMs, ...(change === undefined ? {} : { change }) };
        // Failed/cancelled commands may still have changed files. Their check
        // belongs inside this lease, as does its observation settlement.
        let hook: { readonly text: string } | null = null;
        try { await options.ended(call, result); }
        finally {
          if (options.mutation !== undefined) hook = await options.mutation.settled(call, result, change!, lease!, executionSignal);
        }
        return {
          isError: exitCode !== 0,
          text: [
            `$ ${request.command}`,
            describeOutcome(completed.outcome, call.timeoutMs),
            `Elapsed ${(completed.elapsedMs / 1000).toFixed(1)} s. Complete output: ${call.outputFile} (${completed.output.bytes} bytes${completed.output.truncated ? ', truncated at the cap' : ''}).`,
            '',
            completed.output.tail,
            ...(hook === null || hook.text === '' ? [] : ['', hook.text]),
          ].join('\n'),
        };
      };
      const done = options.mutation === undefined ? execute()
        : (options.mutation.order ?? sharedMutationOrder).run(options.mutation.worktree, execute, executionSignal);
      const entry: Running = { controller, done };
      running.add(entry);
      try {
        return await done;
      } finally {
        running.delete(entry);
      }
    },
  };

  return {
    definition,
    get calls() {
      return calls;
    },
    async settle(): Promise<void> {
      stopped = true;
      const pending = [...running];
      for (const entry of pending) entry.controller.abort();
      await Promise.allSettled(pending.map(entry => entry.done));
    },
  };
}

async function snapshot(options: ShellMutationOptions): Promise<MutationSnapshot> {
  if (options.snapshot === undefined) return { kind: 'unknown', reason: 'no complete mutation snapshot was supplied' };
  try {
    return await options.snapshot();
  } catch (error) {
    return { kind: 'unknown', reason: `mutation snapshot unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** How the command ended, in the agent's own terms. */
function describeOutcome(outcome: CommandOutcome, timeoutMs: number): string {
  switch (outcome.kind) {
    case 'completed':
      return `Exit ${outcome.exitCode}.`;
    case 'timed-out':
      return `The command did not finish within ${timeoutMs} ms and was killed with its process group.`;
    case 'cancelled':
      return 'The command was cancelled and killed with its process group.';
    case 'runner-error':
      return `The command could not be run (${outcome.error.kind}): ${outcome.error.message}`;
  }
}

/** Current bytes authenticate both generated selection and its authored source inputs. */
async function focusedFilesMatch(selection: FocusedCucumberSelection, sourceFiles: Readonly<Record<string, string>>): Promise<boolean> {
  try {
    for (const [path, identity] of Object.entries({ ...sourceFiles, [selection.config]: selection.configurationIdentity })) {
      if (createHash('sha256').update(await readFile(path)).digest('hex') !== identity) return false;
    }
    return true;
  } catch { return false; }
}
