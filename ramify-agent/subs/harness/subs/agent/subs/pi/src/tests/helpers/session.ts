import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentEvent,
  AgentPort,
  AgentSession,
  ContextPolicy,
  GuardedCall,
  SessionSpec,
  SettledMutation,
  SubmissionVerdict,
  ToolAction,
  ToolDefinition,
} from '../../../../../src/interfaces/port.js';
import { createPiAgentOn } from '../../pi-agent.js';
import { scriptedProvider, scriptedRuntime, type ReplyStep, type ScriptedProvider } from './scripted-provider.js';

/*
 * A real pi session over the scripted provider, for the tests of the port
 * additions. Nothing here reaches a network or the person's pi directory:
 * every session runs in a temporary agent directory with `PI_OFFLINE=1`.
 */

/** A context policy with no budget and compaction permitted. */
export const unbounded: ContextPolicy = { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };

export const submissionSchema = {
  type: 'object',
  properties: { summary: { type: 'string' }, modules: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'modules'],
  additionalProperties: false,
};

export const validMap = { summary: 'A change', modules: ['demo'] };

export interface PiHarness {
  readonly agent: AgentPort;
  readonly session: AgentSession;
  readonly spec: SessionSpec;
  readonly events: AgentEvent[];
  readonly judged: unknown[];
  readonly guarded: Array<{ readonly callId: string; readonly tool: string; readonly input: unknown; readonly action: ToolAction }>;
  readonly settledMutations: Array<{ readonly callId: string; readonly tool: string; readonly action: ToolAction; readonly failed: boolean }>;
  readonly scripted: ScriptedProvider;
  readonly workingDirectory: string;
  readonly sessionDirectory: string;
  /** Everything the model was sent on request `index`, flattened. */
  requestText(index: number): string;
  /** The tool names offered on request `index`. */
  toolNames(index: number): readonly string[];
}

export interface PiOptions {
  /** The role the session plays; every writer role installs the same guard. */
  readonly role?: string | undefined;
  readonly verdicts?: SubmissionVerdict[] | undefined;
  readonly tools?: ToolDefinition[] | undefined;
  readonly systemPrompt?: string | undefined;
  readonly prompt?: string | undefined;
  readonly session?: SessionSpec['session'] | undefined;
  readonly context?: ContextPolicy | undefined;
  readonly builtinTools?: SessionSpec['builtinTools'] | undefined;
  /** The model as the adapter is given it; default `scripted/scripted-1`. */
  readonly model?: string | undefined;
  /** Whether the scripted model supports thinking. */
  readonly reasoning?: boolean | undefined;
  /** The model's context window, small enough to reach a threshold cheaply. */
  readonly contextWindow?: number | undefined;
  /** pi's own compaction thresholds. */
  readonly compaction?: { readonly reserveTokens?: number | undefined; readonly keepRecentTokens?: number | undefined } | undefined;
  readonly settleMs?: number | undefined;
  /** pi's first delay before it retries a failed model call. */
  readonly retryDelayMs?: number | undefined;
  /** The scripted model's rates per million tokens. */
  readonly cost?: { readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number } | undefined;
  /** Tool names the guard denies, with the text the denial returns. */
  readonly deny?: Record<string, string> | undefined;
  readonly guard?: boolean | undefined;
  /** A guard of the caller's own, which decides each call however it likes. */
  readonly decide?: ((call: GuardedCall) => Promise<{ readonly allow: true } | { readonly allow: false; readonly text: string }>) | undefined;
  /** The text `afterMutation` appends to a settled call's result. */
  readonly hookCheck?: string | undefined;
  /** Reuses an existing working and session directory, for a second session over the same files. */
  readonly reuse?: { readonly workingDirectory: string; readonly sessionDirectory: string } | undefined;
  /** Files to create in the working directory before the session runs. */
  readonly files?: Record<string, string> | undefined;
}

