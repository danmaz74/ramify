import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { archiveMeasurement } from './archive.mjs';
import { sha256 } from './common.mjs';
import { assertFastWorkload, deriveFastMeasurements, fastDeferrals, publishedHookAttributed, racingHookAttributed } from './fast-assertions.mjs';
import { fastBudgets, fastFixtures, fastWorkloads } from './fast-plan.mjs';
import { findFastEvidence, readFastEvidence, verifyFastEvidence } from './verify-fast-evidence.mjs';

// These invented observations are positive/negative controls for the archive
// verifier only. They are never recorded as I5 measurement evidence.
const id = 'I5-13:entry-footprints';
const inputs = { build: { files: 1, sha256: 'test-control-only' } };
const dependencies = { typescript: 'test-control-only' };
const start = '2026-09-12T00:00:00.000Z';
const end = '2026-09-12T00:00:01.000Z';
const samples = [{ elapsedMs: 0, combinedRssBytes: 1024,
  processes: [{ pid: 42, ppid: 1, pgid: 42, rssBytes: 1024 }] }];

function footprints() {
  return Object.fromEntries(['help', 'client', 'daemonEmpty', 'daemonReference', 'cliReference', 'cliS100']
    .map(name => [name, { rssBytes: 1024, pid: 42, samples: structuredClone(samples),
      settled: { pid: 42, memory: { rss: 1024, heapUsed: 512, external: 128 }, instrumentation: { pid: 42 } } }]));
}

function report() {
  const measurements = footprints();
  const assertions = assertFastWorkload(id, measurements);
  assert.ok(assertions.length > 0 && assertions.every(value => value.passed), 'Positive archive control must satisfy actual workload predicates');
  const value = { schemaVersion: 'ramify.fast-measurements/1', evidenceKind: 'measurement',
    inputs: structuredClone(inputs), dependencies: structuredClone(dependencies),
    environment: { node: process.version, platform: platform(), arch: arch() },
    budgets: structuredClone(fastBudgets), sampling: { intervalMs: 50 },
    measuredAt: start, completedAt: end, interrupted: false, failures: [],
    passed: false, status: 'incomplete',
    workloads: fastWorkloads.map(row => row.id === id ? { ...row, status: 'measured', passed: true,
      startedAt: start, completedAt: end, interrupted: false, failures: [], assertions, measurements,
      controllerObservation: { failure: null, signal: null, code: 0, postExitObservedProcesses: 0,
        processes: [{ pid: 42, peakRssBytes: 1024 }], samples: structuredClone(samples) } }
      : { ...row, status: 'not-executed', passed: false, measurements: null }) };
  value.deferrals = fastDeferrals(value.workloads);
  return value;
}

const verify = value => verifyFastEvidence(value, id, inputs, dependencies);

function cycle(index, kind = 'body') {
  const sequence = index + 2, path = kind === 'body' ? 'src/body.ts' : 'src/api.ts';
  const expected = [{ path, sha256: (index % 2 ? 'a' : 'b').repeat(64) }];
  const timings = { classify: 0, inventory: 0, compiler: 1, descriptions: 1,
    accesses: 1, link: 0, decide: 0, publish: 0, total: 3 };
  const revision = { revision: `rev/${sequence}`, sequence, publishedAt: index * 1000 + 2,
    fingerprints: { inputId: `input/${index % 2}` }, summary: { denied: 0 },
    outcome: { execution: 'completed', coverage: 'complete' }, timings,
    checked: { path: kind === 'body' ? 'unchanged-surface' : 'source', accesses: kind === 'body' ? 0 : 1,
      files: kind === 'body' ? [path] : [path, 'src/importer.ts'], modelRebuilt: false } };
  return { kind, index, expected, beforeSequence: sequence - 1, revision,
    hookStartedAt: index * 1000 + 1, countersBeforeSave: { coveredRequests: 0 },
    hook: { failure: null, signal: null, stderr: '', code: 0, durationMs: 1,
      document: { schemaVersion: 'ramify.check/1', outcome: 'checked', execution: 'completed', exitCode: 0,
        revision: { id: revision.revision, sequence }, changed: expected.map(item => ({ ...item, covered: true })),
        findings: [], coverage: [], timings: { daemon: timings } } },
  };
}

function fixture(name) {
  const body = name === 'reference' ? 'src/assembly.ts' : 'src/impl0.ts';
  return { name, body, created: 'src/fast-measurement-created.ts',
    creationWitness: { path: body, specifier: './fast-measurement-created.js' } };
}

function editData(name, kind, duration = 1) {
  const definition = fixture(name);
  const path = kind === 'body' ? definition.body : kind === 'created' ? definition.created
    : name === 'reference' ? 'subs/workspace/module.ramify' : 'subs/m001/module.ramify';
  const cycles = Array.from({ length: 20 }, (_, index) => {
    const row = cycle(index, kind);
    row.expected[0].path = path;
    row.hook.document.changed[0].path = path;
    row.revision.checked.path = { body: 'unchanged-surface', description: 'description', created: 'broad' }[kind];
    row.revision.checked.files = [path];
    row.revision.timings.accesses = duration;
    row.revision.timings.total = duration;
    if (kind === 'description' && index % 2 === 0) {
      row.revision.summary.denied = 1;
      row.hook.code = 1; row.hook.document.exitCode = 1;
      row.hook.document.findings = [{ id: 'test-control-only' }];
    }
    return row;
  });
  return { fixtures: [definition], cycles: { [kind]: cycles } };
}

