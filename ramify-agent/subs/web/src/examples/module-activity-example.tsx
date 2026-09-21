import type { ModuleTree } from '../../../harness/src/interfaces/protocol/evidence.js';
import { ModuleActivityTree, type ModuleCapabilityComparison } from '../module-activity-tree.js';

/*
 * Development preview composed from executable harness cases:
 * - run-protocol.test.ts supplies the review-note and note-drafts entries,
 *   the note-search hypothesis, and the two completed entry capabilities;
 * - progress.test.ts supplies note-storage's initial module associations and
 *   the locally discovered send-email capability with completion evidence.
 *
 * The combined projection is illustrative; it is not presented as one stored
 * run. The production view will consume the harness-owned comparison endpoint.
 */

const root = 'collection-review';
const reviews = `${root}/workspace/reviews`;
const notes = `${reviews}/notes`;
const drafts = `${notes}/drafts`;

const tree: ModuleTree = {
  status: 'available',
  revision: 'composed-example:current',
  input: 'collection-review fixture',
  modules: [
    { module: root, dir: '', parent: null },
    { module: `${root}/integration-tests`, dir: 'subs/integration-tests', parent: root },
    { module: `${root}/workspace`, dir: 'subs/workspace', parent: root },
    { module: `${root}/workspace/contracts`, dir: 'subs/workspace/subs/contracts', parent: `${root}/workspace` },
    { module: reviews, dir: 'subs/workspace/subs/reviews', parent: `${root}/workspace` },
    { module: `${reviews}/core`, dir: 'subs/workspace/subs/reviews/subs/core', parent: reviews },
    { module: `${reviews}/core/controller`, dir: 'subs/workspace/subs/reviews/subs/core/subs/controller', parent: `${reviews}/core` },
    { module: `${reviews}/core/tasks`, dir: 'subs/workspace/subs/reviews/subs/core/subs/tasks', parent: `${reviews}/core` },
    { module: notes, dir: 'subs/workspace/subs/reviews/subs/notes', parent: reviews },
    { module: drafts, dir: 'subs/workspace/subs/reviews/subs/notes/subs/drafts', parent: notes },
    { module: `${reviews}/ui`, dir: 'subs/workspace/subs/reviews/subs/ui', parent: reviews },
    { module: `${reviews}/ui/pure-ui`, dir: 'subs/workspace/subs/reviews/subs/ui/subs/pure-ui', parent: `${reviews}/ui` },
    { module: `${reviews}/validation`, dir: 'subs/workspace/subs/reviews/subs/validation', parent: reviews },
    { module: `${root}/workspace/shared-ui`, dir: 'subs/workspace/subs/shared-ui', parent: `${root}/workspace` },
  ],
};

const modules: ModuleCapabilityComparison[] = [
  {
    module: root,
    capabilities: [{
      capability: 'note-storage',
      initial: [{ role: 'suggested-owner', hypothesis: 'note-storage' }],
      completedHere: null,
    }],
  },
  {
    module: reviews,
    capabilities: [
      {
        capability: 'note-storage',
        initial: [{ role: 'involved', hypothesis: 'note-storage' }],
        completedHere: null,
      },
      {
        capability: 'send-email',
        initial: [],
        completedHere: {
          reason: 'Provider work completed with current verification evidence.',
          evidence: ['ga-0007', 'ga-0006'],
        },
      },
    ],
  },
  {
    module: notes,
    capabilities: [
      {
        capability: 'review-note',
        initial: [{ role: 'entry-owner', hypothesis: null }],
        completedHere: {
          reason: 'The entry work item completed with current verification evidence.',
          evidence: ['work-item gate'],
        },
      },
      {
        capability: 'note-search',
        initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }],
        completedHere: null,
      },
    ],
  },
  {
    module: drafts,
    proposed: {
      parent: notes,
      purpose: "Keeps a reviewer's unsent drafts.",
      tags: [],
    },
    capabilities: [{
      capability: 'note-drafts',
      initial: [{ role: 'entry-owner', hypothesis: null }],
      completedHere: {
        reason: 'The proposed module was created and its entry work item completed.',
        evidence: ['module-creation gate'],
      },
    }],
  },
];

export function ModuleActivityExample() {
  return (
    <div className="activity-preview-shell">
      <header className="app-header">
        <span className="brand">ramify-agent</span>
        <span className="project">component preview · initial hypothesis versus implemented capability</span>
      </header>
      <main>
        <p className="preview-kicker">Proposed product placement: Run → Progress, beside the capability dependency graph.</p>
        <ModuleActivityTree
          tree={tree}
          modules={modules}
          total={{ capabilities: 5, completed: 3 }}
          coverage="complete"
          gaps={[]}
          analysisIdentity="revision 1 · composed executable examples"
        />
        <p className="preview-source muted">Example data is composed from <code>harness/src/tests/run-protocol.test.ts</code> and <code>harness/src/tests/progress.test.ts</code>. It demonstrates matching, initial-only and implemented-only placement without introducing mismatch statuses.</p>
      </main>
    </div>
  );
}
