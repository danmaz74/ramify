import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import childProcesses from 'node:child_process';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { budgets, checkedReport, plainReport, sessionInputs } from './common.mjs';

const [root, countText] = process.argv.slice(2);
assert.ok(root && countText && global.gc, 'Worker requires root, owner count and --expose-gc');
const owners = Number(countText);
const originalOpen = fs.open, originalSpawn = childProcesses.spawn;
const handles = new Set(), children = new Set(), timers = new Set(), helperGroups = new Set();
const totals = { filesOpened: 0, filesClosed: 0, helpersStarted: 0, helpersClosed: 0 };
const weakSessions = [], reports = [], samples = [];
let activeSessions = 0, retainedBytes = 0, inspectObjects = 0;
const hook = createHook({
  init(id, type) { if (type === 'Timeout') timers.add(id); },
  destroy(id) { timers.delete(id); },
});

// Observe the real OS boundaries in this dedicated measurement process. No fake
// compiler, acquisition view or alternate checker is involved.
fs.open = async (...args) => {
  const handle = await Reflect.apply(originalOpen, fs, args);
  handles.add(handle); totals.filesOpened++;
  const close = handle.close.bind(handle);
  handle.close = async () => {
    try { await close(); }
    finally { if (handles.delete(handle)) totals.filesClosed++; }
  };
  return handle;
};
childProcesses.spawn = (...args) => {
  const child = Reflect.apply(originalSpawn, childProcesses, args);
  if (child.pid) helperGroups.add(child.pid);
  children.add(child); totals.helpersStarted++;
  child.once('close', () => { if (children.delete(child)) totals.helpersClosed++; });
  return child;
};
syncBuiltinESMExports();
hook.enable();

function descendants() {
  const listing = childProcesses.spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 5000 });
  assert.equal(listing.status, 0, listing.stderr);
  const rows = listing.stdout.trim().split('\n').filter(Boolean).map(line => line.trim().split(/\s+/).map(Number));
  const found = new Set([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid, pgid] of rows) if ((found.has(ppid) || helperGroups.has(pgid)) && !found.has(pid) && pid !== listing.pid) {
      found.add(pid); changed = true;
    }
  }
  found.delete(process.pid);
  return [...found];
}

async function settle() {
  await yieldTurn(); global.gc(); await yieldTurn(); global.gc(); await yieldTurn();
}
async function cycle(retain) {
  const { createAnalysisSession } = await import('ramify.ts/analysis');
  const session = createAnalysisSession(await sessionInputs(root));
  weakSessions.push(new WeakRef(session)); activeSessions++;
  const start = performance.now();
  let disposalMs = null;
  try {
    const report = checkedReport(await session.analyze(), owners);
    const plain = plainReport(report); inspectObjects += plain.objects;
    if (retain) { reports.push(report); retainedBytes += plain.bytes; }
  } finally {
    const started = performance.now();
    await session.dispose(); disposalMs = performance.now() - started;
    activeSessions--;
  }
  return { durationMs: performance.now() - start, disposalMs };
}