const measured = (name, measurements) => ({ id: `I5-13:hook-latency-${name.toLowerCase()}`, measurements });

function instrumentation(index, disposed = false) {
  const live = disposed ? 0 : 1;
  return { pid: 40, at: (index + 1) * 1000,
    workers: disposed ? [] : [{ pid: 41 }], compilerPids: disposed ? [] : [42],
    workerCount: live, compilerCount: live, activeSessions: live, helpers: live,
    watchers: live, files: 0, timers: disposed ? 0 : 2,
    totals: { filesOpened: 1, filesClosed: 1, watchersOpened: 1, watchersClosed: 1 - live,
      helpersStarted: 1, helpersClosed: 1 - live, sessionsCreated: 1, sessionsDisposed: 1 - live,
      workersCreated: 1, workersExited: 1 - live, compilersStarted: 1, compilersExited: 1 - live } };
}

function plateauProject() {
  const cycles = Array.from({ length: 200 }, (_, index) => {
    const item = cycle(index);
    item.settled = { pid: 40, memory: { rss: 1024, heapUsed: 512 }, counters: { auditMismatches: 0, analyses: index + 1 },
      instrumentation: instrumentation(index), contexts: [{ level: 'hot', retainedBytes: 1024,
        history: { bytes: 32, retained: 8 }, session: { level: 'hot', factBytes: 1024,
          compiler: { pid: 42 }, worker: { heapUsed: 512, rss: 2048 } } }] };
    item.settledProcessSample = { at: (index + 1) * 1000 + 1, combinedRssBytes: 7168,
      processes: [{ pid: 40, rssBytes: 1024 }, { pid: 41, rssBytes: 2048 }, { pid: 42, rssBytes: 4096 }] };
    return item;
  });
  return { cycles, telemetry: cycles.map(item => structuredClone(item.settled)), telemetryErrors: [],
    processSamples: cycles.map(item => structuredClone(item.settledProcessSample)),
    finalInstrumentation: instrumentation(200, true), cleanup: { stopped: true, liveProcesses: [] } };
}

function plateaus() { return { reference: plateauProject(), S100: plateauProject() }; }

function passing(assertions) {
  assert.ok(assertions.length > 0);
  assert.deepEqual(assertions.filter(value => !value.passed).map(value => value.name), []);
}

test('checked-set evidence requires covering advancing revisions for every recorded edit', () => {
  const measurements = Object.fromEntries(fastFixtures.map(name => [name, {
    fixtures: [{ name, body: 'src/body.ts', source: 'src/api.ts', sourceImporters: ['src/importer.ts'] }],
    cycles: { body: Array.from({ length: 20 }, (_, index) => cycle(index)),
      source: Array.from({ length: 20 }, (_, index) => cycle(index + 20, 'source')) },
  }]));
  passing(assertFastWorkload('I5-13:checked-set-bounded', measurements));
  for (const mutate of [
    item => { item.beforeSequence = item.revision.sequence; },
    item => { item.hook.document.changed[0].covered = false; },
    item => { item.hook.document.changed[0].sha256 = 'wrong-content'; },
    item => { item.hook.code = 2; item.hook.document.outcome = 'not-checked'; },
    item => { item.revision.outcome.execution = 'incomplete'; },
  ]) {
    const altered = structuredClone(measurements); mutate(altered.reference.cycles.body[5]);
    const assertions = assertFastWorkload('I5-13:checked-set-bounded', altered);
    assert.equal(assertions.find(value => value.name === 'reference: one file and zero decided accesses').passed, true);
    assert.ok(assertions.some(value => value.name.startsWith('reference: body checked set 6:') && !value.passed));
  }
});

