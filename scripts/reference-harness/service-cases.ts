import { randomUUID } from 'node:crypto';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { createAnalysisDriverFromSessions } from '../../src/resident-assembly.js';
import type { AnalysisDriver, CheckOutcome, ContextToken, ContextSetup } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import type { Capability, AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { RamifyService, ServiceResult, OpenContextParams } from '../../src/interfaces/service.js';
import { runIsolatedProject } from './mutation.js';
import { createProjectFixture } from './fixtures/plan1/project.js';
import { referenceEditFixture, prepareReferenceEdits } from './fixtures/plan2/reference.js';
import { applyTextMutation, residentTextMutations } from './resident-mutations.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import type { InstanceHandler } from './runner.js';

const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const setup: ContextSetup = { registry: 'default', capabilities };
const handlers = new Map<string, InstanceHandler>();
function value<T>(result: ServiceResult<T>): T { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; }
function report(result: ServiceResult<CheckOutcome>): Extract<CheckOutcome, { status: 'reported' }> {
  const outcome = value(result); if (outcome.status !== 'reported') throw new Error(JSON.stringify(outcome)); return outcome;
}
function normalize(report: AnalysisReport): unknown { return { ...report, runId: '' }; }
async function settled(service: RamifyService, token: ContextToken): Promise<void> {
  for (let count = 0; count < 1000; count++) {
    const current = value(await service.contextStatus({ token }));
    if (!current.pending.analysisRunning && !current.pending.changedPaths && current.synchronization === 'synchronized') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Reconciliation did not settle');
}
for (const instance of plan2Instances.filter(item => item.iteration === 5)) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const reference = instance.fixture.selection?.includes('/R');
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: instance.id,
      fixture: reference ? referenceEditFixture : { kind: 'create', create: createProjectFixture } }, async ({ root, runDirectory }) => {
      if (reference) await prepareReferenceEdits(root);
      const quick = await createQuickEnvironment();
      const connected = await quick.connect({ start: 'if-needed' });
      if (connected.status !== 'connected') throw new Error(connected.status);
      const service = connected.connection;
      const params: OpenContextParams = { project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' }, setup };
      const open = async (adapter: RamifyService = service, selection = params) => {
        const result = value(await adapter.openContext(selection)); if (result.status !== 'opened') throw new Error(JSON.stringify(result)); return result;
      };
      const check = (token: ContextToken, adapter: RamifyService = service, requestId = randomUUID()) => adapter.check({ token, requestId, freshness: { mode: 'synchronized', expect: [] } });
      const published = (token: ContextToken, adapter: RamifyService = service) => adapter.check({ token, requestId: randomUUID(), freshness: { mode: 'published', wait: true } });
      try {
        if (instance.subcase === 'invalid-context-request') {
          for (const [index, token] of [null, {}, { context: 'bad', generation: 'bad' }, { context: `ctx/1:${'0'.repeat(64)}`, generation: `gen/1:${randomUUID()}`, extra: 1 }].entries()) {
            const invalid = await service.contextStatus({ token } as never);
            a.equal(`malformed token ${index} is rejected`, invalid.ok ? 'accepted' : invalid.error.code, 'invalid-request');
          }
          a.equal('invalid requests create no contexts', value(await service.daemonStatus()).contexts.length, 0); return;
        }
        if (instance.subcase === 'invalid-scope-request') {
          const invalid = await service.openContext({ ...params, project: { ...params.project, scope: 'file' } } as never);
          a.equal('unsupported scope shape is invalid', invalid.ok ? 'accepted' : invalid.error.code, 'invalid-request');
          const invalidExpect = await service.check({ token: { context: `ctx/1:${'0'.repeat(64)}`, generation: `gen/1:${randomUUID()}` }, requestId: 'too-many', freshness: { mode: 'synchronized', expect: Array.from({ length: 10_001 }, (_, index) => ({ path: `${index}.ts`, sha256: null })) } });
          a.equal('expectation list is bounded at validation', invalidExpect.ok ? 'accepted' : invalidExpect.error.code, 'invalid-request'); return;
        }
        if (instance.subcase === 'unknown-operation') {
          const invalid = await quick.request('not-an-operation', {});
          a.equal('unknown operation survives codec and fails shared service dispatch', invalid.ok ? 'accepted' : invalid.error.code, 'unsupported-operation'); return;
        }
        if (instance.subcase === 'unavailable-capability' || instance.subcase === 'unsupported-setup') {
          const rejected = value(await service.openContext({ ...params, setup: instance.subcase === 'unavailable-capability'
            ? { registry: 'default', capabilities: [...capabilities, 'browser-verification'] } : { registry: 'custom', capabilities } } as never));
          a.equal('unsupported setup is a domain value', rejected.status === 'unavailable' ? rejected.reason : rejected.status, 'unsupported-setup');
          a.equal('unsupported setup does not create context', value(await service.daemonStatus()).contexts.length, 0);
          const invalid = await service.openContext({ ...params, project: { ...params.project, scope: 'directory' } } as never);
          a.equal('unknown scope is not silently replaced', invalid.ok ? 'accepted' : invalid.error.code, 'invalid-request');
          const valid = await open(); const control = report(await published(valid.token));
          a.equal('supported browser tag matching remains available', control.report.outcome.check, 'passed'); return;
        }
        if (instance.subcase === 'sync-throw' || instance.subcase === 'async-failure') {
          const real = createAnalysisDriverFromSessions(); let fail = false;
          const driver: AnalysisDriver = { ...real, check(inputs, control) {
            if (fail) { fail = false; if (instance.subcase === 'sync-throw') throw new Error('Injected synchronous driver fault'); return Promise.reject(new Error('Injected asynchronous driver fault')); }
            return real.check(inputs, control);
          } };
          const faultQuick = await createQuickEnvironment({}, { driver });
          const faultService = faultQuick.service;
          try {
            const opened = await open(faultService); await published(opened.token, faultService);
            fail = true;
            const failed = await faultQuick.request('check', { token: opened.token, requestId: 'fault', freshness: { mode: 'synchronized', expect: [] } });
            a.equal('driver fault is a domain unavailable outcome', failed.ok ? failed.value : failed.error,
              { status: 'unavailable', reason: 'analysis-failed', message: instance.subcase === 'sync-throw' ? 'Error: Injected synchronous driver fault' : 'Error: Injected asynchronous driver fault', requestId: 'fault' });
            a.equal('the same context recovers using the real engine', report(await check(opened.token, faultService)).report.outcome.check, 'passed');
          } finally { await faultQuick.dispose(); a.equal('fault path releases handles', [faultQuick.clock.pending, faultQuick.watcher.active], [0, 0]); }
          return;
        }
        const opened = await open(); const initial = report(await published(opened.token)); const token = opened.token;
        switch (instance.subcase) {
          case 'cold-context': {
            const batch = await quick.batch({ cwd: root, root, capabilities }); if (batch.status !== 'reported') throw new Error('Batch cancelled');
            a.equal('cold context publishes revision one from open', [initial.revision?.sequence, initial.revision?.cause], [1, 'open']);
            a.equal('entire report equals independently run batch', normalize(initial.report), normalize(batch.report));
            a.equal('reference owner/warning/coverage expectations', [initial.report.summary.owners, initial.report.warnings.length, initial.report.outcome.coverage], [15, 2, 'complete']); break;
          }
          case 'unknown-context': {
            const unknown = value(await check({ ...token, context: `ctx/1:${'f'.repeat(64)}` }));
            const expired = value(await check({ ...token, generation: `gen/1:${randomUUID()}` }));
            a.equal('unknown and expired tokens return no foreign report', [unknown.status === 'unavailable' && unknown.reason, expired.status === 'unavailable' && expired.reason], ['unknown-context', 'expired-generation']); break;
          }
          case 'same-root-reuse': {
            const second = await quick.connect({ start: 'never' }); if (second.status !== 'connected') throw new Error(second.status);
            const ownParams = { project: { ...params.project, cwd: join(root, 'subs/workspace'), root: '../..' }, setup: { ...setup, capabilities: [...capabilities].reverse() } };
            const other = await open(second.connection, ownParams);
            a.equal('same canonical root and setup share identity', [other.created, other.token], [false, token]);
            const own = report(await check(token, service)); const theirs = report(await check(token, second.connection));
            for (const [label, selection, actual] of [['first', params, own], ['second', ownParams, theirs]] as const) {
              const batch = await quick.batch({ cwd: selection.project.cwd, root: selection.project.root, capabilities: selection.setup.capabilities });
              if (batch.status !== 'reported') throw new Error('Batch cancelled');
              a.equal(`${label} invocation facts agree with batch`, normalize(actual.report), normalize(batch.report));
            }
            await service.closeContext({ token });
            a.equal('closing one pair leaves the other usable', report(await check(token, second.connection)).report.outcome.check, 'passed');
            await second.connection.close(); break;
          }
          case 'two-worktrees': {
            const secondRoot = join(runDirectory, 'second-project'); await mkdir(secondRoot); await cp(root, secondRoot, { recursive: true, verbatimSymlinks: true });
            await applyTextMutation(secondRoot, residentTextMutations['remove-hop']);
            const second = await open(service, { ...params, project: { ...params.project, root: secondRoot, cwd: secondRoot } });
            const changed = report(await published(second.token));
            a.ok('worktree roots receive different ids', token.context !== second.token.context);
            a.equal('unchanged project is allowed', initial.report.summary.denied, 0); a.ok('removed exposure causes denial only in changed copy', changed.report.summary.denied > 0);
            a.ok('declaration fingerprints differ', initial.revision?.fingerprints.declarations !== changed.revision?.fingerprints.declarations);
            a.equal('registry and engine fingerprints stay equal', [initial.revision?.fingerprints.registry, initial.revision?.fingerprints.engine], [changed.revision?.fingerprints.registry, changed.revision?.fingerprints.engine]); break;
          }
          case 'concurrent-readers': {
            const first = Array.from({ length: 5 }, () => published(token));
            await applyTextMutation(root, residentTextMutations['remove-hop']); const changed = check(token);
            const second = Array.from({ length: 5 }, () => published(token));
            const all = await Promise.all([...first, changed, ...second]);
            a.ok('every complete read pairs one header with its own inputs', all.every(result => {
              const outcome = report(result); return outcome.published && outcome.revision.fingerprints.inputId === outcome.report.inputId;
            }));
            a.ok('edited request contains independent denial', report(await changed).report.summary.denied > 0); break;
          }
          case 'own-request-label': {
            const input = initial.report.snapshot!.inputs.find(input => input.role === 'source')!;
            const expectations = [input.sha256, '0'.repeat(64)];
            const results = await Promise.all(expectations.map((sha256, index) => service.check({ token, requestId: `own-${index}`, freshness: { mode: 'synchronized', expect: [{ path: input.path, sha256 }] } })));
            a.equal('requests keep identity and their own expectation results', results.map(result => { const outcome = value(result); return [outcome.requestId, outcome.status]; }), [['own-0', 'reported'], ['own-1', 'superseded']]); break;
          }
          case 'stale-publish-blocked': {
            await applyTextMutation(root, residentTextMutations['remove-hop']);
            quick.watcher.emit(root, [{ path: residentTextMutations['remove-hop'].path, kind: 'changed' }]); quick.clock.advance(100);
            await Promise.resolve();
            a.equal('first background capture started', value(await service.contextStatus({ token })).pending.analysisRunning, true);
            await applyTextMutation(root, residentTextMutations['remove-hop'], true);
            quick.watcher.emit(root, [{ path: residentTextMutations['remove-hop'].path, kind: 'changed' }]);
            a.equal('stale analysis did not publish', value(await service.contextStatus({ token })).published?.sequence, 1);
            quick.clock.advance(100); await settled(service, token);
            a.equal('second edit is reflected in final report', report(await published(token)).report.summary.denied, 0);
            a.equal('one superseded analysis was cancelled', value(await service.daemonStatus()).counters.cancelledAnalyses, 1); break;
          }
          case 'dispose-cancels': {
            value(await service.subscribe({ token }, () => {}));
            const checking = check(token); await Promise.resolve();
            const disposing = quick.service.dispose(); const outcome = value(await checking); await disposing;
            a.equal('pending check receives disposed domain outcome', outcome.status === 'unavailable' ? outcome.reason : outcome.status, 'disposed');
            a.equal('service disposal releases watchers and timers', [quick.clock.pending, quick.watcher.active], [0, 0]); break;
          }
          default: throw new Error(`Unhandled service instance ${instance.id}`);
        }
      } finally {
        await quick.dispose();
        a.equal('quick environment releases controlled handles', [quick.clock.pending, quick.watcher.active], [0, 0]);
      }
    });
    if (!result.ok) throw result.error;
  } });
}
export const serviceHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
