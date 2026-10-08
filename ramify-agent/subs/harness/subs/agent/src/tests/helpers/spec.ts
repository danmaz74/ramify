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

import type { AgentPort, AgentSession } from '../../interfaces/port.js';
import type { AgentSessionPoint, SessionOperations, SessionStore, SessionStoreRecord } from '../../interfaces/session-operations.js';

/** A scripted store, with exact CAS and payload ownership, used only by operation tests. */
export function probeStore(): SessionStore {
  const records = new Map<string, SessionStoreRecord>();
  const payloads = new Map<string, Uint8Array>();
  return {
    async read(run, id) { return structuredClone(records.get(JSON.stringify([run, id])) ?? null); },
    async putPayload(bytes) { const id = Buffer.from(bytes).toString('base64'); payloads.set(id, new Uint8Array(bytes)); return id; },
    async getPayload(id) { return payloads.get(id) ?? null; },
    async commit(input) {
      if (input.expected.some(item => (records.get(JSON.stringify([input.runId, item.id]))?.revision ?? null) !== item.revision)) return { kind: 'conflict', reason: 'CAS' };
      for (const record of input.records) records.set(JSON.stringify([input.runId, record.id]), structuredClone(record));
      return { kind: 'committed' };
    },
  };
}
const fixtures = new WeakMap<AgentPort, { operations: SessionOperations; sequence: number }>();
export function probeOperations(agent: AgentPort): SessionOperations {
  let fixture = fixtures.get(agent);
  if (!fixture) {
    if (!agent.bindSessionStore) throw new Error('Preserving operations are unavailable');
    fixture = { operations: agent.bindSessionStore(probeStore()), sequence: 0 };
    fixtures.set(agent, fixture);
  }
  return fixture.operations;
}
/** Explicit create/fork/continue test convenience; no legacy history or fresh fallback. */
export async function invokeProbe(agent: AgentPort, spec: SessionSpec): Promise<AgentSession> {
  const operations = probeOperations(agent);
  const operationId = `probe-${++fixtures.get(agent)!.sequence}`;
  const policy = { context: spec.context, authority: {}, validator: {}, destination: {} };
  const definitions = [...spec.builtinTools.map(name => ({ name, description: name, inputSchema: {}, mutating: name === 'edit' || name === 'write' })), ...spec.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating === true })), { name: spec.submission.name, description: spec.submission.description, inputSchema: spec.submission.inputSchema, mutating: false }];
  const source = spec.session.mode === 'fresh' ? null : JSON.parse(spec.session.mode === 'fork' ? spec.session.from : spec.session.ref) as AgentSessionPoint;
  const initial = spec.session.mode === 'fresh'
    ? await operations.create({ runId: 'probe', operationId: `${operationId}:create`, initialInstructions: spec.systemPrompt, declarations: definitions, activate: definitions.map(item => item.name), policy })
    : spec.session.mode === 'fork' ? await operations.fork({ runId: 'probe', operationId: `${operationId}:fork`, sourcePoint: source! }) : { point: source, sessionId: source!.sessionId, status: 'completed' };
  if (!initial.point || initial.status !== 'completed') throw new Error(`Preserving source unavailable: ${initial.status}`);
  const previous = await operations.inspect('probe', initial.sessionId, initial.point);
  const task = { role: spec.role, message: spec.prompt, submissionTool: spec.submission.name, environment: { workingDirectory: spec.scope.workingDirectory, candidate: null, snapshot: null, limits: {} }, policyIdentity: 'probe', validatorIdentity: 'probe', destinationIdentity: 'probe' };
  const handle = await operations.continue({ runId: 'probe', operationId, sessionId: initial.sessionId, expectedPoint: initial.point, task, policy, additions: [], toolChange: { add: definitions.filter(item => !previous!.declarations.some(old => old.name === item.name)), activate: definitions.map(item => item.name), inactivate: previous!.activeTools.filter(name => !definitions.some(item => item.name === name)) }, bindings: { task, policy, tools: spec.tools, submission: spec.submission, currentAuthority: async () => true, guard: spec.guard, afterMutation: spec.afterMutation, onEvent: spec.onEvent, publish: async () => {} } });
  let point = initial.point;
  const outcome = handle.receipt.then(receipt => { if (receipt.point) point = receipt.point; return receipt.outcome ?? { kind: 'failed' as const, error: receipt.reason ?? receipt.status }; });
  return { outcome, start: { mode: spec.session.mode }, get ref() { return JSON.stringify(point); }, stop: async () => { await handle.stop(); }, settled: async () => { await handle.settled(); return 'settled'; } };
}