test('racing evidence accepts a hook covered on publication or answered by its own update, and rejects a wrong answer', () => {
  const zero = { invocationCheck: 0, workerStatus: 0, workerRoundTrip: 0, publication: 0, service: 3, clientTransport: 1 };
  const worked = { invocationCheck: 1, workerStatus: 1, workerRoundTrip: 40, publication: 2, service: 45, clientTransport: 1 };
  const counters = (analyses, coveredRequests, sweeps = 0, audits = 0) => ({ analyses, revisions: analyses, coveredRequests, sweeps, audits });
  /** One watcher update published the racing revision; the hook was a covered request on that publication. */
  const coveredCycle = index => {
    const row = cycle(index);
    row.countersBeforeSave = counters(10, 4);
    row.settled = { counters: counters(11, 5) };
    row.hook.document.timings.reply = { ...zero };
    return row;
  };
  const bodies = () => Array.from({ length: 20 }, (_, index) => coveredCycle(index));
  const predicate = data => assertFastWorkload('I5-13:hook-latency-reference', data)
    .find(value => value.name === 'racing hooks are answered from the racing revision');
  assert.equal(predicate({ cycles: { body: bodies() } }).passed, true);
  const accepted = [
    ['a hook that reached check before the watcher batch runs two updates', row => {
      row.settled.counters = counters(12, 4); row.hook.document.timings.reply = { ...worked }; }],
    ['a hook answered by its own identical update', row => {
      row.settled.counters = counters(11, 4); row.hook.document.timings.reply = { ...worked }; }],
    ['a sweep in the settle window is discounted', row => { row.settled.counters = counters(12, 5, 1); }],
    ['a document without reply timings', row => { delete row.hook.document.timings.reply; }],
  ];
  for (const [label, mutate] of accepted) {
    const rows = bodies(); mutate(rows[3]);
    assert.equal(racingHookAttributed(rows[3]), true, label);
    assert.equal(predicate({ cycles: { body: rows } }).passed, true, label);
  }
  const rejected = [
    ['a covered answer from the revision before the save', row => {
      row.revision.sequence = row.beforeSequence; row.hook.document.revision.sequence = row.beforeSequence; }],
    ['a covered answer naming another revision', row => { row.hook.document.revision.id = 'rev/stale'; }],
    ['a covered entry with the wrong content', row => { row.hook.document.changed[0].sha256 = 'wrong-content'; }],
    ['an uncovered changed entry', row => { row.hook.document.changed[0].covered = false; }],
    ['a not-checked reply', row => { row.hook.code = 2; row.hook.document.outcome = 'not-checked'; row.hook.document.exitCode = 2; }],
    ['two covered requests', row => { row.settled.counters.coveredRequests++; }],
    ['a covered reply reporting session work', row => { row.hook.document.timings.reply = { ...worked }; }],
    ['an uncovered reply reporting no session work', row => { row.settled.counters.coveredRequests--; }],
    ['no analysis beyond maintenance', row => { row.settled.counters = counters(11, 5, 1); }],
    ['missing counters', row => { delete row.countersBeforeSave.analyses; }],
  ];
  for (const [label, mutate] of rejected) {
    const rows = bodies(); mutate(rows[3]);
    assert.equal(racingHookAttributed(rows[3]), false, label);
    assert.equal(predicate({ cycles: { body: rows } }).passed, false, label);
  }
});

test('filtered extraction requires twenty covering one-file revisions and cannot use broad timings', () => {
  const predicate = data => assertFastWorkload('I5-13:hook-latency-s1000', data)
    .find(value => value.name === 'one-file filtered extraction cost recorded');
  const deferral = data => fastDeferrals([measured('S1000', data)]).syntacticPrefilter;
  for (const [duration, status] of [[1, 'not-triggered'], [11, 'triggered']]) {
    const data = editData('S1000', 'body', duration);
    assert.equal(predicate(data).passed, true);
    assert.equal(deferral(data).status, status);
    assert.deepEqual(deferral(data).observed, [duration]);
    for (const mutate of [
      value => { for (const row of value.cycles.body) {
        row.revision.checked.path = 'broad'; row.revision.checked.files.push('src/another.ts');
      } },
      value => { value.cycles.body[19].revision.checked.path = 'broad'; },
      value => { value.cycles.body[19].revision.checked.files.push('src/another.ts'); },
      value => { value.cycles.body[19].revision.checked.accesses = 1; },
      value => { value.cycles.body[19].revision.checked.modelRebuilt = true; },
      value => { value.cycles.body[19].revision.checked.files[0] = 'src/wrong.ts'; },
      value => { value.cycles.body[19].hook.document.changed[0].covered = false; },
      value => { value.cycles.body[19].beforeSequence = value.cycles.body[19].revision.sequence; },
      value => { value.cycles.body[19].revision.outcome.coverage = 'partial'; },
      value => { value.cycles.body[19].revision.timings.accesses = null; },
      value => { value.cycles.body.pop(); },
    ]) {
      const altered = structuredClone(data); mutate(altered);
      assert.equal(predicate(altered).passed, false);
      assert.equal(deferral(altered).status, 'not-evaluated');
      assert.deepEqual(deferral(altered).observed, [null]);
    }
  }
});

test('description and created-file deferrals require complete correctly scoped edit sequences', () => {
  const projectData = new Map([
    ['S100', editData('S100', 'created', fastBudgets.S100.created + 1)],
    ['S500', editData('S500', 'description', fastBudgets.S500.description + 1)],
    ['S1000', editData('S1000', 'description', 1)],
  ]);
  const deferrals = projects => fastDeferrals([...projects].map(([name, data]) => measured(name, data)));
  assert.equal(deferrals(projectData).proportionalRelink.status, 'triggered');
  assert.equal(deferrals(projectData).resolutionNarrowing.status, 'triggered');
  const below = structuredClone(projectData);
  for (const [name, kind] of [['S100', 'created'], ['S500', 'description']]) {
    below.get(name).cycles[kind].forEach(row => { row.revision.timings.total = 1; });
  }
  assert.equal(deferrals(below).proportionalRelink.status, 'not-triggered');
  assert.equal(deferrals(below).resolutionNarrowing.status, 'not-triggered');
  for (const [name, kind, key] of [['S100', 'created', 'resolutionNarrowing'], ['S500', 'description', 'proportionalRelink']]) {
    for (const mutate of [
      rows => { rows.pop(); },
      rows => { rows[0].revision.checked.path = 'source'; },
      rows => { rows[0].revision.outcome.execution = 'incomplete'; },
      rows => { rows[0].hook.document.changed[0].covered = false; },
      rows => { rows[0].beforeSequence = rows[0].revision.sequence; },
      rows => { rows[0].expected[0].path = 'src/unrelated.ts'; rows[0].hook.document.changed[0].path = 'src/unrelated.ts'; },
      rows => { rows[0].expected[0].sha256 = null; rows[0].hook.document.changed[0].sha256 = null; },
      rows => { rows[0].revision.summary.denied++; },
    ]) {
      const altered = structuredClone(projectData); mutate(altered.get(name).cycles[kind]);
      assert.equal(deferrals(altered)[key].status, 'not-evaluated');
    }
  }
});

