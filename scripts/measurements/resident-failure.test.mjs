import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCommand } from './resident-driver.mjs';

test('failed cold report retains its actual resource-limit diagnostic', () => {
  const result = { failure: null, signal: null, stderr: '', code: 2,
    stdout: JSON.stringify({ diagnostics: [{ code: 'resource-limit', message: 'maxReportBytes limit 33554432 exceeded' }] }) };
  assert.throws(() => reportCommand(result, { name: 'S500', owners: 500 }), /maxReportBytes limit 33554432 exceeded/);
});

const { coldCommand, withResident, failureText } = await import('./resident-failure.mjs');
const incomplete = { pid: 1, durationMs: 5, failure: null, signal: null, stderr: '', code: 2,
  stdout: JSON.stringify({ diagnostics: [{ code: 'resource-limit', message: 'maxReportBytes limit exceeded' }] }) };

test('incomplete cold command is connected for orderly shutdown and preserves raw evidence', async () => {
  const calls = [], measurements = {};
  const host = { cli: async () => incomplete, connect: async mode => calls.push(mode), close: async () => calls.push('close') };
  await assert.rejects(withResident(host, () => coldCommand(host, { name: 'S500', owners: 500 }, measurements)), /maxReportBytes limit exceeded/);
  assert.deepEqual(calls, ['never', 'close']);
  assert.equal(measurements.failedCommands[0].stdout, incomplete.stdout);
});

test('original command, connection and cleanup failures all survive worker formatting', async () => {
  const measurements = {};
  let closes = 0;
  const host = { cli: async () => incomplete, connect: async () => { throw new Error('connection unavailable'); },
    close: async () => { closes++; throw new Error('owned daemon survived'); } };
  await assert.rejects(withResident(host, () => coldCommand(host, { name: 'S500', owners: 500 }, measurements)), error => {
    const text = failureText(error);
    assert.match(text, /maxReportBytes limit exceeded/);
    assert.match(text, /connection unavailable/);
    assert.match(text, /owned daemon survived/);
    return true;
  });
  assert.equal(closes, 1);
  assert.equal(measurements.failedCommands[0].code, 2);
});

test('cleanup failure cannot turn a successful workload into a pass', async () => {
  await assert.rejects(withResident({ close: async () => { throw new Error('cleanup failed'); } }, async () => 1), /cleanup failed/);
});

/** The note the S fixtures' measurement setup reports on m001's exposed literal `value`. */
const note = (original, code = 'signature-inferred') => ({ id: `companion-limit/1:${original}`, code,
  location: { file: 'subs/m001/src/interfaces/api.ts', start: 63, end: 72, line: 2, column: 14 },
  message: `\`${original}\` is exposed and its declared signature leaves a type to inference; the companions of an inferred type are not verified`,
  related: [] });
const unresolved = { id: 'access-limit/1:x', code: 'unresolved-target', location: { file: 'src/impl0.ts', start: 7, end: 38, line: 1, column: 8 },
  message: 'Cannot establish the accessed source or resource target', related: [] };
function analysis({ owners = 100, denied = 0, check = denied ? 'failed' : 'passed', coverage = [note('value')],
  level = coverage.length ? 'partial' : 'complete', execution = 'completed', code = denied ? 1 : 0 } = {}) {
  return { failure: null, signal: null, stderr: '', code, stdout: JSON.stringify({ schemaVersion: 'ramify.analysis/3',
    outcome: { execution, check, coverage: level }, summary: { owners, denied }, coverage, stages: [{ status: 'completed' }] }) };
}
const S100 = { name: 'S100', owners: 100 }, reference = { name: 'reference', owners: 15 };

test('successful cold results do not retain raw command output', async () => {
  const measurements = {};
  const complete = analysis({ owners: 500 });
  const result = await coldCommand({ cli: async () => complete, connect: async () => {} }, { name: 'S500', owners: 500 }, measurements);
  assert.equal(result.sample, complete);
  assert.equal(measurements.failedCommands, undefined);
});

test('a synthetic fixture passes with exactly its setup note on `value` and partial coverage', () => {
  for (const [name, owners] of [['S100', 100], ['S500', 500], ['S1000', 1000]]) {
    assert.equal(reportCommand(analysis({ owners }), { name, owners }).outcome.coverage, 'partial');
  }
});

test('a synthetic fixture without its setup note fails: the rule still reports it', () => {
  assert.throws(() => reportCommand(analysis({ coverage: [] }), S100), /partial/);
  assert.throws(() => reportCommand(analysis({ coverage: [], level: 'partial' }), S100), /S100 coverage must be exactly/);
});

test('a synthetic fixture with an extra, duplicate or different note fails', () => {
  for (const coverage of [[note('value'), note('run0')], [note('value'), note('value')], [note('run0')],
    [note('value', 'signature-unresolved')], [note('value'), unresolved]]) {
    assert.throws(() => reportCommand(analysis({ coverage }), S100), /S100 coverage must be exactly/, JSON.stringify(coverage.map(item => item.code)));
  }
  assert.throws(() => reportCommand(analysis({ level: 'complete' }), S100), /partial/, 'the note must make coverage partial');
});

test('the reference fixture fails on any note and passes only complete', () => {
  assert.equal(reportCommand(analysis({ owners: 15, coverage: [] }), reference).outcome.coverage, 'complete');
  for (const coverage of [[note('value')], [note('assembleRouter')], [unresolved]]) {
    assert.throws(() => reportCommand(analysis({ owners: 15, coverage }), reference));
  }
});

test('a failed, incomplete or unexpectedly denied check fails', () => {
  assert.throws(() => reportCommand(analysis({ check: 'failed' }), S100), /check/);
  assert.throws(() => reportCommand(analysis({ execution: 'incomplete' }), S100), /execution/);
  assert.throws(() => reportCommand(analysis({ denied: 1 }), S100), /exited 1; expected 0/);
  assert.throws(() => reportCommand(analysis({ denied: 1, code: 0 }), S100, { denied: 1 }), /exited 0; expected 1/);
});

test('removing the setup exposure leaves a failed check with no note and complete coverage', () => {
  const removed = { denied: 1, setupExposureRemoved: true };
  assert.equal(reportCommand(analysis({ denied: 1, coverage: [] }), S100, removed).outcome.check, 'failed');
  assert.throws(() => reportCommand(analysis({ denied: 1 }), S100, removed), /complete/, 'an unexposed `value` has no note');
  assert.throws(() => reportCommand(analysis({ denied: 1, coverage: [] }), S100, { denied: 1 }), /partial/,
    'the denied count alone does not remove the note');
});

test('a resident check applies the same outcome rule to the daemon report', async () => {
  const { assertMeasuredOutcome } = await import('./resident-driver.mjs');
  const report = coverage => ({ outcome: { execution: 'completed', check: 'passed', coverage: coverage.length ? 'partial' : 'complete' },
    summary: { owners: 100, denied: 0 }, coverage });
  assert.doesNotThrow(() => assertMeasuredOutcome(report([note('value')]), S100));
  assert.throws(() => assertMeasuredOutcome(report([]), S100));
  assert.throws(() => assertMeasuredOutcome(report([note('value'), note('run0')]), S100));
  assert.throws(() => assertMeasuredOutcome({ ...report([note('value')]), summary: { owners: 100, denied: 1 } }, S100));
});
