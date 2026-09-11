import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { connectDaemon } from 'ramify.ts/client';
import { capabilities, packageRoot, median } from './common.mjs';
import { observeResidentProcesses } from './resident-observer.mjs';

const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
export const engine = `ramify.ts@${manifest.version}+typescript@7.0.2`;
export const daemonEntry = join(packageRoot, 'scripts/measurements/resident-daemon.mjs');
export const controls = new Set();
export function unwrap(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
export const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
export async function command(executable, args, { cwd = packageRoot, env = {}, observer, timeoutMs = 130_000 } = {}) {
  const started = performance.now();
  const child = spawn(executable, args, { cwd, detached: true, env: { ...process.env, NODE_OPTIONS: '', NO_COLOR: '1', FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [], err = []; let bytes = 0, failure;
  if (child.pid) observer?.add(child.pid);
  const stop = message => { failure ??= message; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } };
  for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => {
    bytes += chunk.length; if (bytes > 40 * 1024 ** 2) stop('Measured command output exceeds finite buffer'); else chunks.push(chunk);
  });
  child.once('error', error => { failure = error.message; });
  const deadline = setTimeout(() => stop(`Measured command exceeded ${timeoutMs} ms`), timeoutMs);
  const exit = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(deadline);
  return { pid: child.pid, ...exit, durationMs: performance.now() - started, failure: failure ?? null,
    stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') };
}
export function capturedExpected(report, expected) {
  const captured = expected.map(value => {
    const input = report.snapshot?.inputs.find(item => item.path === value.path && item.role !== 'directory');
    assert.ok(input, `Expected input was not captured: ${value.path}`);
    assert.equal(input.sha256, value.sha256, `Report captured stale content: ${value.path}`);
    return { path: input.path, sha256: input.sha256 };
  });
  return captured;
}
export function reportCommand(result, owners, denied = 0, expected = []) {
  assert.equal(result.failure, null); assert.equal(result.signal, null);
  assert.equal(result.stderr, '', 'Resident command must not fall back or recover');
  assert.equal(result.code, denied ? 1 : 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 'ramify.analysis/1');
  assert.deepEqual(report.outcome, { execution: 'completed', check: denied ? 'failed' : 'passed', coverage: 'complete' });
  assert.equal(report.summary.owners, owners); assert.equal(report.summary.denied, denied);
  assert.equal(report.coverage.length, 0); assert.ok(report.stages.every(stage => stage.status === 'completed'));
  return { inputId: report.inputId, runId: report.runId, summary: report.summary, outcome: report.outcome,
    captured: capturedExpected(report, expected),
    reportBytes: Buffer.byteLength(result.stdout), outputSha256: createHash('sha256').update(result.stdout).digest('hex') };
}
export async function fixture(scratch, templates, name, suffix = name) {
  const root = join(scratch, `fixture-${suffix}`);
  await cp(join(templates, name), root, { recursive: true, dereference: false });
  if (name === 'reference') await symlink(join(packageRoot, 'examples/collection-review/node_modules'), join(root, 'node_modules'));
  if (name !== 'reference') {
    const declaration = join(root, 'subs/m001/module.ramify');
    await writeFile(declaration, await readFile(declaration, 'utf8') + 'expose-src value from "interfaces/api.ts" to parent\n');
    const caller = join(root, 'src/impl0.ts');
    await writeFile(caller, "import { value as supplied } from '../subs/m001/src/interfaces/api.js'; void supplied;\n" + await readFile(caller, 'utf8'));
  }
  const definitions = name === 'reference' ? {
    readme: ['subs/workspace/README.md', 'Workspace is the browser shell.', 'Workspace is the browser shell for resident measurements.'],
    exposure: ['subs/workspace/module.ramify', 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent', 'expose-sub createCatalogTools, inspectRecord from catalog to parent'],
    source: ['src/assembly.ts', "export type AppRouter = AssembledSystem['router'];", "export type AppRouter = AssembledSystem['router'];\nexport const residentMeasurementValue = 1;"],
    configuration: ['tsconfig.json', '"target": "ES2022"', '"target": "ES2021"'],
  } : {
    readme: ['subs/m001/README.md', 'Supplies deterministic workload bytes', 'Supplies current deterministic workload bytes'],
    exposure: ['subs/m001/module.ramify', 'expose-src value from "interfaces/api.ts" to parent\n', '// measurement exposure removed\n'],
    source: ['src/impl0.ts', 'return input.value + value;', 'return input.value + value + 1;'],
    configuration: ['tsconfig.json', '"target": "ES2022"', '"target": "ES2021"'],
  };
  const original = new Map();
  for (const [path, before] of Object.values(definitions)) {
    const text = await readFile(join(root, path), 'utf8');
    assert.equal(text.split(before).length, 2, `Expected exactly one measurement edit anchor: ${name}/${path}`); original.set(path, text);
  }
  return { root, name, owners: name === 'reference' ? 15 : Number(name.slice(1)),
    async edit(kind, index) {
      if (kind === 'unchanged') return [];
      const [path, before, after] = definitions[kind], text = original.get(path);
      const expected = index % 2 ? text.replace(before, after) : text;
      assert.equal(await readFile(join(root, path), 'utf8'), expected, 'Refuse a drifted edit fixture');
      const next = index % 2 ? text : text.replace(before, after);
      await writeFile(join(root, path), next);
      return [{ path, sha256: createHash('sha256').update(next).digest('hex') }];
    },
  };
}
export class Resident {
  constructor(endpoint, executable) {
    this.endpoint = endpoint; this.executable = executable;
    this.observer = observeResidentProcesses(); this.clients = [];
    this.environment = { RAMIFY_ENDPOINT_DIR: endpoint, RAMIFY_DAEMON_ENTRY: daemonEntry };
    controls.add(this);
  }
  async connect(start = 'if-needed') {
    await mkdir(this.endpoint, { recursive: true, mode: 0o700 });
    const connected = await connectDaemon({ client: { name: 'ramify-measurement', version: manifest.version }, engine,
      start, daemonEntry, endpointDirectory: this.endpoint });
    assert.equal(connected.status, 'connected', JSON.stringify(connected));
    const connection = connected.connection;
    this.clients.push(connection); this.connection ??= connection;
    this.pid = connection.daemon.instance.pid; this.instance = connection.daemon.instance;
    this.observer.add(this.pid);
    return connection;
  }
  async open(project) {
    const opened = unwrap(await this.connection.openContext({ project: { cwd: project.root, root: project.root, scope: 'whole-project', configuration: 'discover' },
      setup: { registry: 'default', capabilities } }));
    assert.equal(opened.status, 'opened', JSON.stringify(opened));
    return opened.token;
  }
  async check(project, token, expect = []) {
    const started = performance.now();
    const outcome = unwrap(await this.connection.check({ token, requestId: randomUUID(), freshness: { mode: 'synchronized', expect } }));
    const durationMs = performance.now() - started;
    assert.equal(outcome.status, 'reported', JSON.stringify(outcome)); assert.equal(outcome.published, true);
    assert.equal(outcome.report.outcome.execution, 'completed'); assert.equal(outcome.report.summary.owners, project.owners);
    assert.equal(outcome.freshness.mode, 'synchronized'); assert.equal(outcome.freshness.verified, true);
    assert.ok(outcome.freshness.captureStarted >= outcome.freshness.acknowledged);
    assert.equal(outcome.revision.fingerprints.inputId, outcome.report.inputId);
    if (expect.length && this.lastInput) assert.notEqual(outcome.report.inputId, this.lastInput, 'Edited input must produce a fresh captured revision');
    this.lastInput = outcome.report.inputId;
    return { durationMs, revision: outcome.revision, freshness: outcome.freshness,
      expected: expect, captured: capturedExpected(outcome.report, expect),
      report: { summary: outcome.report.summary, outcome: outcome.report.outcome, inputId: outcome.report.inputId,
        bytes: Buffer.byteLength(JSON.stringify(outcome.report)) } };
  }
  async cli(project, args = ['check', '--root', project.root, '--format', 'json']) {
    const mark = this.observer.mark();
    const result = await command(this.executable, args, { cwd: project.root, env: this.environment, observer: this.observer });
    const processes = this.observer.since(mark);
    return { ...result, processes,
      peakCliRssBytes: Math.max(0, ...processes.flatMap(sample => sample.processes.filter(p => p.pid === result.pid).map(p => p.rssBytes))) };
  }
  async metrics() {
    const deadline = performance.now() + 5000;
    for (;;) {
      try { return JSON.parse(await readFile(join(this.endpoint, 'measurement.json'), 'utf8')); }
      catch (error) { if (performance.now() >= deadline) throw error; await delay(20); }
    }
  }
  async settled() {
    const deadline = performance.now() + 120_000;
    const idle = status => status.contexts.every(context => !context.pending.analysisRunning
      && context.pending.requests === 0 && context.pending.changedPaths === 0);
    for (;;) {
      assert.ok(performance.now() < deadline, 'Resident did not become idle within the finite 120s guard');
      const before = unwrap(await this.connection.daemonStatus());
      if (!idle(before)) { await delay(20); continue; }
      const previous = (await this.metrics()).generation;
      process.kill(this.pid, 'SIGUSR2');
      const snapshotDeadline = performance.now() + 5000;
      let instrumentation;
      do { await delay(20); instrumentation = await this.metrics(); assert.ok(performance.now() < snapshotDeadline, 'Instrumented settling exceeded 5s'); }
      while (instrumentation.generation <= previous);
      const status = unwrap(await this.connection.daemonStatus());
      // A watcher may start a second analysis after the command returns. Sample
      // its eventual idle state, while keeping all real lifetime counters intact.
      if (!idle(status) || before.counters.analyses !== status.counters.analyses) continue;
      const resident = { pid: this.pid, memory: status.memory, contexts: status.contexts, counters: status.counters,
        connections: status.connections, subscriptions: status.subscriptions, instrumentation };
      assert.equal(instrumentation.pid, this.pid); this.observer.mark();
      return resident;
    }
  }
  async statusTimings(project, token, count = 20) {
    const service = [], ipc = [], cli = [];
    for (let index = 0; index < count; index++) {
      const start = performance.now(); unwrap(await this.connection.contextStatus({ token })); ipc.push(performance.now() - start);
      const result = await this.cli(project, ['daemon', 'status', '--format', 'json']);
      assert.equal(result.code, 0); assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.stdout).running, true); cli.push(result.durationMs);
    }
    const metrics = await this.metrics();
    service.push(...metrics.services.filter(value => value.operation === 'contextStatus').slice(-count).map(value => value.durationMs));
    assert.equal(service.length, count, 'Actual service-side timing observations required');
    return { service, ipc, cli, medianServiceMs: median(service), medianIpcMs: median(ipc), medianCliMs: median(cli) };
  }
  async close() {
    this.closing ??= this.dispose();
    return this.closing;
  }
  async dispose() {
    let failure;
    try {
      if (this.connection?.state === 'connected') unwrap(await this.connection.stopDaemon({ instanceId: this.instance.instanceId }));
    } catch (error) { failure = error; }
    finally {
      await Promise.allSettled(this.clients.map(connection => connection.close()));
      const deadline = performance.now() + 7500;
      while (this.pid && alive(this.pid) && performance.now() < deadline) await delay(25);
      if (this.pid && alive(this.pid)) {
        try { process.kill(-this.pid, 'SIGKILL'); } catch {}
        failure ??= new Error(`Measured daemon ${this.pid} survived explicit stop`);
      }
      this.observer.stop();
      const live = this.observer.live();
      if (live.length) {
        for (const row of live) { try { process.kill(-row.pgid, 'SIGKILL'); } catch {} }
        failure ??= new Error(`Measured workload left ${live.length} observed processes`);
      }
      controls.delete(this);
    }
    if (failure) throw failure;
  }
}
export function sampleMetrics(value) {
  const { instrumentation, ...status } = value;
  return { ...status, instrumentation: { ...instrumentation, services: undefined, outbound: undefined, increments: instrumentation.increments } };
}
