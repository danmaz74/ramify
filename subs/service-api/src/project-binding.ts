import type { RamifyService } from '../../../src/interfaces/service.js';
import type { ClockPort, ContextEvent, ContextSetup, ContextToken } from '../../daemon/src/context-types.js';
import type { ConnectOutcome, ConnectionState, DisconnectReason, ServiceConnection } from '../../daemon/src/interfaces/daemon.js';

export type BindingState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'ready'; readonly token: ContextToken }
  | { readonly kind: 'daemon-stopped' }
  | { readonly kind: 'project-unavailable'; readonly message: string }
  | { readonly kind: 'retrying'; readonly message: string; readonly nextAttemptAt: number };

export interface ProjectBinding {
  readonly root: string;
  state(): BindingState;
  /** The connected service while the state is `ready`; otherwise null. */
  service(): RamifyService | null;
  /** Receives the bound context's events while subscribed; returns the listener's release. */
  observe(listener: (event: ContextEvent) => void): () => void;
  close(): Promise<void>;
}

/** The browser-facing reason a request cannot use the binding in its current state. */
export function unavailableReason(binding: ProjectBinding): string {
  const state = binding.state();
  switch (state.kind) {
    case 'connecting': return 'Connecting to the project';
    case 'daemon-stopped': return 'Daemon stopped explicitly';
    case 'retrying': case 'project-unavailable': return state.message;
    case 'ready': return 'Project connection changed';
  }
}

/** Connects to the daemon; `onState` receives the returned connection's later transitions. */
export type ProjectBindingConnector = (request: {
  readonly start: 'if-needed' | 'never';
  readonly onState: (state: ConnectionState, reason: DisconnectReason | null) => void;
}) => Promise<ConnectOutcome>;

export interface ProjectBindingLogEntry {
  readonly level: 'info' | 'warn';
  readonly event: string;
  readonly message: string;
}

export interface ProjectBindingOptions {
  /** Absolute, already resolved project root. */
  readonly root: string;
  readonly setup: ContextSetup;
  readonly connect: ProjectBindingConnector;
  readonly clock: ClockPort;
  readonly log?: (entry: ProjectBindingLogEntry) => void;
}

/** Retry delays after a connection failure; the last one repeats. */
export const bindingBackoffMs: readonly number[] = [1000, 2000, 5000, 10_000, 30_000];
export const stoppedPollMs = 5000;
export const projectRetryMs = 30_000;

/** `start` connects directly with `if-needed`; `retry` first checks for an
 * explicit stop with `never`; `poll` never starts a daemon; `reopen` reuses
 * a connected connection. */
type AttemptMode = 'start' | 'retry' | 'poll' | 'reopen';

