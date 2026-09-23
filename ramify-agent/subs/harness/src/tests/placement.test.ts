import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent, type ScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { analysisLayout, type Hypothesis, type RegistryEntry } from '../analysis/records.js';
import { architectureLayout, type PlacementDecision, type PlacementRequest } from '../architecture/records.js';
import type { RunInputs } from '../run/inputs.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import type { RunEvent } from '../run/log.js';
import { reduceSessions } from '../run/sessions.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios } from './helpers/declarations.js';
import { analysis, entry, hypothesis, requestCompletion } from './helpers/analysis.js';
import { byRole, readDeclaredTree, submit, treeInputs } from './helpers/iterations.js';
import { forkDecision, forkPartial, registryChange, requestPlacement } from './helpers/placement.js';
import {
  installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun,
} from './helpers/runs.js';

/*
 * Capability identity and placement, resolved in sequential forks of one
 * long-lived architect context.
 *
 * Each request refreshes the architect view, records its identity, and forks
 * the parent's latest point. The fork investigates and decides; the parent
 * is never invoked for the choice. The brief of an accepted decision is
 * appended to the parent without a model call, and the next fork inherits
 * it.
 *
 * There is no retained comparison baseline and no diff: each fork is given
 * the refreshed view and the committed records, and checks current facts.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const core = 'collection-review/workspace/catalog/core';
const panel = 'collection-review/workspace/catalog/ui';
const unchangedPlacementCheckpoints = [scenariosCommit('revision-diff'), 'wi-001', 'wi-002', 'final verification of plan "revision-diff"'] as const;

/** A copy of the fixture project, made a git repository with the runner readiness looks for. */
async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

/** The analysis the placement tests start from: two entries and one forecast. */
function analysed() {
  return analysis(
    [entry('compare-revisions', core, 'Compares two revisions of one record, field by field.'),
      entry('compare-panel', panel, 'Shows the comparison of two revisions on the record card.')],
    [hypothesis('field-diff', {
      capability: 'field-diff', change: 'create', suggestedOwner: core,
      involvedModules: [core, panel], anticipatedConsumers: [panel],
      rationale: 'Comparing two field maps may be one capability both surfaces use.',
    })],
  );
}

/** The decision the first fork makes: the capability is created in the catalog core. */
function firstDecision(brief: string) {
  return forkDecision({
    decision: {
      question: 'Where does comparing two revisions field by field belong?',
      outcome: 'create',
      capability: 'field-diff',
      changesExistingSymbols: false,
      owner: core,
      rationale: 'The core already holds the revision chain, and both surfaces read it from there.',
      constraints: ['The comparison is read-only.'],
      uncertainties: [],
      evidence: { citations: [{ module: core }], gaps: ['no dependency facts are published for this fixture'] },
    },
    registry: [registryChange({
      capability: 'field-diff', owner: core,
      behavior: 'Compares two revisions of one record and names the fields that differ.',
    })],
    hypothesisRevisions: [{
      hypothesis: 'field-diff', standing: 'confirmed',
      reason: 'The core owns the revision chain, which is what the comparison reads.',
    }],
    brief,
  });
}

