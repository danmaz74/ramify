import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ipcFixture } from '../../subs/daemon/src/tests/ipc-fixture.js';
import { socketFixture, eventually } from '../../subs/daemon/src/tests/socket-fixture.js';
import { createFrameDecoder, decodeMessage, encodeJsonFrame, encodeMessage } from '../../subs/daemon/src/codec.js';
import type { ContextToken } from '../../subs/daemon/src/context-types.js';
import type { WireMessage } from '../../subs/daemon/src/interfaces/daemon.js';
import { recordObservation } from './observations.js';
import type { Assertions, InstanceHandler } from './runner.js';

async function opened(fixture: Awaited<ReturnType<typeof ipcFixture>>, client: Awaited<ReturnType<typeof fixture.connect>>) {
  const result = await client.openContext(fixture.params);
  if (!result.ok || result.value.status !== 'opened') throw new Error(`IPC fixture did not open: ${JSON.stringify(result)}`);
  return result.value;
}
async function checked(client: Awaited<ReturnType<Awaited<ReturnType<typeof ipcFixture>>['connect']>>, token: ContextToken, requestId: string) {
  const result = await client.check({ token, requestId, freshness: { mode: 'synchronized', expect: [] } });
  if (!result.ok || result.value.status !== 'reported' || !result.value.published) throw new Error(`IPC fixture did not publish: ${JSON.stringify(result)}`);
  return result.value;
}
function memory(run: (assertions: Assertions) => Promise<void>): InstanceHandler {
  return { kind: 'memory', run: ({ assertions }) => run(assertions) };
}
const handlers: [string, InstanceHandler][] = [];
function add(id: string, run: (assertions: Assertions) => Promise<void>) { handlers.push([id, memory(run)]); }

add('I2-14:framing-roundtrip', async assertions => {
  const fixture = await ipcFixture(), pair = await socketFixture();
  try {
    const client = await fixture.connect(), context = await opened(fixture, client), report = await checked(client, context.token, 'roundtrip');
    const messages: WireMessage[] = [
      { type: 'hello', handshake: { protocol: 'ramify.ipc/1', client: { name: 'reference', version: '0.0.0' }, buildKey: fixture.endpoint.buildKey, engine: fixture.environment.service.instance.engine } },
      { type: 'welcome', welcome: client.daemon },
      { type: 'reject', daemon: fixture.environment.service.instance, error: { code: 'incompatible', message: 'test mismatch', details: { client: 'old' } } },
      { type: 'request', id: '1', op: 'check', params: { token: context.token } },
      { type: 'cancel', id: '1' }, { type: 'response', id: '1', result: { ok: true, value: report } },
      { type: 'event', seq: 1, subscription: 'fixture', event: { type: 'revision-published', token: context.token, revision: report.revision, coalesced: 0 } },
      { type: 'ping' }, { type: 'pong' }, { type: 'goodbye', reason: { kind: 'closed' } },
    ];
    const decoded: unknown[] = [];
    const decoder = createFrameDecoder(16 * 1024 ** 2, value => decoded.push(decodeMessage(encodeJsonFrame(value, 16 * 1024 ** 2))));
    pair.host.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes));
    for (const message of messages) {
      const frame = encodeMessage(message); pair.client.write(frame.subarray(0, 2)); pair.client.write(frame.subarray(2));
    }
    await eventually(() => decoded.length === messages.length);
    assertions.equal('all ten message envelopes retain their exact data through real socket fragments', decoded, messages);
    recordObservation('ipc-framing', { types: messages.map(value => value.type), revision: report.revision.revision });
  } finally { await pair.dispose(); await fixture.dispose(); }
});

add('I2-14:malformed-frame', async assertions => {
  const fixture = await ipcFixture();
  try {
    const frames = [Buffer.alloc(4), Buffer.from([0, 0]), Buffer.from([0, 0, 0, 1, 255]), encodeJsonFrame(null, 100)];
    for (const [index, frame] of frames.entries()) {
      const raw = await fixture.raw(false); raw.socket.end(frame); await raw.closed;
      assertions.ok(`malformed frame ${index} receives failure goodbye`, raw.messages.some(value => value.type === 'goodbye' && value.reason.kind === 'failure'));
    }
    const client = await fixture.connect(); assertions.ok('host still serves another client', (await client.daemonStatus()).ok);
  } finally { await fixture.dispose(); }
});

