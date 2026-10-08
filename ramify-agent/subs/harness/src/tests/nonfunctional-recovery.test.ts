import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { copyFixture } from './helpers/fixture.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { coordinatorAssessmentToolName, coordinatorActionToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { intakeToolName } from '../analysis/extraction.js';
import { withDefaultTurns } from './helpers/declarations.js';
import { analysis } from './helpers/analysis.js';
import { submit, treeInputs, write } from './helpers/iterations.js';
import { auditDefinition, commandCheck, privateConfiguredAudit } from './helpers/configured-repository.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { RunQueries } from '../projections/queries.js';
import { emptyAnalysis, freeze, initRepository, installTestRunner, onlyRun, openRuns,
  runEventsOnDisk, staleCrashLock, startRun, until } from './helpers/runs.js';
import type { RunWrite } from '../run/service.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

for (const boundary of ['nonfunctional-phase-started', 'candidate-prepared', 'nonfunctional-assessed'] as const satisfies readonly RunWrite[]) {
  test(`a phase run resumes after ${boundary} without repeating committed evidence`, async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    await initRepository(fixture.root);
    let frozen = false;
    const first = await openRuns(fixture.root, { git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => { if (write === boundary) { frozen = true; await freeze(); } },
    });
    // A frozen service is abandoned, as a dead process is. Its lock record
    // becomes stale, and the next service owns the same run under a new lock.
    const receipt = await first.service.execute(startRun('review-notes'));
    await until(() => frozen, 30_000);
    await staleCrashLock(fixture.root);
    const reopened = await openRuns(fixture.root, { git: gitService, script: [] });
    cleanups.push(() => reopened.service.close());
    expect(reopened.recovery.effects.some(effect => effect.includes('resumed the non-functional phase'))).toBe(true);
    await reopened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(reopened.service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.filter(event => event.type === 'nonfunctional-phase-started')).toHaveLength(1);
    expect(events.filter(event => event.type === 'candidate-prepared')).toHaveLength(1);
    expect(events.filter(event => event.type === 'nonfunctional-assessed')).toHaveLength(1);
    expect(events.filter(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final')).toHaveLength(1);
    expect(events.filter(event => event.type === 'job-completed')).toHaveLength(1);
  }, 60_000);
}

for (const boundary of ['gate-attempted', 'gate-committing', 'gate-committed'] as const satisfies readonly RunWrite[]) {
  test(`a final gate resumes after ${boundary} without a duplicate audit attempt`, async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    await initRepository(fixture.root);
    let frozen = false;
    const first = await openRuns(fixture.root, { git: gitService,
      script: [{ kind: 'submit', input: emptyAnalysis() }],
      afterWrite: async write => { if (write === boundary) { frozen = true; await freeze(); } },
    });
    const receipt = await first.service.execute(startRun('review-notes'));
    await until(() => frozen, 30_000);
    await staleCrashLock(fixture.root);
    const reopened = await openRuns(fixture.root, { git: gitService, script: [] });
    cleanups.push(() => reopened.service.close());
    await reopened.service.settled('review-notes', receipt.jobId);
    expect(onlyRun(reopened.service, 'review-notes').state).toBe('completed');
    const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    expect(events.filter(event => event.type === 'gate-committing' && event.data.checkpoint === 'final')).toHaveLength(1);
    expect(events.filter(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final')).toHaveLength(1);
    expect(events.filter(event => event.type === 'candidate-bound-to-gate')).toHaveLength(1);
    expect(events.filter(event => event.type === 'job-completed')).toHaveLength(1);
  }, 60_000);
}

/** An intake that reads the obligation as the plan's one non-functional requirement. */
function intake(obligation: string) {
  return { goal: 'Keep an audit record of reviews.', elements: [
    { key: 'audit', kind: 'non-functional', document: 'doc-001', text: obligation, conditions: [], uncertainty: '' },
  ], incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } };
}

function repairAgent(root: string, obligation: string) {
  return createScriptedAgent(withDefaultTurns(spec => {
    if (spec.submission.name === intakeToolName) return submit(intake(obligation));
    if (spec.role === 'initial-architect') return submit(analysis([]));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [{
      nfr: 'nfr-001', result: spec.prompt.includes('(after-repair)') ? 'satisfied' : 'not-satisfied',
      inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'], evidence: ['Current source inspected'], uncertainty: '',
    }] });
    if (spec.submission.name === coordinatorActionToolName) return submit({ kind: 'repair', nfrs: ['nfr-001'],
      startingModule: 'collection-review/workspace/reviews/core', task: 'Add audit record source', evidence: [], uncertainty: '' });
    if (spec.submission.name === nonfunctionalRepairToolName) return submit({ kind: 'completed',
      summary: 'Audit record added', evidence: ['new source'], remaining: [],
    }, write(join(root, 'subs/workspace/subs/reviews/subs/core/src/repair-recovery.ts'), 'export const auditRecord = true;\n'));
    return [];
  }));
}