/** The decision the second fork makes: the registered capability is reused. */
function secondDecision() {
  return forkDecision({
    decision: {
      question: 'Does the panel need its own comparison?',
      outcome: 'reuse',
      capability: 'field-diff',
      changesExistingSymbols: false,
      owner: core,
      rationale: 'The brief of gd-001 already placed it in the core, and the panel is the consumer it anticipated.',
      constraints: [],
      uncertainties: [],
      evidence: { citations: [{ module: core }], gaps: [] },
    },
    registry: [registryChange({
      capability: 'field-diff', owner: core,
      behavior: 'Compares two revisions of one record and names the fields that differ.',
      consumers: [{ capability: 'compare-panel', workItem: 'wi-002' }],
    })],
    brief: 'The panel consumes field-diff from the catalog core; nothing new was placed.',
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function types(events: readonly RunEvent[]): string[] {
  return events.map(event => event.type);
}

describe('G2, G3: two sequential placement forks, and the brief between them', () => {
  test('the first creates a capability and revises its hypothesis; the second inherits its brief and reuses the entry', async () => {
    const project = await target();
    const brief = 'field-diff belongs to the catalog core: it owns the revision chain the comparison reads. The panel is its anticipated consumer.';
    const agent: ScriptedAgent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [
        submit(requestPlacement({
          forCapability: 'compare-revisions',
          question: 'Does comparing two revisions belong here, or to the panel that shows it?',
          findings: [{ text: 'The core holds the revision chain.', citations: [{ module: core }] }],
          candidates: [{ owner: core, note: 'It already holds the chain.' }],
          hypotheses: [{ hypothesis: 'field-diff', stance: 'supports', evidence: 'The chain is here and nowhere else.' }],
        })),
        submit(requestCompletion()),
        submit(requestPlacement({
          forCapability: 'compare-panel',
          question: 'Does the panel need its own comparison of two revisions?',
          candidates: [{ capability: 'field-diff', owner: core, note: 'The brief says the core owns it.' }],
        })),
        submit(requestCompletion()),
      ],
      'global-fork': [submit(firstDecision(brief)), submit(secondDecision())],
    })));

    /** How many sessions the fake had started at each boundary of the chain. */
    const sessions: Array<{ write: string; started: number }> = [];
    const opened = await openRuns(project, {
      agent,
      inputs: treeInputs(),
      unchangedCheckpoints: unchangedPlacementCheckpoints,
      afterWrite: async write => {
        if (write === 'decision-accepted' || write === 'brief-appended') {
          sessions.push({ write, started: agent.sessions.length });
        }
      },
    });
    cleanups.push(() => opened.service.close());

    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    // Requests run one at a time: each one is requested, its view refreshed,
    // one fork run, its decision accepted, its brief appended and the
    // decision delivered, before the next request begins.
    expect(types(events).filter(type => type.startsWith('placement-') || type.startsWith('view-') || type.startsWith('decision-') || type.startsWith('brief-'))).toEqual([
      'placement-requested', 'view-refreshed', 'decision-accepted', 'brief-appended', 'decision-delivered',
      'placement-requested', 'view-refreshed', 'decision-accepted', 'brief-appended', 'decision-delivered',
    ]);

    // G3: the append is storage. No session is started for it, and no
    // invocation lies between the decision and the brief.
    const between = events.slice(
      types(events).indexOf('decision-accepted'),
      types(events).indexOf('brief-appended'),
    );
    expect(types(between)).toEqual(['decision-accepted']);
    expect(sessions.map(entry => entry.write)).toEqual(['decision-accepted', 'brief-appended', 'decision-accepted', 'brief-appended']);
    expect(sessions[0]!.started).toBe(sessions[1]!.started);
    expect(sessions[2]!.started).toBe(sessions[3]!.started);

    // G3: the brief reaches the next fork's input, which is where it is
    // sent to a model for the first time.
    const forks = agent.sessions.filter(session => session.spec.role === 'global-fork');
    expect(forks).toHaveLength(2);
    expect(forks[0]!.start.mode).toBe('fork');
    expect(forks[0]!.inherited.join('\n')).not.toContain(brief);
    expect(forks[1]!.start.mode).toBe('fork');
    expect(forks[1]!.inherited.join('\n')).toContain(brief);
    // The brief carries the decision's own references, and the fork's text
    // unchanged.
    expect(forks[1]!.inherited.join('\n')).toContain('Decision gd-001 (request pr-001)');

    // G2: the second decision reuses the registered entry rather than
    // naming a new slug.
    const first = await readJson<PlacementDecision>(runPath(project, 'revision-diff', runId, architectureLayout.decision('gd-001')));
    const second = await readJson<PlacementDecision>(runPath(project, 'revision-diff', runId, architectureLayout.decision('gd-002')));
    expect(first.outcome).toBe('create');
    expect(first.authority).toBe('global');
    expect(first.request).toBe('pr-001');
    expect(second.outcome).toBe('reuse');
    expect(second.capability).toBe('field-diff');
    expect(second.registry.map(ref => `${ref.id}@${ref.revision}`)).toEqual(['field-diff@2']);
    expect(second.proposed).toBeUndefined();

    // Three capabilities: the two entries and the one the first fork
    // created. The second fork registered no new slug.
    const registry = await readJson<RegistryEntry>(runPath(project, 'revision-diff', runId, analysisLayout.registry('field-diff', 2)));
    expect(registry.owner).toBe(core);
    expect(registry.origin).toBe('global-decision');
    expect(registry.decision).toBe('gd-002');
    expect(registry.consumers).toEqual([{ capability: 'compare-panel', workItem: 'wi-002' }]);

    // The hypothesis was revised by the decision, and revision 1 stands.
    const revised = await readJson<Hypothesis>(runPath(project, 'revision-diff', runId, analysisLayout.hypothesis('field-diff', 2)));
    expect(revised.standing).toBe('confirmed');
    expect(revised.confirmedBy).toBe('gd-001');
    expect(revised.cause).toEqual({ decision: 'gd-001', reason: 'The core owns the revision chain, which is what the comparison reads.' });
    const original = await readJson<Hypothesis>(runPath(project, 'revision-diff', runId, analysisLayout.hypothesis('field-diff', 1)));
    expect(original.standing).toBe('tentative');

    // G2: no baseline is retained. Each request recorded the identity of the
    // view it was answered against, and each decision rests on its own.
    const refreshed = events.filter(event => event.type === 'view-refreshed');
    expect(refreshed).toHaveLength(2);
    for (const [index, decision] of [first, second].entries()) {
      expect(decision.evidence.view).toEqual(refreshed[index]!.data.view);
    }

    // The decision reached the local architect that asked, before it planned
    // anything further.
    const delivered = types(events).indexOf('decision-delivered');
    expect(types(events).slice(delivered).includes('outline-revised')).toBe(true);
    const request = await readJson<PlacementRequest>(runPath(project, 'revision-diff', runId, architectureLayout.request('pr-001')));
    expect(request.workItem).toBe('wi-001');
    expect(request.requester).toBe(core);
    expect(request.hypotheses[0]).toMatchObject({ stance: 'supports' });
    expect(request.hypotheses[0]!.ref).toMatchObject({ id: 'field-diff', revision: 1 });
  }, 120_000);
});

