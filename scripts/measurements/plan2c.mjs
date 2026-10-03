#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { packageRoot, pollDaemonStatus, runCommand } from './plan2a-fixtures.mjs';
import { specifiedArchitectLimits } from './plan2b-views.ts';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.ts';
import { createDefaultTagRegistry } from '../../subs/analysis/subs/model/src/index.ts';
import { limits as batchLimits } from '../../src/batch.ts';

const evidenceRoot = join(packageRoot, 'docs/plans/iteration-2c-module-measurements/evidence');
const output = resolve(process.argv[2] ?? join(evidenceRoot, 'plan2c-measurements.json'));
const documentOutput = join(dirname(output), 'toolkit-measure.json');
const consistencyOutput = join(dirname(output), 'toolkit-consistency.json');
const executable = join(packageRoot, 'dist/src/ramify');
const terms = ['revision', 'project', 'session', 'publish', 'watch', 'create'];
const limits = { architectSessionQueryMs: 15_000, architectCommandMs: 90_000,
  architectBytes: 8 * 1024 ** 2, unchangedRepeatBytes: 0, hitLines: 200, hitBytes: 64 * 1024 };

const round = value => Math.round(value * 10) / 10;
const command = async (args, endpoint, timeoutMs = 180_000) => runCommand(executable, args,
  { cwd: packageRoot, env: { RAMIFY_ENDPOINT_DIR: endpoint }, timeoutMs });
const parseArchitect = result => {
  const match = /^Root: .+\nMaterialized: revision (\d+); (\d+) target\(s\), (\d+) entries, (\d+) bytes written, (\d+) unchanged\nArchitect view: \.ramify-architect, (\d+) modules, (\d+) records, dependencies (measured|unavailable \([a-z-]+\))\n$/.exec(result.stdout);
  assert.ok(match, `Unexpected architect output: ${result.stdout}\n${result.stderr}`);
  return { exitCode: result.code, durationMs: round(result.durationMs), revisionSequence: Number(match[1]), targets: Number(match[2]),
    entries: Number(match[3]), bytesWritten: Number(match[4]), unchanged: Number(match[5]), modules: Number(match[6]),
    records: Number(match[7]), dependencies: match[8], stderr: result.stderr };
};

function addFileSize(target, file) {
  const bucket = file.area === 'tests' ? target.tests : target.production;
  if (file.kind === 'source') { bucket.sourceFiles++; bucket.sourceBytes += file.bytes; }
  else if (file.kind === 'resource') { bucket.resourceFiles++; bucket.resourceBytes += file.bytes; }
  else { target.documentation.files++; target.documentation.bytes += file.bytes; }
}

async function consistency(document) {
  const mismatches = [];
  const root = document.modules.find(module => module.parent === null);
  assert.ok(root, 'No root module in measure document');
  const summed = { production: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
    tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 }, documentation: { files: 0, bytes: 0 },
    ...(document.views === 'measured' ? { views: { ordinaryBytes: 0, testsBytes: 0 } } : {}) };
  for (const module of document.modules) {
    for (const area of ['production', 'tests']) for (const field of ['sourceFiles', 'sourceBytes', 'resourceFiles', 'resourceBytes']) summed[area][field] += module.exact[area][field];
    for (const field of ['files', 'bytes']) summed.documentation[field] += module.exact.documentation[field];
    if (summed.views && module.exact.views) for (const field of ['ordinaryBytes', 'testsBytes']) summed.views[field] += module.exact.views[field];
  }
  if (JSON.stringify(summed) !== JSON.stringify(root.subtree)) mismatches.push({ kind: 'root-subtree', expected: summed, actual: root.subtree });
  const reconstructed = new Map(document.modules.map(module => [module.id, { production: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
    tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 }, documentation: { files: 0, bytes: 0 } }]));
  let diskBytes = 0;
  for (const file of document.files) {
    const actual = (await stat(join(document.root, file.path))).size;
    diskBytes += actual;
    if (actual !== file.bytes) mismatches.push({ kind: 'file-bytes', path: file.path, expected: file.bytes, actual });
    const bucket = reconstructed.get(file.owner);
    if (!bucket) mismatches.push({ kind: 'unknown-owner', path: file.path, owner: file.owner });
    else if (file.kind === 'documentation') addFileSize(bucket, file);
    else {
      const measured = document.modules.find(module => module.id === file.owner);
      const ordinaryIsProduction = measured && measured.exact.production.sourceFiles + measured.exact.production.resourceFiles > 0;
      addFileSize(file.area === 'ordinary' && !ordinaryIsProduction ? { ...bucket, tests: bucket.tests, production: bucket.tests } : bucket, file);
    }
  }
  for (const module of document.modules) {
    const actual = reconstructed.get(module.id);
    const expected = { production: module.exact.production, tests: module.exact.tests, documentation: module.exact.documentation };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push({ kind: 'module-exact', module: module.id, expected, actual });
  }
  return { schemaVersion: 'ramify.plan2c-consistency/1', revision: document.revision, modules: document.modules.length,
    files: document.files.length, diskBytes, root: root.id, summedExact: summed, rootSubtree: root.subtree,
    checked: { exactSumEqualsRootSubtree: !mismatches.some(item => item.kind === 'root-subtree'),
      fileBytesEqualDisk: !mismatches.some(item => item.kind === 'file-bytes'),
      fileRecordsReconstructInventoryBuckets: !mismatches.some(item => item.kind === 'module-exact') }, mismatches };
}

