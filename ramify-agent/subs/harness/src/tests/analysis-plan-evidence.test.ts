import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { RunQueries } from '../projections/queries.js';
import { validateInitialAnalysis } from '../analysis/submission.js';
import { readCapturedDocuments } from '../run/document-inputs.js';
import { runRecordSchema } from '../run/records.js';
import { extractDocumentScenarios } from '../../subs/scenarios/src/extraction.js';
import { copyFixture } from './helpers/fixture.js';
import { installTestRunner, openRuns, runEventsOnDisk, runPath, startRun, stopRun, until } from './helpers/runs.js';
import { unchangedGit } from './helpers/unchanged-run.js';

const planId = 'review-notes';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const rootText = '# Evidence plan\n\n[Constraints](constraints.md)\n[Optional guide](later.md)\n';
const companionText = '# Constraints\n\nThe service must preserve a 30 second timeout.\nUse Redis if practical.\n';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function submitted(spec: SessionSpec) {
  const capturedRoot = /captured file (.+\/input\/plan\.md)/u.exec(spec.prompt)?.[1];
  if (!capturedRoot) throw new Error('No captured root path in the architect prompt');
  const directory = dirname(dirname(capturedRoot));
  const manifest = documentManifestSchema.parse(JSON.parse(readFileSync(join(directory, 'input/documents.json'), 'utf8')));
  const root = manifest.documents.find(item => item.id === manifest.root)!;
  const companion = manifest.documents.find(item => item.path.endsWith('constraints.md'))!;
  const cited = (document: typeof root, quote: string) => {
    const bytes = readFileSync(join(directory, document.storedAt));
    const start = bytes.indexOf(Buffer.from(quote));
    if (start < 0) throw new Error(`Missing quote: ${quote}`);
    return { document: document.id, sha256: document.sha256, start, end: start + Buffer.byteLength(quote), quote };
  };
  const gap = manifest.missing.find(item => item.target.endsWith('later.md'))!;
  return {
    entries: [], hypotheses: [], coverageLimits: [], scenarios: [], integrationScenarios: [],
    incorporation: { documents: [
      { document: root.id, scenarios: true, governing: [cited(root, '# Evidence plan')], uncertainty: '' },
      { document: companion.id, scenarios: false, governing: [cited(companion, '# Constraints')], uncertainty: 'This companion has no scenarios.' },
    ], missing: [{ from: gap.from, target: gap.target, source: gap.source, judgment: 'unclear' as const,
      reason: 'The root calls this guide optional and does not establish its binding force.' }] },
    catalog: [
      { classification: 'advice' as const, passage: cited(companion, 'Use Redis if practical.'), conditions: [], uncertainty: 'Tentative suggestion.' },
      { classification: 'non-functional-requirement' as const, passage: cited(companion, 'The service must preserve a 30 second timeout.'),
        conditions: [{ text: 'The service', source: 'stated' as const }, { text: 'for the service', source: 'inferred' as const }], uncertainty: '' },
    ],
  };
}

