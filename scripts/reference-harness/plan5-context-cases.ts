import { join } from 'node:path';
import { createContextManager } from '../../subs/daemon/subs/contexts/src/context-manager.js';
import { createControlledClock, createControlledWatcher } from '../../subs/daemon/subs/contexts/src/tests/controlled-ports.js';
import { capture, createScriptedDriver, flush, hash, testBudgets } from '../../subs/daemon/subs/contexts/src/tests/scripted-driver.js';
import { createGenerationId } from '../../subs/daemon/subs/contexts/src/tokens.js';
import type { ContextStatus, ContextToken } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { createSessionDriver } from '../../src/resident-assembly.js';
import { sessionInputs } from './session-expectations.js';
import { prepareReferenceEdits, referenceEditFixture } from './fixtures/plan2/reference.js';
import { assertEquivalentReports } from './equivalence-comparison.js';
import { runIsolatedProject } from './mutation.js';
import { repositoryRoot } from './plan.js';
import { plan5Instances } from './plan5-instances.js';
import { recordObservation } from './observations.js';
import type { InstanceHandler } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
handlers.set('I5-09:session-driver-open', { kind: 'memory', run: async ({ instance, assertions: a }) => {
  const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: instance.id,
    fixture: referenceEditFixture }, async ({ root }) => {
    await prepareReferenceEdits(root);
    const real = createSessionDriver(); let opens = 0;
    const quick = await createQuickEnvironment({}, { driver: { ...real, open(...args) { opens++; return real.open(...args); } } });
    try {
      const inputs = sessionInputs(root), request = { project: inputs.project, setup: { registry: 'default' as const, capabilities: inputs.capabilities } };
      const opened = await quick.service.openContext(request);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
      const token = opened.value.token;
      const checked = await quick.service.check({ token, requestId: 'initial', freshness: { mode: 'published', wait: true } });
      if (!checked.ok || checked.value.status !== 'reported' || !checked.value.report || !checked.value.published) throw new Error(JSON.stringify(checked));
      const second = await quick.service.openContext(request);
      a.ok('second lease reuses the same context', second.ok && second.value.status === 'opened' && !second.value.created);
      a.equal('one retained session is opened per context', opens, 1);
      a.equal('first publication has sequence one and open cause', [checked.value.revision?.sequence, checked.value.revision?.cause], [1, 'open']);
      const batch = await quick.batch({ cwd: root, root, capabilities: inputs.capabilities });
      if (batch.status !== 'reported') throw new Error('Batch oracle cancelled');
      assertEquivalentReports(batch.report, checked.value.report);
      a.equal('reference independent owners and finding expectations', [checked.value.report.summary.owners, checked.value.report.summary.denied], [15, 0]);
      a.ok('revision one equals independent batch report', true);
    } finally { await quick.dispose(); a.equal('quick session resources released', [quick.clock.pending, quick.watcher.active], [0, 0]); }
  });
  if (!result.ok) throw result.error;
} });

