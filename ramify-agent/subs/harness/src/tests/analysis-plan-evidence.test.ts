import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { elementCatalogSchema, openElementCatalog, serializeElementCatalog } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { RunQueries } from '../projections/queries.js';
import { validateInitialAnalysis } from '../analysis/submission.js';
import { acceptIntake, intakeToolName, type IntakeSubmission } from '../analysis/extraction.js';
import { readCapturedDocuments } from '../run/document-inputs.js';
import { runRecordSchema } from '../run/records.js';
import { extractDocumentScenarios } from '../../subs/scenarios/src/extraction.js';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, installTestRunner, openRuns, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import { unchangedGit } from './helpers/unchanged-run.js';

const planId = 'review-notes';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const rootText = '# Evidence plan\n\n[Constraints](constraints.md)\n[Optional guide](later.md)\n';
const companionText = '# Constraints\n\nThe service must preserve a 30 second timeout.\nUse Redis if practical.\n';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

/** The intake of the captured root and companion: one requirement, one recommendation, and an unclear gap. */
function intake(spec: SessionSpec): IntakeSubmission {
  const capturedRoot = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
  if (!capturedRoot) throw new Error('No captured root path in the intake prompt');
  const directory = dirname(dirname(capturedRoot));
  const manifest = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8')));
  const root = manifest.documents.find(item => item.id === manifest.root)!;
  const companion = manifest.documents.find(item => item.path.endsWith('constraints.md'))!;
  const gap = manifest.missing.find(item => item.target.endsWith('later.md'))!;
  return {
    goal: 'The service keeps its timeout.',
    elements: [
      { key: 'redis', kind: 'recommendation', document: companion.id, text: 'Use Redis if practical.', conditions: [], uncertainty: 'Tentative suggestion.' },
      { key: 'timeout', kind: 'non-functional', document: companion.id, text: 'The service must preserve its 30 second timeout.',
        conditions: [{ text: 'The service', source: 'stated' }, { text: 'for the service', source: 'inferred' }], uncertainty: '' },
    ],
    incorporation: { documents: [
      { document: root.id, scenarios: true, uncertainty: '' },
      { document: companion.id, scenarios: false, uncertainty: 'This companion has no scenarios.' },
    ], missing: [{ from: gap.from, target: gap.target, source: gap.source, judgment: 'unclear',
      reason: 'The root calls this guide optional and does not establish its binding force.' }] },
  };
}

