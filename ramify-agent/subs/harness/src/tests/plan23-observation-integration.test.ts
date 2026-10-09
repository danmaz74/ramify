import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AgentEvent, AgentPort, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { CandidateSource, ChangeHistory } from '../../subs/evidence/src/git.js';
import { deliveredManifestViewSchema, invocationEfficiencySchema, metricsResponseSchema, type Role } from '../interfaces/protocol/runs.js';
import { deliveredScopeInputs } from '../kpi/capture.js';
import { loadPromptPackages } from '../prompts/packages.js';
import type { TaskKind, TaskPacket } from '../prompts/tasks.js';
import { HarnessSessionOperations } from '../run/session-operations.js';
import { evaluationOf, readObservationLog, setupLineIdentitiesOf } from '../projections/metrics.js';
import type { RunView } from '../projections/inputs.js';
import { RunQueries } from '../projections/queries.js';
import { ExcursionWatcher } from '../run/excursions.js';
import { ObservationLog } from '../run/observations.js';
import { PortEventRecorder } from '../run/port-events.js';
import { runLayout } from '../run/records.js';
import { openCandidateSnapshot, snapshotTools } from '../../subs/reviews/src/snapshot.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import { byWork } from './helpers/iterations.js';
import { runPath } from './helpers/runs.js';

vi.mock('node:child_process', async original => (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); try { expectNoProcesses(); } finally { forgetExternalTools(); } });
const t = (seconds: number) => `2026-10-08T00:00:${String(seconds).padStart(2, '0')}.000Z`;
const identity = { runId: 'run', operationId: 'inv-1', sessionId: 'original-session', turn: 2, sourcePoint: { sessionId: 'original-session', turn: 1, kind: 'checkpoint' as const, checkpoint: 'brief-C1' } };
const invocation = { id: 'inv-1', role: 'engineer' as const, work: {}, writer: true, startedAt: t(0), sessionOperation: identity };
const noDetail = { model: null, thinkingLevel: null, stopReason: null, error: null, reasoningTokens: null, cost: null, cacheWrites: null };
const usageEvent: AgentEvent = { type: 'message', role: 'assistant', blocks: [], text: '', detail: noDetail,
  usage: { input: 100, cacheRead: 40, cacheWrite: 10, output: 20, total: 170 }, execution: identity,
  observation: { sourceId: 'message-7', at: t(3), elapsedMs: 120, charge: { model: 'fixed/model', sourceRevision: 'captured-model-r1', ratesPerMillion: { newInput: 2, cachedInput: 0.5, cacheWrite: 3, output: 4 } } } };
const outcome = { ended: 'submitted' as const, outsideScope: [], usage: { input: 100, cacheRead: 40, cacheWrite: 10, output: 20, total: 170 }, settled: { at: t(5), confirmed: true, groupsKilled: 0, lateWrites: [] } };
async function observed() {
  const directory = await temporaryDirectory(); cleanups.push(directory.remove);
  const path = join(directory.path, 'observations.jsonl'); const observations = await ObservationLog.open(path);
  const recorder = new PortEventRecorder({ projectRoot: directory.path, observations, invocation: { id: 'inv-1', role: 'engineer', startedAt: t(0), submissionTool: 'submit', declaredPaths: [join(directory.path, 'src')] },
    context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, excursions: new ExcursionWatcher({ projectRoot: directory.path, index: null, scope: undefined }), judge: { countImplementationRejection: () => async () => {} } });
  recorder.identify(identity); return { directory, path, observations, recorder };
}
/** An engineer's edit: the first mutating call, which reads and searches before it are not. */
async function edited(recorder: PortEventRecorder, callId: string, seconds: number) {
  await recorder.record({ type: 'tool-started', tool: 'edit', callId, input: {}, action: { kind: 'write', paths: ['src/a.ts'] }, mutating: true, execution: identity, observation: { sourceId: `${callId}:start`, at: t(seconds) } });
  await recorder.record({ type: 'tool-finished', tool: 'edit', callId, isError: false, reachedTool: true, execution: identity, observation: { sourceId: `${callId}:end`, at: t(seconds + 1), elapsedMs: 10 } });
}
async function explored(recorder: PortEventRecorder, callId: string, kind: 'read' | 'search', root: string, bytes: number | null, files: string[] | null, seconds: number) {
  const action = kind === 'read' ? { kind, path: 'src/a.ts', range: null } : { kind, path: '..', glob: '**/*.ts', pattern: 'absent' };
  await recorder.record({ type: 'tool-started', tool: kind, callId, input: {}, action, mutating: false, execution: identity, observation: { sourceId: `${callId}:start`, at: t(seconds) } });
  await recorder.record({ type: 'tool-finished', tool: kind, callId, isError: false, reachedTool: true, execution: identity,
    observation: { sourceId: `${callId}:end`, at: t(seconds + 1), elapsedMs: 10, returnedBytes: bytes, files, resolvedScope: [kind === 'read' ? join(root, 'src/a.ts') : join(root, '..')], coverage: kind === 'search' ? ['Scanned bytes unavailable'] : [] } });
}

