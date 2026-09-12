import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executionIdentity } from './artifact.js';
import { captureObservations } from './observations.js';
import { plan5Instances } from './plan5-instances.js';
import { plan5LiveHandlers } from './plan5-live-cases.js';
import { repositoryRoot } from './plan.js';
import { Assertions } from './runner.js';
import type { InstanceHandler } from './runner.js';

/** Derive membership from the reviewed inventory, so a missing provider cannot
 * silently reduce either the default focused run or automatic registration. */
export function liveInstanceSelection(
  handlers: ReadonlyMap<string, InstanceHandler> = plan5LiveHandlers,
  requested?: readonly string[],
): readonly string[] {
  const required = plan5Instances.filter(instance => instance.iteration === 11).map(instance => instance.id);
  const ids = requested ?? required;
  assert.ok(ids.length > 0, 'Live instance selection must not be empty');
  assert.equal(new Set(ids).size, ids.length, 'Live instance selection must not contain duplicates');
  for (const id of ids) assert.ok(required.includes(id), `Unknown live instance: ${id}`);
  assert.deepEqual([...handlers.keys()].sort(), [...required].sort(), 'Live providers must match the reviewed inventory');
  return [...ids];
}

/** Focused process evidence using the exact gate handlers. This never credits
 * prerequisite records or invokes the regression runners reserved for Studio. */
export async function runLiveInstances(ids?: readonly string[]) {
  const selected = liveInstanceSelection(plan5LiveHandlers, ids);
  const identity = await executionIdentity(), startedAt = new Date().toISOString();
  const results = [];
  for (const id of selected) {
    const handler = plan5LiveHandlers.get(id)!;
    assert.equal(handler.kind, 'memory');
    const assertions = new Assertions(), started = performance.now();
    process.stdout.write(`Starting ${id}\n`);
    const captured = await captureObservations(async () => {
      try { await handler.run({ instance: plan5Instances.find(instance => instance.id === id)!, assertions }); return null; }
      catch (error) { return error instanceof Error ? error.stack ?? error.message : String(error); }
    });
    const evidence = assertions.finish();
    const result = { id, evidenceKind: 'process', passed: !captured.value && evidence.length > 0 && evidence.every(item => item.status === 'passed'),
      assertions: evidence, error: captured.value, observations: captured.observations, durationMs: performance.now() - started };
    results.push(result);
    process.stdout.write(`${id}: ${result.passed ? 'passed' : 'FAILED'} (${evidence.length} assertions)${result.error ? `\n${result.error}` : ''}\n`);
  }
  const after = await executionIdentity();
  const coherent = identity.sourceSha256 === after.sourceSha256 && identity.buildSha256 === after.buildSha256;
  const receipt = { scope: 'I5-12 focused process instances only; full prerequisite gate and automatic regression remain separate',
    startedAt, completedAt: new Date().toISOString(), identity, after, coherent, passed: coherent && results.every(result => result.passed), results };
  const directory = join(repositoryRoot, '.reference-work/reports');
  await mkdir(directory, { recursive: true });
  const file = join(directory, `iteration11-live-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(receipt) + '\n', { flag: 'wx' });
  process.stdout.write(`Receipt: ${file}\n`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const names = process.argv.slice(2).map(name => `I5-12:${name}`);
  runLiveInstances(names.length ? names : undefined).then(receipt => { process.exitCode = receipt.passed ? 0 : 1; }, error => {
    process.stderr.write(String(error) + '\n'); process.exitCode = 1;
  });
}