describe('X1c: a fork that returns partial findings and no decision', () => {
  test('it consumes its retries, nothing is appended, and the local architect is told', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [
        submit(requestPlacement({ forCapability: 'compare-revisions' })),
        submit(requestCompletion()),
        submit(requestCompletion()),
      ],
      'global-fork': [submit(forkPartial(['two modules could own it'], ['the view publishes no dependency facts']))],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: unchangedPlacementCheckpoints });
    cleanups.push(() => opened.service.close());

    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    // The policy allows two retries; a partial return counts one, so three
    // forks ran and the third exhausted them.
    const partials = events.filter(event => event.type === 'fork-returned-partial');
    expect(partials.map(event => event.data.retry)).toEqual([1, 2, 3]);
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(3);

    // Nothing was decided and nothing was appended. The parent was never
    // invoked to supply the choice the fork could not make.
    expect(types(events)).not.toContain('decision-accepted');
    expect(types(events)).not.toContain('brief-appended');
    expect(types(events)).not.toContain('decision-delivered');
    expect(agent.sessions.map(session => session.spec.role).sort()).toEqual(
      ['global-fork', 'global-fork', 'global-fork', 'initial-architect', 'local-architect', 'local-architect', 'local-architect'],
    );

    // The unresolved outcome reached the local architect that asked.
    const architects = agent.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects[1]!.spec.prompt).toContain('pr-001');
    expect(architects[1]!.spec.prompt).toContain('was not resolved');
    expect(architects[1]!.spec.prompt).toContain('two modules could own it');
    expect(architects[1]!.spec.prompt).toContain('the view publishes no dependency facts');
  }, 120_000);
});

