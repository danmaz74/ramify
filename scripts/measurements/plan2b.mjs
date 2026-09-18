#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { installedCommand, packageRoot, pollDaemonStatus, runCommand } from './plan2a-fixtures.mjs';
import { plan2aDependencies } from './plan2a-inputs.mjs';
import { materializeSynthetic } from './materialize.ts';
import { copyProject, readViewTree, specifiedArchitectLimits, withoutRevision } from '../reference-harness/plan2b-cases.ts';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.ts';
import { limits as batchLimits } from '../../src/batch.ts';
import { dependencyWait } from '../../subs/daemon/src/service.ts';
import { residentPublishLimits } from '../../src/resident-assembly.ts';

/**
 * Plan 2B (`ramify materialize --view architect`) measurements for AV32 and
 * AV33, on the installed CLI and the real daemon. Each workload owns its
 * isolated project copy and its `RAMIFY_ENDPOINT_DIR` under `/tmp`, runs every
 * command from the project root, and stops its daemon in `finally`.
 *
 * Budgets come from the plan's resource budgets. A measured value above a
 * budget is recorded as exceeded and never retried toward a better number;
 * the report's `budgets` list is the evidence the plan's decision reads.
 */

const knownWorkloads = ['reference', 'toolkit', 'synthetic-100', 'session-query', 'mixed-invocation', 'open-with-view'];
const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Usage: node --import tsx scripts/measurements/plan2b.mjs [--output FILE] [--workload all|' + knownWorkloads.join('|') + ']\n'
    + 'Materializes the architect view of the reference project, the toolkit and S100 through the installed CLI, measures hit cost, sizes, latency and daemon memory, and records every budget with its measured value.\n');
  process.exit(0);
}
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert.ok(['--output', '--workload'].includes(args[index]) && args[index + 1] && !options.has(args[index]), 'Expected --output FILE and/or --workload NAME');
  options.set(args[index], args[index + 1]);
}
const selected = options.get('--workload') ?? 'all';
assert.ok(selected === 'all' || knownWorkloads.includes(selected), `Unknown plan2b workload: ${selected}`);
assert.ok(['linux', 'darwin'].includes(platform()), 'Linux or macOS required');
const output = resolve(options.get('--output') ?? join(packageRoot, 'docs/plans/iteration-2b-generated-views/evidence',
  selected === 'all' ? 'plan2b-measurements.json' : `plan2b-measurements-${selected}.json`));

/** The plan's resource budgets. */
const budget = {
  sessionQueryMs: 15_000, wholeCommandMs: 90_000, viewBytes: 8 * 1024 ** 2,
  maxProjectionBytes: 64 * 1024 ** 2, maxArchitectBytes: 64 * 1024 ** 2,
  waitIntervalMs: 250, waitLimitMs: 125_000,
  hitLines: 200, hitBytes: 64 * 1024, meanBehaviorCharacters: 300,
};
const terms = ['revision', 'project', 'session', 'publish', 'watch', 'create'];
const viewName = '.ramify-architect';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
const round = value => value === null || value === undefined ? value : Math.round(value * 10) / 10;
const characters = text => [...text].length;

const report = {
  schemaVersion: 'ramify.plan2b-measurements/1', measuredAt: new Date().toISOString(),
  command: ['node', '--import', 'tsx', 'scripts/measurements/plan2b.mjs', ...args],
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(), logicalCpus: cpus().length,
    cpuModel: cpus()[0]?.model, totalMemoryBytes: totalmem(),
    concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'Not annotated; other sessions\' daemons may be running on this host.' },
  source: null, dependencies: plan2aDependencies(), client: null,
  sampling: { intervalMs: 100, source: '`ramify daemon status --format json` polled while the workload runs; combined RSS sums the daemon, its worker and its compiler; sampled peaks can miss spikes shorter than the interval' },
  hitCost: { command: 'rg -n -i <term> .ramify-architect/ from the project root, RIPGREP_CONFIG_PATH unset', terms,
    thresholds: { lines: budget.hitLines, bytes: budget.hitBytes, bytesNote: '64 KB read as 65,536 bytes; every exceeded value also exceeds 64,000' } },
  configured: null, workloads: {}, budgets: [], failures: [],
};

async function persist() { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }

async function gitHead() {
  const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: packageRoot, timeoutMs: 10_000 });
  const dirty = await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: packageRoot, timeoutMs: 10_000 });
  return { commit: head.stdout.trim(), trackedChanges: dirty.stdout.split('\n').filter(Boolean).length };
}