describe('Plan 23 F6 durable observation integration', () => {
  test('snapshot inspection reaches exploration metrics with candidate-root paths from a separate reader workspace', async () => {
    const f = await observed();
    const source = scriptedCandidates(f.directory.path, { c1: { tree: 't1', base: 'c0',
      changes: [{ status: 'M', path: 'src/a.ts' }], files: { 'src/a.ts': 'export const a = 1;\n' } } });
    const snapshot = await openCandidateSnapshot(source, f.directory.path, { commit: 'c1', base: 'c0' });
    const tools = snapshotTools(snapshot, source, f.directory.path);
    const recorder = new PortEventRecorder({ projectRoot: f.directory.path, workingDirectory: join(f.directory.path, 'reviews/workspace'),
      observations: f.observations, invocation: { id: 'inv-1', role: 'reviewer', startedAt: t(0), submissionTool: 'submit_review', declaredPaths: [f.directory.path] },
      context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 },
      excursions: new ExcursionWatcher({ projectRoot: f.directory.path, index: null, scope: undefined }),
      judge: { countImplementationRejection: () => async () => {} } });
    recorder.identify(identity);
    const calls = [
      ['snapshot_read', { path: 'src/a.ts' }], ['snapshot_read', { path: 'src/a.ts', startLine: 1, lineCount: 1 }],
      ['snapshot_list', {}], ['snapshot_search', { path: 'src', pattern: 'absent' }],
      ['snapshot_diff', {}], ['snapshot_diff', { path: 'src/a.ts' }],
    ] as const;
    let returnedBytes = 0;
    for (const [index, [name, input]] of calls.entries()) {
      const tool = tools.definitions.find(tool => tool.name === name)!;
      const action = tool.action?.(input) ?? { kind: 'harness' as const };
      const callId = `snapshot-${index}`;
      await recorder.record({ type: 'tool-started', tool: name, input, callId, action, mutating: false, execution: identity,
        observation: { sourceId: `${callId}:start`, at: t(index + 1) } });
      const result = await tool.execute(input, new AbortController().signal);
      returnedBytes += Buffer.byteLength(result.text);
      const target = action.kind === 'read' || action.kind === 'search' ? action.path : null;
      await recorder.record({ type: 'tool-finished', tool: name, callId, isError: result.isError === true, reachedTool: true, execution: identity,
        observation: { sourceId: `${callId}:finish`, at: t(index + 2), elapsedMs: 10, returnedBytes: Buffer.byteLength(result.text),
          resolvedScope: target === null ? null : [target], files: action.kind === 'read' && target ? [target] : null,
          coverage: action.kind === 'search' ? ['Matched file identities not reported'] : [] } });
    }
    await recorder.drain();
    const projected = evaluationOf({ invocation: { ...invocation, role: 'reviewer', writer: false }, outcome,
      observations: f.observations.observations, lines: null }).efficiency!;
    expect(projected.exploration.metrics).toMatchObject({ reads: 3, uniqueFilesRead: 1, repeatedReads: 2,
      searches: 3, broadSearches: 2, outsideScopeSearches: 0, returnedBytes, toolElapsedMs: 60 });
    const exploration = f.observations.observations.filter(row => row.type === 'exploration');
    expect(exploration).toHaveLength(6);
    expect(exploration.every(row => row.type === 'exploration' && row.data.resolvedScope?.every(path => !path.includes('reviews/workspace')))).toBe(true);
    expect(exploration[0]).toMatchObject({ data: { requestedScope: ['src/a.ts'], resolvedScope: ['src/a.ts'], files: ['src/a.ts'] } });
    expect(projected.exploration.metrics.coverage.join('\n')).toContain('matched files unknown');
  });
  test('captures original identities, exact output bytes, zero matches and recorded-rate estimates once across restoration', async () => {
    const f = await observed();
    await explored(f.recorder, 'r1', 'read', f.directory.path, 7, [join(f.directory.path, 'src/a.ts')], 1);
    await explored(f.recorder, 'r2', 'read', f.directory.path, 5, [join(f.directory.path, 'src/a.ts')], 2);
    await explored(f.recorder, 's1', 'search', f.directory.path, 0, [], 3);
    await edited(f.recorder, 'e1', 4);
    await f.recorder.record(usageEvent); await f.recorder.record(usageEvent); await f.recorder.drain();
    const projected = evaluationOf({ invocation, outcome, observations: f.observations.observations, lines: null }).efficiency!;
    expect(projected.operation).toEqual(identity);
    expect(projected.exploration.metrics).toMatchObject({ reads: 2, uniqueFilesRead: 1, repeatedReads: 1, returnedBytes: 12, searches: 1, broadSearches: 1, outsideScopeSearches: 1, toolElapsedMs: 30 });
    expect(projected.exploration.zeroMatchSearches).toBe(1);
    expect(projected.charges).toEqual([{ model: 'fixed/model', sourceRevision: 'captured-model-r1', currency: 'USD', source: 'estimated-from-recorded-rates', newInputTokens: 100, cachedInputTokens: 40, cacheWriteTokens: 10, outputTokens: 20,
      ratesPerMillion: { newInput: 2, cachedInput: 0.5, cacheWrite: 3, output: 4 }, newInput: 0.0002, cachedInput: 0.00002, cacheWrite: 0.00003, output: 0.00008, total: 0.00033, coverage: [] }]);
    expect(projected.chargeSubtotal).toBeCloseTo(0.00033); expect(projected.chargeTotal).toBeCloseTo(0.00033);
    // The milestone is the edit at t(4), not the first read at t(1); the tool
    // duration covers the three exploration calls (30 ms) and the edit (10 ms).
    expect(f.observations.observations.filter(row => row.type === 'milestone')).toEqual([expect.objectContaining({ data: { kind: 'first-engineering-action', at: t(4) } })]);
    expect(projected.timing).toMatchObject({ elapsedMs: 5000, milestone: 'first-engineering-action', toMilestoneMs: 4000, modelElapsedMs: 120, toolElapsedMs: 40, toolSubtotalMs: 40, checkElapsedMs: null });
    expect(projected.timing.coverage.filter(reason => /tool duration/i.test(reason))).toEqual([]);
    expect(projected.units).toEqual({ scope: 'bytes', returned: 'UTF-8 output bytes', duration: 'ms', charge: 'USD' });
    expect(invocationEfficiencySchema.safeParse(projected).success).toBe(true);
    const reopened = await ObservationLog.open(f.path);
    expect(evaluationOf({ invocation, outcome, observations: reopened.observations, lines: null }).efficiency).toEqual(projected);
    expect(f.recorder.usage).toEqual({ input: 100, cacheRead: 40, cacheWrite: 10, output: 20, total: 170 });
  });
  test('an invocation of no tool calls has a tool duration of 0 ms, one of an unreadable log none, and an incomplete one names its single known subtotal', async () => {
    const f = await observed(); await f.recorder.record(usageEvent); await f.recorder.drain();
    const none = evaluationOf({ invocation, outcome, observations: f.observations.observations, lines: null }).efficiency!;
    expect(none.timing.toolElapsedMs).toBe(0); expect(none.timing.toolSubtotalMs).toBe(0);
    expect(none.timing.coverage.filter(reason => /tool duration/i.test(reason))).toEqual([]);
    const unreadable = evaluationOf({ invocation, outcome, observations: { unavailable: 'missing' }, lines: null }).efficiency!;
    expect(unreadable.timing.toolElapsedMs).toBeNull(); expect(unreadable.timing.toolSubtotalMs).toBe(0);
    // A read of unknown duration beside an edit of 10 ms: one entry, over
    // every tool call, rather than one for the reads and one for all.
    await explored(f.recorder, 'r1', 'read', f.directory.path, 7, [join(f.directory.path, 'src/a.ts')], 1);
    await edited(f.recorder, 'e1', 2); await f.recorder.drain();
    const rows = f.observations.observations.map(row => row.type === 'tool-duration' && row.data.callId === 'r1' ? { ...row, data: { ...row.data, elapsedMs: null } } : row);
    const partial = evaluationOf({ invocation, outcome, observations: rows, lines: null }).efficiency!;
    expect(partial.timing.toolElapsedMs).toBeNull(); expect(partial.timing.toolSubtotalMs).toBe(10);
    expect(partial.timing.coverage.filter(reason => /known subtotal/i.test(reason))).toEqual(['tool duration: known subtotal 10 ms over 1 of 2 tool calls; total unavailable']);
    // The exploration row's own recorded 10 ms stays with the exploration
    // metrics, which the tool-duration subtotal does not touch.
    expect(partial.exploration.metrics).toMatchObject({ toolElapsedMs: 10, coverage: [] });
  });
  test('an engineer\'s reads and searches alone record no milestone, while a mutating shell command does', async () => {
    const f = await observed();
    await explored(f.recorder, 'r1', 'read', f.directory.path, 7, [join(f.directory.path, 'src/a.ts')], 1);
    await explored(f.recorder, 's1', 'search', f.directory.path, 0, [], 2);
    await f.recorder.record({ type: 'tool-started', tool: 'shell', callId: 'c1', input: {}, action: { kind: 'command', command: 'ls' }, mutating: false, execution: identity, observation: { sourceId: 'c1:start', at: t(3) } });
    await f.recorder.drain();
    expect(f.observations.observations.filter(row => row.type === 'milestone')).toEqual([]);
    await f.recorder.record({ type: 'tool-started', tool: 'shell', callId: 'c2', input: {}, action: { kind: 'command', command: 'sed -i' }, mutating: true, execution: identity, observation: { sourceId: 'c2:start', at: t(4) } });
    await f.recorder.drain();
    expect(f.observations.observations.filter(row => row.type === 'milestone')).toEqual([expect.objectContaining({ data: { kind: 'first-engineering-action', at: t(4) } })]);
  });
  test('plain immutable sibling/checkpoint fixtures keep actual zero and missing-rate states distinct', async () => {
    const f = await observed(); await f.recorder.record(usageEvent);
    const source = f.observations.observations;
    const L = { ...identity, sessionId: 'left', sourcePoint: { ...identity.sourcePoint, sessionId: 'left', checkpoint: 'left-C1' } };
    const R = { ...identity, operationId: 'right-op', sessionId: 'right', sourcePoint: { ...identity.sourcePoint, sessionId: 'right', checkpoint: 'right-C1' } };
    const left = evaluationOf({ invocation: { ...invocation, sessionOperation: L }, outcome, observations: source, lines: null }).efficiency!;
    const right = evaluationOf({ invocation: { ...invocation, sessionOperation: R }, outcome, observations: [], lines: null }).efficiency!;
    expect(left.operation).toEqual(L); expect(right.operation).toEqual(R); expect(left.operation?.turn).toBe(right.operation?.turn);
    expect(right.chargeTotal).toBeNull(); expect(right.chargeSubtotal).toBe(0);
    left.charges[0]!.ratesPerMillion.output = 99; left.charges[0]!.coverage.push('client-only');
    const retry = evaluationOf({ invocation: { ...invocation, sessionOperation: L }, outcome, observations: source, lines: null }).efficiency!;
    expect(retry.charges[0]?.ratesPerMillion.output).toBe(4); expect(retry.charges[0]?.coverage).toEqual([]);
    const recordedUsage = source.find(row => row.type === 'usage')!;
    const zero = { ...recordedUsage, data: { ...recordedUsage.data, usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 }, charge: { ...recordedUsage.data.charge!, newInputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, newInput: 0, cachedInput: 0, cacheWrite: 0, output: 0, total: 0 } } };
    const measuredZero = evaluationOf({ invocation, outcome, observations: [zero], lines: null }).efficiency!;
    expect(measuredZero.chargeTotal).toBe(0); expect(measuredZero.chargeSubtotal).toBe(0);
    const absentRate = { ...recordedUsage, data: { ...recordedUsage.data, charge: { ...recordedUsage.data.charge!, ratesPerMillion: { ...recordedUsage.data.charge!.ratesPerMillion, output: null }, output: null, total: null, coverage: ['output rate absent'] } } };
    const partial = evaluationOf({ invocation, outcome, observations: [absentRate], lines: null }).efficiency!;
    expect(partial.chargeTotal).toBeNull(); expect(partial.chargeSubtotal).toBeCloseTo(0.00025);
    for (const wire of [retry, right, measuredZero, partial]) expect(invocationEfficiencySchema.safeParse(JSON.parse(JSON.stringify(wire))).success).toBe(true);
  });
  test('keeps known subtotals after unreadable and torn rows without inventing zero usage or complete durations', async () => {
    const f = await observed(); await explored(f.recorder, 'r', 'read', f.directory.path, 9, null, 1);
    await writeFile(f.path, `${await readFile(f.path, 'utf8')}{broken}\n{"trailing":`);
    const log = await readObservationLog(f.path, 'observations.jsonl');
    const projected = evaluationOf({ invocation, outcome: null, observations: log, lines: null }).efficiency!;
    expect(projected.exploration.metrics.returnedBytes).toBe(9); expect(projected.exploration.metrics.reads).toBe(1);
    expect(projected.chargeTotal).toBeNull(); expect(projected.chargeSubtotal).toBe(0);
    expect(projected.timing.elapsedMs).toBeNull(); expect(projected.timing.modelElapsedMs).toBeNull();
    expect(projected.coverage.join('\n')).toContain('unreadable rows');
    expect(projected.exploration.metrics.coverage.join('\n')).toContain('files read unknown');
    const unknown = evaluationOf({ invocation: { id: 'old', role: 'engineer', work: {}, writer: true }, outcome: null, observations: { unavailable: 'missing' }, lines: null }).efficiency!;
    expect(unknown.operation).toBeNull(); expect(unknown.manifest).toBeNull(); expect(unknown.declared).toBeNull(); expect(unknown.readScope).toBeNull();
    expect(invocationEfficiencySchema.safeParse(unknown).success).toBe(true);
  });
  test('conflicting source identity remains excluded through a third original row and partial logs retain timing subtotals', async () => {
    const f = await observed(); await f.recorder.record(usageEvent); await explored(f.recorder, 'read', 'read', f.directory.path, 3, [], 1);
    const usage = f.observations.observations.find(row => row.type === 'usage')!;
    const rows = [...f.observations.observations, { ...usage, n: 100, data: { ...usage.data, modelElapsedMs: 999 } }, { ...usage, n: 101 },
      { n: 102, at: t(4), type: 'coverage-gap' as const, data: { kind: 'observation-truncated' as const, detail: 'Lost finish rows' } }];
    const projected = evaluationOf({ invocation, outcome, observations: rows, lines: null }).efficiency!;
    expect(projected.charges).toEqual([]); expect(projected.chargeTotal).toBeNull(); expect(projected.chargeSubtotal).toBe(0);
    expect(projected.timing.toolElapsedMs).toBeNull(); expect(projected.timing.toolSubtotalMs).toBe(10); expect(projected.exploration.metrics.returnedBytes).toBe(3);
    expect(projected.coverage.join('\n')).toContain('conflicting source observation');
  });
  test('reopens valid/malformed/valid/torn observation rows without weakening the session ledger or duplicating source effects', async () => {
    const f = await observed(); await f.recorder.record(usageEvent); const usage = f.observations.observations.find(row => row.type === 'usage')!;
    const context = { n: usage.n + 2, at: t(4), type: 'context', data: { tokens: null, window: null, threshold: null } };
    await writeFile(f.path, `${JSON.stringify(usage)}\n{broken complete JSON}\n${JSON.stringify(context)}\n{torn`);
    const reopened = await ObservationLog.open(f.path); expect(reopened.count('usage')).toBe(1); expect(reopened.count('context')).toBe(1);
    expect(reopened.observations.at(-1)).toMatchObject({ type: 'coverage-gap', data: { kind: 'observation-truncated' } });
    expect(await reopened.record({ type: 'usage', sourceId: usage.sourceId!, data: usage.data })).toBe(false);
    expect(await reopened.record({ type: 'context', data: { tokens: 0, window: null, threshold: null } })).toBe(true);
    const again = await ObservationLog.open(f.path); expect(again.count('usage')).toBe(1); expect(again.count('context')).toBe(2);
    expect(new Set(again.observations.map(row => row.n)).size).toBe(again.observations.length);
    expect(evaluationOf({ invocation, outcome, observations: again.observations, lines: null }).efficiency?.chargeSubtotal).toBeCloseTo(0.00033);
  });
  test('work-item scripted routing selects the current owning objective after inherited and quoted different identities', () => {
    const routed = byWork({ 'local-architect:wi-001': [[{ kind: 'end', message: 'old' }]], 'local-architect:wi-002': [[{ kind: 'end', message: 'current' }]] });
    const prior = '# CURRENT TASK\n# Current task: assignment\nPerform assignment for {"workItem":"wi-001"}; use the current evidence and designated submission.';
    const current = '# CURRENT TASK\n# Current task: completion\nPerform completion for {"workItem":"wi-002"}; use the current evidence and designated submission.\n\nGoal mentions wi-001 as literal support.';
    if (typeof routed !== 'function') throw new Error('Expected callable scripted router');
    expect(routed({ role: 'local-architect', prompt: `${prior}\n\n${current}` } as SessionSpec)).toEqual([{ kind: 'end', message: 'current' }]);
  });
  const pairs: [Role, TaskKind, string][] = [
      ['initial-architect', 'initial-analysis', 'submit_initial_analysis'], ['catalog-extractor', 'intake', 'submit_intake'],
      ['catalog-extractor', 'principles', 'submit_principle_elements'], ['catalog-extractor', 'check', 'submit_catalog_check'],
      ['global-fork', 'placement', 'submit_placement_decision'], ['local-architect', 'orientation', 'submit_work_orientation'],
      ['local-architect', 'assignment', 'submit_work_item_result'], ['local-architect', 'completion', 'submit_work_item_result'],
      ['local-architect', 'repair', 'submit_work_item_result'], ['local-architect', 'capability-qualification', 'submit_capability_qualification'],
      ['local-architect', 'reconciliation', 'submit_reconciliation'], ['context-selector', 'selection', 'submit_context_selection'],
      ['context-selector', 'reselection', 'submit_context_selection'], ['capability-architect', 'capability', 'submit_capability_action'],
      ['capability-architect', 'capability-qualification', 'submit_capability_qualification'], ['capability-architect', 'reconciliation', 'submit_reconciliation'],
      ['engineer', 'engineering', 'submit_iteration_result'], ['engineer', 'repair', 'submit_iteration_result'],
      ['engineer', 'standalone-command', 'submit_iteration_result'],
      ['engineer', 'consultation', 'answer_capability_consultation'], ['contract-engineer', 'contract', 'submit_contract_result'],
      ['reviewer', 'code', 'submit_review'], ['reviewer', 'scope', 'submit_review'], ['reviewer', 'design', 'submit_review'],
      ['reviewer', 'design-orientation', 'submit_orientation'], ['failure-analyst', 'failure-analysis', 'submit_failure_analysis'],
      ['nonfunctional-coordinator', 'assessment', 'submit_nonfunctional_assessment'], ['nonfunctional-coordinator', 'action', 'submit_nonfunctional_action'],
      ['nonfunctional-coordinator', 'investigation', 'submit_nonfunctional_investigation'], ['nonfunctional-repair-engineer', 'repair', 'submit_nonfunctional_repair'],
    ];
  test('the independent role/task table covers all twelve roles and thirty bindings', () => {
    expect(pairs).toHaveLength(30); expect(new Set(pairs.map(pair => pair[0])).size).toBe(12);
  });
  test.each(pairs)('%s/%s admits actual manifests and original identity using %s without exploration calls', async (role, kind, tool) => {
    const index = pairs.findIndex(pair => pair[0] === role && pair[1] === kind);
    const directory = await temporaryDirectory(); cleanups.push(directory.remove); const packages = (await loadPromptPackages()).packages; const ordinary = (await loadPromptPackages({ capabilityWorkflow: false })).packages;
    const agent = createScriptedAgent([{ kind: 'submit', input: {} }]); const sessions = await HarnessSessionOperations.open(join(directory.path, 'operations'), agent); cleanups.push(async () => { expect(await sessions.close()).toBe(true); });
    let accepted = 0; const actualCalls: string[] = [];
      let packet: TaskPacket | null = null; let original: AgentEvent['execution']; let events = 0;
      const spec: SessionSpec = { role, scope: { workingDirectory: directory.path }, systemPrompt: 'Unused old composite head', prompt: 'Unused old task', session: { mode: 'fresh' },
        context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, builtinTools: [], tools: [],
        submission: { name: tool, description: 'Current owning validator.', inputSchema: { type: 'object' }, accept: async () => { accepted++; return { accepted: true }; } },
        onEvent(event) { events++; if (event.type === 'tool-started') actualCalls.push(event.tool); expect(packet).not.toBeNull(); expect(original).toEqual(event.execution); expect(event.execution).toMatchObject({ runId: 'role-matrix', operationId: `case-${index}`, turn: 1, sourcePoint: { turn: 0 } });
          const manifest = deliveredManifestViewSchema.parse(packet!.manifest); expect(manifest.currentMessage?.bytes).toBe(Buffer.byteLength(packet!.message));
          const actual = deliveredScopeInputs({ exactOwners: [], subtrees: [], apiViews: false, architectView: false, supportDocuments: [] }, packet!.manifest);
          expect(actual.supplementary.reduce((sum, source) => sum + source.bytes, 0) + (actual.scope.brief ?? 0)).toBeGreaterThan(0);
        } };
      const session = await sessions.start({ runId: 'role-matrix', operationId: `case-${index}`, session: `display-${index}`, loaded: packages.get(role) ?? ordinary.get(role)!, spec,
        brief: { kind, objective: 'Observe the current owning task.', goal: 'Exact goal.', requirements: ['Exact requirement.'], sections: [],
          ...(kind === 'consultation' ? { consultationSubmissionSchema: JSON.stringify({ type: 'object', properties: { answer: { type: 'string', minLength: 1 }, objections: { type: 'array', items: { type: 'string' } } }, required: ['answer', 'objections'], additionalProperties: false }) } : {}),
          environment: { projectRoot: directory.path, workingDirectory: directory.path, candidate: 'current-candidate', snapshot: 'current-snapshot', limits: { stopSettleMs: 1000 }, views: [], supportPaths: [], cucumberConfiguration: null, availableTools: [tool] } },
        authority: { role }, validator: { name: tool, schema: 'fixed-structural-test-validator' }, destination: { record: `result-${index}` }, currentAuthority: async () => true,
        prepared: async value => { packet = value; }, identified: async value => { original = value; } });
      expect((await session.outcome).kind).toBe('submitted'); expect(await session.settled!()).toBe('settled'); expect(events).toBeGreaterThan(0);
    expect(accepted).toBe(1); expect(agent.sessions).toHaveLength(1);
    expect(actualCalls).toEqual([tool]);
  });
  test('every dispatched role records its actual packet and explicit size coverage before its first event', async () => {
    const admitted = new Map<string, { role: string; manifestHash: string }>();
    let projectRoot = '';
    const admissionErrors: string[] = [];
    const scenario = await runSessionScenario({ cleanup: cleanup => cleanups.push(cleanup), onOpened: opened => { projectRoot = opened.service.projectRoot; }, port: scripted => ({ ...scripted,
      bindSessionStore(store) { const operations = scripted.bindSessionStore(store); return { ...operations, async continue(input) {
        const original = input.bindings.onEvent;
        return operations.continue({ ...input, bindings: { ...input.bindings, onEvent(event) {
          const originalIdentity = event.execution!;
          const record = JSON.parse(readFileSync(runPath(projectRoot, 'review-notes', originalIdentity.runId, runLayout.invocation(originalIdentity.operationId)), 'utf8'));
          const manifest = deliveredManifestViewSchema.safeParse(record.prompt.manifest);
          if (!manifest.success) admissionErrors.push(JSON.stringify(manifest.error.issues));
          expect(manifest.success).toBe(true);
          expect(record.prompt.manifest.schema).toBe('ramify-agent.delivered-inputs/1'); expect(record.prompt.inputsHash).toMatch(/^[a-f0-9]{64}$/);
          expect(record.scope.size).not.toBeNull(); expect(record.scope.size.coverage).toMatch(/complete|partial/); expect(record.sessionOperation).toMatchObject(originalIdentity);
          // One owned-source component per record, whether the role declares a size or not.
          expect(record.scope.size.components.filter((component: { component: string }) => component.component === 'owned-source'), record.role).toHaveLength(1);
          admitted.set(originalIdentity.operationId, { role: record.role, manifestHash: record.prompt.manifest.hash }); original(event);
        } } });
      } }; } } as AgentPort) }).catch(error => { throw new Error(`${String(error)}\n${admissionErrors.join('\n')}`); });
    expect(admitted.size).toBe(scenario.events.filter(event => event.type === 'invocation-started').length);
    expect([...new Set([...admitted.values()].map(entry => entry.role))]).toEqual(expect.arrayContaining(['initial-architect', 'local-architect', 'engineer', 'contract-engineer', 'global-fork']));
    const metrics = await new RunQueries(scenario.service).metrics('review-notes', scenario.runId);
    expect(metricsResponseSchema.safeParse(metrics).success).toBe(true);
    for (const evaluation of metrics.evaluation.invocations) { expect(evaluation.efficiency, JSON.stringify(evaluation.efficiency)).toHaveProperty('manifest.hash', admitted.get(evaluation.invocation)?.manifestHash); expect(evaluation.efficiency?.operation?.operationId).toBe(evaluation.invocation); }
  }, 180_000);
});

