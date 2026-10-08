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

import { cleanups, plan, attribution, core, views, pure, dirA, dirC, dirV, dirP, base, materialized, scenarios, unchanged, revision, broadRationale, NARROWED_CONFIG, WIDENED_CONFIG, target, run, projectAudit, readGate, gates, readAssignment, readResult, sources, stagedOutline, broadScope, coreV0, coreTestV0, adaptersV0, adaptersTestV0, panelV0, panelTestV0, pureV0, pureTestV0, coreV1, coreTestV1, coreV2, coreTestV2, adaptersV2, adaptersTestV2, panelV2, panelTestV2, pureV2, pureTestV2, coreV3, coreTestV3, adaptersV3, adaptersTestV3 } from './breaking-work-fixture.js';

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
