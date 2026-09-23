import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analysis, entry, hypothesis, requestCompletion, unresolved } from './analysis.js';
import { copyFixture } from './fixture.js';
import { byRole, readDeclaredTree, submit, treeInputs } from './iterations.js';
import { forkDecision, registryChange, requestPlacement } from './placement.js';
import { installTestRunner, openRuns, startRun } from './runs.js';
import { scriptedGit } from './scripted-git.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { directReadinessExecution } from './external-tools.js';
import { createPassingCheckExecution } from './direct-check-execution.js';

/*
 * The capability-progress fixture: one copy of the `collection-review`
 * project with five completed or failed scripted runs whose two progress
 * diagrams hold every case the browser acceptance needs. It is built by the
 * real run service with the scripted fake, never by writing records, and
 * its current module tree is stated as deterministic fixture data, so the
 * module-capability comparison and the capability list are the harness's
 * own answers. Git, Ramify, readiness and gate commands are explicit fakes:
 * no subprocess establishes any projection assertion here.
 *
 * - `placements` (revision-diff, completed): matching placement, changed
 *   placement, implemented-only, all three initial roles, dependency depth,
 *   a shared dependency, a cycle, tentative links, confirmed links and an
 *   omitted dependency target.
 * - `proposed` (review-notes, failed): an entry module proposed at start and
 *   absent from the tree, a registered `todo` beside tentative `todo`, and a
 *   run failure that is reported at run level only.
 * - `capabilityBound` (reviewer-identity, completed): more capabilities than
 *   the 500 either query returns.
 * - `rowBound` (status-badge-tone, completed): fewer capabilities than that,
 *   and more module-capability rows than the comparison's 2,000.
 * - `sixtyRows` (status-badge-tone, completed): one module with 60 rows.
 *
 * The query bounds are protocol constants, so the fixture reaches them by
 * size. Hypotheses create no work, which keeps the large runs cheap.
 */

export const R = 'collection-review';
export const contracts = `${R}/workspace/contracts`;
export const sharedUi = `${R}/workspace/shared-ui`;
export const core = `${R}/workspace/catalog/core`;
export const panel = `${R}/workspace/catalog/ui`;
export const reviewsCore = `${R}/workspace/reviews/core`;
export const validation = `${R}/workspace/reviews/validation`;
export const archive = `${sharedUi}/archive`;
export const archiveDirectory = 'subs/workspace/subs/shared-ui/subs/archive';

/** Every module of the fixture project a bulk hypothesis may name. */
export const fixtureModules = [
  R, `${R}/integration-tests`, `${R}/workspace`, sharedUi, contracts, `${R}/workspace/catalog`, core, panel,
  `${R}/workspace/reviews`, validation, `${R}/workspace/reviews/ui`, `${R}/workspace/reviews/ui/pure-ui`,
  reviewsCore, `${reviewsCore}/tasks`, `${reviewsCore}/controller`,
] as const;

export const fixturePlans = {
  placements: 'revision-diff',
  proposed: 'review-notes',
  capabilityBound: 'reviewer-identity',
  rowBound: 'status-badge-tone',
  sixtyRows: 'status-badge-tone',
} as const;

export type FixtureRun = keyof typeof fixturePlans;

/** How many hypotheses the bound runs forecast. */
export const capabilityBoundHypotheses = 520;
export const rowBoundHypotheses = 402;
/** Each row-bound hypothesis has its suggested owner and this many involved modules. */
export const rowBoundInvolved = 4;

const bulk = (prefix: string, index: number) => `${prefix}-${String(index).padStart(3, '0')}`;