test('accepts the intake\'s elements and incorporation once, and projects them by kind with an unclear source excerpt', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'plans', planId, 'plan.md'), rootText);
  await writeFile(join(fixture.root, 'plans', planId, 'constraints.md'), companionText);
  const { service } = await openRuns(fixture.root, {
    script: spec => spec.submission.name === intakeToolName ? [{ kind: 'submit', input: intake(spec) }]
      : spec.role === 'initial-architect' ? [{ kind: 'submit', input: emptyAnalysis() }] : [],
    git: unchangedGit(fixture.root, []),
  });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun(planId, 'scripted', undefined, true));
  await until(() => service.getRun(planId, receipt.jobId)?.phase === 'awaiting-review');
  const events = await runEventsOnDisk(fixture.root, planId, receipt.jobId);
  const accepted = events.find(event => event.type === 'analysis-accepted');
  expect(accepted?.type).toBe('analysis-accepted');
  if (!accepted || accepted.type !== 'analysis-accepted') return;
  expect(accepted.data.catalog).toEqual({ context: 0, functional: 0, nonFunctional: 1, fixed: 0, recommendation: 1 });
  expect(accepted.data.findings).toEqual([]);
  expect(accepted.data.evidence).toBeDefined();
  if (!accepted.data.evidence) return;
  expect(accepted.data.evidence.catalog.path).toContain(accepted.data.evidence.catalog.hash);
  const catalogFile = await readFile(runPath(fixture.root, planId, receipt.jobId, accepted.data.evidence.catalog.path), 'utf8');
  expect(hash(catalogFile)).toBe(accepted.data.evidence.catalog.hash);
  const catalog = elementCatalogSchema.parse(JSON.parse(catalogFile));
  expect(serializeElementCatalog(catalog)).toBe(catalogFile);
  const incorporationFile = await readFile(runPath(fixture.root, planId, receipt.jobId, accepted.data.evidence.incorporation.path), 'utf8');
  expect(hash(incorporationFile)).toBe(accepted.data.evidence.incorporation.hash);
  expect(JSON.parse(incorporationFile)).toMatchObject({ schema: 'ramify-agent.document-incorporation/2' });

  const projection = await new RunQueries(service).analysis(planId, receipt.jobId);
  expect(projection.analysis.status).toBe('accepted');
  if (projection.analysis.status !== 'accepted') return;
  expect(projection.analysis.planEvidence?.status).toBe('available');
  if (projection.analysis.planEvidence?.status !== 'available') return;
  const evidence = projection.analysis.planEvidence;
  expect(evidence.catalogHash).toBe(accepted.data.evidence.catalog.hash);
  // Package order: the plan's non-functional requirements before recommendations.
  expect(evidence.elements.map(item => [item.id, item.kind, item.path])).toEqual([
    ['nfr-001', 'non-functional', `plans/${planId}/constraints.md`], ['rec-001', 'recommendation', `plans/${planId}/constraints.md`],
  ]);
  expect(evidence.elements[0]).toMatchObject({ text: 'The service must preserve its 30 second timeout.', locator: null,
    conditions: [{ text: 'The service', source: 'stated' }, { text: 'for the service', source: 'inferred' }] });
  expect(evidence.elements.every(item => !('start' in item || 'sha256' in item || 'quote' in item))).toBe(true);
  expect(evidence.retired).toEqual([]);
  expect(evidence.findings).toEqual([]);
  expect(evidence.missing[0]).toMatchObject({ judgment: 'unclear', excerpt: '[Optional guide](later.md)' });
  expect(evidence.incorporation.map(item => [item.path, item.scenarios])).toEqual([[`plans/${planId}/plan.md`, true], [`plans/${planId}/constraints.md`, false]]);
  expect(evidence.incorporation.every(item => !('governing' in item))).toBe(true);

  // The same intake with a fixed requirement, which only a principles document supplies, and an architect submitting a requirement it does not read.
  const record = runRecordSchema.parse(JSON.parse(await readFile(runPath(fixture.root, planId, receipt.jobId, 'job.json'), 'utf8')));
  const captured = await readCapturedDocuments(runPath(fixture.root, planId, receipt.jobId), record.manifest);
  const open = openElementCatalog(record.manifest.documentManifest!.hash, captured.manifest);
  const valid = intake({ prompt: `captured file ${runPath(fixture.root, planId, receipt.jobId, 'input/plan.md')}` } as SessionSpec);
  const fixed = acceptIntake(open, captured.manifest, { ...valid, elements: [{ ...valid.elements[1]!, kind: 'fixed' }] });
  expect(fixed.ok).toBe(false);
  if (!fixed.ok) expect(fixed.errors.map(item => item.path)).toEqual(['elements.0.kind']);
  const architect = validateInitialAnalysis({ ...emptyAnalysis(), elements: [{ ...valid.elements[1]! }] }, { index: null, catalog: open, documents: captured, planScenarios: [] });
  expect(architect.ok).toBe(false);
  if (!architect.ok) expect(architect.errors.map(item => item.path)).toContain('elements.0.kind');
  if (process.env.CATALOG_REVIEW_EXPORT) await writeFile(process.env.CATALOG_REVIEW_EXPORT, JSON.stringify(projection));
  await service.execute(stopRun(planId, receipt.jobId, service.getRun(planId, receipt.jobId)!.version));
  await service.settled(planId, receipt.jobId);
});

