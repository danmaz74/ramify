import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const markKey = Symbol.for('ramify.probe.phase');
let phase = 'registry';
let since = 0;
let phases = {};
let parseStart = 0;
let parseMs = 0;
globalThis[markKey] = name => {
  const now = performance.now();
  if (name === 'parse-start') { parseStart = now; return; }
  if (name === 'parse-end') { parseMs += now - parseStart; return; }
  phases[phase] = (phases[phase] ?? 0) + now - since;
  phase = name; since = now;
};
let instrumented = 0;
const hook = registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (!url.endsWith('/dist/subs/analysis/src/run-analysis.js')) return loaded;
  let source = String(loaded.source);
  const anchors = [
    ["draft.current = 'acquisition';", 'acquisition', 0],
    ['const result = parseDescription(file, text);', 'parse-start', 0],
    ['parsed.set(file, result);', 'parse-end', 0],
    ["draft.current = 'catalog';", 'catalog', 0],
    ["draft.current = 'link';", 'link', 0],
    ["draft.current = 'access';", 'access', 0],
    ["draft.current = 'decide';", 'decide', 0],
    ['const sealStart = performance.now();', 'seal-dispose', 0],
    ['let report = draft.finish();', 'report', 0],
  ];
  for (const [anchor, name] of anchors) {
    // Acquisition has a second assignment before seal; deliberately instrument only the first.
    assert.equal(source.split(anchor).length - 1, name === 'acquisition' ? 2 : 1, `Changed instrumentation anchor: ${anchor}`);
    source = source.replace(anchor, `globalThis[Symbol.for('ramify.probe.phase')](${JSON.stringify(name)});\n${anchor}`);
  }
  instrumented++;
  return { ...loaded, source };
} });
const { runBatch } = await import('../../../dist/src/batch.js');
hook.deregister();
assert.equal(instrumented, 1);
const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
  'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access',
  'symbol-free-access', 'resource-access', 'coverage'];
const samples = [];
for (let iteration = 1; iteration <= 20; iteration++) {
  phases = {}; parseMs = 0; phase = 'registry'; since = performance.now();
  const started = since;
  const result = await runBatch({ cwd: process.argv[2], root: process.argv[2], capabilities });
  globalThis[markKey]('done');
  const wallMs = performance.now() - started;
  assert.equal(result.status, 'reported');
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.summary.owners, Number(process.argv[3]));
  assert.equal(result.report.summary.denied, 0);
  assert.equal(result.report.summary.coverageNotes, 0);
  assert.equal(result.report.stages.length, 8);
  assert.ok(result.report.stages.every(stage => stage.status === 'completed'));
  phases.acquisition -= parseMs; phases.parse = parseMs;
  assert.ok(Object.values(phases).every(value => value >= 0));
  samples.push({ iteration, wallMs, phasesMs: phases, rssAfter: process.memoryUsage().rss,
    inputId: result.report.inputId, owners: result.report.summary.owners,
    reportBytes: Buffer.byteLength(JSON.stringify(result.report)) });
  process.stderr.write(`${process.argv[3]} owners: ${iteration}/20, ${wallMs.toFixed(1)} ms\n`);
}
assert.equal(new Set(samples.map(sample => sample.inputId)).size, 1);
const median = values => { const sorted = [...values].sort((a, b) => a - b); return (sorted[9] + sorted[10]) / 2; };
console.log(JSON.stringify({ samples, medianWallMs: median(samples.map(sample => sample.wallMs)),
  medianPhasesMs: Object.fromEntries(Object.keys(phases).map(key => [key, median(samples.map(sample => sample.phasesMs[key]))])),
  compiledPipelineSha256: createHash('sha256').update(readFileSync(new URL('../../../dist/subs/analysis/src/run-analysis.js', import.meta.url))).digest('hex'),
}));
delete globalThis[markKey];