/** The rich run: two entries, three placement decisions and the forecast graph. */
function placementsScript() {
  return byRole({
    'initial-architect': [submit(analysis(
      [
        entry('compare-revisions', core, 'Compares two revisions of one record, field by field.'),
        entry('compare-panel', panel, 'Shows the comparison of two revisions on the record card.'),
      ],
      [
        // Changed placement: suggested for the core, involving the contracts;
        // a later decision moves it to the panel, where it is verified.
        hypothesis('field-diff', {
          change: 'create', suggestedOwner: core, involvedModules: [contracts], anticipatedConsumers: [panel],
          dependsOn: ['text-wrap'],
          rationale: 'Comparing two field maps may be one capability both surfaces use.',
        }),
        // Dependency depth: review-digest → digest-format → text-wrap.
        hypothesis('review-digest', { change: 'create', suggestedOwner: reviewsCore, dependsOn: ['digest-format'] }),
        hypothesis('digest-format', { change: 'create', suggestedOwner: sharedUi, dependsOn: ['text-wrap'] }),
        // A shared dependency of digest-format, field-diff and note-preview.
        hypothesis('text-wrap', { suggestedOwner: sharedUi }),
        // A dependency target no capability of the run answers.
        hypothesis('note-preview', { change: 'create', suggestedOwner: panel, dependsOn: ['text-wrap', 'spell-check'] }),
        // A cycle.
        hypothesis('draft-sync', { change: 'create', suggestedOwner: validation, dependsOn: ['draft-merge'] }),
        hypothesis('draft-merge', { change: 'create', suggestedOwner: validation, dependsOn: ['draft-sync'] }),
      ],
    ))],
    'local-architect': [
      // wi-001, compare-revisions in the core.
      submit(requestPlacement({
        forCapability: 'compare-revisions',
        question: 'Does comparing two revisions belong here, or to the panel that shows it?',
        findings: [{ text: 'The core holds the revision chain.', citations: [{ module: core }] }],
        candidates: [{ owner: core, note: 'It already holds the chain.' }],
      })),
      submit(requestPlacement({
        forCapability: 'compare-revisions',
        question: 'Is the core still the right owner of field-diff now that only the panel reads it?',
      })),
      submit(requestPlacement({
        forCapability: 'compare-revisions',
        question: 'Where does walking the revision chain belong?',
        candidates: [{ owner: core, note: 'The chain is stored here.' }],
      })),
      submit(requestCompletion()),
      // wi-002, compare-panel in the panel.
      submit(requestPlacement({
        forCapability: 'compare-panel',
        question: 'Does the panel need its own comparison of two revisions?',
        candidates: [{ capability: 'field-diff', owner: panel, note: 'The brief says the panel owns it now.' }],
      })),
      submit(requestCompletion()),
    ],
    'global-fork': [
      submit(forkDecision({
        decision: {
          question: 'Where does comparing two revisions field by field belong?',
          outcome: 'create', capability: 'field-diff', changesExistingSymbols: false, owner: core,
          rationale: 'The core already holds the revision chain.',
          constraints: [], uncertainties: [], evidence: { citations: [{ module: core }], gaps: [] },
        },
        registry: [registryChange({ capability: 'field-diff', owner: core, behavior: 'Compares two revisions of one record and names the fields that differ.' })],
        brief: 'field-diff belongs to the catalog core.',
      })),
      submit(forkDecision({
        decision: {
          question: 'Is the core still the right owner of field-diff now that only the panel reads it?',
          outcome: 'extract', capability: 'field-diff', changesExistingSymbols: true, owner: panel,
          rationale: 'The only reader is the panel, and the comparison has no other consumer.',
          constraints: [], uncertainties: [], evidence: { citations: [{ module: panel }], gaps: [] },
          revises: { decision: 'gd-001', affected: [{ workItem: 'wi-002', consequence: 'The panel owns the comparison it was going to consume.' }] },
        },
        registry: [registryChange({ capability: 'field-diff', owner: panel, behavior: 'Compares two revisions of one record and names the fields that differ.' })],
        brief: 'field-diff moves from the catalog core to the panel; gd-001 is replaced.',
      })),
      // Implemented only: a capability no initial record names.
      submit(forkDecision({
        decision: {
          question: 'Where does walking the revision chain belong?',
          outcome: 'create', capability: 'revision-chain', changesExistingSymbols: false, owner: core,
          rationale: 'The chain is stored in the core, and only the comparison walks it.',
          constraints: [], uncertainties: [], evidence: { citations: [{ module: core }], gaps: [] },
        },
        registry: [registryChange({
          capability: 'revision-chain', owner: core, behavior: 'Walks one record\'s revisions in order.',
          consumers: [{ capability: 'compare-revisions', workItem: 'wi-001' }],
        })],
        brief: 'revision-chain is new, in the catalog core; compare-revisions consumes it.',
      })),
      submit(forkDecision({
        decision: {
          question: 'Does the panel need its own comparison of two revisions?',
          outcome: 'reuse', capability: 'field-diff', changesExistingSymbols: false, owner: panel,
          rationale: 'gd-002 placed it in the panel, which is its only consumer.',
          constraints: [], uncertainties: [], evidence: { citations: [{ module: panel }], gaps: [] },
        },
        registry: [registryChange({
          capability: 'field-diff', owner: panel, behavior: 'Compares two revisions of one record and names the fields that differ.',
          consumers: [{ capability: 'compare-panel', workItem: 'wi-002' }],
        })],
        brief: 'The panel consumes field-diff; nothing new was placed.',
      })),
    ],
  });
}

/** A failed run: the first entry proposes a module and cannot be resolved; the second never starts. */
function proposedScript() {
  return byRole({
    'initial-architect': [submit(analysis(
      [
        entry('badge-archive', archive, 'Keeps retired status badges for later review.', {
          parent: sharedUi, directory: archiveDirectory, purpose: 'Keeps retired status badges.', tags: [],
        }),
        entry('badge-legend', sharedUi, 'Explains each badge tone in a legend.'),
      ],
      [hypothesis('badge-tones', { change: 'create', suggestedOwner: sharedUi, dependsOn: ['badge-legend'] })],
    ))],
    'local-architect': [submit(unresolved('The archive would need the badge history, which the plan says is never stored.'))],
  });
}

/** Only hypotheses: no work item, so the run completes as soon as its analysis is accepted. */
function forecastScript(hypotheses: ReadonlyArray<ReturnType<typeof hypothesis>>) {
  return byRole({ 'initial-architect': [submit(analysis([], hypotheses))] });
}

