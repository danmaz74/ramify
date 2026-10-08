import { expect } from 'vitest';
import type { CreateAgentSessionOptions, CreateAgentSessionResult, createGrepToolDefinition, defineTool } from '@earendil-works/pi-coding-agent';

interface ScriptedGrepSDK {
  readonly createGrepToolDefinition: typeof createGrepToolDefinition;
  readonly defineTool: typeof defineTool;
  createAgentSession(options: CreateAgentSessionOptions): Promise<CreateAgentSessionResult>;
}
const replies: { callId: string; input: { pattern: string; path: string }; text: string }[] = [];
const failures: unknown[] = [];
let used = 0;

/** Literal search transport reply; the real SDK validates arguments and carries tool events. */
export function declareGrep(pattern: string, path: string, text: string): void {
  replies.push({ callId: 'c-grep', input: { pattern, path }, text });
}
export function assertGrepConsumed(): void {
  try { expect(failures, 'caught SDK search violations').toEqual([]); expect(used).toBe(replies.length); }
  finally { replies.splice(0); failures.splice(0); used = 0; }
}
export async function scriptedGrepSession(sdk: ScriptedGrepSDK, options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult> {
  const cwd = options.cwd!;
  const definition = sdk.createGrepToolDefinition(cwd);
  const scripted = sdk.defineTool({ ...definition, async execute(callId, input, _signal, _update, context) {
      try {
        const reply = replies[used++]; expect(reply, 'undeclared SDK search').toBeDefined();
        expect(context.cwd).toBe(cwd); expect(callId).toBe(reply!.callId); expect(input).toEqual(reply!.input);
        return { content: [{ type: 'text' as const, text: reply!.text }], details: {} };
      } catch (error) { failures.push(error); throw error; }
    } });
  return sdk.createAgentSession({ ...options, customTools: [...(options.customTools ?? []), scripted] });
}
