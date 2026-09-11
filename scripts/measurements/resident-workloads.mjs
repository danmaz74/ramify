import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { encodeJsonFrame, createFrameDecoder } from '../../dist/subs/daemon/src/codec.js';
import { Resident, command, controls, fixture, reportCommand, sampleMetrics, unwrap, engine } from './resident-driver.mjs';
import { residentBudgets as budgets } from './resident-plan.mjs';
import { packageRoot, median } from './common.mjs';
import { treeIdentity } from './identities.mjs';

const peak = samples => Math.max(0, ...samples.map(sample => sample.combinedRssBytes));
function compactCli(sample, report) { return { pid: sample.pid, durationMs: sample.durationMs, code: sample.code, report,
  peakCliRssBytes: sample.peakCliRssBytes, samples: sample.processes }; }
export async function executeResidentWorkload(suffix, options, measurements, checkpoint) {
  const { scratch, templates, executable } = options;
  let serial = 0;
  const resident = () => new Resident(join(scratch, `e${++serial}`), executable);
  const prepared = async (name, label = name) => {
    const project = await fixture(scratch, templates, name, `${suffix}-${label}`);
    measurements.fixtures ??= [];
    measurements.fixtures.push({ name, owners: project.owners, setupIdentity: treeIdentity(project.root) });
    return project;
  };
  async function cold(project) {
    const host = resident();
    await import('node:fs/promises').then(fs => fs.mkdir(host.endpoint, { recursive: true, mode: 0o700 }));
    try {
      const sample = await host.cli(project);
      const report = reportCommand(sample, project.owners);
      await host.connect('never');
      return { ...compactCli(sample, report), daemonPid: host.pid, instanceId: host.instance.instanceId,
        settled: sampleMetrics(await host.settled()) };
    } finally { await host.close(); }
  }
  async function warmed(project) {
    const host = resident();
    try { await host.connect(); const token = await host.open(project); await host.check(project, token); return { host, token }; }
    catch (error) { await host.close(); throw error; }
  }
  async function cliCycle(project, host, kind, index) {
    const expected = await project.edit(kind, index);
    const sample = await host.cli(project);
    const report = reportCommand(sample, project.owners, kind === 'exposure' && index % 2 === 0 ? 1 : 0, expected);
    if (host.lastInput) {
      if (kind === 'unchanged') assert.equal(report.inputId, host.lastInput, 'Unchanged check must preserve captured identity');
      else assert.notEqual(report.inputId, host.lastInput, 'Edit must change captured identity');
    }
    host.lastInput = report.inputId;
    const settled = await host.settled();
    const latest = settled.instrumentation.increments.at(-1);
    assert.equal(latest?.execution, 'completed', 'Real increment trace required');
    assert.equal(latest.inputId, report.inputId, 'Trace must identify this captured result');
    return { ...compactCli(sample, report), expected, reused: latest.reused, settled: sampleMetrics(settled) };
  }
  if (suffix === 'entry-footprints') {
    const short = resident();
    try {
      const mark = short.observer.mark();
      const help = await command(executable, ['--help'], { env: short.environment, observer: short.observer });
      assert.equal(help.code, 0); assert.equal(help.stderr, ''); assert.match(help.stdout, /ramify/);
      const samples = short.observer.since(mark);
      measurements.help = { rssBytes: peak(samples), durationMs: help.durationMs, samples };
      const clientMark = short.observer.mark();
      const client = await command(process.execPath, ['--input-type=module', '--eval', "await import('ramify.ts/client'); await new Promise(resolve => setTimeout(resolve, 100));"], { observer: short.observer });
      assert.equal(client.code, 0); assert.equal(client.stderr, '');
      const clientSamples = short.observer.since(clientMark);
      measurements.client = { rssBytes: peak(clientSamples), durationMs: client.durationMs, samples: clientSamples };
      checkpoint();
      await short.connect();
      const empty = await short.settled();
      assert.equal(empty.contexts.length, 0);
      measurements.daemonEmpty = { rssBytes: empty.memory.rss, settled: sampleMetrics(empty) };
      const project = await prepared('reference');
      const token = await short.open(project); await short.check(project, token);
      const warm = await short.settled();
      measurements.daemonReference = { rssBytes: warm.memory.rss, settled: sampleMetrics(warm) };
      const cli = await short.cli(project); const report = reportCommand(cli, project.owners);
      measurements.cliReference = { rssBytes: cli.peakCliRssBytes, ...compactCli(cli, report) };
    } finally { await short.close(); }
    const hundred = await prepared('S100'), { host } = await warmed(hundred);
    try { const cli = await host.cli(hundred); measurements.cliS100 = { rssBytes: cli.peakCliRssBytes, ...compactCli(cli, reportCommand(cli, 100)) }; }
    finally { await host.close(); }
  } else if (suffix.startsWith('cold-warm-broad-')) {
    const project = await prepared(suffix.endsWith('reference') ? 'reference' : 'S100');
    measurements.cold = []; measurements.cycles = {};
    for (let index = 0; index < budgets.coldSamples; index++) { measurements.cold.push(await cold(project)); checkpoint('cold', index + 1, budgets.coldSamples); }
    const { host, token } = await warmed(project);
    try {
      for (const kind of ['unchanged', 'readme', 'exposure', 'source', 'configuration']) {
        const cycles = measurements.cycles[kind] = [];
        for (let index = 0; index < budgets.editCycles; index++) {
          cycles.push(await cliCycle(project, host, kind, index)); checkpoint(kind, index + 1, budgets.editCycles);
        }
      }
      measurements.status = await host.statusTimings(project, token);
      measurements.medians = Object.fromEntries(Object.entries(measurements.cycles).map(([kind, cycles]) => [kind, median(cycles.map(cycle => cycle.durationMs))]));
    } finally { await host.close(); }
  } else if (suffix === 'repeated-edit-plateau') {
    for (const name of ['reference', 'S100']) {
      const project = await prepared(name), { host, token } = await warmed(project);
      const cycles = []; measurements[name] = { cycles };
      try {
        for (let index = 0; index < budgets.plateau.cycles; index++) {
          const expected = await project.edit('source', index), mark = host.observer.mark();
          const run = await host.check(project, token, expected);
          assert.equal(run.report.summary.denied, 0); assert.equal(run.report.outcome.coverage, 'complete');
          const settled = sampleMetrics(await host.settled());
          cycles.push({ cycle: index + 1, ...run, expected, settled, samples: host.observer.since(mark) });
          checkpoint(`${name}: alternating source`, index + 1, budgets.plateau.cycles);
        }
      } finally { await host.close(); }
    }
  } else if (suffix === 'many-contexts') {
    const host = resident(); measurements.opened = [];
    try {
      await host.connect();
      for (let index = 0; index < budgets.manyContexts.contexts; index++) {
        const project = await prepared('S100', `S100-${index}`), token = await host.open(project);
        const run = await host.check(project, token); measurements.opened.push({ token, revision: run.revision });
        checkpoint('warm contexts', index + 1, budgets.manyContexts.contexts);
      }
      measurements.settled = sampleMetrics(await host.settled());
    } finally { await host.close(); }
  } else if (suffix === 'synthetic-500' || suffix === 'synthetic-1000') {
    const project = await prepared(suffix === 'synthetic-500' ? 'S500' : 'S1000');
    const host = resident();
    await import('node:fs/promises').then(fs => fs.mkdir(host.endpoint, { recursive: true, mode: 0o700 }));
    try {
      const initial = await host.cli(project), report = reportCommand(initial, project.owners);
      await host.connect('never');
      host.lastInput = report.inputId;
      const coldSamples = initial.processes.map(sample => ({ ...sample, processes: sample.processes.filter(p => p.pid !== initial.pid),
        combinedRssBytes: sample.processes.filter(p => p.pid !== initial.pid).reduce((sum, p) => sum + p.rssBytes, 0) }));
      measurements.cold = compactCli(initial, report); checkpoint('cold');
      const mark = host.observer.mark();
      measurements.source = await cliCycle(project, host, 'source', 0);
      const sourceSamples = host.observer.since(mark, [measurements.source.pid]);
      measurements.samples = [...coldSamples, ...sourceSamples]; measurements.peakBytes = peak(measurements.samples);
    } finally { await host.close(); }
  } else if (suffix === 'publication-peak') {
    for (const name of ['reference', 'S100']) {
      const project = await prepared(name), { host, token } = await warmed(project);
      try {
        const expected = await project.edit('source', 0), mark = host.observer.mark();
        const run = await host.check(project, token, expected);
        const samples = host.observer.since(mark);
        measurements[name] = { ...run, samples, peakBytes: peak(samples), reportBytes: run.report.bytes,
          settled: sampleMetrics(await host.settled()) };
      } finally { await host.close(); }
      checkpoint(name);
    }
  } else if (suffix === 'slow-consumer') {
    const project = await prepared('S100'), { host, token } = await warmed(project);
    let peer;
    try {
      measurements.before = await host.settled(); measurements.publications = [];
      peer = await slowSubscriber(host, token);
      for (let index = 0; index < budgets.slowConsumer.publications; index++) {
        const expected = await project.edit('source', index);
        const publication = await host.check(project, token, expected); measurements.publications.push(publication);
        // Headers alone fit comfortably in 64 MiB. Also request actual retained
        // reports while refusing their reads, using at most 16 admitted requests.
        // The responses exercise the same bounded queue as publication events.
        for (let request = 0; request < 16 && !peer.socket.destroyed; request++) peer.send({ type: 'request', id: `report-${index}-${request}`,
          op: 'check', params: { token, requestId: `slow-${index}-${request}`, freshness: { mode: 'published', wait: false } } });
        await delay(100); checkpoint('non-reading publications', index + 1, budgets.slowConsumer.publications);
      }
      await delay(1500);
      measurements.after = await host.settled();
      measurements.socket = { reading: false, sentRequests: peer.sent, intentionallyClosedAfterObservation: true };
    } finally { peer?.socket.destroy(); await host.close(); }
  } else throw new Error(`Unknown resident workload ${suffix}`);
  checkpoint();
}
async function slowSubscriber(host, token) {
  const record = JSON.parse(await readFile(join(host.endpoint, `daemon-${host.instance.buildKey}.json`), 'utf8'));
  const socket = createConnection(record.socket); let serial = 0, sent = 0;
  const pending = new Map(); let welcome;
  const decoder = createFrameDecoder(32 * 1024 ** 2 + 64 * 1024, message => {
    if (message.type === 'welcome') welcome?.resolve(message);
    else if (message.type === 'ping') socket.write(encodeJsonFrame({ type: 'pong' }, 1024));
    else if (message.type === 'response') { pending.get(message.id)?.resolve(message.result); pending.delete(message.id); }
    else if (message.type === 'reject') welcome?.reject(new Error(JSON.stringify(message)));
  });
  socket.on('data', data => { try { decoder.push(data); } catch { socket.destroy(); } });
  socket.on('error', error => { welcome?.reject(error); for (const value of pending.values()) value.reject(error); });
  const send = value => { if (!socket.destroyed) { socket.write(encodeJsonFrame(value, 1024 * 1024)); sent++; } };
  const wait = promise => Promise.race([promise, delay(5000).then(() => { throw new Error('Slow-reader setup timeout'); })]);
  try {
    const greeted = new Promise((resolve, reject) => { welcome = { resolve, reject }; });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    send({ type: 'hello', handshake: { protocol: 'ramify.ipc/1', client: { name: 'measurement-slow-reader', version: host.instance.version },
      buildKey: host.instance.buildKey, engine } });
    await wait(greeted);
    const request = (op, params) => {
      const id = `setup-${++serial}`;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      send({ type: 'request', id, op, params }); return wait(response);
    };
    unwrap(await request('subscribe', { token }));
    socket.pause();
    // Keep the peer's lease alive without reading server frames. Congestion,
    // rather than the independent 45-second lease expiry, must cause removal.
    const heartbeat = setInterval(() => send({ type: 'ping' }), 10_000); heartbeat.unref();
    socket.once('close', () => { clearInterval(heartbeat); decoder.dispose(); });
    return { socket, send, get sent() { return sent; } };
  } catch (error) { socket.destroy(); decoder.dispose(); throw error; }
}
