#!/usr/bin/env node
// Plan 8 iteration 5: stage timings and retained facts of the signature-companion
// rule, on the reference example, the toolkit and the exposing synthetic fixture.
// Every revision comes from this checkout's measurement daemon over the real
// socket; nothing here is in-process. Budgets (SC24, SC25) are evaluated in the
// iteration results against a pre-plan run of this same script, not here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { FastResident } from './fast-driver.mjs';
import { packageRoot, sha256, median } from './common.mjs';
import { treeIdentity } from './identities.mjs';
import { processRows } from './process-observer.mjs';

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert.ok(['--output', '--cycles', '--toolkit', '--fixtures'].includes(args[index]) && args[index + 1], 'Usage: companion-stages.mjs --output FILE [--cycles N] [--toolkit DIR] [--fixtures reference,toolkit,X100]');
  options.set(args[index], args[index + 1]);
}
const output = resolve(options.get('--output') ?? assert.fail('--output FILE is required'));
const cycles = Number(options.get('--cycles') ?? 10);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 2 && cycles % 2 === 0, 'An even cycle count restores every edit');
const toolkitSource = resolve(options.get('--toolkit') ?? packageRoot);
const selected = (options.get('--fixtures') ?? 'reference,toolkit,X100').split(',');
assert.ok(selected.every(name => ['reference', 'toolkit', 'X100'].includes(name)), 'Unknown fixture');

const git = (...command) => spawnSync('git', ['-C', packageRoot, ...command], { encoding: 'utf8' }).stdout.trim();
const scratch = mkdtempSync(join(tmpdir(), 'ramify-cs-'));
const report = {
  schemaVersion: 'ramify.companion-stages/1', measuredAt: new Date().toISOString(),
  command: ['node', 'scripts/measurements/companion-stages.mjs', ...args],
  build: { head: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain').split('\n').filter(Boolean),
    dist: treeIdentity(join(packageRoot, 'dist')) },
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(),
    logicalCpus: cpus().length, cpuModel: cpus()[0]?.model, loadAverage: readFileSync('/proc/loadavg', 'utf8').trim(),
    concurrentActivity: process.env.RAMIFY_MEASUREMENT_ACTIVITY ?? 'Unspecified', processCensus: processRows().length },
  cycles, fixtures: [], failures: [],
};

function copyTree(from, to, keep) {
  cpSync(from, to, { recursive: true, dereference: false, filter: path => {
    const parts = relative(from, path).split('/');
    return !parts.some(part => ['node_modules', 'dist', '.reference-work', '.git', '.vite', '.ramify', '.ramify-architect'].includes(part))
      && (parts[0] === '' || keep(parts[0]));
  } });
}

function prepare(name) {
  const root = join(scratch, `fixture-${name}`);
  if (name === 'reference') {
    const source = join(packageRoot, 'examples/collection-review');
    copyTree(source, root, () => true);
    symlinkSync(join(source, 'node_modules'), join(root, 'node_modules'));
    return { root, owners: 15, identity: treeIdentity(root),
      configuration: 'tsconfig.json', description: 'subs/workspace/module.ramify' };
  }
  if (name === 'toolkit') {
    copyTree(toolkitSource, root, part => ['src', 'subs', 'module.ramify', 'README.md', 'package.json', 'tsconfig.json'].includes(part));
    symlinkSync(join(toolkitSource, 'node_modules'), join(root, 'node_modules'));
    return { root, owners: null, identity: treeIdentity(root), source: toolkitSource,
      configuration: 'tsconfig.json', description: 'subs/analysis/subs/model/module.ramify' };
  }
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/measurements/materialize.ts', root, 'X100'],
    { cwd: packageRoot, env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 60_000 });
  assert.equal(child.status, 0, child.stderr);
  return { root, owners: 100, identity: treeIdentity(root), materialized: JSON.parse(child.stdout),
    configuration: 'tsconfig.json', description: 'subs/m001/module.ramify' };
}

