// SPIKE(bun-cli-startup): spawned wall time per client variant, interleaved round-robin.
// Usage: node bench.mjs [runs=50] [warmups=3]; run from the package root with RAMIFY_ENDPOINT_DIR set.
import { spawn } from 'node:child_process';

const runs = Number(process.argv[2] ?? 50), warmups = Number(process.argv[3] ?? 3);
const changed = ['check', '--root', 'examples/collection-review', '--changed', 'subs/workspace/src/client.ts'];
const variants = {
  'node': ['node', 'dist/src/cli-entry.js'],
  'node + bundle': ['node', 'dist/bun/ramify-node.js'],
  'bun unbundled': ['bun', 'dist/src/cli-entry.js'],
  'bun + bundle': ['bun', 'dist/bun/ramify.js'],
  'bun compile': ['dist/bin/ramify'],
  'bun compile --bytecode': ['dist/bin/ramify-bytecode'],
  'bun compile --bytecode --minify': ['dist/bin/ramify-min'],
};
const floors = {
  '/bin/true': ['/bin/true'],
  'node -e 0': ['node', '-e', '0'],
  'bun -e 0': ['bun', '-e', '0'],
  'bun compile, empty': ['.spike/bun-empty'],
  'bun compile --bytecode, empty': ['.spike/bun-empty-bytecode'],
};
const workloads = { '--version': ['--version'], 'daemon status': ['daemon', 'status'], 'check --changed': changed };

function once([command, ...args]) {
  return new Promise((accept, reject) => {
    const start = process.hrtime.bigint();
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => accept({ ms: Number(process.hrtime.bigint() - start) / 1e6, code }));
  });
}
const stats = samples => {
  const sorted = [...samples].sort((a, b) => a - b), at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p50: at(0.5), p90: at(0.9), min: sorted[0] };
};
async function measure(cases) {
  const samples = Object.fromEntries(Object.keys(cases).map(key => [key, []]));
  for (let round = 0; round < warmups + runs; round++) {
    for (const [key, argv] of Object.entries(cases)) {
      const { ms, code } = await once(argv);
      if (code !== 0) throw new Error(`${key} exited ${code}`);
      if (round >= warmups) samples[key].push(ms);
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)]));
}
const fmt = n => n.toFixed(1).padStart(7);
const print = (title, result) => {
  console.log(`\n${title}\n${'variant'.padEnd(34)}   mean    p50    p90    min`);
  for (const [key, s] of Object.entries(result)) console.log(`${key.padEnd(34)}${fmt(s.mean)}${fmt(s.p50)}${fmt(s.p90)}${fmt(s.min)}`);
};
const all = { floors: await measure(floors) };
print('Process floors', all.floors);
for (const [name, tail] of Object.entries(workloads)) {
  all[name] = await measure(Object.fromEntries(Object.entries(variants).map(([key, head]) => [key, [...head, ...tail]])));
  print(name, all[name]);
}
if (process.env.BENCH_JSON) (await import('node:fs')).writeFileSync(process.env.BENCH_JSON, `${JSON.stringify({ runs, warmups, host: process.platform, results: all }, null, 2)}\n`);
