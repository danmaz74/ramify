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

export const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

export const plan = 'reviewer-identity';

/** The four owners the break runs through, and where each one lives. */
export const attribution = 'collection-review/workspace/reviews/attribution';
export const core = `${attribution}/core`;
export const views = `${attribution}/views`;
export const pure = `${views}/pure`;

export const dirA = 'subs/workspace/subs/reviews/subs/attribution';
export const dirC = `${dirA}/subs/core`;
export const dirV = `${dirA}/subs/views`;
export const dirP = `${dirV}/subs/pure`;

// The state the run starts from: a review outcome that names its reviewer
// with one plain string, carried through both surfaces and both views.

export const coreV0 = `export interface ReviewOutcome {
  recordId: string;
  status: string;
  reviewedBy: string;
}

export function reviewRecord(recordId: string, reviewedBy: string): ReviewOutcome {
  return { recordId, status: 'passed', reviewedBy };
}
`;

export const coreTestV0 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review names the record and who reviewed it', () => {
  expect(reviewRecord('rec-1', 'Ada Lovelace').reviewedBy).toBe('Ada Lovelace');
});
`;

export const adaptersV0 = `import { reviewRecord } from '../subs/core/src/outcome.ts';

export function runQuery(recordId: string, reviewedBy: string) {
  const outcome = reviewRecord(recordId, reviewedBy);
  return { recordId: outcome.recordId, status: outcome.status, reviewer: outcome.reviewedBy };
}

export function runTool(recordId: string, reviewedBy: string): string {
  return JSON.stringify(runQuery(recordId, reviewedBy));
}
`;

export const adaptersTestV0 = `import { test, expect } from 'vitest';
import { runQuery, runTool } from '../adapters.ts';

test('both surfaces carry the reviewer', () => {
  expect(runQuery('rec-1', 'Ada Lovelace').reviewer).toBe('Ada Lovelace');
  expect(JSON.parse(runTool('rec-1', 'Ada Lovelace')).reviewer).toBe('Ada Lovelace');
});
`;

export const panelV0 = `import { runQuery } from '../../../src/adapters.ts';
import { showResult } from '../subs/pure/src/result.ts';

export function loadReview(recordId: string, reviewedBy: string): string {
  const answer = runQuery(recordId, reviewedBy);
  return showResult({ recordId: answer.recordId, status: answer.status, reviewer: answer.reviewer });
}
`;

export const panelTestV0 = `import { test, expect } from 'vitest';
import { loadReview } from '../panel.ts';

test('the panel renders what the surface answered', () => {
  expect(loadReview('rec-1', 'Ada Lovelace')).toBe('rec-1: passed, reviewed by Ada Lovelace');
});
`;

export const pureV0 = `export interface ReviewResultProps {
  recordId: string;
  status: string;
  reviewer: string;
}

export function showResult(props: ReviewResultProps): string {
  return props.recordId + ': ' + props.status + ', reviewed by ' + props.reviewer;
}
`;

export const pureTestV0 = `import { test, expect } from 'vitest';
import { showResult } from '../result.ts';

test('the pure view states the verdict and the reviewer', () => {
  expect(showResult({ recordId: 'rec-1', status: 'passed', reviewer: 'Ada Lovelace' })).toBe('rec-1: passed, reviewed by Ada Lovelace');
});
`;

// Stage 1: the new representation arrives beside the old one, and nothing
// outside this module has to change for it.

export const coreV1 = `export interface Reviewer {
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

export const coreTestV1 = `import { test, expect } from 'vitest';
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

export const coreV2 = `export interface Reviewer {
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

export const coreTestV2 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review is made from a structured reviewer', () => {
  const outcome = reviewRecord('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' });
  expect(outcome.reviewer.displayName).toBe('Ada Lovelace');
  expect(outcome.reviewer.role).toBe('lead');
});
`;

export const adaptersV2 = `import { reviewRecord } from '../subs/core/src/outcome.ts';
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

export const adaptersTestV2 = `import { test, expect } from 'vitest';
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

export const panelV2 = `import { runQuery } from '../../../src/adapters.ts';
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

export const panelTestV2 = `import { test, expect } from 'vitest';
import { loadReview } from '../panel.ts';

test('the panel renders the reviewer\\'s name and role', () => {
  expect(loadReview('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' }))
    .toBe('rec-1: passed, reviewed by Ada Lovelace (lead)');
});
`;

export const pureV2 = `export interface ReviewResultProps {
  recordId: string;
  status: string;
  reviewerName: string;
  reviewerRole: string;
}

export function showResult(props: ReviewResultProps): string {
  return props.recordId + ': ' + props.status + ', reviewed by ' + props.reviewerName + ' (' + props.reviewerRole + ')';
}
`;