/** Own one project's daemon connection, context and subscription, and keep them valid. */
export function createProjectBinding(options: ProjectBindingOptions): ProjectBinding {
  const { root, setup, connect, clock } = options;
  const log = (level: ProjectBindingLogEntry['level'], event: string, message: string) => {
    try { options.log?.({ level, event, message }); } catch { /* Logging never changes the binding. */ }
  };
  let current: BindingState = { kind: 'connecting' };
  let connection: ServiceConnection | null = null;
  let token: ContextToken | null = null;
  let subscription: string | null = null;
  let epoch = 0;
  let failures = 0;
  let closed = false;
  let closing: Promise<void> | undefined;
  let cancelTimer: (() => void) | null = null;
  let pending: AttemptMode | null = null;
  let running: Promise<void> | null = null;
  const observers = new Set<(event: ContextEvent) => void>();

  const setState = (next: BindingState) => { current = next; };
  const quietly = async (work: () => Promise<unknown>) => { try { await work(); } catch { /* Best-effort release. */ } };

  function later(delayMs: number, mode: AttemptMode): void {
    cancelTimer?.();
    cancelTimer = clock.schedule(delayMs, () => { cancelTimer = null; trigger(mode); });
  }

  /** Supersede any in-flight attempt and run `mode` once it has released what it acquired. */
  function trigger(mode: AttemptMode): void {
    if (closed) return;
    cancelTimer?.(); cancelTimer = null;
    epoch++;
    pending = mode;
    running ??= (async () => {
      while (pending && !closed) {
        const next = pending;
        pending = null;
        await attempt(next, epoch).catch(error => {
          if (!closed) fail(error instanceof Error ? error.message : String(error));
        });
      }
    })().finally(() => { running = null; });
  }

  function fail(message: string): void {
    const delay = bindingBackoffMs[Math.min(failures, bindingBackoffMs.length - 1)]!;
    failures++;
    setState({ kind: 'retrying', message, nextAttemptAt: clock.now() + delay });
    log('warn', 'binding-retrying', message);
    later(delay, 'retry');
  }
  function stopped(): void {
    failures = 0;
    setState({ kind: 'daemon-stopped' });
    log('info', 'binding-daemon-stopped', 'Daemon stopped explicitly');
    later(stoppedPollMs, 'poll');
  }
  function unavailable(message: string): void {
    setState({ kind: 'project-unavailable', message });
    log('warn', 'binding-project-unavailable', message);
    later(projectRetryMs, 'reopen');
  }

  /** The current connection ended: its context and subscription went with it. */
  function lost(state: ConnectionState, reason: DisconnectReason | null): void {
    const ended = connection;
    epoch++;
    connection = null; token = null; subscription = null;
    if (ended) void quietly(() => ended.close());
    if (reason?.kind === 'explicit-stop') { stopped(); return; }
    // Idle exit cannot occur while the subscription is valid; treat it as a failure.
    fail(reason?.kind === 'failure' ? reason.message : `Daemon connection ${state}${reason ? ` (${reason.kind})` : ''}`);
  }

  function observe(owner: { connection: ServiceConnection | null }) {
    return (state: ConnectionState, reason: DisconnectReason | null) => {
      if (closed || state === 'connected' || !owner.connection || owner.connection !== connection) return;
      lost(state, reason);
    };
  }

  function onEvent(event: ContextEvent): void {
    if (closed || !token) return;
    if (event.token.context !== token.context || event.token.generation !== token.generation) return;
    for (const observer of [...observers]) {
      try { observer(event); } catch { /* An observer never changes the binding. */ }
    }
    if (event.type !== 'context-evicted') return;
    log('info', 'binding-context-evicted', `Context evicted (${event.reason}); reopening`);
    token = null; subscription = null;
    setState({ kind: 'connecting' });
    trigger('reopen');
  }

  async function acquire(mode: AttemptMode, stale: () => boolean): Promise<ServiceConnection | 'settled'> {
    const order: readonly ('if-needed' | 'never')[] = mode === 'start' ? ['if-needed']
      : mode === 'poll' ? ['never'] : ['never', 'if-needed'];
    let message = 'Daemon connection unavailable';
    for (const start of order) {
      const owner: { connection: ServiceConnection | null } = { connection: null };
      const outcome = await connect({ start, onState: observe(owner) });
      if (stale()) {
        if (outcome.status === 'connected') await quietly(() => outcome.connection.close());
        return 'settled';
      }
      if (outcome.status === 'connected') {
        owner.connection = outcome.connection;
        connection = outcome.connection;
        if (outcome.connection.state !== 'connected') { lost(outcome.connection.state, outcome.connection.reason); return 'settled'; }
        return outcome.connection;
      }
      if (outcome.status === 'stopped') {
        if (outcome.record.stopped?.reason === 'explicit') { stopped(); return 'settled'; }
        message = `Daemon stopped (${outcome.record.stopped?.reason ?? 'unknown'})`;
        if (mode === 'poll') { fail(message); return 'settled'; }
        continue;
      }
      if (outcome.status === 'not-running') {
        message = 'No daemon running';
        if (mode === 'poll') { stopped(); return 'settled'; }
        continue;
      }
      message = outcome.message;
      if (mode === 'poll') { stopped(); return 'settled'; }
    }
    fail(message);
    return 'settled';
  }

  async function attempt(mode: AttemptMode, own: number): Promise<void> {
    const stale = () => closed || own !== epoch;
    let service = connection && connection.state === 'connected' && mode !== 'poll' ? connection : null;
    if (!service) {
      const previous = connection;
      connection = null;
      if (previous) await quietly(() => previous.close());
      if (stale()) return;
      const acquired = await acquire(mode, stale);
      if (acquired === 'settled') return;
      service = acquired;
    }
    const opened = await service.openContext({ project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, setup });
    if (stale()) {
      if (opened.ok && opened.value.status === 'opened') { const acquired = opened.value.token; await quietly(() => service.closeContext({ token: acquired })); }
      return;
    }
    if (!opened.ok) { fail(opened.error.message); return; }
    const value = opened.value;
    if (value.status === 'unresolved') {
      unavailable(value.resolution.issues[0]?.message ?? `Project resolution ${value.resolution.status}`);
      return;
    }
    if (value.status === 'unavailable') { unavailable(value.message); return; }
    const opening = value.token;
    const subscribed = await service.subscribe({ token: opening }, onEvent);
    if (stale()) {
      if (subscribed.ok) { const id = subscribed.value.subscription; await quietly(() => service.unsubscribe({ subscription: id })); }
      await quietly(() => service.closeContext({ token: opening }));
      return;
    }
    if (!subscribed.ok) {
      await quietly(() => service.closeContext({ token: opening }));
      if (!stale()) fail(subscribed.error.message);
      return;
    }
    token = opening;
    subscription = subscribed.value.subscription;
    failures = 0;
    setState({ kind: 'ready', token: opening });
    log('info', 'binding-ready', `Context ${opening.context} generation ${opening.generation}`);
  }

  trigger('start');

  return {
    root,
    state: () => current,
    service: () => !closed && current.kind === 'ready' ? connection : null,
    observe(listener) {
      if (closed) return () => {};
      observers.add(listener);
      return () => { observers.delete(listener); };
    },
    close() {
      closing ??= (async () => {
        closed = true;
        observers.clear();
        epoch++;
        pending = null;
        cancelTimer?.(); cancelTimer = null;
        const ended = connection, held = token, id = subscription;
        connection = null; token = null; subscription = null;
        setState({ kind: 'project-unavailable', message: 'Project binding closed' });
        try {
          if (ended && ended.state === 'connected') {
            if (id) await quietly(() => ended.unsubscribe({ subscription: id }));
            if (held) await quietly(() => ended.closeContext({ token: held }));
          }
        } finally {
          if (ended) await quietly(() => ended.close());
          await running;
        }
      })();
      return closing;
    },
  };
}
