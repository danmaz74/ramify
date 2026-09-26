import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { architectIndex, moduleEntry } from './helpers/views.js';
import { initialAnalysisJsonSchema, initialAnalysisToolName, validateInitialAnalysis } from '../analysis/submission.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { acceptElements, openElementCatalog } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { extensionIsANewForecast } from '../analysis/records.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { copyFixture, fixtureRoot } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { architectScenario, elementsOf } from './helpers/analysis.js';
import { demonstrationScript } from '../http/server.js';
import { extractPlanScenarios } from '../../subs/scenarios/src/extraction.js';
import { join } from 'node:path';

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

/** The captured documents: the root plan and one principles document. */
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [
    { id: 'doc-001', path: 'plans/shop/plan.md', kind: 'plan', sha256: hash('plan'), bytes: 4, storedAt: 'input/plan.md', revision: { commit: null, dirty: null } },
    { id: 'doc-002', path: 'docs/orders.principles.md', kind: 'principle', sha256: hash('principles'), bytes: 10, storedAt: 'input/documents/doc-002.bin', revision: { commit: null, dirty: null } },
  ],
  missing: [], principlesScan: { status: 'complete', unreadable: [] },
});

/** The catalog before the architect: the intake's non-functional requirement and a principles document's fixed one. */
const intake = acceptElements(openElementCatalog(hash('manifest'), manifest), [
  { key: 'fast', kind: 'non-functional', document: 'doc-001', text: 'Pages load within a second.', conditions: [], uncertainty: '' },
  { key: 'audited', kind: 'fixed', document: 'doc-002', text: 'Every order change is audited.', conditions: [], uncertainty: '' },
]);
if (!intake.ok) throw new Error(intake.errors.join('; '));
const catalog = intake.catalog;

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

/** A submission of these entries, each with the one architect scenario the form rules require of it, and an element for every key they cite. */
function submission(entries: ReadonlyArray<ReturnType<typeof entry>>, hypotheses: readonly unknown[] = []) {
  return {
    elements: elementsOf(entries as unknown as Parameters<typeof elementsOf>[0]),
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
    requirementRefs: [`${capability}-request`],
    acceptanceRefs: [`${capability}-acceptance`],
    contextRefs: [] as string[],
    citations: [{ module: 'shop/orders' }],
    ...extra,
  };
}

