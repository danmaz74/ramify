import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import { privateRamify } from '../../subs/evidence/src/ramify-cli.js';
import { runSingleSession, type SessionProgress, type SingleSessionResult } from './single.js';

/*
 * The `session` command's entry: it builds the agent the person chose and
 * a private Ramify command line, runs one engineer session and disposes of
 * both. The agent, the Ramify command line and the policy stay internal, so
 * the root receives only what it names on the command line and what it
 * prints.
 */

/** The agent a session runs on: pi, with the person's own pi login, or the scripted fake reading a script file. */
export type SessionAgentChoice =
  | { readonly name: 'pi'; readonly model?: string | undefined }
  /** A JSON file holding an array of scripted steps. */
  | { readonly name: 'fake'; readonly script: string };

/** What the `session` command starts one session with. */
export interface SessionCommandOptions {
  readonly projectRoot: string;
  /** The module, by its declared-name path or its project-relative directory. */
  readonly module: string;
  readonly prompt: string;
  readonly agent: SessionAgentChoice;
  readonly write?: readonly string[] | undefined;
  readonly gate?: boolean | undefined;
  /** Called once the agent is ready, with what it is: pi and its model, or the fake and its script. */
  readonly onAgent?: ((description: string) => void) | undefined;
  readonly onProgress?: ((event: SessionProgress) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
}

const stepKinds = new Set(['tool', 'message', 'retry', 'context', 'compaction', 'wait', 'stall', 'hang', 'submit', 'fail', 'end']);

/** Runs one engineer session on the chosen agent. An agent that cannot start is a session that could not start. */
export async function runSessionCommand(options: SessionCommandOptions): Promise<SingleSessionResult> {
  const chosen = await buildAgent(options.agent);
  if (!chosen.ok) return { status: 'not-started', reason: chosen.reason, records: null, exitStatus: 2 };
  options.onAgent?.(chosen.description);
  const { ramify, dispose } = await privateRamify();
  try {
    return await runSingleSession({
      projectRoot: options.projectRoot,
      module: options.module,
      prompt: options.prompt,
      agent: chosen.agent,
      ramify,
      write: options.write,
      gate: options.gate,
      onProgress: options.onProgress,
      signal: options.signal,
    });
  } finally {
    await dispose().catch(() => undefined);
  }
}

type BuiltAgent = { readonly ok: true; readonly agent: AgentPort; readonly description: string } | { readonly ok: false; readonly reason: string };

async function buildAgent(choice: SessionAgentChoice): Promise<BuiltAgent> {
  if (choice.name === 'pi') {
    const readiness = await piReadiness({ model: choice.model });
    if (!readiness.ready) return { ok: false, reason: `pi cannot run: ${readiness.reason}` };
    return { ok: true, agent: createPiAgent({ model: choice.model }), description: `pi, model ${readiness.model}` };
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
