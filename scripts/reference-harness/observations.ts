import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import type { TraceEvent } from '../../src/tests/process.js';
import { repositoryRoot } from './plan.js';
import { evidenceRoots, portableValue } from './portability.js';

export interface Observation { readonly kind: string; readonly data: unknown }
const recording = new AsyncLocalStorage<Observation[]>();
const compress = promisify(gzip);

/** Complete raw evidence remains available independently of the bounded gate
 * document. Both hashes cover the stored portable bytes; no payload is clipped.
 * Callers retain the fields consumed by gate readers in their inline summary. */
export async function archiveObservation(kind: string, data: unknown) {
  const bytes = Buffer.from(JSON.stringify(portableValue({ kind, data }, await evidenceRoots())));
  const compressed = await compress(bytes);
  const artifact = `.reference-work/evidence/${randomUUID()}.json.gz`;
  await mkdir(join(repositoryRoot, '.reference-work/evidence'), { recursive: true });
  await writeFile(join(repositoryRoot, artifact), compressed, { flag: 'wx', mode: 0o600 });
  const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  return { kind, artifact, encoding: 'gzip' as const, sha256: hash(bytes), gzipSha256: hash(compressed),
    bytes: bytes.length, gzipBytes: compressed.length };
}

/** Process identities, activity counts and final exit facts remain directly
 * reviewable while every module URL and launch argument lives in the archive. */
export function traceEvidence(events: readonly TraceEvent[]) {
  const counts = (items: readonly TraceEvent[]) => Object.fromEntries([...new Set(items.map(item => item.event))]
    .sort().map(kind => [kind, items.filter(item => item.event === kind).length]));
  const pids = [...new Set(events.flatMap(event => [event.pid, ...(event.child === undefined ? [] : [event.child])]))].sort((a, b) => a - b);
  return { eventCount: events.length, processCount: pids.length, eventsByKind: counts(events),
    processes: pids.map(pid => {
      const own = events.filter(event => event.pid === pid);
      const exit = [...own].reverse().find(event => event.event === 'exit');
      return { pid, eventCount: own.length, eventsByKind: counts(own),
        children: own.flatMap(event => event.event === 'spawn' && event.child !== undefined ? [event.child] : []),
        exit: exit ? { code: exit.code, handles: exit.handles, opened: exit.opened, closed: exit.closed,
          signalListeners: exit.signalListeners } : null };
    }) };
}

/** Run-local evidence only. No compiler objects, caches or cross-run retention. */
export function recordObservation(kind: string, data: unknown): void {
  const destination = recording.getStore();
  if (destination) destination.push({ kind, data: JSON.parse(JSON.stringify(data)) });
}

export async function captureObservations<T>(run: () => Promise<T>): Promise<{ value: T; observations: readonly Observation[] }> {
  const observations: Observation[] = [];
  const value = await recording.run(observations, run);
  return { value, observations };
}

export function analysisEvidence(report: AnalysisReport) {
  return { schemaVersion: report.schemaVersion, runId: report.runId, inputId: report.inputId,
    request: report.request, scope: report.scope, capabilities: report.capabilities,
    stages: report.stages, outcome: report.outcome, summary: report.summary,
    diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage };
}