const repairCrashes = [
  { boundary: 'nonfunctional-repair-assigned' },
  { boundary: 'nonfunctional-repair-assigned', mutateBeforeResume: true },
  { boundary: 'invocation-ended' },
  { boundary: 'nonfunctional-repair-committed' },
  { boundary: 'nonfunctional-assessed' },
  { boundary: 'writer-acquired' },
] as const satisfies readonly { readonly boundary: RunWrite; readonly mutateBeforeResume?: boolean }[];
for (const { boundary, ...variant } of repairCrashes) {
  const mutateBeforeResume = 'mutateBeforeResume' in variant && variant.mutateBeforeResume;
  test(`a repair phase ${boundary} crash ${boundary === 'writer-acquired' ? 'fails closed' : mutateBeforeResume ? 'refuses downtime drift' : 'resumes exactly once'}`, async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const obligation = 'The review must retain an audit record.';
    const plan = join(fixture.root, 'plans/review-notes/plan.md');
    await writeFile(plan, `${await readFile(plan, 'utf8')}\n${obligation}\n`);
    await initRepository(fixture.root);
    const firstAgent = repairAgent(fixture.root, obligation);
    let frozen = false;
    let runId = '';
    const first = await openRuns(fixture.root, { git: gitService, agent: firstAgent, inputs: treeInputs(),
      afterWrite: async (write, id) => {
        if (write !== boundary) return;
        const repairStarted = firstAgent.sessions.some(session => session.spec.role === 'nonfunctional-repair-engineer');
        const assessed = write === 'nonfunctional-assessed' &&
          (await runEventsOnDisk(fixture.root, 'review-notes', id)).filter(event => event.type === 'nonfunctional-assessed').length === 2;
        if (boundary === 'invocation-ended' && !repairStarted) return;
        if (boundary === 'nonfunctional-assessed' && !assessed) return;
        frozen = true;
        await freeze();
      },
    });
    const receipt = await first.service.execute(startRun('review-notes'));
    runId = receipt.jobId;
    await until(() => frozen, 30_000);
    await staleCrashLock(fixture.root);
    if (mutateBeforeResume) await writeFile(join(fixture.root, 'downtime-mutation.ts'), 'export const changed = true;\n');
    const resumedAgent = repairAgent(fixture.root, obligation);
    const reopened = await openRuns(fixture.root, { git: gitService, agent: resumedAgent, inputs: treeInputs() });
    cleanups.push(() => reopened.service.close());
    await reopened.service.settled('review-notes', runId);
    const events = await runEventsOnDisk(fixture.root, 'review-notes', runId);
    if (boundary === 'writer-acquired' || mutateBeforeResume) {
      expect(onlyRun(reopened.service, 'review-notes').state).toBe('failed');
      expect(onlyRun(reopened.service, 'review-notes').failure?.reason).toBe(mutateBeforeResume ? 'inputs-changed' : 'recovery-exhausted');
      expect(resumedAgent.sessions.filter(session => session.spec.role === 'nonfunctional-repair-engineer')).toHaveLength(0);
    } else {
      expect(onlyRun(reopened.service, 'review-notes').state).toBe('completed');
      expect(events.filter(event => event.type === 'nonfunctional-repair-assigned')).toHaveLength(1);
      expect(events.filter(event => event.type === 'nonfunctional-repair-committed')).toHaveLength(1);
      expect(events.filter(event => event.type === 'nonfunctional-assessed')).toHaveLength(2);
      expect(events.filter(event => event.type === 'nonfunctional-round-closed')).toHaveLength(1);
      expect(firstAgent.sessions.filter(session => session.spec.role === 'nonfunctional-repair-engineer').length
        + resumedAgent.sessions.filter(session => session.spec.role === 'nonfunctional-repair-engineer').length).toBe(1);
    }
  }, 60_000);
}

