import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

assert.ok(process.platform === 'linux' || process.platform === 'darwin');
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, 'fixtures/compiler-api');
const childEntry = resolve(directory, 'fixtures/supervised-compiler-child.ts');

function processes() {
  return execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'stat=', '-o', 'comm='], { encoding: 'utf8' })
    .trim().split('\n').flatMap(line => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
      return match ? [{ pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]), state: match[4], command: match[5] }] : [];
    });
}

async function run(mode: 'normal' | 'stall') {
  // The real adapter supplies its one ProjectInputView here. This probe uses
  // one memoized capture per invocation and never lets the helper read inputs.
  const observations = new Map<string, unknown>();
  const observed = (method: string, path: string, read: () => unknown) => {
    const key = `${method}\0${path}`;
    if (!observations.has(key)) observations.set(key, read());
    return observations.get(key);
  };
  const view = {
    readFile: (path: string) => observed('readFile', path, () => {
      try { return readFileSync(path, 'utf8'); } catch { return null; }
    }),
    fileExists: (path: string) => observed('fileExists', path, () => {
      try { return statSync(path).isFile(); } catch { return false; }
    }),
    directoryExists: (path: string) => observed('directoryExists', path, () => {
      try { return statSync(path).isDirectory(); } catch { return false; }
    }),
    readDirectory: (path: string) => observed('readDirectory', path, () => {
      try {
        const entries = readdirSync(path, { withFileTypes: true });
        return { files: entries.filter(entry => entry.isFile()).map(entry => entry.name), directories: entries.filter(entry => entry.isDirectory()).map(entry => entry.name) };
      } catch { return { files: [], directories: [] }; }
    }),
    realPath: (path: string) => observed('realPath', path, () => {
      try { return realpathSync(path); } catch { return path; }
    }),
  };
  const child = spawn(process.execPath, ['--import', 'tsx', childEntry, root, mode], {
    stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
  assert.ok(child.pid);
  const group = child.pid;
  const killGroup = (signal: NodeJS.Signals) => {
    try { process.kill(-group, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  child.stdin.on('error', () => { /* The deadline intentionally closes a pending reply pipe. */ });
  let result: { kind: 'result'; selectedFiles: number; exportNames: string[]; snapshotDisposed: boolean } | undefined;
  let nativePid: number | undefined;
  let ticks = 0;
  let stallObserved = false;
  let hardLimitHit = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const ticker = setInterval(() => { ticks++; }, 1);
  const hardLimit = setTimeout(() => { hardLimitHit = true; killGroup('SIGKILL'); }, 10_000);
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  let protocolFailure: unknown;
  lines.on('line', line => {
    try {
      const message = JSON.parse(line) as { kind: string; id: number; method: keyof typeof view; path: string; stall: boolean };
      if (message.kind === 'result') {
        result = JSON.parse(line) as typeof result;
        return;
      }
      assert.equal(message.kind, 'request');
      assert.ok(Object.hasOwn(view, message.method));
      if (message.stall) {
        assert.equal(mode, 'stall');
        stallObserved = true;
        const descendants = processes().filter(item => item.parent === group && item.group === group);
        const native = descendants.find(item => /(?:^|\/)(?:tsgo|tsc)$/.test(item.command));
        assert.ok(native, `the stopped request must have the real native compiler descendant: ${JSON.stringify(descendants)}`);
        nativePid = native.pid;
        // Withhold this response deliberately: helper and native compiler wait
        // while the supervising parent continues to run and owns the deadline.
        deadline = setTimeout(() => { killGroup('SIGKILL'); }, 100);
        return;
      }
      const value = view[message.method](message.path);
      child.stdin.write(`${JSON.stringify({ id: message.id, result: value })}\n`);
    } catch (error) {
      protocolFailure = error;
      killGroup('SIGKILL');
    }
  });
  let exit: Awaited<typeof closed>;
  try {
    exit = await closed;
  } finally {
    clearInterval(ticker);
    clearTimeout(hardLimit);
    if (deadline) clearTimeout(deadline);
    lines.close();
    killGroup('SIGKILL');
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
  assert.equal(hardLimitHit, false, stderr);
  if (protocolFailure) throw protocolFailure;
  assert.ok(ticks > 0);
  if (mode === 'normal') {
    assert.equal(exit.code, 0, stderr);
    assert.ok(result?.snapshotDisposed);
    assert.equal(result.selectedFiles, 5);
  } else {
    assert.equal(stallObserved, true);
    assert.equal(exit.signal, 'SIGKILL');
    assert.equal(result, undefined, 'deadline cannot publish late success');
    const native = processes().find(item => item.pid === nativePid);
    assert.ok(!native || native.state.startsWith('Z'), 'native descendant must have terminated');
  }
  return {
    mode,
    parentEventLoopResponsive: ticks > 0,
    parentCapturedObservations: observations.size,
    allCompilerFileReadsUseParentView: true,
    nativeDescendantObservedBeforeDeadline: mode === 'stall',
    stalledReplyTerminatedAsProcessGroup: mode === 'stall',
    noLateSuccess: mode !== 'stall' || result === undefined,
    exit: mode === 'normal' ? 'completed' : 'deadline-terminated',
  };
}

const normal = await run('normal');
const stalled = await run('stall');
console.log(JSON.stringify({
  probe: 'supervised-compiler',
  nativeApi: 'typescript/unstable/sync',
  transport: 'private inherited stdin/stdout pipes, one request at a time',
  supervisor: 'one-shot POSIX process group; no worker pool or listener',
  outcomes: [normal, stalled],
  ramifyAnalysisSessionImplemented: false,
}, null, 2));
