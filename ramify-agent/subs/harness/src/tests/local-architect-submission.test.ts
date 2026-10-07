import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit, type GitCheckpoint } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { architectIndex, moduleEntry } from './helpers/views.js';
import type { RegistryEntry } from '../analysis/records.js';
import { workLayout } from '../work/records.js';
import { localArchitectJsonSchema, localArchitectToolName, validateLocalArchitect } from '../work/submission.js';
import { assign, outline } from './helpers/iterations.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion, unresolved } from './helpers/analysis.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { localContext, registered as registeredEvent, reported, submissionHash } from './helpers/obligations.js';
import { obligationsOf } from '../work/obligations.js';
import { trackedScenarios } from '../run/feature-files.js';
import { committedRecords } from '../work/committed.js';
import { RunLog } from '../run/log.js';

/*
 * Everything a local architect tells the harness is validated JSON: the
 * strict schema, then the rules the schema cannot hold. A failure changes
 * nothing, every error names its path, a corrected input is accepted, and
 * the bound ends the invocation as `invalid-submission`.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const index: ArchitectIndex = {
  revision: 'rev/1:x:1',
  input: 'input/1:abc',
  modules: architectIndex([moduleEntry('shop', '', null), moduleEntry('shop/orders', 'subs/orders', 'shop')]).modules,
  symbols: new Map(),
};

const registered: RegistryEntry = {
  schema: 'ramify-agent.capability/1',
  capability: 'send-email', revision: 1, behavior: 'Sends the customer an email.',
  owner: 'shop/orders', origin: 'entry', decision: null, consumers: [],
};
const registry = new Map([['send-email', registered]]);
const evidence = { index, registry };

describe('the schema', () => {
  test('is a union discriminated on kind, and has no field for an ID the harness knows', () => {
    const union = (localArchitectJsonSchema as { anyOf?: unknown[]; oneOf?: unknown[] });
    const members = (union.anyOf ?? union.oneOf) as Array<{ properties?: Record<string, unknown> }>;
    expect(members).toHaveLength(5);
    const text = JSON.stringify(localArchitectJsonSchema);
    for (const assigned of ['invocation', 'hypothesesSeen', 'schema', 'guarded', 'resolved', 'revision']) {
      expect(text).not.toContain(`"${assigned}"`);
    }
    // No member carries the work item it is submitted for. A consumer link
    // and an affected consequence name another work item, which is a
    // reference to a record and not this submission's own identity.
    for (const member of members) expect(Object.keys(member.properties ?? {})).not.toContain('workItem');
    expect(text).toContain('"assign"');
    expect(text).toContain('"request-placement"');
    expect(text).toContain('"request-completion"');
    expect(text).toContain('"unresolved"');
  });

  test('rejects an unknown kind, an unknown field and a missing outline, with a path for every error', () => {
    const unknown = validateLocalArchitect({ kind: 'assign', assignment: {} }, evidence);
    expect(unknown.ok).toBe(false);

    const extra = validateLocalArchitect({ ...requestCompletion(), notes: 'x' }, evidence);
    expect(extra.ok).toBe(false);

    const missing = validateLocalArchitect({ kind: 'request-completion', summary: 'done' }, evidence);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors[0]!.path).toBe('outline');
  });
});

describe('breaking assignments, the broad scope and authorizations', () => {
  const broad = (rationale: string) => ({ base: { modules: ['shop', 'shop/orders'], rationale }, extra: [], read: [], rationale: 'r' });
  const broken = outline({
    breakingChanges: [{ guarantee: 'Orders carry a plain total.', reason: 'The request asks for a structured one.', affectedConsumers: ['shop'], citations: [] }],
  });

  test('a broad scope with a rationale on a breaking assignment is accepted', () => {
    expect(validateLocalArchitect(assign('shop/orders', { kind: 'breaking', scope: broad('The total and its readers change together.') }, broken), evidence).ok).toBe(true);
  });

  test('a broad scope with no rationale is refused at its path, and nothing else is wrong with it', () => {
    const refused = validateLocalArchitect(assign('shop/orders', { kind: 'breaking', scope: broad('  ') }, broken), evidence);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors.map(error => error.path)).toEqual(['assignment.scope.base.rationale']);
  });

  test('only a breaking assignment may state a broad scope, and only over modules of the view', () => {
    const ordinary = validateLocalArchitect(assign('shop/orders', { kind: 'ordinary', scope: broad('r') }, broken), evidence);
    expect(ordinary.ok).toBe(false);
    if (ordinary.ok) return;
    expect(ordinary.errors.map(error => error.path)).toEqual(['assignment.kind']);
    const unknown = validateLocalArchitect(assign('shop/orders', {
      kind: 'breaking', scope: { ...broad('r'), base: { modules: ['shop', 'shop/nowhere'], rationale: 'r' } },
    }, broken), evidence);
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.errors.map(error => error.path)).toEqual(['assignment.scope.base.modules.1']);
  });

  test('a breaking assignment needs an outline that records the break', () => {
    const unplanned = validateLocalArchitect(assign('shop/orders', { kind: 'breaking' }, outline()), evidence);
    expect(unplanned.ok).toBe(false);
    if (unplanned.ok) return;
    expect(unplanned.errors.map(error => error.path)).toEqual(['assignment.kind']);
    // A narrow breaking scope is allowed: the broad form is optional.
    expect(validateLocalArchitect(assign('shop/orders', { kind: 'breaking' }, broken), evidence).ok).toBe(true);
  });

  test('an authorization names a guarded path and arrives with an outline revision', () => {
    const guarded = { ...evidence, guardedPaths: new Set(['package.json', 'vitest.config.ts']) };
    const authorizations = [{ path: 'vitest.config.ts', rationale: 'The request moves the suite.' }];
    expect(validateLocalArchitect(assign('shop/orders', { authorizations }, outline({ revisionReason: 'The suite moves.' })), guarded).ok).toBe(true);

    const unguarded = validateLocalArchitect(assign('shop/orders', { authorizations: [{ path: 'src/main.ts', rationale: 'r' }] }, outline()), guarded);
    expect(unguarded.ok).toBe(false);
    if (unguarded.ok) return;
    expect(unguarded.errors.map(error => error.path)).toEqual(['assignment.authorizations.0.path']);

    const unrecorded = validateLocalArchitect(assign('shop/orders', { authorizations }), { ...guarded, outline: outline() });
    expect(unrecorded.ok).toBe(false);
    if (unrecorded.ok) return;
    expect(unrecorded.errors.map(error => error.path)).toEqual(['assignment.authorizations']);
  });
});

describe('the rules the schema cannot hold', () => {
  test('a staged decomposition names at least two stages, and a single iteration at most one', () => {
    const staged = validateLocalArchitect(requestCompletion({ decomposition: { kind: 'staged', rationale: 'It is big.' }, stages: [] }), evidence);
    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(staged.errors[0]!.path).toBe('outline.stages');

    const single = validateLocalArchitect(requestCompletion({
      stages: [
        { title: 'One', approach: 'non-breaking', dependsOn: [], note: '' },
        { title: 'Two', approach: 'non-breaking', dependsOn: [0], note: '' },
      ],
    }), evidence);
    expect(single.ok).toBe(false);
    if (single.ok) return;
    expect(single.errors[0]!.path).toBe('outline.decomposition.kind');
    expect(single.errors[0]!.expected).toBe('"staged"');
  });

  test('a stage depends only on an earlier stage', () => {
    const result = validateLocalArchitect(requestCompletion({
      decomposition: { kind: 'staged', rationale: 'Two pieces.' },
      stages: [
        { title: 'One', approach: 'non-breaking', dependsOn: [1], note: '' },
        { title: 'Two', approach: 'non-breaking', dependsOn: [0], note: '' },
      ],
    }), evidence);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('outline.stages.0.dependsOn.0');
  });

  test('reuse names a module of the view, and agrees with where the registry places the capability', () => {
    const absent = validateLocalArchitect(requestCompletion({ reuse: [{ capability: 'send-email', owner: 'shop/nowhere', role: 'provider' }] }), evidence);
    expect(absent.ok).toBe(false);
    if (absent.ok) return;
    expect(absent.errors[0]!.path).toBe('outline.reuse.0.owner');

    const misplaced = validateLocalArchitect(requestCompletion({ reuse: [{ capability: 'send-email', owner: 'shop', role: 'provider' }] }), evidence);
    expect(misplaced.ok).toBe(false);
    if (misplaced.ok) return;
    expect(misplaced.errors[0]!.expected).toBe('shop/orders');

    const agreed = validateLocalArchitect(requestCompletion({ reuse: [{ capability: 'send-email', owner: 'shop/orders', role: 'provider' }] }), evidence);
    expect(agreed.ok).toBe(true);
  });

  test('a breaking change names consumers and citations the view has', () => {
    const result = validateLocalArchitect(requestCompletion({
      breakingChanges: [{ guarantee: 'The order stays open.', reason: 'The note closes it.', affectedConsumers: ['shop/nowhere'], citations: [{ module: 'shop/nothing' }] }],
    }), evidence);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(error => error.path)).toEqual([
      'outline.breakingChanges.0.affectedConsumers.0',
      'outline.breakingChanges.0.citations.0.module',
    ]);
  });

  test('`unresolved` carries its conflict and needs no outline', () => {
    expect(validateLocalArchitect(unresolved(), evidence).ok).toBe(true);
    expect(validateLocalArchitect({ kind: 'unresolved', evidence: [] }, evidence).ok).toBe(false);
  });

  test('without a view the rules that need one are not applied', () => {
    const result = validateLocalArchitect(requestCompletion({ reuse: [{ capability: 'send-email', owner: 'shop/nowhere', role: 'provider' }] }), { index: null, registry: new Map() });
    expect(result.ok).toBe(true);
  });
});

describe('the rules an assignment must satisfy', () => {
  test('a first assignment supplies an outline, while a later assignment may reuse its committed outline', () => {
    const first = validateLocalArchitect(assign('shop/orders'), evidence);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.errors).toEqual([expect.objectContaining({ path: 'outline' })]);

    const retained = validateLocalArchitect(assign('shop/orders'), { ...evidence, outline: outline() });
    expect(retained.ok).toBe(true);
  });

  /** The smallest assignment over a module the view has. */
  const over = (module: string, extra: Record<string, unknown> = {}) => assign(module, extra as never, outline());

  test('the module is one the view has, or one an accepted proposal creates', () => {
    expect(validateLocalArchitect(over('shop/orders'), evidence).ok).toBe(true);

    const absent = validateLocalArchitect(over('shop/billing'), evidence);
    expect(absent.ok).toBe(false);
    if (absent.ok) return;
    expect(absent.errors[0]!.path).toBe('assignment.scope.base.module');
    expect(absent.errors[0]!.message).toContain('no accepted registry entry proposes it');

    // An accepted entry that proposes the module is the authority the
    // harness needs, and a hypothesis is never one.
    const proposing = new Map(registry);
    proposing.set('note-store', {
      ...registered, capability: 'note-store', owner: 'shop/billing',
      proposed: { parent: 'shop', directory: 'subs/billing', purpose: 'Holds the note.', tags: [] },
    });
    expect(validateLocalArchitect(over('shop/billing'), { index, registry: proposing }).ok).toBe(true);
  });

  test('included directories carry instructions; provider capture decides child and nested-project identity', () => {
    expect(validateLocalArchitect(over('shop/orders', { scope: { base: { module: 'shop/orders', included: [
      { directory: 'subs/orders/subs/physical', reason: 'Implement the whole child', instructions: 'Verify it at its root' },
    ] }, extra: [], read: [], rationale: 'r' } }), evidence).ok).toBe(true);
    expect(validateLocalArchitect(over('shop/orders', { scope: { base: { module: 'shop/orders', included: [
      { directory: 'subs/orders/../bad', reason: 'r', instructions: 'i' },
    ] }, extra: [], read: [], rationale: 'r' } }), evidence).ok).toBe(false);
  });

  test('an extra location lies under a module, and a capability is one the registry holds', () => {
    const outside = validateLocalArchitect(over('shop/orders', {
      scope: { base: { module: 'shop/orders', included: [] }, extra: [{ path: '../elsewhere/contract.ts', purpose: 'contract' }], read: [], rationale: 'r' },
    }), evidence);
    expect(outside.ok).toBe(false);
    if (outside.ok) return;
    expect(outside.errors[0]!.path).toBe('assignment.scope.extra.0.path');

    const unknown = validateLocalArchitect(over('shop/orders', {
      externalCapabilities: [{ capability: 'send-post', owner: 'shop', role: 'use' }],
    }), evidence);
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.errors[0]!.path).toBe('assignment.externalCapabilities.0.capability');

    const misplaced = validateLocalArchitect(over('shop/orders', {
      externalCapabilities: [{ capability: 'send-email', owner: 'shop', role: 'use' }],
    }), evidence);
    expect(misplaced.ok).toBe(false);
    if (misplaced.ok) return;
    expect(misplaced.errors[0]!.path).toBe('assignment.externalCapabilities.0.owner');
  });

  test('the stage is one the outline in force names', () => {
    // An outline with no stage is worked as stage 0 and nothing else.
    const beyond = validateLocalArchitect(over('shop/orders', { stage: 1 }), evidence);
    expect(beyond.ok).toBe(false);
    if (beyond.ok) return;
    expect(beyond.errors[0]!.path).toBe('assignment.stage');

    // A staged outline the same submission carries is the one in force.
    const staged = {
      decomposition: { kind: 'staged' as const, rationale: 'It is big.' },
      breakingChanges: [],
      stages: [
        { title: 'One', approach: 'non-breaking' as const, dependsOn: [], note: '' },
        { title: 'Two', approach: 'non-breaking' as const, dependsOn: [0], note: '' },
      ],
    };
    expect(validateLocalArchitect(assign('shop/orders', { stage: 1 } as never, outline(staged)), evidence).ok).toBe(true);
    // And one the harness already committed, where the submission carries none.
    expect(validateLocalArchitect(assign('shop/orders', { stage: 1 } as never), { ...evidence, outline: staged }).ok).toBe(true);
  });

  test('an assignment carries no gate, no test selection and no guarded hashes', () => {
    const withGate = validateLocalArchitect(assign('shop/orders', {
      gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [], subtrees: [], extraSuites: [] } },
    } as never, outline()), evidence);
    expect(withGate.ok).toBe(false);
  });
});

