#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, release, totalmem, cpus } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { budgets, fingerprint, median, packageRoot, sha256 } from './common.mjs';

if (process.argv.includes('--help')) {
  process.stdout.write('Usage: node scripts/measurements/run.mjs [--phase all|setup|cold|repeated] [--workload all|reference|hundred-owners] [--output FILE]\nBudgets, sample counts and fixtures are fixed by scope.md. Build first. JSON is persisted on success and failure.\n');
  process.exit(0);
}
const args = process.argv.slice(2), options = new Map();
for (let index = 0; index < args.length; index += 2) {
  const [key, value] = args.slice(index, index + 2);
  assert.ok(['--phase', '--workload', '--output'].includes(key) && value && !options.has(key), `Invalid option ${key}`);
  options.set(key, value);
}
const phase = options.get('--phase') ?? 'all', workload = options.get('--workload') ?? 'all';
assert.ok(['all', 'setup', 'cold', 'repeated'].includes(phase));
assert.ok(['all', 'reference', 'hundred-owners'].includes(workload));
assert.ok(['linux', 'darwin'].includes(platform()), 'Measurement recipe supports Linux and macOS');
const scratchParent = join(packageRoot, '.reference-work');
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(join(scratchParent, 'measurement-'));
const output = resolve(options.get('--output') ?? join(scratchParent, 'reports', `measurements-${new Date().toISOString().replaceAll(':', '-')}.json`));
const replacements = [[scratch, '<measurement-work>'], [packageRoot, '<package>'], [realpathSync(join(packageRoot, 'node_modules')), '<dependencies>']].sort(([a], [b]) => b.length - a.length);
function portable(value) {
  if (typeof value === 'string') return replacements.reduce((text, [from, to]) => text.replaceAll(from, to), value);
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]));
  return value;
}
function pathsUnder(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink() || ['node_modules', 'dist', '.reference-work', '.git'].includes(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? pathsUnder(path) : entry.isFile() ? [path] : [];
  });
}
function treeIdentity(root) {
  const entries = pathsUnder(root).map(path => [relative(root, path), sha256(readFileSync(path))]);
  return { files: entries.length, sha256: sha256(JSON.stringify(entries)) };
}
function referenceIdentity(root) {
  const all = pathsUnder(root), owners = all.filter(path => path.endsWith('/module.ramify')).map(dirname);
  const selected = new Set(['package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts'].map(path => join(root, path)));
  for (const owner of owners) {
    selected.add(join(owner, 'module.ramify')); selected.add(join(owner, 'README.md'));
    for (const path of pathsUnder(join(owner, 'src'))) selected.add(path);
  }
  const entries = [...selected].map(path => [relative(root, path), readFileSync(path, 'utf8')]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { files: entries.length, bytes: entries.reduce((sum, [, text]) => sum + Buffer.byteLength(text), 0), contentMapSha256: sha256(JSON.stringify(entries)) };
}
const report = {
  schemaVersion: 'ramify.batch-measurements/1', measuredAt: new Date().toISOString(),
  command: ['node', 'scripts/measurements/run.mjs', ...args], phase, workload, passed: false,
  environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch(),
    logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem() },
  dependencies: Object.fromEntries(['typescript', 'tsx'].map(name => [name, JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')).version])),
  recipe: { budgets, rss: 'POSIX ps -A -o pid=,ppid=,pgid=,rss=,comm= at 50ms target intervals; KiB converted to bytes; summed process-tree RSS conservatively counts shared mappings more than once',
    samplingLimit: 'Sampled maxima can miss peaks shorter than the sampling interval; sample elapsed times retain observed scheduling gaps',
    cold: 'Fresh compiled CLI subprocess, whole-project JSON check; elapsed time includes startup and output drain, excludes result parsing; OS page cache is not flushed',
    repeated: 'Fresh dedicated --expose-gc process per workload; five warmups followed by 25 create/check/dispose cycles; retain all 25 frozen plain reports; two GC calls between event-loop turns after every disposal',
    setup: 'Existing memory-probe.mjs, three fresh processes each for empty and real session; completed analysis is readiness, report/session retained until disposal',
    unsupported: ['resident daemon', 'MCP', 'web', 'multi-context history', 'queues', 'leases', '500/1000-owner workloads'],
  },
  inputs: { manifests: ['package.json', 'package-lock.json'].map(path => fingerprint(join(packageRoot, path))),
    fixtureGenerator: fingerprint(join(packageRoot, 'scripts/probes/fixtures/hundred-owners.ts')),
    measurementScripts: pathsUnder(join(packageRoot, 'scripts/measurements')).filter(path => /\.(?:mjs|ts)$/.test(path)).map(fingerprint),
    memoryProbe: fingerprint(join(packageRoot, 'scripts/memory-probe.mjs')), build: treeIdentity(join(packageRoot, 'dist')) },
  workloads: [],
};
let cancelledBy = null, cancelActive = null;
const cancel = signal => { cancelledBy ??= signal; cancelActive?.(`Measurement interrupted by ${signal}`); };
const onInterrupt = () => cancel('SIGINT'), onTerminate = () => cancel('SIGTERM');
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);

function persist() {
  const json = JSON.stringify(portable(report), null, 2) + '\n';
  assert.ok(Buffer.byteLength(json) <= 32 * 1024 ** 2, 'Measurement report exceeds 32 MiB; evidence cannot be silently truncated');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, json);
}
function parseOutput(text, destination, key) {
  try { destination[key] = JSON.parse(text); return destination[key]; }
  catch (error) {
    destination.parseFailure = { message: error.message, bytes: Buffer.byteLength(text), sha256: sha256(text),
      prefix: text.slice(0, 4096), prefixOnly: text.length > 4096 };
    persist();
    throw new Error(`Measurement ${key} output was not valid JSON: ${error.message}`);
  }
}
function ps() {
  const listing = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,rss=,comm='], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 ** 2 });
  assert.equal(listing.status, 0, listing.error?.message ?? listing.stderr);
  return listing.stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    assert.ok(match, `Cannot parse POSIX ps row: ${line}`);
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), rssBytes: Number(match[4]) * 1024, command: match[5] };
  });
}

