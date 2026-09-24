import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { architectIndex, moduleEntry } from './helpers/views.js';
import { describePlan, initialAnalysisJsonSchema, initialAnalysisToolName, validateInitialAnalysis } from '../analysis/submission.js';
import { extensionIsANewForecast } from '../analysis/records.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { architectScenario } from './helpers/analysis.js';

/*
 * Everything the initial architect tells the harness is validated JSON: the
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

/** A small project, as the architect view records it. */
const index: ArchitectIndex = {
  revision: 'rev/1:x:1',
  input: 'input/1:abc',
  modules: architectIndex([moduleEntry('shop', '', null), moduleEntry('shop/orders', 'subs/orders', 'shop')]).modules,
  symbols: new Map([['shop/orders', [{ module: 'shop/orders', name: 'price', file: 'subs/orders/src/price.ts' }]]]),
};

/** The captured plan every rule below is checked against. */
const plan = describePlan(['# A plan', '', 'Intro.', '', '## Request', '', 'Do the thing.', '', '## Acceptance', '', 'It is done.'].join('\n'));

/** One hypothesis of a submission, which creates nothing. */
function forecast(extra: Record<string, unknown> = {}) {
  return {
    id: 'email-delivery',
    capability: 'send-email',
    change: 'reuse',
    changesExistingSymbols: false,
    suggestedOwner: 'shop/orders',
    anticipatedConsumers: [],
    involvedModules: [],
    dependsOn: [],
    confidence: 'medium',
    rationale: 'Orders already sends confirmations.',
    assumptions: [],
    uncertainties: [],
    citations: [{ module: 'shop/orders' }],
    ...extra,
  };
}

/** A submission of these entries, each with the one architect scenario the form rules require of it. */
function submission(entries: ReadonlyArray<ReturnType<typeof entry>>, hypotheses: readonly unknown[] = []) {
  return {
    entries: [...entries],
    hypotheses: [...hypotheses],
    coverageLimits: [],
    scenarios: entries.map(one => architectScenario(one as unknown as Parameters<typeof architectScenario>[0])),
    integrationScenarios: [],
  };
}

function entry(capability: string, extra: Record<string, unknown> = {}) {
  return {
    capability,
    description: 'The page sends the customer an email.',
    owner: 'shop/orders',
    requirementRefs: [{ anchor: 'Request' }],
    acceptanceRefs: [{ anchor: 'Acceptance' }],
    citations: [{ module: 'shop/orders' }],
    ...extra,
  };
}

describe('the schema', () => {
  test('rejects an input whose shape is wrong, with a path for every error', () => {
    const result = validateInitialAnalysis({ entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] }, { index });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('entries');
    expect(result.errors[0]!.expected).toBe('array');
  });

  test('rejects an unknown field, and a slug that is not kebab-case', () => {
    const unknown = validateInitialAnalysis({ ...submission([]), notes: 'x' }, { index });
    expect(unknown.ok).toBe(false);

    const slug = validateInitialAnalysis(submission([entry('Send Email')]), { index });
    expect(slug.ok).toBe(false);
    if (slug.ok) return;
    expect(slug.errors[0]!.path).toBe('entries.0.capability');
    expect(slug.errors[0]!.message).toContain('kebab-case');
  });

  test('a forecast extension submitted as the retired "extend" change is refused, and told to forecast a new capability', () => {
    const extended = validateInitialAnalysis(submission([entry('send-email')], [forecast({ change: 'extend' })]), { index, plan });
    expect(extended.ok).toBe(false);
    if (extended.ok) return;
    expect(extended.errors.map(error => error.path)).toEqual(['hypotheses.0.change']);
    expect(extended.errors[0]!.message).toBe(extensionIsANewForecast);
    expect(extended.errors[0]!.message).toContain('new capability named for itself');

    // The same forecast, as the model now states it.
    expect(validateInitialAnalysis(
      submission([entry('send-email')], [forecast({ capability: 'send-email-with-attachment', change: 'create', changesExistingSymbols: true })]),
      { index, plan },
    ).ok).toBe(true);
  });

  test('has no field for an ID the harness already knows', () => {
    const properties = (initialAnalysisJsonSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties).sort()).toEqual(['coverageLimits', 'entries', 'hypotheses', 'integrationScenarios', 'scenarios']);
    const hypothesis = JSON.stringify(properties['hypotheses']);
    for (const assigned of ['workItem', 'invocation', 'revision', 'standing', 'cause', 'schema']) {
      expect(hypothesis).not.toContain(`"${assigned}"`);
    }
    // A scenario is named by the architect's key; its sc-NNN is the harness's.
    const scenario = JSON.stringify(properties['scenarios']);
    for (const assigned of ['id', 'hash', 'owner', 'file', 'schema']) expect(scenario).not.toContain(`"${assigned}"`);
  });
});

