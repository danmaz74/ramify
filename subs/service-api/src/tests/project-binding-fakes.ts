import type { ServiceResult, SubscriptionOpened } from '../../../../src/interfaces/service.js';
import type { ContextEvent, ContextStatus, ContextToken, OpenOutcome } from '../../../daemon/src/context-types.js';
import type { ConnectionState, DaemonRecord, DisconnectReason, ServiceConnection } from '../../../daemon/src/interfaces/daemon.js';
import type { ProjectBindingConnector } from '../project-binding.js';

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
