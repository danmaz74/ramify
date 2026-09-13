import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import childProcesses from 'node:child_process';
import filesystem from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

// This entry delegates to the actual compiled daemon after observing OS
// boundaries. It changes no analysis, service, transport or budget operation.
const endpoint = process.argv[process.argv.indexOf('--endpoint-dir') + 1];
assert.ok(endpoint, 'Instrumented daemon requires its owned endpoint');
const metricsPath = join(endpoint, 'measurement.json');
setFlagsFromString('--expose_gc');
const collect = runInNewContext('gc');
const originalOpen = fs.open, originalWatch = filesystem.watch, originalSpawn = childProcesses.spawn;
const files = new Set(), watchers = new Set(), helpers = new Set(), timers = new Set();
const totals = { filesOpened: 0, filesClosed: 0, watchersOpened: 0, watchersClosed: 0,
  helpersStarted: 0, helpersClosed: 0, sessionsCreated: 0, sessionsDisposed: 0,
  workersCreated: 0, workersExited: 0, compilersStarted: 0, compilersExited: 0 };
let ownOperation = false, activeSessions = 0, generation = 0;
const outbound = new Map(), services = [], workers = new Map(), compilerPids = new Set(), workerMessages = [];
// References to the latest production arrays never enter the 50 ms JSON stream.
const cloneArrays = new Map();
let cloneTask = null, activeProbeCount = 0;
let workerSequence = 0;
let outboundMaximum = 0;
const hook = createHook({ init(id, type) { if (type === 'Timeout' && !ownOperation) timers.add(id); }, destroy(id) { timers.delete(id); } });
fs.open = async (...args) => {
  const file = await Reflect.apply(originalOpen, fs, args);
  files.add(file); totals.filesOpened++;
  const close = file.close.bind(file);
  file.close = async () => { await close(); if (files.delete(file)) totals.filesClosed++; };
  return file;
};
filesystem.watch = (...args) => {
  const watcher = Reflect.apply(originalWatch, filesystem, args);
  watchers.add(watcher); totals.watchersOpened++;
  watcher.once('close', () => { if (watchers.delete(watcher)) totals.watchersClosed++; });
  return watcher;
};
childProcesses.spawn = (...args) => {
  const helper = Reflect.apply(originalSpawn, childProcesses, args);
  helpers.add(helper); totals.helpersStarted++;
  helper.once('close', () => { if (helpers.delete(helper)) totals.helpersClosed++; });
  return helper;
};
syncBuiltinESMExports(); hook.enable();
const sessionChannel = channel('ramify.analysis.session');
const session = value => {
  if (value.event === 'created') { activeSessions++; totals.sessionsCreated++; }
  else if (value.event === 'disposed') { activeSessions--; totals.sessionsDisposed++; }
};
// Observe the production supervisor's real thread and worker protocol. A
// diagnostics subscription in this process cannot see events inside a worker.
const workerChannel = channel('ramify:session-worker');
const observeWorker = ({ worker }) => {
  const id = ++totals.workersCreated;
  const observed = { id, pid: worker.pid, threadId: worker.threadId, startedAt: Date.now(), ready: null,
    statusAt: null, status: null, pendingRequests: 0 };
  const pending = new Map(), children = new Set();
  let opened = false;
  workers.set(id, observed);
  const send = worker.postMessage.bind(worker);
  worker.postMessage = (message, ...rest) => {
    if (message.operation !== 'cancel') pending.set(message.id, { operation: message.operation, sentAt: Date.now(), start: performance.now() });
    observed.pendingRequests = pending.size;
    return send(message, ...rest);
  };
  worker.on('thread-created', threadId => { observed.threadId = threadId; });
  worker.on('message', message => {
    if (message.kind === 'ready') {
      observed.ready = { heapLimit: message.heapLimit, oldGenerationMiB: message.oldGenerationMiB, at: Date.now() };
      return;
    }
    if (message.kind === 'child') {
      if (message.active && !children.has(message.pid)) {
        children.add(message.pid); compilerPids.add(message.pid); totals.compilersStarted++;
      } else if (!message.active && children.delete(message.pid)) {
        compilerPids.delete(message.pid); totals.compilersExited++;
      }
      return;
    }
    if (message.kind !== 'reply' && message.kind !== 'error') return;
    const request = pending.get(message.id); pending.delete(message.id);
    observed.pendingRequests = pending.size;
    const receivedAt = Date.now();
    if (message.status) { observed.status = message.status; observed.statusAt = receivedAt; }
    if (!opened && message.result?.status === 'opened') { opened = true; activeSessions++; totals.sessionsCreated++; }
    const value = message.result?.revision;
    if (value) {
      cloneArrays.set(id, { inputId: value.inputId, sequence: value.sequence, inputs: value.inputs, diagnostics: value.diagnostics });
      observed.cloneDataset = { inputId: value.inputId, sequence: value.sequence,
        inputsCount: value.inputs.length, diagnosticsCount: value.diagnostics.length };
    }
    // Never serialize a whole report or input list in the measurement stream.
    const revision = value ? { sequence: value.sequence, inputId: value.inputId,
      checked: { path: value.checked.path, fileCount: value.checked.files.length,
        accesses: value.checked.accesses, modelRebuilt: value.checked.modelRebuilt },
      timings: value.timings, outcome: value.outcome, changedCount: value.changed.length, summary: value.summary } : null;
    const trace = { sequence: ++workerSequence, workerId: id, workerPid: worker.pid, requestId: message.id,
      operation: request?.operation ?? null, sentAt: request?.sentAt ?? null, receivedAt,
      roundTripMs: request ? performance.now() - request.start : null,
      kind: message.kind, resultStatus: message.result?.status ?? null,
      inputId: value?.inputId ?? message.result?.inputId ?? null,
      execution: value?.outcome?.execution ?? message.result?.outcome?.execution ?? null,
      revision, status: message.status };
    if (workerMessages.length >= 64) workerMessages.shift();
    workerMessages.push(trace);
  });
  worker.once('exit', () => {
    workers.delete(id); cloneArrays.delete(id); totals.workersExited++;
    if (opened) { activeSessions--; totals.sessionsDisposed++; }
    // Child notifications record compiler lifetime. Any PID still present at
    // worker exit remains visible until cleanup is confirmed by the OS sampler.
  });
};
const serviceChannel = channel('ramify.daemon.service');
const service = value => { if (services.length >= 128) services.shift(); services.push(value); };
const outboundChannel = channel('ramify.daemon.outbound');
const write = value => {
  outboundMaximum = Math.max(outboundMaximum, value.bytes);
  const old = outbound.get(value.connectionId) ?? { connectionId: value.connectionId, peakBytes: 0, overflow: null, closed: null };
  old.peakBytes = Math.max(old.peakBytes, value.bytes);
  if (value.event === 'overflow') old.overflow = value;
  if (value.event === 'closed') old.closed = value;
  outbound.set(value.connectionId, old);
  // Retain live connections and only the latest completed observations. The
  // workload reads counters each cycle; measurement itself cannot grow forever.
  if (outbound.size > 128) {
    const disposable = [...outbound].find(([, item]) => item.closed && !item.overflow);
    if (disposable) outbound.delete(disposable[0]);
  }
};
sessionChannel.subscribe(session); workerChannel.subscribe(observeWorker); serviceChannel.subscribe(service); outboundChannel.subscribe(write);
function snapshot() {
  ownOperation = true;
  try {
    filesystem.writeFileSync(metricsPath, JSON.stringify({ schemaVersion: 'ramify.measurement-counters/1', pid: process.pid,
      at: Date.now(), generation, memory: process.memoryUsage(), activeSessions, files: files.size,
      watchers: watchers.size, helpers: helpers.size, timers: timers.size, totals,
      outboundMaximum, outbound: [...outbound.values()], services, workers: [...workers.values()], workerCount: workers.size,
      compilerPids: [...compilerPids], compilerCount: compilerPids.size, workerMessages, workerSequence,
      activeProbeCount,
      workerSampling: 'Worker heap and status are real reply checkpoints; 50 ms snapshots retain their latest statusAt. Round-trip timings include worker execution, serialization and transport.' }));
  } finally { ownOperation = false; }
}
async function requestedClone() {
  const requestPath = join(endpoint, 'clone-request.json');
  let source;
  try { source = await fs.readFile(requestPath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  let request, result;
  activeProbeCount++;
  snapshot();
  try {
    request = JSON.parse(source);
    assert.equal(typeof request.requestId, 'string', 'Clone request identity required');
    assert.ok(request.requestId.length > 0 && Number.isSafeInteger(request.workerId), 'Clone request worker identity required');
    const arrays = cloneArrays.get(request.workerId);
    assert.ok(arrays, 'Requested analysis worker has no live production revision arrays');
    assert.equal(arrays.inputId, request.inputId, 'Clone request input identity is superseded');
    assert.equal(arrays.sequence, request.sequence, 'Clone request revision sequence is superseded');
    const { measuredRevisionArrays } = await import('./fast-clone.mjs');
    result = { requestId: request.requestId, workerId: request.workerId, ...(await measuredRevisionArrays(arrays)) };
  } catch (error) {
    result = { schemaVersion: 'ramify.revision-array-clone/1', requestId: request?.requestId ?? null,
      workerId: request?.workerId ?? null, inputId: request?.inputId ?? null, sequence: request?.sequence ?? null,
      status: 'failed', passed: false, completedAt: new Date().toISOString(), failures: [error.stack ?? String(error)] };
  } finally { activeProbeCount--; snapshot(); }
  const temporary = join(endpoint, 'clone-result.json.tmp');
  await fs.writeFile(temporary, JSON.stringify(result) + '\n');
  await fs.unlink(requestPath);
  await fs.rename(temporary, join(endpoint, 'clone-result.json'));
}
let settling = false;
async function settle() {
  if (settling) return;
  settling = true;
  try { await yieldTurn(); collect(); await yieldTurn(); collect(); await yieldTurn(); generation++; snapshot(); }
  finally {
    settling = false;
    // The explicit probe has its own completion file; normal settled requests
    // need not wait for forty structured-clone round trips.
    if (!cloneTask) cloneTask = requestedClone().catch(error => {
      process.stderr.write(`Revision-array clone probe failed: ${String(error)}\n`);
    }).finally(() => { cloneTask = null; });
  }
}
process.on('SIGUSR2', settle);
ownOperation = true;
const recording = setInterval(snapshot, 50); recording.unref();
ownOperation = false;
snapshot();
try { await import('../../dist/src/daemon-entry.js'); }
finally {
  clearInterval(recording); process.off('SIGUSR2', settle); await cloneTask; cloneArrays.clear(); await yieldTurn(); snapshot();
  hook.disable(); sessionChannel.unsubscribe(session); workerChannel.unsubscribe(observeWorker); serviceChannel.unsubscribe(service); outboundChannel.unsubscribe(write);
  fs.open = originalOpen; filesystem.watch = originalWatch; childProcesses.spawn = originalSpawn; syncBuiltinESMExports();
}