test('persistent checkpoint deferral requires a completed published S1000 cold revision', () => {
  const data = { cold: { reply: { status: 'reported', published: true, revision: {
    checked: { path: 'cold' }, outcome: { execution: 'completed', coverage: 'complete' },
    summary: { owners: 1000 }, timings: { total: 1 },
  } } } };
  const deferral = value => fastDeferrals([measured('S1000', value)]).persistentCheckpoints;
  assert.equal(deferral(data).status, 'not-triggered');
  data.cold.reply.revision.timings.total = fastBudgets.S1000.cold + 1;
  assert.equal(deferral(data).status, 'triggered');
  for (const mutate of [
    reply => { reply.status = 'cold'; },
    reply => { reply.published = false; },
    reply => { reply.revision.checked.path = 'broad'; },
    reply => { reply.revision.outcome.execution = 'incomplete'; },
    reply => { reply.revision.outcome.coverage = 'partial'; },
    reply => { reply.revision.summary.owners = 100; },
  ]) {
    const altered = structuredClone(data); mutate(altered.cold.reply);
    assert.equal(deferral(altered).status, 'not-evaluated');
    assert.deepEqual(deferral(altered).observed, [null]);
  }
});

test('only deletion accepts the exact unresolved-target note for its stable importer witness', () => {
  for (const name of fastFixtures) {
    const definition = fixture(name), row = cycle(0, 'deleted');
    row.expected = [{ path: definition.created, sha256: null }];
    row.hook.document.changed = row.expected.map(item => ({ ...item, covered: true }));
    row.revision.checked.path = 'broad'; row.revision.outcome.coverage = 'partial';
    row.hook.document.coverage = [{
      id: name === 'reference' ? 'access-limit/1:69a7528da599c0bb91ecdf8acdbb521e4c05fc19dd2c35a1433baa447e559f4f'
        : 'access-limit/1:797e8a8de4b78a82be864b29b885b098b6f01f5c5c942cb9f2db4cbb1d812c53',
      code: 'unresolved-target', location: { file: definition.body, start: 7, end: 38, line: 1, column: 8 },
      message: 'Cannot establish the accessed source or resource target', related: [],
    }];
    const data = { fixtures: [definition], cycles: { deleted: [row] } };
    const outcome = (value, kind = 'deleted') => assertFastWorkload(`I5-13:hook-latency-${name.toLowerCase()}`, value)
      .find(assertion => assertion.name === `${kind} 1: independent outcome`);
    assert.equal(outcome(data).passed, true);
    for (const mutate of [
      value => { value.cycles.deleted[0].hook.document.coverage[0].id = 'unrelated'; },
      value => { value.cycles.deleted[0].hook.document.coverage[0].code = 'unrelated'; },
      value => { value.cycles.deleted[0].hook.document.coverage[0].location.file = 'src/unrelated.ts'; },
      value => { value.cycles.deleted[0].hook.document.coverage[0].location.end++; },
      value => { value.cycles.deleted[0].hook.document.coverage[0].message = 'unrelated'; },
      value => { value.cycles.deleted[0].hook.document.coverage[0].related.push({}); },
      value => { value.cycles.deleted[0].hook.document.coverage.push({}); },
      value => { value.cycles.deleted[0].hook.document.coverage = []; },
      value => { value.cycles.deleted[0].revision.outcome.coverage = 'complete'; },
      value => { value.cycles.deleted[0].expected[0].sha256 = 'a'.repeat(64); },
      value => { value.fixtures[0].creationWitness.specifier = './unrelated.js'; },
      value => { value.fixtures[0].created = 'src/unrelated.ts'; },
    ]) {
      const altered = structuredClone(data); mutate(altered);
      assert.equal(outcome(altered).passed, false);
    }
    for (const kind of ['body', 'source', 'description', 'readme', 'created', 'configuration']) {
      const altered = structuredClone(data);
      altered.cycles = { [kind]: [{ ...altered.cycles.deleted[0], kind }] };
      assert.equal(outcome(altered, kind).passed, false, `${name}/${kind}`);
    }
  }
});

