import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { architectViewDirectory } from '../../subs/evidence/src/views.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { baselineScope, captureSnapshot, scopeSize } from '../kpi/capture.js';
import { runLayout, type Invocation, type MeasurementSnapshot, type RunRecord } from '../run/records.js';
import { RunQueries } from '../projections/queries.js';
import { viewedInputs } from './helpers/iterations.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';
import {
  emptyAnalysis, initRepository, installTestRunner, onlyRun, openRuns, runPath, startRun, realRamify } from './helpers/runs.js';

/*
 * Measurement capture. The baseline is frozen from the first snapshot of the
 * run, over the root subtree, all view areas, the architect view and the
 * initial support set, each once. Every invocation records the snapshot it
 * was measured against and the components of its own scope.
 *
 * Nothing here is added after a trial: each figure is captured when the
 * observation happens. A missing component makes the total unavailable with
 * its known subtotal beside it, and never a zero.
 */

/**
 * The installed Ramify command line, with a daemon of its own: this file is
 * the one that needs real evidence, and nothing else shares its daemon.
 */
let ramify: Awaited<ReturnType<typeof realRamify>>;
beforeAll(async () => { ramify = await realRamify(); }, 120_000);
afterAll(async () => { await ramify?.dispose(); }, 120_000);

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await initRepository(fixture.root);
  return fixture.root;
}

describe('the frozen baseline', () => {
  test('a run freezes B from its first snapshot, and job.json names it', async () => {
    const root = await target();
    // The run's inputs materialize the architect view at capture, as a
    // served run's do, so every component of B has a size.
    const { service } = await openRuns(root, { git: gitService, script: [{ kind: 'submit', input: emptyAnalysis() }], ramify: ramify.ramify, inputs: viewedInputs(ramify.ramify) });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const record = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.record), 'utf8')) as RunRecord;
    expect(record.baseline).toMatchObject({ measurement: { id: 'ms-0001', revision: 1 } });
    if (!('measurement' in record.baseline)) throw new Error('no baseline');
    expect(record.baseline.measurement.hash).toMatch(/^[0-9a-f]{64}$/);

    const snapshot = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.measurement('ms-0001')), 'utf8')) as MeasurementSnapshot;
    expect(snapshot.policy).toBe('scope-size/1');
    expect('unavailable' in snapshot.measure).toBe(false);
    if ('unavailable' in snapshot.measure) throw new Error('unavailable');
    expect(snapshot.measure.revision).toMatch(/^rev\//);
    expect(snapshot.measure.hash).toMatch(/^[0-9a-f]{64}$/);

    // The support set: the captured plan and every file of the prompt
    // package, each with the bytes of the captured input.
    const paths = snapshot.supplementary.map(entry => entry.path);
    expect(paths).toContain('plans/review-notes/plan.md');
    expect(paths.some(path => path.endsWith('initial-architect.system.md'))).toBe(true);
    expect(paths.some(path => path.endsWith('SKILL.md'))).toBe(true);
    expect(paths).toContain('initial-analysis.schema.json');
    expect(snapshot.supplementary.every(entry => entry.bytes > 0)).toBe(true);

    // And a client reads it measured, with the bytes it was frozen at. Added
    // by iteration 12: the composition suite found no run whose metrics
    // answered a measured baseline, because every other run test's `ramify`
    // is the stub that measures nothing.
    const metrics = await new RunQueries(service).metrics('review-notes', receipt.jobId);
    expect(metrics.baseline, JSON.stringify(metrics.baseline)).toMatchObject({ state: 'measured' });
  }, 180_000);

  test('the initial architect\'s invocation records its snapshot reference and its S_s components', async () => {
    const root = await target();
    const { service } = await openRuns(root, { git: gitService, script: [{ kind: 'submit', input: emptyAnalysis() }], ramify: ramify.ramify });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const invocation = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.invocation('inv-0002')), 'utf8')) as Invocation;
    expect(invocation.role).toBe('initial-architect');
    expect(invocation.scope.measurement).toMatchObject({ id: 'ms-0001', revision: 1 });
    const size = invocation.scope.size!;
    expect(size.policy).toBe('scope-size/1');
    expect(size.snapshot).toBe('ms-0001');
    expect(size.components.map(component => component.component)).toEqual([
      'owned-source', 'api-views', 'architect-view', 'support-documents',
    ]);
    // The architect's initial scope includes the architect view and its
    // captured instructions; this project has no published view, so the
    // total is unavailable with its known subtotal beside it.
    const architect = size.components.find(component => component.component === 'architect-view')!;
    expect(architect.state).toBe('unavailable');
    expect(architect.bytes).toBeNull();
    expect(architect.reason).toContain('not published');
    expect(size.bytes).toBeNull();
    expect(size.subtotal).toBeGreaterThan(0);
    expect(size.coverage).toBe('partial');
    // Each bucket is preserved beside the aggregate.
    const owned = size.components.find(component => component.component === 'owned-source')!;
    expect(owned.state).toBe('measured');
    expect(Object.keys(owned.buckets!).sort()).toEqual(['documentation', 'production', 'tests']);
  }, 180_000);
});

