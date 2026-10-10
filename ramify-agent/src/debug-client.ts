import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { z } from 'zod';
import { protocolPaths } from '../subs/harness/src/interfaces/protocol/paths.js';
import { projectResponseSchema } from '../subs/harness/src/interfaces/protocol/queries.js';
import { commandResponseSchema } from '../subs/harness/src/interfaces/protocol/jobs.js';
import { debugStateResponseSchema, debugInspectionResponseSchema, debugExchangeResponseSchema, runCommandSchema,
  type DebugStateResponse, type BreakpointState, type RunSnapshot } from '../subs/harness/src/interfaces/protocol/runs.js';
import { UsageError, type DebugOptions } from './cli.js';

/** Injectable HTTP/clock/file boundaries; no debugger client owns a server or sends cancellation. */
export interface DebugClientPorts {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly readText?: (path: string) => Promise<string>;
  readonly canonical?: (path: string) => Promise<string>;
}
export interface ControlResult { readonly exitStatus: number; readonly output: Record<string, unknown> }
export interface AttachedOptions { readonly server: string; readonly projectRoot: string; readonly planId: string;
  readonly commandId: string; readonly breakpoint: 'before-agent:engineer'; readonly timeoutMs: number; readonly json: boolean }

class ClientFailure extends Error { constructor(readonly code: string, message: string) { super(message); } }
const terminalStatus = (run: RunSnapshot): number => run.state === 'running' || run.state === 'completed' ? 0 : 1;
const summary = (run: RunSnapshot, current: BreakpointState | null): string => current?.summary ??
  (run.state === 'running' ? 'The workflow is running; wait for its next breakpoint or terminal result.' : `Run ${run.state}${run.failure ? `: ${run.failure.message}` : '.'}`);

