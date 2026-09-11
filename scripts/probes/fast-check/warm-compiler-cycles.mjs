import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { API, SymbolFlags } from '../../../node_modules/typescript/dist/api/sync/api.js';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const root = report.scope.root, configuration = resolve(root, report.scope.configuration), inventory = report.snapshot.inventory;
const synthetic = resolve(dirname(configuration), '.ramify-probe-inputs.json');
const virtual = new Map(), override = new Map();
const api = new API({ cwd: root, fs: { readFile: p => virtual.get(resolve(p)) ?? override.get(resolve(p)), fileExists: p => virtual.has(resolve(p)) || override.has(resolve(p)) ? true : undefined, realpath: p => virtual.has(resolve(p)) || override.has(resolve(p)) ? resolve(p) : undefined } });
const owned = inventory.files.filter(f => f.kind === 'source').map(f => resolve(root, f.path));
const config = () => JSON.stringify({ extends: configuration, files: [...owned, ...override.keys()].sort(), include: [], exclude: [] });
virtual.set(synthetic, config());
const rss = () => { try { return execSync(`ps -o rss= --ppid ${process.pid}`).toString().trim().split('\n').map(Number).reduce((a, b) => a + b, 0) / 1024; } catch { return NaN; } };
let snapshot = api.updateSnapshot({ openProjects: [synthetic] });
let project = snapshot.getProject(synthetic);
const touch = (project, file) => { const sf = project.program.getSourceFile(file); const m = project.checker.getSymbolAtLocation(sf); return m ? project.checker.getExportsOfModule(m).length : -1; };
console.log('initial: program files', project.program.getSourceFileNames().length, 'tsgo RSS MiB', rss().toFixed(0));
const target = owned[Math.floor(owned.length / 2)];
const original = readFileSync(target, 'utf8');
const times = [];
for (let cycle = 1; cycle <= 40; cycle++) {
  if (cycle % 2) override.set(target, original + `\nexport const probe${cycle} = ${cycle};\n`); else override.delete(target);
  const t = performance.now();
  const previous = snapshot;
  snapshot = api.updateSnapshot({ fileChanges: { changed: [target] } });
  project = snapshot.getProject(synthetic);
  touch(project, target);
  previous.dispose();
  times.push(performance.now() - t);
  if (cycle % 10 === 0) console.log(`cycle ${cycle}: update+query median ${times.slice(-10).sort((a,b)=>a-b)[5].toFixed(1)} ms, tsgo RSS MiB ${rss().toFixed(0)}, client RSS MiB ${(process.memoryUsage().rss/1048576).toFixed(0)}`);
}
// Create a new owned file: it enters the explicit files list, so the synthetic config changes too.
const created = resolve(dirname(target), 'ramify-probe-created.ts');
override.set(created, `import { probe39 } from './${relative(dirname(created), target).replace(/\.ts$/, '.js')}';\nexport const fromCreated = probe39;\n`);
override.set(target, original + `\nexport const probe39 = 39;\n`);
virtual.set(synthetic, config());
let t = performance.now();
let previous = snapshot;
snapshot = api.updateSnapshot({ fileChanges: { changed: [synthetic, target], created: [created] } });
project = snapshot.getProject(synthetic);
console.log(`created file + config change: ${(performance.now() - t).toFixed(1)} ms, program files ${project.program.getSourceFileNames().length}, new file exports ${touch(project, created)}, resolves import: ${project.checker.getSymbolAtLocation(project.program.getSourceFile(created).statements[0].moduleSpecifier)?.name}`);
previous.dispose();
// Delete it again.
override.delete(created); virtual.set(synthetic, config());
t = performance.now(); previous = snapshot;
snapshot = api.updateSnapshot({ fileChanges: { changed: [synthetic], deleted: [created] } });
project = snapshot.getProject(synthetic);
console.log(`deleted file + config change: ${(performance.now() - t).toFixed(1)} ms, program files ${project.program.getSourceFileNames().length}`);
previous.dispose();
// Leak check: keep 10 snapshots alive without disposing.
const kept = [];
for (let i = 0; i < 10; i++) { override.set(target, original + `\nexport const keep${i} = ${i};\n`); kept.push(api.updateSnapshot({ fileChanges: { changed: [target] } })); touch(kept.at(-1).getProject(synthetic), target); }
console.log('10 undisposed snapshots: tsgo RSS MiB', rss().toFixed(0));
kept.forEach(s => s.dispose()); snapshot.dispose();
override.set(target, original); api.updateSnapshot({ fileChanges: { changed: [target] } }).dispose();
console.log('after disposing them: tsgo RSS MiB', rss().toFixed(0));
api.close();
