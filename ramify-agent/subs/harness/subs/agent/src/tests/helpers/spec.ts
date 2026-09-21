import type { AgentEvent, ContextPolicy, SessionSpec, SubmissionVerdict } from '../../interfaces/port.js';

/** A context policy with no budget and compaction permitted. */
export const unbounded: ContextPolicy = { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };

export interface Probe {
  readonly spec: SessionSpec;
  readonly events: AgentEvent[];
  readonly judged: unknown[];
  /** Every guarded call the port asked about, in order. */
  readonly guarded: Array<{ readonly tool: string; readonly input: unknown }>;
  /** Every mutating call the port reported as settled, in order. */
  readonly settledMutations: Array<{ readonly tool: string; readonly failed: boolean }>;
}

export interface ProbeOptions {
  readonly verdicts?: SubmissionVerdict[] | undefined;
  readonly session?: SessionSpec['session'] | undefined;
  readonly context?: ContextPolicy | undefined;
  readonly builtinTools?: SessionSpec['builtinTools'] | undefined;
  readonly tools?: SessionSpec['tools'] | undefined;
  /** Tool names the guard denies, with the text the denial returns. */
  readonly deny?: Record<string, string> | undefined;
  /** Installs a guard even when nothing is denied. */
  readonly guard?: boolean | undefined;
  /** The text `afterMutation` appends to a settled call's result. */
  readonly hookCheck?: string | undefined;
  /** Where the session's write built-ins really write. */
  readonly workingDirectory?: string | undefined;
}

/** A session spec over the scripted fake, with the callbacks recorded for tests. */
export function probeSpec(options: ProbeOptions = {}): Probe {
  const events: AgentEvent[] = [];
  const judged: unknown[] = [];
  const guarded: Probe['guarded'] = [];
  const settledMutations: Probe['settledMutations'] = [];
  const verdicts = [...(options.verdicts ?? [])];
  const deny = options.deny ?? {};
  const spec: SessionSpec = {
    role: 'engineer',
    scope: { workingDirectory: options.workingDirectory ?? '/project' },
    systemPrompt: 'system',
    prompt: 'do the work',
    session: options.session ?? { mode: 'fresh' },
    context: options.context ?? unbounded,
    builtinTools: options.builtinTools ?? ['read', 'grep', 'edit', 'write'],
    tools: options.tools ?? [{
      name: 'echo',
      description: 'Echoes its input',
      inputSchema: { type: 'object' },
      execute: async input => ({ text: JSON.stringify(input) }),
    }],
    submission: {
      name: 'submit',
      description: 'Submit',
      inputSchema: { type: 'object' },
      accept: async input => {
        judged.push(input);
        return verdicts.shift() ?? { accepted: true };
      },
    },
    sessionDirectory: '/job/session',
    ...(options.guard === true || Object.keys(deny).length > 0
      ? {
          guard: async (call: { tool: string; input: unknown }) => {
            guarded.push({ tool: call.tool, input: call.input });
            const text = deny[call.tool];
            return text === undefined ? { allow: true as const } : { allow: false as const, text };
          },
        }
      : {}),
    ...(options.hookCheck === undefined
      ? {}
      : {
          afterMutation: async (call: { tool: string; failed: boolean }) => {
            settledMutations.push({ tool: call.tool, failed: call.failed });
            return { text: options.hookCheck as string };
          },
        }),
    onEvent: event => events.push(event),
  };
  return { spec, events, judged, guarded, settledMutations };
}
