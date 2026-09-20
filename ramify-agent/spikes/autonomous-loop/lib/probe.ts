/*
 * Iteration-0 spike support. Throwaway code: outside every module, outside
 * the compiler's scope, never imported by source.
 *
 * Each probe answers one question about the pinned
 * `@earendil-works/pi-coding-agent` 0.85.1 and returns a verdict with the
 * evidence it observed. A probe never asserts; it reports.
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scriptedProvider, scriptedRuntime, type ReplyStep, type ScriptedOptions, type ScriptedProvider } from './scripted-provider.js';

export type Verdict = 'verified' | 'verified-with-limitation' | 'unavailable' | 'not-done';

export interface ProbeResult {
  readonly number: number;
  readonly title: string;
  readonly verdict: Verdict;
  /** The limitation, what was searched for, or why the probe was not done. */
  readonly note?: string;
  /** What was attempted and what happened, line by line. */
  readonly evidence: readonly string[];
}

export interface Probe {
  readonly number: number;
  readonly title: string;
  run(): Promise<ProbeResult>;
}

/** Collects evidence lines and produces a result. */
export class Log {
  private readonly lines: string[] = [];

  say(line: string): void {
    this.lines.push(line);
  }

  /** Records `name = <json>` for a value the results note should quote exactly. */
  show(name: string, value: unknown): void {
    this.lines.push(`${name} = ${JSON.stringify(value)}`);
  }

  get evidence(): readonly string[] {
    return this.lines;
  }
}

export function result(probe: { number: number; title: string }, verdict: Verdict, log: Log, note?: string): ProbeResult {
  return { number: probe.number, title: probe.title, verdict, ...(note === undefined ? {} : { note }), evidence: log.evidence };
}

export interface Workspace {
  /** The agent's working directory. */
  readonly cwd: string;
  /** Where pi writes its session files. */
  readonly sessionDirectory: string;
  /** pi's agent directory: auth and model settings, isolated per probe. */
  readonly agentDirectory: string;
  readonly runtime: ModelRuntime;
  readonly scripted: ScriptedProvider;
  remove(): Promise<void>;
}

/** Directories a second process reuses so that it opens the same session files. */
export interface ReusedDirectories {
  readonly cwd?: string | undefined;
  readonly sessionDirectory?: string | undefined;
}

/** A disposable workspace with a scripted provider registered. Nothing here reaches a network. */
export async function workspace(steps: readonly ReplyStep[], options: ScriptedOptions = {}, reuse: ReusedDirectories = {}): Promise<Workspace> {
  const scripted = scriptedProvider(steps, options);
  const { runtime, agentDirectory, remove } = await scriptedRuntime(scripted);
  const own = reuse.cwd === undefined;
  const cwd = reuse.cwd ?? (await mkdtemp(join(tmpdir(), 'ramify-spike-cwd-')));
  const sessionDirectory = reuse.sessionDirectory ?? join(agentDirectory, 'sessions');
  return {
    cwd,
    sessionDirectory,
    agentDirectory,
    runtime,
    scripted,
    remove: async () => {
      await remove();
      if (own) await rm(cwd, { recursive: true, force: true });
    },
  };
}

export interface SessionOptions {
  readonly workspace: Workspace;
  /** `create` starts a new session file; `open` reopens an existing one. */
  readonly session: { readonly mode: 'create' } | { readonly mode: 'open'; readonly file: string };
  /** The tool allowlist handed to pi. Omitted means pi's own defaults, which a probe may want to observe. */
  readonly tools?: readonly string[] | undefined;
  readonly customTools?: ReadonlyArray<ReturnType<typeof defineTool>>;
  readonly systemPrompt?: string;
  /** Installed on the inline extension, so the probe can see pi's tool lifecycle. */
  readonly extend?: (api: ExtensionAPI) => void;
  readonly compaction?: { readonly enabled?: boolean; readonly reserveTokens?: number; readonly keepRecentTokens?: number };
  readonly onEvent?: (event: AgentSessionEvent) => void;
}

export interface OpenSession {
  readonly session: AgentSession;
  readonly events: AgentSessionEvent[];
  readonly file: string | undefined;
  close(): void;
}

/**
 * A pi session built the way the real adapter builds one: the spec's system
 * prompt replaces pi's, discovery is off, and the tool allowlist is explicit.
 */
export async function open(options: SessionOptions): Promise<OpenSession> {
  const { workspace: space } = options;
  const settingsManager = SettingsManager.inMemory({
    retry: { enabled: false },
    ...(options.compaction === undefined ? {} : { compaction: options.compaction }),
  });
  const systemPrompt = options.systemPrompt ?? 'You are a probe subject.';
  const loader = new DefaultResourceLoader({
    cwd: space.cwd,
    agentDir: space.agentDirectory,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [{
      name: 'spike',
      hidden: true,
      factory: api => {
        api.on('before_agent_start', () => ({ systemPrompt }));
        options.extend?.(api);
      },
    }],
  });
  await loader.reload();
  const sessionManager = options.session.mode === 'create'
    ? SessionManager.create(space.cwd, space.sessionDirectory)
    : SessionManager.open(options.session.file, space.sessionDirectory);
  const { session } = await createAgentSession({
    cwd: space.cwd,
    agentDir: space.agentDirectory,
    modelRuntime: space.runtime,
    model: space.scripted.model,
    ...(options.tools === undefined ? {} : { tools: [...options.tools] }),
    customTools: [...(options.customTools ?? [])],
    resourceLoader: loader,
    sessionManager,
    settingsManager,
  });
  const events: AgentSessionEvent[] = [];
  const unsubscribe = session.subscribe(event => {
    events.push(event);
    options.onEvent?.(event);
  });
  return {
    session,
    events,
    file: session.sessionFile,
    close: () => {
      unsubscribe();
      session.dispose();
    },
  };
}

/** The user and assistant text pi sent the model on request `index`, flattened for comparison. */
export function requestText(scripted: ScriptedProvider, index: number): string {
  const request = scripted.requests[index];
  if (!request) return '';
  return JSON.stringify(request.messages);
}

export function toolNames(scripted: ScriptedProvider, index: number): readonly string[] {
  return (scripted.requests[index]?.tools ?? []).map(tool => tool.name);
}

export function message(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs `probe` and turns a throw into an evidence line rather than a crash. */
export async function attempt(probe: Probe): Promise<ProbeResult> {
  try {
    return await probe.run();
  } catch (error) {
    return {
      number: probe.number,
      title: probe.title,
      verdict: 'unavailable',
      note: 'The probe itself threw; see the evidence.',
      evidence: [`threw: ${message(error)}`, ...(error instanceof Error && error.stack ? [error.stack] : [])],
    };
  }
}
