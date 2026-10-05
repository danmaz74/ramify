import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertResidentWorkload } from './resident-assertions.mjs';
import { assertFastWorkload } from './fast-assertions.mjs';
import { entryFootprint } from './resident-observer.mjs';

// Synthetic report fragments for the entry-footprints help row. The fast entry
// reuses the resident predicates, so every case is judged under both ids.
const ids = ['I2-29:entry-footprints', 'I5-13:entry-footprints'];
const sampled = [{ elapsedMs: 0, combinedRssBytes: 1024, processes: [{ pid: 42, ppid: 1, pgid: 42, rssBytes: 1024 }] }];
// The shape Plan 5 archived for the compiled client: the mark sample before
// launch and one sample of the already exiting process, with no resident bytes.
const unsampled = () => [{ elapsedMs: 23.3, combinedRssBytes: 0, processes: [] },
  { elapsedMs: 47, combinedRssBytes: 0, processes: [{ pid: 7, ppid: 1, pgid: 7, rssBytes: 0 }] }];

function footprints(help) {
  const value = Object.fromEntries(['client', 'cliReference', 'cliS100'].map(name =>
    [name, { rssBytes: 1024, pid: 42, samples: structuredClone(sampled) }]));
  for (const name of ['daemonEmpty', 'daemonReference']) value[name] = { rssBytes: 1024,
    settled: { pid: 42, memory: { rss: 1024, heapUsed: 512, external: 128 }, instrumentation: { pid: 42 } } };
  value.help = help;
  return value;
}
const helpRows = assertions => assertions.filter(row => row.name.startsWith('help'));
function judge(help) {
  return ids.map(id => {
    const assertions = id.startsWith('I5') ? assertFastWorkload(id, footprints(structuredClone(help)))
      : assertResidentWorkload(id, footprints(structuredClone(help)));
    return { passed: assertions.every(row => row.passed), help: helpRows(assertions) };
  });
}
const belowResolution = (overrides = {}) => ({ rssBytes: null, durationMs: 25.5, samplerIntervalMs: 50,
  belowSamplingResolution: true, samples: unsampled(), ...overrides });

test('an entry that exits within one sampler interval passes as completed below sampling resolution', () => {
  for (const result of judge(belowResolution())) {
    assert.equal(result.passed, true);
    assert.deepEqual(result.help.at(-1), { name: 'help completed below sampling resolution', passed: true,
      observed: { durationMs: 25.5, samplerIntervalMs: 50, sampledRssBytes: 0 }, maximum: 50 });
    assert.ok(!result.help.some(row => row.name === 'help contains real externally sampled RSS'));
  }
});

test('an entry that ran at least one sampler interval without a resident sample fails', () => {
  // As recorded: no marker, zero bytes.
  for (const result of judge({ rssBytes: 0, durationMs: 60, samplerIntervalMs: 50, belowSamplingResolution: false, samples: unsampled() })) {
    assert.equal(result.passed, false);
    assert.equal(result.help.find(row => row.name === 'help contains real externally sampled RSS')?.passed, false);
  }
  // A marker cannot excuse a run of one interval or longer, nor a widened interval.
  for (const help of [belowResolution({ durationMs: 60 }), belowResolution({ durationMs: 50 }),
    belowResolution({ durationMs: 75, samplerIntervalMs: 100 })]) {
    for (const result of judge(help)) {
      assert.equal(result.passed, false);
      assert.equal(result.help.find(row => row.name === 'help completed below sampling resolution')?.passed, false);
    }
  }
  // A fast exit the report does not mark below resolution still needs real RSS.
  for (const result of judge({ rssBytes: 0, durationMs: 25.5, samples: unsampled() })) assert.equal(result.passed, false);
});

test('a sampled entry passes as before, and a contradicting marker fails', () => {
  for (const help of [{ rssBytes: 1024, durationMs: 25.5, samples: structuredClone(sampled) },
    { rssBytes: 1024, durationMs: 80, samplerIntervalMs: 50, belowSamplingResolution: false, samples: structuredClone(sampled) }]) {
    for (const result of judge(help)) {
      assert.equal(result.passed, true);
      assert.deepEqual(result.help.at(-1), { name: 'help contains real externally sampled RSS', passed: true, observed: 1024, maximum: null });
    }
  }
  for (const help of [belowResolution({ samples: structuredClone(sampled) }), belowResolution({ rssBytes: 0 })]) {
    for (const result of judge(help)) assert.equal(result.passed, false);
  }
});

test('a missing or non-finite wall time fails', () => {
  for (const durationMs of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, '25.5']) {
    const help = belowResolution({ durationMs });
    if (durationMs === undefined) delete help.durationMs;
    for (const result of judge(help)) {
      assert.equal(result.passed, false, `durationMs ${String(durationMs)}`);
      assert.equal(result.help.find(row => row.name === 'help completed below sampling resolution')?.passed, false);
    }
  }
});

test('the measuring code records what the sampler saw', () => {
  const below = entryFootprint(unsampled(), 25.5, 50);
  assert.deepEqual(below, belowResolution());
  assert.equal(judge(below).every(result => result.passed), true);
  for (const durationMs of [50, 60]) {
    const slow = entryFootprint(unsampled(), durationMs, 50);
    assert.deepEqual({ ...slow, samples: undefined }, { rssBytes: 0, durationMs, samplerIntervalMs: 50,
      belowSamplingResolution: false, samples: undefined });
    assert.equal(judge(slow).some(result => result.passed), false);
  }
  const real = entryFootprint(structuredClone(sampled), 25.5, 50);
  assert.equal(real.belowSamplingResolution, false);
  assert.equal(real.rssBytes, 1024);
  assert.equal(judge(real).every(result => result.passed), true);
  for (const durationMs of [undefined, Number.NaN]) {
    const unknown = entryFootprint(unsampled(), durationMs, 50);
    assert.equal(unknown.belowSamplingResolution, false);
    assert.equal(judge(unknown).some(result => result.passed), false);
  }
});
