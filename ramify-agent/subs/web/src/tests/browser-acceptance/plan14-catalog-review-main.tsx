import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AnalysisResponse } from '../../../../harness/src/interfaces/protocol/runs.js';
import type { ProtocolClient } from '../../client.js';
import { PlanAndEntries } from '../../run-page.js';
import '../../styles.css';

type EvidenceMode = 'accepted' | 'empty' | 'unavailable';

const response = await fetch('/review-data.json').then(async result => {
  if (!result.ok) throw new Error(`Fixture response ${result.status}`);
  return await result.json() as AnalysisResponse;
});

function projection(mode: EvidenceMode): AnalysisResponse {
  if (mode === 'accepted' || response.analysis.status !== 'accepted') return response;
  if (mode === 'unavailable') return {
    ...response, analysis: { ...response.analysis, planEvidence: { status: 'unavailable', reason: 'The accepted catalog file could not be verified' } },
  };
  const evidence = response.analysis.planEvidence;
  if (evidence?.status !== 'available') return response;
  return { ...response, analysis: { ...response.analysis, planEvidence: { ...evidence, elements: [], findings: [] } } };
}

function Witness() {
  const [mode, setMode] = useState<EvidenceMode>('accepted');
  window.catalogReview = { setMode };
  const client = { getAnalysis: async () => projection(mode) } as unknown as ProtocolClient;
  return <main className="page"><PlanAndEntries key={mode} client={client} planId="review-notes" runId="fixture-run" version={1} run={undefined} onApproved={() => undefined} /></main>;
}

declare global { interface Window { catalogReview: { setMode: (mode: EvidenceMode) => void } } }

createRoot(document.getElementById('root')!).render(<Witness />);
