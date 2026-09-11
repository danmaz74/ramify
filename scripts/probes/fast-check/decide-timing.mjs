import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { evaluateAccesses } from '../../../dist/subs/analysis/src/evaluate-accesses.js';
import { explainImport } from '../../../dist/subs/analysis/subs/model/src/decisions.js';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { model, accesses } = report.snapshot;
let t = performance.now();
const evaluation = evaluateAccesses(model, accesses, 100000);
console.log(process.argv[2].split('/').pop(), 'decide all:', (performance.now() - t).toFixed(1), 'ms for', accesses.length, 'accesses,', evaluation.results.length, 'results');
// per-decision cost of explainImport alone
const app = accesses.filter(a => a.target.kind === 'application');
let selections = 0; t = performance.now();
for (const a of app) for (const s of a.selections) if (s.status === 'resolved') { selections++; explainImport(model, { importer: a.importer, location: s.location, target: a.target.origin, selection: { original: s.original, request: s.request }, forwarding: s.forwarding }); }
console.log('  explainImport only:', (performance.now() - t).toFixed(1), 'ms for', selections, 'resolved selections =>', ((performance.now() - t) / Math.max(1, selections)).toFixed(3), 'ms each');
// fan-in: accesses per target file, and distinct (original owner, importer owner) pairs
const byTarget = new Map();
for (const a of app) byTarget.set(a.target.origin.file, (byTarget.get(a.target.origin.file) || 0) + 1);
const top = [...byTarget].sort((x, y) => y[1] - x[1]).slice(0, 5);
console.log('  application-target accesses:', app.length, '| external:', accesses.filter(a => a.target.kind === 'external').length, '| top fan-in files:', top.map(([f, n]) => `${f}=${n}`).join(', '));
const pairs = new Set(); for (const a of app) for (const s of a.selections) if (s.original) pairs.add(`${s.original.owner}|${a.importer.area.owner}|${a.importer.area.kind}`);
console.log('  distinct (original owner, importer area) pairs:', pairs.size, '| distinct originals selected:', new Set(app.flatMap(a => a.selections.filter(s => s.original).map(s => `${s.original.owner}:${s.original.file}#${s.original.binding}`))).size);