describe('the schema', () => {
  test('rejects an input whose shape is wrong, with a path for every error', () => {
    const result = validateInitialAnalysis({ elements: [], entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] }, { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe('entries');
    expect(result.errors[0]!.expected).toBe('array');
  });

  test('rejects an unknown field, and a slug that is not kebab-case', () => {
    const unknown = validateInitialAnalysis({ ...submission([]), notes: 'x' }, { index, catalog });
    expect(unknown.ok).toBe(false);

    const slug = validateInitialAnalysis(submission([entry('Send Email')]), { index, catalog });
    expect(slug.ok).toBe(false);
    if (slug.ok) return;
    expect(slug.errors[0]!.path).toBe('entries.0.capability');
    expect(slug.errors[0]!.message).toContain('kebab-case');
  });

  test('a forecast extension submitted as the retired "extend" change is refused, and told to forecast a new capability', () => {
    const extended = validateInitialAnalysis(submission([entry('send-email')], [forecast({ change: 'extend' })]), { index, catalog });
    expect(extended.ok).toBe(false);
    if (extended.ok) return;
    expect(extended.errors.map(error => error.path)).toEqual(['hypotheses.0.change']);
    expect(extended.errors[0]!.message).toBe(extensionIsANewForecast);
    expect(extended.errors[0]!.message).toContain('new capability named for itself');

    // The same forecast, as the model now states it.
    expect(validateInitialAnalysis(
      submission([entry('send-email')], [forecast({ capability: 'send-email-with-attachment', change: 'create', changesExistingSymbols: true })]),
      { index, catalog },
    ).ok).toBe(true);
  });

  test('has no field for an ID the harness already knows', () => {
    const properties = (initialAnalysisJsonSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties).sort()).toEqual(['coverageLimits', 'elements', 'entries', 'hypotheses', 'integrationScenarios', 'scenarios']);
    // An element is named by the architect's key; its fr-NNN or ctx-NNN is the harness's.
    expect(JSON.stringify(properties['elements'])).not.toContain('"id"');
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
    const result = validateInitialAnalysis(submission([entry('send-email'), entry('send-email')]), { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.1.capability');
    expect(result.errors[0]!.message).toContain('unique in the run');
  });

  test('an owner that is not in the view, and a proposal whose parent is not either', () => {
    const missing = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail' })]), { index, catalog });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors[0]!.path).toBe('entries.0.owner');

    const proposal = { parent: 'shop/nothing', directory: 'subs/nothing/subs/mail', purpose: 'Sends email.', tags: [] };
    const bad = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail', proposed: proposal })]), { index, catalog });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors[0]!.path).toBe('entries.0.proposed.parent');
  });

  test('a proposed module must be a direct child under its parent\'s subs/', () => {
    const wrong = { parent: 'shop/orders', directory: 'subs/orders/src/mail', purpose: 'Sends email.', tags: [] };
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: wrong })]), { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.expected).toBe('subs/orders/subs/<name>');

    const right = { parent: 'shop/orders', directory: 'subs/orders/subs/mail', purpose: 'Sends email.', tags: [] };
    expect(validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: right })]), { index, catalog }).ok).toBe(true);
  });

  test('a citation must name a module the view has', () => {
    const result = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/nothing' }] })]), { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.0.citations.0.module');
  });

  test('a cited symbol must be an exported original the cited module owns', () => {
    const known = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/orders', symbol: 'price' }] })]), { index, catalog });
    expect(known.ok).toBe(true);

    const unknown = validateInitialAnalysis(submission([entry('send-email', { citations: [{ module: 'shop/orders', symbol: 'discount' }] })]), { index, catalog });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.errors[0]!.path).toBe('entries.0.citations.0.symbol');
    expect(unknown.errors[0]!.message).toContain('no exported "discount"');
  });

  test('every citation names an element of the submission by its key, never an ID or a key it does not submit', () => {
    const unknownRef = submission([entry('send-email')]);
    unknownRef.entries[0]!.requirementRefs = ['nowhere'];
    const unknown = validateInitialAnalysis(unknownRef, { index, catalog });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.errors.map(error => error.path)).toEqual(['entries.0.requirementRefs.0']);
    expect(unknown.errors[0]!.message).toBe('Unknown element nowhere');

    // The intake's elements are already IDs of the catalog; the architect cites only what it submits.
    const earlier = submission([entry('send-email')]);
    earlier.entries[0]!.requirementRefs = ['nfr-001'];
    const byId = validateInitialAnalysis(earlier, { index, catalog });
    expect(byId.ok).toBe(false);
    if (byId.ok) return;
    expect(byId.errors.map(error => error.path)).toEqual(['entries.0.requirementRefs.0']);

    const idKey = submission([entry('send-email')]);
    idKey.elements[0] = { ...idKey.elements[0]!, key: 'fr-009' };
    const asId = validateInitialAnalysis(idKey, { index, catalog });
    expect(asId.ok).toBe(false);
    if (asId.ok) return;
    expect(asId.errors.map(error => error.path)).toContain('elements.0.key');
  });

  test('each citation names an element of the kind its field requires', () => {
    const cited = submission([entry('send-email', { contextRefs: ['send-email-request'] })]);
    const context = validateInitialAnalysis(cited, { index, catalog });
    expect(context.ok).toBe(false);
    if (context.ok) return;
    expect(context.errors).toEqual([{ path: 'entries.0.contextRefs.0', message: 'send-email-request is a functional element', expected: 'a context element' }]);

    const background = submission([entry('send-email', { contextRefs: ['why-email'] })]);
    const accepted = validateInitialAnalysis(background, { index, catalog });
    expect(accepted.ok).toBe(true);
    expect(background.elements.find(element => element.key === 'why-email')?.kind).toBe('context');
    // Context is neither a requirement nor something a scenario verifies.
    background.entries[0]!.acceptanceRefs = ['why-email'];
    background.scenarios[0]!.refs = ['why-email'];
    const misused = validateInitialAnalysis(background, { index, catalog });
    expect(misused.ok).toBe(false);
    if (misused.ok) return;
    expect(misused.errors.map(error => [error.path, error.expected])).toEqual([
      ['entries.0.acceptanceRefs.0', 'a functional element'], ['scenarios.0.refs.0', 'a functional element'],
    ]);
  });

  test('the architect reads functional and context elements from captured plan documents only', () => {
    const principled = submission([entry('send-email')]);
    principled.elements[0] = { ...principled.elements[0]!, document: 'doc-002' };
    const fromPrinciples = validateInitialAnalysis(principled, { index, catalog });
    expect(fromPrinciples.ok).toBe(false);
    if (fromPrinciples.ok) return;
    expect(fromPrinciples.errors).toEqual([{ path: 'elements.0.document', message: 'doc-002 is not a captured plan document', expected: 'a captured plan document' }]);

    const uncaptured = submission([entry('send-email')]);
    uncaptured.elements[1] = { ...uncaptured.elements[1]!, document: 'doc-009' };
    const nowhere = validateInitialAnalysis(uncaptured, { index, catalog });
    expect(nowhere.ok).toBe(false);
    if (nowhere.ok) return;
    expect(nowhere.errors.map(error => error.path)).toEqual(['elements.1.document']);

    const recommended = submission([entry('send-email')]);
    recommended.elements.push({ key: 'use-a-queue', kind: 'recommendation', document: 'doc-001', text: 'Prefer a queue.', conditions: [], uncertainty: '' });
    const other = validateInitialAnalysis(recommended, { index, catalog });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.errors.map(error => error.path)).toEqual(['elements.2.kind']);

    const twice = submission([entry('send-email')]);
    twice.elements[1] = { ...twice.elements[1]!, key: 'send-email-request' };
    const duplicate = validateInitialAnalysis(twice, { index, catalog });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.errors.map(error => error.path)).toContain('elements.1.key');
  });

  test('scenario form rule 6: every acceptance element of an entry is in the refs of one of its scenarios', () => {
    const uncited = submission([entry('send-email', { acceptanceRefs: ['send-email-acceptance', 'send-email-receipt'] })]);
    uncited.scenarios[0]!.refs = ['send-email-acceptance'];
    const result = validateInitialAnalysis(uncited, { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ path: 'entries.0.acceptanceRefs.1', expected: 'a submission that keeps scenario form rule 6' });
    expect(result.errors[0]!.message).toContain('send-email-receipt');

    // A requirement need not be cited by a scenario; an acceptance element must.
    uncited.scenarios[0]!.refs = ['send-email-acceptance', 'send-email-receipt'];
    expect(validateInitialAnalysis(uncited, { index, catalog }).ok).toBe(true);
  });

  test('the owner, the directory and the declaration name must agree', () => {
    const disagreeing = { parent: 'shop/orders', directory: 'subs/orders/subs/post', purpose: 'Sends email.', tags: [] };
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: disagreeing })]), { index, catalog });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.path).toBe('entries.0.proposed.directory');
    expect(result.errors[0]!.expected).toBe('subs/orders/subs/mail');

    const elsewhere = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends email.', tags: [] };
    const wrongParent = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: elsewhere })]), { index, catalog });
    expect(wrongParent.ok).toBe(false);
    if (wrongParent.ok) return;
    expect(wrongParent.errors.map(error => error.path)).toContain('entries.0.owner');
  });

  test('a directory a module already occupies, and two entries that define one directory differently', () => {
    const occupied = { parent: 'shop', directory: 'subs/orders', purpose: 'Sends email.', tags: [] };
    const taken = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders', proposed: occupied })]), { index, catalog });
    // An owner the view already has cannot be proposed at all.
    expect(taken.ok).toBe(false);

    const clash = { parent: 'shop', directory: 'subs/orders', purpose: 'Sends email.', tags: [] };
    const conflicting = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/mail', proposed: { ...clash, directory: 'subs/orders' } })]), { index, catalog });
    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.errors.map(error => error.message).join(' ')).toContain('already the directory of "shop/orders"');

    const one = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends email.', tags: [] };
    const two = { parent: 'shop', directory: 'subs/mail', purpose: 'Sends letters.', tags: [] };
    const twice = validateInitialAnalysis(
      submission([entry('send-email', { owner: 'shop/mail', proposed: one }), entry('send-letter', { owner: 'shop/mail', proposed: two })]),
      { index, catalog },
    );
    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.errors[0]!.path).toBe('entries.1.proposed');

    // The same definition twice is one proposal two capabilities reference.
    const shared = validateInitialAnalysis(
      submission([entry('send-email', { owner: 'shop/mail', proposed: one }), entry('send-letter', { owner: 'shop/mail', proposed: { ...one } })]),
      { index, catalog },
    );
    expect(shared.ok).toBe(true);
  });

  test('a valid proposal with an existing parent is accepted', () => {
    const proposal = { parent: 'shop/orders', directory: 'subs/orders/subs/mail', purpose: 'Sends the customer an email.', tags: ['dispatch'] };
    expect(validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/orders/mail', proposed: proposal })]), { index, catalog }).ok).toBe(true);
  });

  test('without a view the rules that need one are not applied, and no claim is accepted that was not checked', () => {
    const result = validateInitialAnalysis(submission([entry('send-email', { owner: 'shop/nowhere' })]), { index: null, catalog });
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
      [{ elements: [], entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] }, emptyAnalysis()],
      ['final verification of plan "review-notes"'],
    );

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const verdicts = agent!.sessions[1]!.verdicts;
    expect(verdicts[0]).toMatchObject({ accepted: false });
    const answer = JSON.parse((verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { accepted: boolean; errors: Array<{ path: string }>; remainingAttempts: number };
    expect(answer.accepted).toBe(false);
    expect(answer.errors[0]!.path).toBe('entries');
    expect(answer.remainingAttempts).toBe(2);
    expect((verdicts[0] as { errors: string[] }).errors[0]).toContain('Correct every error above and call the tool again.');
    expect(verdicts[1]).toEqual({ accepted: true });

    // Each rejection is an observation with its errors, and nothing was
    // written for the input that failed.
    const observations = await readFile(runPath(root, 'review-notes', runId, runLayout.observations('inv-0002')), 'utf8');
    const lines = observations.split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { target?: string; errors?: unknown[] } });
    const rejections = lines.filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.data.target).toBe(initialAnalysisToolName);
    expect(rejections[0]!.data.errors).toEqual([{ path: 'entries', message: expect.any(String) }]);

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0002')), 'utf8')) as InvocationOutcome;
    expect(outcome.rejectedSubmissions).toBe(1);
    expect(outcome.ended).toBe('submitted');
  }, 180_000);

  test('the bound ends the invocation as invalid-submission, and the run with it', async () => {
    const broken = { elements: [], entries: 'none', hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [] };
    const { root, runId, service, agent } = await run([broken, broken, broken, broken]);

    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure?.reason).toBe('invalid-submission');

    const verdicts = agent!.sessions[1]!.verdicts;
    expect(verdicts).toHaveLength(3);
    expect(verdicts.at(-1)).toMatchObject({ accepted: false, final: true });
    expect((verdicts.at(-1) as { errors: string[] }).errors[0]).toContain('No further attempts are accepted');

    const outcome = JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.outcome('inv-0002')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'invalid-submission', rejectedSubmissions: 3, submission: null });
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    // The intake's session, then the architect's, and nothing of the catalog is durable.
    expect(events.map(event => event.type)).toEqual(['job-started', 'document-manifest-committed',
      'session-opened', 'invocation-started', 'invocation-ended', 'session-opened', 'invocation-started', 'invocation-ended', 'job-failed']);
    expect(events.filter(event => event.type === 'invocation-started').map(event => event.type === 'invocation-started' && event.data.role))
      .toEqual(['catalog-extractor', 'initial-architect']);
  }, 180_000);

  test('a duplicate capability slug is rejected, and three of them end the invocation', async () => {
    const duplicate = {
      elements: [],
      entries: [
        { capability: 'reviewer-note', description: 'A note.', owner: 'collection-review', requirementRefs: [], acceptanceRefs: [], contextRefs: [], citations: [] },
        { capability: 'reviewer-note', description: 'The same slug again.', owner: 'collection-review', requirementRefs: [], acceptanceRefs: [], contextRefs: [], citations: [] },
      ],
      hypotheses: [],
      coverageLimits: [],
      scenarios: [],
      integrationScenarios: [],
    };
    const { root, runId, service, agent } = await run([duplicate, duplicate, duplicate]);

    const verdicts = agent!.sessions[1]!.verdicts;
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

    const observations = await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0002')), 'utf8');
    const rejections = observations.split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { type: string; data: { target?: string; attempt?: number } })
      .filter(line => line.type === 'rejection');
    expect(rejections).toHaveLength(1);
    expect(rejections[0]!.data).toMatchObject({ target: initialAnalysisToolName, attempt: 1 });
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    void agent;
  }, 180_000);
});

