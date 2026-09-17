import type { ServiceResult, SubscriptionOpened } from '../../../../src/interfaces/service.js';
import type { DependencyDiagramFacts } from '../../../analysis/src/interfaces/dependency-diagram.js';
import type {
  ContextDependencyDiagramOutcome,
  ContextEvent,
  ContextRevision,
  ContextStatus,
  ContextToken,
  DependencyDiagramRequest,
  OpenOutcome,
} from '../../../daemon/src/context-types.js';
import type { ConnectionState, DaemonRecord, DisconnectReason, ServiceConnection } from '../../../daemon/src/interfaces/daemon.js';
import type { ProjectBindingConnector } from '../project-binding.js';

/** One daemon `dependencyDiagram` call the fake holds until the test settles it. */
export interface FakeDiagramCall {
  readonly request: DependencyDiagramRequest;
  readonly signal: AbortSignal | undefined;
  readonly settled: boolean;
  /** Answer the call; ignored once it settled (an aborted call already answered `cancelled`). */
  settle(result: ServiceResult<ContextDependencyDiagramOutcome>): void;
}

/** What a connect attempt finds: `stopped` carries the record's stop reason. */
export type FakeDaemon =
  | { readonly kind: 'running' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'broken'; readonly message: string }
  | { readonly kind: 'stopped'; readonly reason: 'explicit' | 'idle' | 'failed' };

export interface FakeConnection {
  readonly connection: ServiceConnection;
  readonly tokens: readonly ContextToken[];
  readonly openCalls: number;
  readonly maxConcurrentOpens: number;
  readonly subscriptions: ReadonlySet<string>;
  readonly contexts: ReadonlySet<string>;
  readonly closed: boolean;
  /** Queue the next open's result; a promise holds the open until it settles. */
  scriptOpen(outcome: (token: ContextToken) => OpenOutcome | Promise<OpenOutcome>): void;
  /** Deliver an event to every live subscription listener. */
  emit(event: ContextEvent): void;
  /** Report a transport transition to the binding, as `connectDaemon`'s `onState` does. */
  drop(state: ConnectionState, reason: DisconnectReason): void;
  /** The published revision `contextStatus` reports; null before the first publication. */
  published: ContextRevision | null;
  /** `contextStatus` calls answered. */
  readonly statusCalls: number;
  /** Every `dependencyDiagram` call in arrival order. */
  readonly diagramCalls: readonly FakeDiagramCall[];
  /** Calls whose signal was aborted before the test settled them. */
  readonly abortedDiagrams: number;
  /** Set `published` and deliver its `revision-published` event to the subscribers. */
  publish(revision: ContextRevision): void;
}

export interface FakeConnector {
  readonly connect: ProjectBindingConnector;
  /** Current daemon condition; an `if-needed` attempt starts an absent or stopped daemon. */
  daemon: FakeDaemon;
  readonly calls: readonly ('if-needed' | 'never')[];
  readonly connections: readonly FakeConnection[];
  count(start: 'if-needed' | 'never'): number;
}

const key = (token: ContextToken) => `${token.context}#${token.generation}`;
const status = (token: ContextToken) => ({ token }) as unknown as ContextStatus;
const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const cancelled = <T>(): ServiceResult<T> => ({ ok: false, error: { code: 'cancelled', message: 'Connection closed', details: {} } });

/** An unresolved open outcome with one issue message. */
export function unresolvedOpen(message: string): OpenOutcome {
  return { status: 'unresolved', resolution: { status: 'invalid', issues: [{ message }] },
    report: {} } as unknown as OpenOutcome;
}

function record(reason: 'explicit' | 'idle' | 'failed'): DaemonRecord {
  return { schemaVersion: 'ramify.daemon-record/1', instanceId: 'fake', pid: 1, buildKey: '0000000000000000',
    version: '0.0.0', engine: 'fake', protocol: 'ramify.ipc/1', socket: '/fake', startedAt: 0, state: 'stopped',
    stopped: { at: 0, reason, requestId: null } };
}