async function viewSize(root) {
  let files = 0, bytes = 0;
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else { files++; bytes += (await stat(target)).size; }
    }
  }
  await walk(join(root, '.ramify-architect'));
  return { files, bytes };
}

async function hitCost(root) {
  const result = {};
  for (const term of terms) {
    const run = await runCommand('rg', ['-n', '-i', term, '.ramify-architect/'], { cwd: root, env: { RIPGREP_CONFIG_PATH: '' }, timeoutMs: 30_000 });
    assert.ok(run.code === 0 || run.code === 1, run.stderr);
    result[term] = { lines: run.stdout.split('\n').filter(Boolean).length, bytes: Buffer.byteLength(run.stdout),
      withinDeferredThresholds: run.stdout.split('\n').filter(Boolean).length <= limits.hitLines && Buffer.byteLength(run.stdout) <= limits.hitBytes };
  }
  return result;
}

async function architectSessionQuery() {
  const openedAt = performance.now();
  const opened = await openRetainedSession({ project: { cwd: packageRoot, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(),
    capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access',
      'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'],
    limits: batchLimits, session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 1024,
      maxRetainedFactBytes: 96 * 1024 ** 2 } });
  assert.equal(opened.status, 'opened', 'The architect query measurement session did not open');
  const session = opened.session;
  const query = async () => {
    const started = performance.now();
    const outcome = await session.architectView({ sequence: opened.revision.sequence, ...specifiedArchitectLimits });
    assert.equal(outcome.status, 'projected', `Architect query answered ${outcome.status}`);
    return { durationMs: round(performance.now() - started), projectionBytes: outcome.projection.bytes,
      modules: outcome.projection.modules.length, symbols: outcome.projection.symbols.length, tests: outcome.projection.tests.length };
  };
  try {
    const hot = [await query(), await query(), await query()];
    await session.releaseCompiler();
    const afterRelease = await query();
    return { openMs: round(performance.now() - openedAt), hot, afterRelease };
  } finally { await session.dispose(); }
}

async function stop(endpoint) {
  const stopped = await command(['daemon', 'stop', '--format', 'json'], endpoint, 30_000);
  const status = await command(['daemon', 'status', '--format', 'json'], endpoint, 30_000);
  return { stopExitCode: stopped.code, runningAfterStop: JSON.parse(status.stdout).running };
}

await mkdir(dirname(output), { recursive: true });
const endpointRoot = await mkdtemp('/tmp/rp2c-measure-');
const endpoint = join(endpointRoot, 'endpoint');
await mkdir(endpoint, { mode: 0o700 });
const evidence = { schemaVersion: 'ramify.plan2c-measurements/1', measuredAt: new Date().toISOString(),
  source: { root: packageRoot, gitHead: (await runCommand('git', ['rev-parse', 'HEAD'], { cwd: packageRoot })).stdout.trim(),
    trackedChanges: (await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: packageRoot })).stdout.split('\n').filter(Boolean).length },
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(), logicalCpus: cpus().length,
    cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(), concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'not annotated' },
  limits, commands: {}, memory: null, toolkit: null, hitCost: null, priorPlan2b: null, policy: null, failures: [] };
