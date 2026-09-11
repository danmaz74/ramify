import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { budgets, packageRoot } from './common.mjs';

export function processRows() {
  const listing = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,rss=,comm='], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 ** 2 });
  assert.equal(listing.status, 0, listing.error?.message ?? listing.stderr);
  return listing.stdout.trim().split('\n').filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    assert.ok(match, `Cannot parse POSIX ps row: ${line}`);
    return { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), rssBytes: Number(match[4]) * 1024, command: match[5] };
  });
}

/** Observe the measured process and its helper/native descendants from outside. */
export async function measureProcess(executable, argv, options = {}) {
  const { cwd = packageRoot, env = {}, timeoutMs = 130000, signal, onStderr } = options;
  if (signal?.aborted) throw new Error('Measurement interrupted before launch');
  const started = performance.now();
  const child = spawn(executable, argv, { cwd, detached: true,
    env: { ...process.env, NODE_OPTIONS: '', NO_COLOR: '1', FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
  const chunks = [[], [], []], samples = [], observed = new Set([child.pid]), groups = new Set([child.pid]), perProcess = new Map();
  let bytes = 0, failure = null;
  const stop = message => {
    failure ??= message;
    // Stop the owned parent first so it cannot start another detached helper
    // between the last periodic sample and process-group cleanup.
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGSTOP'); } catch (error) { if (error.code !== 'ESRCH') failure += `; ${error.message}`; }
    }
    try {
      const rows = processRows(); let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if ((observed.has(row.ppid) || groups.has(row.pgid)) && !observed.has(row.pid)) {
          observed.add(row.pid); groups.add(row.pgid); changed = true;
        }
      }
    } catch (error) { failure += `; process cleanup observation failed: ${error.message}`; }
    for (const group of groups) if (group) {
      try { process.kill(-group, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const abort = () => stop('Measurement interrupted');
  signal?.addEventListener('abort', abort, { once: true });
  child.once('error', error => { failure = error.message; });
  [child.stdout, child.stderr, child.stdio[3]].forEach((pipe, index) => pipe.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 32 * 1024 ** 2) stop('Measurement subprocess output exceeds 32 MiB');
    else chunks[index].push(chunk);
    if (index === 1) onStderr?.(chunk);
  }));
  const sample = () => {
    try {
      const rows = processRows(); let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if ((observed.has(row.ppid) || groups.has(row.pgid)) && !observed.has(row.pid)) { observed.add(row.pid); groups.add(row.pgid); changed = true; }
      }
      const processes = rows.filter(row => observed.has(row.pid));
      for (const item of processes) {
        const prior = perProcess.get(item.pid);
        perProcess.set(item.pid, { ...item, role: item.pid === child.pid ? 'parent' : item.ppid === child.pid ? 'helper' : 'native-or-helper-descendant',
          peakRssBytes: Math.max(item.rssBytes, prior?.peakRssBytes ?? 0) });
      }
      samples.push({ elapsedMs: performance.now() - started, combinedRssBytes: processes.reduce((total, item) => total + item.rssBytes, 0),
        processes: processes.map(({ pid, ppid, pgid, rssBytes }) => ({ pid, ppid, pgid, rssBytes })) });
    } catch (error) { stop(error.message); }
  };
  sample();
  const timer = setInterval(sample, budgets.sampleIntervalMs);
  const deadline = setTimeout(() => stop(`Measurement subprocess exceeded ${timeoutMs} ms`), timeoutMs);
  const ending = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const durationMs = performance.now() - started;
  clearInterval(timer); clearTimeout(deadline);
  const remaining = processRows().filter(row => observed.has(row.pid) || groups.has(row.pgid));
  if (remaining.length) stop(`Measurement left ${remaining.length} observed descendant processes alive`);
  signal?.removeEventListener('abort', abort);
  const [stdout, stderr, data] = chunks.map(list => Buffer.concat(list).toString('utf8'));
  return { ...ending, durationMs, failure, stdout, stderr, data,
    peakCombinedRssBytes: Math.max(0, ...samples.map(sample => sample.combinedRssBytes)),
    processes: [...perProcess.values()], samples, postExitObservedProcesses: remaining.length };
}
