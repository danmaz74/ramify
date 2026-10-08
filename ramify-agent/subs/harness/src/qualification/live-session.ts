import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createPiAgent } from '../../subs/agent/subs/pi/src/pi-agent.js';
import type { AgentSessionPoint, AgentSessionSnapshot, SessionExecutionBindings, SessionExecutionPolicy, SessionOperationHandle, SessionOperationReceipt, SessionOperations, SessionStore, SessionTaskInput, SessionToolDeclaration } from '../../subs/agent/src/interfaces/session-operations.js';
import type { ToolDefinition } from '../../subs/agent/src/interfaces/port.js';
import { openSessionStore } from '../run/session-store.js';

export interface Plan23LiveSessionOptions {
  readonly phase: 'initial' | 'restore'; readonly runId: string; readonly sourceCandidate: string;
  readonly workingDirectory: string; readonly storeDirectory: string; readonly evidenceDirectory: string; readonly handoffFile: string;
  readonly operationTimeoutMs: number; readonly settlementTimeoutMs: number;
}
export interface Plan23LiveSessionResult {
  readonly schema: 'ramify-agent.plan23-live-session/1'; readonly phase: 'initial' | 'restore'; readonly runId: string; readonly sourceCandidate: string;
  readonly model: 'openai-codex/gpt-5.6-sol'; readonly packageVersion: '0.87.1'; readonly transport: 'sse'; readonly providerRetries: 0;
  readonly status: 'completed' | 'failed' | 'unavailable'; readonly reason: string | null; readonly handoffFile: string; readonly evidenceFile: string;
}
const model = 'openai-codex/gpt-5.6-sol';
const schema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };
const declaration = (name: string): SessionToolDeclaration => ({ name, description: 'Submit the exact required summary for the current task.', inputSchema: schema, mutating: false });
const policy: SessionExecutionPolicy = { context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, authority: { read: 'qualification.txt', write: false }, validator: { revision: 'plan23-live/1' }, destination: { evidence: 'plan23-live/1' } };
const assert: (value: unknown, reason: string) => asserts value = (value, reason) => { if (!value) throw new Error(reason); };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface Handoff { schema: 'ramify-agent.plan23-live-handoff/1'; runId: string; sourceCandidate: string; initialPid: number; fixture: string; right: AgentSessionPoint; retryTask: SessionTaskInput; retryReceipt: SessionOperationReceipt }
interface Capture { readonly name: string; readonly snapshot: AgentSessionSnapshot; readonly payloads: readonly { readonly key: string; readonly kind: string; readonly payloadId: string; readonly file: string; readonly hash: string }[] }
/** Production facade owns Pi and storage; public options/results contain only plain qualification inputs. */
export async function runPlan23LiveSession(options: Plan23LiveSessionOptions): Promise<Plan23LiveSessionResult> {
  const store = await openSessionStore({ directory: options.storeDirectory });
  try {
    const operations = createPiAgent({ model, sessionStore: store }).sessionOperations;
    if (!operations) throw new Error('Supported production session operations unavailable');
    return await runPlan23LiveSessionOn(options, { operations, store });
  } finally { await store.close(); }
}
/** Same-owner ordinary injection; not exposed outside harness. No opaque provider decoding occurs here. */
export async function runPlan23LiveSessionOn(options: Plan23LiveSessionOptions, ports: { readonly operations: SessionOperations; readonly store: SessionStore }): Promise<Plan23LiveSessionResult> {
  const { operations, store } = ports;
  const evidenceFile = join(options.evidenceDirectory, `${options.phase}.json`);
  const result = (status: Plan23LiveSessionResult['status'], reason: string | null): Plan23LiveSessionResult => ({ schema: 'ramify-agent.plan23-live-session/1', phase: options.phase, runId: options.runId, sourceCandidate: options.sourceCandidate, model, packageVersion: '0.87.1', transport: 'sse', providerRetries: 0, status, reason, handoffFile: options.handoffFile, evidenceFile });
  const activeHandles = new Set<SessionOperationHandle>();
  const captures: Capture[] = []; const receipts: SessionOperationReceipt[] = []; const submissions: unknown[] = []; const publications: SessionOperationReceipt[] = []; const events: unknown[] = []; let reads = 0;
  const runId = options.runId;
  const physicalStoreChecks: { operation: string; files: readonly { path: string; hash: string }[] }[] = [];
  async function physicalStoreInventory() {
    const files: { path: string; hash: string }[] = [];
    async function walk(directory: string) { for (const name of (await readdir(directory)).sort()) { const path = join(directory, name); const info = await lstat(path); if (info.isSymbolicLink()) throw new Error('Unexpected symlink in qualification store'); if (info.isDirectory()) await walk(path); else if (info.isFile()) files.push({ path: relative(options.storeDirectory, path), hash: digest(await readFile(path)) }); else throw new Error('Unexpected store file kind'); } }
    await walk(options.storeDirectory); return files;
  }
  async function capture(name: string, point: AgentSessionPoint, current = false): Promise<AgentSessionSnapshot> {
    const snapshot = await operations.inspect(runId, point.sessionId, current ? undefined : point); assert(snapshot && (current || snapshot.available), `Snapshot unavailable: ${name}`);
    const payloads = [];
    for (const entry of snapshot.transcript) {
      const bytes = await store.getPayload(entry.payloadId); assert(bytes, `Original payload unavailable: ${entry.payloadId}`);
      const file = join(options.evidenceDirectory, `payload-${entry.payloadId}.bin`); await writeFile(file, bytes);
      payloads.push({ ...entry, file, hash: digest(bytes) });
    }
    captures.push({ name, snapshot, payloads }); return snapshot;
  }
  const task = (role: string, summary: string, submissionTool: string, operation: string): SessionTaskInput => ({ role, message: `Current ${role} task. ${summary.startsWith('READ:') ? `First call qualification_read with {}. Construct summary by concatenating READ: with the exact returned file content, then call ${submissionTool} with that computed summary.` : `Call ${submissionTool} with summary exactly ${JSON.stringify(summary)}.`} Inactive historical tools must not be called.`, submissionTool, environment: { workingDirectory: options.workingDirectory, candidate: options.sourceCandidate, snapshot: null, limits: {} }, policyIdentity: 'plan23-live-policy/1', validatorIdentity: `plan23-live-validator:${operation}`, destinationIdentity: `plan23-live-destination:${operation}` });
  let barrierEntered!: () => void; let barrierRelease!: () => void;
  const entered = new Promise<void>(resolve => { barrierEntered = resolve; }); const barrier = new Promise<void>(resolve => { barrierRelease = resolve; });
  const readTool: ToolDefinition = { name: 'qualification_read', description: 'Read the harmless qualification fixture.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, async execute() { reads++; return { text: await readFile(join(options.workingDirectory, 'qualification.txt'), 'utf8') }; } };
  const barrierTool: ToolDefinition = { name: 'qualification_barrier', description: 'Enter the required qualification stop barrier.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, async execute() { barrierEntered(); await barrier; return { text: 'Barrier released.' }; } };
  const bindings = (current: SessionTaskInput, expected: string): SessionExecutionBindings => ({ task: current, policy, tools: [readTool, barrierTool], currentAuthority: async actual => same(actual, current), submission: { name: current.submissionTool, async accept(input) { if (!same(input, { summary: expected })) return { accepted: false, errors: ['Exact independently expected summary required'] }; submissions.push({ operation: current.destinationIdentity, input }); return { accepted: true }; } }, onEvent: event => events.push(event), publish: async receipt => { publications.push(receipt); } });
  async function bounded<T>(promise: Promise<T>, ms: number, label: string): Promise<T> { let timeout: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]); } finally { if (timeout) clearTimeout(timeout); } }
  async function finish(handle: SessionOperationHandle): Promise<SessionOperationReceipt> {
    activeHandles.add(handle); let receipt: SessionOperationReceipt;
    try { receipt = await bounded(handle.receipt, options.operationTimeoutMs, 'Operation'); }
    catch (error) { await bounded(handle.stop(), options.settlementTimeoutMs, 'Stopped settlement'); throw error; }
    const settled = await bounded(handle.settled(), options.settlementTimeoutMs, 'Settlement'); assert(same(receipt, settled), 'Receipt/settlement mismatch'); receipts.push(receipt); activeHandles.delete(handle); return receipt;
  }
  async function perform(point: AgentSessionPoint, operationId: string, current: SessionTaskInput, expected: string, change = { add: [] as SessionToolDeclaration[], activate: [] as string[], inactivate: [] as string[] }, additions: { key: string; kind: 'role-instructions' | 'brief'; text: string; revision: string }[] = []) {
    const receipt = await finish(await operations.continue({ runId, operationId, sessionId: point.sessionId, expectedPoint: point, task: current, additions, toolChange: change, policy, bindings: bindings(current, expected) })); assert(receipt.status === 'completed' && receipt.point, `Operation ${operationId} did not complete: ${receipt.reason}`); return receipt;
  }
  try {
    assert(options.runId && options.sourceCandidate && options.operationTimeoutMs > 0 && options.settlementTimeoutMs > 0, 'Explicit identity and positive bounds required');
    assert([options.workingDirectory, options.storeDirectory, options.evidenceDirectory, options.handoffFile].every(isAbsolute), 'Absolute qualification paths required');
    await mkdir(options.evidenceDirectory, { recursive: true }); const cwd = await realpath(options.workingDirectory); const evidence = await realpath(options.evidenceDirectory);
    const relation = relative(cwd, evidence); assert(relation.startsWith('..') || isAbsolute(relation), 'Evidence must be outside analyzed fixture');
    if (options.phase === 'initial') {
      const fixture = 'plan23-independent-read-token'; await writeFile(join(cwd, 'qualification.txt'), fixture);
      const tools = [declaration('submit_initial'), { name: readTool.name, description: readTool.description, inputSchema: readTool.inputSchema, mutating: false }];
      const created = await operations.create({ runId, operationId: 'create', initialInstructions: 'Plan23 exact immutable initial role. Follow the current task and designated submission tool. Read only the harmless qualification fixture. Preserve every inherited message and tool definition.', declarations: tools, activate: tools.map(value => value.name), policy }); assert(created.point, 'Create point missing');
      const first = await perform(created.point, 'first-task', task('initial reader', `READ:${fixture}`, 'submit_initial', 'first-task'), `READ:${fixture}`); assert(reads === 1, 'Initial task must read the real fixture exactly once'); const t1 = first.point!; const original = await capture('T1', t1);
      const append = { runId, operationId: 'append-B', sessionId: t1.sessionId, expectedPoint: t1, additions: [{ key: 'brief-B', kind: 'brief' as const, text: 'B: independently captured post-T1 brief.', revision: 'B/1' }] };
      const appended = await operations.appendContext(append); assert(appended.point && appended.point.turn === t1.turn && appended.point.kind === 'checkpoint', 'Model-free append checkpoint required'); assert(same(appended, await operations.appendContext(append)), 'Append replay must be identical'); const c1 = appended.point; const appendedSnapshot = await capture('C1', c1); assert(same(appendedSnapshot.transcript.filter(entry => entry.kind === 'provider'), original.transcript.filter(entry => entry.kind === 'provider')), 'Model-free append added provider request/state'); assert(same(await operations.inspect(runId, c1.sessionId, c1), appendedSnapshot), 'Append replay changed captured C1');
      const l = await operations.fork({ runId, operationId: 'fork-left', sourcePoint: t1 }); const r = await operations.fork({ runId, operationId: 'fork-right', sourcePoint: c1 }); assert(l.point && r.point && l.sessionId !== r.sessionId, 'Distinct sibling fork identities required');
      const left = await capture('left-source', l.point); const right = await capture('right-source', r.point);
      assert(same(left.transcript, original.transcript) && !left.additions.some(item => item.key === 'brief-B'), 'Left must preserve exact T1 prefix without B'); assert(right.additions.some(item => item.key === 'brief-B'), 'Right must inherit B from C1');
      const change = { add: [declaration('submit_later')], activate: ['submit_later'], inactivate: ['submit_initial'] }; const addition = [{ key: 'later-role', kind: 'role-instructions' as const, text: 'Later independent reviewer role. Use submit_later; submit_initial is inactive.', revision: 'reviewer/1' }];
      const lt = await perform(l.point, 'left-task', task('left reviewer', 'LEFT', 'submit_later', 'left-task'), 'LEFT', change, addition); const retryTask = task('right reviewer', 'RIGHT', 'submit_later', 'right-task'); const rt = await perform(r.point, 'right-task', retryTask, 'RIGHT', change, addition);
      await capture('left-settled', lt.point!); await capture('right-settled', rt.point!);
      const parent = await operations.appendContext({ runId, operationId: 'append-C', sessionId: c1.sessionId, expectedPoint: c1, additions: [{ key: 'brief-C', kind: 'brief', text: 'C: parent only after siblings captured.', revision: 'C/1' }] }); assert(parent.point, 'Parent C checkpoint missing'); await capture('parent-C', parent.point);
      assert(same(await operations.inspect(runId, t1.sessionId, t1), original), 'Original T1 snapshot changed');
      const handoff: Handoff = { schema: 'ramify-agent.plan23-live-handoff/1', runId, sourceCandidate: options.sourceCandidate, initialPid: process.pid, fixture, right: rt.point!, retryTask, retryReceipt: rt };
      await mkdir(dirname(options.handoffFile), { recursive: true }); await writeFile(options.handoffFile, JSON.stringify(handoff));
    } else {
      const handoff = JSON.parse(await readFile(options.handoffFile, 'utf8')) as Handoff;
      assert(handoff.schema === 'ramify-agent.plan23-live-handoff/1' && handoff.runId === runId && handoff.sourceCandidate === options.sourceCandidate && handoff.initialPid !== process.pid, 'Exact candidate/run and NEW process restoration required');
      const retrySnapshot = await capture('restore-source', handoff.right, true); const retryBytes = await physicalStoreInventory(); const before = { events: events.length, submissions: submissions.length, publications: publications.length, reads };
      const retry = await finish(await operations.retry({ runId, operationId: 'right-task', bindings: bindings(handoff.retryTask, 'RIGHT') })); assert(same(retry, handoff.retryReceipt), 'Terminal Retry receipt changed'); assert(same(before, { events: events.length, submissions: submissions.length, publications: publications.length, reads }), 'Terminal Retry performed new work'); assert(same(await operations.inspect(runId, handoff.right.sessionId), retrySnapshot), 'Terminal Retry changed original transcript/payload references'); assert(same(await physicalStoreInventory(), retryBytes), 'Terminal Retry changed durable ledger/payload bytes'); physicalStoreChecks.push({ operation: 'right-task', files: retryBytes });
      const restored = await perform(handoff.right, 'restore-task', task('restored reviewer', 'RESTORED', 'submit_later', 'restore-task'), 'RESTORED'); await capture('restore-settled', restored.point!);
      const stopTask = { ...task('stop reviewer', 'NEVER ACCEPT', 'submit_later', 'stop-task'), message: 'You MUST call qualification_barrier with {} first. After it returns, submit NEVER ACCEPT using submit_later.' };
      const handle = await operations.continue({ runId, operationId: 'stop-task', sessionId: restored.sessionId, expectedPoint: restored.point!, task: stopTask, additions: [], toolChange: { add: [{ name: barrierTool.name, description: barrierTool.description, inputSchema: barrierTool.inputSchema, mutating: false }], activate: [barrierTool.name], inactivate: [] }, policy, bindings: bindings(stopTask, 'NEVER ACCEPT') });
      activeHandles.add(handle);
      try { await bounded(entered, options.operationTimeoutMs, 'Required tool entry'); } catch (error) { barrierRelease(); await bounded(handle.stop(), options.settlementTimeoutMs, 'Missing barrier stop'); throw error; }
      const stopped = handle.stop(); barrierRelease(); const receipt = await bounded(stopped, options.settlementTimeoutMs, 'Stop'); const settled = await bounded(handle.settled(), options.settlementTimeoutMs, 'Stop settlement'); assert(receipt.status === 'stopped' && receipt.point === null && same(receipt, settled), 'Stopped settled receipt required'); receipts.push(receipt); activeHandles.delete(handle); assert(!submissions.some(value => (value as { operation: string }).operation === stopTask.destinationIdentity), 'Late accepted submission'); assert(!publications.some(value => value.operationId === 'stop-task'), 'Late publication after Stop'); assert(same(await operations.stop({ runId, operationId: 'stop-task', sessionId: restored.sessionId }), receipt), 'Operation-addressed Stop differs'); const stoppedSnapshot = await operations.inspect(runId, restored.sessionId); assert(stoppedSnapshot === null, 'Stopped current point must be unavailable'); await capture('stop-prior-settled-point', restored.point!);
      const stoppedBytes = await physicalStoreInventory(); const beforeRetry = { events: events.length, submissions: submissions.length, publications: publications.length, reads };
      const stoppedRetry = await finish(await operations.retry({ runId, operationId: 'stop-task', bindings: bindings(stopTask, 'NEVER ACCEPT') })); assert(same(stoppedRetry, receipt) && same(beforeRetry, { events: events.length, submissions: submissions.length, publications: publications.length, reads }), 'Stopped Retry performed work');
      assert(same(await operations.inspect(runId, restored.sessionId), stoppedSnapshot), 'Stopped Retry unexpectedly made an unavailable current point available'); assert(same(await physicalStoreInventory(), stoppedBytes), 'Stopped Retry changed durable ledger/payload bytes'); physicalStoreChecks.push({ operation: 'stop-task', files: stoppedBytes });
    }
    const completed = result('completed', null); await writeFile(evidenceFile, JSON.stringify({ ...completed, pid: process.pid, captures, receipts, submissions, publications, events, reads, physicalStoreChecks }, null, 2)); return completed;
  } catch (error) {
    const draining = [...activeHandles].map(handle => handle.stop()); barrierRelease();
    const cleanup = await Promise.allSettled(draining.map(promise => bounded(promise, options.settlementTimeoutMs, 'Failure drainage')));
    const incomplete = cleanup.some(value => value.status === 'rejected');
    const failed = result('failed', `${error instanceof Error ? error.message : String(error)}${incomplete ? '; operation drainage incomplete' : ''}`); await mkdir(options.evidenceDirectory, { recursive: true }); await writeFile(evidenceFile, JSON.stringify({ ...failed, pid: process.pid, captures, receipts, submissions, publications, events, reads, physicalStoreChecks }, null, 2)); return failed;
  }
}
