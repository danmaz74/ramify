import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment, type QuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { ContextEvent, ContextSetup } from '../../../daemon/src/context-types.js';
import { createControlledClock, type ControlledClock } from '../../../daemon/subs/contexts/src/tests/controlled-ports.js';
import { createProjectBinding, type BindingState, type ProjectBinding, type ProjectBindingConnector } from '../project-binding.js';
import { createFakeConnector, unresolvedOpen, type FakeConnector } from './project-binding-fakes.js';

const setup: ContextSetup = { registry: 'default', capabilities: ['registry', 'layout', 'metadata', 'descriptions',
  'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access',
  'symbol-free-access', 'resource-access', 'coverage'] };

async function flush(rounds = 20): Promise<void> {
  for (let round = 0; round < rounds; round++) await new Promise(resolve => setImmediate(resolve));
}
async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Condition not reached');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-project-binding-')));
  try {
    for (const [path, value] of Object.entries({
      'module.ramify': 'ramify 1\nmodule fixture\nexpose-src value from "interfaces/api.ts" to descendants\n',
      'README.md': '# Fixture\n\nA project binding fixture.\n',
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
      'src/interfaces/api.ts': 'export const value = 1;\n',
      'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
      'subs/consumer/README.md': '# Consumer\n\nConsumes the value.\n',
      'subs/consumer/src/use.ts': "import { value } from '../../../src/interfaces/api.js'; void value;\n",
    })) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), value);
    }
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** Record every distinct binding state as the test drives it. */
function recorder(binding: () => ProjectBinding | undefined) {
  const states: BindingState['kind'][] = [];
  return {
    states,
    sample() {
      const kind = binding()?.state().kind;
      if (kind && states.at(-1) !== kind) states.push(kind);
      return kind;
    },
  };
}

async function daemonStatus(environment: QuickEnvironment) {
  const status = await environment.service.daemonStatus();
  if (!status.ok) throw new Error(JSON.stringify(status));
  return status.value;
}

