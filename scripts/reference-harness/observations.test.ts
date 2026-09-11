import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { archiveObservation, captureObservations, recordObservation, traceEvidence } from './observations.js';
import { repositoryRoot } from './plan.js';

it('keeps complete portable raw evidence outside the bounded inline observation', async () => {
  const data = { path: join(repositoryRoot, 'src/cli.ts:12'), command: process.execPath,
    stdout: 'retained report bytes\n'.repeat(60_000), tail: 'final record retained' };
  const raw = await archiveObservation('large-process', data);
  try {
    const compressed = await readFile(join(repositoryRoot, raw.artifact));
    const bytes = gunzipSync(compressed);
    const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
    expect([compressed.length, bytes.length, hash(compressed), hash(bytes)])
      .toEqual([raw.gzipBytes, raw.bytes, raw.gzipSha256, raw.sha256]);
    expect(JSON.parse(bytes.toString())).toEqual({ kind: 'large-process',
      data: { ...data, path: '<toolkit>/src/cli.ts:12', command: 'node' } });
    const captured = await captureObservations(async () => {
      recordObservation('large-process', { code: 0, survivingAfterKill: [], raw });
    });
    expect(Buffer.byteLength(JSON.stringify(captured.observations))).toBeLessThan(1024);
    expect(raw.bytes).toBeGreaterThan(1024 ** 2);
  } finally { await rm(join(repositoryRoot, raw.artifact)); }
});

it('retains descendant and exit accounting in compact process trace evidence', () => {
  const summary = traceEvidence([{ pid: 20, event: 'start' }, { pid: 20, event: 'spawn', child: 21 },
    { pid: 21, event: 'load', url: 'node:fs' }, { pid: 20, event: 'exit', code: 0, handles: 0, opened: 2, closed: 2, signalListeners: 0 }]);
  expect(summary).toMatchObject({ eventCount: 4, processCount: 2,
    eventsByKind: { start: 1, spawn: 1, load: 1, exit: 1 },
    processes: [{ pid: 20, eventCount: 3, children: [21], exit: { code: 0, handles: 0, opened: 2, closed: 2, signalListeners: 0 } },
      { pid: 21, eventCount: 1, children: [], exit: null }] });
});
