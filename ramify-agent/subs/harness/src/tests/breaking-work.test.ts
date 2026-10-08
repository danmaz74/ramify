import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { gateDiagnostics } from '../checks/diagnostics.js';
import type { GateAttempt } from '../checks/records.js';
import { iterationLayout, type IterationAssignment, type IterationResult } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import { workLayout } from '../work/records.js';
import { localArchitectToolName } from '../work/submission.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry } from './helpers/analysis.js';
import {
  addModule, assign, byRole, completionProposed, installMiniRunner, read,
  shell, submit, treeInputs, write, type Turn,
} from './helpers/iterations.js';
import {
  onlyRun, openRuns, runEventsOnDisk, runPath, startRun,
} from './helpers/runs.js';
import { localCommandAudit } from './helpers/direct-check-execution.js';
import { gateGit, scenariosCommit, type GateCommit, type GateGitOptions } from './helpers/gate-git.js';
import { finalCandidate } from './helpers/final-candidate.js';

/*
 * Breaking work and gate integrity.
 *
 * A break is isolated into ordinary iterations whose checkpoint is the whole
 * project, and the gate cannot be satisfied by weakening what it checks. The
 * source below is real source in real modules, every edit is made through the
 * implementation's own built-ins behind the write guard, and the scenarios
 * whose subject is a command or an unguarded shell write really run one.
 *
 * Git is external and is answered rather than run: each scenario states the
 * revision Git reports at every boundary it reaches, and the boundaries
 * where it reports an unchanged tree. Nothing below reads a repository.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const plan = 'reviewer-identity';

/** The four owners the break runs through, and where each one lives. */
const attribution = 'collection-review/workspace/reviews/attribution';
const core = `${attribution}/core`;
const views = `${attribution}/views`;
const pure = `${views}/pure`;

const dirA = 'subs/workspace/subs/reviews/subs/attribution';
const dirC = `${dirA}/subs/core`;
const dirV = `${dirA}/subs/views`;
const dirP = `${dirV}/subs/pure`;

// The state the run starts from: a review outcome that names its reviewer
// with one plain string, carried through both surfaces and both views.

const coreV0 = `export interface ReviewOutcome {
  recordId: string;
  status: string;
  reviewedBy: string;
}

export function reviewRecord(recordId: string, reviewedBy: string): ReviewOutcome {
  return { recordId, status: 'passed', reviewedBy };
}
`;

const coreTestV0 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review names the record and who reviewed it', () => {
  expect(reviewRecord('rec-1', 'Ada Lovelace').reviewedBy).toBe('Ada Lovelace');
});
`;

const adaptersV0 = `import { reviewRecord } from '../subs/core/src/outcome.ts';

export function runQuery(recordId: string, reviewedBy: string) {
  const outcome = reviewRecord(recordId, reviewedBy);
  return { recordId: outcome.recordId, status: outcome.status, reviewer: outcome.reviewedBy };
}

export function runTool(recordId: string, reviewedBy: string): string {
  return JSON.stringify(runQuery(recordId, reviewedBy));
}
`;

const adaptersTestV0 = `import { test, expect } from 'vitest';
import { runQuery, runTool } from '../adapters.ts';

test('both surfaces carry the reviewer', () => {
  expect(runQuery('rec-1', 'Ada Lovelace').reviewer).toBe('Ada Lovelace');
  expect(JSON.parse(runTool('rec-1', 'Ada Lovelace')).reviewer).toBe('Ada Lovelace');
});
`;

const panelV0 = `import { runQuery } from '../../../src/adapters.ts';
import { showResult } from '../subs/pure/src/result.ts';

export function loadReview(recordId: string, reviewedBy: string): string {
  const answer = runQuery(recordId, reviewedBy);
  return showResult({ recordId: answer.recordId, status: answer.status, reviewer: answer.reviewer });
}
`;

const panelTestV0 = `import { test, expect } from 'vitest';
import { loadReview } from '../panel.ts';

test('the panel renders what the surface answered', () => {
  expect(loadReview('rec-1', 'Ada Lovelace')).toBe('rec-1: passed, reviewed by Ada Lovelace');
});
`;

const pureV0 = `export interface ReviewResultProps {
  recordId: string;
  status: string;
  reviewer: string;
}

export function showResult(props: ReviewResultProps): string {
  return props.recordId + ': ' + props.status + ', reviewed by ' + props.reviewer;
}
`;

const pureTestV0 = `import { test, expect } from 'vitest';
import { showResult } from '../result.ts';

test('the pure view states the verdict and the reviewer', () => {
  expect(showResult({ recordId: 'rec-1', status: 'passed', reviewer: 'Ada Lovelace' })).toBe('rec-1: passed, reviewed by Ada Lovelace');
});
`;

// Stage 1: the new representation arrives beside the old one, and nothing
// outside this module has to change for it.

const coreV1 = `export interface Reviewer {
  id: string;
  displayName: string;
  role: string;
}

export interface ReviewOutcome {
  recordId: string;
  status: string;
  reviewer: Reviewer;
  reviewedBy: string;
}

export function reviewRecord(recordId: string, reviewedBy: string): ReviewOutcome {
  return reviewRecordFor(recordId, { id: reviewedBy.toLowerCase(), displayName: reviewedBy, role: 'reviewer' });
}

export function reviewRecordFor(recordId: string, reviewer: Reviewer): ReviewOutcome {
  return { recordId, status: 'passed', reviewer, reviewedBy: reviewer.displayName };
}
`;

const coreTestV1 = `import { test, expect } from 'vitest';
import { reviewRecord, reviewRecordFor } from '../outcome.ts';

