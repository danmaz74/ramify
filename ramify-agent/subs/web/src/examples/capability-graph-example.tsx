import type { CapabilityProgress } from '../../../harness/src/interfaces/protocol/runs.js';
import { CapabilityGraph } from '../capability-graph.js';

/*
 * Development preview composed from the executable projection cases in
 * harness/src/tests/progress.test.ts: provider delegation, verified reuse,
 * evidence reopening and a hypothesis-only forecast. These are presentation
 * inputs only; the production Run page always reads the harness endpoint.
 */
const capabilities: CapabilityProgress[] = [
  {
    capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working',
    reason: 'Waiting for provider ob-ct-001 (rq-001)',
    dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [],
  },
  {
    capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'working',
    reason: 'Evidence reopened by contract-revision of ct-001 at revision 2; follow-up wi-003 of completed wi-002 is open',
    dependsOn: [], workItems: ['wi-002', 'wi-003'], evidence: ['ga-0007'],
  },
  {
    capability: 'review-panel', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'completed',
    reason: 'Work item wi-004 completed with current verification evidence',
    dependsOn: [{ capability: 'format-date', tentative: false }], workItems: ['wi-004'], evidence: ['ga-0010'],
  },
  {
    capability: 'format-date', owner: 'collection-review', entry: false, tentative: false, state: 'completed',
    reason: 'Verified reuse when consumer wi-004 passed',
    dependsOn: [], workItems: [], evidence: ['ga-0010'],
  },
  {
    capability: 'note-rendering', owner: 'collection-review', entry: false, tentative: true, state: 'todo',
    reason: 'Forecast by hypothesis note-rendering at revision 1 (tentative); no work derives from a hypothesis',
    dependsOn: [{ capability: 'note-storage', tentative: true }], workItems: [], evidence: [],
  },
  {
    capability: 'note-storage', owner: 'collection-review/workspace/reviews', entry: false, tentative: true, state: 'todo',
    reason: 'Forecast by hypothesis note-storage at revision 1 (tentative); no work derives from a hypothesis',
    dependsOn: [], workItems: [], evidence: [],
  },
];

export function CapabilityGraphExample() {
  return (
    <div className="capability-preview-shell">
      <header className="app-header">
        <span className="brand">ramify-agent</span>
        <span className="project">component preview · retained progress cases</span>
      </header>
      <main>
        <p className="preview-kicker">Proposed product placement: the existing Run → Progress tab, replacing its three independent status columns.</p>
        <CapabilityGraph capabilities={capabilities} total={capabilities.length} />
        <p className="preview-source muted">Example data is composed from <code>harness/src/tests/progress.test.ts</code>: provider delegation, verified reuse, reopened evidence and hypothesis-only forecasts.</p>
      </main>
    </div>
  );
}
