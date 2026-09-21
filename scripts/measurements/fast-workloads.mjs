import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { FastResident, compactStatus } from './fast-driver.mjs';
import { fastFixture } from './fast-fixture.mjs';
import { companionEditKinds, editKindsFor, fastBudgets, fixtureForId } from './fast-plan.mjs';
import { command, sampleMetrics, unwrap } from './resident-driver.mjs';
import { executeResidentWorkload } from './resident-workloads.mjs';
import { sha256 } from './common.mjs';

function settledSample(value) {
  const sample = sampleMetrics(value);
  // Current revision bodies are recorded once per save. Telemetry keeps headers
  // so measurement itself does not retain hundreds of copies of broad file lists.
  return { ...sample, contexts: sample.contexts.map(context => ({ ...context,
    published: context.published && { sequence: context.published.sequence, fingerprints: context.published.fingerprints },
    lastValid: context.lastValid && { sequence: context.lastValid.sequence, fingerprints: context.lastValid.fingerprints },
  })) };
}

export async function executeFastWorkload(id, options, measurements, checkpoint) {
  if (id === 'I5-13:entry-footprints') {
    return executeResidentWorkload('entry-footprints', options, measurements, checkpoint);
  }
  let serial = 0;
  const { scratch, templates, executable } = options;
  const hostFor = () => new FastResident(join(scratch, `f${++serial}`), executable);
  async function prepared(name, suffix = name) {
    const project = await fastFixture(scratch, templates, name, `fast-${suffix}`);
    measurements.fixtures ??= [];
    measurements.fixtures.push({ name, owners: project.owners, setupIdentity: project.setupIdentity,
      body: project.body, source: project.source, created: project.created,
      creationWitness: project.creationWitness, sourceImporters: project.sourceImporters,
      ...(project.signature ? { signature: project.signature, companion: project.companion,
        companionFindings: project.companionFindings } : {}) });
    return project;
  }
  async function start(host, project, target = measurements) {
    if (!host.connection) await host.connect();
    const started = performance.now(), token = await host.open(project);
    const reply = await host.delta(token);
    const cold = { durationMs: performance.now() - started, reply };
    target.cold = cold;
    assert.equal(reply.status, 'reported', JSON.stringify(reply));
    assert.equal(reply.published, true); assert.equal(reply.revision.outcome.execution, 'completed');
    assert.equal(reply.revision.summary.owners, project.owners);
    assert.equal(reply.revision.summary.denied, 0);
    await host.quiet();
    return { token, cold };
  }
  async function save(host, project, token, kind, index, position = 'racing') {
    const before = await host.context(token), countersBeforeSave = (await host.status()).counters;
    const expected = await project.change(kind, index);
    const writtenAt = Date.now();
    if (position === 'published') await host.published(token, before.published.sequence);
    const beforeHook = position === 'published' ? await host.status() : null;
    const hookStartedAt = Date.now();
    const hook = await host.hook(project, expected);
    // Sampled as soon as the hook returns, so later sweeps and audits are not attributed to it.
    const afterHook = position === 'published' ? await host.status() : null;
    const settled = settledSample(await host.quiet());
    const current = await host.context(token);
    const revision = current.published;
    const mark = host.observer.mark();
    return { kind, index, position, expected, writtenAt, hookStartedAt,
      beforeSequence: before.published.sequence, countersBeforeSave,
      beforeHook: beforeHook && compactStatus(beforeHook), afterHook: afterHook && compactStatus(afterHook), hook, revision, settled,
      settledProcessSample: host.observer.samples[mark] };
  }
  async function captureHost(host, destination) {
    try { await host.close(); }
    finally {
      destination.telemetry = host.telemetry;
      destination.telemetryErrors = host.telemetryErrors;
      destination.processSamples = host.observer.samples;
      destination.cleanup = { liveProcesses: host.observer.live(), stopped: true };
      try { destination.finalInstrumentation = JSON.parse(await readFile(join(host.endpoint, 'measurement.json'), 'utf8')); }
      catch (error) { destination.telemetryErrors.push(`Final instrumentation missing: ${String(error)}`); }
    }
  }
  const name = fixtureForId(id);
  if (name) {
    const project = await prepared(name), host = hostFor();
    measurements.name = name; measurements.bareNode = []; measurements.zeroWork = [];
    measurements.cycles = {}; measurements.published = [];
    try {
      const { token, cold } = await start(host, project); measurements.cold = cold;
      for (let index = 0; index < fastBudgets.editCycles; index++) {
        const floor = await command(process.execPath, ['-e', ''], { env: host.environment });
        measurements.bareNode.push(floor);
        const expected = [{ path: project.body, sha256: sha256(await readFile(join(project.root, project.body))) }];
        const before = compactStatus(await host.status()), hook = await host.hook(project, expected);
        measurements.zeroWork.push({ hook, before, after: compactStatus(await host.status()) });
      }
      checkpoint('process floor and zero-work client', 20, 20);
      for (const kind of ['body', 'source', 'description', 'readme', 'configuration']) {
        const cycles = measurements.cycles[kind] = [];
        for (let index = 0; index < fastBudgets.editCycles; index++) {
          cycles.push(await save(host, project, token, kind, index)); checkpoint(kind, index + 1, 20);
        }
      }
      measurements.cycles.created = []; measurements.cycles.deleted = [];
      for (let index = 0; index < fastBudgets.editCycles; index++) {
        measurements.cycles.deleted.push(await save(host, project, token, 'deleted', index));
        measurements.cycles.created.push(await save(host, project, token, 'created', index));
        checkpoint('deleted/created pairs', index + 1, 20);
      }
      // Plan 8's two edit classes follow every Plan 5 racing class, so those keep their order;
      // the published hooks stay last, where the clone probe reads their revision.
      for (const kind of companionEditKinds.filter(kind => editKindsFor(name).includes(kind))) {
        const cycles = measurements.cycles[kind] = [];
        for (let index = 0; index < fastBudgets.editCycles; index++) {
          cycles.push(await save(host, project, token, kind, index)); checkpoint(kind, index + 1, 20);
        }
      }
      for (let index = 0; index < fastBudgets.editCycles; index++) {
        measurements.published.push(await save(host, project, token, 'body', index, 'published'));
        checkpoint('watcher already published', index + 1, 20);
      }
      measurements.cloneProbe = await host.cloneProbe();
      checkpoint('revision array cloning');
    } finally { await captureHost(host, measurements); }
  } else if (id === 'I5-13:repeated-edit-plateau') {
    for (const name of ['reference', 'S100']) {
      const project = await prepared(name), host = hostFor();
      const destination = measurements[name] = { cycles: [] };
      try {
        const { token } = await start(host, project, destination);
        for (let index = 0; index < fastBudgets.repeatedCycles; index++) {
          destination.cycles.push(await save(host, project, token, 'body', index));
          checkpoint(`${name}: alternating edit/revert`, index + 1, fastBudgets.repeatedCycles);
        }
      } finally { await captureHost(host, destination); }
    }
  } else if (id === 'I5-13:hot-warm-memory') {
    const reference = await prepared('reference', 'memory-reference'), referenceHost = hostFor();
    measurements.reference = {};
    try {
      await start(referenceHost, reference, measurements.reference);
      measurements.reference.settled = settledSample(await referenceHost.quiet());
    } finally { await captureHost(referenceHost, measurements.reference); }
    const host = hostFor(); measurements.opened = [];
    try {
      await host.connect();
      for (let index = 0; index < 8; index++) {
        const project = await prepared('S100', `many-${index}`), { token, cold } = await start(host, project);
        // Subscriptions keep all eight contexts active without changing budgets.
        const subscribed = unwrap(await host.connection.subscribe({ token }, () => {}));
        measurements.opened.push({ token, cold, subscription: subscribed.subscription });
        checkpoint('two hot and six warm', index + 1, 8);
      }
      measurements.settled = settledSample(await host.quiet());
      const mark = host.observer.mark();
      measurements.settledProcessSample = host.observer.samples[mark];
    } finally { await captureHost(host, measurements); }
  } else throw new Error(`Unknown standalone fast workload ${id}`);
}