/** An owned endpoint for one workload. Every command runs from `cwd` unless given. */
async function ownedDaemon(executable, cwd) {
  const directory = await realpath(await mkdtemp('/tmp/rp2b-m-'));
  const endpoint = join(directory, 'ep');
  await mkdir(endpoint, { mode: 0o700 });
  const env = { RAMIFY_ENDPOINT_DIR: endpoint };
  const run = (commandArgs, at = cwd, timeoutMs = 300_000) => runCommand(executable, commandArgs, { cwd: at, env, timeoutMs });
  const status = async () => {
    const result = await run(['daemon', 'status', '--format', 'json'], cwd, 30_000);
    const parsed = JSON.parse(result.stdout);
    return parsed.running ? parsed.status : null;
  };
  const stop = async () => {
    const before = await status().catch(() => null);
    const stopped = await run(['daemon', 'stop', '--format', 'json'], cwd, 20_000);
    const after = await run(['daemon', 'status', '--format', 'json'], cwd, 20_000);
    const pid = before?.pid ?? null;
    const deadline = performance.now() + 10_000;
    const alive = candidate => { try { process.kill(candidate, 0); return true; } catch { return false; } };
    while (pid && alive(pid) && performance.now() < deadline) await delay(50);
    const evidence = { pid, stopCode: stopped.code, running: JSON.parse(after.stdout).running, pidAlive: pid ? alive(pid) : false };
    await rm(directory, { recursive: true, force: true });
    return evidence;
  };
  return { endpoint, env, run, status, stop };
}

const summary = /^Root: .+\nMaterialized: revision (\d+); (\d+) target\(s\), (\d+) entries, (\d+) bytes written, (\d+) unchanged\n(?:Architect view: \.ramify-architect, (\d+) modules, (\d+) records, dependencies (measured|unavailable \([a-z-]+\))\n)?$/;
function parsed(result) {
  const match = summary.exec(result.stdout);
  return { code: result.code, durationMs: round(result.durationMs), stderr: result.stderr.slice(0, 2000),
    ...(match ? { revision: Number(match[1]), targets: Number(match[2]), entries: Number(match[3]), bytesWritten: Number(match[4]),
      unchanged: Number(match[5]), ...(match[6] ? { modules: Number(match[6]), records: Number(match[7]), dependencies: match[8] } : {}) } : { stdout: result.stdout.slice(0, 2000) }) };
}

/** Files, bytes and record lengths per file kind. */
function viewMetrics(files) {
  const kinds = {};
  let largestBehavior = { path: null, bytes: 0 };
  for (const [path, text] of files) {
    const kind = path.split('/').pop();
    const entry = kinds[kind] ??= { files: 0, bytes: 0, records: 0, recordCharacters: 0, maxRecordCharacters: 0 };
    const bytes = Buffer.byteLength(text);
    entry.files++; entry.bytes += bytes;
    if (kind.endsWith('.jsonl')) {
      for (const line of text.split('\n').filter(Boolean)) {
        const length = characters(line);
        entry.records++; entry.recordCharacters += length; entry.maxRecordCharacters = Math.max(entry.maxRecordCharacters, length);
      }
    }
    if (kind === 'behavior.jsonl' && bytes > largestBehavior.bytes) largestBehavior = { path, bytes };
  }
  for (const entry of Object.values(kinds)) {
    entry.meanRecordCharacters = entry.records ? round(entry.recordCharacters / entry.records) : null;
    delete entry.recordCharacters;
  }
  let bytes = 0;
  for (const text of files.values()) bytes += Buffer.byteLength(text);
  return { files: files.size, bytes, readmeBytes: Buffer.byteLength(files.get('README.md') ?? ''), largestBehavior, kinds };
}