export const pureTestV2 = `import { test, expect } from 'vitest';
import { showResult } from '../result.ts';

test('the pure view states the verdict, the reviewer and the role', () => {
  expect(showResult({ recordId: 'rec-1', status: 'passed', reviewerName: 'Ada Lovelace', reviewerRole: 'lead' }))
    .toBe('rec-1: passed, reviewed by Ada Lovelace (lead)');
});
`;

// Stage 3: the removal. Nothing carries the plain field any more.

export const coreV3 = `export interface Reviewer {
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

export const coreTestV3 = `import { test, expect } from 'vitest';
import { reviewRecord } from '../outcome.ts';

test('a review carries the structured reviewer and nothing else of the reviewer', () => {
  const outcome = reviewRecord('rec-1', { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' });
  expect(outcome.reviewer.displayName).toBe('Ada Lovelace');
  expect(Object.keys(outcome).join(',')).toBe('recordId,status,reviewer');
});
`;

export const adaptersV3 = `import { reviewRecord } from '../subs/core/src/outcome.ts';
import type { Reviewer } from '../subs/core/src/outcome.ts';

export function runQuery(recordId: string, reviewer: Reviewer) {
  const outcome = reviewRecord(recordId, reviewer);
  return { recordId: outcome.recordId, status: outcome.status, reviewer: outcome.reviewer };
}

export function runTool(recordId: string, reviewer: Reviewer): string {
  return JSON.stringify(runQuery(recordId, reviewer));
}
`;

export const adaptersTestV3 = `import { test, expect } from 'vitest';
import { runQuery, runTool } from '../adapters.ts';

const ada = { id: 'ada', displayName: 'Ada Lovelace', role: 'lead' };

test('both surfaces carry the structured reviewer and only that', () => {
  expect(runQuery('rec-1', ada).reviewer.role).toBe('lead');
  expect(Object.keys(runQuery('rec-1', ada)).join(',')).toBe('recordId,status,reviewer');
  expect(JSON.parse(runTool('rec-1', ada)).reviewer.displayName).toBe('Ada Lovelace');
});
`;

/** The fixture copy the break runs in, with the four owners it runs through. */
export async function target(): Promise<string> {
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
export const base = 'revision-00';

/**
 * The harness's own commit of the run's one feature file, made once
 * readiness has passed; every later boundary is asked against it.
 */
export const materialized = 'scenarios-00';
export const scenarios = scenariosCommit(plan, materialized, base, [`${dirA}/src/tests/features/${plan}/reviewer-identity.feature`]);

/** A boundary Git reports as unchanged, which commits nothing. */
export const unchanged: GateCommit = { commit: null };

/** A boundary Git reports as the named modified files, answering the revision it made. */
export const revision = (commit: string, ...paths: string[]): GateCommit => ({
  commit,
  changes: paths.map(path => ({ status: 'M', path })),
});

export async function run(
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
export function projectAudit(root: string) {
  return localCommandAudit({ tests: [join(root, 'node_modules/.bin/vitest'), 'run',
    `${dirA}/src/tests/adapters.test.ts`, `${dirC}/src/tests/outcome.test.ts`,
    `${dirP}/src/tests/result.test.ts`, `${dirV}/src/tests/panel.test.ts`] });
}

export async function readGate(root: string, runId: string, id: string): Promise<GateAttempt> {
  return JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt;
}

/** Every gate attempt the run committed, in the order it made them. */
export async function gates(root: string, runId: string): Promise<GateAttempt[]> {
  const events = await runEventsOnDisk(root, plan, runId);
  const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
  return Promise.all(ids.map(id => readGate(root, runId, id)));
}

export async function readAssignment(root: string, runId: string, workItem: string, number: number): Promise<IterationAssignment> {
  return JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.assignment(workItem, number)), 'utf8')) as IterationAssignment;
}

export async function readResult(root: string, runId: string, workItem: string, number: number): Promise<IterationResult> {
  return JSON.parse(await readFile(runPath(root, plan, runId, iterationLayout.result(workItem, number)), 'utf8')) as IterationResult;
}

/** Every file beneath one directory of the project, read as text. */
export async function sources(root: string, directory: string): Promise<Array<{ path: string; text: string }>> {
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
export function stagedOutline(revisionReason = '') {
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

export const broadRationale = 'The outcome and its consumers cannot compile apart once the representation changes, so the interface change and the consumer adaptations belong to one iteration.';

export function broadScope(rationale = broadRationale) {
  return {
    base: { modules: [attribution, core, views, pure], rationale },
    extra: [],
    read: [],
    rationale: 'The break runs through these four owners and nothing else.',
  };
}

export const NARROWED_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/subs/**'],
  },
});
`;

export const WIDENED_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/src/tests/**/*.test.ts?(x)', '**/src/suites/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
`;