describe('the rules the schema cannot hold', () => {
  test('a duplicate capability slug is refused, and nothing is accepted', () => {
    const result = validateInitialAnalysis(submission([entry('send-email'), entry('send-email')]), { index });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.1.capability');
    expect(result.errors[0]!.message).toContain('unique in the run');
  });

  test('an owner that is not in the view, and a proposal whose parent is not either', () => {
    const missing = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail' })]), { index });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors[0]!.path).toBe('entries.0.owner');

    const proposal = { parent: 'shop/nothing', directory: 'subs/nothing/subs/mail', purpose: 'Sends email.', tags: [] };
    const bad = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail', proposed: proposal })]), { index });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors[0]!.path).toBe('entries.0.proposed.parent');
  });

  test('a proposed module must be a direct child under its parent\'s subs/', () => {
    const wrong = { parent: 'shop/orders', directory: 'subs/orders/src/mail', purpose: 'Sends email.', tags: [] };
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: wrong })]), { index });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.expected).toBe('subs/orders/subs/<name>');

    const right = { parent: 'shop/orders', directory: 'subs/orders/subs/mail', purpose: 'Sends email.', tags: [] };
    expect(validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: right })]), { index }).ok).toBe(true);
  });

  test('a citation must name a module the view has', () => {
    const result = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/nothing' }] })]), { index });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.0.citations.0.module');
  });

  test('a cited symbol must be an exported original the cited module owns', () => {
    const known = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/orders', symbol: 'price' }] })]), { index, plan });
    expect(known.ok).toBe(true);

    const unknown = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/orders', symbol: 'discount' }] })]), { index, plan });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.errors[0]!.path).toBe('entries.0.citations.0.symbol');
    expect(unknown.errors[0]!.message).toContain('no exported "discount"');
  });

  test('every plan reference lies inside the captured plan', () => {
    const absent = validateInitialAnalysis(submission([entry('send-email', { requirementRefs: [{ anchor: 'Nowhere' }] })]), { index, plan });
    expect(absent.ok).toBe(false);
    if (absent.ok) return;
    expect(absent.errors[0]!.path).toBe('entries.0.requirementRefs.0.anchor');

    const beyond = validateInitialAnalysis(submission([entry('send-email', { acceptanceRefs: [{ lines: [1, 400] }] })]), { index, plan });
    expect(beyond.ok).toBe(false);
    if (beyond.ok) return;
    expect(beyond.errors[0]!.path).toBe('entries.0.acceptanceRefs.0.lines');
    expect(beyond.errors[0]!.message).toContain('11 lines');

    const inside = validateInitialAnalysis(submission([entry('send-email', { acceptanceRefs: [{ lines: [5, 7] }] })]), { index, plan });
    expect(inside.ok).toBe(true);

    const neither = validateInitialAnalysis(submission([entry('send-email', { requirementRefs: [{}] })]), { index, plan });
    expect(neither.ok).toBe(false);
    if (neither.ok) return;
    expect(neither.errors[0]!.expected).toBe('anchor or lines');
  });

  test('the owner, the directory and the declaration name must agree', () => {
    const disagreeing = { parent: 'shop/orders', directory: 'subs/orders/subs/post', purpose: 'Sends email.', tags: [] };
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: disagreeing })]), { index, plan });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.0.proposed.directory');
    expect(result.errors[0]!.expected).toBe('subs/orders/subs/mail');

    const elsewhere = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends email.', tags: [] };
    const wrongParent = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: elsewhere })]), { index, plan });
    expect(wrongParent.ok).toBe(false);
    if (wrongParent.ok) return;
    expect(wrongParent.errors.map(error => error.path)).toContain('entries.0.owner');
  });

  test('a directory a module already occupies, and two entries that define one directory differently', () => {
    const occupied = { parent: 'shop', directory: 'subs/orders', purpose: 'Sends email.', tags: [] };
    const taken = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders', proposed: occupied })]), { index, plan });
    // An owner the view already has cannot be proposed at all.
    expect(taken.ok).toBe(false);

    const clash = { parent: 'shop', directory: 'subs/orders', purpose: 'Sends email.', tags: [] };
    const conflicting = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail', proposed: { ...clash, directory: 'subs/orders' } })]), { index, plan });
    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.errors.map(error => error.message).join(' ')).toContain('already the directory of "shop/orders"');

    const one = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends email.', tags: [] };
    const two = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends letters.', tags: [] };
    const twice = validateInitialAnalysis(
      submission([entry('send-email', { owner: 'shop/mail', proposed: one }), entry('send-letter', { owner: 'shop/mail', proposed: two })]),
      { index, plan },
    );
    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.errors[0]!.path).toBe('entries.1.proposed');

    // The same definition twice is one proposal two capabilities reference.
    const shared = validateInitialAnalysis(
      submission([entry('send-email', { owner: 'shop/mail', proposed: one }), entry('send-letter', { owner: 'shop/mail', proposed: { ...one } })]),
      { index, plan },
    );
    expect(shared.ok).toBe(true);
  });

  test('a valid proposal with an existing parent is accepted', () => {
    const proposal = { parent: 'shop/orders', directory: 'subs/orders/subs/mail', purpose: 'Sends the customer an email.', tags: ['dispatch'] };
    expect(validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: proposal })]), { index, plan }).ok).toBe(true);
  });

  test('without a view the rules that need one are not applied, and no claim is accepted that was not checked', () => {
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/nowhere' })]), { index: null });
    expect(result.ok).toBe(true);
  });
});

