import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
if (isMainThread) {
  const root = process.argv[2], config = process.argv[3];
  let ticks = 0; const interval = setInterval(() => ticks++, 5);
  const start = performance.now();
  const worker = new Worker(new URL(import.meta.url), { workerData: { root, config } });
  worker.on('message', m => { console.log('worker:', m, '| main-thread 5ms ticks while worker worked:', ticks, 'over', (performance.now() - start).toFixed(0), 'ms'); });
  worker.on('error', e => { console.error('worker error', e); });
  worker.on('exit', () => clearInterval(interval));
} else {
  const { API } = await import('../../../node_modules/typescript/dist/api/sync/api.js');
  const t = performance.now();
  const api = new API({ cwd: workerData.root });
  const snapshot = api.updateSnapshot({ openProjects: [workerData.config] });
  const project = snapshot.getProject(workerData.config);
  const n = project.program.getSourceFileNames().length;
  // A blocking stretch: query every file once.
  let exportsCount = 0;
  for (const f of project.program.getSourceFileNames()) { const sf = project.program.getSourceFile(f); const m = sf && project.checker.getSymbolAtLocation(sf); if (m) exportsCount += project.checker.getExportsOfModule(m).length; }
  const ms = (performance.now() - t).toFixed(0);
  snapshot.dispose(); api.close();
  parentPort.postMessage(`sync API works in a worker thread: ${n} program files, ${exportsCount} exports over all files, ${ms} ms`);
}