function setupFixture(options: { oid?: boolean; original?: string; sourceLine?: number; prefix?: string; bytes?: Uint8Array; binary?: boolean } = {}) {
  const before = options.original ?? '# manual\n'; const setup = `${before}${before.endsWith('\n') ? '' : '\n'}**/src/tmp/\n`; const final = '**/src/tmp/\n# writer\n';
  const texts: Record<string, string> = { B: before, S: setup, F: final };
  const prefix = options.prefix ?? 'nested/';
  const changes: ChangeHistory = { async commitsBetween() { return ['S', 'F']; }, async changedFiles() { return [{ before: '.gitignore', after: '.gitignore', binary: false, added: [[1, 2]], deleted: [[1, 1]] },
      ...(options.binary ? [{ before: null, after: 'assets/logo.png', binary: true, added: [], deleted: [] }] : [])]; },
    async lineOrigins() { return [{ line: 1, commit: 'S', boundary: false, sourceLine: options.sourceLine ?? 2, sourcePath: `${prefix}.gitignore`, projectPrefix: prefix }, { line: 2, commit: 'F', boundary: false, sourceLine: 2, sourcePath: `${prefix}.gitignore`, projectPrefix: prefix }]; },
    async lineLastSeen(_root, _from, to) { return [{ line: 1, commit: to === 'F' ? 'S' : 'B', boundary: false, sourceLine: 1, sourcePath: `${prefix}.gitignore`, projectPrefix: prefix }]; } };
  const asked: string[] = [];
  const candidates: CandidateSource = { async treeEntries(_root, revision) { const bytes = revision === 'S' && options.bytes ? Buffer.from(options.bytes) : Buffer.from(texts[revision]!);
      return [{ path: `${prefix}.gitignore`, kind: 'file', bytes: bytes.length, ...(options.oid === false ? {} : { objectId: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') }) }]; },
    async readBlob(_root, revision, path) { asked.push(path); if (path !== `${prefix}.gitignore`) throw new Error('Repository prefix was not authenticated'); return revision === 'S' && options.bytes ? Buffer.from(options.bytes).toString('utf8') : texts[revision]!; },
    async commitTree() { throw new Error('No extra candidate exploration allowed'); }, async grepTree() { throw new Error('No grep allowed'); }, async diffNameStatus() { throw new Error('No name diff allowed'); }, async diffPatch() { throw new Error('No patch inference allowed'); } };
  const view = { record: { jobId: 'run' }, events: [{ sequence: 1, type: 'scratch-setting-up', data: { originalIgnoreBase64: Buffer.from(before).toString('base64') } }, { sequence: 2, type: 'scratch-setup-complete', data: { commit: 'S', appended: true } }] } as unknown as RunView;
  return { view, history: { projectRoot: '/scripted/nested', changes, candidates }, asked };
}
describe('Plan 23 exact setup attribution collection', () => {
  test('uses authenticated nested repository origins and keeps later same-file writer additions/deletions', async () => {
    const f = setupFixture(); const identities = await setupLineIdentitiesOf(f.view, f.history, 'B', 'F');
    expect(identities).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: [1], deleted: [] }, { commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
    expect(f.asked.length).toBeGreaterThan(0); expect(new Set(f.asked)).toEqual(new Set(['nested/.gitignore']));
  });
  test('a binary path in the direct diff has no line partitions and leaves the text identities verified', async () => {
    const f = setupFixture({ binary: true });
    expect(await setupLineIdentitiesOf(f.view, f.history, 'B', 'F')).toEqual({ base: 'B', final: 'F', entries: [{ commit: 'S', path: '.gitignore', added: [1], deleted: [] }, { commit: 'F', path: '.gitignore', added: [], deleted: [] }] });
  });
  test('missing OIDs and original invalid bytes never waive a commit or path', async () => {
    const old = setupFixture({ oid: false }); const invalid = setupFixture({ bytes: new Uint8Array([255, 10]) });
    for (const f of [old, invalid]) { const identities = await setupLineIdentitiesOf(f.view, f.history, 'B', 'F'); expect(identities.entries.find(entry => entry.commit === 'S')?.added).toBeNull(); expect(identities.entries.find(entry => entry.commit === 'F')).toMatchObject({ added: [], deleted: [] }); }
    const legitimate = setupFixture({ original: '�\n' }); expect((await setupLineIdentitiesOf(legitimate.view, legitimate.history, 'B', 'F')).entries.find(entry => entry.commit === 'S')?.added).toEqual([1]);
  });
  test('a source position mismatch or unrelated repeated setup intent retains unknown attribution', async () => {
    const wrong = setupFixture({ sourceLine: 1 }); expect((await setupLineIdentitiesOf(wrong.view, wrong.history, 'B', 'F')).entries.find(entry => entry.commit === 'S')?.added).toBeNull();
    const ambiguous = setupFixture(); (ambiguous.view.events as unknown as { sequence: number; type: string; data: unknown }[]).splice(1, 0, { sequence: 1.5, type: 'scratch-setting-up', data: { originalIgnoreBase64: '' } });
    expect((await setupLineIdentitiesOf(ambiguous.view, ambiguous.history, 'B', 'F')).entries.find(entry => entry.commit === 'S')?.added).toBeNull();
  });
});
