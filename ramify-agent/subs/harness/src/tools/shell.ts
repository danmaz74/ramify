import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { z } from 'zod';
import type { JsonSchema, ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import { childEnvironment, runCommand, type CommandOutcome } from '../../subs/evidence/src/run-command.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { classifyShellTestRun, shellTestDirectories } from './shell-tests.js';

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
  readonly judge: (input: unknown) => Promise<{ readonly ok: true } | { readonly ok: false; readonly text: string }>;
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
      'Whole-suite Vitest and Cucumber runs are refused. Name test files or use `run_scope_tests`.',
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
      const judged = await options.judge(input);
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
      const testRun = classifyShellTestRun(request.command, { workingDirectory: options.workingDirectory, testScripts });
      if (testRun.kind === 'whole-suite') {
        const explanation = `Refused, nothing ran: \`${testRun.segment}\` runs the project's whole test suite (${testRun.reason}). The whole suite is not run from \`shell\`: it runs through ramify-audit at the gates, a full run takes minutes and waits behind every other suite run on this machine, and it verifies far more than this iteration is judged on. Call \`run_scope_tests\` to run the tests this iteration is judged on. To run particular tests, name their files: \`npx vitest run <path/to/file.test.ts> …\` or \`npm test -- <path/to/file.test.ts>\`. Watch mode is refused for the same reason: it never ends on its own.`;
        await options.refused?.(explanation);
        return { isError: true, text: explanation };
      }

      calls += 1;
      const call: ShellCall = {
        call: calls,
        command: request.command,
        timeoutMs: request.timeoutMs ?? defaultTimeoutMs,
        outputFile: options.outputFile(calls),
      };
      await options.starting(call);

      const controller = new AbortController();
      const done = (options.commandExecution ?? runCommand)({
        argv: ['bash', '-c', request.command],
        cwd: options.workingDirectory,
        env: childEnvironment(),
        timeoutMs: call.timeoutMs,
        outputFile: call.outputFile,
        signal: signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]),
      });
      const entry: Running = { controller, done };
      running.add(entry);
      let completed;
      try {
        completed = await done;
      } finally {
        running.delete(entry);
      }

      const exitCode = completed.outcome.kind === 'completed' ? completed.outcome.exitCode : null;
      await options.ended(call, { outcome: completed.outcome, exitCode, elapsedMs: completed.elapsedMs });

      return {
        isError: exitCode !== 0,
        text: [
          `$ ${request.command}`,
          describeOutcome(completed.outcome, call.timeoutMs),
          `Elapsed ${(completed.elapsedMs / 1000).toFixed(1)} s. Complete output: ${call.outputFile} (${completed.output.bytes} bytes${completed.output.truncated ? ', truncated at the cap' : ''}).`,
          '',
          completed.output.tail,
        ].join('\n'),
      };
    },
  };

  return {
    definition,
    get calls() {
      return calls;
    },
    async settle(): Promise<void> {
      const pending = [...running];
      for (const entry of pending) entry.controller.abort();
      await Promise.allSettled(pending.map(entry => entry.done));
    },
  };
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
