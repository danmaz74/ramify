import { randomUUID } from 'node:crypto';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ContextEvent, ContextToken, ContextRevision } from '../../daemon/src/context-types.js';
import type { CliEnvironment, CliExitCode, WatchLine } from './interfaces/cli.js';
import { capabilities } from './command-support.js';
import { formatHuman } from './format.js';
import { CliFailure, disconnectFailure, serviceFailure } from './errors.js';

export async function watchCommand(args: { readonly root?: string; readonly format: 'human' | 'json' },
  environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  const connected = await environment.connect({ start: 'if-needed', signal: control.signal });
  control.signal?.throwIfAborted();
  if (connected.status === 'unavailable') throw disconnectFailure(connected.reason);
  if (connected.status !== 'connected') throw new CliFailure(connected.status === 'stopped' ? 'stopped' : 'unavailable', 'No running daemon', connected);
  const connection = connected.connection;
  let token: ContextToken | undefined, subscription: string | undefined;
  let reopenCount = 0, recoveryCount = 0, lastSequence = 0;
  let wake: (() => void) | undefined, queueFailure: Error | undefined;
  const queue: ContextEvent[] = [];
  function publish(line: WatchLine, human: string): void {
    environment.stdout(args.format === 'json' ? JSON.stringify(line) + '\n' : human + '\n');
  }
  function enqueue(event: ContextEvent): void {
    if (event.type !== 'context-evicted') {
      const index = queue.findIndex(item => item.type === event.type && item.token.context === event.token.context);
      if (index >= 0) {
        const previous = queue.splice(index, 1)[0];
        event = { ...event, coalesced: event.coalesced + ('coalesced' in previous ? previous.coalesced + 1 : 0) };
      }
    }
    if (queue.length >= 256) queueFailure = new CliFailure('unavailable', 'Watch delivery queue exceeded its limit', null);
    else queue.push(event);
    wake?.();
  }
  async function pause(): Promise<void> {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); control.signal?.removeEventListener('abort', finish); wake = undefined; resolve(); };
      const timer = setTimeout(finish, 100);
      wake = finish;
      control.signal?.addEventListener('abort', finish, { once: true });
      if (control.signal?.aborted || queue.length) finish();
    });
  }
  async function render(revision: ContextRevision, coalesced: number): Promise<void> {
    if (revision.sequence <= lastSequence) return;
    const result = await connection.check({ token: revision.token, requestId: randomUUID(),
      freshness: { mode: 'published', wait: false, revision: revision.revision } }, control);
    control.signal?.throwIfAborted();
    if (!result.ok) throw serviceFailure(result.error);
    if (result.value.status === 'unavailable' && result.value.reason === 'evicted-revision') {
      publish({ schemaVersion: 'ramify.watch/1', event: 'revision-evicted', revision, coalesced },
        `Revision ${revision.sequence} (evicted before it could be read)`);
    } else if (result.value.status === 'reported' && result.value.published && result.value.revision.revision === revision.revision) {
      const report = result.value.report;
      const human = `Revision ${revision.sequence} (${revision.cause}; changed ${revision.changed?.length ?? 'unknown'} paths; reused ${revision.reused.join(', ') || 'none'})\n`
        + formatHuman(report, `resident (daemon ${connection.daemon.instance.pid}; context ${revision.token.context}; revision ${revision.sequence}; published)`)
          .split('\n').slice(3).join('\n').trimEnd();
      publish({ schemaVersion: 'ramify.watch/1', event: 'revision', revision, coalesced, report }, human);
    } else throw new CliFailure('unavailable', 'Published revision could not be read', result.value);
    lastSequence = revision.sequence;
  }
  async function subscribe(): Promise<void> {
    const opened = await connection.openContext({ project: { cwd: environment.cwd,
      ...(args.root === undefined ? {} : { root: args.root }), scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities } }, control);
    if (!opened.ok) throw serviceFailure(opened.error);
    if (opened.value.status !== 'opened') throw new CliFailure('unavailable',
      opened.value.status === 'unavailable' ? opened.value.message : 'Cannot watch an unresolved project', opened.value);
    token = opened.value.token;
    const subscribed = await connection.subscribe({ token }, enqueue);
    if (!subscribed.ok) throw serviceFailure(subscribed.error);
    subscription = subscribed.value.subscription;
    const current = subscribed.value.current;
    lastSequence = 0;
    publish({ schemaVersion: 'ramify.watch/1', event: 'status', current },
      `Watching ${current.selection.root} (context ${token.context}, generation ${token.generation})`);
    if (current.published) await render(current.published, 0);
  }
  try {
    while (!control.signal?.aborted) {
      if (queueFailure) throw queueFailure;
      if (connection.state !== 'connected') {
        const reason = connection.reason ?? { kind: 'closed' as const };
        if (['failure', 'slow-consumer'].includes(reason.kind) && recoveryCount++ === 0) {
          if (reason.kind === 'slow-consumer') environment.stderr('Disconnected: this client fell behind; resubscribing\n');
          const recovered = await connection.recover('automatic');
          if (recovered.status !== 'recovered') throw recovered.status === 'stopped'
            ? new CliFailure('stopped', 'Daemon stopped explicitly', recovered.record) : disconnectFailure(recovered.reason);
          environment.stderr(`Reconnected to daemon ${recovered.instance.pid} (restarted: ${recovered.restarted ? 'yes; generations changed' : 'no'})\n`);
          queue.splice(0); subscription = undefined; token = undefined;
          continue;
        }
        throw disconnectFailure(reason);
      }
      try {
        if (!subscription) await subscribe();
        const event = queue.shift();
        if (!event) { await pause(); continue; }
        if (event.type === 'context-evicted') {
          publish({ schemaVersion: 'ramify.watch/1', event: 'evicted', reason: event.reason },
            `Context ${event.token.context} evicted (${event.reason})`);
          if (reopenCount++ > 0) throw new CliFailure('unavailable', 'Watched context was evicted repeatedly', event);
          if (subscription) await connection.unsubscribe({ subscription });
          if (token) await connection.closeContext({ token });
          queue.splice(0);
          await subscribe();
          environment.stderr(`Context reopened with generation ${token!.generation}\n`);
        } else if (event.type === 'revision-published') await render(event.revision, event.coalesced);
        else publish({ schemaVersion: 'ramify.watch/1', event: 'status', current: event.current },
          `Status: ${event.current.state}; ${event.current.synchronization}; watcher ${event.current.watcher}`);
      } catch (error) {
        control.signal?.throwIfAborted();
        // Transport loss during a fetch follows the same recovery path as an
        // idle disconnect. The old event is discarded when resubscribing.
        if (connection.state !== 'connected') continue;
        throw error;
      }
    }
    return 130;
  } finally {
    wake?.();
    try {
      if (connection.state === 'connected') {
        if (subscription) await connection.unsubscribe({ subscription });
        if (token) await connection.closeContext({ token });
      }
    } finally { queue.splice(0); await connection.close(); }
  }
}