describe('a component the producer cannot supply', () => {
  test('a project the measurement producer cannot measure leaves the baseline unavailable, never a zero', async () => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    // A `ramify` that is not there: the producer cannot be run.
    const missing = new RamifyCli({ executable: join(directory.path, 'no-such-ramify'), timeoutMs: 10_000 });
    const snapshot = await captureSnapshot({
      id: 'ms-0001',
      ramify: missing,
      projectRoot: directory.path,
      head: '',
      view: { status: 'placeholder' },
      supplementary: [{ path: 'plans/p/plan.md', bytes: 120 }],
    });
    expect('unavailable' in snapshot.measure).toBe(true);
    if (!('unavailable' in snapshot.measure)) throw new Error('available');
    expect(snapshot.measure.unavailable).toContain('ramify measure');

    const size = scopeSize(snapshot, baselineScope('root', ['plans/p/plan.md']));
    const owned = size.components.find(component => component.component === 'owned-source')!;
    expect(owned).toMatchObject({ state: 'unavailable', bytes: null });
    expect(owned.reason).toContain('ramify measure');
    expect(size.bytes).toBeNull();
    expect(size.coverage).toBe('partial');
    // The support documents are still measured; the subtotal is what is known.
    expect(size.subtotal).toBe(120);
  }, 120_000);

  test('a run whose measurement document is absent still starts, with the reason in job.json', async () => {
    const root = await target();
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const { service } = await openRuns(root, {
      git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      ramify: new RamifyCli({ executable: join(directory.path, 'no-such-ramify'), timeoutMs: 10_000 }),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const record = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.record), 'utf8')) as RunRecord;
    expect('unavailable' in record.baseline).toBe(true);
    if (!('unavailable' in record.baseline)) throw new Error('available');
    expect(record.baseline.unavailable).toContain('ramify measure');

    const invocation = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.invocation('inv-0002')), 'utf8')) as Invocation;
    expect(invocation.scope.measurement).toBeNull();
    expect(invocation.scope.size!.bytes).toBeNull();

    // The run itself still fails, because the Ramify check readiness runs is
    // that same command line: an unavailable measurement is a coverage gap,
    // and a check that did not run is never a pass.
    expect(onlyRun(service, 'review-notes').state).toBe('failed');
  }, 180_000);
});

describe('the recipe', () => {
  test('a subtree root covers the owners beneath it, and each is counted once', async () => {
    const root = await target();
    const snapshot = await captureSnapshot({
      id: 'ms-0001', ramify: ramify.ramify, projectRoot: root, head: '', view: null, supplementary: [],
    });
    if ('unavailable' in snapshot.measure) throw new Error(snapshot.measure.unavailable);
    const modules = (snapshot.measure.document as { modules: Array<{ id: string; parent: string | null }> }).modules;
    const rootModule = modules.find(module => module.parent === null)!.id;
    const child = modules.find(module => module.parent === rootModule)!.id;

    const wholeTree = scopeSize(snapshot, { exactOwners: [], subtrees: [rootModule], apiViews: true, architectView: false, supportDocuments: [] });
    const withChild = scopeSize(snapshot, { exactOwners: [child], subtrees: [rootModule], apiViews: true, architectView: false, supportDocuments: [] });
    expect(withChild.bytes).toBe(wholeTree.bytes);

    const childAlone = scopeSize(snapshot, { exactOwners: [child], subtrees: [], apiViews: true, architectView: false, supportDocuments: [] });
    expect(childAlone.bytes!).toBeLessThan(wholeTree.bytes!);
  }, 180_000);

  test('a module that does not exist yet has an unknown size, not a zero one', async () => {
    const root = await target();
    const snapshot = await captureSnapshot({
      id: 'ms-0001', ramify: ramify.ramify, projectRoot: root, head: '', view: null, supplementary: [],
    });
    const proposed = scopeSize(snapshot, { exactOwners: ['collection-review/nothing-yet'], subtrees: [], apiViews: false, architectView: false, supportDocuments: [] });
    const owned = proposed.components.find(component => component.component === 'owned-source')!;
    expect(owned.state).toBe('unknown');
    expect(owned.bytes).toBeNull();
    expect(owned.reason).toContain('unknown size, not a zero one');
  }, 180_000);

  test('the architect view is measured at its publication size when one is published', async () => {
    const root = await target();
    await rm(join(root, architectViewDirectory), { recursive: true, force: true });
    const without = await captureSnapshot({ id: 'ms-0001', ramify: ramify.ramify, projectRoot: root, head: '', view: null, supplementary: [] });
    expect(without.supplementary.some(entry => entry.path === architectViewDirectory)).toBe(false);
    const missing = scopeSize(without, { exactOwners: [], subtrees: [], apiViews: false, architectView: true, supportDocuments: [] });
    expect(missing.components.find(component => component.component === 'architect-view')).toMatchObject({ state: 'unavailable', bytes: null });

    const materialized = await ramify.ramify.materialize(root);
    expect(materialized.ok).toBe(true);
    const withView = await captureSnapshot({ id: 'ms-0002', ramify: ramify.ramify, projectRoot: root, head: '', view: null, supplementary: [] });
    const published = withView.supplementary.find(entry => entry.path === architectViewDirectory);
    expect(published?.bytes).toBeGreaterThan(0);
    const size = scopeSize(withView, { exactOwners: [], subtrees: [], apiViews: false, architectView: true, supportDocuments: [] });
    expect(size.components.find(component => component.component === 'architect-view')).toMatchObject({ state: 'measured', bytes: published!.bytes });
    expect(size.coverage).toBe('complete');
  }, 240_000);
});
