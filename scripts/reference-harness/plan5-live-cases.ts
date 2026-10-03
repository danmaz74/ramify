import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sequenceFixture } from './equivalence-sequences.js';
import { prepareReferenceEdits } from './fixtures/plan2/reference.js';
import { runIsolatedProject } from './mutation.js';
import { archiveObservation, recordObservation } from './observations.js';
import { repositoryRoot } from './plan.js';
import { assertLiveStep, liveSteps, liveSequencePaths, liveSyntheticOverlay, prepareLiveSequence } from './plan5-live-sequences.js';
import { changed, compareAndAudit, liveTrace, status, watching, watchWindow, withLiveProcess } from './plan5-live-process.js';
import type { LiveRevision } from './plan5-live-process.js';
import type { Assertions, InstanceHandler } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const assembly = 'src/assembly.ts';

for (const [subcase, fixture] of [['reference-sequence-live', 'R'], ['hundred-owner-sequence-live', 'S100']] as const) {
  const id = `I5-12:${subcase}`;
  handlers.set(id, { kind: 'memory', run: async ({ assertions: a }) => {
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: id,
      fixture: sequenceFixture(fixture), preserveOnFailure: true }, async ({ root, runDirectory }) => {
      await prepareLiveSequence(root, fixture);
      await withLiveProcess(root, runDirectory, a, async p => {
        const baseline = await p.check(root, false);
        recordObservation('live-fixture', { fixture, owners: baseline.summary.owners, sourceFiles: baseline.summary.sourceFiles,
          inputId: baseline.inputId, overlay: fixture === 'S100' ? liveSyntheticOverlay : null });
        await watching(p, root, a, async (initial, next) => {
          a.equal('watch starts on the checked baseline input', initial.report.inputId, baseline.inputId);
          assertLiveStep(fixture, 0, baseline, initial.report, a);
          await compareAndAudit(p, root, 'baseline', initial, a);
          let previous = initial;
          const steps = liveSteps(fixture);
          a.equal('all twelve reviewed edits are present', steps.length, 12);
          for (const [index, step] of steps.entries()) {
            const label = `${index + 1} ${step.name}`;
            await watchWindow(p, label, previous.revision.sequence, a);
            await step.apply(root);
            // No check or sweep request drives this publication. The installed
            // watch receives the real daemon's event and projects that revision.
            const current = await next();
            a.equal(`${label}: real watcher publishes exactly one revision`,
              [current.revision.sequence, current.revision.cause, current.revision.token],
              [previous.revision.sequence + 1, 'watch', previous.revision.token]);
            a.ok(`${label}: changed input identity`, current.report.inputId !== previous.report.inputId);
            assertLiveStep(fixture, index + 1, previous.report, current.report, a);
            if (index === 0 || index === 1) a.equal(`${label}: one file and no permission work`, current.revision.checked,
              { path: 'unchanged-surface', files: [liveSequencePaths.coreCatalog], accesses: 0, modelRebuilt: false });
            // A source revision decides each access of a re-interpreted file
            // whose facts changed by value, location included. Since Plan 8
            // iteration 7 (ff01212e) R's router imports ProtocolRouter on line
            // 11, directly below the line 10 anchor, so the inserted import
            // moves that one access too. S100's router has no access below it.
            if (index === 2) a.equal(`${label}: only the new import and the accesses it moves are decided`, current.revision.checked,
              { path: 'source', files: [liveSequencePaths.reviewsRouter], accesses: fixture === 'R' ? 2 : 1, modelRebuilt: false });
            if (index === 9) a.equal(`${label}: metadata performs no compiler or decision work`,
              [current.revision.checked, current.revision.timings.compiler, current.revision.timings.link, current.revision.timings.decide],
              [{ path: 'metadata', files: [], accesses: 0, modelRebuilt: false }, 0, 0, 0]);
            if (index >= 10) a.equal(`${label}: membership takes the membership path`, current.revision.checked.path, 'membership');
            // A removed unreferenced file is no longer observed by batch. The
            // exact contract rejects its absent hash, then a retained source
            // identity rendezvous confirms the removal revision for the project.
            if (index === 11) {
              const absent = await changed(p, root, a, `${label} absent path`, step.paths, 2);
              a.equal(`${label}: absent unobserved path is explicit`, absent.reason, 'unobserved-input');
            }
            const hook = await changed(p, root, a, `${label} hook`, index === 11 ? [assembly] : step.paths,
              current.report.summary.errors ? 1 : 0, previous.revision.revision);
            a.equal(`${label}: hook names watcher publication`, hook.revision?.sequence, current.revision.sequence);
            a.equal(`${label}: complete project findings`, hook.findings.map(({ new: _new, ...finding }) => finding), current.report.diagnostics);
            const previousIds = new Set(previous.report.diagnostics.map(finding => finding.id));
            a.equal(`${label}: new marks are relative to the exact prior revision`,
              hook.findings.map(finding => [finding.id, finding.new]), current.report.diagnostics.map(finding => [finding.id, !previousIds.has(finding.id)]));
            a.equal(`${label}: exact removed finding identities`, [...hook.removed].sort(), previous.report.diagnostics
              .filter(finding => !current.report.diagnostics.some(item => item.id === finding.id)).map(finding => finding.id).sort());
            await compareAndAudit(p, root, label, current, a);
            previous = current;
          }
          a.equal('final sequence contains twelve publications', previous.revision.sequence, initial.revision.sequence + 12);
        });
      });
    });
    if (!result.ok) throw result.error;
  } });
}