test('plateaus account separately for daemon, worker, compiler and combined physical RSS', () => {
  const measurements = plateaus();
  passing(assertFastWorkload('I5-13:repeated-edit-plateau', measurements));
  const last = measurements.reference.cycles.at(-1).settledProcessSample;
  last.processes.find(row => row.pid === 41).rssBytes += fastBudgets.memory.rssGrowth + 1;
  last.combinedRssBytes += fastBudgets.memory.rssGrowth + 1;
  const assertions = assertFastWorkload('I5-13:repeated-edit-plateau', measurements);
  passing(assertions); // Numeric memory targets are ideal budgets.
  assert.ok(assertions.filter(value => 'enforcement' in value).every(value => value.enforcement === 'ideal'));
  assert.equal(assertions.find(value => value.name === 'reference: daemon RSS growth').targetMet, true);
  for (const name of ['reference: worker supervisor RSS growth', 'reference: combined process RSS growth']) {
    assert.equal(assertions.find(value => value.name === name).targetMet, false);
  }
  const missing = plateaus();
  missing.reference.cycles[120].settledProcessSample.processes.splice(1, 1);
  missing.reference.cycles[120].settledProcessSample.combinedRssBytes -= 2048;
  assert.equal(assertFastWorkload('I5-13:repeated-edit-plateau', missing)
    .find(value => value.name === 'reference: settled process samples identify every daemon, worker and compiler PID exactly once').passed, false);
  const duplicate = plateaus(), sample = duplicate.reference.cycles[120].settledProcessSample;
  sample.processes.push({ ...sample.processes[1] }); sample.combinedRssBytes += 2048;
  assert.equal(assertFastWorkload('I5-13:repeated-edit-plateau', duplicate)
    .find(value => value.name === 'reference: settled process samples identify every daemon, worker and compiler PID exactly once').passed, false);
});

test('transient telemetry retention violations fail even when every settled cycle is within limits', () => {
  for (const mutate of [
    sample => { sample.contexts[0].retainedBytes = fastBudgets.runtime.factBytes + 1;
      sample.contexts[0].session.factBytes = fastBudgets.runtime.factBytes + 1; },
    sample => { sample.contexts[0].history.bytes = fastBudgets.runtime.historyBytes + 1; },
    sample => { sample.contexts[0].history.retained = fastBudgets.runtime.historyRevisions + 1; },
    sample => { sample.contexts = Array.from({ length: 9 }, () => structuredClone(sample.contexts[0])); },
    sample => { sample.contexts = Array.from({ length: 6 }, () => ({ ...structuredClone(sample.contexts[0]),
      retainedBytes: fastBudgets.runtime.factBytes, session: { ...sample.contexts[0].session, factBytes: fastBudgets.runtime.factBytes } })); },
  ]) {
    const measurements = plateaus(); mutate(measurements.reference.telemetry[70]);
    const assertions = assertFastWorkload('I5-13:repeated-edit-plateau', measurements);
    assert.equal(assertions.find(value => value.name === 'reference: runtime retention throughout telemetry').passed, false);
    assert.ok(assertions.filter(value => /^reference \d+: runtime retention$/.test(value.name)).every(value => value.passed));
  }
});

test('plateau lifetime controls reject unbalanced counters, resets, growing handles and missing final releases', () => {
  const tied = plateaus();
  // An open/close can fall between two snapshots with the same millisecond.
  // The periodic stream observed it after the settled stream at that instant.
  for (const sample of [...tied.reference.telemetry.slice(80).map(value => value.instrumentation),
    ...tied.reference.cycles.slice(81).map(value => value.settled.instrumentation), tied.reference.finalInstrumentation]) {
    sample.totals.filesOpened = 2; sample.totals.filesClosed = 2;
  }
  passing(assertFastWorkload('I5-13:repeated-edit-plateau', tied));
  for (const [mutate, predicate] of [
    [data => { data.telemetry[80].instrumentation.totals.compilersStarted++; }, 'reference: lifetime totals balance at every observed checkpoint'],
    [data => { data.telemetry[80].instrumentation.totals.filesOpened = 0;
      data.telemetry[80].instrumentation.totals.filesClosed = 0; }, 'reference: lifetime totals never reset'],
    [data => { data.cycles[180].settled.instrumentation.timers = 4; }, 'reference: watchers, timers and open files stay bounded after settling'],
    [data => { data.cycles[180].settled.instrumentation.watchers++;
      data.cycles[180].settled.instrumentation.totals.watchersOpened++; }, 'reference: watchers, timers and open files stay bounded after settling'],
    [data => { data.finalInstrumentation.activeSessions = 1;
      data.finalInstrumentation.totals.sessionsDisposed = 0; }, 'reference: final instrumentation records released lifetimes'],
  ]) {
    const measurements = plateaus(); mutate(measurements.reference);
    const assertions = assertFastWorkload('I5-13:repeated-edit-plateau', measurements);
    assert.equal(assertions.find(value => value.name === predicate).passed, false, predicate);
  }
});

test('one completed workload is reusable without granting a partial recipe completion', () => {
  const value = report();
  const result = verify(value);
  assert.equal(result.passed, true);
  assert.equal(result.reportComplete, false);
  assert.equal(result.samples.controller, 1);
  assert.throws(() => verifyFastEvidence(value, 'I5-13:cold-open', inputs, dependencies), /has not completed/);
  value.passed = true;
  assert.throws(() => verify(value), /all nine completed/);
});

test('missing observations cannot pass any of the reviewed workloads', () => {
  for (const row of fastWorkloads) {
    for (const absent of [null, {}]) {
      const assertions = assertFastWorkload(row.id, absent);
      assert.ok(assertions.length > 0 && assertions.some(value => !value.passed), row.id);
    }
  }
});