describe('a rejected submission in a run', () => {
  async function run(inputs: unknown[], unchangedCheckpoints: readonly string[] = []) {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      const { service, agent } = await openRuns(fixture.root, {
        script: inputs.map(input => ({ kind: 'submit' as const, input })),
        unchangedCheckpoints,
      });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    return { root: fixture.root, runId: receipt.jobId, service, agent };
  }

  test('every error goes back to the same session, and a corrected input is accepted', async () => {
    const { root, runId, service, agent } = await run(
      [{ entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] }, emptyAnalysis()],
      ['final verification of plan "review-notes"'],
    );

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const verdicts = agent!.sessions[0]!.verdicts;
    expect(verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { accepted: boolean; errors: Array<{ path: string }>; remainingAttempts: number };
    expect(answer.accepted).toBe(false);
    expect(answer.errors[0]!.path).toBe('entries');
    expect(answer.remainingAttempts).toBe(2);
    expect((verdicts[0] as { errors: string[] }).errors[0]).toContain('Correct every error above and call the tool again.');
    expect(verdicts[1]).toEqual({ accepted: true });

    // Each rejection is an observation with its errors, and nothing was
    // written for the input that failed.
    const observations = await readFile(runPath(root, 'review-notes', runId, runLayout.observations('inv-0001')), 'utf8');
    const lines = observations.split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { target?: string; errors?: unknown[] } });
    const rejections = lines.filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.data.target).toBe(initialAnalysisToolName);
    expect(rejections[0]!.data.errors).toEqual([{ path: 'entries', message: expect.any(String) }]);

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome.rejectedSubmissions).toBe(1);
    expect(outcome.ended).toBe('submitted');
  }, 180_000);

  test('the bound ends the invocation as invalid-submission, and the run with it', async () => {
    const broken = { entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] };
    const { root, runId, service, agent } = await run([broken, broken, broken, broken]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');

    const verdicts = agent!.sessions[0]!.verdicts;
    expect(verdicts).toHaveLength(3);
    expect(verdicts.at(-1)).toMatchObject({ accepted: false, final: true });
    expect((verdicts.at(-1) as { errors: string[] }).errors[0]).toContain('No further attempts are accepted');

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'invalid-submission', rejectedSubmissions: 3, submission: null });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.map(event => event.type)).toEqual(['job-started', 'session-opened', 'invocation-started', 'invocation-ended', 'job-failed']);
  }, 180_000);

  test('a duplicate capability slug is rejected, and three of them end the invocation', async () => {
    const duplicate = {
      entries: [
        { capability: 'reviewer-note', description: 'A note.', owner: 'collection-review', requirementRefs: [], acceptanceRefs: [], citations: [] },
        { capability: 'reviewer-note', description: 'The same slug again.', owner: 'collection-review', requirementRefs: [], acceptanceRefs: [], citations: [] },
      ],
      hypotheses: [],
      coverageLimits: [],
      scenarios: [],
      integrationScenarios: [],
    };
    const { root, runId, service, agent } = await run([duplicate, duplicate, duplicate]);

    const verdicts = agent!.sessions[0]!.verdicts;
    expect(verdicts).toHaveLength(3);
    const first = JSON.parse((verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string }> };
    expect(first.errors[0]!.path).toBe('entries.1.capability');
    expect(first.errors[0]!.message).toContain('unique in the run');
    expect(verdicts.at(-1)).toMatchObject({ accepted: false, final: true });

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');
    // Nothing was derived from an analysis that was never accepted.
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    expect(events.some(event => event.type === 'analysis-accepted')).toBe(false);
    expect(events.some(event => event.type === 'work-item-started')).toBe(false);
  }, 180_000);

  test('an input the implementation rejected before the tool ran counts toward the same bound', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
      const { service, agent } = await openRuns(fixture.root, {
      script: [
        { kind: 'tool', tool: initialAnalysisToolName, input: { entries: 7 }, reachedTool: false },
        { kind: 'submit', input: emptyAnalysis() },
      ],
      unchangedCheckpoints: ['final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const observations = await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0001')), 'utf8');
    const rejections = observations.split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { type: string; data: { target?: string; attempt?: number } })
      .filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.data).toMatchObject({ target: initialAnalysisToolName, attempt: 1 });
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    void agent;
  }, 180_000);
});