describe('a view identity that changes under an investigation', () => {
  test('the evidence is revalidated, the investigation repeats, and one decision is made, not two', async () => {
    const project = await target();
    let identity = 1;
    const inputs: RunInputs = {
      ...treeInputs(),
      async refresh(projectRoot: string): Promise<ArchitectIndex> {
        const tree = await readDeclaredTree(projectRoot);
        return { ...tree, revision: `rev/1:declared:${identity}`, input: `input/1:declared-${identity}` };
      },
    };
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(requestPlacement({ forCapability: 'compare-revisions' })), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(firstDecision('field-diff belongs to the catalog core.'))],
    })));
    const opened = await openRuns(project, {
      agent,
      inputs,
      unchangedCheckpoints: unchangedPlacementCheckpoints,
      // The source changes while the first fork is investigating, so the
      // evidence it decided on is no longer the evidence in front of the
      // harness.
      afterWrite: async write => {
        if (write === 'view-refreshed' && identity === 1) identity = 2;
      },
    });
    cleanups.push(() => opened.service.close());

    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    const refreshed = events.filter(event => event.type === 'view-refreshed');
    expect(refreshed.map(event => event.data.attempt)).toEqual([1, 2]);
    expect(refreshed.map(event => (event.data.view as { input?: string }).input)).toEqual(['input/1:declared-1', 'input/1:declared-2']);

    // Two investigations, one decision: the revisions were never combined.
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(2);
    expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
    expect(events.filter(event => event.type === 'brief-appended')).toHaveLength(1);

    const decision = await readJson<PlacementDecision>(runPath(project, 'revision-diff', runId, architectureLayout.decision('gd-001')));
    expect(decision.evidence.view).toEqual({
      status: 'materialized',
      revision: 'rev/1:declared:2',
      input: 'input/1:declared-2',
      coverageLimits: ['the view\'s own coverage limits could not be read, so absence in it is not proof of absence'],
    });

    // The second fork was told what changed and what that means.
    const forks = agent.sessions.filter(session => session.spec.role === 'global-fork');
    expect(forks[1]!.spec.prompt).toContain('The evidence changed under the earlier fork');
    expect(forks[1]!.spec.prompt).toContain('input/1:declared-1');
    expect(forks[1]!.spec.prompt).toContain('input/1:declared-2');
  }, 120_000);
});

describe('the invocation of a fork', () => {
  test('records the mode that was actual, and the point its history reached', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(requestPlacement({ forCapability: 'compare-revisions' })), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(firstDecision('field-diff belongs to the catalog core.'))],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: unchangedPlacementCheckpoints });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    const fork = events.find(event => event.type === 'invocation-started' && event.data.role === 'global-fork');
    expect(fork).toBeDefined();
    const id = (fork!.data as { invocation: string }).invocation;
    const invocation = await readJson<{ session: { requested: string; actual: string; from?: string } }>(
      runPath(project, 'revision-diff', runId, runLayout.invocation(id)),
    );
    expect(invocation.session.requested).toBe('fork');
    expect(invocation.session.from).not.toBe('');

    const outcome = await readJson<InvocationOutcome>(runPath(project, 'revision-diff', runId, runLayout.outcome(id)));
    expect(outcome.session?.mode).toBe('fork');
    expect(outcome.session?.degradedReason).toBeUndefined();
    expect(outcome.session?.ref).not.toBe('');

    // The append names the point the parent's history reached, which is
    // what the next fork would fork from.
    const appended = events.find(event => event.type === 'brief-appended');
    expect(appended!.data).toMatchObject({ decision: 'gd-001', generation: 1, outcome: 'appended' });
    expect((appended!.data as { session: string }).session).not.toBe('');
  }, 120_000);
});