/** One `rg` per term from the project root, as the specification and the trials run it. */
async function hitCost(root) {
  const env = { ...process.env };
  delete env.RIPGREP_CONFIG_PATH;
  const results = {};
  for (const term of terms) {
    const result = await runCommand('rg', ['-n', '-i', term, `${viewName}/`], { cwd: root, env: { RIPGREP_CONFIG_PATH: '' }, timeoutMs: 60_000 });
    assert.ok(result.code === 0 || result.code === 1, `rg failed for ${term}: ${result.stderr}`);
    const lines = result.stdout.split('\n').filter(Boolean);
    const byKind = {}, byFile = {};
    let recordCharacters = 0, maxLineBytes = 0;
    for (const line of lines) {
      const match = /^([^:]+):(\d+):(.*)$/.exec(line);
      assert.ok(match, `Unexpected rg line: ${line.slice(0, 200)}`);
      const path = match[1].slice(viewName.length + 1);
      const kind = path.split('/').pop();
      const lineBytes = Buffer.byteLength(line) + 1;
      const entry = byKind[kind] ??= { lines: 0, bytes: 0 };
      entry.lines++; entry.bytes += lineBytes;
      byFile[path] = (byFile[path] ?? 0) + 1;
      recordCharacters += characters(match[3]);
      maxLineBytes = Math.max(maxLineBytes, lineBytes);
    }
    const bytes = Buffer.byteLength(result.stdout);
    results[term] = { lines: lines.length, bytes, withinLines: lines.length <= budget.hitLines, withinBytes: bytes <= budget.hitBytes,
      meanLineBytes: lines.length ? round(bytes / lines.length) : null, maxLineBytes,
      meanHitCharacters: lines.length ? round(recordCharacters / lines.length) : null, byKind, byFile };
  }
  return results;
}

/** Waits until the context's published sequence passes `before`, as the watcher publishes an edit. */
async function waitForRevision(daemon, before, limitMs = 15_000) {
  const deadline = performance.now() + limitMs;
  while (performance.now() < deadline) {
    const status = await daemon.status();
    const sequence = status?.contexts?.[0]?.published?.sequence ?? 0;
    if (sequence > before) return sequence;
    await delay(100);
  }
  return null;
}

function contextSummary(status) {
  const context = status?.contexts?.[0];
  return context ? { sequence: context.published?.sequence ?? null, revision: context.published?.revision ?? null,
    inputId: context.published?.fingerprints?.inputId ?? null, cause: context.published?.cause ?? null } : null;
}

/** The plan's scale sequence on one project, all from its root. */
async function scaleWorkload(executable, name, root, { hits, editPath }) {
  const daemon = await ownedDaemon(executable, root);
  const poll = pollDaemonStatus(executable, daemon.env, root);
  const record = { name, root: '<isolated copy>', steps: {} };
  try {
    record.steps.cold = parsed(await daemon.run(['materialize', '--view', 'architect']));
    const afterCold = await daemon.status();
    record.context = contextSummary(afterCold);
    const tree = await readViewTree(root);
    record.view = viewMetrics(tree.files);
    record.meta = JSON.parse(tree.files.get('_meta.json'));
    const normalized = withoutRevision(tree.files, record.context.revision).files;
    record.manifest = Object.fromEntries([...normalized].map(([path, text]) => [path, sha256(text)]));
    record.manifestSha256 = sha256(JSON.stringify(Object.entries(record.manifest)));
    if (hits) record.hitCost = await hitCost(root);

    record.steps.repeat = parsed(await daemon.run(['materialize', '--view', 'architect']));
    await rm(join(root, viewName), { recursive: true, force: true });
    record.steps.retainedFacts = parsed(await daemon.run(['materialize', '--view', 'architect']));

    // A warm daemon and a hot session, a new revision without retained facts: the analyzer runs.
    const warm = [];
    const original = await readFile(join(root, editPath));
    for (let sample = 1; sample <= 3; sample++) {
      const before = (await daemon.status())?.contexts?.[0]?.published?.sequence ?? 0;
      await writeFile(join(root, editPath), Buffer.concat([original, Buffer.from(`\n// plan2b measurement edit ${sample}\n`)]));
      const published = await waitForRevision(daemon, before);
      const run = parsed(await daemon.run(['materialize', '--view', 'architect']));
      warm.push({ sample, watcherPublished: published !== null, ...run });
    }
    await writeFile(join(root, editPath), original);
    record.steps.warmAnalyzer = warm;
    record.steps.apiOnly = parsed(await daemon.run(['materialize']));
    record.steps.bothViews = parsed(await daemon.run(['materialize', '--view', 'api', '--view', 'architect', '--all']));
    const end = await daemon.status();
    record.counters = end?.counters ?? null;
  } finally {
    const memory = poll.stop();
    record.memory = { pid: memory.pid, samples: memory.sampleCount, peakDaemonRssBytes: memory.peakDaemonRssBytes,
      peakDaemonHeapUsedBytes: memory.peakDaemonHeapUsedBytes, peakCombinedRssBytes: memory.peakCombinedRssBytes,
      peakCombinedHeapBytes: memory.peakCombinedHeapBytes };
    record.daemonStop = await daemon.stop();
  }
  return record;
}