describe('project binding over the real resident service', () => {
  it('RS01: start opens and subscribes, then reports ready with the daemon token', () => fixture(async root => {
    const environment = await createQuickEnvironment();
    let binding: ProjectBinding | undefined;
    try {
      const starts: string[] = [];
      binding = createProjectBinding({ root, setup, clock: environment.clock,
        connect: ({ start }) => { starts.push(start); return environment.connect({ start }); } });
      expect(binding.root).toBe(root);
      expect(binding.state()).toEqual({ kind: 'connecting' });
      expect(binding.service()).toBeNull();
      await until(() => binding!.state().kind !== 'connecting');
      const state = binding.state();
      if (state.kind !== 'ready') throw new Error(JSON.stringify(state));
      const status = await daemonStatus(environment);
      expect(status.contexts).toHaveLength(1);
      expect(status.contexts[0]!.token).toEqual(state.token);
      expect(status.contexts[0]!.selection.root).toBe(root);
      expect(status.contexts[0]!.leases.subscriptions).toBe(1);
      expect(status.subscriptions).toBe(1);
      expect(starts).toEqual(['if-needed']);
      const service = binding.service();
      expect(service).not.toBeNull();
      expect(await service!.contextStatus({ token: state.token })).toMatchObject({ ok: true, value: { token: state.token } });
    } finally { await binding?.close(); await environment.dispose(); }
  }), 60_000);

  it('RS02: a context-evicted event reopens with a new generation without external action', () => fixture(async root => {
    const environment = await createQuickEnvironment({ warmIdleMs: 10, coldRetainMs: 10 });
    let binding: ProjectBinding | undefined;
    try {
      const listeners: ((event: ContextEvent) => void)[] = [];
      const subscriptions: string[] = [];
      let raw: import('../../../daemon/src/interfaces/daemon.js').ServiceConnection | undefined;
      const connect: ProjectBindingConnector = async ({ start }) => {
        const outcome = await environment.connect({ start });
        if (outcome.status !== 'connected') return outcome;
        const connection = outcome.connection;
        raw = connection;
        return { ...outcome, connection: { ...connection, get state() { return connection.state; },
          get reason() { return connection.reason; },
          async subscribe(params, listener) {
            listeners.push(listener);
            const result = await connection.subscribe(params, listener);
            if (result.ok) subscriptions.push(result.value.subscription);
            return result;
          } } };
      };
      const events: string[] = [];
      binding = createProjectBinding({ root, setup, clock: environment.clock, connect, log: entry => { events.push(entry.event); } });
      await until(() => binding!.state().kind === 'ready');
      const first = binding.state();
      if (first.kind !== 'ready') throw new Error(JSON.stringify(first));
      // Release the subscription's hold so the real context manager evicts the context on idle.
      expect(await raw!.unsubscribe({ subscription: subscriptions[0]! })).toEqual({ ok: true, value: null });
      await until(async () => {
        environment.clock.advance(10);
        return (await daemonStatus(environment)).contexts.length === 0;
      });
      // The real eviction's notification reached no subscriber; deliver it at the binding boundary.
      listeners[0]!({ type: 'context-evicted', token: first.token, reason: 'idle' });
      expect(binding.state()).toEqual({ kind: 'connecting' });
      await until(() => binding!.state().kind === 'ready');
      const second = binding.state();
      if (second.kind !== 'ready') throw new Error(JSON.stringify(second));
      expect(second.token.context).toBe(first.token.context);
      expect(second.token.generation).not.toBe(first.token.generation);
      expect(events).toEqual(['binding-ready', 'binding-context-evicted', 'binding-ready']);
      const status = await daemonStatus(environment);
      expect(status.contexts.map(context => context.token)).toEqual([second.token]);
      expect(status.contexts[0]!.leases.subscriptions).toBe(1);
      expect(listeners).toHaveLength(2);
    } finally { await binding?.close(); await environment.dispose(); }
  }), 60_000);

  it('RS06: close releases the subscription, context and connection, twice without error', () => fixture(async root => {
    const environment = await createQuickEnvironment();
    let binding: ProjectBinding | undefined;
    try {
      const closes: number[] = [];
      binding = createProjectBinding({ root, setup, clock: environment.clock,
        connect: async ({ start }) => {
          const outcome = await environment.connect({ start });
          if (outcome.status !== 'connected') return outcome;
          const connection = outcome.connection;
          return { ...outcome, connection: { ...connection, get state() { return connection.state; },
            get reason() { return connection.reason; },
            close: async () => { closes.push(1); await connection.close(); } } };
        } });
      await until(() => binding!.state().kind === 'ready');
      expect((await daemonStatus(environment)).subscriptions).toBe(1);
      await binding.close();
      await binding.close();
      expect(binding.service()).toBeNull();
      expect(binding.state().kind).not.toBe('ready');
      const status = await daemonStatus(environment);
      expect(status.subscriptions).toBe(0);
      expect(status.contexts.every(context => context.leases.subscriptions === 0)).toBe(true);
      expect(status.connections).toBe(0);
      expect(closes).toHaveLength(1);
    } finally { await binding?.close(); await environment.dispose(); }
  }), 60_000);
});

