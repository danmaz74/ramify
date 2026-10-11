import {
  breakpointStateSchema, debugExchangeSchema, debugInspectionResponseSchema, debugInterventionSchema, debugStateResponseSchema, runSnapshotSchema,
  type BreakpointState, type DebugExchange, type DebugInspectionResponse, type DebugIntervention, type DebugStateResponse, type RunSnapshot,
} from '../../../../harness/src/interfaces/protocol/runs.js';
import { StubClient, type StubRun } from './stub-client.js';

/*
 * Answers of a run started with the engineer breakpoint, as the harness
 * gives them, each parsed by its protocol schema.
 */

export const debugPlanId = 'review-notes';
export const debugRunId = '20261010T120000Z-d0d0d0';
const at = '2026-10-10T12:00:00.000Z';

export function debugSnapshot(extra: Partial<RunSnapshot> = {}): RunSnapshot {
  const ended = extra.state !== undefined && extra.state !== 'running';
  return runSnapshotSchema.parse({
    jobId: debugRunId, planId: debugPlanId, agent: 'scripted', version: 20, state: 'running', phase: ended ? 'ended' : 'working', stopRequested: false,
    startedAt: at, updatedAt: at, endedAt: ended ? at : null, failure: null, current: null, waits: [],
    counts: { workItems: 1, completedWorkItems: 0, openRequirements: 0, invocations: 2, readinessAttempts: 1, gateAttempts: 0, scenarios: { pending: 0, bound: 1, done: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests: { open: 0, waiting: false, workItems: [] },
    planDeviations: { recorded: 0, toReview: 0 }, environmentProblems: [], breakpoint: 'before-agent:engineer',
    ...extra,
  });
}

export function pause(extra: Partial<BreakpointState> = {}): BreakpointState {
  return breakpointStateSchema.parse({
    kind: 'breakpoint', planId: debugPlanId, runId: debugRunId, pauseId: 'bp-0001', revision: 1, cursor: 14, state: 'paused', role: 'engineer',
    work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, goal: 'Attach a note to a review', nextAction: 'execute the iteration',
    taskState: 'pending', summary: 'The engineer for wi-001.i01 is prepared and waits for resume.',
    ...extra,
  });
}

export function exchange(occurrence: BreakpointState, commandId: string, extra: Partial<DebugExchange> = {}): DebugExchange {
  return debugExchangeSchema.parse({
    ...occurrence, kind: 'exchange', commandId, status: 'admitted', answer: null, invocation: null, session: null, point: null,
    outcome: null, error: null, continuityLoss: null, verdicts: [], evidence: [],
    ...extra,
  });
}

export function messageEntry(sequence: number, commandId: string, message: string, result: DebugExchange): DebugIntervention {
  return debugInterventionSchema.parse({ kind: 'message', sequence, at, pauseId: result.pauseId, revision: result.revision, commandId, message, exchange: result });
}

export function resumeEntry(sequence: number, commandId: string, occurrence: BreakpointState, message: string | null): DebugIntervention {
  return debugInterventionSchema.parse({ kind: 'resume', sequence, at, pauseId: occurrence.pauseId, revision: occurrence.revision, commandId, message, exchange: null });
}

export function debugState(current: BreakpointState | null, interventions: readonly DebugIntervention[] = [], run: RunSnapshot = debugSnapshot()): DebugStateResponse {
  return debugStateResponseSchema.parse({ run, current, reached: current ? [current] : [], cursor: current?.cursor ?? 0, more: false, interventions });
}

export function inspection(occurrence: BreakpointState, run: RunSnapshot = debugSnapshot()): DebugInspectionResponse {
  return debugInspectionResponseSchema.parse({
    run, current: occurrence,
    inspection: {
      ...occurrence, kind: 'inspection', preview: true,
      input: {
        roleInstructions: 'You are the engineer of this iteration.',
        message: `Implement ${occurrence.work.iteration ?? 'the task'} at revision ${occurrence.revision}.`,
        inherited: [{ key: 'plan', kind: 'plan', text: 'The plan text.', source: 'plans/review-notes/plan.md', revision: null }],
        additions: [{ key: 'gate-failure', kind: 'gate', text: 'The last gate failed.', source: null, revision: 'ga-0002' }],
        effective: [{ key: 'plan', kind: 'plan', text: 'The plan text, effective.', source: 'plans/review-notes/plan.md', revision: null }],
        tools: [
          { name: 'edit', description: 'Edits a file in scope', inputSchema: {}, mutating: true },
          { name: 'read', description: 'Reads a file', inputSchema: {}, mutating: false },
        ],
        source: 'ses-0002/inv-0002', continuity: 'retained', continuityReason: 'continues the iteration session',
        scope: { writable: ['subs/notes/src'] }, bounds: { maxTurns: 40 },
      },
    },
  });
}

/** A stub client serving one breakpoint run with the debug state given. */
export function debugClient(debug: DebugStateResponse, extra: Partial<StubRun> = {}): StubClient {
  const client = new StubClient();
  client.runs.set(debugRunId, { snapshot: debug.run, events: [], debug, ...extra });
  return client;
}

/** Replaces the run's debug state, and its snapshot with the state's run. */
export function answerDebug(client: StubClient, debug: DebugStateResponse): void {
  const run = client.runs.get(debugRunId)!;
  run.debug = debug;
  run.snapshot = debug.run;
}