/** The architect session query in this process: hot, then after releasing the compiler (warm), per project. */
async function sessionQuery(root) {
  const inputs = { project: { cwd: root, scope: 'whole-project', configuration: 'discover' },
    registry: (await import('../../subs/analysis/subs/model/src/index.ts')).createDefaultTagRegistry(),
    capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin',
      'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'],
    limits: batchLimits, session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 1024, maxRetainedFactBytes: 96 * 1024 ** 2 } };
  const started = performance.now();
  const opened = await openRetainedSession(inputs);
  assert.equal(opened.status, 'opened', 'The measured session did not open');
  const openMs = performance.now() - started;
  const session = opened.session;
  try {
    const sequence = opened.revision.sequence;
    const query = async () => {
      const at = performance.now();
      const outcome = await session.architectView({ sequence, ...specifiedArchitectLimits });
      assert.equal(outcome.status, 'projected', `The architect query answered ${outcome.status}`);
      return { durationMs: round(performance.now() - at), projectionBytes: outcome.projection.bytes,
        symbols: outcome.projection.symbols.length, tests: outcome.projection.tests.length, modules: outcome.projection.modules.length,
        workerRss: session.status().worker.rss, compilerRss: session.status().compiler.rss };
    };
    const hot = [await query(), await query(), await query()];
    await session.releaseCompiler();
    const levelAfterRelease = session.status().level;
    const warm = await query();
    return { openMs: round(openMs), hot, levelAfterRelease, warm };
  } finally { await session.dispose(); }
}

/**
 * The defect witness: the context is opened by a check from the project root,
 * and the materialization names the same root from another directory. The
 * republished revision's report records the second invocation while its inputs
 * are the first invocation's, so the analyzer finds changed inputs on every
 * try until the wait limit. A materialization in the opening form follows.
 */
async function mixedInvocation(executable, root, elsewhere) {
  const daemon = await ownedDaemon(executable, root);
  const record = { name: 'mixed-invocation', steps: {} };
  try {
    const check = await daemon.run(['check', '--format', 'json']);
    record.steps.check = { code: check.code, durationMs: round(check.durationMs) };
    record.afterCheck = contextSummary(await daemon.status());
    record.steps.materializeWithRoot = parsed(await daemon.run(['materialize', '--view', 'architect', '--root', root], elsewhere));
    const afterRoot = await daemon.status();
    record.afterMaterializeWithRoot = { context: contextSummary(afterRoot), counters: afterRoot?.counters ?? null };
    record.steps.materializeFromRoot = parsed(await daemon.run(['materialize', '--view', 'architect']));
    const afterOwn = await daemon.status();
    record.afterMaterializeFromRoot = { context: contextSummary(afterOwn), counters: afterOwn?.counters ?? null };
  } finally { record.daemonStop = await daemon.stop(); }
  return record;
}

/**
 * The isolation witness: a resident session opened while generated views
 * exist. The same copy is checked resident and batch, first without views and
 * then after a daemon restart with the architect and API views present; then a
 * changed view is published and the next check shows whether a revision started.
 */
async function openWithView(executable, root) {
  const record = { name: 'open-with-view', steps: {} };
  const reportOf = result => { const value = JSON.parse(result.stdout); return { code: result.code, inputId: value.inputId,
    inputs: value.snapshot.inputs.length, generatedInputs: value.snapshot.inputs.filter(input => /(?:^|\/)\.ramify(?:-architect)?(?:$|\/)/.test(input.path)).map(input => input.path) }; };
  const first = await ownedDaemon(executable, root);
  try {
    record.steps.residentWithoutViews = reportOf(await first.run(['check', '--format', 'json']));
    record.steps.batchWithoutViews = reportOf(await first.run(['check', '--batch', '--format', 'json']));
    record.steps.materialize = parsed(await first.run(['materialize', '--view', 'api', '--view', 'architect', '--all']));
    record.steps.residentAfterPublishing = reportOf(await first.run(['check', '--format', 'json']));
  } finally { record.firstDaemonStop = await first.stop(); }
  const second = await ownedDaemon(executable, root);
  try {
    record.steps.residentOpenedWithViews = reportOf(await second.run(['check', '--format', 'json']));
    record.steps.batchWithViews = reportOf(await second.run(['check', '--batch', '--format', 'json']));
    const before = (await second.status())?.contexts?.[0]?.published?.sequence ?? 0;
    const editPath = join(root, 'subs/workspace/subs/catalog/subs/core/src/catalog.ts');
    const original = await readFile(editPath);
    await writeFile(editPath, Buffer.concat([original, Buffer.from('\nexport function plan2bIsolationProbe(): number { return 1; }\n')]));
    record.steps.editPublished = await waitForRevision(second, before);
    record.steps.changedView = parsed(await second.run(['materialize', '--view', 'architect']));
    const afterPublish = contextSummary(await second.status());
    await delay(1500);
    const check = await second.run(['check', '--format', 'json']);
    record.steps.afterChangedView = { publish: afterPublish, check: { code: check.code }, settled: contextSummary(await second.status()) };
    await writeFile(editPath, original);
  } finally { record.secondDaemonStop = await second.stop(); }
  return record;
}

