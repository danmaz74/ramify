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
    const refusedWrites = firstEngineer.results.filter(result => result.tool === 'write' && result.isError);
    expect(refusedWrites).toHaveLength(1);
    expect(refusedWrites[0]!.text).toContain('vitest.config.ts');
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
