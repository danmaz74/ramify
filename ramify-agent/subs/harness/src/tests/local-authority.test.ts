import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { analysisLayout, type RegistryEntry } from '../analysis/records.js';
import { architectureLayout, type PlacementDecision } from '../architecture/records.js';
import type { RunEvent } from '../run/log.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios } from './helpers/declarations.js';
import { analysis, entry, hypothesis, requestCompletion } from './helpers/analysis.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { localDecision, registryChange, requestPlacement } from './helpers/placement.js';
import { installTestRunner, onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { runLayout } from '../run/records.js';
import { answeredGit, scenariosCommitted, unchanged } from './helpers/contracts-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * What a local architect decides for itself, and what it brings to the
 * global architect.
 *
 * A choice that refines its own subtree's responsibility is recorded with
 * its assignment, discoverable from the registry, and nothing is appended to
 * the architect context for it. A hypothesis that places a capability
 * outside the subtree is evidence against localizing it, and a departure
 * about shared responsibility becomes a focused request with the
 * counterevidence that justifies it.
 *
 * No external tool takes part: Git, the command line and the readiness
 * commands are answered, and the run's own files are what is read.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const catalogCore = 'collection-review/workspace/catalog/core';
const catalogUi = 'collection-review/workspace/catalog/ui';
const reviewsCore = 'collection-review/workspace/reviews/core';
const contracts = 'collection-review/workspace/contracts';

async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

function index(events: readonly RunEvent[], predicate: (event: RunEvent) => boolean): number {
  return events.findIndex(predicate);
}

describe('G5, G6, G7: local authority, escalation and what a revision reaches', () => {
  test('one architect refines locally, one escalates with counterevidence, and the revision reaches the rest before their work', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysis(
        [entry('revision-compare', catalogCore, 'Compares two revisions of one record.'),
          entry('compare-card', catalogUi, 'Shows the comparison on the record card.'),
          entry('compare-report', reviewsCore, 'Reports the comparison beside a review result.')],
        [hypothesis('shared-formatting', {
          capability: 'format-fields', change: 'create', suggestedOwner: contracts,
          involvedModules: [catalogCore, catalogUi, reviewsCore],
          anticipatedConsumers: [catalogUi, reviewsCore],
          confidence: 'medium',
          rationale: 'Formatting a field for display may be shared vocabulary, which belongs above all three.',
        })],
      ))],
      'local-architect': [
        // wi-001: a refinement wholly inside its own subtree. No request is
        // made, and the choice is recorded with the assignment.
        submit({
          ...assign(catalogCore, {}, outline({ changes: 'The comparison is ordered by the field order the core already holds.' })),
          localDecisions: [localDecision({
            question: 'Which part of this subtree orders the compared fields?',
            outcome: 'create',
            capability: 'field-order',
            owner: catalogCore,
            rationale: 'Ordering the fields of a revision refines what this module is already responsible for, and nothing outside it reads a revision.',
          }, [registryChange({
            capability: 'field-order', owner: catalogCore,
            behavior: 'Orders the fields of a record revision for display.',
          })])],
        }),
        submit(requestCompletion()),
        // wi-002: the hypothesis places formatting outside this subtree, and
        // this architect departs from it with counterevidence, which is a
        // request rather than a local decision.
        submit(requestPlacement({
          forCapability: 'compare-card',
          question: 'Does formatting a compared field belong to the shared contracts, or to the catalog core?',
          requiredBehavior: 'One label and one rendered value per changed field, on the record card.',
          findings: [{ text: 'The contracts module holds no rendering vocabulary today.', citations: [{ module: contracts }] }],
          candidates: [{ capability: 'field-order', owner: catalogCore, note: 'The core already orders the fields.' }],
          hypotheses: [{
            hypothesis: 'shared-formatting', stance: 'departs',
            evidence: 'Only the catalog reads a record revision; the reviews surface reads a review result, not a record.',
          }],
        })),
        submit(assign(catalogUi, {}, outline())),
        submit(requestCompletion()),
        // wi-003: neither decides nor escalates. It receives the revision.
        submit(assign(reviewsCore, {}, outline())),
        submit(requestCompletion()),
      ],
      'global-fork': [submit({
        kind: 'decision',
        decision: {
          question: 'Does formatting a compared field belong to the shared contracts, or to the catalog core?',
          outcome: 'reuse',
          capability: 'field-order',
          changesExistingSymbols: false,
          owner: catalogCore,
          rationale: 'The catalog core already owns the field order, and it is the only reader of a record revision.',
          constraints: [],
          uncertainties: [],
          evidence: { citations: [{ module: catalogCore }], gaps: [] },
        },
        registry: [registryChange({
          capability: 'field-order', owner: catalogCore,
          behavior: 'Orders the fields of a record revision for display.',
          consumers: [{ capability: 'compare-card', workItem: 'wi-002' }],
        })],
        hypothesisRevisions: [{
          hypothesis: 'shared-formatting', standing: 'superseded',
          reason: 'Only the catalog reads a record revision, so formatting one is not shared vocabulary.',
          suggestedOwner: catalogCore,
          confidence: 'low',
        }],
        brief: 'field-order stays in the catalog core; the shared-formatting forecast is superseded.',
      })],
      engineer: [submit(completionProposed('Nothing needed changing for this iteration.'))],
    })));

    // Git is answered, not run. No iteration of this scenario writes source,
    // so every commit Git is asked for is one it reports as an unchanged tree.
    const final = finalCandidate(project, 'scenarios-of-revision-diff');
    const git = answeredGit(project, {
      head: 'revision-00',
      previews: final.previews,
      commits: [
        scenariosCommitted('revision-diff'),
        unchanged('wi-001.i01'), unchanged('wi-001'),
        unchanged('wi-002.i01'), unchanged('wi-002'),
        unchanged('wi-003.i01'), unchanged('wi-003'),
        unchanged('final verification of plan "revision-diff"'),
      ],
    });
    const opened = await openRuns(project, {
      agent, inputs: treeInputs(), git, candidates: final.candidates,
      readinessExecution: directReadinessExecution(),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    // What the run asked Git: its own branch, the feature files' commit, one
    // commit for each gate, and no other revision, because nothing else in
    // the tree changed. Every answer this scenario stated was used and
    // nothing else was asked of Git; only the gates' commits are looked up.
    expect(git.branch()).toBe(`ramify-agent-run/${runId}`);
    expect(git.minted()).toEqual(['scenarios-of-revision-diff']);
    expect(git.lookups()).toHaveLength(git.messages().length - 1);
    git.assertAnswered();


    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    const types = events.map(event => event.type);

    // G5: the first work item decided within its own authority. It asked
    // nobody, and its decision was committed with its assignment.
    const firstAssignment = index(events, event => event.type === 'iteration-assigned');
    const firstRequest = index(events, event => event.type === 'placement-requested');
    expect(firstAssignment).toBeGreaterThan(0);
    expect(firstRequest).toBeGreaterThan(firstAssignment);
    expect(types.filter(type => type === 'placement-requested')).toHaveLength(1);
    expect((events[firstRequest]!.data as { workItem: string }).workItem).toBe('wi-002');
    expect((events[firstAssignment]!.data as { decisions: string[] }).decisions).toEqual(['ld-wi-001-01']);

    const local = JSON.parse(await readFile(
      runPath(project, 'revision-diff', runId, architectureLayout.decision('ld-wi-001-01')), 'utf8',
    )) as PlacementDecision;
    expect(local.authority).toBe('local');
    expect(local.request).toBeNull();
    expect(local.workItem).toBe('wi-001');
    expect(local.brief).toBeUndefined();

    // The local decision is discoverable from the registry, and no brief was
    // appended to the architect context for it.
    const registered = JSON.parse(await readFile(
      runPath(project, 'revision-diff', runId, analysisLayout.registry('field-order', 1)), 'utf8',
    )) as RegistryEntry;
    expect(registered.origin).toBe('local-decision');
    expect(registered.decision).toBe('ld-wi-001-01');
    expect(registered.owner).toBe(catalogCore);
    const appended = events.filter(event => event.type === 'brief-appended');
    expect(appended.map(event => (event.data as { decision: string }).decision)).toEqual(['gd-001']);

    // G5: the escalation carried the counterevidence for departing from the
    // hypothesis, at the revision the harness had delivered.
    const request = JSON.parse(await readFile(
      runPath(project, 'revision-diff', runId, architectureLayout.request('pr-001')), 'utf8',
    )) as { hypotheses: Array<{ ref: { id: string; revision: number }; stance: string; evidence: string }> };
    expect(request.hypotheses).toHaveLength(1);
    expect(request.hypotheses[0]!.stance).toBe('departs');
    expect(request.hypotheses[0]!.ref).toMatchObject({ id: 'shared-formatting', revision: 1 });
    expect(request.hypotheses[0]!.evidence).toContain('reviews surface reads a review result');

    // G6: the fork found the locally registered capability in the registry
    // it was given, with no brief for it in what it inherited, and reused it.
    const fork = agent.sessions.find(session => session.spec.role === 'global-fork')!;
    expect(fork.spec.prompt).toContain('`field-order` → `collection-review/workspace/catalog/core` (revision 1, local-decision');
    expect(fork.inherited.join('\n')).not.toContain('field-order');
    const decision = JSON.parse(await readFile(
      runPath(project, 'revision-diff', runId, architectureLayout.decision('gd-001')), 'utf8',
    )) as PlacementDecision;
    expect(decision.outcome).toBe('reuse');
    expect(decision.capability).toBe('field-order');
    expect(decision.registry.map(ref => `${ref.id}@${ref.revision}`)).toEqual(['field-order@2']);

    // G7: the revision the decision made reached every work item the
    // hypothesis involves, before that item's next assignment.
    const revised = events.findIndex(event => event.type === 'decision-accepted');
    for (const workItem of ['wi-002', 'wi-003']) {
      const delivery = events.findIndex((event, position) =>
        position > revised
        && event.type === 'hypotheses-delivered'
        && event.data.workItem === workItem
        && event.data.refs.some(ref => ref.id === 'shared-formatting' && ref.revision === 2));
      const assigned = events.findIndex((event, position) =>
        position > revised && event.type === 'iteration-assigned' && event.data.workItem === workItem);
      expect(delivery).toBeGreaterThan(revised);
      expect(assigned).toBeGreaterThan(delivery);
    }

    // Delivery never rewrote an active assignment: the first work item's
    // outline names the revision it was given, which is revision 1.
    const outlineOne = JSON.parse(await readFile(
      runPath(project, 'revision-diff', runId, 'work-items/wi-001/outline/1.json'), 'utf8',
    )) as { hypothesesSeen: Array<{ id: string; revision: number }> };
    expect(outlineOne.hypothesesSeen).toEqual([{ id: 'shared-formatting', revision: 1, hash: expect.any(String) }]);

    // Git could not measure lines here, and the run recorded that as the
    // gap it is rather than as no change: an external system that cannot
    // answer leaves its reason in the invocation's own record.
    expect(git.worktreeLineChanges.mock.calls.length).toBeGreaterThan(0);
    const writer = events.find(event => event.type === 'invocation-started'
      && (event.data as { role: string }).role === 'engineer')!;
    const lines = JSON.parse(await readFile(runPath(
      project, 'revision-diff', runId, runLayout.lineEvents((writer.data as { invocation: string }).invocation),
    ), 'utf8')) as { coverage: string; gaps: string[]; paths: unknown[] };
    expect(lines.coverage).toBe('partial');
    expect(lines.gaps.join(' ')).toContain('Line measurements are unavailable in this scenario');
    expect(lines.paths).toEqual([]);
  }, 180_000);
});
