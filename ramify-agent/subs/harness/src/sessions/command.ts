import { privateRamify } from '../../subs/evidence/src/ramify-cli.js';
import { buildAgent } from '../steps/agent.js';
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
      model: chosen.model,
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
