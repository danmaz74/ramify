import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { installedCommand, packageRoot, sha256 } from './common.mjs';

/**
 * Shared fixture/process helpers for the Plan 2A `ramify materialize` scale
 * and platform evidence (I2A-12), and reused by the process/workflow evidence
 * (I2A-11) where noted. Conventions follow `resident-driver.mjs`/`fast-driver.mjs`:
 * an isolated copy per run, an owned `RAMIFY_ENDPOINT_DIR`, the installed
 * launcher, and explicit cleanup in `finally`.
 */

const excludedTopLevel = new Set(['node_modules', 'dist', '.git', '.reference-work', 'site', 'examples',
  '.cucumber-viz', '.claude', '.agents', '.devcontainer', '.github', '.vite']);

/** Reserved generated-output names, excluded at every depth: a source tree
 * (including the checked-out `examples/collection-review`) can carry real,
 * gitignored `.ramify` output on disk from an earlier materialize run, and
 * an "isolated" copy must never inherit it as pre-existing content. */
const generatedNamePattern = /^\.ramify(?:\.(?:tmp|old)-[0-9a-f]+)?$/;

async function copyTree(sourceRoot, destinationRoot, excluded) {
  await mkdir(destinationRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (excluded.has(entry.name) || generatedNamePattern.test(entry.name)) continue;
    const from = join(sourceRoot, entry.name), to = join(destinationRoot, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await copyTree(from, to, excluded);
    else await copyFile(from, to);
  }
}
async function copyFile(from, to) {
  const { copyFile: cp } = await import('node:fs/promises');
  await cp(from, to);
}

/**
 * An isolated copy of the reference example or the whole toolkit, with the
 * real `node_modules` symlinked in (matching `resident-driver.mjs`'s own
 * `fixture()` convention for the reference project) rather than copied, since
 * `ramify materialize` needs real TypeScript module resolution but every
 * measurement here owns disposable generated `.ramify` output only.
 */
export async function isolatedProject(kind, scratchRoot) {
  assert.ok(['R', 'T'].includes(kind), 'Unknown isolated project kind');
  await mkdir(scratchRoot, { recursive: true });
  const root = await mkdtemp(join(scratchRoot, `${kind.toLowerCase()}-`));
  const source = kind === 'R' ? join(packageRoot, 'examples/collection-review') : packageRoot;
  await copyTree(source, root, kind === 'R' ? new Set(['node_modules', 'dist', '.reference-work', '.git', '.vite']) : excludedTopLevel);
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
  return { root, kind, dispose: () => rm(root, { recursive: true, force: true }) };
}

/** A minimal generic-purpose command runner, matching `resident-driver.mjs`'s
 * own `command()`: detached so an owned daemon it starts can be killed by
 * process group, buffered output, a finite timeout. */
export async function runCommand(executable, args, { cwd = packageRoot, env = {}, timeoutMs = 130_000 } = {}) {
  const started = performance.now();
  const child = spawn(executable, args, { cwd, detached: true,
    env: { ...process.env, NODE_OPTIONS: '', NO_COLOR: '1', FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [], err = [];
  let bytes = 0, failure = null;
  const stop = message => {
    failure ??= message;
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  };
  for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => {
    bytes += chunk.length; if (bytes > 64 * 1024 ** 2) stop('Measured command output exceeded 64 MiB'); else chunks.push(chunk);
  });
  child.once('error', error => { failure = error.message; });
  const deadline = setTimeout(() => stop(`Measured command exceeded ${timeoutMs} ms`), timeoutMs);
  const exit = await new Promise(resolveExit => child.once('close', (code, signal) => resolveExit({ code, signal })));
  clearTimeout(deadline);
  return { pid: child.pid, ...exit, durationMs: performance.now() - started, failure,
    stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') };
}

/**
 * Starts polling `daemon status --format json` at `intervalMs` until `stop()`
 * is called, tracking the daemon's own self-reported peak RSS/heap (real
 * `process.memoryUsage()` samples taken inside the daemon process itself, not
 * an external estimate). Sampled peaks can miss sub-interval spikes, matching
 * every other measurement recipe's documented limitation.
 */
export function pollDaemonStatus(executable, env, cwd, intervalMs = 100) {
  const samples = [];
  let stopped = false, timer = null, pid = null;
  const poll = async () => {
    if (stopped) return;
    try {
      const result = spawnSync(executable, ['daemon', 'status', '--format', 'json'], { cwd, encoding: 'utf8',
        timeout: 5000, env: { ...process.env, NODE_OPTIONS: '', ...env } });
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout);
        if (parsed.running && parsed.status?.memory) {
          pid = parsed.status.pid ?? pid;
          // The daemon host's own `process.memoryUsage()` never includes its
          // worker thread or native compiler child; both are separately
          // reported per open context when hot/warm. Combined RSS/heap sums
          // all three, matching the resident-measurement convention ("RSS
          // growth includes the separate worker supervisor and compiler as
          // well as the daemon").
          const contexts = Array.isArray(parsed.status.contexts) ? parsed.status.contexts : [];
          const workerRss = Math.max(0, ...contexts.map(c => c.session?.worker?.rss ?? 0));
          const workerHeap = Math.max(0, ...contexts.map(c => c.session?.worker?.heapUsed ?? 0));
          const compilerRss = Math.max(0, ...contexts.map(c => c.session?.compiler?.rss ?? 0));
          samples.push({ at: performance.now(), daemonRss: parsed.status.memory.rss, daemonHeapUsed: parsed.status.memory.heapUsed,
            external: parsed.status.memory.external, workerRss, workerHeap, compilerRss,
            combinedRss: parsed.status.memory.rss + workerRss + compilerRss, combinedHeap: parsed.status.memory.heapUsed + workerHeap });
        }
      }
    } catch { /* the daemon may not be up yet between polls; ignore transient failures */ }
    if (!stopped) timer = setTimeout(poll, intervalMs);
  };
  timer = setTimeout(poll, 0);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      return { pid, samples, sampleCount: samples.length,
        peakDaemonRssBytes: Math.max(0, ...samples.map(s => s.daemonRss)),
        peakDaemonHeapUsedBytes: Math.max(0, ...samples.map(s => s.daemonHeapUsed)),
        peakCombinedRssBytes: Math.max(0, ...samples.map(s => s.combinedRss)),
        peakCombinedHeapBytes: Math.max(0, ...samples.map(s => s.combinedHeap)) };
    },
  };
}

