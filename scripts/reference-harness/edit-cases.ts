import { createHash, randomUUID } from 'node:crypto';
import { chmod, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createQuickEnvironment } from '../../src/tests/quick-environment.js';
import { createAnalysisDriverFromSessions } from '../../src/resident-assembly.js';
import type { AnalysisReport, Capability } from '../../subs/analysis/src/interfaces/analysis.js';
import type { AnalysisDriver, CheckOutcome, ContextRevision, ExpectedContent, ContextEvent } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import { runIsolatedProject } from './mutation.js';
import { referenceEditFixture, prepareReferenceEdits, workspaceDescription, coreDirectory } from './fixtures/plan2/reference.js';
import { createEditFixture, consumerProbe } from './fixtures/plan2/project.js';
import type { EditFixtureVariant } from './fixtures/plan2/project.js';
import { applyTextMutation, moveHistoryToTesting, createLaterFile, residentTextMutations as edits } from './resident-mutations.js';
import { assertReferenceEditReport, assertRestoredReferenceReport } from './resident-expectations.js';
import type { ReferenceEdit } from './resident-expectations.js';
import { repositoryRoot } from './plan.js';
import { plan2Instances } from './plan2-instances.js';
import { Assertions } from './runner.js';
import type { InstanceHandler } from './runner.js';