test('timing misses on every fixture are ideal budgets recorded without failing, while correctness still fails', () => {
  for (const name of fastFixtures) {
    const id = `I5-13:hook-latency-${name.toLowerCase()}`, duration = fastBudgets[name].body + 1;
    const body = Array.from({ length: 20 }, (_, index) => {
      const row = cycle(index);
      // The revision and the hook document share one timings object.
      row.revision.timings.total = duration; row.hook.durationMs = fastBudgets[name].racing + 1;
      return row;
    });
    const data = {
      cycles: { body },
      // A claimed median cannot conceal the twenty recorded durations.
      medianBodyMs: 0,
    };
    const assertions = assertFastWorkload(id, data);
    for (const [label, maximum, observed] of [['body: median session work (ms)', fastBudgets[name].body, duration],
      ['racing: median hook end to end (ms)', fastBudgets[name].racing, fastBudgets[name].racing + 1]]) {
      assert.deepEqual(assertions.find(value => value.name === label),
        { name: label, passed: true, observed, maximum, enforcement: 'ideal', targetMet: false }, `${name}: ${label}`);
    }
    assert.ok(assertions.filter(value => 'enforcement' in value).every(value => value.enforcement === 'ideal'));
    for (const suffix of ['real covering CLI result', 'independent outcome', 'timings match the covering revision', 'revision path']) {
      assert.equal(assertions.find(value => value.name === `body 5: ${suffix}`).passed, true, `${name}: ${suffix}`);
    }
    // Correctness remains enforced beside an ideal miss.
    const broad = structuredClone(data); broad.cycles.body[4].revision.checked.path = 'broad';
    const failed = assertFastWorkload(id, broad);
    assert.equal(failed.find(value => value.name === 'body 5: revision path').passed, false);
    assert.equal(failed.find(value => value.name === 'body: median session work (ms)').passed, true);
    const late = structuredClone(data); late.cycles.body.forEach(row => { row.revision.timings.total = 1; });
    assert.equal(assertFastWorkload(id, late).find(value => value.name === 'body: median session work (ms)').targetMet, true);
    const missing = structuredClone(data); missing.cycles.body[0].revision.timings.total = null;
    assert.equal(assertFastWorkload(id, missing).find(value => value.name === 'body: median session work (ms)').passed, false);
  }
  const cold = Object.fromEntries(fastFixtures.map(name => [name, { cold: { reply: { status: 'reported', published: true,
    revision: { checked: { path: 'cold' }, outcome: { execution: 'completed', coverage: 'complete' },
      summary: { owners: name === 'reference' ? 15 : Number(name.slice(1)) }, timings: { total: fastBudgets[name].cold + 1 } } } } }]));
  const coldAssertions = assertFastWorkload('I5-13:cold-open', cold);
  passing(coldAssertions);
  assert.ok(fastFixtures.every(name => coldAssertions.some(value => value.name === `${name}: cold session work (ms)`
    && value.enforcement === 'ideal' && value.targetMet === false)));
});

const counters = (analyses, coveredRequests, sweeps = 4, audits = 1, revisions = 160) =>
  ({ analyses, revisions, coveredRequests, sweeps, audits, auditMismatches: 0 });

/** A synthetic published-hook cycle with before, after-hook and settled counters. */
function publishedCycle(index, before, after, settled) {
  const row = cycle(index), sequence = row.revision.sequence;
  row.beforeHook = { counters: before, contexts: [{ published: { sequence } }] };
  row.afterHook = { counters: after, contexts: [{ published: { sequence } }] };
  row.settled = { counters: settled, contexts: [{ published: { sequence } }] };
  return row;
}

// Plan 5 iteration 12, reference cycle 1: a periodic sweep began after the
// before sample but 200 ms before the hook's request, the request queued behind
// it and forced a second update. Two analyses, one sweep, no covered request.
const referenceCycle1 = () => publishedCycle(0, counters(323, 21), counters(325, 21, 5), counters(325, 21, 5));
// Reference cycle 13: covered within 1 ms; a sweep began in the settle window.
const referenceCycle13 = () => publishedCycle(12, counters(337, 32), counters(337, 33), counters(338, 33, 5));
// S100 cycle 18 had the same shape as reference cycle 13.
const s100Cycle18 = () => publishedCycle(17, counters(412, 57, 9, 2, 230), counters(412, 58, 9, 2, 230), counters(413, 58, 10, 2, 230));

