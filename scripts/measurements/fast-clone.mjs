import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const cycles = 20;
const timeoutMs = 120_000;
const reportBytes = 96 * 1024 ** 2;
const hash = value => createHash('sha256').update(value).digest('hex');
const workerEntry = new URL(`data:text/javascript,${encodeURIComponent(`
  import { parentPort } from 'node:worker_threads';
  parentPort.on('message', message => parentPort.postMessage(message));
  parentPort.postMessage({ kind: 'ready' });
`)}`);

/** Measure the actual revision arrays supplied by the production worker.
 * The caller owns their provenance. Tests may pass a fixture, but that does
 * not make fixture timings acceptance evidence. */
export async function measuredRevisionArrays(arrays) {
  assert.equal(typeof arrays?.inputId, 'string', 'Production input identity required');
  assert.ok(arrays.inputId.length > 0 && Number.isSafeInteger(arrays.sequence) && arrays.sequence > 0,
    'Production revision sequence and identity required');
  for (const name of ['inputs', 'diagnostics']) assert.ok(Array.isArray(arrays[name]), `Actual ${name} array required`);
  const report = { schemaVersion: 'ramify.revision-array-clone/1', status: 'running', passed: false,
    inputId: arrays.inputId, sequence: arrays.sequence, startedAt: new Date().toISOString(),
    source: 'Caller-supplied production SessionRevision arrays; no generated arrays or JSON reconstruction.',
    timing: 'Main thread postMessage through worker echo to main-thread message event; both structured clones, dispatch and scheduling included. JSON sizing and integrity checks excluded.',
    cycles, timeoutMs, probeWorkerHeapMiB: 512,
    capacity: { reportBytes, maxDiagnostics: 100_000, acquisitionMaxFiles: 50_000,
      note: 'src/report-capacity.ts and src/resident-assembly.ts limits. Input observations include roles and directories; acquisition maxFiles is contextual, not an asserted array-length limit.' },
    arrays: {}, cleanup: { threadId: null, exited: false, exitCode: null, terminationRequested: false }, failures: [] };
  let worker, pending, timer, workerFailure, deadline;
  function exchange(send) {
    assert.ok(!pending, 'Clone probe permits one pending roundtrip');
    if (workerFailure) return Promise.reject(workerFailure);
    return new Promise((resolve, reject) => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { reject(new Error('Clone probe exceeded its finite 120s guard')); return; }
      pending = { resolve, reject };
      timer = setTimeout(() => { pending = null; reject(new Error('Clone probe exceeded its finite 120s guard')); }, remaining);
      try { send(); } catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }
  try {
    // Preserve the measured sizes even if an existing production capacity is
    // exceeded. Sizing and source hashing are outside every timed sample.
    for (const name of ['inputs', 'diagnostics']) {
      const encoded = JSON.stringify(arrays[name]);
      const bytes = Buffer.byteLength(encoded);
      report.arrays[name] = { count: arrays[name].length, jsonBytes: bytes, sha256: hash(encoded),
        withinReportCapacity: bytes <= reportBytes, samples: [], medianMs: null, maxMs: null };
    }
    for (const name of ['inputs', 'diagnostics']) assert.ok(report.arrays[name].withinReportCapacity,
      `${name} alone exceeds the existing 96 MiB report capacity`);
    assert.ok(arrays.diagnostics.length <= report.capacity.maxDiagnostics, 'Diagnostics exceed production maxDiagnostics');
    deadline = performance.now() + timeoutMs;
    worker = new Worker(workerEntry, { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 8 } });
    report.cleanup.threadId = worker.threadId;
    worker.on('message', value => {
      const receivedAt = Date.now(), stopped = performance.now();
      const request = pending; pending = null; clearTimeout(timer);
      if (request) request.resolve({ value, receivedAt, stopped });
      else workerFailure ??= new Error('Clone worker sent an unsolicited reply');
    });
    worker.on('error', error => {
      workerFailure = error; const request = pending; pending = null; clearTimeout(timer); request?.reject(error);
    });
    worker.once('exit', code => {
      report.cleanup.exited = true; report.cleanup.exitCode = code;
      if (pending) {
        const request = pending; pending = null; clearTimeout(timer);
        request.reject(new Error(`Clone worker exited before its reply (${code})`));
      }
    });
    assert.equal((await exchange(() => {})).value.kind, 'ready', 'Real auxiliary worker startup required');
    for (const name of ['inputs', 'diagnostics']) {
      const measured = report.arrays[name];
      for (let cycle = 1; cycle <= cycles; cycle++) {
        const sentAt = Date.now();
        let start;
        const echoed = await exchange(() => {
          start = performance.now();
          worker.postMessage({ kind: 'echo', name, cycle, value: arrays[name] });
        });
        const roundTripMs = echoed.stopped - start;
        assert.equal(echoed.value.kind, 'echo'); assert.equal(echoed.value.name, name); assert.equal(echoed.value.cycle, cycle);
        const echoSha256 = hash(JSON.stringify(echoed.value.value));
        assert.equal(echoSha256, measured.sha256, 'Structured clone must preserve the complete actual array');
        assert.ok(Number.isFinite(roundTripMs) && roundTripMs >= 0, 'Finite actual clone timing required');
        measured.samples.push({ cycle, sentAt, receivedAt: echoed.receivedAt, roundTripMs,
          echoCount: echoed.value.value.length, echoSha256 });
      }
      const sorted = measured.samples.map(sample => sample.roundTripMs).sort((a, b) => a - b);
      measured.medianMs = (sorted[9] + sorted[10]) / 2; measured.maxMs = sorted.at(-1);
    }
    report.status = 'measured';
  } catch (error) { report.status = 'failed'; report.failures.push(error.stack ?? String(error)); }
  finally {
    clearTimeout(timer);
    if (worker) {
      report.cleanup.terminationRequested = true;
      try { await worker.terminate(); }
      catch (error) { report.failures.push(`Auxiliary worker cleanup failed: ${String(error)}`); }
    }
    report.completedAt = new Date().toISOString();
    report.passed = report.status === 'measured' && !report.failures.length && report.cleanup.exited
      && Object.values(report.arrays).every(value => value.samples.length === cycles && Number.isFinite(value.maxMs));
    if (!report.passed) report.status = 'failed';
  }
  return report;
}
