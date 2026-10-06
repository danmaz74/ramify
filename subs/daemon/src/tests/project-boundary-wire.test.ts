import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFrameDecoder, decodeMessage, encodeJsonFrame, encodeMessage, validateServiceReply, validateWireMessage } from '../codec.js';
import { openSocketConnection } from '../connection.js';
import type { EndpointSelection, WireMessage } from '../interfaces/daemon.js';
import type { CheckOutcome, ContextEvent, ContextRevision, ContextStatus, ContextToken, PathCheckDisposition } from '../../subs/contexts/src/interfaces/contexts.js';
import type { ProjectExclusion } from '../../../analysis/subs/project/src/interfaces/project.js';
import { alive, capabilities, descendants, engine, unwrap, until, version, withDaemonProcess } from './daemon-process.js';

/**
 * PB1-25 (schema and transport coherence): the changed check's named paths, classification
 * sequence and dispositions, the `classification-changed` status and the status's watcher
 * registrations cross the worker and real IPC under `ramify.ipc/2`; stale or foreign peers
 * are rejected coherently; the strict codecs reject malformed new variants. Expected values
 * come from the contracts ("Reports, affected queries and freshness", "Transport, observation
 * and projections", "Schema versions") and the fixture, never from the implementation.
 */
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const exclusion = (kind: ProjectExclusion['kind'], directory: string, owner: string | null = null): ProjectExclusion => ({ kind, directory, owner });
const token: ContextToken = { context: `ctx/1:${'c'.repeat(64)}`, generation: 'gen/1:00000000-0000-4000-8000-000000000016' };
const revision: ContextRevision = {
  token, revision: 'rev/1:00000000-0000-4000-8000-000000000016:2', sequence: 2, publishedAt: 1, cause: 'watch',
  fingerprints: { inputId: 'input/1:x', declarations: 'd', source: 's', configuration: 'c', registry: 'r', engine: 'e' },
  changed: ['module.ramify'], checked: { path: 'broad', files: [], accesses: 0, modelRebuilt: true },
  delta: { added: 0, removed: 0, positionOnly: 0 },
  timings: { classify: 0, inventory: 0, compiler: 0, descriptions: 0, accesses: 0, link: 0, decide: 0, companions: 0, publish: 0, total: 0 },
  capture: { invocationCheck: 0, promotion: 0, workerStatus: 0, workerRoundTrip: 0, sweep: 0, watch: null },
  outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
  summary: { complete: true, owners: 1, sourceFiles: 1, resources: 0, originals: 1, accesses: 0, allowed: 0, denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 },
};
const ignored = exclusion('owned-unwired', 'vendor', 'app');
const settledPaths: PathCheckDisposition[] = [
  { path: 'vendor/src/x.ts', disposition: 'not-analyzed', module: 'app', exclusion: ignored, reason: 'owned-unwired' },
  { path: 'external-tree/y.ts', disposition: 'not-analyzed', module: null, exclusion: exclusion('external', 'external-tree'), reason: 'external' },
  { path: 'src/tmp/scratch.ts', disposition: 'not-analyzed', module: 'app', exclusion: exclusion('scratch', 'src/tmp', 'app'), reason: 'scratch' },
  { path: 'node_modules/pkg/index.js', disposition: 'not-analyzed', module: null, exclusion: exclusion('packages', 'node_modules'), reason: 'reserved' },
];
const changed: CheckOutcome = { status: 'classification-changed', requestId: 'wire-1', revision,
  paths: [{ path: 'src/main.ts', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' }, ...settledPaths] };
const reported: CheckOutcome = { status: 'reported', requestId: 'wire-2', published: true, revision,
  freshness: { mode: 'synchronized', acknowledged: 1, captureStarted: 2, verified: true, reusedRevision: false },
  delta: { since: null, findings: [], removed: [], warnings: [], coverage: [] }, report: null,
  paths: [{ path: 'src/main.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: sha('main') },
    { path: 'src/gone.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'deleted', sha256: null },
    { path: 'docs/notes.md', disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
    { path: 'src/late.ts', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'superseded' }, ...settledPaths],
  timings: { invocationCheck: 0, promotion: 0, workerStatus: 0, workerRoundTrip: 0, sweep: 0, publication: 0, service: 1 } };
const ok = (value: unknown) => ({ ok: true, value });
type Mutable = Record<string, unknown>;
const at = (outcome: CheckOutcome, index: number, change: Mutable): Mutable => {
  const paths = [...(outcome as unknown as { paths: PathCheckDisposition[] }).paths];
  paths[index] = { ...paths[index], ...change } as PathCheckDisposition;
  return { ...outcome, paths };
};
const without = (value: object, key: string): Mutable => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

describe('PB1-25: strict codecs reject malformed new variants', () => {
  it('accepts every disposition and the classification-changed status, and rejects each malformed variant', () => {
    expect(() => validateServiceReply('check', ok(changed))).not.toThrow();
    expect(() => validateServiceReply('check', ok(reported))).not.toThrow();
    const malformed: Mutable[] = [
      { ...changed, status: 'reclassified' },
      without(changed, 'paths'), { ...changed, paths: [] }, { ...changed, revision: null }, { ...changed, extra: true },
      // A classification answer carries no checked path and no superseded one.
      at(changed, 0, { disposition: 'checked', reason: 'content', sha256: sha('main') }), at(changed, 0, { reason: 'superseded' }),
      without(reported, 'paths'), { ...reported, published: false, revision: null, delta: null },
      at(reported, 0, { sha256: 'not-a-hash' }), at(reported, 0, { exclusion: ignored }), at(reported, 0, { module: null }),
      at(reported, 1, { sha256: sha('gone') }), at(reported, 1, { reason: 'removed' }),
      at(reported, 2, { sha256: sha('notes') }), at(reported, 2, { exclusion: ignored }), at(reported, 2, { module: null }),
      at(reported, 3, { reason: 'covered' }), at(reported, 3, { sha256: null }),
      at(reported, 4, { reason: 'external' }), at(reported, 4, { module: null }), at(reported, 5, { module: 'app' }),
      at(reported, 6, { exclusion: exclusion('owned-unwired', 'src/tmp', 'app') }), at(reported, 7, { exclusion: exclusion('scratch', 'src/tmp', 'app') }),
      at(reported, 0, { disposition: 'passed' }), at(reported, 0, { path: '../outside.ts' }), at(reported, 0, { path: '/abs.ts' }),
      at(reported, 0, { path: 'src/./main.ts' }), at(reported, 1, { path: 'src/main.ts' }),
      { ...reported, timings: { ...reported.timings, unknown: 1 } }, { ...reported, report: { schemaVersion: 'ramify.analysis/1' } },
    ];
    for (const value of malformed) expect(() => validateServiceReply('check', ok(value)), JSON.stringify(value).slice(0, 200)).toThrow('Invalid check reply schema');
    // Errors and other operations' values keep their existing shapes.
    expect(() => validateServiceReply('check', { ok: false, error: { code: 'invalid-request', message: 'x', details: {} } })).not.toThrow();
    expect(() => validateServiceReply('affected', ok({ status: 'reclassified' }))).not.toThrow();
  });

  it('decodes a status carrying its watcher registrations and rejects malformed registrations', () => {
    const ownership = { modules: [{ id: 'app', parent: null, directory: '.' }],
      exclusions: [exclusion('external', 'external-tree'), exclusion('scratch', 'src/tmp', 'app'), ignored] };
    const status = (registrations: unknown, watcher = 'active'): ContextStatus => ({ token, selection: { root: '/p', scope: 'whole-project',
      configuration: 'discover', setup: { registry: 'default', capabilities: [] } },
    scope: { root: '/p', selection: 'given', invokedFrom: '/p', configuration: '/p/tsconfig.json', walkedAreas: ['src'], ownership },
    state: 'warm', level: 'warm', session: null, synchronization: 'synchronized', published: revision, lastValid: revision,
    pending: { requests: 0, changedPaths: 0, analysisRunning: false }, history: { retained: 1, bytes: 1, oldest: revision.revision },
    retainedBytes: 0, leases: { subscriptions: 1, requests: 0 }, watcher, registrations, openedAt: 1, lastActivityAt: 1,
    demoting: false, unresponsiveSince: null } as ContextStatus);
    const event = (current: ContextStatus): WireMessage => ({ type: 'event', seq: 1, subscription: 's-1',
      event: { type: 'status-changed', token, current, coalesced: 0 } });
    const good = { sequence: 2, directories: 3, pruned: ['external-tree', 'src/tmp', 'vendor'], prunedCount: 3 };
    for (const value of [status(good), status({ sequence: null, directories: 1, pruned: [], prunedCount: 0 }), status(null, 'disposed'),
      status({ ...good, pruned: Array.from({ length: 20 }, (_, index) => `d${String(index).padStart(2, '0')}`), prunedCount: 25 })]) {
      expect(decodeMessage(encodeMessage(event(value)))).toEqual(event(value));
    }
    for (const value of [status(undefined), status(null), status(good, 'unavailable'), status({ ...good, sequence: 0 }),
      status({ ...good, pruned: ['vendor', 'src/tmp'] }), status({ ...good, pruned: ['vendor', 'vendor'], prunedCount: 2 }),
      status({ ...good, prunedCount: 4 }), status({ ...good, directories: -1 }), status(without(good, 'prunedCount')),
      status({ ...good, pruned: Array.from({ length: 21 }, (_, index) => `d${String(index).padStart(2, '0')}`), prunedCount: 21 })]) {
      expect(() => encodeMessage(event(value))).toThrow('Invalid IPC message schema');
    }
  });
});

describe('PB1-25: the client decodes check replies strictly over a real socket', () => {
  it('fails the connection on a malformed reply and accepts a well-formed one', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'rpb16-peer-')));
    const sockets = new Set<Socket>();
    const instance = { instanceId: 'fake-peer', pid: process.pid, version, engine, buildKey: 'fedcba9876543210' };
    const server = createServer(socket => {
      sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
      const decoder = createFrameDecoder(1024 ** 2, value => {
        const message = validateWireMessage(value);
        if (message.type === 'hello') socket.write(encodeMessage({ type: 'welcome', welcome: { protocol: 'ramify.ipc/2', instance,
          capabilities: ['contexts', 'check'], limits: { maxRequestBytes: 1024 ** 2, maxResponseBytes: 1024 ** 2, leaseMs: 1000, pingMs: 60_000 } } }));
        else if (message.type === 'request') {
          const params = message.params as { requestId: string };
          const value = params.requestId === 'well-formed' ? { ...changed, requestId: 'well-formed' }
            : { ...changed, requestId: params.requestId, paths: [{ ...changed.paths[0], sha256: sha('main') }] };
          socket.write(encodeJsonFrame({ type: 'response', id: message.id, result: { ok: true, value } }, 1024 ** 2));
        } else if (message.type === 'goodbye') socket.end();
      });
      socket.on('data', bytes => { try { decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes); } catch { socket.destroy(); } });
    });
    const socket = join(directory, 'peer.sock');
    await new Promise<void>(resolve => server.listen(socket, resolve));
    const endpoint: EndpointSelection = { directory, buildIdentity: '0'.repeat(64), buildKey: instance.buildKey, socket,
      record: join(directory, 'peer.json'), lock: join(directory, 'peer.lock'), log: join(directory, 'peer.log') };
    const options = { start: 'never' as const, daemonEntry: null, client: { name: 'wire', version }, engine };
    try {
      const good = await openSocketConnection(endpoint, options, 2000, () => {});
      const params = { token, freshness: { mode: 'synchronized' as const, expect: [] }, paths: ['src/main.ts'], classification: null };
      const accepted = await good.check({ ...params, requestId: 'well-formed' });
      expect(accepted).toEqual({ ok: true, value: { ...changed, requestId: 'well-formed' } });
      expect(good.connected).toBe(true);
      await good.close();

      const lost: unknown[] = [];
      const bad = await openSocketConnection(endpoint, options, 2000, reason => lost.push(reason));
      const refused = await bad.check({ ...params, requestId: 'malformed' });
      expect(refused).toMatchObject({ ok: false, error: { code: 'internal-error', message: 'Invalid check reply schema' } });
      expect(bad.connected).toBe(false);
      expect(lost).toEqual([{ kind: 'failure', message: 'Invalid check reply schema' }]);
      await bad.close();
    } finally {
      for (const open of sockets) open.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function project(base: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {
    'module.ramify': 'ramify 1\nroot module app\nowned-unwired "vendor"\nexternal "external-tree"\n',
    'README.md': '# App\n\nA wire fixture.\n',
    'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', types: [], skipLibCheck: true },
      include: ['src'], exclude: ['src/tmp'] }),
    'src/main.ts': 'export const main = 1;\n', 'src/tmp/scratch.ts': 'export const scratch = 1;\n', 'docs/notes.md': '# Notes\n',
    'vendor/src/x.ts': 'export const vendor = 1;\n', 'external-tree/y.ts': 'export const external = 1;\n',
    'node_modules/pkg/index.js': 'module.exports = 1;\n',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(base, path, '..'), { recursive: true });
    await writeFile(join(base, path), content);
  }
  return files;
}
const named = ['src/main.ts', 'docs/notes.md', 'vendor/src/x.ts', 'external-tree/y.ts', 'src/tmp/scratch.ts', 'node_modules/pkg/index.js'];

/** A raw socket's first daemon answer to one hello. */
async function hello(path: string, handshake: object): Promise<{ readonly messages: WireMessage[]; readonly closed: boolean }> {
  const socket = createConnection(path);
  const messages: WireMessage[] = [];
  const decoder = createFrameDecoder(1024 ** 2, value => messages.push(validateWireMessage(value)));
  socket.on('data', bytes => decoder.push(typeof bytes === 'string' ? Buffer.from(bytes) : bytes)); socket.on('error', () => {});
  const closed = new Promise<boolean>(resolve => socket.once('close', () => resolve(true)));
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  socket.write(encodeJsonFrame({ type: 'hello', handshake }, 1024 ** 2));
  const result = await Promise.race([closed, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000))]);
  socket.destroy();
  return { messages, closed: result };
}