test('published hooks are judged by the counters sampled when the hook returns', () => {
  assert.equal(publishedHookAttributed(referenceCycle13()), true);
  assert.equal(publishedHookAttributed(s100Cycle18()), true);
  for (const [label, row] of [
    ['no maintenance', publishedCycle(0, counters(10, 1), counters(10, 2), counters(10, 2))],
    ['sweep between reply and after sample', publishedCycle(0, counters(10, 1), counters(11, 2, 5), counters(11, 2, 5))],
    ['sweep running at the before sample', publishedCycle(0, counters(10, 1, 5), counters(10, 2, 5), counters(10, 2, 5))],
    ['audit and sweep while settling', publishedCycle(0, counters(10, 1), counters(10, 2), counters(12, 2, 5, 2))],
  ]) assert.equal(publishedHookAttributed(row), true, label);

  assert.equal(publishedHookAttributed(referenceCycle1()), false, 'reference cycle 1');
  // The same violation fails when its sweep was already counted before the hook.
  assert.equal(publishedHookAttributed(publishedCycle(0, counters(324, 21, 5), counters(325, 21, 5), counters(325, 21, 5))), false);
  for (const [label, mutate] of [
    ['update during the hook', row => { row.afterHook.counters.analyses++; row.settled.counters.analyses++; }],
    ['covered count below one', row => { row.afterHook.counters.coveredRequests--; row.settled.counters.coveredRequests--; }],
    ['two covered requests', row => { row.afterHook.counters.coveredRequests++; row.settled.counters.coveredRequests++; }],
    ['update while settling', row => { row.settled.counters.analyses++; }],
    ['sweep publishes while settling', row => { row.settled.counters.revisions++; }],
    ['covered request while settling', row => { row.settled.counters.coveredRequests++; }],
    ['before revision differs from the hook', row => { row.beforeHook.contexts[0].published.sequence--; }],
    ['nonzero exit', row => { row.hook.code = 1; row.hook.document.exitCode = 1; }],
    ['uncovered changed entry', row => { row.hook.document.changed[0].covered = false; }],
    ['no changed entries', row => { row.hook.document.changed = []; }],
    ['missing after sample', row => { row.afterHook = null; }],
    ['missing sweep counter', row => { delete row.afterHook.counters.sweeps; }],
  ]) {
    const row = referenceCycle13(); mutate(row);
    assert.equal(publishedHookAttributed(row), false, label);
  }

  const predicate = published => assertFastWorkload('I5-13:hook-latency-reference', { published })
    .find(value => value.name === 'published hooks perform zero analysis');
  const twenty = () => Array.from({ length: 20 }, (_, index) => index === 12 ? referenceCycle13()
    : publishedCycle(index, counters(300 + index, index), counters(300 + index, index + 1), counters(300 + index, index + 1)));
  assert.deepEqual(predicate(twenty()), { name: 'published hooks perform zero analysis', passed: true, observed: { cycles: 20, unattributed: [] } });
  const violated = twenty(); violated[0] = referenceCycle1();
  assert.deepEqual(predicate(violated).observed, { cycles: 20, unattributed: [1] });
  assert.equal(predicate(violated).passed, false);
  const s100 = twenty(); s100[17] = s100Cycle18();
  assert.equal(predicate(s100).passed, true);
  assert.equal(predicate([]).passed, false);
});

test('current source, dependencies, runtime and targets are required', () => {
  for (const [mutate, message] of [
    [value => { value.inputs.build.sha256 = 'stale'; }, /current source/],
    [value => { value.dependencies.typescript = 'stale'; }, /dependencies changed/],
    [value => { value.environment.node = 'stale'; }, /Node runtime changed/],
    [value => { value.environment.platform = 'stale'; }, /platform changed/],
    [value => { value.environment.arch = 'stale'; }, /architecture changed/],
    [value => { value.budgets.reference.body++; }, /targets or runtime limits changed/],
    [value => { value.sampling.intervalMs = 100; }, /100 !== 50/],
  ]) {
    const value = report(); mutate(value);
    assert.throws(() => verify(value), message);
  }
});

test('missing slots, interruption, process failures and false completion cannot receive credit', () => {
  for (const mutate of [
    value => { value.workloads.pop(); },
    value => { value.workloads[0] = value.workloads.at(-1); },
    value => { value.interrupted = true; },
    value => { value.failures.push('Parent input drift'); },
    value => { value.status = 'passed'; },
    value => { value.completedAt = 'invalid'; },
    value => { value.workloads.at(-1).status = 'not-executed'; },
    value => { value.workloads.at(-1).passed = false; },
    value => { value.workloads.at(-1).failures.push('Child failed'); },
    value => { value.workloads.at(-1).interrupted = true; },
    value => { value.workloads.at(-1).controllerObservation.failure = 'Timeout'; },
    value => { value.workloads.at(-1).controllerObservation.signal = 'SIGKILL'; },
    value => { value.workloads.at(-1).controllerObservation.code = 1; },
    value => { value.workloads.at(-1).controllerObservation.postExitObservedProcesses = 1; },
    value => { value.workloads.at(-1).controllerObservation.processes = []; },
    value => { value.workloads.at(-1).controllerObservation.samples = []; },
    value => { value.workloads.at(-1).startedAt = '2026-09-11T00:00:00.000Z'; },
    value => { value.workloads.at(-1).completedAt = '2026-09-13T00:00:00.000Z'; },
  ]) {
    const value = report(); mutate(value);
    assert.throws(() => verify(value));
  }
});

test('saved pass flags cannot hide altered raw observations or assertion results', () => {
  const raw = report();
  raw.workloads.at(-1).measurements.client.samples = [];
  assert.throws(() => verify(raw), /Saved assertions differ/);
  const claimed = report();
  claimed.workloads.at(-1).assertions = [];
  assert.throws(() => verify(claimed), /Saved assertions differ/);
  const deferral = report();
  deferral.deferrals.childProcessHost.status = 'not-triggered';
  assert.throws(() => verify(deferral), /Saved deferral outcomes differ/);
});