function reference(subcase: string, run: (root: string, directory: string, a: Assertions) => Promise<void>): void {
  const id = `I5-12:${subcase}`;
  handlers.set(id, { kind: 'memory', run: async ({ assertions }) => {
    const result = await runIsolatedProject({ workRoot: join(repositoryRoot, '.reference-work'), instanceId: id,
      fixture: sequenceFixture('R'), preserveOnFailure: true }, async ({ root, runDirectory }) => {
      await prepareReferenceEdits(root);
      await run(root, runDirectory, assertions);
    });
    if (!result.ok) throw result.error;
  } });
}

reference('hook-race-watcher', async (root, directory, a) => withLiveProcess(root, directory, a, async p => {
  await p.check(root, false);
  const before = await status(p), offset = (await liveTrace(p)).length;
  const gate = join(p.endpoint, 'hold-native-events');
  await writeFile(gate, 'Hold native fs.watch delivery until the racing hook returns.\n');
  try {
    await writeFile(join(root, assembly), await readFile(join(root, assembly), 'utf8') + '\n// racing hook\n');
    const racing = await changed(p, root, a, 'racing hook', [assembly], 0);
    a.equal('racing hook receives the next covering revision', racing.revision?.sequence, before.contexts[0].published!.sequence + 1);
    const events = (await liveTrace(p)).slice(offset);
    a.ok('a real native watcher event was held', events.some(e => e.event === 'live-native-event' && e.held));
    a.equal('racing hook returns before native event delivery', events.filter(e => e.event === 'live-native-delivered'), []);
    a.equal('racing hook joins exactly one actual update', events.filter(e => e.event === 'live-work' && e.operation === 'update').length, 1);
    const check = events.find(e => e.event === 'live-check' && e.params?.scope === 'delta');
    const reply = events.find(e => e.event === 'live-check-result' && e.requestId === check?.params?.requestId);
    a.equal('racing response is verified from the new update', reply?.freshness && [reply.freshness.verified, reply.freshness.reusedRevision], [true, false]);
  } finally { await rm(gate, { force: true }); }
  // Wait for delivery and the duplicate native hint to settle. An unchanged
  // hint may reach update(), but cannot create another revision.
  const deadline = performance.now() + 30_000;
  let settled = await status(p);
  let deliveredAndSettled = false;
  while (performance.now() < deadline) {
    const events = (await liveTrace(p)).slice(offset);
    settled = await status(p);
    if (events.some(e => e.event === 'live-native-delivered') && !settled.contexts[0].pending.analysisRunning
      && settled.contexts[0].pending.changedPaths === 0 && settled.contexts[0].synchronization === 'synchronized'
      && events.some(e => e.event === 'live-work-result' && e.operation === 'update' && e.sequence === before.contexts[0].published!.sequence + 1
        && e.at > events.find(item => item.event === 'live-native-delivered')!.at)) { deliveredAndSettled = true; break; }
    await new Promise(done => setTimeout(done, 50));
  }
  a.ok('real delayed native event was delivered and its update completed', deliveredAndSettled);
  a.equal('late native event does not create a second revision', settled.contexts[0].published!.sequence, before.contexts[0].published!.sequence + 1);
  const laterOffset = (await liveTrace(p)).length;
  const later = await changed(p, root, a, 'later hook', [assembly], 0);
  const laterEvents = (await liveTrace(p)).slice(laterOffset), after = await status(p);
  a.equal('later hook reuses the covering revision', later.revision?.sequence, settled.contexts[0].published!.sequence);
  a.equal('later hook does no analysis', after.counters.analyses, settled.counters.analyses);
  const request = laterEvents.find(e => e.event === 'live-check' && e.params?.scope === 'delta');
  const reply = laterEvents.find(e => e.event === 'live-check-result' && e.requestId === request?.params?.requestId);
  a.equal('later wire response states verified reuse with no capture', reply?.freshness &&
    [reply.freshness.verified, reply.freshness.reusedRevision, reply.freshness.captureStarted], [true, true, null]);
  recordObservation('live-race', { before: before.counters, after: after.counters,
    raw: await archiveObservation('live-race', (await liveTrace(p)).slice(offset)) });
}, 30_000));

