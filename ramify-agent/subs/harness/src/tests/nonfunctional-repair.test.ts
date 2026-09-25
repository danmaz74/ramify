import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { coordinatorAssessmentToolName, coordinatorActionToolName, coordinatorInvestigationToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { copyFixture } from './helpers/fixture.js';
import { withPlan13Fixture } from './helpers/declarations.js';
import { analysis } from './helpers/analysis.js';
import { submit, treeInputs, write } from './helpers/iterations.js';
import { initRepository, installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { runLayout } from '../run/records.js';
import { checkpointPolicies } from '../checks/checkpoint.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('one authorized repair edits two modules from the chosen src, then reassesses every NFR', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const plan = join(fixture.root, 'plans/review-notes/plan.md');
  const obligation = 'The review must retain an audit record.';
  const otherObligation = 'The catalog must expose the audit record.';
  const original = await readFile(plan, 'utf8');
  await writeFile(plan, `${original}\n${obligation}\n${otherObligation}\n`);
  await initRepository(fixture.root);
  const firstModule = 'collection-review/workspace/reviews/core';
  const firstSrc = join(fixture.root, 'subs/workspace/subs/reviews/subs/core/src');
  const otherFile = join(fixture.root, 'subs/workspace/subs/catalog/src/nonfunctional-repair.ts');
  let assessments = 0;
  let actions = 0;
  const agent = createScriptedAgent(withPlan13Fixture(spec => {
    if (spec.role === 'initial-architect') {
      const captured = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
      if (!captured) throw new Error('Captured plan was not supplied');
      const directory = dirname(dirname(captured));
      const root = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8'))).documents[0]!;
      const bytes = readFileSync(join(directory, root.storedAt));
      const passage = (quote: string) => {
        const start = bytes.indexOf(Buffer.from(quote));
        if (start < 0) throw new Error('NFR passage was not captured');
        return { document: root.id, sha256: root.sha256, start, end: start + Buffer.byteLength(quote), quote };
      };
      return submit({ ...analysis([]), catalog: [
        { classification: 'non-functional-requirement', passage: passage(obligation), conditions: [], uncertainty: '' },
        { classification: 'non-functional-requirement', passage: passage(otherObligation), conditions: [], uncertainty: '' },
      ] });
    }
    if (spec.submission.name === coordinatorAssessmentToolName) {
      assessments += 1;
      return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001',
        result: assessments === 1 ? 'undetermined' : 'satisfied',
        inspectedScope: ['subs/workspace/subs/reviews/subs/core/src', 'subs/workspace/subs/catalog/src'],
        evidence: [assessments === 1 ? 'Intermediate trace unavailable' : 'Audit record source present'],
        uncertainty: assessments === 1 ? 'Need an intermediate trace' : '' },
      { nfr: 'nfr-002', result: assessments === 1 ? 'not-satisfied' : 'satisfied',
        inspectedScope: ['subs/workspace/subs/catalog/src'], evidence: ['Catalog source inspected'], uncertainty: '' }] });
    }
    if (spec.submission.name === coordinatorActionToolName) return ++actions === 1
      ? submit({ kind: 'investigate', nfrs: ['nfr-001'], question: 'Inspect the intermediate audit trace', scope: ['src/'] })
      : submit({ kind: 'repair', nfrs: ['nfr-001'], startingModule: firstModule,
        task: 'Add a cross-module audit record implementation', evidence: ['Intermediate trace inspected'], uncertainty: '' });
    if (spec.submission.name === coordinatorInvestigationToolName) return submit({ kind: 'investigation-result',
      summary: 'Intermediate trace is absent', findings: [{ nfr: 'nfr-001', inspectedScope: ['src/'],
        evidence: ['No trace writer found'], uncertainty: 'The trace was not observed' }] });
    if (spec.submission.name === nonfunctionalRepairToolName) return submit({ kind: 'completed', summary: 'Added audit record source',
      evidence: ['Two source files written'], remaining: [] },
      write('nonfunctional-repair.ts', 'export const auditRecord = true;\n'),
      write(otherFile, 'export const catalogAuditRecord = true;\n'),
      write(plan, 'forbidden plan change\n'));
    return [];
  }));
  const { service } = await openRuns(fixture.root, { git: gitService, agent, inputs: treeInputs() });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const run = onlyRun(service, 'review-notes');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(run.failure).toBeNull();
  expect(run.state).toBe('completed');
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
  expect(repair?.denied.length).toBe(1);
  expect(await readFile(plan, 'utf8')).toBe(`${original}\n${obligation}\n${otherObligation}\n`);
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
    runLayout.gate(finalGate.data.gate)), 'utf8')) as { checkpoint: string; commands: Array<{
    kind: string; selection?: { policy: string }; scenarios?: { mode: string; selection: { kind: string } };
  }> };
  expect(gateRecord.checkpoint).toBe('final');
  expect(checkpointPolicies[gateRecord.checkpoint as 'final'].selection).toBe('all-project');
  expect(gateRecord.commands.find(command => command.kind === 'tests')).toBeDefined();
  const scenarioCheck = gateRecord.commands.find(command => command.kind === 'scenarios');
  if (scenarioCheck) expect(scenarioCheck.scenarios).toMatchObject({ mode: 'full', selection: { kind: 'all' } });
  const finalAssessment = await readFile(runPath(fixture.root, 'review-notes', receipt.jobId,
    runLayout.assessment('nfa-002')), 'utf8').then(JSON.parse);
  expect(finalAssessment.results.map((item: { nfr: string; result: string }) => [item.nfr, item.result])).toEqual([
    ['nfr-001', 'satisfied'], ['nfr-002', 'satisfied'],
  ]);
}, 60_000);