test('derived cold observations preserve their source payloads and external process samples', () => {
  const value = report(), derivedId = 'I5-13:cold-open';
  const controller = structuredClone(value.workloads.at(-1).controllerObservation);
  const sourceIds = fastFixtures.map(name => `I5-13:hook-latency-${name.toLowerCase()}`);
  for (const name of fastFixtures) {
    const sourceId = `I5-13:hook-latency-${name.toLowerCase()}`;
    const measurements = { cold: { durationMs: 1, reply: {
      status: 'reported', published: true, revision: { checked: { path: 'cold' },
        outcome: { execution: 'completed', coverage: 'complete' }, summary: { owners: name === 'reference' ? 15 : Number(name.slice(1)) },
        timings: { total: 1 } },
    } } };
    value.workloads[value.workloads.findIndex(row => row.id === sourceId)] = {
      id: sourceId, measurements, assertions: assertFastWorkload(sourceId, measurements),
      status: 'measured', passed: false, failures: [], interrupted: false, startedAt: start, completedAt: end,
      controllerObservation: { ...structuredClone(controller), code: 1 },
    };
  }
  const measurements = deriveFastMeasurements(derivedId, value.workloads);
  const derived = { id: derivedId, sourceWorkloadIds: sourceIds, measurements,
    assertions: assertFastWorkload(derivedId, measurements), status: 'measured', passed: true,
    failures: [], interrupted: false, startedAt: start, completedAt: end,
    controllerObservation: { ...controller, processes: sourceIds.flatMap(() => structuredClone(controller.processes)),
      samples: sourceIds.flatMap(() => structuredClone(controller.samples)) },
  };
  value.workloads[value.workloads.findIndex(row => row.id === derivedId)] = derived;
  const verifyCold = candidate => {
    candidate.deferrals = fastDeferrals(candidate.workloads);
    return verifyFastEvidence(candidate, derivedId, inputs, dependencies);
  };
  assert.equal(verifyCold(value).passed, true);
  assert.equal(verifyCold(value).reportComplete, false);

  for (const mutate of [
    candidate => { candidate.workloads.find(row => row.id === derivedId).sourceWorkloadIds.pop(); },
    candidate => { candidate.workloads.find(row => row.id === derivedId).measurements.S100.cold.durationMs++; },
    candidate => { candidate.workloads.find(row => row.id === derivedId).controllerObservation.samples.pop(); },
    candidate => { candidate.workloads[0].controllerObservation.postExitObservedProcesses = 1; },
    candidate => { candidate.workloads[0].controllerObservation.code = 0; },
    candidate => { candidate.workloads[0].failures.push('Source failed to collect observations'); },
  ]) {
    // Archive JSON contains independent values even when the live recipe
    // projected an object by reference before serialization.
    const altered = JSON.parse(JSON.stringify(value)); mutate(altered);
    assert.throws(() => verifyCold(altered));
  }
});

test('archives preserve payloads and reject compressed hashes, raw hashes and byte-count drift', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ramify-fast-archive-control-'));
  try {
    const value = report();
    const record = archiveMeasurement(value, directory, 'Verifier test control only; not measurement evidence');
    const path = join(directory, record.file);
    assert.equal(record.phase, 'fast');
    assert.equal(record.payloadSchema, value.schemaVersion);
    assert.deepEqual(readFastEvidence(path, record).report, value);
    for (const [field, replacement, message] of [
      ['gzipSha256', 'wrong', /gzip hash mismatch/],
      ['rawSha256', 'wrong', /raw hash mismatch/],
      ['gzipBytes', 0, /compressed byte count mismatch/],
      ['rawBytes', 0, /raw byte count mismatch/],
    ]) assert.throws(() => readFastEvidence(path, { ...record, [field]: replacement }), message);
    const altered = gzipSync(Buffer.from(JSON.stringify({ ...value, passed: true })));
    writeFileSync(path, altered);
    assert.throws(() => readFastEvidence(path, record), /gzip hash mismatch/);
    assert.throws(() => readFastEvidence(path, { ...record, gzipSha256: sha256(altered), gzipBytes: altered.length }), /gzip member/);
    assert.throws(() => readFastEvidence(path, { ...record, gzipSha256: sha256(altered), gzipBytes: altered.length, gzipMembers: undefined }), /raw hash mismatch/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('archive selection uses newest matching inputs and preserves incomplete rows', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ramify-fast-selection-control-'));
  try {
    const original = report();
    archiveMeasurement(original, directory, 'First verifier control');
    const newer = report();
    newer.workloads[newer.workloads.length - 1] = { id, status: 'not-executed', passed: false, measurements: null };
    const record = archiveMeasurement(newer, directory, 'Newest incomplete verifier control');
    archiveMeasurement({ ...original, inputs: { build: 'other-inputs' } }, directory, 'Different input verifier control');
    const selected = findFastEvidence(directory, inputs);
    assert.equal(selected.artifact, join(directory, record.file));
    assert.throws(() => verify(selected.report), /has not completed/);
    assert.throws(() => findFastEvidence(directory, { build: 'missing' }), /No current fast measurements/);

    const indexPath = join(directory, 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.records.push({ ...record, file: '../outside.json.gz' });
    writeFileSync(indexPath, JSON.stringify(index));
    assert.throws(() => findFastEvidence(directory, inputs), /owned directory/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