describe('extra locations: module contents, paths outside modules and guarded files', () => {
  /** An assignment over shop/orders with the extra locations given, and an outline revision where it authorizes anything. */
  const withExtra = (extra: unknown[], authorizations?: Array<{ path: string; rationale: string }>, kind: 'ordinary' | 'contract' = 'ordinary') => assign('shop/orders', {
    kind,
    scope: { base: { module: 'shop/orders', included: [] }, extra: extra as never, read: [], rationale: 'r' },
    ...(authorizations === undefined ? {} : { authorizations }),
  }, outline());
  const errorsOf = (result: ReturnType<typeof validateLocalArchitect>) => (result.ok ? [] : result.errors);
  const reason = 'The plan requires the report script to print the same block as the CLI.';

  test('removed outside-modules authority is refused, while narrow ordinary and bootstrap extras remain', () => {
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'scripts/report.ts', purpose: 'outside-modules', reason }]), evidence)).length).toBeGreaterThan(0);
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'src/interfaces/orders.ts', purpose: 'contract', kind: 'file' },
      { path: 'subs/orders/module.ramify', purpose: 'exposure-declaration' }]), evidence))).toEqual([]);
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'subs/orders/src/fakes', purpose: 'fake', kind: 'directory' }]), evidence)).map(error => error.path)).toEqual(['assignment.scope.extra.0.kind']);
    const proposing = new Map(registry); proposing.set('note-store', { ...registered, capability: 'note-store', owner: 'shop/billing',
      proposed: { parent: 'shop', directory: 'subs/physical-billing/', purpose: 'Holds the note.', tags: [] } });
    expect(errorsOf(validateLocalArchitect(assign('shop/billing', { scope: { base: { module: 'shop/billing', included: [] },
      extra: [{ path: 'subs/physical-billing/scripts/x.ts', purpose: 'consumer' }], read: [], rationale: 'r' } }, outline()), { index, registry: proposing }))).toEqual([]);
  });

  test('the harness\'s own files are never an extra location', () => {
    const harnessOnly = new Set(['ramify-agent.json', 'subs/orders/src/tests/features/notes.feature']);
    for (const entry of [
      { path: 'ramify-agent.json', purpose: 'consumer' },
      { path: 'subs/orders/src/tests/features/notes.feature', purpose: 'consumer' },
    ]) {
      const errors = errorsOf(validateLocalArchitect(withExtra([entry]), { ...evidence, harnessOnly }));
      expect(errors.map(error => error.path)).toEqual(['assignment.scope.extra.0.path']);
      expect(errors[0]!.message).toContain('written by the harness alone');
    }
  });

  test('H5: a guarded file named as an extra location needs an authorization, a directory for every guarded file it holds', () => {
    const fake = 'subs/orders/src/fakes/orders.fake.ts';
    const conformance = 'subs/orders/src/tests/orders.conformance.test.ts';
    const guarded = { ...evidence, guardedPaths: new Set(['package.json', 'vitest.config.ts', fake, conformance]) };
    const extras = [{ path: fake, purpose: 'fake' }, { path: conformance, purpose: 'conformance' }];

    // The run's i06: the two contract artifacts in scope and no authorization.
    const unauthorized = errorsOf(validateLocalArchitect(withExtra(extras), guarded));
    expect(unauthorized.map(error => error.path)).toEqual(['assignment.scope.extra.0.path', 'assignment.scope.extra.1.path']);
    expect(unauthorized[0]!.message).toContain('passes the gate only with an authorization recorded by an outline revision');
    expect(unauthorized[0]!.expected).toContain('"assignment.authorizations"');

    // The run's i07: each authorized, with the outline revision that records it.
    const authorizations = [{ path: fake, rationale: 'The fake infers the wrong evidence.' }, { path: conformance, rationale: 'The suite must catch it.' }];
    expect(errorsOf(validateLocalArchitect(withExtra(extras, authorizations), guarded))).toEqual([]);

    // Guarded configuration outside modules is no different.
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'package.json', purpose: 'consumer' }]), guarded)).map(error => error.path))
      .toEqual(['assignment.scope.extra.0.path']);
    expect(errorsOf(validateLocalArchitect(
      withExtra([{ path: 'package.json', purpose: 'consumer' }], [{ path: 'package.json', rationale: 'The script is registered.' }]), guarded,
    ))).toEqual([]);

    // A contract iteration's authorizations are the harness's own.
    expect(errorsOf(validateLocalArchitect(withExtra(extras, undefined, 'contract'), { ...guarded, contracts: new Set(['ct-001']) })).map(error => error.path))
      .not.toContain('assignment.scope.extra.0.path');
  });
});