add('I2-14:oversized-request', async assertions => {
  const fixture = await ipcFixture();
  try {
    const raw = await fixture.raw(false), header = Buffer.alloc(4); header.writeUInt32BE(1024 ** 2 + 1);
    raw.socket.write(header); await raw.closed;
    assertions.ok('oversized header rejected before receiving or dispatching any body', raw.messages.some(value => value.type === 'goodbye' && value.reason.kind === 'failure'));
    const status = await fixture.environment.service.daemonStatus();
    assertions.ok('service status remains available', status.ok);
    if (status.ok) assertions.equal('no partial request opened a context', status.value.contexts.length, 0);
  } finally { await fixture.dispose(); }
});

add('I2-14:oversized-response', async assertions => {
  const fixture = await ipcFixture({ maxResponseBytes: 2048 });
  try {
    const client = await fixture.connect();
    const direct = await fixture.environment.service.openContext(fixture.params);
    if (!direct.ok || direct.value.status !== 'opened') throw new Error('Fixture context failed');
    const result = await client.check({ token: direct.value.token, requestId: 'oversized', freshness: { mode: 'synchronized', expect: [] } });
    assertions.ok('the complete report exceeds the configured response bound', !result.ok && result.error.code === 'resource-unavailable');
    const other = await client.stopDaemon({ instanceId: 'wrong' });
    assertions.ok('the same connection still returns an ordinary service error', !other.ok && other.error.code === 'wrong-instance');
  } finally { await fixture.dispose(); }
});

add('I2-14:token-preservation', async assertions => {
  const fixture = await ipcFixture();
  try {
    const client = await fixture.connect(), context = await opened(fixture, client), report = await checked(client, context.token, 'tokens');
    const direct = await fixture.environment.service.check({ token: context.token, requestId: 'tokens', freshness: { mode: 'published', revision: report.revision.revision, wait: false } });
    const wire = await client.check({ token: context.token, requestId: 'tokens', freshness: { mode: 'published', revision: report.revision.revision, wait: false } });
    assertions.equal('named published revision and report survive IPC byte for byte', wire, direct);
    assertions.equal('context status uses the same exact token', await client.contextStatus({ token: context.token }), await fixture.environment.service.contextStatus({ token: context.token }));
  } finally { await fixture.dispose(); }
});

add('I2-14:handshake-incompatible', async assertions => {
  const fixture = await ipcFixture();
  try {
    for (const [index, change] of [{ protocol: 'ramify.ipc/0' }, { buildKey: 'ffffffffffffffff' }].entries()) {
      const raw = await fixture.raw(false);
      raw.socket.write(encodeJsonFrame({ type: 'hello', handshake: { protocol: 'ramify.ipc/1', buildKey: fixture.endpoint.buildKey,
        engine: fixture.environment.service.instance.engine, client: { name: 'test', version: 'old' }, ...change } }, 4096));
      await raw.closed;
      assertions.ok(`mismatch ${index} rejects while naming both versions`, raw.messages.some(value => value.type === 'reject'
        && value.error.code === 'incompatible' && value.error.message.includes('0.0.0') && value.error.message.includes('old')));
    }
    const client = await fixture.connect(); assertions.ok('compatible client remains served', (await client.daemonStatus()).ok);
    // Build identity is tested against a disposable complete package, keeping
    // shared dist immutable while this handler is running.
    const { discoveryFixture } = await import('../../subs/daemon/src/tests/discovery-fixture.js');
    const { selectEndpoint } = await import('../../subs/daemon/src/discovery.js');
    const build = await discoveryFixture();
    try {
      const entry = await readFile(build.launch.daemonEntry);
      await writeFile(join(build.packageRoot, 'dist/subs/analysis/src/index.js'), 'export const changed = true;');
      const changed = await selectEndpoint(build.options);
      assertions.ok('an imported runtime edit changes the endpoint group', changed.buildKey !== build.endpoint.buildKey);
      assertions.equal('the daemon entry bytes stayed identical', await readFile(build.launch.daemonEntry), entry);
    } finally { await build.dispose(); }
  } finally { await fixture.dispose(); }
});