test('accepts exact catalog and incorporation once, and projects NFRs plus an unclear source excerpt', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'plans', planId, 'plan.md'), rootText);
  await writeFile(join(fixture.root, 'plans', planId, 'constraints.md'), companionText);
  const { service } = await openRuns(fixture.root, { script: spec => [{ kind: 'submit', input: submitted(spec) }],
    git: unchangedGit(fixture.root, []) });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun(planId, 'scripted', undefined, true));
  await until(() => service.getRun(planId, receipt.jobId)?.phase === 'awaiting-review');
  const events = await runEventsOnDisk(fixture.root, planId, receipt.jobId);
  const accepted = events.find(event => event.type === 'analysis-accepted');
  expect(accepted?.type).toBe('analysis-accepted');
  if (!accepted || accepted.type !== 'analysis-accepted') return;
  expect(accepted.data.catalog).toEqual({ nfr: 1, advice: 1 });
  expect(accepted.data.evidence).toBeDefined();
  if (!accepted.data.evidence) return;
  expect(accepted.data.evidence.catalog.path).toContain(accepted.data.evidence.catalog.hash);
  const catalogFile = await readFile(runPath(fixture.root, planId, receipt.jobId, accepted.data.evidence!.catalog.path));
  expect(hash(catalogFile)).toBe(accepted.data.evidence?.catalog.hash);
  const projection = await new RunQueries(service).analysis(planId, receipt.jobId);
  expect(projection.analysis.status).toBe('accepted');
  if (projection.analysis.status !== 'accepted') return;
  expect(projection.analysis.planEvidence?.status).toBe('available');
  if (projection.analysis.planEvidence?.status !== 'available') return;
  expect(projection.analysis.planEvidence.catalog.map(item => [item.id, item.classification])).toEqual([
    ['nfr-001', 'non-functional-requirement'], ['adv-001', 'advice'],
  ]);
  expect(projection.analysis.planEvidence.missing[0]).toMatchObject({ judgment: 'unclear', excerpt: '[Optional guide](later.md)' });
  const record = runRecordSchema.parse(JSON.parse(await readFile(runPath(fixture.root, planId, receipt.jobId, 'job.json'), 'utf8')));
  const captured = await readCapturedDocuments(runPath(fixture.root, planId, receipt.jobId), record.manifest);
  const invalid = { ...submitted({ prompt: `captured file ${runPath(fixture.root, planId, receipt.jobId, 'input/plan.md')}` } as SessionSpec), catalog: undefined };
  const rejected = validateInitialAnalysis(invalid, { index: null, documents: captured, planScenarios: [] });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) expect(rejected.errors.map(item => item.path)).toContain('catalog');
  if (process.env.PLAN13_REVIEW_EXPORT) await writeFile(process.env.PLAN13_REVIEW_EXPORT, JSON.stringify(projection));
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
  const cite = (index: number, quote: string) => {
    const document = documents[index]!;
    const start = bytes.get(document.id)!.indexOf(quote);
    return { document: document.id, sha256: document.sha256, start, end: start + Buffer.byteLength(quote), quote };
  };
  const extracted = extractDocumentScenarios([{ id: 'doc-002', text: companion }]).scenarios[0]!;
  const incorporation = { documents: [
    { document: 'doc-001', scenarios: false, governing: [cite(0, '# Root')], uncertainty: '' },
    { document: 'doc-002', scenarios: true, governing: [cite(1, '# Companion')], uncertainty: '' },
    { document: 'doc-003', scenarios: false, governing: [cite(2, '# Example')], uncertainty: 'Example only.' },
  ], missing: [{ from: 'doc-001', target: 'plans/example/required.md', source: manifest.missing[0]!.source,
    judgment: 'unclear' as const, reason: 'The surrounding text does not establish force.' }] };
  const submission = { entries: [{ capability: 'timely-response', description: 'A request completes promptly.', owner: 'example',
    requirementRefs: [{ document: 'doc-001', anchor: 'Root' }], acceptanceRefs: [{ document: 'doc-002', lines: extracted.lines }], citations: [] }],
    hypotheses: [], coverageLimits: [], scenarios: [{ key: 'timely', entry: 'timely-response', origin: { kind: 'plan', planScenario: 'ps-01' },
      gherkin: extracted.source.join('\n') }], integrationScenarios: [], incorporation, catalog: [] };
  const evidence = { index: null, documents: { manifest, bytes }, planScenarios: [], manifestHash: hash('manifest') };
  expect(validateInitialAnalysis(submission, evidence).ok).toBe(true);
  expect(validateInitialAnalysis({ ...submission, incorporation: { ...incorporation,
    documents: incorporation.documents.map(item => item.document === 'doc-003' ? { ...item, scenarios: true } : item) } }, evidence).ok).toBe(false);
  expect(validateInitialAnalysis({ ...submission, catalog: undefined }, evidence)).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'catalog' })]) });
  expect(validateInitialAnalysis({ ...submission, incorporation: { ...incorporation, documents: incorporation.documents.slice(0, 2) } }, evidence)).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.documents' })]) });
  expect(validateInitialAnalysis({ ...submission, incorporation: { ...incorporation, missing: incorporation.missing.map(item => ({ ...item, judgment: 'required' as const })) } }, evidence)).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.missing.0' })]) });
  expect(validateInitialAnalysis({ ...submission, incorporation: { ...incorporation, documents: [...incorporation.documents, incorporation.documents[0]!] } }, evidence)).toMatchObject({ ok: false,
    errors: expect.arrayContaining([expect.objectContaining({ path: 'incorporation.documents.3.document' })]) });
});