describe('PB3-D01 PB3-D02 PB3-D04: registrations and reports', () => {
  const completing = (extra: Record<string, unknown>) => ({ ...requestCompletion(), ...extra });
  const errorsOf = (result: ReturnType<typeof validateLocalArchitect>) => (result.ok ? [] : result.errors);
  const judged = (extra: Record<string, unknown>, context = localContext()) =>
    errorsOf(validateLocalArchitect(completing(extra), { ...evidence, obligations: context }));

  test('outcome-only tracking needs no registration, and a separate required test is registered only by explicit choice', () => {
    // The default: the scenarios the analysis accepted and the delegated outcome are already obligations.
    expect([...localContext().projection.obligations.keys()]).toEqual(['sc-001', 'sc-002', 'sc-003', 'cap-001']);
    expect(localContext().projection.tests).toBe(0);
    expect(judged({})).toEqual([]);
    // A separate test is the architect's explicit choice, numbered by the harness.
    expect(judged({ registrations: [{ kind: 'test', description: 'The duplicate send regression test' }] })).toEqual([]);
    // A capability case belongs to its task's architect, and an agent never supplies a test ID.
    expect(judged({ registrations: [{ kind: 'scenario', case: 'need-001.ex01' }] }).map(error => error.path)).toEqual(['registrations.0.kind']);
    expect(judged({ registrations: [{ kind: 'test', id: 'test-007', description: 'Named by the agent' }] }).map(error => error.path)).toEqual(['registrations.0']);
    // The same test twice, in one submission or after an accepted registration, is a conflicting repeat.
    const twice = [{ kind: 'test', description: 'The regression test' }, { kind: 'test', description: 'The regression test' }];
    expect(judged({ registrations: twice }).map(error => error.path)).toEqual(['registrations.1.description']);
    const existing = registeredEvent({ id: 'test-001', kind: 'test', responsible: { kind: 'work-item', id: 'wi-001' }, by: 'inv-0003',
      submission: submissionHash('a'), description: 'The regression test' });
    expect(judged({ registrations: [twice[0]] }, localContext([existing]))[0]!.message).toBe('This test is already registered as test-001');
    // Another architect's test of the same description is its own.
    expect(judged({ registrations: [twice[0]] }, localContext([existing], 'wi-002'))).toEqual([]);
  });

  test('only the responsible architect reports, on IDs that exist, at the current revision, and "bound" only revises a "done"', () => {
    const errors = judged({ reports: [
      { id: 'sc-404', judgment: 'done', basedOnRevision: 0 },
      { id: 'sc-002', judgment: 'done', basedOnRevision: 0 },
      { id: 'sc-003', judgment: 'done', basedOnRevision: 0 },
      { id: 'cap-001', judgment: 'done', basedOnRevision: 0 },
      { id: 'sc-001', judgment: 'bound', basedOnRevision: 0 },
    ] });
    expect(errors.map(error => [error.path, error.message])).toEqual([
      ['reports.0.id', '"sc-404" is no registered obligation of this run'],
      ['reports.1.id', 'sc-002 is reported by the local architect of wi-002, not by the local architect of wi-001'],
      ['reports.2.id', 'sc-003 is reported by the local architect of sc-003\'s integration work item, which does not exist yet, not by the local architect of wi-001'],
      ['reports.3.id', 'cap-001 is reported by the capability architect of cap-001, not by the local architect of wi-001'],
      ['reports.4.judgment', 'sc-001 is pending; "bound" only revises an earlier "done" report'],
    ]);
    // A duplicate in one submission, and a report based on a superseded revision, are refused.
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }, { id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] })
      .map(error => error.path)).toEqual(['reports.1.id']);
    const done = reported({ id: 'sc-001', judgment: 'done', basedOnRevision: 0, revision: 1, by: 'inv-0003', submission: submissionHash('a') });
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] }, localContext([done]))[0]!.path).toBe('reports.0.basedOnRevision');
    // A distinct deliberate report names the current revision: a changed hint, or a revision back to bound.
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 1, where: 'subs/a/src/send.ts — sendOnce' }] }, localContext([done]))).toEqual([]);
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'bound', basedOnRevision: 1 }] }, localContext([done]))).toEqual([]);
    // Without the run's obligations nothing can be reported.
    expect(errorsOf(validateLocalArchitect(completing({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] }), evidence))
      .map(error => error.path)).toEqual(['reports']);
  });

  test('a registered test is reported in the submission that registers it; where is optional text, never a path the harness checks', () => {
    expect(judged({
      registrations: [{ kind: 'test', description: 'The duplicate send regression test' }],
      reports: [{ id: 'test-001', judgment: 'done', basedOnRevision: 0 }, { id: 'sc-001', judgment: 'done', basedOnRevision: 0, where: 'subs/never/src/absent.ts — noSuchSymbol' }],
    })).toEqual([]);
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0, where: '   ' }] }).map(error => error.path)).toEqual(['reports.0.where']);
    expect(judged({ reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0, where: 'x'.repeat(301) }] }).map(error => error.path)).toEqual(['reports.0.where']);
  });

  test('reports ride on an ongoing assignment, a placement request and an unresolved request alike', () => {
    const report = { reports: [{ id: 'sc-001', judgment: 'done', basedOnRevision: 0 }] };
    const context = { ...evidence, obligations: localContext() };
    expect(validateLocalArchitect({ ...assign('shop/orders', {}, outline()), ...report }, context).ok).toBe(true);
    expect(validateLocalArchitect({ ...unresolved(), ...report }, context).ok).toBe(true);
    // An invalid report refuses the whole submission, with the action's own errors beside it.
    const both = errorsOf(validateLocalArchitect({ ...assign('shop/orders'), reports: [{ id: 'sc-404', judgment: 'done', basedOnRevision: 0 }] }, context));
    expect(both.map(error => error.path)).toEqual(['outline', 'reports.0.id']);
  });
});