/** Parent observes itself and every helper/native descendant without a runtime hook. */
async function measured(executable, argv, env = {}, timeoutMs = 130000) {
  assert.equal(cancelledBy, null, `Measurement interrupted by ${cancelledBy}`);
  const started = performance.now();
  const child = spawn(executable, argv, { cwd: packageRoot, detached: true,
    env: { ...process.env, NODE_OPTIONS: '', NO_COLOR: '1', FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
  const chunks = [[], [], []], samples = [], observed = new Set([child.pid]), groups = new Set([child.pid]), perProcess = new Map();
  let bytes = 0, failure = null;
  const stop = message => {
    failure ??= message;
    // Stop the owned parent first so it cannot start another detached helper
    // between the last periodic sample and process-group cleanup.
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGSTOP'); } catch (error) { if (error.code !== 'ESRCH') failure += `; ${error.message}`; }
    }
    try {
      const rows = ps(); let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if ((observed.has(row.ppid) || groups.has(row.pgid)) && !observed.has(row.pid)) {
          observed.add(row.pid); groups.add(row.pgid); changed = true;
        }
      }
    } catch (error) { failure += `; process cleanup observation failed: ${error.message}`; }
    for (const group of groups) if (group) {
      try { process.kill(-group, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  cancelActive = stop;
  child.once('error', error => { failure = error.message; });
  [child.stdout, child.stderr, child.stdio[3]].forEach((pipe, index) => pipe.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 32 * 1024 ** 2) stop('Measurement subprocess output exceeds 32 MiB');
    else chunks[index].push(chunk);
    if (index === 1 && argv.includes('scripts/measurements/repeated.mjs')) process.stderr.write(chunk);
  }));
  const sample = () => {
    try {
      const rows = ps(); let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if ((observed.has(row.ppid) || groups.has(row.pgid)) && !observed.has(row.pid)) { observed.add(row.pid); groups.add(row.pgid); changed = true; }
      }
      const processes = rows.filter(row => observed.has(row.pid));
      for (const item of processes) {
        const prior = perProcess.get(item.pid);
        perProcess.set(item.pid, { ...item, role: item.pid === child.pid ? 'parent' : item.ppid === child.pid ? 'helper' : 'native-or-helper-descendant',
          peakRssBytes: Math.max(item.rssBytes, prior?.peakRssBytes ?? 0) });
      }
      samples.push({ elapsedMs: performance.now() - started, combinedRssBytes: processes.reduce((total, item) => total + item.rssBytes, 0),
        processes: processes.map(({ pid, ppid, pgid, rssBytes }) => ({ pid, ppid, pgid, rssBytes })) });
    } catch (error) { stop(error.message); }
  };
  sample();
  const timer = setInterval(sample, budgets.sampleIntervalMs);
  const deadline = setTimeout(() => stop(`Measurement subprocess exceeded ${timeoutMs} ms`), timeoutMs);
  const ending = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const durationMs = performance.now() - started;
  clearInterval(timer); clearTimeout(deadline);
  const remaining = ps().filter(row => observed.has(row.pid) || groups.has(row.pgid));
  if (remaining.length) stop(`Measurement left ${remaining.length} observed descendant processes alive`);
  cancelActive = null;
  const [stdout, stderr, data] = chunks.map(list => Buffer.concat(list).toString('utf8'));
  return { ...ending, durationMs, failure, stdout, stderr, data,
    peakCombinedRssBytes: Math.max(0, ...samples.map(sample => sample.combinedRssBytes)),
    processes: [...perProcess.values()], samples, postExitObservedProcesses: remaining.length };
}

try {
  const selected = workload === 'all' ? ['reference', 'hundred-owners'] : [workload];
  for (const name of selected) {
    const root = name === 'reference' ? join(packageRoot, 'examples/collection-review') : join(scratch, 'hundred-owners');
    let fixture;
    if (name === 'hundred-owners') {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/measurements/materialize.ts', root],
        { cwd: packageRoot, encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_OPTIONS: '' } });
      assert.equal(result.status, 0, result.error?.message ?? result.stderr); fixture = JSON.parse(result.stdout);
    } else fixture = referenceIdentity(root);
    const ownerCount = name === 'reference' ? 15 : 100;
    const result = { name, root, expectedOwners: ownerCount, fixture, passed: false };
    report.workloads.push(result); persist();
    if (phase === 'all' || phase === 'setup') {
      process.stderr.write(`Measuring ${name}: setup (three fresh samples per case)\n`);
      const child = await measured(process.execPath, ['scripts/memory-probe.mjs', '--samples', '3', '--setup', 'scripts/measurements/session-setup.mjs'],
        { RAMIFY_MEASUREMENT_ROOT: root, RAMIFY_MEASUREMENT_OWNERS: String(ownerCount) }, 190000);
      const { stdout, data, ...measurements } = child;
      result.setup = { ...measurements, stdoutBytes: Buffer.byteLength(stdout), stdoutSha256: sha256(stdout), report: null };
      persist();
      parseOutput(stdout, result.setup, 'report');
      assert.equal(child.code, 0, child.stderr); assert.equal(child.failure, null);
      persist();
    }
    if (phase === 'all' || phase === 'cold') {
      result.cold = { samples: [] };
      for (let index = 0; index < budgets.coldSamples; index++) {
        process.stderr.write(`Measuring ${name}: cold ${index + 1}/${budgets.coldSamples}\n`);
        const child = await measured(process.execPath, ['dist/src/cli-entry.js', 'check', '--root', root, '--format', 'json']);
        const { stdout, data, ...measurements } = child;
        const sample = { ...measurements, stdoutBytes: Buffer.byteLength(stdout), stdoutSha256: sha256(stdout),
          inputId: null, outcome: null, summary: null, diagnostics: [], coverage: [] };
        result.cold.samples.push(sample);
        persist();
        const parsedHolder = {};
        let parsed;
        try { parsed = parseOutput(stdout, parsedHolder, 'report'); }
        catch (error) { sample.parseFailure = parsedHolder.parseFailure; persist(); throw error; }
        Object.assign(sample, { inputId: parsed.inputId, outcome: parsed.outcome, summary: parsed.summary,
          diagnostics: parsed.diagnostics, coverage: parsed.coverage, request: parsed.request,
          scope: parsed.scope, capabilities: parsed.capabilities, stages: parsed.stages });
        persist();
        assert.equal(child.code, 0, child.stderr || JSON.stringify(parsed?.diagnostics)); assert.equal(child.failure, null);
        assert.equal(parsed.summary.owners, ownerCount);
        assert.deepEqual(parsed.outcome, { execution: 'completed', check: 'passed', coverage: 'complete' });
        assert.ok(child.processes.some(item => item.role === 'helper'), 'Peak sample must observe the compiler helper');
        assert.ok(child.processes.some(item => item.role === 'native-or-helper-descendant'), 'Peak sample must observe the native compiler');
      }
      result.cold.medianMs = median(result.cold.samples.map(sample => sample.durationMs));
      result.cold.peakCombinedRssBytes = Math.max(...result.cold.samples.map(sample => sample.peakCombinedRssBytes));
      result.cold.passed = result.cold.medianMs <= budgets[name].medianColdMs && result.cold.peakCombinedRssBytes <= budgets[name].peakRssBytes;
      persist();
    }
    if (phase === 'all' || phase === 'repeated') {
      process.stderr.write(`Measuring ${name}: repeated (${budgets.warmups} warmups + ${budgets.cycles} retained-report cycles)\n`);
      const child = await measured(process.execPath, ['--expose-gc', 'scripts/measurements/repeated.mjs', root, String(ownerCount)], {}, 65 * 60000);
      const { stdout, data, ...measurements } = child;
      result.repeated = { ...measurements, stdout, dataBytes: Buffer.byteLength(data), dataSha256: sha256(data), result: null };
      persist();
      parseOutput(data, result.repeated, 'result');
      persist();
      assert.equal(child.failure, null);
      // Budget failures remain in the report and do not prevent measuring the other workload.
      assert.ok(child.code === 0 || result.repeated.result, child.stderr);
    }
    if (name === 'reference') assert.deepEqual(referenceIdentity(root), fixture, 'Reference fixture changed during measurement');
    result.passed = (!result.cold || result.cold.passed) && (!result.repeated || (result.repeated.code === 0 && result.repeated.result.passed));
    persist();
  }
  assert.deepEqual(treeIdentity(join(packageRoot, 'dist')), report.inputs.build, 'Build changed during measurement');
  report.passed = report.workloads.every(result => result.passed);
} catch (error) { report.failure = error.stack ?? error.message; }
finally {
  report.completedAt = new Date().toISOString();
  if (cancelledBy) { report.cancelledBy = cancelledBy; report.passed = false; }
  try { persist(); } finally {
    rmSync(scratch, { recursive: true, force: true });
    process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
  }
}
process.stdout.write(`${output}\n`);
if (!report.passed) process.exitCode = 1;
