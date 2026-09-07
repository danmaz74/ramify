#!/usr/bin/env node
// Setup measurements only. Runtime workloads and acceptance budgets need their own fixtures.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const ramifyRoot = resolve(dirname(scriptPath), '..');
const settleMs = 100;
const sampleTimeoutMs = 30_000;
const gcRounds = 2;

function fingerprint(path) {
  return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
}

function packageInfo(root, name) {
  const entry = createRequire(join(root, 'package.json')).resolve(name);
  let directory = dirname(entry);
  while (true) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.name === name) return { name, version: pkg.version, entry };
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot find version for ${name} at ${entry}`);
    directory = parent;
  }
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, settleMs));
  for (let round = 0; round < gcRounds; round++) global.gc();
}

async function runSample(spec) {
  let state;
  try {
    if (spec.name === 'entry') {
      const fixture = await import(pathToFileURL(spec.setup).href);
      if (typeof fixture.setup !== 'function') throw new Error('Fixture must export setup()');
      state = await fixture.setup();
      if (!state || typeof state.dispose !== 'function') {
        throw new Error('setup() must return an object with dispose()');
      }
    } else if (spec.name !== 'empty') {
      const load = name => import(pathToFileURL(spec.packages.find(pkg => pkg.name === name).entry).href);
      const express = (await load('express')).default;
      const { initTRPC } = await load('@trpc/server');
      const { z } = await load('zod');
      const app = express();
      const t = initTRPC.create();
      const router = t.router({ echo: t.procedure.input(z.string()).query(({ input }) => input) });
      const vite = spec.name === 'web-vite' ? await load('vite') : undefined;
      // Keep setup objects reachable during measurement. Do not start listeners or Vite.
      state = { app, router, vite, dispose() {} };
    }

    globalThis.ramifyProbeState = state;
    await settle();
    const ready = process.memoryUsage();
    if (state) await state.dispose();
    state = undefined;
    delete globalThis.ramifyProbeState;
    await settle();
    const disposed = process.memoryUsage();
    // A separate pipe keeps fixture logs from corrupting the result.
    writeFileSync(3, JSON.stringify({ ready, disposed }));
  } finally {
    delete globalThis.ramifyProbeState;
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(samples, phase) {
  return Object.fromEntries(Object.keys(samples[0][phase]).map(metric => [
    metric, median(samples.map(sample => sample[phase][metric])),
  ]));
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(`Usage: node scripts/memory-probe.mjs [options]

  --cases empty,web,web-vite  Built-in setups (default: empty).
  --dependency-root PATH     Required for web setups; use this installed dependency tree.
  --samples N                Fresh processes per case, 1-100 (default: 3).
  --setup PATH               Also measure a local ESM fixture exporting async setup().
                             It returns { dispose(), ...retainedState } after readiness.

Outputs JSON with raw/median bytes, dependency versions and environment/recipe metadata.
Children use --expose-gc, two GC calls after a 100ms settling delay at each measurement,
and a 30-second timeout. NODE_OPTIONS is cleared. Fixtures must dispose owned resources
and finish; a timeout, missing dependency or failed fixture makes the probe fail.
Optional web cases import resolved Node require entries; they open no listeners.
The empty case includes probe overhead. No measurement is a runtime memory budget.
`);
    return;
  }

  const options = new Map();
  const allowed = new Set(['--cases', '--dependency-root', '--samples', '--setup']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!allowed.has(key) || options.has(key) || !value || value.startsWith('--')) {
      throw new Error(`Invalid or repeated option: ${key}. Use --help.`);
    }
    options.set(key, value);
  }
  const countText = options.get('--samples') ?? '3';
  if (!/^\d+$/.test(countText) || Number(countText) < 1 || Number(countText) > 100) {
    throw new Error('--samples must be an integer from 1 to 100');
  }
  const count = Number(countText);
  const names = (options.get('--cases') ?? 'empty').split(',');
  if (new Set(names).size !== names.length || names.some(name => !['empty', 'web', 'web-vite'].includes(name))) {
    throw new Error('--cases accepts distinct empty, web and web-vite names');
  }
  const dependencyRoot = options.has('--dependency-root') ? resolve(options.get('--dependency-root')) : null;
  const needsWeb = names.some(name => name !== 'empty');
  if (needsWeb && !dependencyRoot) throw new Error('Web setups require an explicit --dependency-root');
  const setup = options.has('--setup') ? resolve(options.get('--setup')) : null;
  const packageNames = needsWeb ? ['express', '@trpc/server', 'zod'] : [];
  if (names.includes('web-vite')) packageNames.push('vite');
  const packages = packageNames.map(name => packageInfo(dependencyRoot, name));
  const root = dependencyRoot ?? ramifyRoot;
  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    environment: { node: process.version, versions: process.versions, platform: platform(), release: release(), arch: arch() },
    recipe: {
      commandArgs: args, script: fingerprint(scriptPath), setup: setup ? fingerprint(setup) : null,
      cwd: root, dependencyRoot, packages,
      manifests: ['package.json', 'package-lock.json'].map(name => join(root, name)).filter(existsSync).map(fingerprint),
      samples: count, settleMs, gcRounds, sampleTimeoutMs, nodeArgs: ['--expose-gc'], nodeOptions: '',
      resolution: 'require.resolve from dependencyRoot, then dynamic import of the resolved file',
      units: 'bytes', baseline: 'empty setup with probe overhead',
    },
    cases: [],
  };
  if (setup) names.push('entry');
  for (const name of names) {
    const samples = [];
    for (let index = 0; index < count; index++) {
      const child = spawnSync(process.execPath, ['--expose-gc', scriptPath, '--sample'], {
        cwd: root, env: { ...process.env, NODE_OPTIONS: '' },
        input: JSON.stringify({ name, setup, packages }), encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe', 'pipe'], timeout: sampleTimeoutMs,
        killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      });
      if (child.error || child.status !== 0) {
        throw new Error(`${name} sample ${index + 1} failed: ${child.error?.message ?? child.signal ?? child.status}\n${child.stderr ?? ''}`);
      }
      const sample = JSON.parse(child.output[3]);
      samples.push({ ...sample, stdout: child.stdout, stderr: child.stderr });
    }
    report.cases.push({ name, samples, median: { ready: summarize(samples, 'ready'), disposed: summarize(samples, 'disposed') } });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  if (process.argv[2] === '--sample') {
    await runSample(JSON.parse(readFileSync(0, 'utf8')));
  } else {
    main(process.argv.slice(2));
  }
} catch (error) {
  process.stderr.write(`Memory probe: ${error.message}\n`);
  process.exitCode = 1;
}
