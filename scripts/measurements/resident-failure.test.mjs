import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCommand } from './resident-driver.mjs';

test('failed cold report retains its actual resource-limit diagnostic', () => {
  const result = { failure: null, signal: null, stderr: '', code: 2,
    stdout: JSON.stringify({ diagnostics: [{ code: 'resource-limit', message: 'maxReportBytes limit 33554432 exceeded' }] }) };
  assert.throws(() => reportCommand(result, 500), /maxReportBytes limit 33554432 exceeded/);
});

const { coldCommand, withResident, failureText } = await import('./resident-failure.mjs');
const incomplete = { pid: 1, durationMs: 5, failure: null, signal: null, stderr: '', code: 2,
  stdout: JSON.stringify({ diagnostics: [{ code: 'resource-limit', message: 'maxReportBytes limit exceeded' }] }) };

test('incomplete cold command is connected for orderly shutdown and preserves raw evidence', async () => {
  const calls = [], measurements = {};
  const host = { cli: async () => incomplete, connect: async mode => calls.push(mode), close: async () => calls.push('close') };
  await assert.rejects(withResident(host, () => coldCommand(host, { owners: 500 }, measurements)), /maxReportBytes limit exceeded/);
  assert.deepEqual(calls, ['never', 'close']);
  assert.equal(measurements.failedCommands[0].stdout, incomplete.stdout);
});

test('original command, connection and cleanup failures all survive worker formatting', async () => {
  const measurements = {};
  let closes = 0;
  const host = { cli: async () => incomplete, connect: async () => { throw new Error('connection unavailable'); },
    close: async () => { closes++; throw new Error('owned daemon survived'); } };
  await assert.rejects(withResident(host, () => coldCommand(host, { owners: 500 }, measurements)), error => {
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

test('successful cold results do not retain raw command output', async () => {
  const measurements = {};
  const complete = { ...incomplete, code: 0, stdout: JSON.stringify({ schemaVersion: 'ramify.analysis/1',
    outcome: { execution: 'completed', check: 'passed', coverage: 'complete' }, summary: { owners: 500, denied: 0 },
    coverage: [], stages: [{ status: 'completed' }] }) };
  const result = await coldCommand({ cli: async () => complete, connect: async () => {} }, { owners: 500 }, measurements);
  assert.equal(result.sample, complete);
  assert.equal(measurements.failedCommands, undefined);
});