function edits(project) {
  const read = path => readFileSync(join(project.root, path), 'utf8');
  const configuration = read(project.configuration), description = read(project.description);
  assert.equal(configuration.split('"target": "ES2022"').length, 2, 'Unique configuration anchor');
  return {
    // A target change keeps the file selection and takes the broad path: every
    // file is described again and the companion pass runs over the whole model.
    configuration: [project.configuration, configuration, configuration.replace('"target": "ES2022"', '"target": "ES2021"')],
    // A comment in a description relinks with zero compiler work; the pass runs again.
    description: [project.description, description, `${description}// companion stage measurement\n`],
  };
}

const summarize = values => values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values) } : null;

async function measure(name) {
  const project = prepare(name), row = { name, identity: project.identity, materialized: project.materialized ?? null,
    toolkitSource: project.source ?? null, cold: null, revisions: [], summary: {} };
  report.fixtures.push(row);
  // A short endpoint directory keeps the socket path within the platform limit.
  const endpoint = mkdtempSync('/tmp/rcs-'), host = new FastResident(endpoint, process.execPath);
  try {
    await host.connect();
    const token = await host.open(project);
    const cold = await host.delta(token);
    assert.equal(cold.status, 'reported', JSON.stringify(cold).slice(0, 2000));
    const settledCold = await host.quiet(), context = settledCold.contexts[0];
    row.cold = { path: cold.revision.checked.path, timings: cold.revision.timings, summary: cold.revision.summary,
      outcome: cold.revision.outcome, factBytes: context.session?.factBytes ?? null, retainedBytes: context.retainedBytes,
      historyBytes: context.history?.bytes ?? null };
    const definitions = edits(project);
    for (const kind of ['configuration', 'description']) {
      const [path, original, modified] = definitions[kind];
      for (let index = 0; index < cycles; index++) {
        const next = index % 2 ? original : modified;
        const before = (await host.context(token)).published.sequence;
        writeFileSync(join(project.root, path), next);
        const reply = await host.delta(token, [{ path, sha256: sha256(next) }]);
        // A configuration change is answered at once as unavailable, and its
        // revision is published behind that reply; read it once published.
        if (kind === 'configuration') assert.ok(['reported', 'unavailable'].includes(reply.status), JSON.stringify(reply).slice(0, 2000));
        else assert.equal(reply.status, 'reported', JSON.stringify(reply).slice(0, 2000));
        await host.published(token, before);
        const settled = await host.quiet(), current = settled.contexts[0];
        const revision = (await host.context(token)).published;
        assert.ok(revision.sequence > before, 'A new revision was published for the edit');
        row.revisions.push({ kind, index, reply: reply.status, path: revision.checked.path, sequence: revision.sequence,
          timings: revision.timings, summary: revision.summary, outcome: revision.outcome,
          factBytes: current.session?.factBytes ?? null, retainedBytes: current.retainedBytes,
          historyBytes: current.history?.bytes ?? null, historyRevisions: current.history?.retained ?? null });
        process.stderr.write(JSON.stringify({ name, kind, index, path: revision.checked.path }) + '\n');
      }
    }
    for (const kind of ['configuration', 'description']) {
      // A revision the retained-fact limit forces onto another path is kept in
      // the raw rows and left out of the summary of its kind.
      const expected = kind === 'configuration' ? 'broad' : 'description';
      const all = row.revisions.filter(revision => revision.kind === kind);
      const rows = all.filter(revision => revision.path === expected);
      const stages = Object.keys(rows[0]?.timings ?? {});
      row.summary[kind] = { expectedPath: expected, paths: [...new Set(all.map(revision => revision.path))], counted: rows.length, cycles: all.length,
        timings: Object.fromEntries(stages.map(stage => [stage, summarize(rows.map(revision => revision.timings[stage]))])),
        factBytes: summarize(rows.map(revision => revision.factBytes)) };
    }
  } finally {
    try { await host.close(); } finally { rmSync(endpoint, { recursive: true, force: true }); }
  }
}

try {
  for (const name of selected) await measure(name);
} catch (error) { report.failures.push(error.stack ?? String(error)); }
finally {
  report.completedAt = new Date().toISOString();
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 1) + '\n');
  process.stdout.write(JSON.stringify({ output, failures: report.failures,
    fixtures: report.fixtures.map(row => ({ name: row.name, cold: row.cold && { factBytes: row.cold.factBytes, timings: row.cold.timings },
      summary: row.summary })) }, null, 1) + '\n');
  process.exitCode = report.failures.length ? 1 : 0;
}
