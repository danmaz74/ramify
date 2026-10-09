import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createSessionOperations } from '../../subs/agent/src/session-operations.js';
import type { SessionOperationDriver } from '../../subs/agent/src/interfaces/session-operations.js';
import { openSessionStore } from '../run/session-store.js';
import { runPlan23LiveSessionOn, type Plan23LiveSessionOptions } from '../qualification/live-session.js';
// The qualification helper reads the persisted journal as its evidence.
vi.unmock('../run/session-store.js');
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture(driver?: SessionOperationDriver) {
  const root = await mkdtemp(join(tmpdir(), 'plan23-live-ordinary-')); directories.push(root);
  const workingDirectory = join(root, 'fixture'); const evidenceDirectory = join(root, 'evidence'); const { mkdir } = await import('node:fs/promises'); await mkdir(workingDirectory); await mkdir(evidenceDirectory);
  const options: Plan23LiveSessionOptions = { phase: 'initial', runId: 'ordinary-live-control', sourceCandidate: 'c'.repeat(40), workingDirectory, evidenceDirectory, storeDirectory: join(root, 'store'), handoffFile: join(root, 'handoff.json'), operationTimeoutMs: 5_000, settlementTimeoutMs: 5_000 };
  const store = await openSessionStore({ directory: options.storeDirectory }); const dispatches: string[] = [];
  const scripted: SessionOperationDriver = driver ?? { async dispatch(input, runtime) {
    dispatches.push(input.key.operationId);
    let summary = '';
    if (input.key.operationId === 'first-task') { const read = await runtime.callTool('read-once', 'qualification_read', {}); summary = 'READ:' + read.text; }
    else if (input.key.operationId === 'stop-task') { await runtime.callTool('barrier', 'qualification_barrier', {}); summary = 'NEVER ACCEPT'; }
    else summary = ({ 'left-task': 'LEFT', 'right-task': 'RIGHT', 'restore-task': 'RESTORED' } as Record<string, string>)[input.key.operationId]!;
    const verdict = await runtime.submit(`call-${input.key.operationId}`, { summary }); if (!verdict.accepted) throw new Error('Unexpected fixture validator refusal'); return { kind: 'submitted', input: { summary } };
  } };
  const operations = createSessionOperations({ sessionStore: store, driver: scripted }); return { root, store, operations, options, dispatches };
}
it('live helper binds read-dependent initial submission and exact model-free sibling source points', async () => {
  const f = await fixture(); try {
    const result = await runPlan23LiveSessionOn(f.options, f); expect(result.status).toBe('completed'); expect(f.dispatches).toEqual(['first-task', 'left-task', 'right-task']);
    const evidence = JSON.parse(await readFile(result.evidenceFile, 'utf8'));
    expect(evidence.reads).toBe(1); const t1 = evidence.captures.find((value: { name: string }) => value.name === 'T1').snapshot; const left = evidence.captures.find((value: { name: string }) => value.name === 'left-source').snapshot; const right = evidence.captures.find((value: { name: string }) => value.name === 'right-source').snapshot;
    expect(left.transcript).toEqual(t1.transcript); expect(left.additions).toEqual([]); expect(right.additions.map((value: { key: string }) => value.key)).toEqual(['brief-B']); expect(right.parent.kind).toBe('checkpoint');
    const userPayload = await f.store.getPayload(t1.transcript.find((entry: { key: string }) => entry.key.includes('first-task')).payloadId);
    expect(new TextDecoder().decode(userPayload!)).not.toContain('plan23-independent-read-token');
  } finally { await f.store.close(); }
});
it('live helper terminal retries are model-free and Stop fences a truly entered tool before release', async () => {
  const f = await fixture(); try {
    expect((await runPlan23LiveSessionOn(f.options, f)).status).toBe('completed');
    const handoff = JSON.parse(await readFile(f.options.handoffFile, 'utf8')); handoff.initialPid = -1; await writeFile(f.options.handoffFile, JSON.stringify(handoff)); // Injected ordinary process identity; not native-process proof.
    const restored = await runPlan23LiveSessionOn({ ...f.options, phase: 'restore' }, f); expect(restored.reason).toBeNull(); expect(restored.status).toBe('completed'); expect(f.dispatches).toEqual(['first-task', 'left-task', 'right-task', 'restore-task', 'stop-task']);
    const evidence = JSON.parse(await readFile(restored.evidenceFile, 'utf8')); expect(evidence.receipts.filter((value: { operationId: string }) => value.operationId === 'stop-task')).toHaveLength(2); expect(evidence.receipts.at(-1)).toMatchObject({ status: 'stopped', point: null }); expect(evidence.submissions.map((value: { input: unknown }) => value.input)).toEqual([{ summary: 'RESTORED' }]); expect(evidence.publications.map((value: { operationId: string }) => value.operationId)).toEqual(['restore-task']);
  } finally { await f.store.close(); }
});
it('live helper refuses same-process restore and retains failed evidence without model dispatch', async () => {
  const f = await fixture(); try { expect((await runPlan23LiveSessionOn(f.options, f)).status).toBe('completed'); const before = [...f.dispatches]; const result = await runPlan23LiveSessionOn({ ...f.options, phase: 'restore' }, f); expect(result).toMatchObject({ status: 'failed', reason: 'Exact candidate/run and NEW process restoration required' }); expect(f.dispatches).toEqual(before); } finally { await f.store.close(); }
});
it('live helper stops and drains a timed-out admitted operation without reporting successful recovery', async () => {
  let calls = 0;
  const f = await fixture({ async dispatch(_input, runtime) { calls++; await new Promise<void>(resolve => runtime.signal.addEventListener('abort', () => resolve(), { once: true })); return { kind: 'failed', error: 'aborted' }; } });
  try { const result = await runPlan23LiveSessionOn({ ...f.options, operationTimeoutMs: 20 }, f); expect(result.status).toBe('failed'); expect(result.reason).toContain('Operation timed out'); expect(calls).toBe(1); const snapshot = await f.operations.inspect(f.options.runId, (await f.operations.operationIdentity(f.options.runId, 'first-task'))!.sessionId); expect(snapshot).toBeNull(); } finally { await f.store.close(); }
});