describe('the scripted fake\'s demonstration, which `serve --agent fake` runs', () => {
  const plan = 'review-notes';

  test('every submission it makes passes the real submission validator', async () => {
    const text = await readFile(join(fixtureRoot, 'plans', plan, 'plan.md'), 'utf8');
    const planScenarios = extractPlanScenarios(text).scenarios;
    const submissions = demonstrationScript().flatMap(step => (step.kind === 'submit' ? [step.input] : []));

    expect(submissions.length).toBeGreaterThan(0);
    for (const input of submissions) {
      expect(validateInitialAnalysis(input, { index: null, catalog: openElementCatalog(hash('manifest'), manifest), planScenarios })).toEqual({ ok: true, value: input });
    }
  });

  test('gets a run past its analysis to the end', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const { service } = await openRuns(fixture.root, {
      script: demonstrationScript,
      unchangedCheckpoints: [`final verification of plan "${plan}"`],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun(plan));
    await service.settled(plan, receipt.jobId);

    const events = await runEventsOnDisk(fixture.root, plan, receipt.jobId);
    expect(events.some(event => event.type === 'analysis-accepted')).toBe(true);
    expect(onlyRun(service, plan).state).toBe('completed');
  }, 180_000);
});

describe('the prompt package', () => {
  test('offers exactly the submission members this iteration produces', async () => {
    const { manifest } = await loadPromptPackages();
    expect(Object.keys(manifest.packages).sort()).toEqual(['catalog-extractor', 'context-selector', 'contract-engineer', 'engineer', 'failure-analyst', 'global-fork', 'initial-architect', 'local-architect', 'nonfunctional-coordinator', 'nonfunctional-repair-engineer', 'reviewer']);
    const initial = manifest.packages['initial-architect']!;
    expect(initial.package).toBe('initial-architect/3');
    expect(initial.submissionKinds).toEqual(['initial-analysis']);
    expect(initial.files.map(file => file.kind).sort()).toEqual(expect.arrayContaining(['procedure', 'skill', 'submission-schema', 'system']));
    expect(initial.hash).toMatch(/^[0-9a-f]{64}$/);

    // Each role is offered exactly the members a run of this iteration
    // produces, and no other.
    // The catalog extractor's three turns are three submissions of one package.
    const extractor = manifest.packages['catalog-extractor']!;
    expect(extractor.package).toBe('catalog-extractor/1');
    expect(extractor.submissionKinds).toEqual(['intake', 'principle-extraction', 'catalog-check']);
    expect(extractor.files.filter(file => file.kind === 'procedure').map(file => file.path.split('/').at(-1)).sort())
      .toEqual(['check.procedure.md', 'intake.procedure.md', 'principles.procedure.md']);
    expect(extractor.hash).toMatch(/^[0-9a-f]{64}$/);

    const local = manifest.packages['local-architect']!;
    expect(local.package).toBe('local-architect/8');
    // The reconciliation fork's submission is the package's second.
    expect(local.submissionKinds).toEqual(['assign', 'request-placement', 'request-completion', 'yield-for-providers', 'unresolved', 'reconciliation', 'work-orientation']);

    const fork = manifest.packages['global-fork']!;
    expect(fork.package).toBe('global-fork/4');
    expect(fork.submissionKinds).toEqual(['decision', 'partial', 'deviation', 'nothing-possible', 'environment']);
    expect(fork.hash).toMatch(/^[0-9a-f]{64}$/);

    const engineer = manifest.packages['engineer']!;
    expect(engineer.package).toBe('engineer/4');
    expect(engineer.submissionKinds).toEqual(['completion-proposed', 'partial', 'unsuitable', 'contract-needed']);
    expect(engineer.hash).toMatch(/^[0-9a-f]{64}$/);

    // The contract sub-session is an engineer invocation with the contract
    // skill, and the skill is a file of its package like any other.
    const contract = manifest.packages['contract-engineer']!;
    expect(contract.package).toBe('contract-engineer/2');
    expect(contract.submissionKinds).toEqual(['established', 'incomplete']);
    expect(contract.files.some(file => file.kind === 'skill' && file.path.endsWith('contract.skill.md'))).toBe(true);
    expect(contract.hash).toMatch(/^[0-9a-f]{64}$/);

    // A reviewer submits its review; a design orientation submits what it
    // read. One procedure per question, each a file the hash covers.
    const reviewer = manifest.packages['reviewer']!;
    expect(reviewer.package).toBe('reviewer/4');
    expect(reviewer.submissionKinds).toEqual(['review', 'orientation']);
    const procedures = reviewer.files.filter(file => file.kind === 'procedure').map(file => file.path.split('/').at(-1)).sort();
    expect(procedures).toEqual(['code-review.procedure.md', 'design-review.procedure.md', 'scope-review.procedure.md']);
    expect(reviewer.files.filter(file => file.kind === 'system').map(file => file.path.split('/').at(-1)).sort()).toEqual(['reviewer-orientation.system.md', 'reviewer.system.md']);
    expect(reviewer.files.filter(file => file.kind === 'submission-schema').map(file => file.path).sort()).toEqual(['orientation.schema.json', 'review.schema.json']);

    // A failure analyst reads what a failed engineer left and submits one
    // account; its system prompt and procedure are files of its package.
    const analyst = manifest.packages['failure-analyst']!;
    expect(analyst.package).toBe('failure-analyst/1');
    expect(analyst.submissionKinds).toEqual(['failure-analysis']);
    expect(analyst.files.filter(file => file.kind !== 'skill').map(file => file.path.split('/').at(-1)).sort())
      .toEqual(['failure-analysis.procedure.md', 'failure-analysis.schema.json', 'failure-analyst.system.md']);
  });

  test('asks for the entry assignments, which become the work items', async () => {
    const { packages } = await loadPromptPackages();
    const initial = packages.get('initial-architect')!;
    expect(initial.procedure).toContain('One work item is created per entry capability');
    expect(initial.procedure).toContain('Name the plan\'s entry capabilities');
    expect(initial.procedure).not.toContain('asks for no entry assignment');
  });
});
