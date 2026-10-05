import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { FastResident, compactStatus } from './fast-driver.mjs';
import { fastFixture } from './fast-fixture.mjs';
import { companionEditKinds, editKindsFor, fastBudgets, fixtureForId } from './fast-plan.mjs';
import { command, sampleMetrics, unwrap } from './resident-driver.mjs';
import { executeResidentWorkload } from './resident-workloads.mjs';
import { sha256 } from './common.mjs';
import { retainedLimitReset } from './fast-assertions.mjs';

function settledSample(value) {
  const sample = sampleMetrics(value);
  // Current revision bodies are recorded once per save. Telemetry keeps headers
  // so measurement itself does not retain hundreds of copies of broad file lists.
  return { ...sample, contexts: sample.contexts.map(context => ({ ...context,
    published: context.published && { sequence: context.published.sequence, fingerprints: context.published.fingerprints },
    lastValid: context.lastValid && { sequence: context.lastValid.sequence, fingerprints: context.lastValid.fingerprints },
  })) };
}

const maintenance = counters => counters.sweeps + counters.audits;

/**
 * Why a save leaves the daemon unable to publish: its hook answered
 * `unavailable` (as when the session worker exits), or an analysis ran and
 * settled without publishing a new revision. Null for a save that published.
 */
export function analysisStop(cycle, before, current) {
  const document = cycle.hook?.document;
  if (document?.outcome === 'not-checked' && document.reason === 'unavailable') return 'unavailable';
  const b = cycle.countersBeforeSave, s = cycle.settled?.counters;
  const analyses = b && s ? s.analyses - b.analyses - (maintenance(s) - maintenance(b)) : 0;
  return current?.published?.sequence === before?.published?.sequence && analyses > 0 ? 'no-revision' : null;
}

/**
 * The measured failure point of a stopped workload: the save, the hook's
 * answer, and the context's retained bytes before the history reset and the
 * retry's duration as the daemon telemetry shows them.
 */
export function failurePoint(cycle, telemetry, trigger, before = null) {
  const hook = cycle.hook, document = hook?.document;
  const phase = cycle.position === 'published' ? 'watcher already published' : cycle.kind;
  const finding = document?.findings?.find(item => item.category === 'unavailable') ?? document?.findings?.[0] ?? null;
  const returnedAt = cycle.hookStartedAt + (hook?.durationMs ?? 0);
  return { phase, kind: cycle.kind, position: cycle.position, cycle: cycle.index + 1, trigger,
    beforeSequence: cycle.beforeSequence, publishedSequence: cycle.revision?.sequence ?? null,
    hook: { code: hook?.code ?? null, durationMs: hook?.durationMs ?? null, outcome: document?.outcome ?? null,
      reason: document?.reason ?? null, execution: document?.execution ?? null },
    message: finding?.message ?? null,
    contextBefore: before && { retainedBytes: before.retainedBytes ?? null, historyRetained: before.history?.retained ?? null },
    retainedLimit: retainedLimitReset(telemetry, cycle.revision?.token, cycle.beforeSequence, cycle.writtenAt,
      Number.isFinite(returnedAt) ? returnedAt : Date.now()) };
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
    const cycle = { kind, index, position, expected, writtenAt, hookStartedAt,
      beforeSequence: before.published.sequence, countersBeforeSave,
      beforeHook: beforeHook && compactStatus(beforeHook), afterHook: afterHook && compactStatus(afterHook), hook, revision, settled,
      settledProcessSample: host.observer.samples[mark] };
    const trigger = analysisStop(cycle, before, current);
    if (trigger) Object.defineProperty(cycle, 'stop', { value: failurePoint(cycle, host.telemetry, trigger, before), enumerable: false });
    return cycle;
  }
  /**
   * Keeps a save in its row, then stops the workload at once when the daemon can
   * no longer publish: every later save would only wait out its guard.
   */
  function keep(target, list, cycle) {
    list.push(cycle);
    if (!cycle.stop) return;
    target.failurePoint = cycle.stop;
    const { phase, position, cycle: number, trigger, message, hook } = cycle.stop;
    throw new Error(`Stopped at ${phase} ${number} (${position}): the hook answered ${hook.outcome ?? 'nothing'}`
      + `${hook.reason ? ` (${hook.reason})` : ''} after ${Math.round(hook.durationMs ?? 0)} ms`
      + `${message ? `: ${message}` : ''}${trigger === 'no-revision' ? '; the analysis settled without a new revision' : ''}`);
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
          keep(measurements, cycles, await save(host, project, token, kind, index)); checkpoint(kind, index + 1, 20);
        }
      }
      measurements.cycles.created = []; measurements.cycles.deleted = [];
      for (let index = 0; index < fastBudgets.editCycles; index++) {
        keep(measurements, measurements.cycles.deleted, await save(host, project, token, 'deleted', index));
        keep(measurements, measurements.cycles.created, await save(host, project, token, 'created', index));
        checkpoint('deleted/created pairs', index + 1, 20);
      }
      // Plan 8's two edit classes follow every Plan 5 racing class, so those keep their order;
      // the published hooks stay last, where the clone probe reads their revision.
      for (const kind of companionEditKinds.filter(kind => editKindsFor(name).includes(kind))) {
        const cycles = measurements.cycles[kind] = [];
        for (let index = 0; index < fastBudgets.editCycles; index++) {
          keep(measurements, cycles, await save(host, project, token, kind, index)); checkpoint(kind, index + 1, 20);
        }
      }
      for (let index = 0; index < fastBudgets.editCycles; index++) {
        keep(measurements, measurements.published, await save(host, project, token, 'body', index, 'published'));
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
          keep(destination, destination.cycles, await save(host, project, token, 'body', index));
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
