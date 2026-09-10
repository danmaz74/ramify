import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/async';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/compiler-api');
const config = resolve(root, 'tsconfig.json');
async function exerciseAsyncApi(): Promise<void> {
  const api = new API({ cwd: root });
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 1);
  let snapshot: Awaited<ReturnType<API['updateSnapshot']>> | undefined;
  try {
    const parsed = await api.parseConfigFile(config);
    assert.equal(parsed.fileNames.length, 5);
    snapshot = await api.updateSnapshot({ openProjects: [config] });
    const project = snapshot.getProject(config);
    assert.ok(project);
    const source = await project.program.getSourceFile(resolve(root, 'src/interfaces/public.ts'));
    assert.ok(source);
    const module = await project.checker.getSymbolAtLocation(source);
    assert.ok(module);
    const exports = await project.checker.getExportsOfModule(module);
    assert.deepEqual(exports.map(symbol => symbol.name).sort(), [
      'Contract', 'default', 'ownAlias', 'ownValue', 'unselectedExport',
    ]);
    assert.ok(ticks > 0, 'The parent JavaScript event loop must run during native requests');
  } finally {
    clearInterval(timer);
    await api.close();
  }
  assert.ok(snapshot?.isDisposed());

  let closePromise: Promise<void> | undefined;
  const pendingApi = new API({
    cwd: root,
    fs: {
      readFile: path => {
        if (path === config) {
          // Close while parseConfigFile is waiting for a real native FS callback.
          // No snapshot exists here, so close has no release request to await.
          queueMicrotask(() => { closePromise = pendingApi.close(); });
        }
        try { return readFileSync(path, 'utf8'); } catch { return null; }
      },
    },
  });
  let pendingRequestRejected = false;
  try {
    await pendingApi.parseConfigFile(config);
  } catch (error) {
    assert.ok(error instanceof Error && /dispos|closed/i.test(error.message));
    pendingRequestRejected = true;
  } finally {
    await closePromise;
    await pendingApi.close();
  }
  assert.equal(pendingRequestRejected, true);
  console.log(JSON.stringify({
    probe: 'async-api-feasibility',
    api: 'typescript/unstable/async',
    eventLoopResponsive: ticks > 0,
    selectedExportNamesMatchSyncProbe: true,
    normalCloseDisposesSnapshot: snapshot.isDisposed(),
    pendingConfigRequestRejectedOnClose: pendingRequestRejected,
    pendingCloseHadNoActiveSnapshots: true,
    hardDeadlineOrChildExitGuaranteeEstablished: false,
  }, null, 2));
}

if (process.argv[2] === '--probe-child') {
  await exerciseAsyncApi();
} else {
  assert.ok(process.platform === 'linux' || process.platform === 'darwin');
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--probe-child'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ok(child.pid);
  const group = child.pid;
  const terminate = () => {
    try { process.kill(-group, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  let stdout = '';
  let stderr = '';
  let expired = false;
  const timer = setTimeout(() => { expired = true; terminate(); }, 10_000);
  child.stdout.on('data', bytes => { stdout += bytes.toString(); });
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  try {
    const code = await new Promise<number | null>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', exitCode => resolveExit(exitCode));
    });
    assert.equal(expired, false, 'bounded async feasibility child');
    assert.equal(code, 0, stderr);
    process.stdout.write(stdout);
  } finally {
    clearTimeout(timer);
    terminate();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
