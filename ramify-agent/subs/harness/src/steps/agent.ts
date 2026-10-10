import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';

/*
 * The agent a manual invocation runs on, as a person chooses it on the
 * command line: pi with the person's own pi login, or the scripted fake
 * reading a script file. `session` and `step run` build it the same way.
 */

/** The agent a manual invocation runs on: pi, with the person's own pi login, or the scripted fake reading a script file. */
export type AgentChoice =
  | { readonly name: 'pi'; readonly model?: string | undefined }
  /** A JSON file holding an array of scripted steps. */
  | { readonly name: 'fake'; readonly script: string };

export type BuiltAgent =
  | { readonly ok: true; readonly agent: AgentPort; readonly model?: string | undefined; readonly description: string }
  | { readonly ok: false; readonly reason: string };

const stepKinds = new Set(['tool', 'message', 'retry', 'context', 'compaction', 'wait', 'stall', 'hang', 'submit', 'fail', 'end']);

/** Builds the chosen agent, or says why it cannot run. */
export async function buildAgent(choice: AgentChoice): Promise<BuiltAgent> {
  if (choice.name === 'pi') {
    const readiness = await piReadiness({ model: choice.model });
    if (!readiness.ready) return { ok: false, reason: `pi cannot run: ${readiness.reason}` };
    return { ok: true, agent: createPiAgent({ model: choice.model }), model: readiness.model, description: `pi, model ${readiness.model}` };
  }
  const path = resolve(choice.script);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `The script ${path} cannot be read as JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: `The script ${path} must hold a JSON array of steps.` };
  const invalid = parsed.findIndex(step =>
    typeof step !== 'object' || step === null || !stepKinds.has(String((step as { kind?: unknown }).kind)));
  if (invalid !== -1) {
    return { ok: false, reason: `Step ${invalid + 1} of the script ${path} has no known kind; the kinds are ${[...stepKinds].join(', ')}.` };
  }
  return { ok: true, agent: createScriptedAgent(parsed as ScriptStep[]), description: `the scripted fake, from ${path}` };
}