test('a review names the record and who reviewed it', () => {
  expect(reviewRecord('rec-1', 'Ada Lovelace').reviewedBy).toBe('Ada Lovelace');
});

test('the structured reviewer carries an id, a display name and a role', () => {
  const outcome = reviewRecordFor('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' });
  expect(outcome.reviewer.id).toBe('ada');
  expect(outcome.reviewer.role).toBe('lead');
});
`;

// Stage 2: the break. The outcome is made from a reviewer, and every
// consumer is adapted in the same iteration.

const coreV2 = `export interface Reviewer {
  id: string;
  displayName: string;
  role: string;
}

export interface ReviewOutcome {
  recordId: string;
  status: string;
  reviewer: Reviewer;
  reviewedBy: string;
}

export function reviewRecord(recordId: string, reviewer: Reviewer): ReviewOutcome {
  return { recordId, status: 'passed', reviewer, reviewedBy: reviewer.displayName };
}
`;

const coreTestV2 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review is made from a structured reviewer', () => {
  const outcome = reviewRecord('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' });
  expect(outcome.reviewer.displayName).toBe('Ada Lovelace');
  expect(outcome.reviewer.role).toBe('lead');
});
`;

const adaptersV2 = `import { reviewRecord } from '../subs/core/src/outcome.ts';
import type { Reviewer } from '../subs/core/src/outcome.ts';

export function runQuery(recordId: string, reviewer: Reviewer) {
  const outcome = reviewRecord(recordId, reviewer);
  return {
    recordId: outcome.recordId,
    status: outcome.status,
    reviewer: outcome.reviewer,
    reviewedBy: outcome.reviewedBy,
  };
}

export function runTool(recordId: string, reviewer: Reviewer): string {
  return JSON.stringify(runQuery(recordId, reviewer));
}
`;

const adaptersTestV2 = `import { test, expect } from 'vitest';
import { runQuery, runTool } from '../adapters.ts';

const ada = { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' };

test('both surfaces carry the structured reviewer', () => {
  expect(runQuery('rec-1', ada).reviewer.role).toBe('lead');
  expect(JSON.parse(runTool('rec-1', ada)).reviewer.displayName).toBe('Ada Lovelace');
});

test('the plain field is still answered while the consumers migrate', () => {
  expect(runQuery('rec-1', ada).reviewedBy).toBe('Ada Lovelace');
});
`;

const panelV2 = `import { runQuery } from '../../../src/adapters.ts';
import { showResult } from '../subs/pure/src/result.ts';

export function loadReview(recordId: string, reviewer: { id: string; displayName: string; role: string }): string {
  const answer = runQuery(recordId, reviewer);
  return showResult({
    recordId: answer.recordId,
    status: answer.status,
    reviewerName: answer.reviewer.displayName,
    reviewerRole: answer.reviewer.role,
  });
}
`;

const panelTestV2 = `import { test, expect } from 'vitest';
import { loadReview } from '../panel.ts';

test('the panel renders the reviewer\\'s name and role', () => {
  expect(loadReview('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' }))
    .toBe('rec-1: passed, reviewed by Ada Lovelace (lead)');
});
`;

const pureV2 = `export interface ReviewResultProps {
  recordId: string;
  status: string;
  reviewerName: string;
  reviewerRole: string;
}

export function showResult(props: ReviewResultProps): string {
  return props.recordId + ': ' + props.status + ', reviewed by ' + props.reviewerName + ' (' + props.reviewerRole + ')';
}
`;

const pureTestV2 = `import { test, expect } from 'vitest';
import { showResult } from '../result.ts';

test('the pure view states the verdict, the reviewer and the role', () => {
  expect(showResult({ recordId: 'rec-1', status: 'passed', reviewerName: 'Ada Lovelace', reviewerRole: 'lead' }))
    .toBe('rec-1: passed, reviewed by Ada Lovelace (lead)');
});
`;

// Stage 3: the removal. Nothing carries the plain field any more.

const coreV3 = `export interface Reviewer {
  id: string;
  displayName: string;
  role: string;
}

export interface ReviewOutcome {
  recordId: string;
  status: string;
  reviewer: Reviewer;
}

export function reviewRecord(recordId: string, reviewer: Reviewer): ReviewOutcome {
  return { recordId, status: 'passed', reviewer };
}
`;

const coreTestV3 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review carries the structured reviewer and nothing else of the reviewer', () => {
  const outcome = reviewRecord('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' });
  expect(outcome.reviewer.displayName).toBe('Ada Lovelace');
  expect(Object.keys(outcome).join(',')).toBe('recordId,status,reviewer');
});
`;

const adaptersV3 = `import { reviewRecord } from '../subs/core/src/outcome.ts';
import type { Reviewer } from '../subs/core/src/outcome.ts';

export function runQuery(recordId: string, reviewer: Reviewer) {
  const outcome = reviewRecord(recordId, reviewer);
  return { recordId: outcome.recordId, status: outcome.status, reviewer: outcome.reviewer };
}

export function runTool(recordId: string, reviewer: Reviewer): string {
  return JSON.stringify(runQuery(recordId, reviewer));
}
`;

const adaptersTestV3 = `import { test, expect } from 'vitest';
import { runQuery, runTool } from '../adapters.ts';