describe('a start the executor could not honor', () => {
  test('is recorded at the invocation\'s end with what was requested, what was actual and the executor\'s reason', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(requestPlacement({ forCapability: 'compare-revisions' })), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [submit(firstDecision('field-diff belongs to the catalog core.'))],
    })));
    // The executor forgets the architect context and the local architect's
    // session as soon as each first invocation ends, so the fork and the
    // continuation it asks for both start fresh.
    let ends = 0;
    const opened = await openRuns(project, {
      agent,
      inputs: treeInputs(),
      unchangedCheckpoints: unchangedPlacementCheckpoints,
      afterWrite: async write => {
        if (write !== 'invocation-ended') return;
        ends += 1;
        if (ends <= 2) expect(agent.forget(agent.sessions[ends - 1]!.ref)).toBe(true);
      },
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);

    const events = await runEventsOnDisk(project, 'revision-diff', receipt.jobId);
    const degraded = events.flatMap(event => (event.type === 'invocation-ended' && event.data.degraded !== undefined ? [[event.data.invocation, event.data.degraded]] : []));
    expect(degraded).toEqual([
      ['inv-0003', { requested: 'fork', actual: 'fresh', reason: expect.stringContaining('is not known to the scripted agent') }],
      ['inv-0004', { requested: 'continue', actual: 'fresh', reason: expect.stringContaining('is not known to the scripted agent') }],
    ]);
    // The relations requested stay as they were asked for: the fork still
    // names its source point, and the continuation its session's last one.
    const sessions = reduceSessions(events);
    expect(sessions.get('ses-0003')!.fork).toMatchObject({ from: { session: 'ses-0001', invocation: 'inv-0001' } });
    const continued = events.find(event => event.type === 'invocation-started' && event.data.invocation === 'inv-0004')!;
    expect(continued.data).toMatchObject({ start: 'continued', continues: { from: { session: 'ses-0002', invocation: 'inv-0002' }, reason: 'placement-answered' } });
    // Only a start that degraded says so.
    expect(events.filter(event => event.type === 'invocation-ended').length).toBeGreaterThan(degraded.length);
  }, 120_000);
});

describe('a parent context that can no longer be read', () => {
  test('the generation rises, the pending brief is cleared, and the next fork is oriented from the records', async () => {
    const project = await target();
    const brief = 'field-diff belongs to the catalog core, which owns the revision chain.';
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [
        submit(requestPlacement({ forCapability: 'compare-revisions' })),
        submit(requestCompletion()),
        submit(requestPlacement({ forCapability: 'compare-panel' })),
        submit(requestCompletion()),
      ],
      'global-fork': [submit(firstDecision(brief)), submit(secondDecision())],
    })));

    let lost = false;
    const opened = await openRuns(project, {
      agent,
      inputs: treeInputs(),
      unchangedCheckpoints: unchangedPlacementCheckpoints,
      afterWrite: async write => {
        // The parent is lost while the first decision is committed and its
        // brief is not appended yet.
        if (write === 'decision-accepted' && !lost) {
          lost = true;
          expect(agent.forget(agent.sessions[0]!.ref)).toBe(true);
        }
      },
    });
    cleanups.push(() => opened.service.close());

    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    // No brief was appended for the first decision: the context that would
    // have held it is gone, and the generation rose instead.
    const rebuilt = events.filter(event => event.type === 'global-context-rebuilt');
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0]!.data).toMatchObject({ generation: 2 });
    expect((rebuilt[0]!.data as { reason: string }).reason).toContain('generation 1');
    const appended = events.filter(event => event.type === 'brief-appended');
    expect(appended.map(event => (event.data as { decision: string }).decision)).toEqual(['gd-002']);
    expect(appended[0]!.data).toMatchObject({ generation: 2 });

    // The decision still reached the local architect that asked for it.
    expect(events.filter(event => event.type === 'decision-delivered')).toHaveLength(2);

    // The next fork was started fresh and oriented from the records, which
    // is where the first decision's brief is read from. Rebuilding cleared
    // the pending list: nothing appended gd-001 afterwards.
    const forks = agent.sessions.filter(session => session.spec.role === 'global-fork');
    expect(forks).toHaveLength(2);
    expect(forks[1]!.start.mode).toBe('fresh');
    expect(forks[1]!.inherited).toEqual([]);
    expect(forks[1]!.spec.prompt).toContain('The architect context, rebuilt from the run\'s records');
    expect(forks[1]!.spec.prompt).toContain(brief);
    expect(forks[1]!.spec.prompt).toContain('`field-diff` → `collection-review/workspace/catalog/core`');

    // The invocation of that fork records what was requested and what was
    // actual, which is how a fork that became a fresh session is visible.
    const started = events.filter(event => event.type === 'invocation-started' && event.data.role === 'global-fork');
    const outcome = await readJson<InvocationOutcome>(
      runPath(project, 'revision-diff', runId, runLayout.outcome((started[1]!.data as { invocation: string }).invocation)),
    );
    expect(outcome.session?.mode).toBe('fresh');

    // The session that held the lost context is finished as lost, and the
    // fork that rebuilt the context is kept as the context itself: the
    // second brief is appended to it, and run end finishes it.
    const sessions = reduceSessions(events);
    const context = (started[0]!.data as { session: string }).session;
    expect(context).not.toBe('ses-0001');
    expect(sessions.get('ses-0001')).toMatchObject({ role: 'initial-architect', state: 'finished', finished: 'lost', appends: [] });
    const rebuiltContext = (started[1]!.data as { session: string }).session;
    expect(sessions.get(rebuiltContext)).toMatchObject({ role: 'global-fork', state: 'finished', finished: 'run-ended' });
    expect(sessions.get(rebuiltContext)!.appends).toHaveLength(1);
    expect(sessions.get(context)).toMatchObject({ state: 'finished', finished: 'not-kept' });
    // ST03: the first fork forked the architect context of generation 1 at
    // the initial architect's end; the fork that rebuilt the context names
    // the session it took the place of, and forks from nothing.
    expect(sessions.get(context)!.fork).toEqual({ from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'placement-request', generation: 1, briefs: [] });
    expect(sessions.get(rebuiltContext)).toMatchObject({ fork: null, replaces: { session: 'ses-0001', reason: 'context-rebuilt' } });
  }, 120_000);
});