const materializeSummary = /^Root: .+\nMaterialized: revision (\d+); (\d+) target\(s\), (\d+) entries, (\d+) bytes written, (\d+) unchanged\n$/;
export function parseMaterializeSummary(stdout) {
  const match = materializeSummary.exec(stdout);
  assert.ok(match, `Unexpected materialize output: ${stdout}`);
  return { revision: Number(match[1]), targets: Number(match[2]), entries: Number(match[3]),
    bytesWritten: Number(match[4]), unchanged: Number(match[5]) };
}

/** Every real generated `.ramify` area directory under `root` (never a
 * `.ramify.tmp-*`/`.ramify.old-*` sibling), classified ordinary/tests by path. */
export async function generatedAreas(root) {
  const areas = [];
  async function walk(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(current, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.name === '.ramify') {
        const relativePath = relative(root, path);
        areas.push({ path, relativePath, kind: relativePath.includes('/src/tests/.ramify') || relativePath.endsWith('src/tests/.ramify') ? 'tests' : 'ordinary' });
        continue;
      }
      if (/^\.ramify\.(tmp|old)-/.test(entry.name)) continue;
      await walk(path);
    }
  }
  await walk(root);
  return areas;
}

async function filesUnderArea(areaPath) {
  const results = [];
  async function walk(current, prefix) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path, rel);
      else results.push({ relativePath: rel, path });
    }
  }
  await walk(areaPath, '');
  return results.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
}

/** Count `## ` top-level headings: one rendered entry per the spec. */
function countEntries(markdown) {
  return (markdown.match(/^## /gm) ?? []).length;
}

/**
 * Files/entries/bytes per area, the largest ordinary and tests area, and
 * ordinary/tests duplication: files that exist at the identical relative path
 * (after `.ramify/`) in both an ordinary and its sibling tests area for the
 * same module, counted only when byte-identical (the common, honestly
 * countable case; a file present in both but changed by the testing profile
 * is recorded separately, never folded into "duplicated").
 */
export async function materializeMetrics(root) {
  const areas = await generatedAreas(root);
  const detail = [];
  for (const area of areas) {
    const files = await filesUnderArea(area.path);
    let bytes = 0, entries = 0;
    const byRelative = new Map();
    for (const file of files) {
      const contents = await readFile(file.path);
      bytes += contents.length;
      if (file.relativePath !== '_meta.json') { entries += countEntries(contents.toString('utf8')); byRelative.set(file.relativePath, contents); }
    }
    const moduleMatch = /^(.*?)\/?src(?:\/tests)?\/\.ramify$/.exec(area.relativePath);
    detail.push({ ...area, files: files.length, entries, bytes, byRelative, module: moduleMatch?.[1] || '.' });
  }
  let duplicatedBytes = 0, duplicatedEntries = 0, changedBetweenAreas = 0;
  const byModule = new Map();
  for (const area of detail) {
    const bucket = byModule.get(area.module) ?? {}; bucket[area.kind] = area; byModule.set(area.module, bucket);
  }
  for (const { ordinary, tests } of byModule.values()) {
    if (!ordinary || !tests) continue;
    for (const [relativePath, contents] of ordinary.byRelative) {
      const testContents = tests.byRelative.get(relativePath);
      if (!testContents) continue;
      if (contents.equals(testContents)) {
        duplicatedBytes += contents.length;
        if (relativePath !== '_meta.json') duplicatedEntries += countEntries(contents.toString('utf8'));
      } else changedBetweenAreas++;
    }
  }
  const totals = detail.reduce((sum, area) => ({ files: sum.files + area.files, entries: sum.entries + area.entries, bytes: sum.bytes + area.bytes }),
    { files: 0, entries: 0, bytes: 0 });
  const largest = kind => detail.filter(area => area.kind === kind).sort((a, b) => b.bytes - a.bytes)[0];
  const strip = area => area ? { module: area.module, files: area.files, entries: area.entries, bytes: area.bytes } : null;
  return { areas: detail.length, ...totals, duplicatedBytes, duplicatedEntries, changedBetweenAreas,
    largestOrdinary: strip(largest('ordinary')), largestTests: strip(largest('tests')) };
}

export { installedCommand, packageRoot, sha256 };