function addBudget(name, limit, measured, within, note) { report.budgets.push({ name, limit, measured, within, ...(note ? { note } : {}) }); }

function evaluateBudgets() {
  const { reference, toolkit } = report.workloads;
  const session = report.workloads['session-query'];
  if (session?.toolkit) {
    const values = [...session.toolkit.hot.map(item => item.durationMs), session.toolkit.warm.durationMs];
    addBudget('Architect session query, warm, toolkit', `${budget.sessionQueryMs} ms`, `${Math.max(...values)} ms (max of three hot queries and one after releasing the compiler)`,
      Math.max(...values) <= budget.sessionQueryMs);
  }
  if (toolkit?.steps) {
    const warm = toolkit.steps.warmAnalyzer.map(item => item.durationMs);
    addBudget('Whole materialize --view architect, warm, toolkit, dependency analyzer included', `${budget.wholeCommandMs} ms`,
      `${Math.max(...warm)} ms (max of ${warm.length}, median ${median(warm)} ms; new daemon and context: ${toolkit.steps.cold.durationMs} ms)`,
      Math.max(...warm, toolkit.steps.cold.durationMs) <= budget.wholeCommandMs
        && toolkit.steps.warmAnalyzer.every(item => item.dependencies === 'measured'));
    addBudget('View size, toolkit', `${budget.viewBytes} bytes`, `${toolkit.view.bytes} bytes`, toolkit.view.bytes <= budget.viewBytes);
  }
  const repeats = Object.entries(report.workloads).filter(([, item]) => item?.steps?.repeat).map(([name, item]) => [name, item.steps.repeat.bytesWritten]);
  if (repeats.length) addBudget('Unchanged repeat', '0 bytes written', repeats.map(([name, bytes]) => `${name}: ${bytes}`).join(', '), repeats.every(([, bytes]) => bytes === 0));
  const projection = Math.max(0, ...(session ? Object.values(session).flatMap(item => item.hot.map(query => query.projectionBytes)) : []));
  addBudget('maxProjectionBytes (session projection)', `${budget.maxProjectionBytes} bytes`,
    `configured ${report.configured.maxProjectionBytes}; largest measured projection ${projection} bytes`,
    report.configured.maxProjectionBytes === budget.maxProjectionBytes && projection <= budget.maxProjectionBytes);
  const largestView = Math.max(0, ...Object.values(report.workloads).map(item => item?.view?.bytes ?? 0));
  addBudget('maxArchitectBytes (publisher, rendered view)', `${budget.maxArchitectBytes} bytes`,
    `configured ${report.configured.maxArchitectBytes}; largest measured view ${largestView} bytes`,
    report.configured.maxArchitectBytes === budget.maxArchitectBytes && largestView <= budget.maxArchitectBytes);
  const mixed = report.workloads['mixed-invocation'];
  addBudget('Dependency wait', `${budget.waitIntervalMs} ms interval, ${budget.waitLimitMs} ms total`,
    `configured ${report.configured.dependencyWait.intervalMs} ms, ${report.configured.dependencyWait.limitMs} ms`
      + (mixed?.steps?.materializeWithRoot ? `; the mixed-invocation run reached the limit and took ${mixed.steps.materializeWithRoot.durationMs} ms` : ''),
    report.configured.dependencyWait.intervalMs === budget.waitIntervalMs && report.configured.dependencyWait.limitMs === budget.waitLimitMs);
  for (const [name, item] of [['toolkit', toolkit], ['reference', reference]]) {
    if (!item?.hitCost) continue;
    const over = Object.entries(item.hitCost).filter(([, value]) => !value.withinLines || !value.withinBytes);
    addBudget(`Hit cost per term, ${name}`, `${budget.hitLines} lines and ${budget.hitBytes} bytes`,
      Object.entries(item.hitCost).map(([term, value]) => `${term}: ${value.lines} lines, ${value.bytes} bytes`).join('; '),
      over.length === 0, over.length ? `exceeded by ${over.map(([term]) => term).join(', ')}` : undefined);
  }
  if (toolkit?.view) {
    const mean = toolkit.view.kinds['behavior.jsonl'].meanRecordCharacters;
    addBudget('Mean behavior record, toolkit (evidence)', `${budget.meanBehaviorCharacters} characters`,
      `${mean} characters, longest ${toolkit.view.kinds['behavior.jsonl'].maxRecordCharacters}`, mean <= budget.meanBehaviorCharacters,
      'recorded as evidence, not enforced');
  }
  if (mixed?.steps) {
    const run = mixed.steps.materializeWithRoot;
    addBudget('Whole materialize --view architect after a check from another invocation (defect witness)', `${budget.wholeCommandMs} ms`,
      `${run.durationMs} ms, dependencies ${run.dependencies}`, run.durationMs <= budget.wholeCommandMs && run.dependencies === 'measured',
      'the analyzer re-acquires with the republished report\'s request, whose discovery inputs differ from the retained ones');
  }
}