let measureMemory = null, architectMemory = null;
try {
  const measurePoll = pollDaemonStatus(executable, { RAMIFY_ENDPOINT_DIR: endpoint }, packageRoot);
  const cold = await command(['measure', '--format', 'json'], endpoint);
  assert.equal(cold.code, 0, cold.stderr || cold.stdout);
  const document = JSON.parse(cold.stdout);
  assert.equal(document.schema, 'ramify.measure/1');
  const checked = await consistency(document);
  assert.deepEqual(checked.mismatches, []);
  const warm = await command(['measure', '--format', 'json'], endpoint);
  assert.equal(warm.code, 0, warm.stderr || warm.stdout);
  const warmDocument = JSON.parse(warm.stdout);
  assert.deepEqual({ ...warmDocument, revision: document.revision }, document);
  measureMemory = measurePoll.stop();
  await writeFile(documentOutput, JSON.stringify(document, null, 2) + '\n');
  await writeFile(consistencyOutput, JSON.stringify(checked, null, 2) + '\n');
  const architectPoll = pollDaemonStatus(executable, { RAMIFY_ENDPOINT_DIR: endpoint }, packageRoot);
  const architect = parseArchitect(await command(['materialize', '--view', 'architect'], endpoint));
  const size = await viewSize(packageRoot);
  const repeat = parseArchitect(await command(['materialize', '--view', 'architect'], endpoint));
  architectMemory = architectPoll.stop();
  const sessionQuery = await architectSessionQuery();
  evidence.commands = { measureAfterNewDaemon: { exitCode: cold.code, durationMs: round(cold.durationMs), stderr: cold.stderr },
    measureWarm: { exitCode: warm.code, durationMs: round(warm.durationMs), stderr: warm.stderr },
    architectSessionQuery: sessionQuery, architect, architectRepeat: repeat };
  evidence.toolkit = { revision: document.revision, modules: document.modules.length, files: document.files.length,
    outsideModuleFiles: document.outsideModuleFiles.length, views: document.views, architectView: size,
    measureDocument: relative(packageRoot, documentOutput), consistency: relative(packageRoot, consistencyOutput) };
  evidence.hitCost = await hitCost(packageRoot);
  const prior = JSON.parse(await readFile(join(packageRoot, 'docs/plans/iteration-2b-generated-views/evidence/plan2b-measurements.json'), 'utf8'));
  evidence.priorPlan2b = { note: 'Plan 2B thresholds were deferred evidence and were not passing gates.',
    toolkit: Object.fromEntries(terms.map(term => [term, prior.workloads?.toolkit?.hitCost?.[term] ?? null])) };
  const queryMaximum = Math.max(...sessionQuery.hot.map(query => query.durationMs), sessionQuery.afterRelease.durationMs);
  const holds = queryMaximum <= limits.architectSessionQueryMs && architect.durationMs <= limits.architectCommandMs && size.bytes <= limits.architectBytes
    && repeat.bytesWritten === limits.unchangedRepeatBytes;
  evidence.policy = { selected: holds ? 'measure' : 'omit', fixed: true,
    reason: holds ? 'The measured architect session query, whole command, published size, and unchanged repeat remain within every agreed MM12 budget.'
      : 'At least one agreed architect budget was exceeded; omit avoids architect-only view rendering while measure queries still attempt it.',
    budgets: { architectSessionQuery: { measured: queryMaximum, limit: limits.architectSessionQueryMs, holds: queryMaximum <= limits.architectSessionQueryMs },
      architectCommand: { measured: architect.durationMs, limit: limits.architectCommandMs, holds: architect.durationMs <= limits.architectCommandMs },
      architectSize: { measured: size.bytes, limit: limits.architectBytes, holds: size.bytes <= limits.architectBytes },
      unchangedRepeat: { measured: repeat.bytesWritten, limit: limits.unchangedRepeatBytes, holds: repeat.bytesWritten === limits.unchangedRepeatBytes } } };
  assert.equal(evidence.policy.selected, 'measure', 'The current build default is measure; a measured budget failure requires a reviewed source/configuration change');
} catch (error) {
  evidence.failures.push(error.stack ?? String(error));
} finally {
  evidence.memory = { measure: measureMemory, architect: architectMemory,
    note: '100 ms daemon-status samples; combined values sum daemon, retained-session worker and compiler RSS/heap and may miss shorter spikes.' };
  try { evidence.daemonStop = await stop(endpoint); } catch (error) { evidence.failures.push(`stop: ${error.stack ?? String(error)}`); }
  await rm(endpointRoot, { recursive: true, force: true });
  evidence.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
}
process.stdout.write(JSON.stringify({ output, documentOutput, consistencyOutput, policy: evidence.policy?.selected ?? null,
  failures: evidence.failures.length }, null, 2) + '\n');
process.exitCode = evidence.failures.length ? 1 : 0;