reference('burst-coalesced', async (root, directory, a) => withLiveProcess(root, directory, a, async p => {
  await p.check(root, false);
  await watching(p, root, a, async (initial, next) => {
    const paths = [assembly, 'src/interfaces/protocol.ts', 'subs/workspace/src/app.tsx',
      'subs/workspace/subs/contracts/src/interfaces/vocabulary.ts', 'subs/workspace/subs/reviews/src/router.ts'];
    // Read before starting the window: only the five writes are timed.
    const contents = await Promise.all(paths.map(path => readFile(join(root, path), 'utf8')));
    const offset = (await liveTrace(p)).length;
    const started = performance.now();
    await Promise.all(paths.map((path, index) => writeFile(join(root, path), contents[index] + '\n// coalesced live edit\n')));
    const elapsed = performance.now() - started;
    a.ok('all five physical writes occur within one 100 ms window', elapsed < 100);
    const hooks = paths.map((path, index) => changed(p, root, a, `burst hook ${index + 1}`, [path], 0));
    // Always settle subprocesses even if one expectation fails.
    const outcomes = await Promise.allSettled(hooks);
    const failure = outcomes.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const documents = outcomes.map(result => { assert.equal(result.status, 'fulfilled'); return result.value; });
    // Decision of 2026-09-14 (Plan 5 iteration 13): a hook arriving while the
    // context holds a pending debounce cancels it and captures at once, which
    // keeps every ordinary hook off the watcher's window. A burst therefore
    // publishes the first racing hook's capture and at most one revision
    // coalescing the hooks that queued behind it.
    const after = await status(p);
    const published = after.contexts[0].published!.sequence;
    const advance = published - initial.revision.sequence;
    a.ok('the burst advances the sequence by one or two', advance >= 1 && advance <= 2);
    const revisions: LiveRevision[] = [];
    do { revisions.push(await next()); } while (revisions[revisions.length - 1].revision.sequence < published);
    const current = revisions[revisions.length - 1];
    const sequences = revisions.map(revision => revision.revision.sequence);
    a.equal('the watch publishes exactly the burst revisions the daemon counted', sequences,
      revisions.map((_, index) => initial.revision.sequence + 1 + index));
    a.equal('every hook is answered from one of the burst revisions',
      documents.map(document => sequences.includes(document.revision?.sequence ?? -1)), paths.map(() => true));
    a.equal('every hook is covered by the revision that answered it',
      documents.map(document => document.changed.every(identity => identity.covered)), paths.map(() => true));
    a.equal('the burst revisions together name all five changed files',
      [...new Set(revisions.flatMap(revision => revision.revision.changed))].sort(), [...paths].sort());
    a.equal('burst has no findings or superseded hook', documents.map(document => [document.reason, document.findings]), paths.map(() => [null, []]));
    recordObservation('live-burst', { paths, writeWindowMs: elapsed, documents, sequences,
      hookSequences: documents.map(document => document.revision?.sequence),
      raw: await archiveObservation('live-burst', (await liveTrace(p)).slice(offset)) });
    // Equality is independent of coalescing and uses the same saved bytes.
    await compareAndAudit(p, root, 'burst', current, a);
  });
}, 10_000));

