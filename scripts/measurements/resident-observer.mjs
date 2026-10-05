import { processRows } from './process-observer.mjs';

/** Records one short-lived entry's footprint from its external samples and
 * measured wall time. When no sample holds resident bytes and the process
 * exited before one sampler interval elapsed, the record says it completed
 * below sampling resolution and reports no RSS instead of zero bytes. A
 * process that ran at least one interval keeps its sampled peak, even zero. */
export function entryFootprint(samples, durationMs, intervalMs) {
  const peak = Math.max(0, ...samples.map(sample => sample.combinedRssBytes));
  const belowSamplingResolution = peak === 0 && Number.isFinite(durationMs) && durationMs > 0 && durationMs < intervalMs;
  return { rssBytes: belowSamplingResolution ? null : peak, durationMs, samplerIntervalMs: intervalMs,
    belowSamplingResolution, samples };
}

/** The measurement controller is outside every observed process. Descendants
 * remain observed after a daemon or native helper changes parent/process group. */
export function observeResidentProcesses(intervalMs = 50) {
  const observed = new Set(), groups = new Set(), samples = [];
  const started = performance.now();
  let failure = null;
  function sample() {
    try {
      const rows = processRows(); let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) if ((observed.has(row.ppid) || groups.has(row.pgid)) && !observed.has(row.pid)) {
          observed.add(row.pid); groups.add(row.pgid); changed = true;
        }
      }
      const processes = rows.filter(row => observed.has(row.pid));
      samples.push({ at: Date.now(), elapsedMs: performance.now() - started, processes,
        combinedRssBytes: processes.reduce((total, process) => total + process.rssBytes, 0) });
    } catch (error) { failure ??= error.stack ?? String(error); }
  }
  const timer = setInterval(sample, intervalMs);
  return { intervalMs, samples,
    add(pid) { observed.add(pid); groups.add(pid); sample(); },
    mark() { sample(); return samples.length - 1; },
    since(mark, exclude = []) {
      const excluded = new Set(exclude);
      return samples.slice(mark).map(sample => ({ ...sample, processes: sample.processes.filter(process => !excluded.has(process.pid)),
        combinedRssBytes: sample.processes.filter(process => !excluded.has(process.pid)).reduce((total, process) => total + process.rssBytes, 0) }));
    },
    live() { return processRows().filter(row => observed.has(row.pid) || groups.has(row.pgid)); },
    stop() { clearInterval(timer); sample(); if (failure) throw new Error(failure); },
  };
}