add('I2-14:cancel-frame', async assertions => {
  const fixture = await ipcFixture();
  try {
    const client = await fixture.connect(), context = await opened(fixture, client);
    const controller = new AbortController();
    const result = client.check({ token: context.token, requestId: 'cancel-frame', freshness: { mode: 'synchronized', expect: [] } }, { signal: controller.signal });
    controller.abort();
    assertions.equal('cancel reaches the real queued operation under its own request id', await result, { ok: true, value: { status: 'cancelled', requestId: 'cancel-frame' } });
  } finally { await fixture.dispose(); }
});

add('I2-15:connect-validation', async assertions => {
  const fixture = await ipcFixture({}, true);
  try {
    const client = await fixture.connect(), params = { invalid: 'field' } as never;
    assertions.equal('public connectDaemon uses the same structural service validation', await client.openContext(params), await fixture.environment.service.openContext(params));
  } finally { await fixture.dispose(); }
});
add('I2-15:lease-release-on-close', async assertions => {
  const fixture = await ipcFixture({}, true);
  try {
    const client = await fixture.connect(), context = await opened(fixture, client);
    const subscription = await client.subscribe({ token: context.token }, () => {});
    assertions.ok('subscription opened across the public client', subscription.ok);
    const before = await fixture.environment.service.daemonStatus();
    assertions.ok('host holds a subscription lease', before.ok && before.value.subscriptions === 1);
    await client.close();
    const after = await fixture.environment.service.daemonStatus();
    assertions.ok('close resolves after the host releases its subscription', after.ok && after.value.subscriptions === 0);
  } finally { await fixture.dispose(); }
});

add('I2-16:ordering-per-context', async assertions => {
  const fixture = await ipcFixture();
  try {
    const client = await fixture.connect(), first = await opened(fixture, client);
    const other = join(fixture.directory, 'other'); await mkdir(join(other, 'src'), { recursive: true });
    for (const path of ['module.ramify', 'README.md', 'tsconfig.json', 'src/index.ts']) await copyFile(join(fixture.project, path), join(other, path));
    const second = await client.openContext({ ...fixture.params, project: { ...fixture.params.project, cwd: other, root: other } });
    if (!second.ok || second.value.status !== 'opened') throw new Error('Second context failed');
    const raw = await fixture.raw();
    raw.send({ type: 'request', id: 'sub-a', op: 'subscribe', params: { token: first.token } });
    raw.send({ type: 'request', id: 'sub-b', op: 'subscribe', params: { token: second.value.token } });
    await eventually(() => raw.messages.filter(value => value.type === 'response').length === 2);
    for (let index = 0; index < 4; index++) {
      const root = index % 2 ? other : fixture.project, token = index % 2 ? second.value.token : first.token;
      await writeFile(join(root, 'src/index.ts'), `export const value = ${index + 2};\n`);
      await checked(client, token, `ordered-${index}`);
    }
    await eventually(() => raw.messages.filter(value => value.type === 'event' && value.event.type === 'revision-published').length >= 4);
    const events = raw.messages.filter((value): value is Extract<WireMessage, { type: 'event' }> => value.type === 'event');
    assertions.ok('connection event sequence increases strictly', events.every((value, index) => index === 0 || value.seq > events[index - 1].seq));
    for (const [index, token] of [first.token, second.value.token].entries()) {
      const revisions = events.filter(value => value.event.type === 'revision-published' && value.event.token.context === token.context)
        .map(value => value.event.type === 'revision-published' ? value.event.revision.sequence : 0);
      assertions.ok(`context ${index} revision sequence increases strictly`, revisions.length >= 2 && revisions.every((value, i) => i === 0 || value > revisions[i - 1]));
    }
  } finally { await fixture.dispose(); }
});

add('I2-16:reconnect-no-replay', async assertions => {
  const fixture = await ipcFixture();
  try {
    const first = await fixture.connect(), context = await opened(fixture, first);
    await first.subscribe({ token: context.token }, () => {}); await first.close();
    const producer = await fixture.connect();
    await writeFile(join(fixture.project, 'src/index.ts'), 'export const value = 2;\n'); await checked(producer, context.token, 'changed-1');
    await writeFile(join(fixture.project, 'src/index.ts'), 'export const value = 3;\n'); const latest = await checked(producer, context.token, 'changed-2');
    const next = await fixture.connect(), events: unknown[] = [];
    const subscribed = await next.subscribe({ token: context.token }, event => events.push(event));
    assertions.ok('reconnected subscription explicitly offers no replay', subscribed.ok && subscribed.value.replay === 'not-available');
    if (subscribed.ok) assertions.equal('resynchronization names the newest revision', subscribed.value.current.published?.revision, latest.revision.revision);
    await next.daemonStatus(); assertions.equal('no historical events replayed', events, []);
  } finally { await fixture.dispose(); }
});