const ada = { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' };

test('both surfaces carry the structured reviewer and only that', () => {
  expect(runQuery('rec-1', ada).reviewer.role).toBe('lead');
  expect(Object.keys(runQuery('rec-1', ada)).join(',')).toBe('recordId,status,reviewer');
  expect(JSON.parse(runTool('rec-1', ada)).reviewer.displayName).toBe('Ada Lovelace');
});
`;

/** The fixture copy the break runs in, with the four owners it runs through. */
async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, dirA, 'attribution', {
    'src/adapters.ts': adaptersV0,
    'src/tests/adapters.test.ts': adaptersTestV0,
  });
  await addModule(fixture.root, dirC, 'core', {
    'src/outcome.ts': coreV0,
    'src/tests/outcome.test.ts': coreTestV0,
  });
  await addModule(fixture.root, dirV, 'views', {
    'src/panel.ts': panelV0,
    'src/tests/panel.test.ts': panelTestV0,
  });
  await addModule(fixture.root, dirP, 'pure', {
    'src/result.ts': pureV0,
    'src/tests/result.test.ts': pureTestV0,
  });
  await installMiniRunner(fixture.root);
  return fixture.root;
}

/** The revision the fixture is on before a run commits anything. */
const base = 'revision-00';

/**
 * The harness's own commit of the run's one feature file, made once
 * readiness has passed; every later boundary is asked against it.
 */
const materialized = 'scenarios-00';
const scenarios = scenariosCommit(plan, materialized, base, [`${dirA}/src/tests/features/${plan}/reviewer-identity.feature`]);

/** A boundary Git reports as unchanged, which commits nothing. */
const unchanged: GateCommit = { commit: null };

/** A boundary Git reports as the named modified files, answering the revision it made. */
const revision = (commit: string, ...paths: string[]): GateCommit => ({
  commit,
  changes: paths.map(path => ({ status: 'M', path })),
});

async function run(
  root: string,
  script: Parameters<typeof byRole>[0],
  answers: Omit<GateGitOptions, 'head'> & { readonly finalHead?: string },
  options: Omit<Parameters<typeof openRuns>[1], 'git'> = {},
) {
  const { finalHead, ...gitAnswers } = answers;
  const final = finalHead === undefined ? undefined : finalCandidate(root, finalHead);
  const scripted = gateGit(root, { head: base, ...gitAnswers, ...(final === undefined ? {} : { previews: final.previews }) });
  const opened = await openRuns(root, {
    script: byRole(script),
    inputs: treeInputs(),
    git: scripted.git,
    ...(final === undefined ? {} : { candidates: final.candidates }),

    ...options,
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { ...opened, runId: receipt.jobId, scripted };
}

/**
 * The project's configured audit for these scenarios, answered in place: its
 * test check runs the four modules' real tests with the stand-in runner,
 * whatever the gate. The definition names them; the harness selects none.
 */
function projectAudit(root: string) {
  return localCommandAudit({ tests: [join(root, 'node_modules/.bin/vitest'), 'run',
    `${dirA}/src/tests/adapters.test.ts`, `${dirC}/src/tests/outcome.test.ts`,
    `${dirP}/src/tests/result.test.ts`, `${dirV}/src/tests/panel.test.ts`] });
}

async function readGate(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

/** Every gate attempt the run committed, in the order it made them. */
async function gates(root: string, runId: string): Promise<GateAttempt[]> {
  const events = await runEventsOnDisk(root, plan, runId);
  const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
  return Promise.all(ids.map(id => readGate(root, runId, id)));
}

async function readAssignment(root: string, runId: string, workItem: string, number: number): Promise<IterationAssignment> {
  return JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.assignment(workItem, number)), 'utf8')) as IterationAssignment;
}

async function readResult(root: string, runId: string, workItem: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.result(workItem, number)), 'utf8')) as IterationResult;
}

/** Every file beneath one directory of the project, read as text. */
async function sources(root: string, directory: string): Promise<Array<{ path: string; text: string }>> {
  const found: Array<{ path: string; text: string }> = [];
  const walk = async (relative: string): Promise<void> => {
    for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
      const next = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(next);
      else if (item.name.endsWith('.ts')) found.push({ path: next, text: await readFile(join(root, next), 'utf8') });
    }
  };
  await walk(directory);
  return found;
}

/** An outline that records the break and the three stages it is isolated into. */
function stagedOutline(revisionReason = '') {
  return {
    changes: 'The review outcome names its reviewer with one plain string. The request asks for a structured reviewer in its place, which breaks every consumer of the outcome.',
    decomposition: { kind: 'staged' as const, rationale: 'The break cannot be made in one step without an incoherent intermediate state.' },
    reuse: [],
    breakingChanges: [{
      guarantee: 'ReviewOutcome carries the reviewer as the plain string "reviewedBy".',
      reason: 'The request asks for an identifier, a display name and a role, which one string cannot hold.',
      affectedConsumers: [attribution, views, pure],
      citations: [{ module: core, file: `${dirC}/src/outcome.ts`, symbol: 'ReviewOutcome' }],
    }],
    stages: [
      { title: 'Introduce the structured reviewer beside the plain field', approach: 'non-breaking' as const, dependsOn: [], note: 'Temporary compatibility: both representations are filled.' },
      { title: 'Make the outcome from a reviewer and adapt every consumer', approach: 'breaking' as const, dependsOn: [0], note: 'The break itself, in one explicitly scoped iteration.' },
      { title: 'Remove the plain field', approach: 'breaking' as const, dependsOn: [1], note: 'Nothing reads it by then.' },
    ],
    revisionReason,
  };
}

const broadRationale = 'The outcome and its consumers cannot compile apart once the representation changes, so the interface change and the consumer adaptations belong to one iteration.';

function broadScope(rationale = broadRationale) {
  return {
    base: { modules: [attribution, core, views, pure], rationale },
    extra: [],
    read: [],
    rationale: 'The break runs through these four owners and nothing else.',
  };
}

describe('K7: a breaking feature is isolated into iterations that are green at every accepted boundary', () => {
  test('the reviewer-identity run stages the break, and every accepted boundary passes the breaking-iteration gate', async () => {
    const root = await target();
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
      'local-architect': [
        // Stage 0: compatible preparation, in the one module that defines
        // the representation.
        submit(assign(core, {
          kind: 'breaking',
          stage: 0,
          goal: 'Introduce the structured reviewer beside the plain field.',
          scope: { base: { module: core, included: [] }, extra: [], read: [], rationale: 'The representation is defined here.' },
        }, stagedOutline())),
        // Stage 1: the break, with the explicitly broad scope and its
        // rationale.
        submit(assign(core, {
          kind: 'breaking',
          stage: 1,
          goal: 'Make the outcome from a structured reviewer and adapt every consumer.',
          scope: broadScope(),
        })),
        // Stage 2: the removal.
        submit(assign(core, {
          kind: 'breaking',
          stage: 2,
          goal: 'Remove the plain reviewer field from the outcome and the surfaces.',
          scope: broadScope('The field is removed from the outcome and from the surface that still answers it, which cannot happen apart.'),
        })),
        submit({ kind: 'request-completion', summary: 'The reviewer is structured, and nothing carries the plain field.', outline: stagedOutline('The three stages are done.') }),
      ],
      engineer: [
        submit(completionProposed('Added the structured reviewer beside the plain field, both filled.'),
          read(join(root, dirC, 'src/outcome.ts')),
          write(join(root, dirC, 'src/outcome.ts'), coreV1),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV1)),
        submit(completionProposed('The outcome is made from a reviewer, and both surfaces and both views carry it.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV2),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV2),
          write(join(root, dirA, 'src/adapters.ts'), adaptersV2),
          write(join(root, dirA, 'src/tests/adapters.test.ts'), adaptersTestV2),
          write(join(root, dirP, 'src/result.ts'), pureV2),
          write(join(root, dirP, 'src/tests/result.test.ts'), pureTestV2),
          write(join(root, dirV, 'src/panel.ts'), panelV2),
          write(join(root, dirV, 'src/tests/panel.test.ts'), panelTestV2)),
        submit(completionProposed('Removed the plain reviewer field from the outcome and from the surface that answered it.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV3),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV3),
          write(join(root, dirA, 'src/adapters.ts'), adaptersV3),
          write(join(root, dirA, 'src/tests/adapters.test.ts'), adaptersTestV3)),
      ],
    }, {
      // One revision for each accepted stage, then the work item's gate and
      // the run's own, each over a tree Git reports as unchanged.
      commits: [
        scenarios,
        revision('revision-01', `${dirC}/src/outcome.ts`, `${dirC}/src/tests/outcome.test.ts`),
        revision('revision-02', `${dirC}/src/outcome.ts`, `${dirA}/src/adapters.ts`, `${dirP}/src/result.ts`, `${dirV}/src/panel.ts`),
        revision('revision-03', `${dirC}/src/outcome.ts`, `${dirA}/src/adapters.ts`),
        unchanged,
        unchanged,
      ],
      finalHead: 'revision-03',
    }, { configuredAudit: projectAudit(root) });

    expect(onlyRun(service, plan).state, JSON.stringify({ tail: (await runEventsOnDisk(root, plan, runId)).slice(-8), gates: (await gates(root, runId)).map(gate => ({ id: gate.id, verdict: gate.verdict, commands: gate.commands.map(command => ({ kind: command.kind, outcome: command.outcome, output: command.output.tail.slice(-1000) })) })) })).toBe('completed');

    // Three accepted iterations, each one a breaking iteration.
    const assignments = await Promise.all([1, 2, 3].map(number => readAssignment(root, runId, 'wi-001', number)));
    expect(assignments.map(assignment => assignment.kind)).toEqual(['breaking', 'breaking', 'breaking']);
    expect(assignments.map(assignment => assignment.gate.checkpoint)).toEqual(['breaking-iteration', 'breaking-iteration', 'breaking-iteration']);
    expect(assignments.map(assignment => assignment.gate.tests.policy)).toEqual(['all-project', 'all-project', 'all-project']);
    const results = await Promise.all([1, 2, 3].map(number => readResult(root, runId, 'wi-001', number)));
    expect(results.map(result => result.outcome)).toEqual(['accepted', 'accepted', 'accepted']);

    // The first stage is narrow; the two that break are the explicitly broad
    // form, each recorded with its own rationale.
    expect(assignments[0]!.scope.base).toEqual({ module: core, included: [] });
    for (const assignment of assignments.slice(1)) {
      const base = assignment.scope.base;
      expect('modules' in base).toBe(true);
      if (!('modules' in base)) return;
      expect(base.modules).toEqual([attribution, core, views, pure]);
      expect(base.rationale.length).toBeGreaterThan(0);
    }

    // Every accepted boundary: one breaking-iteration gate, passed, whose
    // configured audit ran the definition's checks once over its commit.
    const attempts = await gates(root, runId);
    const breaking = attempts.filter(attempt => attempt.checkpoint === 'breaking-iteration');
    expect(breaking).toHaveLength(3);
    for (const attempt of breaking) {
      expect(attempt.verdict).toBe('passed');
      expect(attempt.cause).toBeNull();
      expect(attempt.guardedChanges).toEqual([]);
      expect(attempt.commands).toEqual([]);
      expect(attempt.audit).toMatchObject({ status: 'completed', verdict: 'pass', requestedSourceCommit: attempt.commit });
      const checks = attempt.provider!.checks as Record<string, { passed: boolean; output: string }>;
      expect(Object.keys(checks)).toEqual(['tests', 'type-check', 'ramify-check']);
      for (const check of Object.values(checks)) expect(check.passed).toBe(true);
      // The configured tests check ran every owner's real tests.
      for (const owner of [dirA, dirC, dirP, dirV]) expect(checks['tests']!.output).toContain(`ok ${owner}/src/tests/`);
    }
    // The work item's own gate, all-project, closes it.
    expect(attempts.filter(attempt => attempt.checkpoint === 'work-item').every(attempt => attempt.verdict === 'passed')).toBe(true);

    // The final state: no consumer still uses the old representation.
    const files = await sources(root, dirA);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(file => file.text.includes('reviewedBy')).map(file => file.path)).toEqual([]);
    expect(files.some(file => file.text.includes('reviewer: Reviewer'))).toBe(true);

    // Each accepted stage is its own revision, in order, and each attempt
    // stands on the one the stage before it accepted.
    expect(breaking.map(attempt => attempt.commit)).toEqual(['revision-01', 'revision-02', 'revision-03']);
    expect(breaking.map(attempt => attempt.head)).toEqual([materialized, 'revision-01', 'revision-02']);
    expect(scripted.revisions()).toEqual([materialized, 'revision-01', 'revision-02', 'revision-03']);
    expect(scripted.branch()).toBe(`ramify-agent-run/${runId}`);
    scripted.assertComplete();
  }, 600_000);
});

describe('the breaking-iteration boundary is not green by default', () => {
  test('a break that leaves a consumer unadapted fails the whole-project gate, and only the adapted state is accepted', async () => {
    const root = await target();
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
      'local-architect': [
        submit(assign(core, {
          kind: 'breaking',
          stage: 1,
          goal: 'Make the outcome from a structured reviewer and adapt every consumer.',
          scope: broadScope(),
        }, stagedOutline())),
        submit({ kind: 'request-completion', summary: 'The reviewer is structured.', outline: stagedOutline('Done.') }),
      ],
      engineer: [
        // The interface changes and no consumer is adapted: the incoherent
        // intermediate state the gate exists to refuse.
        submit(completionProposed('Changed the outcome to take a reviewer.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV2),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV2)),
        // The repair adapts every consumer inside the same scope.
        submit(completionProposed('Adapted both surfaces and both views.'),
          write(join(root, dirA, 'src/adapters.ts'), adaptersV2),
          write(join(root, dirA, 'src/tests/adapters.test.ts'), adaptersTestV2),
          write(join(root, dirP, 'src/result.ts'), pureV2),
          write(join(root, dirP, 'src/tests/result.test.ts'), pureTestV2),
          write(join(root, dirV, 'src/panel.ts'), panelV2),
          write(join(root, dirV, 'src/tests/panel.test.ts'), panelTestV2)),
      ],
    }, {
      // The unadapted state is committed and audited as it stands; the
      // repair that follows is a revision of its own over it.
      commits: [
        scenarios,
        { ...revision('revision-01', `${dirC}/src/outcome.ts`, `${dirC}/src/tests/outcome.test.ts`), against: materialized },
        // The repair is asked about the same accepted boundary: the refused
        // attempt committed, and accepted nothing.
        { ...revision('revision-02', `${dirA}/src/adapters.ts`, `${dirP}/src/result.ts`, `${dirV}/src/panel.ts`), against: materialized },
        { commit: null, against: 'revision-02' },
        { commit: null, against: 'revision-02' },
      ],
      finalHead: 'revision-02',
      diffs: [{
        from: materialized,
        to: 'revision-02',
        changes: [{ status: 'M', path: `${dirC}/src/outcome.ts` }, { status: 'M', path: `${dirA}/src/adapters.ts` }],
      }],
    }, { configuredAudit: projectAudit(root) });

    expect(onlyRun(service, plan).state, JSON.stringify({ tail: (await runEventsOnDisk(root, plan, runId)).slice(-8), gates: (await gates(root, runId)).map(gate => ({ id: gate.id, verdict: gate.verdict, commands: gate.commands.map(command => ({ kind: command.kind, outcome: command.outcome, output: command.output.tail.slice(-1000) })) })) })).toBe('completed');
    const breaking = (await gates(root, runId)).filter(attempt => attempt.checkpoint === 'breaking-iteration');
    expect(breaking.map(attempt => attempt.verdict)).toEqual(['failed', 'passed']);
    // The configured audit ran the consumers' tests over the committed
    // unadapted tree and failed with evidence bound to it.
    const refused = breaking[0]!;
    expect(refused.cause).toBe('check-failed');
    expect(refused.next).toBe('repair');
    expect(refused.commit).not.toBeNull();
    expect(refused.audited).toBe(refused.commit);
    expect(refused.evidence).not.toBeNull();
    expect(refused.commands).toEqual([]);
    expect(refused.audit).toMatchObject({ status: 'completed', verdict: 'fail', requestedSourceCommit: refused.commit });
    expect((await gateDiagnostics(refused, 'engineer')).summary.join('\n')).toContain('not ok');
    // Only the adapted state is accepted, after one repair round.
    expect(breaking[1]!.repairRound).toBe(1);
    expect(breaking[1]!.commit).toBe('revision-02');
    expect(refused.commit).toBe('revision-01');
    expect((await readResult(root, runId, 'wi-001', 1)).outcome).toBe('accepted');
    expect((await readResult(root, runId, 'wi-001', 1)).commit).toBe('revision-02');
    scripted.assertComplete();
  }, 600_000);
});

describe('the broad scope is a planned exception', () => {
  test('a broad scope with no rationale is returned with its path, and the corrected one is accepted', async () => {
    const root = await target();
    const blank = assign(core, { kind: 'breaking', stage: 1, goal: 'Make the break.', scope: broadScope('   ') }, stagedOutline());
    // The engineer finishes nothing and the architect stops the run, so no
    // gate of this scenario's own reaches a commit boundary.
    const scripted = gateGit(root, { head: base, commits: [scenarios] });
    const { service, runId, agent } = await openRuns(root, {
      inputs: treeInputs(),
      git: scripted.git,

      script: byRole({
        'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
        'local-architect': [
          [{ kind: 'submit', input: blank }, { kind: 'submit', input: assign(core, { kind: 'breaking', stage: 1, goal: 'Make the break.', scope: broadScope() }, stagedOutline()) }],
          submit({ kind: 'unresolved', conflict: 'Stopping after the assignment this test is about.', evidence: [] }),
        ],
        engineer: [submit({ kind: 'partial', done: [], unfinished: ['everything'], findings: [] })],
        'global-fork': [submit({ kind: 'nothing-possible', reason: 'The test stops here.', evidence: [] })],
      }),
    }).then(async opened => {
      cleanups.push(() => opened.service.close());
      const receipt = await opened.service.execute(startRun(plan));
      await opened.service.settled(plan, receipt.jobId);
      return { ...opened, runId: receipt.jobId };
    });

    expect(onlyRun(service, plan).state).toBe('failed');
    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    expect(local.verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string }> };
    expect(answer.errors.map(error => error.path)).toEqual(['assignment.scope.base.rationale']);
    expect(local.verdicts[1]).toEqual({ accepted: true });
    // Nothing was written for the refused input: one outline, one assignment,
    // and that one carries the rationale.
    expect(existsSync(runPath(root, plan, runId, workLayout.outline('wi-001', 2)))).toBe(false);
    const accepted = await readAssignment(root, runId, 'wi-001', 1);
    expect(accepted.scope.base).toMatchObject({ rationale: broadRationale });
    expect(existsSync(runPath(root, plan, runId, iterationLayout.assignment('wi-001', 2)))).toBe(false);
    // A refused input and an unfinished iteration commit nothing at all;
    // the one revision is the feature files'.
    expect(scripted.revisions()).toEqual([materialized]);
    scripted.assertComplete();
  }, 600_000);
});

describe('K6: the gate is not satisfied by weakening what it checks', () => {
  test('an unauthorized edit of the test-runner configuration is guarded-change, and the same edit under a recorded revision passes', async () => {
    const root = await target();
    const narrow = { base: { module: core, included: [] }, extra: [], read: [], rationale: 'The representation is defined here.' };
    const { service, runId, agent, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
      'local-architect': [
        submit(assign(core, {
          kind: 'ordinary',
          goal: 'State the reviewer\'s role in the outcome.',
          scope: narrow,
        }, stagedOutline())),
        // The gate came back. The revision records why the configuration has
        // to change, and authorizes that one path for the next iteration.
        submit(assign(core, {
          kind: 'ordinary',
          goal: 'State the reviewer\'s role in the outcome, with the runner told where the suite is.',
          scope: narrow,
          authorizations: [{
            path: 'vitest.config.ts',
            rationale: 'The request moves the suite this module owns, and the runner has to be told where it now is.',
          }],
        }, stagedOutline('The configuration change the request needs is authorized, and named.'))),
        submit({ kind: 'request-completion', summary: 'The role is stated and the runner selects the suite.', outline: stagedOutline('Done.') }),
      ],
      engineer: [
        // Narrowing what the runner discovers, with nothing authorizing it.
        // The guarded `write` refuses a path outside the scope, so the edit
        // goes through the shell, whose writes pass no guard: that is the
        // route only the gate's comparison catches.
        submit(completionProposed('Stated the role, and narrowed what the runner looks at.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV1),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV1),
          write(join(root, 'vitest.config.ts'), NARROWED_CONFIG),
          shell(`cat > '${join(root, 'vitest.config.ts')}' <<'EOF'\n${NARROWED_CONFIG}EOF`)),
        // The second iteration changes the same guarded file again, this
        // time under the authorization the architect recorded.
        submit(completionProposed('Told the runner where the suite is.'),
          write(join(root, 'vitest.config.ts'), WIDENED_CONFIG)),
      ],
    }, {
      // Both iterations change the guarded file, so both reach a revision;
      // the work item's gate and the run's own find nothing changed.
      commits: [
        scenarios,
        revision('revision-02', `${dirC}/src/outcome.ts`, `${dirC}/src/tests/outcome.test.ts`, 'vitest.config.ts'),
        unchanged,
        unchanged,
      ],
      finalHead: 'revision-02',
      diffs: [{ from: materialized, to: 'revision-02', changes: [{ status: 'M', path: 'vitest.config.ts' }] }],
    });

    expect(onlyRun(service, plan).state, JSON.stringify({ tail: (await runEventsOnDisk(root, plan, runId)).slice(-8), gates: (await gates(root, runId)).map(gate => ({ id: gate.id, verdict: gate.verdict, commands: gate.commands.map(command => ({ kind: command.kind, outcome: command.outcome, output: command.output.tail.slice(-1000) })) })) })).toBe('completed');
    const attempts = await gates(root, runId);
    const iterationGates = attempts.filter(attempt => attempt.checkpoint === 'iteration');
    expect(iterationGates).toHaveLength(2);

    // The first: the verdict is not a pass, the cause is the guarded change,
    // and every path it found is named with what it was and what it is now.
    const refused = iterationGates[0]!;
    expect(refused.verdict).not.toBe('passed');
    expect(refused.cause).toBe('guarded-change');
    expect(refused.next).toBe('return-to-local-architect');
    expect(refused.guardedChanges).toHaveLength(1);
    expect(refused.guardedChanges[0]!.path).toBe('vitest.config.ts');
    expect(refused.guardedChanges[0]!.authorizedBy).toBeNull();
    expect(refused.guardedChanges[0]!.after).not.toBeNull();
    expect(refused.commit).toBeNull();
    expect(refused.audited).toBeNull();
    expect(refused.evidence).toBeNull();
    expect(refused.rules).toContainEqual(expect.objectContaining({ rule: 'write-scope', outcome: 'failed' }));
    // The unauthorized candidate is refused before commands or publication.
    expect(refused.commands.some(command => command.outcome === 'passed')).toBe(false);
    // The guarded write of the same path was refused outright: it lies
    // outside the scope, and only the shell's unguarded write reached it.
    const firstEngineer = agent!.sessions.filter(session => session.spec.role === 'engineer')[0]!;
    expect(firstEngineer.denied).toHaveLength(1);
    expect((await readResult(root, runId, 'wi-001', 1)).outcome).toBe('unsuitable');

    // The architect was told which path, so it could record the revision.
    const findings = (await readResult(root, runId, 'wi-001', 1)).findings;
    expect(findings.some(finding => finding.includes('vitest.config.ts'))).toBe(true);
    expect(existsSync(runPath(root, plan, runId, workLayout.outline('wi-001', 2)))).toBe(true);

    // The second: the same guarded file changed again, this time named by a
    // recorded revision, and the attempt passes.
    const authorized = iterationGates[1]!;
    expect(authorized.verdict).toBe('passed');
    expect(authorized.cause).toBeNull();
    expect(authorized.guardedChanges).toHaveLength(1);
    expect(authorized.guardedChanges[0]!.path).toBe('vitest.config.ts');
    expect(authorized.guardedChanges[0]!.authorizedBy).toMatchObject({ id: 'wi-001', revision: 2 });
    const second = await readAssignment(root, runId, 'wi-001', 2);
    expect(second.authorizations).toHaveLength(1);
    expect(second.authorizations[0]!.by).toMatchObject({ id: 'wi-001', revision: 2 });
    // The authorization admits the path to the scope, so the second change
    // was made through the guarded write and nothing was denied.
    expect(second.scope.resolved.files.some(file => file.endsWith('/vitest.config.ts'))).toBe(true);
    const secondEngineer = agent!.sessions.filter(session => session.spec.role === 'engineer')[1]!;
    expect(secondEngineer.denied).toEqual([]);
    expect((await readResult(root, runId, 'wi-001', 2)).outcome).toBe('accepted');
    // Only the recorded authorization permits a source commit.
    expect([refused.commit, authorized.commit]).toEqual([null, 'revision-02']);
    scripted.assertComplete();
  }, 600_000);

  test('a deleted guarded file is recorded as after: null and does not pass as an absent file', async () => {
    const root = await target();
    const { service, runId, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
      'local-architect': [
        submit(assign(core, {
          goal: 'State the reviewer\'s role in the outcome.',
          scope: { base: { module: core, included: [] }, extra: [], read: [], rationale: 'The representation is defined here.' },
        }, stagedOutline())),
        submit({ kind: 'unresolved', conflict: 'The iteration removed the runner\'s configuration rather than doing the work.', evidence: ['vitest.config.ts'] }),
      ],
      'global-fork': [submit({ kind: 'nothing-possible', reason: 'The test stops here.', evidence: [] })],
      engineer: [
        submit(completionProposed('Removed the configuration that was in the way.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV1),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV1),
          shell(`rm '${join(root, 'vitest.config.ts')}'`)),
      ],
    }, {
      // No committing gate accepts this dirty deletion.
      commits: [scenarios],
      uncommitted: [{ status: 'M', path: `${dirC}/src/outcome.ts` }, { status: 'D', path: 'vitest.config.ts' }],
    });

    expect(onlyRun(service, plan).state).toBe('failed');
    const refused = (await gates(root, runId)).find(attempt => attempt.checkpoint === 'iteration')!;
    expect(refused.guardedChanges).toHaveLength(1);
    expect(refused.guardedChanges[0]).toMatchObject({ path: 'vitest.config.ts', after: null, authorizedBy: null });
    expect(refused.verdict).not.toBe('passed');
    expect(refused.cause).toBe('guarded-change');
    // The file really is gone: its absence is what the attempt recorded, and
    // an absent file is a change like any other, never a pass.
    expect(existsSync(join(root, 'vitest.config.ts'))).toBe(false);
    expect(await stat(join(root, 'package.json')).then(() => true)).toBe(true);
    // Candidate authority refuses the deletion before any source commit.
    expect(refused.commit).toBeNull();
    expect(refused.audited).toBeNull();
    expect(refused.evidence).toBeNull();
    expect(refused.rules).toContainEqual(expect.objectContaining({ rule: 'write-scope', outcome: 'failed' }));
    scripted.assertComplete();
  }, 600_000);
});

describe('a break discovered during work', () => {
  test('break-discovered returns to the local architect, which restages, and the engineer widened nothing', async () => {
    const root = await target();
    const narrow = { base: { module: core, included: [] }, extra: [], read: [], rationale: 'The representation is defined here.' };
    const { service, runId, agent, scripted } = await run(root, {
      'initial-architect': [submit(analysis([entry('reviewer-identity', attribution)]))],
      'local-architect': [
        // The first plan did not see the break: one ordinary iteration.
        submit(assign(core, { goal: 'Give the outcome a structured reviewer.', scope: narrow }, {
          ...stagedOutline(),
          decomposition: { kind: 'single-iteration' as const, rationale: 'It looked like one change in one module.' },
          breakingChanges: [],
          stages: [],
        })),
        // The engineer reported the break. The outline is revised and the
        // work is restaged as a breaking iteration with the broad scope.
        submit(assign(core, {
          kind: 'breaking',
          stage: 1,
          goal: 'Make the outcome from a structured reviewer and adapt every consumer.',
          scope: broadScope(),
        }, stagedOutline('The engineer found that every consumer of the outcome reads the plain field; the work is restaged as a break.'))),
        submit({ kind: 'request-completion', summary: 'The reviewer is structured and every consumer reads it.', outline: stagedOutline('Done.') }),
      ],
      engineer: [
        submit({
          kind: 'unsuitable',
          reason: 'break-discovered',
          detail: 'Changing ReviewOutcome to carry a structured reviewer breaks the two surfaces above it and both views beneath them; every one of them reads reviewedBy.',
        }, read(join(root, dirC, 'src/outcome.ts')), read(join(root, dirA, 'src/adapters.ts'))),
        submit(completionProposed('The outcome is made from a reviewer, and every consumer carries it.'),
          write(join(root, dirC, 'src/outcome.ts'), coreV2),
          write(join(root, dirC, 'src/tests/outcome.test.ts'), coreTestV2),
          write(join(root, dirA, 'src/adapters.ts'), adaptersV2),
          write(join(root, dirA, 'src/tests/adapters.test.ts'), adaptersTestV2),
          write(join(root, dirP, 'src/result.ts'), pureV2),
          write(join(root, dirP, 'src/tests/result.test.ts'), pureTestV2),
          write(join(root, dirV, 'src/panel.ts'), panelV2),
          write(join(root, dirV, 'src/tests/panel.test.ts'), panelTestV2)),
      ],
    }, {
      // The reported break closes its iteration without a gate, so the
      // restaged one is the only boundary that reaches a revision.
      commits: [
        scenarios,
        revision('revision-01', `${dirC}/src/outcome.ts`, `${dirA}/src/adapters.ts`, `${dirP}/src/result.ts`, `${dirV}/src/panel.ts`),
        unchanged,
        unchanged,
      ],
      finalHead: 'revision-01',
    });

    expect(onlyRun(service, plan).state, JSON.stringify({ tail: (await runEventsOnDisk(root, plan, runId)).slice(-8), gates: (await gates(root, runId)).map(gate => ({ id: gate.id, verdict: gate.verdict, commands: gate.commands.map(command => ({ kind: command.kind, outcome: command.outcome, output: command.output.tail.slice(-1000) })) })) })).toBe('completed');

    // The report closed the iteration and nothing else. No gate ran for it,
    // and nothing was committed.
    const reported = await readResult(root, runId, 'wi-001', 1);
    expect(reported.outcome).toBe('unsuitable');
    expect(reported.gate).toBeNull();
    expect(reported.commit).toBeNull();
    expect(reported.findings.some(finding => finding.includes('break-discovered'))).toBe(true);

    // The engineer did not widen its own writes: its scope was the one
    // module it was given, and nothing outside it changed in its turn.
    const first = await readAssignment(root, runId, 'wi-001', 1);
    expect(first.kind).toBe('ordinary');
    expect(first.scope.base).toEqual({ module: core, included: [] });
    const reporting = agent!.sessions.filter(session => session.spec.role === 'engineer')[0]!;
    expect(reporting.results.filter(result => result.tool === 'write' || result.tool === 'edit')).toEqual([]);
    expect(reporting.results.map(result => result.tool)).toEqual(['read', 'read', 'submit_iteration_result']);
    expect(reporting.denied).toEqual([]);

    // The architect restaged: a new outline revision that records the break,
    // and a breaking iteration with the broad scope.
    expect(existsSync(runPath(root, plan, runId, workLayout.outline('wi-001', 2)))).toBe(true);
    const restaged = await readAssignment(root, runId, 'wi-001', 2);
    expect(restaged.kind).toBe('breaking');
    expect(restaged.gate.checkpoint).toBe('breaking-iteration');
    expect('modules' in restaged.scope.base).toBe(true);
    expect((await readResult(root, runId, 'wi-001', 2)).outcome).toBe('accepted');
    // The iteration that reported the break asked Git for no commit; the
    // restaged one is the only revision this run minted beside the feature
    // files'.
    expect(scripted.revisions()).toEqual([materialized, 'revision-01']);
    expect(scripted.messages[1]).toContain('wi-001.i02');
    scripted.assertComplete();
  }, 600_000);
});

const NARROWED_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/subs/**'],
  },
});
`;

const WIDENED_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/src/tests/**/*.test.ts?(x)', '**/src/suites/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
`;