reference('removals-live', async (root, directory, a) => {
  const extra = 'subs/workspace/subs/catalog/src/extra.ts';
  const module = 'subs/integration-tests', moduleSource = `${module}/src/removal.ts`;
  await writeFile(join(root, extra), "import type { InspectionPort } from '../../reviews/subs/core/src/interfaces/port.js';\n", { flag: 'wx' });
  await mkdir(join(root, module, 'src'), { recursive: true });
  await writeFile(join(root, moduleSource), "import type { InspectionPort } from '../../workspace/subs/reviews/subs/core/src/interfaces/port.js';\n", { flag: 'wx' });
  await withLiveProcess(root, directory, a, async p => {
    const baseline = await p.check(root, false);
    a.equal('both removal subjects carry independent not-visible findings', baseline.diagnostics.map(finding =>
      [finding.code, finding.location?.file, finding.original?.binding]).sort(), [[ 'not-visible', extra, 'InspectionPort' ], ['not-visible', moduleSource, 'InspectionPort']].sort());
    await watching(p, root, a, async (initial, next) => {
      await compareAndAudit(p, root, 'removal baseline', initial, a);
      let previous: LiveRevision = initial;
      for (const [index, target] of [extra, module].entries()) {
        const label = index === 0 ? 'owned file removal' : 'whole module removal';
        await watchWindow(p, label, previous.revision.sequence, a);
        await rm(join(root, target), { recursive: index === 1 });
        const current = await next();
        a.equal(`${label}: watcher alone publishes one revision`, [current.revision.sequence, current.revision.cause], [previous.revision.sequence + 1, 'watch']);
        const removed = previous.report.diagnostics.filter(finding => finding.location?.file === (index === 0 ? extra : moduleSource));
        a.equal(`${label}: subject carried exactly one finding`, removed.length, 1);
        const hook = await changed(p, root, a, label, [assembly], index === 0 ? 1 : 0, previous.revision.revision);
        a.equal(`${label}: delta removes exactly its finding`, hook.removed, removed.map(finding => finding.id));
        a.equal(`${label}: remaining independently expected findings`, current.report.diagnostics.map(finding =>
          [finding.code, finding.location?.file]), index === 0 ? [['not-visible', moduleSource]] : []);
        a.equal(`${label}: source leaves inventory and catalog`, [current.report.snapshot!.inventory.files.some(file => file.path === extra),
          current.report.snapshot!.catalog!.files.some(file => file.file === extra)], [false, false]);
        if (index === 1) {
          a.equal('removed module and every owned file leave the inventory', [current.report.summary.owners,
            current.report.snapshot!.inventory.modules.some(owner => owner.id.endsWith('/integration-tests')),
            current.report.snapshot!.inventory.files.some(file => file.path.startsWith(module + '/')),
            current.report.snapshot!.catalog!.files.some(file => file.file.startsWith(module + '/'))], [14, false, false, false]);
        }
        await compareAndAudit(p, root, label, current, a);
        previous = current;
      }
    });
  });
});

export const plan5LiveHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