describe('project binding transitions over a scripted connector', () => {
  async function scripted(fake: FakeConnector, run: (binding: ProjectBinding, clock: ControlledClock,
    record: ReturnType<typeof recorder>) => Promise<void>): Promise<void> {
    const clock = createControlledClock(1_000_000);
    const binding = createProjectBinding({ root: '/fixture', setup, clock, connect: fake.connect });
    const record = recorder(() => binding);
    try { await run(binding, clock, record); }
    finally { await binding.close(); expect(clock.pending).toBe(0); clock.dispose(); }
  }
  const step = async (clock: ControlledClock, ms: number) => { clock.advance(ms); await flush(); };

  it('RS03: a connection failure retries on the 1, 2, 5, 10, 30 s backoff and becomes ready when the daemon returns', async () => {
    const fake = createFakeConnector({ kind: 'broken', message: 'socket refused' });
    await scripted(fake, async (binding, clock, record) => {
      await flush(); record.sample();
      const delays: number[] = [];
      expect(binding.state()).toMatchObject({ kind: 'retrying', message: 'socket refused' });
      expect(fake.calls).toEqual(['if-needed']);
      for (const expected of [1000, 2000, 5000, 10_000, 30_000, 30_000]) {
        const state = binding.state();
        if (state.kind !== 'retrying') throw new Error(JSON.stringify(state));
        delays.push(state.nextAttemptAt - clock.now());
        await step(clock, expected - 1);
        const before = fake.calls.length;
        await step(clock, 1);
        expect(fake.calls.length - before).toBe(2);
        record.sample();
      }
      expect(delays).toEqual([1000, 2000, 5000, 10_000, 30_000, 30_000]);
      // Each retry first checks for an explicit stop, then may start the daemon.
      expect(fake.count('never')).toBe(6);
      expect(fake.count('if-needed')).toBe(7);
      fake.daemon = { kind: 'absent' };
      await step(clock, 30_000); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.count('never')).toBe(7);
      expect(fake.count('if-needed')).toBe(8);
      expect(binding.service()).toBe(fake.connections[0]!.connection);
      expect(fake.connections[0]!.subscriptions.size).toBe(1);

      // A later transport failure drops the context and restarts the backoff at 1 s.
      fake.daemon = { kind: 'broken', message: 'daemon crashed' };
      fake.connections[0]!.drop('unavailable', { kind: 'failure', message: 'daemon crashed' });
      record.sample();
      expect(binding.state()).toMatchObject({ kind: 'retrying', message: 'daemon crashed', nextAttemptAt: clock.now() + 1000 });
      expect(binding.service()).toBeNull();
      fake.daemon = { kind: 'running' };
      await step(clock, 1000); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.count('never')).toBe(8);
      expect(fake.count('if-needed')).toBe(8);
      expect(record.states).toEqual(['retrying', 'ready', 'retrying', 'ready']);

      // Idle exit is treated as a failure, not an explicit stop.
      fake.daemon = { kind: 'stopped', reason: 'idle' };
      fake.connections[1]!.drop('stopped', { kind: 'idle-exit' }); record.sample();
      expect(binding.state()).toMatchObject({ kind: 'retrying', nextAttemptAt: clock.now() + 1000 });
      await step(clock, 1000); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.count('never')).toBe(9);
      expect(fake.count('if-needed')).toBe(9);
    });
  });

  it('RS04: an explicit stop pauses without starting the daemon and resumes after another client starts it', async () => {
    const fake = createFakeConnector();
    await scripted(fake, async (binding, clock, record) => {
      await flush(); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.calls).toEqual(['if-needed']);

      fake.daemon = { kind: 'stopped', reason: 'explicit' };
      fake.connections[0]!.drop('stopped', { kind: 'explicit-stop', requestId: 'stop-1' }); record.sample();
      expect(binding.state()).toEqual({ kind: 'daemon-stopped' });
      expect(binding.service()).toBeNull();
      await step(clock, 4999);
      expect(fake.calls).toHaveLength(1);
      for (let poll = 1; poll <= 3; poll++) {
        await step(clock, poll === 1 ? 1 : 5000); record.sample();
        expect(binding.state()).toEqual({ kind: 'daemon-stopped' });
      }
      expect(fake.count('never')).toBe(3);
      expect(fake.count('if-needed')).toBe(1);

      // Another client starts the daemon: the next poll reconnects and reopens.
      fake.daemon = { kind: 'running' };
      await step(clock, 5000); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.count('never')).toBe(4);
      expect(fake.count('if-needed')).toBe(1);

      // A stopped record with reason explicit, seen after an ambiguous failure, also pauses.
      fake.daemon = { kind: 'stopped', reason: 'explicit' };
      fake.connections[1]!.drop('unavailable', { kind: 'failure', message: 'socket closed' }); record.sample();
      await step(clock, 1000); record.sample();
      expect(binding.state()).toEqual({ kind: 'daemon-stopped' });
      for (let poll = 0; poll < 4; poll++) await step(clock, 5000);
      record.sample();
      expect(binding.state()).toEqual({ kind: 'daemon-stopped' });
      expect(fake.count('never')).toBe(9);
      expect(fake.count('if-needed')).toBe(1);
      expect(record.states).toEqual(['ready', 'daemon-stopped', 'ready', 'retrying', 'daemon-stopped']);
    });
  });

  it('RS05: an unresolved project is project-unavailable, retried every 30 s, then ready once resolvable', async () => {
    const connector = createFakeConnector();
    const clock = createControlledClock(0);
    const original = connector.connect;
    let scriptedOpen = false;
    const connect: ProjectBindingConnector = async request => {
      const outcome = await original(request);
      if (!scriptedOpen && outcome.status === 'connected') {
        scriptedOpen = true;
        const connection = connector.connections.at(-1)!;
        connection.scriptOpen(() => unresolvedOpen('No module.ramify at the project root'));
        connection.scriptOpen(() => ({ status: 'unavailable', reason: 'resource-unavailable', message: 'Context budget exhausted' }));
      }
      return outcome;
    };
    const binding = createProjectBinding({ root: '/fixture', setup, clock, connect });
    const record = recorder(() => binding);
    try {
      await flush(); record.sample();
      expect(binding.state()).toEqual({ kind: 'project-unavailable', message: 'No module.ramify at the project root' });
      expect(binding.service()).toBeNull();
      await step(clock, 29_999);
      expect(connector.connections[0]!.openCalls).toBe(1);
      await step(clock, 1); record.sample();
      expect(binding.state()).toEqual({ kind: 'project-unavailable', message: 'Context budget exhausted' });
      expect(connector.connections[0]!.openCalls).toBe(2);
      await step(clock, 30_000); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(connector.connections[0]!.openCalls).toBe(3);
      expect(connector.connections).toHaveLength(1);
      expect(connector.count('if-needed')).toBe(1);
      expect(connector.count('never')).toBe(0);
      expect(record.states).toEqual(['project-unavailable', 'ready']);
    } finally { await binding.close(); expect(clock.pending).toBe(0); clock.dispose(); }
  });

  it('serializes opens: a superseded attempt closes what it acquired before the next one opens', async () => {
    const fake = createFakeConnector();
    await scripted(fake, async (binding, clock, record) => {
      await flush(); record.sample();
      const connection = fake.connections[0]!;
      const initial = binding.state();
      if (initial.kind !== 'ready') throw new Error(JSON.stringify(initial));
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      connection.scriptOpen(async token => { await gate; return { status: 'opened', token, created: true, current: { token } as never }; });
      connection.emit({ type: 'context-evicted', token: initial.token, reason: 'pressure' });
      await flush(); record.sample();
      expect(binding.state().kind).toBe('connecting');
      // A second eviction for the stale token and an unrelated event change nothing.
      connection.emit({ type: 'context-evicted', token: initial.token, reason: 'pressure' });
      // The daemon fails while the reopen waits; its retry must not overlap the pending open.
      fake.connections[0]!.drop('unavailable', { kind: 'failure', message: 'lost during open' });
      record.sample();
      await step(clock, 1000);
      expect(fake.connections).toHaveLength(1);
      release();
      await flush(); record.sample();
      expect(binding.state().kind).toBe('ready');
      expect(fake.connections).toHaveLength(2);
      expect(Math.max(...fake.connections.map(item => item.maxConcurrentOpens))).toBe(1);
      expect(fake.connections[1]!.contexts.size).toBe(1);
      expect(record.states).toEqual(['ready', 'connecting', 'retrying', 'ready']);
    });
  });

  it('closes what a superseded attempt acquired after close()', async () => {
    const fake = createFakeConnector();
    const clock = createControlledClock(0);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const binding = createProjectBinding({ root: '/fixture', setup, clock, connect: async request => {
      await gate;
      return fake.connect(request);
    } });
    await flush();
    const closing = binding.close();
    release();
    await closing;
    await binding.close();
    expect(fake.connections).toHaveLength(1);
    expect(fake.connections[0]!.closed).toBe(true);
    expect(fake.connections[0]!.openCalls).toBe(0);
    expect(binding.service()).toBeNull();
    expect(clock.pending).toBe(0);
    clock.dispose();
  });
});
