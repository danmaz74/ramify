import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { coordinatorAssessmentToolName, coordinatorActionToolName, coordinatorInvestigationToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { intakeToolName, principleToolName } from '../analysis/extraction.js';
import { copyFixture } from './helpers/fixture.js';
import { withDefaultTurns } from './helpers/declarations.js';
import { analysis } from './helpers/analysis.js';
import { submit, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { runLayout } from '../run/records.js';

import { nfrBoundaries } from './helpers/nonfunctional-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const answers: ReturnType<typeof nfrBoundaries>[] = [];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const answer of answers.splice(0)) try { answer.assertComplete(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts(), 'ordinary NFR setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'NFR fixture teardown failed');
});

test('one authorized repair edits two modules from the chosen src, then reassesses every NFR', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = nfrBoundaries(fixture.root, { repair: 'two-modules' });
  answers.push(boundaryAnswers);
  const plan = join(fixture.root, 'plans/review-notes/plan.md');
  const obligation = 'The review must retain an audit record.';
  const otherObligation = 'The catalog must expose the audit record.';
  const advice = 'Prefer a compact audit record.';
  const fixed = 'Every audit record names its author.';
  const original = await readFile(plan, 'utf8');
  await writeFile(plan, `${original}\n${obligation}\n${otherObligation}\n${advice}\n`);
  await writeFile(join(fixture.root, 'audit.principles.md'), `# Audit\n\n${fixed}\n`);
  const firstModule = 'collection-review/workspace/reviews/core';
  const firstSrc = join(fixture.root, 'subs/workspace/subs/reviews/subs/core/src');
  const otherFile = join(fixture.root, 'subs/workspace/subs/catalog/src/nonfunctional-repair.ts');
  let assessments = 0;
  let actions = 0;
  const agent = createScriptedAgent(withDefaultTurns(spec => {
    if (spec.submission.name === intakeToolName) return submit({ goal: 'Keep an audit record of reviews.', elements: [
      { key: 'audit', kind: 'non-functional', document: 'doc-001', text: obligation, conditions: [], uncertainty: '' },
      { key: 'catalog-audit', kind: 'non-functional', document: 'doc-001', text: otherObligation, conditions: [], uncertainty: '' },
      { key: 'compact', kind: 'recommendation', document: 'doc-001', text: advice, conditions: [], uncertainty: '' },
    ], incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } });
    if (spec.submission.name === principleToolName) return submit({ elements: [
      { key: 'author', kind: 'fixed', document: 'doc-002', text: fixed, conditions: [{ text: 'for every audit record', source: 'stated' }], uncertainty: '' },
    ] });
    if (spec.role === 'initial-architect') return submit(analysis([]));
    if (spec.submission.name === coordinatorAssessmentToolName) {
      assessments += 1;
      return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001',
        result: assessments === 1 ? 'undetermined' : 'satisfied',
        inspectedScope: ['subs/workspace/subs/reviews/subs/core/src', 'subs/workspace/subs/catalog/src'],
        evidence: [assessments === 1 ? 'Intermediate trace unavailable' : 'Audit record source present'],
        uncertainty: assessments === 1 ? 'Need an intermediate trace' : '' },
      { nfr: 'nfr-002', result: assessments === 1 ? 'not-satisfied' : 'satisfied',
        inspectedScope: ['subs/workspace/subs/catalog/src'], evidence: ['Catalog source inspected'], uncertainty: '' },
      { nfr: 'fix-001', result: 'satisfied', inspectedScope: ['subs/workspace/subs/reviews/subs/core/src'],
        evidence: ['Author is recorded'], uncertainty: '' }] });
    }
    if (spec.submission.name === coordinatorActionToolName) return ++actions === 1
      ? submit({ kind: 'investigate', nfrs: ['nfr-001'], question: 'Inspect the intermediate audit trace', scope: ['src/'] })
      : submit({ kind: 'repair', nfrs: ['nfr-001'], startingModule: firstModule,
        task: 'Add a cross-module audit record implementation', evidence: ['Intermediate trace inspected'], uncertainty: '' });
    if (spec.submission.name === coordinatorInvestigationToolName) return submit({ kind: 'investigation-result',
      summary: 'Intermediate trace is absent', findings: [{ nfr: 'nfr-001', inspectedScope: ['src/'],
        evidence: ['No trace writer found'], uncertainty: 'The trace was not observed' }] });
    if (spec.submission.name === nonfunctionalRepairToolName) { boundaryAnswers.repair(); return submit({ kind: 'completed', summary: 'Added audit record source',
      evidence: ['Two source files written'], remaining: [] },
      write('nonfunctional-repair.ts', 'export const auditRecord = true;\n'),
      write(otherFile, 'export const catalogAuditRecord = true;\n'),
      write(plan, 'forbidden plan change\n')); }
    return [];
  }));
  const { service } = await openRuns(fixture.root, { ...boundaryAnswers.options, agent });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const run = onlyRun(service, 'review-notes');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(run.failure).toBeNull();
  expect(run.state).toBe('completed');
  const coordinator = agent.sessions.filter(session => session.spec.submission.name === coordinatorAssessmentToolName);
  expect(coordinator).toHaveLength(2);
  for (const session of coordinator) {
    expect(session.spec.prompt).toMatch(/^Elements: nfr-001, nfr-002, fix-001$/mu);
    for (const text of [obligation, otherObligation, fixed]) expect(session.spec.prompt).toContain(`> ${text}`);
    expect(session.spec.prompt).toContain('### fix-001: fixed requirement from audit.principles.md');
    expect(session.spec.prompt).toContain('- stated: for every audit record');
    expect(session.spec.prompt).not.toContain('rec-001');
    expect(session.spec.prompt).not.toContain(advice);
  }
  const investigator = agent.sessions.find(session => session.spec.submission.name === coordinatorInvestigationToolName)!;
  expect(investigator.spec.prompt).toMatch(/^Elements: nfr-001$/mu);
  expect(investigator.spec.prompt).toContain(`### nfr-001: non-functional requirement of the plan from plans/review-notes/plan.md\n\n> ${obligation}`);
  expect(investigator.spec.prompt).not.toContain(otherObligation);
  expect(investigator.spec.prompt).not.toContain(fixed);
  expect(events.find(event => event.type === 'analysis-accepted')?.data).toMatchObject({
    catalog: { context: 0, functional: 0, nonFunctional: 2, fixed: 1, recommendation: 1 } });
  const assessmentsOnDisk = events.filter(event => event.type === 'nonfunctional-assessed');
  expect(assessmentsOnDisk).toHaveLength(2);
  expect(events.filter(event => event.type === 'nonfunctional-investigated')).toMatchObject([{ data: { nfrs: ['nfr-001'] } }]);
  expect(events.filter(event => event.type === 'nonfunctional-repair-assigned')).toHaveLength(1);
  expect(events.find(event => event.type === 'nonfunctional-investigated')!.sequence).toBeLessThan(
    events.find(event => event.type === 'nonfunctional-repair-assigned')!.sequence);
  const investigation = events.find(event => event.type === 'nonfunctional-investigated')!;
  const actionSessions = agent.sessions.filter(session => session.spec.submission.name === coordinatorActionToolName);
  expect(actionSessions).toHaveLength(2);
  expect(actionSessions[1]!.spec.prompt).toContain(runPath(fixture.root, 'review-notes', receipt.jobId,
    runLayout.submission(investigation.data.invocation)));
  expect(actionSessions[1]!.spec.prompt).toContain('Intermediate trace unavailable');
  expect(events.filter(event => event.type === 'nonfunctional-repair-committed')).toHaveLength(1);
  expect(events.filter(event => event.type === 'nonfunctional-round-closed')).toMatchObject([{ data: { outcome: 'satisfied' } }]);
  const repair = agent.sessions.find(session => session.spec.role === 'nonfunctional-repair-engineer');
  expect(repair?.spec.scope.workingDirectory).toBe(firstSrc);
  expect(repair?.spec.prompt).toMatch(/^Elements: nfr-001$/mu);
  expect(repair?.spec.prompt).toContain(`> ${obligation}`);
  for (const text of [otherObligation, fixed, advice]) expect(repair?.spec.prompt).not.toContain(text);
  expect(repair?.denied.length).toBe(1);
  expect(await readFile(plan, 'utf8')).toBe(`${original}\n${obligation}\n${otherObligation}\n${advice}\n`);
  expect(await readFile(join(firstSrc, 'nonfunctional-repair.ts'), 'utf8')).toContain('auditRecord');
  expect(await readFile(otherFile, 'utf8')).toContain('catalogAuditRecord');
  const candidates = events.filter(event => event.type === 'candidate-prepared');
  expect(candidates).toHaveLength(2);
  expect(candidates[0]!.data.tree).not.toBe(candidates[1]!.data.tree);
  expect(events.find(event => event.type === 'candidate-bound-to-gate')?.data.tree).toBe(candidates[1]!.data.tree);
  const repaired = events.find(event => event.type === 'nonfunctional-repair-committed')!;
  const finalAssessmentEvent = assessmentsOnDisk[1]!;
  const closed = events.find(event => event.type === 'nonfunctional-round-closed')!;
  const finalGate = events.find(event => event.type === 'gate-attempted' && event.data.checkpoint === 'final')!;
  if (finalGate.type !== 'gate-attempted') throw new Error('Missing final gate');
  const completed = events.find(event => event.type === 'job-completed')!;
  expect(repaired.sequence).toBeLessThan(finalAssessmentEvent.sequence);
  expect(finalAssessmentEvent.sequence).toBeLessThan(closed.sequence);
  expect(closed.sequence).toBeLessThan(finalGate.sequence);
  expect(finalGate.sequence).toBeLessThan(completed.sequence);
  const gateRecord = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId,
    runLayout.gate(finalGate.data.gate)), 'utf8')) as { checkpoint: string; commands: unknown[]; audit?: { mode: string } };
  expect(gateRecord.checkpoint).toBe('final');
  // The final gate asks the committed audit for a full audit; the harness
  // plans no test or scenario command of its own.
  expect(gateRecord.audit).toMatchObject({ mode: 'full' });
  expect(gateRecord.commands).toEqual([]);
  const finalAssessment = await readFile(runPath(fixture.root, 'review-notes', receipt.jobId,
    runLayout.assessment('nfa-002')), 'utf8').then(JSON.parse);
  expect(finalAssessment.results.map((item: { nfr: string; result: string }) => [item.nfr, item.result])).toEqual([
    ['nfr-001', 'satisfied'], ['nfr-002', 'satisfied'], ['fix-001', 'satisfied'],
  ]);
}, 60_000);