describe('a fork whose submissions are invalid', () => {
  test('the errors reach the same fork, a corrected submission is accepted, and nothing changed meanwhile', async () => {
    const project = await target();
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(requestPlacement({ forCapability: 'compare-revisions' })), submit(requestCompletion()), submit(requestCompletion())],
      'global-fork': [[
        // The rule this iteration's guard names: an owner the refreshed
        // view does not have, with nothing proposing it.
        { kind: 'submit', input: forkDecision({
          decision: {
            question: 'Where does it belong?', outcome: 'create', capability: 'field-diff',
            changesExistingSymbols: false, owner: 'collection-review/workspace/nowhere',
            rationale: 'r', constraints: [], uncertainties: [], evidence: { citations: [], gaps: [] },
          },
          registry: [],
        }) },
        { kind: 'submit', input: firstDecision('field-diff belongs to the catalog core.') },
      ]],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: unchangedPlacementCheckpoints });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    // The rejection was answered to the same session, with its path, and the
    // correction was accepted.
    const fork = agent.sessions.find(session => session.spec.role === 'global-fork')!;
    const rejected = fork.results.find(result => result.isError)!;
    expect(rejected.text).toContain('"path": "decision.proposed"');
    expect(rejected.text).toContain('Correct every error above and call the tool again.');
    expect(fork.verdicts).toEqual([{ accepted: false, errors: [expect.any(String)] }, { accepted: true }]);

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
    const started = events.find(event => event.type === 'invocation-started' && event.data.role === 'global-fork')!;
    const id = (started.data as { invocation: string }).invocation;
    const outcome = await readJson<InvocationOutcome>(runPath(project, 'revision-diff', runId, runLayout.outcome(id)));
    expect(outcome.ended).toBe('submitted');
    expect(outcome.rejectedSubmissions).toBe(1);
    // Each rejection is an observation with its errors, and the input
    // itself is not stored.
    const observations = await readFile(runPath(project, 'revision-diff', runId, runLayout.observations(id)), 'utf8');
    expect(observations).toContain('"target":"submit_placement_decision"');
    expect(observations).toContain('decision.proposed');
  }, 120_000);

  test('the bound ends the fork as an invalid submission, and the run fails with it', async () => {
    const project = await target();
    const broken = { kind: 'decision', decision: { question: 'where?' } };
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [submit(requestPlacement({ forCapability: 'compare-revisions' })), submit(requestCompletion())],
      'global-fork': [[
        { kind: 'submit', input: broken },
        { kind: 'submit', input: broken },
        { kind: 'submit', input: broken },
        { kind: 'submit', input: broken },
      ]],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit('revision-diff')] });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;

    const snapshot = onlyRun(opened.service, 'revision-diff');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');

    const events = await runEventsOnDisk(project, 'revision-diff', runId);
    const types = events.map(event => event.type);
    // Nothing was committed by the fork: no decision, no brief, no delivery.
    expect(types).not.toContain('decision-accepted');
    expect(types).not.toContain('brief-appended');
    expect(types).not.toContain('decision-delivered');
    // The request itself stands, and one fork ran.
    expect(types.filter(type => type === 'placement-requested')).toHaveLength(1);
    expect(agent.sessions.filter(session => session.spec.role === 'global-fork')).toHaveLength(1);

    const ended = events.filter(event => event.type === 'invocation-ended').at(-1)!;
    expect(ended.data).toMatchObject({ ended: 'invalid-submission', submission: null });
  }, 120_000);
});