/** Each request has a short deadline within the caller's finite overall wait. */
class Client {
  readonly deadline: number;
  cursor = 0;
  current: BreakpointState | null = null;
  run: RunSnapshot | undefined;
  constructor(readonly server: string, readonly timeoutMs: number, readonly ports: DebugClientPorts) {
    const url = new URL(server);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new UsageError('--server must be an HTTP(S) origin');
    this.deadline = this.now() + timeoutMs;
  }
  now(): number { return (this.ports.now ?? Date.now)(); }
  async request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const remaining = this.deadline - this.now();
    if (remaining <= 0) throw new ClientFailure('timeout', 'Wait timed out; the server may still be executing the admitted command.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(remaining, 10000));
    try {
      const response = await (this.ports.fetch ?? fetch)(`${new URL(this.server).origin}${path}`, {
        ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = (data as { error?: { code?: string; message?: string } }).error;
        throw new ClientFailure(error?.code ?? 'transport', error?.message ?? `HTTP ${response.status}`);
      }
      return schema.parse(data);
    } catch (error) {
      if (error instanceof ClientFailure) throw error;
      throw new ClientFailure(this.now() >= this.deadline ? 'timeout' : 'transport', error instanceof Error ? error.message : String(error));
    } finally { clearTimeout(timer); }
  }
  async state(planId: string, runId: string): Promise<DebugStateResponse> {
    const state = await this.request(protocolPaths.runDebug(planId, runId, this.cursor), debugStateResponseSchema);
    this.cursor = state.cursor; this.current = state.current; this.run = state.run;
    return state;
  }
  async pause(): Promise<void> {
    const remaining = this.deadline - this.now();
    if (remaining <= 0) throw new ClientFailure('timeout', 'Wait timed out; the run has not been cancelled.');
    await (this.ports.sleep ?? (ms => new Promise(done => setTimeout(done, ms))))(Math.min(250, remaining));
  }
  async wait(planId: string, runId: string): Promise<ControlResult> {
    let reached: BreakpointState | undefined;
    for (;;) {
      const page = await this.state(planId, runId);
      reached ??= page.reached[0];
      // Drain retained pages first, even when a pause or terminal state is already known.
      if (page.more) continue;
      if (reached || page.run.state !== 'running') return { exitStatus: terminalStatus(page.run), output: {
        ...(reached ?? { kind: 'terminal', planId, runId }), cursor: this.cursor, current: page.current,
        run: page.run, summary: reached?.summary ?? summary(page.run, page.current), currentSummary: summary(page.run, page.current),
      } };
      await this.pause();
    }
  }
}

function failure(error: unknown, client: Client | undefined, identity: Record<string, unknown>): ControlResult {
  return { exitStatus: 2, output: { kind: 'error', ...identity, cursor: client?.cursor ?? 0,
    current: client?.current ?? null, run: client?.run ?? null,
    error: { code: error instanceof ClientFailure ? error.code : 'invalid-request', message: error instanceof Error ? error.message : String(error) },
    uncertain: error instanceof ClientFailure && ['timeout', 'transport'].includes(error.code),
    summary: 'No cancellation was requested. For an uncertain mutation, retry the identical command ID and payload; otherwise inspect or wait again.',
  } };
}

/** One CLI debugger operation, with a single result object and stable identities even on lost replies. */
export async function runDebugCommand(options: DebugOptions, ports: DebugClientPorts = {}): Promise<ControlResult> {
  let client: Client | undefined;
  let receipt: unknown;
  const identity = { planId: options.planId, runId: options.runId, ...(options.pauseId ? { pauseId: options.pauseId } : {}),
    ...(options.commandId ? { commandId: options.commandId } : {}), ...(options.expectedRevision ? { revision: options.expectedRevision } : {}) };
  try {
    client = new Client(options.server, options.timeoutMs, ports);
    client.cursor = options.after;
    if (options.action === 'wait') return await client.wait(options.planId, options.runId);
    if (options.action === 'inspect') {
      const value = await client.request(protocolPaths.runDebugInspect(options.planId, options.runId, options.pauseId!), debugInspectionResponseSchema);
      return { exitStatus: terminalStatus(value.run), output: { ...value.inspection, current: value.current, run: value.run, currentSummary: summary(value.run, value.current) } };
    }
    const message = options.messageFile === undefined ? undefined : await (ports.readText ?? (path => readFile(resolve(path), 'utf8')))(options.messageFile);
    const command = runCommandSchema.parse({ commandId: options.commandId, expectedVersion: 0, type: `debug-${options.action}`,
      payload: { planId: options.planId, jobId: options.runId, pauseId: options.pauseId, expectedRevision: options.expectedRevision,
        ...(message === undefined ? {} : { message }) } });
    receipt = (await client.request(protocolPaths.commands, commandResponseSchema, command)).receipt;
    if (options.action === 'resume') {
      const state = await client.state(options.planId, options.runId);
      return { exitStatus: terminalStatus(state.run), output: { kind: 'resumed', ...identity, receipt, current: state.current, run: state.run, cursor: state.cursor,
        summary: 'Resume was admitted; the workflow was released once. This receipt may describe an earlier occurrence.', currentSummary: summary(state.run, state.current) } };
    }
    for (;;) {
      const state = await client.request(protocolPaths.runDebugExchange(options.planId, options.runId, options.commandId!), debugExchangeResponseSchema);
      client.current = state.current; client.run = state.run; client.cursor = state.run.version;
      if (state.exchange && state.exchange.status !== 'admitted') return { exitStatus: terminalStatus(state.run), output: {
        ...state.exchange, receipt, cursor: client.cursor, current: state.current, run: state.run, currentSummary: summary(state.run, state.current),
      } };
      if (state.run.state !== 'running') return { exitStatus: terminalStatus(state.run), output: { kind: 'terminal', ...identity, receipt,
        cursor: client.cursor, current: state.current, run: state.run, exchange: state.exchange, summary: summary(state.run, state.current) } };
      await client.pause();
    }
  } catch (error) {
    const result = failure(error, client, identity);
    return { ...result, output: { ...result.output, ...(receipt ? { receipt } : {}) } };
  }
}

/** Attachment uses the independently hosted model and validates canonical project identity before start. */
export async function runAttachedSession(options: AttachedOptions, ports: DebugClientPorts = {}): Promise<ControlResult> {
  let client: Client | undefined;
  let runId: string | undefined;
  let receipt: unknown;
  const identity = { planId: options.planId, commandId: options.commandId };
  try {
    client = new Client(options.server, options.timeoutMs, ports);
    const project = await client.request(protocolPaths.project, projectResponseSchema);
    const canonical = ports.canonical ?? (path => realpath(resolve(path)));
    const [target, hosted] = await Promise.all([canonical(options.projectRoot), canonical(project.project.root)]);
    if (target !== hosted) throw new UsageError(`Project mismatch: requested ${target}; server hosts ${hosted}`);
    const command = runCommandSchema.parse({ commandId: options.commandId, expectedVersion: 0, type: 'start-run', payload: {
      planId: options.planId, agent: 'pi', breakpoint: options.breakpoint,
    } });
    const accepted = await client.request(protocolPaths.commands, commandResponseSchema, command);
    receipt = accepted.receipt; runId = accepted.receipt.jobId;
    const result = await client.wait(options.planId, runId);
    return { ...result, output: { ...result.output, receipt, commandId: options.commandId, projectRoot: target } };
  } catch (error) { return failure(error, client, { ...identity, ...(runId ? { runId } : {}), ...(receipt ? { receipt } : {}) }); }
}

/** Both modes print the same result; JSON stdout is exactly one object. */
export function printControlResult(result: ControlResult, json: boolean, output: { stdout: (text: string) => void; stderr: (text: string) => void } = {
  stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text),
}): void {
  if (result.exitStatus === 2) output.stderr(`${(result.output['error'] as { message: string }).message}\n`);
  output.stdout(`${json ? JSON.stringify(result.output) : JSON.stringify(result.output, null, 2)}\n`);
}
