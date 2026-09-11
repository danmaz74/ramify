import { createContextManager } from '../../subs/daemon/subs/contexts/src/context-manager.js';
import { createControlledClock, createControlledWatcher } from '../../subs/daemon/subs/contexts/src/tests/controlled-ports.js';
import { createScriptedDriver, capture, flush, hash, testBudgets } from '../../subs/daemon/subs/contexts/src/tests/scripted-driver.js';
import { createFingerprints, createGenerationId } from '../../subs/daemon/subs/contexts/src/tokens.js';
import type { ContextBudgets, ContextStatus, ContextToken } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import type { InstanceHandler } from './runner.js';
import { plan2Instances } from './plan2-instances.js';

const handlers = new Map<string, InstanceHandler>();
for (const instance of plan2Instances.filter(item => item.iteration === 4)) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const changes: Partial<ContextBudgets> = instance.subcase === 'history-bytes' ? { maxHistoryBytes: 32 * 1024 ** 2 }
      : instance.subcase === 'global-bytes' ? { maxRetainedBytesGlobal: 7500 }
      : instance.subcase === 'resource-unavailable' ? { maxHistoryBytes: 1 } : {};
    const script = createScriptedDriver(), clock = createControlledClock(), watcher = createControlledWatcher();
    const manager = createContextManager({ driver: script.driver, clock, watcher, budgets: { ...testBudgets, ...changes }, engine: 'test-engine', generationId: createGenerationId });
    const setup = { registry: 'default', capabilities: [] } as const;
    let requestId = 0;
    const open = async (root = '/fixture', lease = 'a', cwd = root) => {
      const result = await manager.open({ cwd, root, scope: 'whole-project', configuration: 'discover' }, setup, lease);
      if (result.status !== 'opened') throw new Error(`Expected context: ${result.status}`);
      return result;
    };
    const check = (token: ContextToken, lease = 'a') => manager.check({ token, requestId: `request-${++requestId}`, freshness: { mode: 'synchronized', expect: [] } }, lease);
    const state = (token: ContextToken) => manager.status(token) as ContextStatus;
    const read = (token: ContextToken, revision?: string, wait = false) => manager.check({ token, requestId: `read-${++requestId}`, freshness: { mode: 'published', wait, ...(revision ? { revision } : {}) } }, 'a');
    try {
      if (instance.subcase === 'pending-before-publication' || instance.subcase === 'wait-first-publication') {
        let finish!: (value: ReturnType<typeof capture>) => void;
        script.pending.push(() => new Promise(resolve => { finish = resolve; }));
        const opened = await open(); await flush();
        a.equal('new context has no publication', [opened.current.state, opened.current.published, opened.current.synchronization], ['opening', null, 'initializing']);
        a.equal('nonwaiting read is pending', (await read(opened.token)).status, 'pending');
        const waiting = read(opened.token, undefined, true); finish(capture());
        const result = await waiting;
        a.equal('waiting read receives first complete revision', result.status === 'reported' ? result.revision?.sequence : result.status, 1);
        return;
      }
      const opened = await open(); await flush(); const token = opened.token;
      switch (instance.subcase) {
        case 'context-id-derivation': {
          const same = await open(); const other = await open('/other');
          a.equal('equal selections share deterministic identity', same.token.context, token.context);
          a.ok('distinct roots isolate identities', other.token.context !== token.context); break;
        }
        case 'branch-irrelevant': {
          const same = await open('/fixture', 'b', '/different/cwd');
          a.equal('cwd does not enter canonical context identity', [same.created, same.token], [false, token]); break;
        }
        case 'generation-on-reopen': {
          clock.advance(testBudgets.warmIdleMs); await flush(); clock.advance(testBudgets.coldRetainMs); await flush();
          const next = await open(); a.ok('reopening gets a fresh generation', next.token.generation !== token.generation);
          a.equal('old generation expires', await check(token), { status: 'unavailable', reason: 'expired-generation', message: 'expired-generation', requestId: 'request-1' }); break;
        }
        case 'revision-monotonic': {
          for (let version = 2; version <= 5; version++) { script.version = version; await check(token); a.equal(`sequence ${version}`, state(token).published?.sequence, version); }
          a.equal('revision embeds generation uuid', state(token).published?.revision, `rev/1:${token.generation.slice(6)}:5`); break;
        }
        case 'fingerprint-classes': {
          const roles = ['description', 'source', 'configuration'] as const;
          const initial = roles.map(role => ({ path: role, role, sha256: hash('before'), bytes: 1 }));
          const base = createFingerprints('input/1:a', initial, 'default', 'engine');
          for (const [index, expected] of ['declarations', 'source', 'configuration'].entries()) {
            const modified = initial.map((input, current) => current === index ? { ...input, sha256: hash('after') } : input);
            const after = createFingerprints('input/1:a', modified, 'default', 'engine');
            a.equal(`${expected} input affects only its class`, Object.keys(base).filter(key => base[key as keyof typeof base] !== after[key as keyof typeof after]), [expected]);
          } break;
        }
        case 'queue-order': {
          const order: string[] = [];
          const before = script.calls.length;
          const requests = [1, 2, 3].map(() => check(token).then(value => { order.push(value.requestId); return value; }));
          const results = await Promise.all(requests);
          a.equal('acknowledged results retain ordering', order, ['request-1', 'request-2', 'request-3']);
          a.equal('eligible requests share the next capture', script.calls.length, before + 1);
          a.ok('every capture starts after acknowledgement', results.every(result => result.status === 'reported' && result.freshness.captureStarted! >= result.freshness.acknowledged)); break;
        }
        case 'coalesce-background': {
          const before = script.calls.length;
          for (let index = 0; index < 50; index++) watcher.emit('/fixture', [{ path: `src/${index}.ts`, kind: 'changed' }, { path: 'shared.ts', kind: 'changed' }]);
          script.version = 2; clock.advance(100); await flush();
          a.equal('fifty batches produce one capture', script.calls.length, before + 1);
          a.equal('all distinct paths delivered once', script.calls.at(-1)?.inputs.changes?.length, 51);
          a.equal('watch cause is retained', state(token).published?.cause, 'watch'); break;
        }
        case 'cancel-request': {
          script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve({ status: 'cancelled' }))));
          const controller = new AbortController(); const request = manager.check({ token, requestId: 'cancelled-id', freshness: { mode: 'synchronized', expect: [] } }, 'a', { signal: controller.signal });
          await flush(); controller.abort();
          a.equal('request cancelled under its own identity', await request, { status: 'cancelled', requestId: 'cancelled-id' }); await flush();
          a.equal('driver receives cancellation', script.calls.at(-1)?.signal?.aborted, true);
          a.equal('cancellation publishes nothing', state(token).published?.sequence, 1); break;
        }
        case 'cancel-background': {
          script.pending.push(call => new Promise(resolve => call.signal!.addEventListener('abort', () => resolve(capture(2)))));
          watcher.emit('/fixture', [{ path: 'first.ts', kind: 'changed' }]); clock.advance(100); await flush();
          watcher.emit('/fixture', [{ path: 'second.ts', kind: 'changed' }]); await flush();
          a.equal('stale candidate is discarded', state(token).published?.sequence, 1);
          script.version = 3; clock.advance(100); await flush();
          a.equal('successor receives union of paths', script.calls.at(-1)?.inputs.changes?.map(item => item.path).sort(), ['first.ts', 'second.ts']); break;
        }
        case 'invalid-current': case 'historical-last-valid': case 'recovery-publishes': {
          const valid = state(token).published;
          script.pending.push(() => capture(2, 'invalid')); const result = await check(token);
          a.equal('invalid current report is delivered', result.status === 'reported' ? result.report.outcome.execution : result.status, 'invalid');
          a.equal('lastValid remains historical', state(token).lastValid, valid);
          a.equal('published read never substitutes lastValid', (await read(token)).status === 'reported' && state(token).published?.outcome.execution, 'invalid');
          if (instance.subcase === 'recovery-publishes') { script.version = 3; await check(token); a.equal('recovery replaces lastValid', state(token).lastValid, state(token).published); }
          break;
        }
        case 'lost-events': {
          script.version = 2; await check(token);
          a.equal('request independently reconciles missing notifications', [state(token).published?.cause, state(token).synchronization], ['request', 'synchronized']); break;
        }
        case 'overflow': {
          watcher.emit('/fixture', Array.from({ length: 10_001 }, (_, index) => ({ path: `src/${index}.ts`, kind: 'changed' })));
          a.equal('overflow marks conservative state', state(token).synchronization, 'conservative'); clock.advance(100); await flush();
          a.equal('overflow discards untrustworthy path subset', script.calls.at(-1)?.inputs.changes, null); break;
        }
        case 'watcher-error': {
          watcher.emit('/fixture', [{ path: '', kind: 'error' }]);
          a.equal('watcher errors are explicit', state(token).synchronization, 'watcher-unavailable');
          const result = await check(token); await flush(); a.equal('synchronized checking survives watcher failure', result.status, 'reported');
          a.equal('sealed reconciliation reattaches watcher', watcher.active, 1); break;
        }
        case 'unwatched-dependency': {
          const run = capture(2, 'completed', [{ path: 'node_modules/pkg/index.d.ts', role: 'dependency', sha256: hash('dependency'), bytes: 1 }]);
          let finish!: (value: typeof run) => void; script.pending.push(() => new Promise(resolve => { finish = resolve; }));
          clock.advance(testBudgets.verificationIntervalMs); await flush();
          a.equal('verification is visible while running', state(token).synchronization, 'reconciling'); finish(run); await flush();
          a.equal('verification reobserves rather than trusting events', script.calls.at(-1)?.inputs.changes, []);
          a.equal('driver changed paths are published', [state(token).published?.cause, state(token).published?.changed, state(token).synchronization], ['verify', ['node_modules/pkg/index.d.ts'], 'synchronized']);
          script.pending.push(() => run); const revision = state(token).published?.revision;
          clock.advance(testBudgets.verificationIntervalMs); await flush(); a.equal('unchanged verification reuses publication', state(token).published?.revision, revision); break;
        }
        case 'debounce': {
          const before = script.calls.length;
          watcher.emit('/fixture', [{ path: 'a', kind: 'changed' }]); clock.advance(50);
          watcher.emit('/fixture', [{ path: 'b', kind: 'changed' }]); clock.advance(40);
          watcher.emit('/fixture', [{ path: 'c', kind: 'changed' }]); clock.advance(99); await flush();
          a.equal('no capture before 190 ms', script.calls.length, before); clock.advance(1); await flush();
          a.equal('one capture at 190 ms', [clock.now(), script.calls.length], [190, before + 1]); break;
        }
        case 'history-count': case 'evicted-revision': case 'retained-revision-exact': {
          const first = state(token).published!.revision; let retained = first;
          for (let version = 2; version <= 12; version++) { script.version = version; await check(token); if (version === 6) retained = state(token).published!.revision; }
          a.equal('only eight newest revisions remain', state(token).history.retained, 8);
          const evicted = await read(token, first, true);
          a.equal('discarded revisions never substitute current', evicted.status === 'unavailable' ? evicted.reason : evicted.status, 'evicted-revision');
          const result = await read(token, retained, true);
          a.equal('retained read returns exact header/report with no freshness claim', result.status === 'reported'
            ? [result.revision?.revision, result.report.summary.owners, result.freshness.verified, result.freshness.captureStarted] : result.status,
          [retained, 6, false, null]); break;
        }
        case 'history-bytes': {
          for (let version = 2; version <= 6; version++) {
            const base = capture(version); script.pending.push(() => ({ ...base, report: { ...base.report, runId: 'x'.repeat(10 * 1024 ** 2) } })); await check(token);
          }
          a.ok('accounted history stays below 32 MiB', state(token).history.bytes <= 32 * 1024 ** 2);
          a.ok('at most three large reports retained', state(token).history.retained <= 3); break;
        }
        case 'global-bytes': {
          const other = await open('/other'); await flush();
          for (let version = 2; version <= 8; version++) { script.version = version; await check(version % 2 ? token : other.token); }
          a.ok('cross-context history obeys global bytes', manager.list().reduce((sum, value) => sum + value.history.bytes + value.retainedBytes, 0) <= 7500);
          a.ok('old reports are discarded before contexts', manager.list().every(value => value.history.retained < 8)); break;
        }
        case 'context-lru-eviction': case 'leased-not-evicted': {
          const all = [opened];
          for (let index = 1; index < 8; index++) { clock.advance(1); all.push(await open(`/fixture-${index}`)); await flush(); }
          if (instance.subcase === 'leased-not-evicted') {
            for (const value of all) manager.subscribe(value.token, 'hold', () => {});
            const denied = await manager.open({ cwd: '/ninth', root: '/ninth', scope: 'whole-project', configuration: 'discover' }, setup, 'a');
            a.equal('leases prevent pressure eviction', denied.status === 'unavailable' ? denied.reason : denied.status, 'resource-unavailable');
            a.equal('all eight contexts remain', manager.list().length, 8);
          } else {
            await open('/ninth'); a.equal('oldest unleased context was evicted', (await check(token)).status, 'unavailable');
            const reopened = await open(); a.ok('pressure reopen has fresh generation', reopened.token.generation !== token.generation);
          } break;
        }
        case 'resource-unavailable': {
          const result = await check(token); a.equal('oversized candidate returns budget outcome', result.status === 'unavailable' ? result.reason : result.status, 'resource-unavailable');
          a.equal('no substitute report is published', state(token).published, null); break;
        }
        default: throw new Error(`Unhandled contexts instance ${instance.id}`);
      }
    } finally {
      await manager.dispose();
      a.equal('context disposal releases all watchers and timers', [watcher.active, clock.pending, manager.list().length, script.disposed], [0, 0, 0, true]);
    }
  } });
}
export const contextHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