describe('a decision that replaces an earlier one', () => {
  test('it names what it affects, and the consequence reaches that work item before its own turn', async () => {
    const project = await target();
    const consequence = 'The panel owns the comparison it was going to consume, so it implements it rather than importing it.';
    const agent = createScriptedAgent(declaringScenarios(byRole({
      'initial-architect': [submit(analysed())],
      'local-architect': [
        submit(requestPlacement({ forCapability: 'compare-revisions' })),
        submit(requestPlacement({ forCapability: 'compare-revisions', question: 'Is the core still the right owner now that only the panel reads it?' })),
        submit(requestCompletion()),
        submit(requestCompletion()),
      ],
      'global-fork': [
        submit(firstDecision('field-diff belongs to the catalog core.')),
        submit(forkDecision({
          decision: {
            question: 'Is the core still the right owner now that only the panel reads it?',
            outcome: 'extract',
            capability: 'field-diff',
            changesExistingSymbols: true,
            owner: panel,
            rationale: 'The only reader is the panel, and the comparison has no other consumer.',
            constraints: [],
            uncertainties: [],
            evidence: { citations: [{ module: panel }], gaps: [] },
            revises: { decision: 'gd-001', affected: [{ workItem: 'wi-002', consequence }] },
          },
          registry: [registryChange({
            capability: 'field-diff', owner: panel,
            behavior: 'Compares two revisions of one record and names the fields that differ.',
          })],
          brief: 'field-diff moves from the catalog core to the panel; gd-001 is replaced.',
        })),
      ],
    })));
    const opened = await openRuns(project, { agent, inputs: treeInputs(), unchangedCheckpoints: unchangedPlacementCheckpoints });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('revision-diff'));
    await opened.service.settled('revision-diff', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');

    const second = await readJson<PlacementDecision>(runPath(project, 'revision-diff', runId, architectureLayout.decision('gd-002')));
    expect(second.revises).toEqual({ decision: 'gd-001', affected: [{ workItem: 'wi-002', consequence }] });
    // The registry records where the capability was, which is what makes
    // the move visible rather than silent.
    const moved = await readJson<RegistryEntry>(runPath(project, 'revision-diff', runId, analysisLayout.registry('field-diff', 2)));
    expect(moved.owner).toBe(panel);
    expect(moved.previousOwner).toBe(core);

    // The consequence reached the work item it names, at its own turn.
    const architects = agent.sessions.filter(session => session.spec.role === 'local-architect');
    const affected = architects.at(-1)!;
    expect(affected.spec.prompt).toContain('# Work item wi-002');
    expect(affected.spec.prompt).toContain('gd-002');
    expect(affected.spec.prompt).toContain(consequence);
    expect(affected.spec.prompt).toContain('It replaces `gd-001`.');
  }, 120_000);
});
