import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executionIdentity } from './artifact.js';
import { plan1Instances } from './cases.js';
import { focusedPlan1Ids } from './completion-composition.js';
import { evidenceRoots, portableValue } from './portability.js';
import { readReviewedPlan, repositoryRoot } from './plan.js';
import { referenceRuntime } from './runtime.js';
import { verifyInstances } from './runner.js';

export async function runFocusedPlan1(output: string) {
  const endpoint = await mkdtemp('/tmp/rp1f-');
  const previousEndpoint = process.env.RAMIFY_ENDPOINT_DIR;
  process.env.RAMIFY_ENDPOINT_DIR = endpoint;
  const identity = await executionIdentity();
  const startedAt = new Date().toISOString(), started = performance.now();
  const execute = (args: string[]) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun, reject) => {
    const child = spawn(process.execPath, ['dist/src/cli-entry.js', ...args], { cwd: repositoryRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', bytes => stdout += bytes); child.stderr.on('data', bytes => stderr += bytes);
    child.once('error', reject); child.once('close', code => resolveRun({ code, stdout, stderr }));
  });
  let report, stop, status;
  try {
    const plan = readReviewedPlan();
    const ids = new Set(focusedPlan1Ids);
    const members = plan.members.filter(member => ids.has(member[0]));
    assert.equal(members.length, ids.size);
    report = await verifyInstances({ plan: { ...plan, members }, records: plan1Instances.filter(item => ids.has(item.id)),
      runtime: referenceRuntime, workRoot: resolve(repositoryRoot, 'examples/collection-review/.reference-work'), preserveOnFailure: true });
  } finally {
    stop = await execute(['daemon', 'stop']); status = await execute(['daemon', 'status', '--format', 'json']);
    if (stop.code === 0) await rm(endpoint, { recursive: true, force: true });
    if (previousEndpoint === undefined) delete process.env.RAMIFY_ENDPOINT_DIR; else process.env.RAMIFY_ENDPOINT_DIR = previousEndpoint;
  }
  const after = await executionIdentity();
  assert.equal(after.sourceSha256, identity.sourceSha256, 'Source changed during focused execution');
  assert.equal(after.buildSha256, identity.buildSha256, 'Build changed during focused execution');
  const artifact = portableValue({ kind: 'plan1-focused-evidence', identity, platform: process.platform, selectedIds: focusedPlan1Ids,
    startedAt, completedAt: new Date().toISOString(), durationMs: performance.now() - started,
    report: { ...report, planComplete: false }, cleanup: { stop, status } }, await evidenceRoots());
  await writeFile(output, JSON.stringify(artifact) + '\n', { flag: 'wx' });
  assert.equal(stop.code, 0); assert.equal(status.code, 0); assert.equal(JSON.parse(status.stdout).running, false);
  assert.equal(report?.passed, true, JSON.stringify(report?.instances.filter(item => item.status !== 'passed')));
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Usage: plan1-focused.ts OUTPUT');
  const result = await runFocusedPlan1(process.argv[2]);
  console.log(JSON.stringify({ output: process.argv[2], summary: result.report.summary, identity: result.identity, durationMs: result.durationMs }));
}