let failure;
try {
  for (let index = 0; index < budgets.warmups + budgets.cycles; index++) {
    const duration = await cycle(index >= budgets.warmups);
    await settle();
    const osChildren = descendants();
    const lifecycle = { activeSessions, liveWeakSessions: weakSessions.filter(reference => reference.deref()).length,
      fileHandles: handles.size, helperProcesses: children.size, descendantProcesses: osChildren.length,
      analysisTimers: timers.size, ...totals };
    const sample = { cycle: index + 1, warmup: index < budgets.warmups, ...duration,
      memory: process.memoryUsage(), retainedReports: reports.length, retainedBytes, lifecycle };
    samples.push(sample);
    if (index === 0 || (index + 1) % 5 === 0) process.stderr.write(`Cycle ${index + 1}/${budgets.warmups + budgets.cycles}: ${reports.length} reports retained, RSS ${(sample.memory.rss / 1024 ** 2).toFixed(1)} MiB, heap ${(sample.memory.heapUsed / 1024 ** 2).toFixed(1)} MiB, lifecycle ${JSON.stringify(lifecycle)}\n`);
    assert.deepEqual([activeSessions, lifecycle.liveWeakSessions, handles.size, children.size, osChildren.length, timers.size], [0, 0, 0, 0, 0, 0]);
    assert.equal(totals.filesOpened, totals.filesClosed);
    assert.equal(totals.helpersStarted, totals.helpersClosed);
    assert.ok(duration.disposalMs <= budgets.disposalMs);
  }
  assert.equal(reports.length, budgets.cycles);
  assert.equal(new Set(reports.map(report => report.runId)).size, budgets.cycles);
  assert.equal(new Set(reports.map(report => report.inputId)).size, 1);
  assert.equal(retainedBytes, reports.reduce((sum, report) => sum + plainReport(report).bytes, 0));
} catch (error) { failure = error.stack ?? error.message; }
finally {
  hook.disable(); fs.open = originalOpen; childProcesses.spawn = originalSpawn; syncBuiltinESMExports();
}
const lastTwenty = samples.filter(sample => !sample.warmup).slice(-budgets.settledCycles);
const first = lastTwenty[0], last = lastTwenty.at(-1);
const adjustedHeap = sample => sample.memory.heapUsed - sample.retainedBytes;
const allIncreasing = select => lastTwenty.length === budgets.settledCycles && lastTwenty.slice(1).every((sample, index) => select(sample) > select(lastTwenty[index]));
const settled = first && last ? {
  sampleCount: lastTwenty.length,
  heapGrowthBeyondReportBytes: adjustedHeap(last) - adjustedHeap(first),
  rssGrowthBytes: last.memory.rss - first.memory.rss,
  monotonicallyIncreasingAdjustedHeap: allIncreasing(adjustedHeap),
  monotonicallyIncreasingRss: allIncreasing(sample => sample.memory.rss),
} : null;
const assertions = {
  allCyclesAndLifecycle: !failure && samples.length === budgets.warmups + budgets.cycles,
  heapObservations: settled !== null && settled.sampleCount === budgets.settledCycles && Number.isFinite(settled.heapGrowthBeyondReportBytes),
  rssObservations: settled !== null && settled.sampleCount === budgets.settledCycles && Number.isFinite(settled.rssGrowthBytes),
};
const targets = {
  heapBudget: settled !== null && settled.sampleCount === budgets.settledCycles && settled.heapGrowthBeyondReportBytes <= budgets.heapGrowthBeyondReportBytes,
  rssBudget: settled !== null && settled.sampleCount === budgets.settledCycles && settled.rssGrowthBytes <= budgets.rssGrowthBytes,
};
writeFileSync(3, JSON.stringify({ passed: Object.values(assertions).every(Boolean), assertions, targets,
  performancePolicy: 'advisory-by-user-request-2026-09-11',
  ...(failure ? { failure } : {}), budgets, samples, settled, inspectedPlainObjects: inspectObjects,
  retainedReportBytes: retainedBytes, retainedReportCount: reports.length,
  reportSummary: reports[0]?.summary ?? null, inputId: reports[0]?.inputId ?? null,
  scope: reports[0]?.scope ?? null, request: reports[0]?.request ?? null,
  capabilities: reports[0]?.capabilities ?? [], stages: reports[0]?.stages ?? [],
  investigationRequired: settled !== null && (settled.monotonicallyIncreasingAdjustedHeap || settled.monotonicallyIncreasingRss),
  reportRunIds: reports.map(report => report.runId),
  note: 'GC is diagnostic. Heap subtracts serialized retained-report bytes; RSS includes the retained plain reports. Timers, open handles and helper spawns are observed at real OS boundaries; disposed session reachability is checked with WeakRef. Native descendants are checked with POSIX ps.' }));
if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
