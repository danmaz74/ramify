import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { alive, archive, packageRoot } from './resident-probe.js';

const directory = await mkdtemp(join(tmpdir(), 'rf-atomic-'));
const children: ReturnType<typeof spawn>[] = [];
try {
  const record = join(directory, 'record.json');
  await writeFile(record, JSON.stringify({ sequence: 0, payload: '000000'.repeat(10000) }));
  let finished = 0;
  const outcomes = Array.from({ length: 8 }, (_, index) => {
    const child = spawn(process.execPath, [resolve(packageRoot, 'scripts/probes/fixtures/atomic-contender.mjs'), directory, String(index)],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    children.push(child);
    let output = ''; child.stdout!.setEncoding('utf8').on('data', chunk => { output += chunk; });
    return once(child, 'close').then(([code]) => { assert.equal(code, 0); finished++; return JSON.parse(output); });
  });
  const all = Promise.all(outcomes);
  // Attach rejection handling immediately while the independent reader runs.
  let failure: unknown; void all.catch(error => { failure = error; });
  let reads = 0; let last = 0;
  const seen = new Set<number>();
  const deadline = performance.now() + 20000;
  while (finished < 8) {
    if (failure) throw failure;
    assert.ok(performance.now() < deadline, 'Contenders timed out');
    const value = JSON.parse(await readFile(record, 'utf8'));
    assert.equal(value.payload, String(value.sequence).padStart(6, '0').repeat(10000));
    assert.ok(value.sequence >= last); last = value.sequence; reads++; seen.add(last);
  }
  const contenders = await all;
  assert.equal(JSON.parse(await readFile(record, 'utf8')).sequence, 160);
  assert.ok(reads > 0 && seen.size > 1);
  assert.ok(contenders.reduce((sum, item) => sum + item.collisions, 0) > 0);
  const deadPid: number = contenders[0].pid;
  assert.equal(alive(deadPid), false);
  await writeFile(join(directory, 'start.lock'), JSON.stringify({ pid: deadPid, at: Date.now() - 31000 }));
  const stale = JSON.parse(await readFile(join(directory, 'start.lock'), 'utf8'));
  assert.equal(alive(stale.pid), false);
  await archive('atomic-record', { readers: 1, reads, distinctSequencesObserved: seen.size,
    replacements: 160, partialRecords: 0, contenders, overlappingCriticalSections: 0,
    deadPidDetected: true, livePidDetected: alive(process.pid),
    decision: 'Same-directory rename is atomic to readers; exclusive creation serializes eight processes. Reclaim only dead-pid locks; age alone must not break a live holder.' });
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL'); await once(child, 'close');
  }
  await rm(directory, { recursive: true, force: true });
}