const scratch = await realpath(await mkdtemp('/tmp/rp2b-ms-'));
try {
  report.source = await gitHead();
  report.configured = { dependencyWait: { ...dependencyWait }, maxArchitectBytes: residentPublishLimits.maxArchitectBytes,
    maxProjectionBytes: specifiedArchitectLimits.maxProjectionBytes, limits: specifiedArchitectLimits,
    note: 'The daemon passes these architect limits explicitly (subs/daemon/src/service.ts); the harness verifies the same values byte for byte through the in-process expectation.' };
  const install = await runCommand('npm', ['install', '--prefix', join(scratch, 'client-install'), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packageRoot], { timeoutMs: 60_000 });
  assert.equal(install.code, 0, install.stderr);
  const { client, executable } = installedCommand(join(scratch, 'client-install'));
  report.client = client;
  await persist();
  const requested = selected === 'all' ? knownWorkloads : [selected];
  for (const name of requested) {
    process.stderr.write(`Measuring ${name}\n`);
    try {
      if (name === 'reference' || name === 'toolkit') {
        const root = await copyProject(name, join(scratch, name));
        try {
          report.workloads[name] = await scaleWorkload(executable, name, root, { hits: true,
            editPath: name === 'reference' ? 'subs/workspace/subs/catalog/subs/core/src/catalog.ts' : 'subs/analysis/src/architect-render.ts' });
        } finally { await rm(root, { recursive: true, force: true }); }
      } else if (name === 'synthetic-100') {
        const root = join(scratch, 'synthetic-100');
        const fixture = await materializeSynthetic(root, 'S100');
        try {
          report.workloads[name] = { fixture, ...await scaleWorkload(executable, name, root, { hits: false, editPath: 'subs/m001/src/impl0.ts' }) };
        } finally { await rm(root, { recursive: true, force: true }); }
      } else if (name === 'session-query') {
        const result = {};
        for (const kind of ['reference', 'toolkit']) {
          const root = await copyProject(kind, join(scratch, `query-${kind}`));
          try { result[kind] = await sessionQuery(root); } finally { await rm(root, { recursive: true, force: true }); }
        }
        report.workloads[name] = result;
      } else if (name === 'open-with-view') {
        const root = await copyProject('reference', join(scratch, 'open-with-view'));
        try { report.workloads[name] = await openWithView(executable, root); }
        finally { await rm(root, { recursive: true, force: true }); }
      } else if (name === 'mixed-invocation') {
        const root = await copyProject('reference', join(scratch, 'mixed'));
        const elsewhere = join(scratch, 'elsewhere');
        await mkdir(elsewhere, { recursive: true });
        try { report.workloads[name] = await mixedInvocation(executable, root, elsewhere); }
        finally { await rm(root, { recursive: true, force: true }); }
      }
    } catch (error) {
      report.failures.push(`${name}: ${error.stack ?? String(error)}`);
    }
    await persist();
  }
  evaluateBudgets();
} catch (error) {
  report.failures.push(error.stack ?? String(error));
} finally {
  report.completedAt = new Date().toISOString();
  await rm(scratch, { recursive: true, force: true });
  await persist();
  const exceeded = report.budgets.filter(item => !item.within).map(item => item.name);
  process.stdout.write(JSON.stringify({ output, failures: report.failures.length, exceeded }, null, 2) + '\n');
  process.exitCode = report.failures.length ? 1 : 0;
}