const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const hashes = (content: Buffer) => createHash('sha256').update(content).digest('hex');
const decisions = (report: AnalysisReport) => report.snapshot?.results.flatMap(result => result.decisions) ?? [];
function oracle(a: Assertions, label: string, check: (assertions: Assertions) => void): void {
  const inner = new Assertions();
  try { check(inner); }
  finally { for (const assertion of inner.finish()) a.ok(`${label}: ${assertion.name}${assertion.error ? `: ${assertion.error}` : ''}`, assertion.status === 'passed'); }
}
const handlers = new Map<string, InstanceHandler>();
for (const instance of plan2Instances.filter(item => item.iteration === 6)) {
  handlers.set(instance.id, { kind: 'memory', run: async ({ assertions: a }) => {
    const reference = instance.fixture.selection === 'Q/R';
    const variant = instance.subcase as EditFixtureVariant;
    const isolated = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: instance.id,
      fixture: reference ? referenceEditFixture : { kind: 'create', create: root => createEditFixture(root, variant) } }, async ({ root }) => {
      if (reference) await prepareReferenceEdits(root, instance.subcase === 'shim-change');
      let injectReadFailure = false;
      const real = createAnalysisDriverFromSessions();
      const driver: AnalysisDriver = { ...real, async check(inputs, control) {
        if (!injectReadFailure) return real.check(inputs, control);
        injectReadFailure = false;
        const path = join(root, 'src/assembly.ts'); const mode = (await stat(path)).mode;
        await chmod(path, 0);
        try { return await real.check(inputs, control); } finally { await chmod(path, mode); }
      } };
      const quick = await createQuickEnvironment({}, { driver });
      const connection = await quick.connect({ start: 'if-needed' });
      if (connection.status !== 'connected') throw new Error(connection.status);
      const service = connection.connection;
      const selection = { project: { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const }, setup: { registry: 'default' as const, capabilities } };
      const opened = await service.openContext(selection);
      if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
      const token = opened.value.token;
      let checkNumber = 0;
      async function status() { const result = await service.contextStatus({ token }); if (!result.ok) throw new Error(result.error.message); return result.value; }
      async function read(revision?: string): Promise<Extract<CheckOutcome, { status: 'reported' }>> {
        const result = await service.check({ token, requestId: randomUUID(), freshness: { mode: 'published', wait: true, ...(revision ? { revision } : {}) } });
        if (!result.ok || result.value.status !== 'reported') throw new Error(JSON.stringify(result)); return result.value;
      }
      async function sync(expect: readonly ExpectedContent[] = [], reused = false): Promise<Extract<CheckOutcome, { status: 'reported' }>> {
        const current = ++checkNumber;
        const result = await service.check({ token, requestId: `sync-${current}`, freshness: { mode: 'synchronized', expect } });
        if (!result.ok || result.value.status !== 'reported') throw new Error(JSON.stringify(result));
        const value = result.value;
        a.equal(`synchronized ${current} verifies a fresh sealed capture`, value.freshness.verified, true);
        a.ok(`synchronized ${current} capture follows acknowledgement`, value.freshness.captureStarted! >= value.freshness.acknowledged);
        a.equal(`synchronized ${current} revision reuse is explicit`, value.freshness.reusedRevision, reused);
        if (value.report.inputId !== null) a.equal(`synchronized ${current} report and revision share inputs`, value.revision?.fingerprints.inputId, value.report.inputId);
        else a.ok(`synchronized ${current} sealed invalid inputs retain their own identity`, value.report.outcome.execution === 'invalid' && value.revision?.fingerprints.inputId.startsWith('input/1:'));
        return value;
      }
      const events: ContextEvent[] = [];
      let nextRevision: ((revision: ContextRevision) => void) | undefined;
      async function watched(paths: readonly string[]): Promise<Extract<CheckOutcome, { status: 'reported' }>> {
        let cancel!: () => void;
        const waiting = new Promise<ContextRevision>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Expected edit publication did not arrive')), 30_000);
          cancel = () => clearTimeout(timeout);
          nextRevision = revision => { clearTimeout(timeout); resolve(revision); };
        });
        quick.watcher.emit(root, paths.map(path => ({ path, kind: 'changed' })));
        quick.clock.advance(100);
        try { const revision = await waiting; return read(revision.revision); }
        finally { cancel(); nextRevision = undefined; }
      }
      try {
        const baseline = await read();
        a.equal('baseline execution is completed', baseline.report.outcome.execution, 'completed');
        a.equal('baseline independent owner count', baseline.report.summary.owners, reference ? 15 : 3);
        const subscribed = await service.subscribe({ token }, event => { events.push(event); if (event.type === 'revision-published') nextRevision?.(event.revision); });
        if (!subscribed.ok) throw new Error(subscribed.error.message);
        const beforeImporter = await readFile(join(root, reference ? 'src/assembly.ts' : consumerProbe));
        const beforeDescription = reference ? hashes(await readFile(join(root, workspaceDescription))) : '';
        switch (instance.subcase) {
          case 'delayed-watcher': case 'expect-match': case 'expect-superseded': case 'provider-influence': {
            await applyTextMutation(root, edits['remove-hop']);
            const afterHash = hashes(await readFile(join(root, workspaceDescription)));
            let changed: Extract<CheckOutcome, { status: 'reported' }>;
            if (instance.subcase === 'expect-superseded') {
              const result = await service.check({ token, requestId: 'stale-expectation', freshness: { mode: 'synchronized', expect: [{ path: workspaceDescription, sha256: beforeDescription }] } });
              if (!result.ok || result.value.status !== 'superseded') throw new Error(JSON.stringify(result));
              a.equal('stale request remains labelled and contains observed content identity', [result.value.requestId, result.value.mismatches], ['stale-expectation', [{ path: workspaceDescription, expected: beforeDescription, observed: afterHash }]]);
              a.ok('captured revision is published despite expectation mismatch', result.value.revision !== null);
              changed = await read(result.value.revision!.revision);
            } else changed = await sync(instance.subcase === 'expect-match' ? [{ path: workspaceDescription, sha256: afterHash }] : []);
            oracle(a, 'provider edit', inner => assertReferenceEditReport('remove-hop', baseline.report, changed.report, inner));
            a.equal('importer bytes remain unchanged', await readFile(join(root, 'src/assembly.ts')), beforeImporter);
            a.equal('only provider description changed', changed.revision?.changed, [workspaceDescription]);
            a.equal('synchronized request caused publication while watcher stayed silent', changed.revision?.cause, 'request');
            if (instance.subcase === 'expect-match') {
              const missing = await service.check({ token, requestId: 'unobserved', freshness: { mode: 'synchronized', expect: [{ path: 'not-observed-at-all.bin', sha256: null }] } });
              a.equal('unknown file identity is not guessed absent', missing.ok && missing.value.status === 'unavailable' && missing.value.reason, 'unobserved-input');
            }
            break;
          }
          case 'remove-exposure': case 'repair-exposure': {
            const changed = await watched(await applyTextMutation(root, edits['remove-hop']));
            oracle(a, 'removed exposure', inner => assertReferenceEditReport('remove-hop', baseline.report, changed.report, inner));
            a.equal('watch event carries newly denied revision', [changed.revision?.cause, events.filter(event => event.type === 'revision-published').at(-1)?.revision.summary.denied], ['watch', 1]);
            if (instance.subcase === 'repair-exposure') {
              const repaired = await watched(await applyTextMutation(root, edits['remove-hop'], true));
              oracle(a, 'restored exposure', inner => assertRestoredReferenceReport(baseline.report, repaired.report, inner));
            } break;
          }
          case 'tag-change': {
            await applyTextMutation(root, edits['tag-change']); const changed = await sync();
            oracle(a, 'tag edit', inner => assertReferenceEditReport('tag-change', baseline.report, changed.report, inner));
            await applyTextMutation(root, edits['tag-change'], true); const restored = await sync();
            oracle(a, 'restored tags', inner => assertRestoredReferenceReport(baseline.report, restored.report, inner)); break;
          }
          case 'move-to-testing': {
            await moveHistoryToTesting(root); const changed = await sync();
            a.equal('ordinary importer cannot use moved testing original', decisions(changed.report).filter(item => item.status === 'denied').map(item => [item.question.importer.file, item.original?.id.binding, item.reason]),
              [[`${coreDirectory}/src/catalog.ts`, 'resolvePredecessors', 'testing-origin']]);
            await moveHistoryToTesting(root, true); const restored = await sync();
            a.equal('reversal clears testing-origin denial', [restored.report.summary.denied, restored.report.diagnostics], [0, []]);
            a.equal('reversal restores permissions', decisions(restored.report), decisions(baseline.report)); break;
          }
          case 'wildcard-add': case 'wildcard-remove': case 'foreign-wildcard-invalid': case 'readme-edit': case 'invalid-description': {
            await applyTextMutation(root, edits[instance.subcase]); const changed = await sync();
            oracle(a, instance.subcase, inner => assertReferenceEditReport(instance.subcase as ReferenceEdit, baseline.report, changed.report, inner));
            if (instance.subcase === 'readme-edit') {
              a.equal('README change reuses every nonmetadata stage', [...changed.revision!.reused].sort(), ['configuration', 'parse', 'catalog', 'access', 'link', 'decide'].sort());
            }
            if (instance.subcase === 'foreign-wildcard-invalid' || instance.subcase === 'invalid-description') {
              a.equal('invalid publication keeps historical lastValid', (await status()).lastValid, baseline.revision);
              a.equal('current published read has no previous permission model', (await read()).report.snapshot?.model, null);
            } break;
          }
          case 'invalid-recovery': {
            await applyTextMutation(root, edits['invalid-description']); const invalid = await sync();
            a.equal('setup actually published invalid description', invalid.report.outcome.execution, 'invalid');
            await applyTextMutation(root, edits['invalid-description'], true); const restored = await sync();
            a.equal('recovery advances lastValid', (await status()).lastValid, restored.revision);
            oracle(a, 'restored valid description', inner => assertRestoredReferenceReport(baseline.report, restored.report, inner)); break;
          }
          case 'type-to-runtime-merge': {
            a.equal('unmarked pure Type import has type-only availability', decisions(baseline.report).map(item => item.question.selection?.request), ['type-only']);
            await applyTextMutation(root, edits['type-to-runtime-merge']); const changed = await sync();
            a.equal('merged binding changes the unchanged importer to a value request', decisions(changed.report).map(item => [item.question.selection?.request, item.status]), [['value', 'allowed']]);
            a.equal('merge produces no tag denial', changed.report.diagnostics, []);
            a.equal('consumer remained unchanged', await readFile(join(root, consumerProbe)), beforeImporter); break;
          }
          case 'alias-identity': {
            await applyTextMutation(root, edits['alias-identity']); const changed = await sync();
            a.equal('alias preserves actual value original identity', decisions(changed.report).map(item => [item.status, item.original?.id]), [['allowed', { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value' }]]);
            a.equal('alias creates no new binding', changed.report.snapshot!.catalog!.originals, baseline.report.snapshot!.catalog!.originals);
            a.equal('alias consumer remained unchanged', await readFile(join(root, consumerProbe)), beforeImporter); break;
          }
          case 'config-change': {
            a.equal('configured target begins allowed', decisions(baseline.report).map(item => [item.status, item.original?.id.binding]), [['allowed', 'value']]);
            await applyTextMutation(root, edits['config-change']); const changed = await sync();
            a.ok('unresolved configured target becomes located coverage', changed.report.coverage.some(item => item.code === 'unresolved-target' && item.location.file === consumerProbe));
            a.equal('no permission is fabricated', decisions(changed.report), []);
            a.ok('configuration fingerprint reflects edit', changed.revision?.fingerprints.configuration !== baseline.revision?.fingerprints.configuration);
            await applyTextMutation(root, edits['config-change'], true); const restored = await sync();
            a.equal('restored configuration restores independently allowed decision', decisions(restored.report), decisions(baseline.report));
            a.equal('restored configuration clears coverage', restored.report.coverage, []); break;
          }
          case 'shim-change': {
            await applyTextMutation(root, edits['shim-change']); const changed = await sync();
            a.equal('shim removal causes exact consumer errors', changed.report.diagnostics.filter(item => item.code === 'missing-export').map(item => item.location?.file).sort(),
              ['subs/workspace/subs/catalog/subs/ui/src/catalog-card.tsx', 'subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx']);
            a.ok('shim errors are located', changed.report.diagnostics.filter(item => item.code === 'missing-export').every(item => item.location!.line > 0 && item.location!.column > 0));
            const targets = (report: AnalysisReport) => report.snapshot!.accesses.filter(access => access.specifier?.endsWith('.module.css')).map(access => access.target);
            a.equal('resource identity comes from resource not shim', targets(changed.report), targets(baseline.report));
            await applyTextMutation(root, edits['shim-change'], true); const restored = await sync(); a.equal('restored shim clears consumer errors', restored.report.diagnostics, []); break;
          }
          case 'missing-file-appears': {
            a.ok('missing target starts as coverage', baseline.report.coverage.some(item => item.code === 'unresolved-target' && item.location.file === consumerProbe));
            a.ok('sealed capture recorded target absence', baseline.report.snapshot!.inputs.some(item => item.role === 'absent' && item.path.includes('later')));
            await createLaterFile(root); const changed = await sync();
            a.equal('new file creates independently expected same-owner decision', decisions(changed.report).map(item => [item.status, item.reason, item.original?.id]),
              [['allowed', 'same-owner', { kind: 'code', owner: 'fixture/consumer', file: 'later.ts', binding: 'later' }]]);
            a.equal('new file clears unresolved coverage', changed.report.coverage, []); break;
          }
          case 'resolver-failure': {
            injectReadFailure = true;
            const failed = await service.check({ token, requestId: 'read-failure', freshness: { mode: 'synchronized', expect: [] } });
            if (!failed.ok || failed.value.status !== 'reported') throw new Error(JSON.stringify(failed));
            a.equal('actual acquisition failure is delivered unpublished', [failed.value.published, failed.value.revision, failed.value.freshness.verified, failed.value.report.outcome.execution], [false, null, false, 'incomplete']);
            a.ok('real acquisition report carries read-failure diagnostic', failed.value.report.diagnostics.some(item => item.code === 'read-failure'));
            const current = await status();
            a.equal('incomplete report preserves publication and lastValid', [current.published, current.lastValid, current.synchronization], [baseline.revision, baseline.revision, 'reconciling']);
            await applyTextMutation(root, edits['readme-edit']); const restored = await sync();
            a.equal('subsequent fresh capture publishes recovery', [restored.report.outcome.execution, restored.revision!.sequence], ['completed', 2]); break;
          }
          default: throw new Error(`Unhandled edit instance ${instance.id}`);
        }
      } finally {
        await quick.dispose();
        a.equal('edit scenario releases watchers and timers', [quick.watcher.active, quick.clock.pending], [0, 0]);
      }
    });
    if (!isolated.ok) throw isolated.error;
  } });
}
export const editHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
