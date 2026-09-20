import type { AgentPort, AgentSession, SessionOutcome, SessionSpec, TokenUsage } from './interfaces/port.js';

/**
 * One step of a scripted session. The fake runs the steps in order and
 * checks for Stop before each one.
 */
export type ScriptStep =
  /** Calls a tool: a harness tool runs for real; a built-in one only reports its call. */
  | { readonly kind: 'tool'; readonly tool: string; readonly input: unknown }
  | { readonly kind: 'message'; readonly text: string; readonly usage?: TokenUsage | undefined }
  /** Waits, ending early on Stop. */
  | { readonly kind: 'wait'; readonly ms: number }
  /**
   * Waits, ignoring Stop, like a tool that does not honor its signal. With
   * `thenIgnoreStop` the session also keeps running the rest of its script
   * after Stop: an agent that misbehaves, whose output must be discarded.
   */
  | { readonly kind: 'stall'; readonly ms: number; readonly thenIgnoreStop?: boolean | undefined }
  /** Never settles and ignores Stop. */
  | { readonly kind: 'hang' }
  /** Calls the submission tool. Accepted ends the session; rejected continues with the next step. */
  | { readonly kind: 'submit'; readonly input: unknown }
  /** The session crashes. */
  | { readonly kind: 'fail'; readonly error: string }
  /** The agent stops talking without submitting. */
  | { readonly kind: 'end'; readonly message?: string | undefined };

export type Script = readonly ScriptStep[] | ((spec: SessionSpec) => readonly ScriptStep[]);

/** What a scripted session did, for tests. */
export interface ScriptedSessionRecord {
  readonly spec: SessionSpec;
  /** Every submission verdict, in order. */
  readonly verdicts: unknown[];
  stopCalls: number;
  outcome?: SessionOutcome;
}

export interface ScriptedAgent extends AgentPort {
  readonly sessions: readonly ScriptedSessionRecord[];
}

const never = new Promise<never>(() => undefined);

/**
 * The scripted fake: an agent that replays a script of events, tool calls
 * and submissions, including failures and hangs. It is the port's second
 * implementation and the one the harness's tests run against. A function
 * script is given the session's spec, so it can use the prompt or scope.
 */
export function createScriptedAgent(script: Script): ScriptedAgent {
  const sessions: ScriptedSessionRecord[] = [];
  return {
    name: 'scripted',
    sessions,
    startSession(spec: SessionSpec): AgentSession {
      const record: ScriptedSessionRecord = { spec, verdicts: [], stopCalls: 0 };
      sessions.push(record);
      const controller = new AbortController();
      let deaf = false;
      let callCount = 0;
      const nextCallId = () => `call-${++callCount}`;

      const run = async (): Promise<SessionOutcome> => {
        const steps = typeof script === 'function' ? script(spec) : script;
        for (const step of steps) {
          if (controller.signal.aborted && !deaf) return { kind: 'stopped' };
          switch (step.kind) {
            case 'message':
              spec.onEvent({ type: 'message', text: step.text, usage: step.usage });
              break;
            case 'wait':
              await delay(step.ms, controller.signal);
              break;
            case 'stall':
              await delay(step.ms);
              if (step.thenIgnoreStop) deaf = true;
              break;
            case 'hang':
              await never;
              break;
            case 'fail':
              return { kind: 'failed', error: step.error };
            case 'end':
              return { kind: 'ended', message: step.message };
            case 'tool': {
              const callId = nextCallId();
              spec.onEvent({ type: 'tool-started', callId, tool: step.tool, input: step.input });
              const tool = spec.tools.find(candidate => candidate.name === step.tool);
              if (tool) {
                const result = await tool.execute(step.input, controller.signal);
                spec.onEvent({ type: 'tool-finished', callId, tool: step.tool, isError: result.isError === true, errorText: result.isError ? result.text : undefined });
              } else if ((spec.builtinTools as readonly string[]).includes(step.tool)) {
                spec.onEvent({ type: 'tool-finished', callId, tool: step.tool, isError: false });
              } else {
                spec.onEvent({ type: 'tool-finished', callId, tool: step.tool, isError: true, errorText: `Tool ${step.tool} not found` });
              }
              break;
            }
            case 'submit': {
              const callId = nextCallId();
              spec.onEvent({ type: 'tool-started', callId, tool: spec.submission.name, input: step.input });
              const verdict = await spec.submission.accept(step.input, controller.signal);
              record.verdicts.push(verdict);
              spec.onEvent({
                type: 'tool-finished', callId, tool: spec.submission.name, isError: !verdict.accepted,
                errorText: verdict.accepted ? undefined : verdict.errors.join('\n'),
              });
              if (verdict.accepted) return { kind: 'submitted', input: step.input };
              if ('final' in verdict) return { kind: 'ended', message: verdict.errors.join('\n') };
              break;
            }
          }
        }
        if (controller.signal.aborted && !deaf) return { kind: 'stopped' };
        return { kind: 'ended', message: 'The script ended without a submission' };
      };

      const outcome = run().catch((error: unknown): SessionOutcome => ({
        kind: 'failed', error: error instanceof Error ? error.message : String(error),
      })).then(result => {
        record.outcome = result;
        return result;
      });

      return {
        outcome,
        stop: async () => {
          record.stopCalls++;
          controller.abort();
          await outcome;
        },
      };
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}