for (const instance of plan5Instances.filter(record => record.matrixId === 'I5-09' && record.subcase !== 'session-driver-open')) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const script = createScriptedDriver(), clock = createControlledClock(), watcher = createControlledWatcher();
    const manager = createContextManager({ driver: script.driver, clock, watcher, budgets: { ...testBudgets, maxHistoryRevisions: 3 }, engine: 'test', generationId: createGenerationId });
    const setup = { registry: 'default', capabilities: [] } as const;
    const open = async (root = '/fixture') => {
      const result = await manager.open({ cwd: root, root, scope: 'whole-project', configuration: 'discover' }, setup, 'lease');
      if (result.status !== 'opened') throw new Error(result.status); return result;
    };
    const state = (token: ContextToken) => manager.list().find(context => context.token.context === token.context) as ContextStatus;
    let id = 0;
    const check = (token: ContextToken, sha256 = hash('1'), path = 'src/index.ts') => manager.check({ token, requestId: `delta-${++id}`, scope: 'delta', freshness: { mode: 'synchronized', expect: [{ path, sha256 }] } }, 'lease');
    let completePending: ((value: ReturnType<typeof capture>) => void) | undefined;
    let completeCold: ((value: ReturnType<typeof capture>) => void) | undefined;
    try {
      if (instance.subcase === 'cold-explicit') script.pending.push(() => new Promise(resolve => { completeCold = resolve; }));
      const opened = await open(); await flush(); const token = opened.token;
      switch (instance.subcase) {
        case 'revision-from-session': {
          const first = state(token).published!;
          a.equal('fingerprint uses the session observation identity', first.fingerprints.inputId, script.sessions[0].session.current!.inputId);
          script.version = 2; await check(token, hash('2')); const next = state(token).published!;
          a.equal('sequence is monotonic and taken from session', [first.sequence, next.sequence, script.sessions[0].session.current!.sequence], [1, 2, 2]);
          a.equal('checked set and timings relay actual session facts', [next.checked, next.timings], [script.sessions[0].session.current!.checked, script.sessions[0].session.current!.timings]); break;
        }
        case 'covered-immediate': {
          const calls = script.calls.length; const result = await check(token);
          a.ok('covering publication is verified and reused without capture', result.status === 'reported' && result.published && result.freshness.verified && result.freshness.reusedRevision && result.freshness.captureStarted === null);
          a.equal('covered delta performs neither update nor report projection', [script.calls.length, script.reportCalls.length], [calls, 0]);
          a.ok('compact reply contains no report snapshot', result.status === 'reported' && result.report === null); break;
        }
        case 'flush-on-uncovered': {
          const observations = [{ path: 'src/index.ts', role: 'source' as const, sha256: hash('2'), bytes: 1 }, { path: 'src/other.ts', role: 'source' as const, sha256: hash('other'), bytes: 1 }];
          script.pending.push(() => capture(2, 'completed', observations));
          watcher.emit('/fixture', [{ path: 'src/other.ts', kind: 'changed' }]);
          const result = await check(token, hash('2'));
          a.equal('request flushes pending debounce without advancing clock', clock.now(), 0);
          a.equal('one update covers both pending paths', script.updateCalls.length, 1);
          a.equal('watcher and expected identity paths join one update', script.updateCalls[0].inputs.changes.map(change => change.path).sort(), ['src/index.ts', 'src/other.ts']);
          a.ok('flushed request receives a fresh covering revision', result.status === 'reported' && result.published && !result.freshness.reusedRevision && result.revision.sequence === 2); break;
        }
        case 'unobserved-input': {
          for (const path of ['outside.bin', '../outside.ts']) {
            const result = await check(token, hash('absent'), path);
            a.equal(`${path}: no observation cannot pass`, result.status === 'unavailable' ? result.reason : result.status, 'unobserved-input');
          } break;
        }
        case 'superseded-mismatch': {
          const result = await check(token, hash('not-on-disk'));
          a.equal('superseded identity remains explicit', result.status, 'superseded');
          if (result.status === 'superseded') a.equal('mismatch reports expected and observed identities', result.mismatches, [{ path: 'src/index.ts', expected: hash('not-on-disk'), observed: hash('1') }]); break;
        }
        case 'history-compact': {
          for (let version = 2; version <= 3; version++) { script.version = version; await check(token, hash(String(version))); }
          const oldest = `rev/1:${token.generation.slice(6)}:1`;
          script.pending.push(() => new Promise(resolve => { completePending = resolve; }));
          const waiting = manager.check({ token, requestId: 'pinned-since', scope: 'delta', since: oldest,
            freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('4') }] } }, 'lease');
          await flush();
          a.equal('pending request retains its oldest delta baseline', script.sessions[0].releasedRevisions.includes(1), false);
          completePending!(capture(4)); completePending = undefined;
          const covered = await waiting;
          a.ok('publication can evict another revision without losing the pinned baseline', covered.status === 'reported' && covered.published && covered.delta.since === oldest && covered.revision.sequence === 4);
          a.equal('pinned delta retains the history count budget', state(token).history.retained, 3);
          for (let version = 5; version <= 8; version++) { script.version = version; await check(token, hash(String(version))); }
          a.equal('delta requests materialize no report', script.reportCalls.length, 0);
          a.equal('compact history obeys revision count', state(token).history.retained, 3);
          a.ok('compact history stays within the byte budget', state(token).history.bytes <= testBudgets.maxHistoryBytes);
          a.ok('evicted fact versions are released through their session', script.sessions[0].releasedRevisions.includes(1));
          const sequence = state(token).published!.sequence;
          const result = await manager.check({ token, requestId: 'project', scope: 'report', freshness: { mode: 'published', revision: state(token).published!.revision, wait: false } }, 'lease');
          a.equal('exact report projects once on demand', script.reportCalls.map(call => call.sequence), [sequence]);
          a.ok('projected report belongs to selected revision', result.status === 'reported' && result.report?.summary.owners === 8);
          const evicted = await manager.check({ token, requestId: 'old-since', scope: 'delta', since: `rev/1:${token.generation.slice(6)}:1`, freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash('8') }] } }, 'lease');
          a.equal('an evicted delta baseline is explicit', evicted.status === 'unavailable' ? evicted.reason : evicted.status, 'evicted-revision'); break;
        }
        case 'cold-explicit': case 'not-checked-at-deadline': {
          let finish = completeCold;
          if (!finish) script.pending.push(() => new Promise(resolve => { finish = resolve; completePending = resolve; }));
          const pending = manager.check({ token, requestId: 'deadline', scope: 'delta', deadlineMs: 10, freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256: hash(instance.subcase === 'cold-explicit' ? '1' : '2') }] } }, 'lease');
          await flush(); clock.advance(10); await flush(); const outcome = await pending;
          a.equal('expired request is not reported as checked', outcome.status, instance.subcase === 'cold-explicit' ? 'cold' : 'deadline-exceeded');
          a.equal('deadline does not abort session work', script.calls.at(-1)?.signal?.aborted, false);
          manager.release('lease'); await flush();
          a.equal('client release after deadline preserves the running update', script.calls.at(-1)?.signal?.aborted, false);
          finish!(capture(instance.subcase === 'cold-explicit' ? 1 : 2)); completeCold = undefined; completePending = undefined; await flush();
          a.equal('late update still publishes', state(token).published?.sequence, instance.subcase === 'cold-explicit' ? 1 : 2); break;
        }
        case 'hot-budget-demotion': {
          clock.advance(1); await open('/second'); await flush(); clock.advance(1); await open('/third'); await flush();
          a.equal('only two contexts retain their compilers', manager.list().filter(context => context.level === 'hot').length, 2);
          a.equal('least recently used hot context demoted once', script.sessions[0].releaseCompilerCalls, 1);
          a.equal('demoted context retains warm facts and revision', [state(token).level, state(token).published?.sequence], ['warm', 1]); break;
        }
        default: throw new Error(`Unhandled context instance ${instance.id}`);
      }
      recordObservation('retained-context', { instance: instance.id, calls: script.calls.map(call => ({ kind: call.kind, changes: call.inputs.changes })), statuses: manager.list() });
    } finally {
      completeCold?.(capture()); completePending?.(capture(2)); await flush(); await manager.dispose();
      a.equal('owned context resources are released on every path', [watcher.active, clock.pending, manager.list().length], [0, 0, 0]);
    }
  } });
}
export const plan5ContextHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