function exhaustedAgent(obligation: string) {
  return createScriptedAgent(withDefaultTurns(spec => {
    if (spec.submission.name === intakeToolName) return submit(intake(obligation));
    if (spec.role === 'initial-architect') return submit(analysis([]));
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [{
      nfr: 'nfr-001', result: 'not-satisfied', inspectedScope: ['src/'], evidence: ['Audit record absent'], uncertainty: '',
    }] });
    if (spec.submission.name === coordinatorActionToolName) return submit({ kind: 'close', deviations: [{
      nfr: 'nfr-001', proposedAlternative: null, uncertainty: 'No supported alternative is known',
    }] });
    return [];
  }));
}

test('round three exhausts and a late source change still refuses the final gate', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const obligation = 'The review must retain an audit record.';
  const plan = join(fixture.root, 'plans/review-notes/plan.md');
  await writeFile(plan, `${await readFile(plan, 'utf8')}\n${obligation}\n`);
  await writeFile(join(fixture.root, 'ramify-audit.json'), auditDefinition([
    commandCheck('passes', [{ name: 'passes', cmd: process.execPath, args: ['-e', 'process.exit(0)'] }]),
  ]));
  await initRepository(fixture.root);
  const configured = await privateConfiguredAudit(createAuditWorkspaceOwnership(fixture.root));
  cleanups.push(configured.remove);
  let fullRequests = 0;
  const { service } = await openRuns(fixture.root, { git: gitService, agent: exhaustedAgent(obligation), inputs: treeInputs(),
    configuredAudit: { read: configured.audit.read, async run(input) {
      const result = await configured.audit.run(input);
      // Readiness makes the first full request; the final gate the next.
      if (input.mode === 'full' && ++fullRequests === 2) {
        await writeFile(join(fixture.root, 'late-after-round-three.ts'), 'export const stale = true;\n');
      }
      return result;
    } },
  });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(events.filter(event => event.type === 'nonfunctional-assessed')).toHaveLength(3);
  expect(events.filter(event => event.type === 'nonfunctional-round-closed').map(event => event.data.outcome)).toEqual(['continue', 'continue', 'exhausted']);
  expect(onlyRun(service, 'review-notes').failure?.reason).toBe('inputs-changed');
  expect(events.filter(event => event.type === 'job-completed')).toHaveLength(0);
}, 60_000);

test('an exhausted crash with changed source leaves merge readiness unavailable', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const obligation = 'The review must retain an audit record.';
  const plan = join(fixture.root, 'plans/review-notes/plan.md');
  await writeFile(plan, `${await readFile(plan, 'utf8')}\n${obligation}\n`);
  await initRepository(fixture.root);
  let frozen = false;
  const first = await openRuns(fixture.root, { git: gitService, agent: exhaustedAgent(obligation), inputs: treeInputs(),
    afterWrite: async (write, id) => {
      if (write !== 'gate-committing') return;
      const closed = (await runEventsOnDisk(fixture.root, 'review-notes', id))
        .filter(event => event.type === 'nonfunctional-round-closed');
      if (closed.length === 3) { frozen = true; await freeze(); }
    },
  });
  const receipt = await first.service.execute(startRun('review-notes'));
  await until(() => frozen, 30_000);
  await staleCrashLock(fixture.root);
  await writeFile(join(fixture.root, 'changed-after-exhaustion.ts'), 'export const changed = true;\n');
  const reopened = await openRuns(fixture.root, { git: gitService, agent: exhaustedAgent(obligation), inputs: treeInputs() });
  cleanups.push(() => reopened.service.close());
  await reopened.service.settled('review-notes', receipt.jobId);
  expect(onlyRun(reopened.service, 'review-notes').failure?.reason).toBe('recovery-exhausted');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(events.filter(event => event.type === 'nonfunctional-round-closed').map(event => event.data.outcome))
    .toEqual(['continue', 'continue', 'exhausted']);
  expect(events.filter(event => event.type === 'job-completed')).toHaveLength(0);
  const version = reopened.service.getRun('review-notes', receipt.jobId)!.version;
  expect((await new RunQueries(reopened.service).mergeReadiness('review-notes', receipt.jobId, version)).readiness.status)
    .toBe('unavailable');
}, 60_000);