describe('the prompt package', () => {
  test('offers exactly the submission members this iteration produces', async () => {
    const { manifest } = await loadPromptPackages();
    expect(Object.keys(manifest.packages).sort()).toEqual(['contract-engineer', 'engineer', 'global-fork', 'initial-architect', 'local-architect', 'reviewer']);
    const initial = manifest.packages['initial-architect']!;
    expect(initial.package).toBe('initial-architect/2');
    expect(initial.submissionKinds).toEqual(['initial-analysis']);
    expect(initial.files.map(file => file.kind).sort()).toEqual(expect.arrayContaining(['procedure', 'skill', 'submission-schema', 'system']));
    expect(initial.hash).toMatch(/^[0-9a-f]{64}$/);

    // Each role is offered exactly the members a run of this iteration
    // produces, and no other.
    const local = manifest.packages['local-architect']!;
    expect(local.package).toBe('local-architect/2');
    expect(local.submissionKinds).toEqual(['assign', 'request-placement', 'request-completion', 'yield-for-providers', 'unresolved']);

    const fork = manifest.packages['global-fork']!;
    expect(fork.package).toBe('global-fork/1');
    expect(fork.submissionKinds).toEqual(['decision', 'partial']);
    expect(fork.hash).toMatch(/^[0-9a-f]{64}$/);

    const engineer = manifest.packages['engineer']!;
    expect(engineer.package).toBe('engineer/2');
    expect(engineer.submissionKinds).toEqual(['completion-proposed', 'partial', 'unsuitable', 'contract-needed']);
    expect(engineer.hash).toMatch(/^[0-9a-f]{64}$/);

    // The contract sub-session is an engineer invocation with the contract
    // skill, and the skill is a file of its package like any other.
    const contract = manifest.packages['contract-engineer']!;
    expect(contract.package).toBe('contract-engineer/1');
    expect(contract.submissionKinds).toEqual(['established', 'incomplete']);
    expect(contract.files.some(file => file.kind === 'skill' && file.path.endsWith('contract.skill.md'))).toBe(true);
    expect(contract.hash).toMatch(/^[0-9a-f]{64}$/);

    // A reviewer submits its review; a design orientation submits what it
    // read. One procedure per question, each a file the hash covers.
    const reviewer = manifest.packages['reviewer']!;
    expect(reviewer.package).toBe('reviewer/3');
    expect(reviewer.submissionKinds).toEqual(['review', 'orientation']);
    const procedures = reviewer.files.filter(file => file.kind === 'procedure').map(file => file.path.split('/').at(-1)).sort();
    expect(procedures).toEqual(['code-review.procedure.md', 'design-review.procedure.md', 'scope-review.procedure.md']);
    expect(reviewer.files.filter(file => file.kind === 'system').map(file => file.path.split('/').at(-1)).sort()).toEqual(['reviewer-orientation.system.md', 'reviewer.system.md']);
    expect(reviewer.files.filter(file => file.kind === 'submission-schema').map(file => file.path).sort()).toEqual(['orientation.schema.json', 'review.schema.json']);
  });

  test('asks for the entry assignments, which become the work items', async () => {
    const { packages } = await loadPromptPackages();
    const initial = packages.get('initial-architect')!;
    expect(initial.procedure).toContain('One work item is created per entry capability');
    expect(initial.procedure).toContain('Name the plan\'s entry capabilities');
    expect(initial.procedure).not.toContain('asks for no entry assignment');
  });
});
