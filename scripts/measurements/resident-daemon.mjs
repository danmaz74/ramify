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
  helpersStarted: 0, helpersClosed: 0, sessionsCreated: 0, sessionsDisposed: 0 };
let ownOperation = false, activeSessions = 0, generation = 0;
const outbound = new Map(), services = [], increments = [];
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
const incrementChannel = channel('ramify.analysis.increment');
let incrementSequence = 0;
const increment = value => { if (increments.length >= 8) increments.shift(); increments.push({ ...value, sequence: ++incrementSequence }); };
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
sessionChannel.subscribe(session); incrementChannel.subscribe(increment); serviceChannel.subscribe(service); outboundChannel.subscribe(write);
function snapshot() {
  ownOperation = true;
  try {
    filesystem.writeFileSync(metricsPath, JSON.stringify({ schemaVersion: 'ramify.measurement-counters/1', pid: process.pid,
      at: Date.now(), generation, memory: process.memoryUsage(), activeSessions, files: files.size,
      watchers: watchers.size, helpers: helpers.size, timers: timers.size, totals,
      outboundMaximum, outbound: [...outbound.values()], services, increments, incrementSequence }));
  } finally { ownOperation = false; }
}
let settling = false;
async function settle() {
  if (settling) return;
  settling = true;
  try { await yieldTurn(); collect(); await yieldTurn(); collect(); await yieldTurn(); generation++; snapshot(); }
  finally { settling = false; }
}
process.on('SIGUSR2', settle);
ownOperation = true;
const recording = setInterval(snapshot, 50); recording.unref();
ownOperation = false;
snapshot();
try { await import('../../dist/src/daemon-entry.js'); }
finally {
  clearInterval(recording); process.off('SIGUSR2', settle); await yieldTurn(); snapshot();
  hook.disable(); sessionChannel.unsubscribe(session); incrementChannel.unsubscribe(increment); serviceChannel.unsubscribe(service); outboundChannel.unsubscribe(write);
  fs.open = originalOpen; filesystem.watch = originalWatch; childProcesses.spawn = originalSpawn; syncBuiltinESMExports();
}
