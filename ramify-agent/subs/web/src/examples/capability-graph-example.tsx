import type { CapabilityListResponse } from '../../../harness/src/interfaces/protocol/runs.js';
import { CapabilityDependencyGraph } from '../capability-graph.js';

/*
 * Development preview of Progress → Dependencies. Each case is the
 * projection's answer for one run constructed in
 * harness/src/tests/progress.test.ts, captured by running
 * `capabilityProgressOf` over that test's lines. Cases are separate runs and
 * are never merged into one graph. The production Run page always reads the
 * harness endpoint; the component tests cover depth, shared dependencies,
 * cycles, tentative links and bounded coverage.
 */
const cases: ReadonlyArray<{ readonly title: string; readonly response: CapabilityListResponse }> = [
  {
    title: 'the capability progress projection › todo, working, completed and a forecast',
    response: {
      capabilities: [
        { capability: 'not-started', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'todo', reason: 'wi-001 not started', dependsOn: [], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'under-way', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'wi-002 is under way', dependsOn: [], workItems: ['wi-002'], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'done', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'completed', reason: 'wi-003 passed its work-item gate ga-0004', dependsOn: [], workItems: ['wi-003'], evidence: ['ga-0004'], scenarios: { implemented: 0, total: 0 } },
        { capability: 'no-item', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'todo', reason: 'No work started (no work item of its own)', dependsOn: [], workItems: [], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'forecast-only', owner: 'collection-review/workspace/reviews', entry: false, tentative: true, state: 'todo', reason: 'Forecast by hypothesis h1 at revision 1 (tentative); no work derives from a hypothesis', dependsOn: [], workItems: [], evidence: [], scenarios: null },
      ],
      total: 5,
    },
  },
  {
    title: 'M2 › a provider wait stays working, with its reason (the delegation)',
    response: {
      capabilities: [
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'Waiting for provider ob-ct-001 (rq-001)', dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'todo', reason: 'wi-002 not started', dependsOn: [], workItems: ['wi-002'], evidence: [], scenarios: null },
      ],
      total: 2,
    },
  },
  {
    title: 'M2 › a provider wait stays working, with its reason (the provider conformed, the consumer resumed)',
    response: {
      capabilities: [
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'The provider conformed; wi-001 is verifying rq-001 against it', dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'completed', reason: 'wi-002 passed its work-item gate ga-0007', dependsOn: [], workItems: ['wi-002'], evidence: ['ga-0007', 'ga-0006'], scenarios: null },
      ],
      total: 2,
    },
  },
  {
    title: 'M2 › verified reuse is completed',
    response: {
      capabilities: [
        { capability: 'review-panel', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'completed', reason: 'wi-001 passed its work-item gate ga-0003', dependsOn: [{ capability: 'format-date', tentative: false }], workItems: ['wi-001'], evidence: ['ga-0003'], scenarios: { implemented: 0, total: 0 } },
        { capability: 'format-date', owner: 'collection-review', entry: false, tentative: false, state: 'completed', reason: 'Verified reuse (no work item of its own): consumer wi-001 passed its gate', dependsOn: [], workItems: [], evidence: ['ga-0003'], scenarios: null },
      ],
      total: 2,
    },
  },
  {
    title: 'M2 › evidence-reopened returns a completed capability to working',
    response: {
      capabilities: [
        { capability: 'send-button', owner: 'collection-review/workspace/reviews', entry: true, tentative: false, state: 'working', reason: 'Waiting for provider ob-ct-001 (rq-001)', dependsOn: [{ capability: 'send-email', tentative: false }], workItems: ['wi-001'], evidence: [], scenarios: { implemented: 0, total: 0 } },
        { capability: 'send-email', owner: 'collection-review/workspace/reviews', entry: false, tentative: false, state: 'working', reason: 'Evidence reopened by contract-revision of ct-001 at revision 2; follow-up wi-003 of completed wi-002 is open', dependsOn: [], workItems: ['wi-002', 'wi-003'], evidence: ['ga-0007'], scenarios: null },
      ],
      total: 2,
    },
  },
];

export function CapabilityGraphExample() {
  return (
    <div className="capability-preview-shell">
      <header className="app-header">
        <span className="brand">ramify-agent</span>
        <span className="project">component preview · Progress → Dependencies</span>
      </header>
      <main>
        <p className="preview-kicker">Each graph is one run from <code>harness/src/tests/progress.test.ts</code>, as the projection answers it.</p>
        {cases.map(({ title, response }) => (
          <section key={title} className="capability-preview-case" aria-label={title}>
            <h2>{title}</h2>
            <CapabilityDependencyGraph capabilities={response.capabilities} total={response.total} />
          </section>
        ))}
      </main>
    </div>
  );
}