function fakeConnection(onState: (state: ConnectionState, reason: DisconnectReason | null) => void,
  generations: { next: number }): FakeConnection {
  let state: ConnectionState = 'connected', reason: DisconnectReason | null = null;
  let openCalls = 0, opening = 0, maxConcurrentOpens = 0, nextSubscription = 0;
  const tokens: ContextToken[] = [];
  const scripted: ((token: ContextToken) => OpenOutcome | Promise<OpenOutcome>)[] = [];
  const subscriptions = new Map<string, (event: ContextEvent) => void>();
  const contexts = new Set<string>();
  const diagramCalls: FakeDiagramCall[] = [];
  let published: ContextRevision | null = null, statusCalls = 0, abortedDiagrams = 0;
  const live = () => state === 'connected';
  const connection = {
    get state() { return state; },
    get reason() { return reason; },
    daemon: {} as ServiceConnection['daemon'],
    async openContext() {
      if (!live()) return cancelled<OpenOutcome>();
      openCalls++; opening++; maxConcurrentOpens = Math.max(maxConcurrentOpens, opening);
      try {
        const token = { context: 'ctx/1:fake', generation: `gen/1:${++generations.next}` };
        const outcome = await (scripted.shift() ?? ((value: ContextToken) =>
          ({ status: 'opened', token: value, created: true, current: status(value) }) as OpenOutcome))(token);
        if (outcome.status === 'opened') { tokens.push(outcome.token); contexts.add(key(outcome.token)); }
        return live() ? ok(outcome) : cancelled<OpenOutcome>();
      } finally { opening--; }
    },
    async subscribe(params: { token: ContextToken }, listener: (event: ContextEvent) => void) {
      if (!live()) return cancelled<SubscriptionOpened>();
      const id = `sub-${++nextSubscription}`;
      subscriptions.set(id, listener);
      return ok<SubscriptionOpened>({ subscription: id, current: status(params.token), replay: 'not-available' });
    },
    async unsubscribe(params: { subscription: string }) {
      if (!live()) return cancelled<null>();
      subscriptions.delete(params.subscription); return ok(null);
    },
    async contextStatus(params: { token: ContextToken }) {
      if (!live()) return cancelled<ContextStatus>();
      statusCalls++;
      return ok({ token: params.token, published } as unknown as ContextStatus);
    },
    dependencyDiagram(request: DependencyDiagramRequest, control?: { readonly signal?: AbortSignal }) {
      if (!live()) return Promise.resolve(cancelled<ContextDependencyDiagramOutcome>());
      return new Promise<ServiceResult<ContextDependencyDiagramOutcome>>(resolve => {
        let settled = false;
        const answer = (result: ServiceResult<ContextDependencyDiagramOutcome>) => {
          if (settled) return;
          settled = true;
          control?.signal?.removeEventListener('abort', aborted);
          resolve(result);
        };
        const aborted = () => {
          if (settled) return;
          abortedDiagrams++;
          answer(ok({ status: 'cancelled', requestId: request.requestId }));
        };
        diagramCalls.push({ request, signal: control?.signal, get settled() { return settled; }, settle: answer });
        if (control?.signal?.aborted) aborted(); else control?.signal?.addEventListener('abort', aborted, { once: true });
      });
    },
    async closeContext(params: { token: ContextToken }) {
      if (!live()) return cancelled<null>();
      contexts.delete(key(params.token)); return ok(null);
    },
    async close() {
      if (state === 'closed') return;
      state = 'closed'; reason = { kind: 'closed' }; subscriptions.clear(); onState('closed', reason);
    },
  } as unknown as ServiceConnection;
  return {
    connection,
    tokens,
    get openCalls() { return openCalls; },
    get maxConcurrentOpens() { return maxConcurrentOpens; },
    get subscriptions() { return new Set(subscriptions.keys()); },
    get contexts() { return new Set(contexts); },
    get closed() { return state === 'closed'; },
    scriptOpen(outcome) { scripted.push(outcome); },
    emit(event) { for (const listener of [...subscriptions.values()]) listener(event); },
    drop(next, why) {
      state = next; reason = why; subscriptions.clear(); contexts.clear(); onState(next, why);
    },
    get published() { return published; },
    set published(value) { published = value; },
    get statusCalls() { return statusCalls; },
    diagramCalls,
    get abortedDiagrams() { return abortedDiagrams; },
    publish(revision) {
      published = revision;
      for (const listener of [...subscriptions.values()]) listener({ type: 'revision-published', token: revision.token, revision, coalesced: 0 });
    },
  };
}

/** A revision of a fake token; `rev/1:<uuid>:<sequence>` matches the router's revision format. */
export function fakeRevision(token: ContextToken, sequence: number, inputId = `input/1:fake-${sequence}`): ContextRevision {
  return { token, revision: `rev/1:00000000-0000-4000-8000-000000000000:${sequence}`, sequence,
    fingerprints: { inputId } } as unknown as ContextRevision;
}

/**
 * A consistent diagram: `boundaries` behavioral dependencies of `app/consumer` on
 * originals owned by `app/provider`, each through `app/provider`. `padding` adds
 * bytes to every consumer file name, to reach a chosen encoded size.
 */
export function fakeDiagram(inputId: string, boundaries = 1, padding = 0): DependencyDiagramFacts {
  const file = `subs/consumer/src/use${'x'.repeat(padding)}.ts`;
  return {
    inputId,
    modules: ['app', 'app/consumer', 'app/provider'],
    headline: { behavioralDependencies: boundaries, nonBehavioralDependencies: 0 },
    boundaries: Array.from({ length: boundaries }, (_, index) => {
      const binding = `value${String(index).padStart(6, '0')}`;
      return { consumer: 'app/consumer', importedModule: 'app/provider', originalOwner: 'app/provider',
        original: { kind: 'code' as const, owner: 'app/provider', file: 'api.ts', binding },
        classification: 'behavioral' as const, consumerFiles: [file], importedFiles: ['subs/provider/src/api.ts'],
        originalFiles: ['subs/provider/src/api.ts'], accessIds: [`access-${index}`], status: 'allowed' as const,
        reasons: ['exposed' as const], limitIds: [] };
    }),
    coverage: { state: 'complete', unknownDependencies: 0, limitIds: [] },
  };
}

/** A connector modelling `connectDaemon`'s start decisions over a scripted daemon condition. */
export function createFakeConnector(initial: FakeDaemon = { kind: 'running' }): FakeConnector {
  const calls: ('if-needed' | 'never')[] = [];
  const connections: FakeConnection[] = [];
  const generations = { next: 0 };
  const fake: FakeConnector = {
    daemon: initial,
    calls,
    connections,
    count: start => calls.filter(call => call === start).length,
    async connect({ start, onState }) {
      calls.push(start);
      const daemon = fake.daemon;
      if (daemon.kind === 'broken') return { status: 'unavailable', attempts: 1, message: daemon.message,
        reason: { kind: 'failure', message: daemon.message } };
      if (daemon.kind !== 'running') {
        if (start === 'never') return daemon.kind === 'stopped' ? { status: 'stopped', record: record(daemon.reason) } : { status: 'not-running' };
        fake.daemon = { kind: 'running' };
      }
      const created = fakeConnection(onState, generations);
      connections.push(created);
      return { status: 'connected', connection: created.connection, started: daemon.kind !== 'running' };
    },
  };
  return fake;
}