/** A disposable working directory with a `module.ramify` and whatever files a test asks for. */
export async function workspace(cleanups: Array<() => Promise<void>>, files: Record<string, string> = {}): Promise<{ workingDirectory: string; sessionDirectory: string }> {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-cwd-'));
  cleanups.push(() => rm(workingDirectory, { recursive: true, force: true }));
  await writeFile(join(workingDirectory, 'module.ramify'), 'ramify 1\nmodule demo\n');
  for (const [name, content] of Object.entries(files)) await writeFile(join(workingDirectory, name), content);
  const sessionDirectory = join(workingDirectory, 'session');
  await mkdir(sessionDirectory);
  return { workingDirectory, sessionDirectory };
}

/** Starts one real pi session on the scripted provider. */
export async function startPi(cleanups: Array<() => Promise<void>>, steps: readonly ReplyStep[], options: PiOptions = {}): Promise<PiHarness> {
  const places = options.reuse ?? await workspace(cleanups, options.files ?? {});
  if (options.reuse !== undefined && options.files !== undefined) {
    for (const [name, content] of Object.entries(options.files)) await writeFile(join(places.workingDirectory, name), content);
  }

  const scripted = scriptedProvider(steps, {
    ...(options.contextWindow === undefined ? {} : { contextWindow: options.contextWindow }),
    ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning }),
    ...(options.cost === undefined ? {} : { cost: options.cost }),
  });
  const isolated = await scriptedRuntime(scripted);
  cleanups.push(isolated.remove);
  const agent = createPiAgentOn({
    agentDirectory: isolated.agentDirectory,
    model: options.model ?? 'scripted/scripted-1',
    settleMs: options.settleMs ?? 5_000,
    compaction: options.compaction,
    retryDelayMs: options.retryDelayMs,
    runtime: async () => isolated.runtime,
  });

  const events: AgentEvent[] = [];
  const judged: unknown[] = [];
  const guarded: PiHarness['guarded'] = [];
  const settledMutations: PiHarness['settledMutations'] = [];
  const verdicts = [...(options.verdicts ?? [])];
  const deny = options.deny ?? {};
  const spec: SessionSpec = {
    role: options.role ?? 'engineer',
    scope: { workingDirectory: places.workingDirectory },
    systemPrompt: options.systemPrompt ?? 'You are the engineer. Exactly this prompt.',
    prompt: options.prompt ?? 'Do the work.',
    session: options.session ?? { mode: 'fresh' },
    context: options.context ?? unbounded,
    builtinTools: options.builtinTools ?? ['read', 'grep', 'ls'],
    tools: options.tools ?? [],
    submission: {
      name: 'submit_implementation_map',
      description: 'Submit the map.',
      inputSchema: submissionSchema,
      accept: async input => {
        judged.push(input);
        return verdicts.shift() ?? { accepted: true };
      },
    },
    sessionDirectory: places.sessionDirectory,
    ...(options.guard === true || options.decide !== undefined || Object.keys(deny).length > 0
      ? {
          guard: async (call: GuardedCall) => {
            guarded.push({ callId: call.callId, tool: call.tool, input: call.input, action: call.action });
            if (options.decide !== undefined) return options.decide(call);
            const text = deny[call.tool];
            return text === undefined ? { allow: true as const } : { allow: false as const, text };
          },
        }
      : {}),
    ...(options.hookCheck === undefined
      ? {}
      : {
          afterMutation: async (call: SettledMutation) => {
            settledMutations.push({ callId: call.callId, tool: call.tool, action: call.action, failed: call.failed });
            return { text: options.hookCheck as string };
          },
        }),
    onEvent: event => events.push(event),
  };

  const session = agent.startSession(spec);
  cleanups.push(async () => { await Promise.race([session.stop(), delay(2_000)]); });
  return {
    agent, session, spec, events, judged, guarded, settledMutations, scripted,
    workingDirectory: places.workingDirectory,
    sessionDirectory: places.sessionDirectory,
    requestText: index => JSON.stringify(scripted.requests[index]?.messages ?? []),
    toolNames: index => (scripted.requests[index]?.tools ?? []).map(tool => tool.name),
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition');
    await delay(10);
  }
}
