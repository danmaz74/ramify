import { useState } from 'react';
import type { ModuleCapabilityComparisonResponse } from '../../../harness/src/interfaces/protocol/runs.js';
import { CapabilityModuleTree, type ModuleCapabilitySelection } from '../capability-module-tree.js';

/*
 * Development preview of Progress → By module, on the packaged Ramify canvas
 * the Run page uses. Each case is the harness's answer in
 * harness/src/tests/run-protocol.test.ts, "the module-capability comparison
 * of a completed scripted run, over HTTP", captured from that test's HTTP
 * reads: before the architect view is materialized, and after it. The
 * production Run page always reads the harness endpoint.
 */
const cases: ReadonlyArray<{ readonly title: string; readonly response: ModuleCapabilityComparisonResponse }> = [
  {
    title: 'after the architect view is materialized: every module declared, coverage complete',
    response: {
      identityPolicy: 'exact-capability-slug/1', runVersion: 46, initialView: { status: 'placeholder' },
      tree: {
        status: 'available', revision: 'rev/1:42090bd7-9d65-461f-8aba-85ea6664fad1:1', input: 'input/1:07bad224ce2ed76f5b006a6b7e80dd7f7a726c0e83480d00601a7d827a6cd791',
        modules: [
          { module: 'collection-review', dir: '', parent: null },
          { module: 'collection-review/integration-tests', dir: 'subs/integration-tests', parent: 'collection-review' },
          { module: 'collection-review/workspace', dir: 'subs/workspace', parent: 'collection-review' },
          { module: 'collection-review/workspace/catalog', dir: 'subs/workspace/subs/catalog', parent: 'collection-review/workspace' },
          { module: 'collection-review/workspace/catalog/core', dir: 'subs/workspace/subs/catalog/subs/core', parent: 'collection-review/workspace/catalog' },
          { module: 'collection-review/workspace/catalog/ui', dir: 'subs/workspace/subs/catalog/subs/ui', parent: 'collection-review/workspace/catalog' },
          { module: 'collection-review/workspace/contracts', dir: 'subs/workspace/subs/contracts', parent: 'collection-review/workspace' },
          { module: 'collection-review/workspace/reviews', dir: 'subs/workspace/subs/reviews', parent: 'collection-review/workspace' },
          { module: 'collection-review/workspace/reviews/core', dir: 'subs/workspace/subs/reviews/subs/core', parent: 'collection-review/workspace/reviews' },
          { module: 'collection-review/workspace/reviews/core/controller', dir: 'subs/workspace/subs/reviews/subs/core/subs/controller', parent: 'collection-review/workspace/reviews/core' },
          { module: 'collection-review/workspace/reviews/core/tasks', dir: 'subs/workspace/subs/reviews/subs/core/subs/tasks', parent: 'collection-review/workspace/reviews/core' },
          { module: 'collection-review/workspace/reviews/notes', dir: 'subs/workspace/subs/reviews/subs/notes', parent: 'collection-review/workspace/reviews' },
          { module: 'collection-review/workspace/reviews/notes/drafts', dir: 'subs/workspace/subs/reviews/subs/notes/subs/drafts', parent: 'collection-review/workspace/reviews/notes' },
          { module: 'collection-review/workspace/reviews/ui', dir: 'subs/workspace/subs/reviews/subs/ui', parent: 'collection-review/workspace/reviews' },
          { module: 'collection-review/workspace/reviews/ui/pure-ui', dir: 'subs/workspace/subs/reviews/subs/ui/subs/pure-ui', parent: 'collection-review/workspace/reviews/ui' },
          { module: 'collection-review/workspace/reviews/validation', dir: 'subs/workspace/subs/reviews/subs/validation', parent: 'collection-review/workspace/reviews' },
          { module: 'collection-review/workspace/shared-ui', dir: 'subs/workspace/subs/shared-ui', parent: 'collection-review/workspace' },
        ],
      },
      modules: [
        { module: 'collection-review', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/integration-tests', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/catalog', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/catalog/core', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/catalog/ui', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/contracts', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/core', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/core/controller', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/core/tasks', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/notes', placement: 'declared', proposedAtStart: null, capabilities: [{ capability: 'review-note', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-001 passed its work-item gate ga-0003', evidence: ['ga-0003'] } }, { capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }], implementedHere: null }] },
        { module: 'collection-review/workspace/reviews/notes/drafts', placement: 'declared', proposedAtStart: { parent: 'collection-review/workspace/reviews/notes', purpose: "Keeps a reviewer's unsent drafts.", tags: [] }, capabilities: [{ capability: 'note-drafts', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-002 passed its work-item gate ga-0005', evidence: ['ga-0005'] } }] },
        { module: 'collection-review/workspace/reviews/ui', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/ui/pure-ui', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/reviews/validation', placement: 'declared', proposedAtStart: null, capabilities: [] },
        { module: 'collection-review/workspace/shared-ui', placement: 'declared', proposedAtStart: null, capabilities: [] },
      ],
      coverage: { state: 'complete', capabilities: 3, implemented: 2 },
    },
  },
  {
    title: 'before the architect view is materialized: the tree is unavailable and every module is unplaced',
    response: {
      identityPolicy: 'exact-capability-slug/1', runVersion: 46, initialView: { status: 'placeholder' },
      tree: { status: 'unavailable', message: 'The architect view has not been materialized yet; a run materializes it before its initial analysis.' },
      modules: [
        { module: 'collection-review/workspace/reviews/notes', placement: 'unplaced', proposedAtStart: null, capabilities: [{ capability: 'review-note', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-001 passed its work-item gate ga-0003', evidence: ['ga-0003'] } }, { capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }], implementedHere: null }] },
        { module: 'collection-review/workspace/reviews/notes/drafts', placement: 'unplaced', proposedAtStart: { parent: 'collection-review/workspace/reviews/notes', purpose: "Keeps a reviewer's unsent drafts.", tags: [] }, capabilities: [{ capability: 'note-drafts', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-002 passed its work-item gate ga-0005', evidence: ['ga-0005'] } }] },
      ],
      coverage: { state: 'partial', knownCapabilities: 3, knownImplemented: 2, totalCapabilities: null, gaps: ['The current module tree is unavailable, so no module is placed: The architect view has not been materialized yet; a run materializes it before its initial analysis.'] },
    },
  },
];

function Case({ title, response }: { readonly title: string; readonly response: ModuleCapabilityComparisonResponse }) {
  const [selection, setSelection] = useState<ModuleCapabilitySelection | null>(null);
  return (
    <section className="capability-preview-case" aria-label={title}>
      <h2>{title}</h2>
      <CapabilityModuleTree comparison={response} selection={selection} onSelect={setSelection} />
    </section>
  );
}

export function CapabilityModuleExample() {
  return (
    <div className="capability-preview-shell">
      <main>
        <h1>Progress → By module</h1>
        <p className="preview-kicker">Each case is one answer from <code>harness/src/tests/run-protocol.test.ts</code>, as the harness served it.</p>
        {cases.map(item => <Case key={item.title} title={item.title} response={item.response} />)}
      </main>
    </div>
  );
}