add('I2-14:error-preservation', async assertions => {
  const { createAnalysisDriverFromSessions } = await import('../../src/resident-assembly.js');
  const realDriver = createAnalysisDriverFromSessions();
  let incomplete = false;
  const fixture = await ipcFixture({}, false, { ...realDriver, async check(inputs, control) {
    const run = await realDriver.check(inputs, control);
    if (!incomplete || run.status !== 'reported') return run;
    return { ...run, retained: null, report: { ...run.report, outcome: { execution: 'incomplete', check: 'not-run', coverage: 'not-run' },
      summary: { ...run.report.summary, complete: false } } };
  } });
  try {
    const { createProjectFixture } = await import('./fixtures/plan1/project.js');
    await createProjectFixture(fixture.project);
    const client = await fixture.connect(), context = await opened(fixture, client);
    const baseline = await checked(client, context.token, 'baseline');
    assertions.equal('independent baseline passes before the denial edit', baseline.report.outcome.check, 'passed');
    await writeFile(join(fixture.project, 'subs/provider/module.ramify'), 'ramify 1\nmodule provider\n');
    const denied = await checked(client, context.token, 'denial');
    assertions.ok('a denied import remains a published domain report', denied.report.summary.denied > 0 && denied.published);
    await writeFile(join(fixture.project, 'module.ramify'), 'invalid declaration\n');
    const invalid = await checked(client, context.token, 'invalid');
    assertions.equal('invalid descriptions retain the invalid execution discriminator', invalid.report.outcome.execution, 'invalid');
    const unavailable = await client.check({ token: { ...context.token, context: `ctx/1:${'f'.repeat(64)}` }, requestId: 'unknown', freshness: { mode: 'published', wait: false } });
    assertions.ok('unknown context stays a domain unavailable value', unavailable.ok && unavailable.value.status === 'unavailable');
    const superseded = await client.check({ token: context.token, requestId: 'expect', freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: '0'.repeat(64) }] } });
    assertions.ok('mismatched expected contents stay a superseded domain value', superseded.ok && superseded.value.status === 'superseded');
    incomplete = true;
    const unpublished = await client.check({ token: context.token, requestId: 'incomplete', freshness: { mode: 'synchronized', expect: [] } });
    assertions.ok('controlled unsealed completion crosses IPC without becoming a service error', unpublished.ok && unpublished.value.status === 'reported'
      && unpublished.value.published === false && unpublished.value.report.outcome.execution === 'incomplete');
    recordObservation('ipc-error-preservation', { outcomes: ['denied', 'invalid', 'unavailable', 'superseded', 'incomplete'],
      incompleteBoundary: 'real driver report with controlled unsealed completion' });
  } finally { await fixture.dispose(); }
});

