import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit, type GitCheckpoint } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

  test('an included child is a direct child, never a descendant', () => {
    const deeper = architectIndex([
      moduleEntry('shop', '', null),
      moduleEntry('shop/orders', 'subs/orders', 'shop'),
      moduleEntry('shop/orders/pricing', 'subs/orders/subs/pricing', 'shop/orders'),
    ]);
    const deepEvidence = { index: { ...index, modules: deeper.modules }, registry };

    expect(validateLocalArchitect(over('shop/orders', {
      scope: { base: { module: 'shop/orders', includedChildren: ['shop/orders/pricing'] }, extra: [], read: [], rationale: 'r' },
    }), deepEvidence).ok).toBe(true);

    // A grandchild is selected through its parent's subtree, never on its own.
    const grandchild = validateLocalArchitect(over('shop', {
      scope: { base: { module: 'shop', includedChildren: ['shop/orders/pricing'] }, extra: [], read: [], rationale: 'r' },
    }), deepEvidence);
    expect(grandchild.ok).toBe(false);
    if (grandchild.ok) return;
    expect(grandchild.errors[0]!.path).toBe('assignment.scope.base.includedChildren.0');
    expect(grandchild.errors[0]!.message).toContain('never through a descendant');
  });

  test('an extra location lies under a module, and a capability is one the registry holds', () => {
    const outside = validateLocalArchitect(over('shop/orders', {
      scope: { base: { module: 'shop/orders', includedChildren: [] }, extra: [{ path: '../elsewhere/contract.ts', purpose: 'contract' }], read: [], rationale: 'r' },
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
    scope: { base: { module: 'shop/orders', includedChildren: [] }, extra: extra as never, read: [], rationale: 'r' },
    ...(authorizations === undefined ? {} : { authorizations }),
  }, outline());
  const errorsOf = (result: ReturnType<typeof validateLocalArchitect>) => (result.ok ? [] : result.errors);
  const reason = 'The plan requires the report script to print the same block as the CLI.';

  test('a file outside every module is accepted as outside-modules with a reason, including one beside a module\'s own contents', () => {
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'scripts/reference-harness/report.ts', purpose: 'outside-modules', reason }]), evidence))).toEqual([]);
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'subs/orders/scripts/foo.ts', purpose: 'outside-modules', reason }]), evidence))).toEqual([]);
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'scripts/generated', purpose: 'outside-modules', kind: 'directory', reason }]), evidence))).toEqual([]);
  });

  test('an outside-modules location needs a reason', () => {
    for (const entry of [{ path: 'scripts/report.ts', purpose: 'outside-modules' }, { path: 'scripts/report.ts', purpose: 'outside-modules', reason: '  ' }]) {
      expect(errorsOf(validateLocalArchitect(withExtra([entry]), evidence)).map(error => error.path)).toEqual(['assignment.scope.extra.0.reason']);
    }
  });

  test('outside-modules never reaches a module\'s own contents, the root\'s included, nor a directory that holds them', () => {
    for (const path of ['src/main.ts', 'module.ramify', 'README.md', 'subs/orders/src/order.ts', 'subs/orders/module.ramify']) {
      const errors = errorsOf(validateLocalArchitect(withExtra([{ path, purpose: 'outside-modules', reason }]), evidence));
      expect(`${path}: ${errors.map(error => error.path).join()}`).toBe(`${path}: assignment.scope.extra.0.path`);
      expect(errors[0]!.message).toContain('own contents of');
    }
    const holding = errorsOf(validateLocalArchitect(withExtra([{ path: 'subs', purpose: 'outside-modules', kind: 'directory', reason }]), evidence));
    expect(holding.map(error => error.path)).toEqual(['assignment.scope.extra.0.path']);
    expect(holding[0]!.message).toContain('holds the own contents of "shop/orders"');
    // The project root is not a path an extra location names.
    for (const path of ['.', './']) {
      expect(errorsOf(validateLocalArchitect(withExtra([{ path, purpose: 'outside-modules', kind: 'directory', reason }]), evidence))[0]!.message)
        .toContain('is not a project-relative path');
    }
  });

  test('every other purpose needs a module\'s own contents, and the refusal suggests outside-modules', () => {
    expect(errorsOf(validateLocalArchitect(withExtra([
      { path: 'src/interfaces/orders.ts', purpose: 'contract' },
      { path: 'subs/orders/module.ramify', purpose: 'exposure-declaration' },
    ]), evidence))).toEqual([]);
    for (const path of ['scripts/reference-harness/report.ts', 'subs/orders/scripts/foo.ts', 'docs/notes.md']) {
      const errors = errorsOf(validateLocalArchitect(withExtra([{ path, purpose: 'consumer' }]), evidence));
      expect(errors.map(error => error.path)).toEqual(['assignment.scope.extra.0.path']);
      expect(errors[0]!.expected).toContain('"outside-modules"');
    }
    // Only outside-modules names a directory.
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'subs/orders/src/fakes', purpose: 'fake', kind: 'directory' }]), evidence)).map(error => error.path))
      .toEqual(['assignment.scope.extra.0.kind']);
  });

  test('a module an accepted proposal creates counts by its own contents', () => {
    const proposing = new Map(registry);
    proposing.set('note-store', {
      ...registered, capability: 'note-store', owner: 'shop/billing',
      proposed: { parent: 'shop', directory: 'subs/billing/', purpose: 'Holds the note.', tags: [] },
    });
    const creating = (extra: unknown[]) => assign('shop/billing', {
      scope: { base: { module: 'shop/billing', includedChildren: [] }, extra: extra as never, read: [], rationale: 'r' },
    }, outline());
    expect(errorsOf(validateLocalArchitect(creating([{ path: 'subs/billing/src/notes.ts', purpose: 'consumer' }]), { index, registry: proposing }))).toEqual([]);
    expect(errorsOf(validateLocalArchitect(creating([{ path: 'subs/billing/scripts/x.ts', purpose: 'consumer' }]), { index, registry: proposing })).map(error => error.path))
      .toEqual(['assignment.scope.extra.0.path']);
    expect(errorsOf(validateLocalArchitect(creating([{ path: 'subs/billing/src/notes.ts', purpose: 'outside-modules', reason }]), { index, registry: proposing })).map(error => error.path))
      .toEqual(['assignment.scope.extra.0.path']);
  });

  test('the plans, the run\'s state and the repository\'s metadata are never an extra location', () => {
    for (const path of ['plans/review-notes/plan.md', 'plans/review-notes/.harness', '.git/hooks/pre-commit']) {
      const errors = errorsOf(validateLocalArchitect(withExtra([{ path, purpose: 'outside-modules', kind: 'directory', reason }]), evidence));
      expect(`${path}: ${errors.map(error => error.path).join()}`).toBe(`${path}: assignment.scope.extra.0.path`);
    }
  });

  test('the harness\'s own files are never an extra location', () => {
    const harnessOnly = new Set(['ramify-agent.json', 'subs/orders/src/tests/features/notes.feature']);
    for (const entry of [
      { path: 'ramify-agent.json', purpose: 'outside-modules', reason },
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
    expect(errorsOf(validateLocalArchitect(withExtra([{ path: 'package.json', purpose: 'outside-modules', reason }]), guarded)).map(error => error.path))
      .toEqual(['assignment.scope.extra.0.path']);
    expect(errorsOf(validateLocalArchitect(
      withExtra([{ path: 'package.json', purpose: 'outside-modules', reason }], [{ path: 'package.json', rationale: 'The script is registered.' }]), guarded,
    ))).toEqual([]);

    // A directory holding a guarded file needs its authorization too.
    const holding = { ...evidence, guardedPaths: new Set(['scripts/tsconfig.json']) };
    const directory = errorsOf(validateLocalArchitect(withExtra([{ path: 'scripts', purpose: 'outside-modules', kind: 'directory', reason }]), holding));
    expect(directory.map(error => error.path)).toEqual(['assignment.scope.extra.0.path']);
    expect(directory[0]!.message).toContain('"scripts/tsconfig.json"');

    // A contract iteration's authorizations are the harness's own.
    expect(errorsOf(validateLocalArchitect(withExtra(extras, undefined, 'contract'), { ...guarded, contracts: new Set(['ct-001']) })).map(error => error.path))
      .not.toContain('assignment.scope.extra.0.path');
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
      script: (spec: SessionSpec) => (spec.role === 'initial-architect'
        ? [{ kind: 'submit' as const, input: submitted }]
        : inputs.map(input => ({ kind: 'submit' as const, input }))),
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    return { root: fixture.root, runId: receipt.jobId, service, agent };
  }

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
});
