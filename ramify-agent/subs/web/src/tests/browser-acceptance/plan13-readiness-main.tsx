import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CheckFindingDetail, CheckFindingListResponse } from '../../../../harness/src/interfaces/protocol/check-findings.js';
import type { MergeReadinessResponse, ProjectedRunEvent, RunSnapshot } from '../../../../harness/src/interfaces/protocol/runs.js';
import { RunPage } from '../../run-page.js';
import { checkFindingKey, StubClient } from '../helpers/stub-client.js';
import '../../styles.css';

type Mode = 'pending' | 'accepted' | 'rejected' | 'gate-failed' | 'source-unavailable';
interface Case {
  run: RunSnapshot;
  events: ProjectedRunEvent[];
  readiness: MergeReadinessResponse;
  findings: CheckFindingListResponse;
  details: Record<string, CheckFindingDetail>;
}

const fixture = await fetch('/readiness-data.json').then(async response => {
  if (!response.ok) throw new Error(`Readiness fixture returned ${response.status}`);
  return await response.json() as { cases: Record<Mode, Case> };
});

function Witness() {
  const [mode, setMode] = useState<Mode>('pending');
  window.plan13Readiness = { setMode };
  const selected = fixture.cases[mode];
  const client = new StubClient();
  client.runs.set(selected.run.jobId, {
    snapshot: selected.run, events: selected.events, mergeReadiness: selected.readiness,
    checkFindings: {
      [checkFindingKey({ select: 'attention' })]: selected.findings,
      [checkFindingKey({ select: 'reported' })]: selected.findings,
      [checkFindingKey({ select: 'all' })]: selected.findings,
    },
    checkFindingDetails: selected.details,
  });
  return <RunPage key={mode} client={client} planId={selected.run.planId} runId={selected.run.jobId} interval={60_000} />;
}

declare global { interface Window { plan13Readiness: { setMode: (mode: Mode) => void } } }

createRoot(document.getElementById('root')!).render(<Witness />);