async function blockedNotifications(assertions: Assertions, evict: boolean) {
  const fixture = await ipcFixture();
  try {
    // A real large metadata report fills the Unix socket's send buffer, keeping
    // subsequent small notifications in the production outbound queue.
    await writeFile(join(fixture.project, 'README.md'), `# Large\n\n${'Metadata '.repeat(70_000)}\n`);
    const producer = await fixture.connect(), context = await opened(fixture, producer);
    const initial = await checked(producer, context.token, 'large-baseline');
    assertions.ok('real report is large enough to exercise kernel backpressure', Buffer.byteLength(JSON.stringify(initial)) > 512 * 1024);
    const raw = await fixture.raw(); raw.send({ type: 'request', id: 'subscribe', op: 'subscribe', params: { token: context.token } });
    await eventually(() => raw.messages.some(value => value.type === 'response' && value.id === 'subscribe'));
    raw.socket.pause();
    raw.send({ type: 'request', id: 'block', op: 'check', params: { token: context.token, requestId: 'block', freshness: { mode: 'published', wait: false } } });
    await new Promise(resolve => setTimeout(resolve, 50));
    let latest = initial;
    for (let index = 0; index < 10; index++) {
      await writeFile(join(fixture.project, 'src/index.ts'), `export const value = ${index + 10};\n`);
      const result = await fixture.environment.service.check({ token: context.token, requestId: `queued-${index}`, freshness: { mode: 'synchronized', expect: [] } });
      if (!result.ok || result.value.status !== 'reported' || !result.value.published) throw new Error('Publication failed while socket blocked');
      latest = result.value;
    }
    if (evict) {
      // Explicit context closure evicts only an unleased context; release this
      // subscription through a raw request before asking the context to close.
      // Service disposal deterministically emits the nonreplaceable event while
      // the still-owned transport queue remains blocked.
      await fixture.environment.service.dispose();
    }
    raw.socket.resume();
    await eventually(() => raw.messages.some(value => value.type === 'event' && value.event.type === (evict ? 'context-evicted' : 'revision-published')), 5000);
    const revisions = raw.messages.filter((value): value is Extract<WireMessage, { type: 'event' }> => value.type === 'event' && value.event.type === 'revision-published');
    assertions.equal('ten blocked publications coalesce to one delivered revision', revisions.length, 1);
    const revision = revisions[0].event;
    if (revision.type !== 'revision-published') throw new Error('Revision missing');
    assertions.equal('coalesced count records nine replaced revisions', revision.coalesced, 9);
    assertions.equal('queued event retains the newest revision', revision.revision.revision, latest.revision.revision);
    if (evict) {
      const eviction = raw.messages.find(value => value.type === 'event' && value.event.type === 'context-evicted');
      assertions.ok('nonreplaceable eviction follows the coalesced revision', eviction?.type === 'event' && eviction.seq > revisions[0].seq);
    } else {
      const fetched = await producer.check({ token: context.token, requestId: 'fetch', freshness: { mode: 'published', wait: false, revision: latest.revision.revision } });
      assertions.ok('the newest event names a retrievable exact report', fetched.ok && fetched.value.status === 'reported' && fetched.value.published
        && fetched.value.revision.revision === latest.revision.revision);
    }
    recordObservation('ipc-backpressure', { publications: 10, coalesced: revision.coalesced, revision: revision.revision.revision, eviction: evict });
  } finally { await fixture.dispose(); }
}
add('I2-16:coalesce-replaceable', assertions => blockedNotifications(assertions, false));
add('I2-16:non-replaceable-kept', assertions => blockedNotifications(assertions, true));
add('I2-16:slow-consumer-disconnect', async assertions => {
  const fixture = await ipcFixture({ maxOutboundBytes: 8 * 1024 ** 2 });
  try {
    await writeFile(join(fixture.project, 'README.md'), `# Large\n\n${'Metadata '.repeat(70_000)}\n`);
    const client = await fixture.connect(), context = await opened(fixture, client);
    await checked(client, context.token, 'baseline');
    const raw = await fixture.raw(); raw.send({ type: 'request', id: 'subscribe', op: 'subscribe', params: { token: context.token } });
    await eventually(() => raw.messages.some(value => value.type === 'response' && value.id === 'subscribe'));
    raw.socket.pause();
    for (let index = 0; index < 15; index++) raw.send({ type: 'request', id: `flood-${index}`, op: 'check',
      params: { token: context.token, requestId: `flood-${index}`, freshness: { mode: 'published', wait: false } } });
    await new Promise(resolve => setTimeout(resolve, 1200));
    const status = await fixture.environment.service.daemonStatus();
    assertions.ok('bounded queue disconnects its slow consumer', status.ok && status.value.counters.disconnectedSlowConsumers === 1);
    assertions.ok('slow consumer subscription lease is released', status.ok && status.value.subscriptions === 0);
    raw.socket.resume(); await raw.closed;
    assertions.ok('slow-consumer goodbye was attempted or socket destroyed after its bounded grace', raw.socket.destroyed);
    assertions.ok('another connection is still served', (await client.daemonStatus()).ok);
  } finally { await fixture.dispose(); }
});

export const ipcHandlers: ReadonlyMap<string, InstanceHandler> = new Map(handlers);