function capabilityBoundScript() {
  return forecastScript(Array.from({ length: capabilityBoundHypotheses }, (_, index) =>
    hypothesis(bulk('forecast', index + 1), { suggestedOwner: fixtureModules[index % fixtureModules.length]! })));
}

function rowBoundScript() {
  return forecastScript(Array.from({ length: rowBoundHypotheses }, (_, index) => {
    const at = (offset: number) => fixtureModules[(index + offset) % fixtureModules.length]!;
    return hypothesis(bulk('rows', index + 1), {
      suggestedOwner: at(0),
      involvedModules: Array.from({ length: rowBoundInvolved }, (_, offset) => at(offset + 1)),
    });
  }));
}

function sixtyRowsScript() {
  return forecastScript([
    ...Array.from({ length: 60 }, (_, index) => hypothesis(bulk('check', index + 1), { suggestedOwner: validation })),
    hypothesis('record-label', { suggestedOwner: core }),
  ]);
}

const scripts: Record<FixtureRun, () => ReturnType<typeof byRole>> = {
  placements: placementsScript,
  proposed: proposedScript,
  capabilityBound: capabilityBoundScript,
  rowBound: rowBoundScript,
  sixtyRows: sixtyRowsScript,
};

/** The unchanged commit boundaries each scripted run reaches. */
const checkpoints: Record<FixtureRun, readonly string[]> = {
  placements: ['wi-001', 'wi-002', 'final verification of plan "revision-diff"'],
  proposed: [],
  capabilityBound: ['final verification of plan "reviewer-identity"'],
  rowBound: ['final verification of plan "status-badge-tone"'],
  sixtyRows: ['final verification of plan "status-badge-tone"'],
};

export interface ProgressFixture {
  readonly root: string;
  /** Each run's plan and ID. */
  readonly runs: Readonly<Record<FixtureRun, { readonly planId: string; readonly runId: string; readonly state: string }>>;
  remove(): Promise<void>;
}

/**
 * Builds the fixture: a project copy, each run driven to its end by its own
 * run service over explicit external-system answers, and a deterministic
 * current-tree fixture for the HTTP projection.
 */
export async function progressFixture(): Promise<ProgressFixture> {
  const fixture = await copyFixture();
  try {
    await installTestRunner(fixture.root);
    const runs = {} as Record<FixtureRun, { planId: string; runId: string; state: string }>;
    for (const name of Object.keys(scripts) as FixtureRun[]) {
      const planId = fixturePlans[name];
      const git = scriptedGit(fixture.root, {
        head: `progress-fixture-${name}`,
        checkpoints: checkpoints[name].map(subject => ({ subject, commit: null, changes: [] })),
      });
      const ramify = new FakeRamifyCli();
      const opened = await openRuns(fixture.root, {
        script: scripts[name](),
        inputs: treeInputs(),
        git,
        ramify,
        readinessExecution: directReadinessExecution(),
        checkExecution: createPassingCheckExecution(),
      });
      try {
        const runId = (await opened.service.execute(startRun(planId))).jobId;
        await opened.service.settled(planId, runId);
        const state = opened.service.getRun(planId, runId)?.state ?? 'unknown';
        runs[name] = { planId, runId, state };
      } finally {
        await opened.service.close();
      }
      git.assertComplete();
      assertFakeRamifyComplete(name, fixture.root, ramify);
    }
    await writeArchitectTreeFixture(fixture.root);
    return { root: fixture.root, runs, remove: fixture.remove };
  } catch (error) {
    await fixture.remove();
    throw error;
  }
}

/** Every run consumes the exact fake command-line answers its lifecycle needs. */
function assertFakeRamifyComplete(name: FixtureRun, root: string, ramify: FakeRamifyCli): void {
  const calls = ramify.calls.map(call => `${call.operation} ${call.argv.join(' ')}`);
  const expected = [
    `run measure --root ${root} --format json`,
    'run --version',
    ...(name === 'placements' ? [
      `materialize materialize --view architect --view api --from subs/workspace/subs/catalog/subs/core --root ${root}`,
      `materialize materialize --view architect --view api --from subs/workspace/subs/catalog/subs/ui --root ${root}`,
    ] : []),
  ];
  if (JSON.stringify(calls) !== JSON.stringify(expected)) {
    throw new Error(`The ${name} fixture made unexpected Ramify calls: ${JSON.stringify(calls)}; expected ${JSON.stringify(expected)}`);
  }
}

/**
 * Writes exactly the module documents the projection reader consumes, from
 * the project's current declarations. A fixture that adds modules writes
 * them again.
 */
export async function writeArchitectTreeFixture(root: string): Promise<void> {
  const tree = await readDeclaredTree(root);
  const directory = join(root, '.ramify-architect');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '_meta.json'), JSON.stringify({
    schema: 'ramify.architect-view/1',
    revision: tree.revision,
    input: tree.input,
    modules: tree.modules.size,
    dependencies: 'measured',
  }));
  for (const module of tree.modules.values()) {
    const target = join(directory, ...module.module.split('/'));
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'module.json'), JSON.stringify(module));
  }
}
