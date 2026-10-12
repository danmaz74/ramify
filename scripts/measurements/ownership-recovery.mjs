import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpus, platform, arch, release, tmpdir, totalmem } from 'node:os';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { materializeSynthetic } from './materialize.ts';
import { measureProcess } from './process-observer.mjs';

const repository = resolve('.');
const executable = join(repository, 'dist/src/ramify');
const destination = join(repository, 'docs/plans/analysis-failure-recovery/evidence/iteration7-measurements.json');
const scratch = await mkdtemp(join(tmpdir(), 'ramify-ownership-measure-'));
const endpoint = join(scratch, 'endpoint');
await mkdir(endpoint, { mode: 0o700 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const buildBytes = await readFile(join(repository, 'dist/runtime-identity.json'));
const launcherBytes = await readFile(executable);
const identity = { runtimeIdentitySha256: digest(buildBytes), launcherSha256: digest(launcherBytes),
  runtimeIdentity: JSON.parse(buildBytes), version: JSON.parse(await readFile(join(repository, 'package.json'))).version };
const result = { schemaVersion: 'ramify.ownership-measurement/1', identity,
  host: { platform: platform(), arch: arch(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(), node: process.version },
  method: { warmupsPerOperation: 1, measuredPairs: 10, order: 'ownership/affected then affected/ownership, alternating',
    memory: '50 ms sampled combined RSS of CLI process and observed descendants; peaks may be missed',
    identity: 'Ownership acquisition input IDs and affected analysis input IDs are separate evidence domains; equality is not asserted',
    stageCounts: 'Ownership structural zero catalog/link/import/dependency stages is verified by FR03 owner tests; CLI ownership has no stage array. Full check stage probe records the corresponding full-analysis workload stages.' },
  workloads: [] };
const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(fraction * values.length) - 1];
async function run(root, operation) {
  const argv = operation === 'ownership' ? ['ownership', '--root', root, '--path', 'module.ramify', '--format', 'json']
    : operation === 'affected' ? ['affected', '--root', root, '--path', 'module.ramify', '--batch', '--format', 'json']
      : ['check', '--root', root, '--batch', '--format', 'json'];
  const observed = await measureProcess(executable, argv, { cwd: root, env: { RAMIFY_ENDPOINT_DIR: endpoint }, timeoutMs: 130_000 });
  assert.equal(observed.failure, null, `${operation}: ${observed.failure}`);
  assert.equal(observed.code, 0, `${operation}: exit ${observed.code}: ${observed.stderr.slice(0, 1000)} ${observed.stdout.slice(0, 1000)}`);
  assert.equal(observed.postExitObservedProcesses, 0);
  assert.deepEqual(await readdir(endpoint), [], `${operation} started a daemon`);
  const document = JSON.parse(observed.stdout);
  const inputId = operation === 'ownership' ? document.inputId : operation === 'affected'
    ? document.revision.inputId : document.inputId;
  assert.equal(typeof inputId, 'string', `${operation}: absent input identity`);
  return { operation, argv, durationMs: observed.durationMs, peakCombinedRssBytes: observed.peakCombinedRssBytes,
    memorySampleCount: observed.samples.length, processCount: observed.processes.length,
    exitCode: observed.code, schemaVersion: document.schemaVersion, inputId,
    ...(operation === 'check' ? { stages: document.stages.map(({ stage, status }) => ({ stage, status })) } : {}) };
}
try {
  const small = join(scratch, 'small'); await mkdir(join(small, 'src'), { recursive: true });
  await writeFile(join(small, 'module.ramify'), 'ramify 1\nroot module small\n');
  await writeFile(join(small, 'src/index.ts'), 'export const value = 1;\n');
  await writeFile(join(small, 'tsconfig.json'), '{"compilerOptions":{"types":[]},"include":["src"]}');
  const synthetic = join(scratch, 'synthetic-100');
  const syntheticFixture = await materializeSynthetic(synthetic, 'S100');
  for (const [name, root] of [['small', small], ['toolkit', repository],
    ['reference', join(repository, 'examples/collection-review')], ['synthetic-100', synthetic]]) {
    const stageProbe = await run(root, 'check');
    const warmups = { ownership: await run(root, 'ownership'), affected: await run(root, 'affected') };
    const samples = { ownership: [], affected: [] };
    for (let pair = 0; pair < 10; pair++) {
      for (const operation of pair % 2 ? ['affected', 'ownership'] : ['ownership', 'affected'])
        samples[operation].push({ pair, ...await run(root, operation) });
    }
    const summary = Object.fromEntries(Object.entries(samples).map(([operation, entries]) => [operation, {
      medianMs: quantile(entries.map(entry => entry.durationMs), 0.5),
      p95Ms: quantile(entries.map(entry => entry.durationMs), 0.95),
      maxSampledRssBytes: Math.max(...entries.map(entry => entry.peakCombinedRssBytes)),
      commandInvocations: entries.length,
    }]));
    result.workloads.push({ name, root, fixture: name === 'synthetic-100' ? syntheticFixture : null,
      stageProbe, warmups, samples, summary,
      medianOwnershipOverAffected: summary.ownership.medianMs / summary.affected.medianMs,
      operations: { ownership: 11, affected: 11, checkStageProbe: 1, daemonStarts: 0 } });
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(`${name}: ownership ${summary.ownership.medianMs.toFixed(1)} ms, affected ${summary.affected.medianMs.toFixed(1)} ms\n`);
  }
  assert.equal(digest(await readFile(join(repository, 'dist/runtime-identity.json'))), identity.runtimeIdentitySha256);
  assert.equal(digest(await readFile(executable)), identity.launcherSha256);
  result.buildStable = true;
  await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