describe('a rejected submission in a run', () => {
  const reviews = 'collection-review/workspace/reviews';

  async function run(inputs: readonly unknown[], unchangedCheckpoints: ReadonlyArray<string | GitCheckpoint> = []) {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const submitted = analysis([entry('reviewer-note', reviews)]);
    const { service, agent } = await openRuns(fixture.root, {
      unchangedCheckpoints,
      script: (spec: SessionSpec) => (spec.role === 'catalog-extractor' ? [] : spec.role === 'initial-architect'
        ? [{ kind: 'submit' as const, input: submitted }]
        : inputs.map(input => ({ kind: 'submit' as const, input }))),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    return { root: fixture.root, runId: receipt.jobId, service, agent };
  }

  test('PB3-D01 PB3-D02 PB3-D04: an invalid report is refused before any effect; the accepted one records the test, the judgments and the where text as written', async () => {
    const missing = 'subs/nowhere/src/missing.ts — notThere';
    const refused = { ...requestCompletion(), reports: [
      { id: 'sc-404', judgment: 'done', basedOnRevision: 0 },
      { id: 'sc-001', judgment: 'bound', basedOnRevision: 0 },
    ] };
    const corrected = { ...requestCompletion(),
      registrations: [{ kind: 'test', description: 'Writing a note twice keeps one note' }],
      reports: [
        { id: 'sc-001', judgment: 'done', basedOnRevision: 0, where: missing },
        { id: 'test-001', judgment: 'done', basedOnRevision: 0 },
      ] };
    const { root, runId, service, agent } = await run([refused, corrected],
      [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"']);

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    // The briefing names what this architect reports on, apart from engineer and audit results.
    expect(local.spec.prompt).toContain('# Registered obligations');
    expect(local.spec.prompt).toContain('- sc-001 (scenario): pending, revision 0; no report yet');
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string }> };
    expect(answer.errors.map(error => error.path)).toEqual(['reports.0.id', 'reports.1.judgment']);
    expect(answer.errors[0]!.message).toBe('"sc-404" is no registered obligation of this run');
    expect(local.verdicts[1]).toEqual({ accepted: true });

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const architect = events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect').at(-1)!.data as { invocation: string };
    const ended = events.find(event => event.type === 'invocation-ended' && event.data.invocation === architect.invocation)!.data as { submission: string };
    const recorded = events.filter(event => event.type === 'obligation-registered' || event.type === 'obligation-reported');
    expect(recorded.map(event => [event.type, event.data])).toEqual([
      ['obligation-registered', { id: 'test-001', kind: 'test', responsible: { kind: 'work-item', id: 'wi-001' }, by: architect.invocation,
        submission: ended.submission, description: 'Writing a note twice keeps one note' }],
      ['obligation-reported', { id: 'sc-001', judgment: 'done', basedOnRevision: 0, revision: 1, where: missing, by: architect.invocation, submission: ended.submission }],
      ['obligation-reported', { id: 'test-001', judgment: 'done', basedOnRevision: 0, revision: 1, by: architect.invocation, submission: ended.submission }],
    ]);
    // Recorded before the completion's outline and its gate: reports apply with the accepted submission.
    const completion = events.findIndex(event => event.type === 'outline-revised');
    expect(completion).toBeGreaterThan(0);
    expect(events.findIndex(event => event.type === 'obligation-reported')).toBeLessThan(completion);
    // The hint names a path that does not exist; it is kept as written and decides nothing.
    expect(existsSync(join(root, 'subs/nowhere'))).toBe(false);

    // Reopened from disk, the projection folds the same facts; the scenario's gate state is a separate fact.
    const log = await RunLog.open(runPath(root, 'review-notes', runId, runLayout.events), runId);
    const lines = log.ledger.replay();
    const tracked = trackedScenarios(lines);
    const projection = obligationsOf({ scenarios: tracked.records, workItems: committedRecords(lines).workItems, events: log.events });
    expect([...projection.obligations.values()].map(one => [one.id, one.status, one.revision, one.report?.where ?? null])).toEqual([
      ['sc-001', 'done', 1, missing], ['test-001', 'done', 1, null],
    ]);
    expect(tracked.states.get('sc-001')).not.toBe('done');
  }, 300_000);

  test('a broken schema returns every error to the same session, and a corrected input is accepted', async () => {
    const { root, runId, service, agent } = await run(
      [{ kind: 'request-completion', summary: 'done' }, requestCompletion()],
      [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"'],
    );

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    expect(local.verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string }>; remainingAttempts: number };
    expect(answer.errors[0]!.path).toBe('outline');
    expect(answer.remainingAttempts).toBe(2);
    expect(local.verdicts[1]).toEqual({ accepted: true });

    // Nothing was written for the input that failed: one outline, at revision 1.
    expect(existsSync(runPath(root, 'review-notes', runId, workLayout.outline('wi-001', 2)))).toBe(false);
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const organizing = events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect').at(-1)!;
    const observations = await readFile(runPath(root, 'review-notes', runId, runLayout.observations((organizing.data as { invocation: string }).invocation)), 'utf8');
    const rejections = observations.split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { type: string; data: { target?: string; errors?: unknown[] } })
      .filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.data.target).toBe(localArchitectToolName);
  }, 300_000);

  test('an assignment citing an ID outside its work-item package is rejected at submission, with the path of the ID', async () => {
    // The trial's sentence-as-heading citation, and an element of the catalog outside this work item's package.
    const outside = assign(reviews, { citedElements: ['fr-001', 'Every note is kept', 'nfr-009'] }, outline());
    const { service, agent } = await run([outside, requestCompletion()],
      [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"']);

    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    expect(local.verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string }> };
    expect(answer.errors.map(error => error.path)).toEqual(['assignment.citedElements.1', 'assignment.citedElements.2']);
    expect(answer.errors[0]!.message).toBe('"Every note is kept" is not an element of this work item\'s package');
    expect(local.verdicts[1]).toEqual({ accepted: true });
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    expect(agent!.sessions.some(session => session.spec.role === 'engineer')).toBe(false);
  }, 300_000);

  test('a rule the schema cannot hold is answered the same way, and the bound ends the invocation', async () => {
    const broken = requestCompletion({ decomposition: { kind: 'staged', rationale: 'It is big.' }, stages: [] });
    const { root, runId, service, agent } = await run([broken, broken, broken, broken], [scenariosCommit('review-notes')]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');

    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    expect(local.verdicts).toHaveLength(3);
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string }> };
    expect(answer.errors[0]!.path).toBe('outline.stages');
    expect(local.verdicts.at(-1)).toMatchObject({ accepted: false, final: true });

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const organizing = events.filter(event => event.type === 'invocation-started' && event.data.role === 'local-architect').at(-1)!;
    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome((organizing.data as { invocation: string }).invocation)), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'invalid-submission', rejectedSubmissions: 3, submission: null });
    expect(events.some(event => event.type === 'outline-revised')).toBe(false);
    expect(events.some(event => event.type === 'gate-attempted')).toBe(false);
  }, 300_000);

  test('a first assignment without an outline is rejected before scheduling and can be corrected in the same session', async () => {
    const { root, runId, service, agent } = await run(
      [assign(reviews), requestCompletion()],
      [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"'],
    );

    const local = agent!.sessions.find(session => session.spec.submission.name === localArchitectToolName)!;
    expect(local.verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((local.verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as {
      errors: Array<{ path: string; message: string }>;
    };
    expect(answer.errors).toEqual([expect.objectContaining({ path: 'outline' })]);
    expect(local.verdicts[1]).toEqual({ accepted: true });
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.some(event => event.type === 'iteration-assigned')).toBe(false);
    expect(events.some(event => event.type === 'job-failed')).toBe(false);
  }, 300_000);
});
