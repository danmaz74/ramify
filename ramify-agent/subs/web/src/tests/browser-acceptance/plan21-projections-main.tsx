import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  runSnapshotSchema, scenarioListResponseSchema, type GateView, type ProjectedRunEvent,
} from '../../../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from '../../client.js';
import { CapabilityTasksArea } from '../../capability-tasks.js';
import { RunPage } from '../../run-page.js';
import { SessionPage } from '../../session-page.js';
import { capabilityTasksResponse } from '../helpers/capability-tasks.js';
import { engineerEntries, liveEngineer, page, planId, postWriteCheckEntry, runId } from '../helpers/sessions.js';
import { StubClient } from '../helpers/stub-client.js';
import '../../styles.css';

/*
 * Browser witness for Plan 21 iteration 10. The gate views are the run
 * projection of real F4 gate attempts the integration test exported
 * (`plan21-gate-views.json`); the scenario, capability-task and transcript
 * views render the web tests' schema-checked protocol fixtures.
 */

type View = 'gate' | 'gate-cancellation' | 'scenarios' | 'tasks-repair' | 'tasks-handed-back' | 'transcript';
const data = await fetch('/plan21-gate-views.json').then(async response => {
  if (!response.ok) throw new Error(`Gate views returned ${response.status}`);
  return await response.json() as Record<'final' | 'cancellation', { gates: Record<string, GateView> }>;
});

const at = '2026-10-08T05:00:00.000Z';
const snapshot = runSnapshotSchema.parse({
  jobId: runId, planId, agent: 'scripted', version: 12, state: 'completed', phase: 'final-verification', stopRequested: false,
  startedAt: at, updatedAt: at, endedAt: null, failure: null, current: null, waits: [],
  counts: { workItems: 2, completedWorkItems: 2, openRequirements: 0, invocations: 6, readinessAttempts: 1,
    gateAttempts: 3, scenarios: { pending: 1, bound: 1, done: 2 }, degradedStarts: 0 },
  writer: { held: null, unsettled: null }, review: 'not-reviewed', decisionRequests: { open: 0, waiting: false, workItems: [] },
  planDeviations: { recorded: 0, toReview: 0 }, environmentProblems: [], notices: [],
});
const eventsOf = (gates: Record<string, GateView>): ProjectedRunEvent[] => Object.entries(gates).map(([label, gate], index) => ({
  sequence: index + 1, at, transition: 'gate-attempted', summary: `Final gate (${label}): ${gate.verdict}`, refs: [{ kind: 'gate', id: gate.id }],
}));
const scenario = (id: string, state: 'pending' | 'bound' | 'done', extra: Record<string, unknown> = {}) => ({
  id, kind: 'entry', name: `Scenario ${id}`, state, origin: { kind: 'architect', refs: ['fr-002'] }, entry: 'review-note', partOf: null,
  subScenarios: [], workItem: 'wi-001', owner: 'shop/notes', file: 'subs/notes/src/tests/features/review-notes/review-note.feature', gates: [], ...extra,
});
const scenarios = scenarioListResponseSchema.parse({
  scenarios: [
    scenario('sc-001', 'done'), scenario('sc-002', 'bound', { partOf: 'sc-004' }), scenario('sc-003', 'done', { partOf: 'sc-004', owner: 'shop/tags' }),
    scenario('sc-004', 'pending', { kind: 'integration', entry: null, subScenarios: ['sc-002', 'sc-003'], owner: 'shop', workItem: null }),
  ],
  total: 4, obligations: [],
});
const session = { source: 'run', planId, runId, session: 'ses-0002' } as const;

function Witness() {
  const [view, setView] = useState<View>('gate');
  window.plan21 = { setView };
  if (view === 'tasks-repair' || view === 'tasks-handed-back') {
    const stage = view === 'tasks-repair' ? 'repair' : 'handed-back';
    const client = { getCapabilityTasks: async (_plan: string, _run: string, version: number) => capabilityTasksResponse(version, stage) } as unknown as ProtocolClient;
    return <main className="route-run"><CapabilityTasksArea key={view} client={client} planId={planId} runId={runId} version={3} onOpenGate={() => {}} /></main>;
  }
  if (view === 'transcript') {
    const client = new StubClient();
    client.runSessions.set(runId, { version: 20, sessions: [liveEngineer({ state: 'finished', finished: 'work-closed', awaiting: null })], total: 1 });
    client.transcripts.set('ses-0002@0', { session, page: page([...engineerEntries.slice(0, 6), postWriteCheckEntry(7)]) });
    return <SessionPage client={client} session={session} anchor={null} interval={60_000} />;
  }
  const { gates } = data[view === 'gate-cancellation' ? 'cancellation' : 'final'];
  const client = new StubClient();
  client.runs.set(runId, { snapshot, events: eventsOf(gates), scenarios, gates: Object.fromEntries(Object.values(gates).map(gate => [gate.id, gate])) });
  return <RunPage key={view} client={client} planId={planId} runId={runId} interval={60_000} />;
}

declare global { interface Window { plan21: { setView: (view: View) => void } } }

createRoot(document.getElementById('root')!).render(<Witness />);