describe('PB1-25: the installed daemon carries the changed check over real IPC', () => {
  it('round-trips classification, dispositions, status registrations and affected seeds; rejects malformed requests and stale peers', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'rpb16-wire-')));
    let pid = 0, children: number[] = [];
    try {
      const files = await project(base);
      await withDaemonProcess('pb1-25', async daemon => {
        pid = daemon.pid;
        const { connection, endpoint } = daemon;
        const opened = unwrap(await connection.openContext({ project: { cwd: base, root: base, scope: 'whole-project', configuration: 'discover' },
          setup: { registry: 'default', capabilities } }));
        if (opened.status !== 'opened') throw new Error(JSON.stringify(opened));
        const contextToken = opened.token;
        const events: ContextEvent[] = [];
        unwrap(await connection.subscribe({ token: contextToken }, event => events.push(event)));

        // The client has no classification: the daemon answers with the published one.
        const first = unwrap(await connection.check({ token: contextToken, requestId: 'classify', scope: 'delta', paths: named, classification: null,
          freshness: { mode: 'synchronized', expect: [] }, deadlineMs: 60_000 }));
        if (first.status !== 'classification-changed') throw new Error(JSON.stringify(first).slice(0, 2000));
        expect(first.revision.outcome.execution).toBe('completed');
        expect(first.paths).toEqual([
          { path: 'src/main.ts', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' },
          { path: 'docs/notes.md', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' },
          ...settledPaths,
        ]);

        // With that classification and the analyzed paths' content, each path's disposition.
        const second = unwrap(await connection.check({ token: contextToken, requestId: 'decide', scope: 'delta', paths: named,
          classification: first.revision.sequence, deadlineMs: 60_000,
          freshness: { mode: 'synchronized', expect: [{ path: 'src/main.ts', sha256: sha(files['src/main.ts']!) },
            { path: 'docs/notes.md', sha256: sha(files['docs/notes.md']!) }] } }));
        if (second.status !== 'reported' || !second.published) throw new Error(JSON.stringify(second).slice(0, 2000));
        expect(second.revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' });
        expect(second.paths).toEqual([
          { path: 'src/main.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: sha(files['src/main.ts']!) },
          { path: 'docs/notes.md', disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
          ...settledPaths,
        ]);

        // Malformed request variants are refused before any context work.
        const valid = { token: contextToken, requestId: 'bad', freshness: { mode: 'synchronized', expect: [] }, paths: ['src/main.ts'], classification: 1 };
        for (const params of [without(valid, 'paths'), without(valid, 'classification'), { ...valid, paths: [] },
          { ...valid, paths: ['../outside.ts'] }, { ...valid, paths: ['/abs.ts'] }, { ...valid, paths: ['src/./main.ts'] },
          { ...valid, paths: ['src/main.ts', 'src/main.ts'] }, { ...valid, classification: 0 }, { ...valid, classification: 1.5 },
          { ...valid, classification: '1' }, { ...valid, freshness: { mode: 'published', wait: false } },
          { ...valid, freshness: { mode: 'synchronized', expect: [{ path: 'docs/notes.md', sha256: sha('x') }] } }]) {
          const result = await connection.check(params as never);
          expect(result, JSON.stringify(params)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
        }

        // Stale and foreign peers are rejected with both identities; the daemon keeps serving.
        const current = { client: { name: 'stale', version }, buildKey: endpoint.buildKey, engine };
        for (const handshake of [{ ...current, protocol: 'ramify.ipc/1' }, { ...current, protocol: 'ramify.ipc/2', buildKey: 'ffffffffffffffff' },
          { ...current, protocol: 'ramify.ipc/2', engine: 'ramify.ts@0.0.0+typescript@7.0.2' }]) {
          const answer = await hello(endpoint.socket, handshake);
          expect(answer.closed).toBe(true);
          expect(answer.messages).toHaveLength(1);
          expect(answer.messages[0]).toMatchObject({ type: 'reject', error: { code: 'incompatible' }, daemon: { buildKey: endpoint.buildKey, engine } });
        }
        const daemonStatus = unwrap(await connection.daemonStatus());
        expect(daemonStatus.protocol).toBe('ramify.ipc/2');

        // The status and its watcher registrations crossed the strict codec in events and replies.
        const context = daemonStatus.contexts.find(item => item.token.context === contextToken.context)!;
        expect(context.scope?.ownership.exclusions).toEqual([exclusion('external', 'external-tree'), exclusion('scratch', 'src/tmp', 'app'), ignored]);
        await until('registrations', 10_000, async () => unwrap(await connection.contextStatus({ token: contextToken }))
          .registrations?.sequence === first.revision.sequence);
        expect(unwrap(await connection.contextStatus({ token: contextToken })).registrations).toEqual({ sequence: first.revision.sequence,
          directories: 3, pruned: ['external-tree', 'node_modules', 'src/tmp', 'vendor'], prunedCount: 4 });
        expect(events.some(event => event.type === 'status-changed' && event.current.registrations !== null)).toBe(true);

        // Affected seeds keep their status, basis, exclusion, kind and selection across the worker and the wire.
        const affected = unwrap(await connection.affected({ token: contextToken, requestId: 'seeds', freshness: { mode: 'published', wait: true },
          paths: ['vendor/src/x.ts', 'external-tree/y.ts', '../outside.ts'] }));
        if (affected.status !== 'answered') throw new Error(JSON.stringify(affected).slice(0, 2000));
        // Seeds are byte-ordered (affected contract).
        expect(affected.result.paths).toEqual([
          { path: '../outside.ts', status: 'outside-project', module: null, basis: 'none', exclusion: null, kind: null, selects: [] },
          { path: 'external-tree/y.ts', status: 'excluded', module: null, basis: 'excluded', exclusion: exclusion('external', 'external-tree'),
            kind: null, selects: [] },
          { path: 'vendor/src/x.ts', status: 'owned', module: 'app', basis: 'containment', exclusion: ignored, kind: 'ignored', selects: [] },
        ]);
        children = await descendants(pid);
        expect(JSON.parse(await readFile(endpoint.record, 'utf8'))).toMatchObject({ protocol: 'ramify.ipc/2', state: 'running' });
      });
      expect(pid).toBeGreaterThan(0);
      expect([pid, ...children].filter(alive)).toEqual([]);
    } finally { await rm(base, { recursive: true, force: true }); }
  }, 180_000);
});


describe('NT-06: wire ownership and not-analyzed reasons', () => {
  it.each(['owned-unwired', 'owned-nested-project'] as const)('accepts %s and rejects mismatched ownership or reason', kind => {
    const item = { path: 'vendor/src/x.ts', disposition: 'not-analyzed', module: 'app',
      exclusion: exclusion(kind, 'vendor', 'app'), reason: kind };
    const value = at(reported, 4, item);
    expect(() => validateServiceReply('check', ok(value))).not.toThrow();
    expect(() => validateServiceReply('check', ok(at(reported, 4, { ...item, exclusion: exclusion(kind, 'vendor') })))).toThrow('Invalid check reply schema');
    const other = kind === 'owned-unwired' ? 'owned-nested-project' : 'owned-unwired';
    expect(() => validateServiceReply('check', ok(at(reported, 4, { ...item, reason: other })))).toThrow('Invalid check reply schema');
  });
});