test('incorporation selects a companion scenario while a linked example stays outside the functional form', () => {
  const source = '# Root\n[Companion](companion.md)\n[Example](example.md)\n[Guide](required.md)\n';
  const companion = '# Companion\n```gherkin\nScenario: A response is timely\n  When a request arrives\n  Then it completes within 30 seconds\n```\n';
  const example = '# Example\n```gherkin\nScenario: An example only\n  When a sample arrives\n  Then the sample is shown\n```\n';
  const texts = [source, companion, example];
  const documents = texts.map((text, index) => ({ id: `doc-${String(index + 1).padStart(3, '0')}`,
    path: `plans/example/${['plan', 'companion', 'example'][index]}.md`, kind: 'plan' as const,
    sha256: hash(text), bytes: Buffer.byteLength(text), storedAt: `input/documents/doc-${String(index + 1).padStart(3, '0')}.bin`,
    revision: { commit: null, dirty: null } }));
  const start = Buffer.from(source).indexOf('[Guide](required.md)');
  const manifest = documentManifestSchema.parse({ schema: 'ramify-agent.document-manifest/1', root: 'doc-001', documents,
    missing: [{ from: 'doc-001', target: 'plans/example/required.md', source: { start, end: start + Buffer.byteLength('[Guide](required.md)') },
      reason: 'File absent', judgment: 'unjudged' }], principlesScan: { status: 'empty', unreadable: [] } });
  const bytes = new Map(documents.map((document, index) => [document.id, Buffer.from(texts[index]!) ]));
  const extracted = extractDocumentScenarios([{ id: 'doc-002', text: companion }]).scenarios[0]!;
  const incorporation: IntakeSubmission['incorporation'] = { documents: [
    { document: 'doc-001', scenarios: false, uncertainty: '' },
    { document: 'doc-002', scenarios: true, uncertainty: '' },
    { document: 'doc-003', scenarios: false, uncertainty: 'Example only.' },
  ], missing: [{ from: 'doc-001', target: 'plans/example/required.md', source: manifest.missing[0]!.source,
    judgment: 'unclear', reason: 'The surrounding text does not establish force.' }] };
  const open = openElementCatalog(hash('manifest'), manifest);
  const intake = (value: IntakeSubmission['incorporation']) => acceptIntake(open, manifest, { goal: 'Requests complete promptly.', elements: [], incorporation: value });
  const accepted = intake(incorporation);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
  expect(accepted.incorporation).toEqual({ schema: 'ramify-agent.document-incorporation/2', ...incorporation });

  const submission = {
    elements: [
      { key: 'timely-request', kind: 'functional', document: 'doc-001', text: 'A request completes promptly.', conditions: [], uncertainty: '' },
      { key: 'timely-accepted', kind: 'functional', document: 'doc-002', text: 'A request completes within 30 seconds.', conditions: [], uncertainty: '' },
    ],
    entries: [{ capability: 'timely-response', description: 'A request completes promptly.', owner: 'example',
      requirementRefs: ['timely-request'], acceptanceRefs: ['timely-accepted'], contextRefs: [], citations: [] }],
    hypotheses: [], coverageLimits: [], scenarios: [{ key: 'timely', entry: 'timely-response', origin: { kind: 'plan', planScenario: 'ps-01' },
      refs: ['timely-accepted'], gherkin: extracted.source.join('\n') }], integrationScenarios: [] };
  const evidence = (value: typeof accepted.incorporation) => ({ index: null, catalog: accepted.catalog, incorporation: value, documents: { manifest, bytes }, planScenarios: [] });
  expect(validateInitialAnalysis(submission, evidence(accepted.incorporation)).ok).toBe(true);
  // The example's scenario becomes binding only by incorporation, and then the submission lacks it.
  const withExample = { ...accepted.incorporation, documents: accepted.incorporation.documents.map(item => item.document === 'doc-003' ? { ...item, scenarios: true } : item) };
  expect(validateInitialAnalysis(submission, evidence(withExample))).toMatchObject({ ok: false,
    errors: [expect.objectContaining({ path: 'scenarios', expected: expect.stringContaining('rule 3') })] });
  const { elements: _elements, ...withoutElements } = submission;
  void _elements;
  expect(validateInitialAnalysis(withoutElements, evidence(accepted.incorporation))).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'elements' })]) });

  expect(intake({ ...incorporation, documents: incorporation.documents.slice(0, 2) })).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.documents' })]) });
  expect(intake({ ...incorporation, missing: incorporation.missing.map(item => ({ ...item, judgment: 'required' as const })) })).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.missing.0' })]) });
  expect(intake({ ...incorporation, documents: [...incorporation.documents, incorporation.documents[0]!] })).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.documents.3.document' })]) });
});
