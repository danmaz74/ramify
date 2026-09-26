import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  acceptElements, contextNotice, createPackage, deviationNotice, elementCatalogHash, elementCatalogSchema, openElementCatalog,
  recommendationNotice, resolveCitations, reviseCatalog, serializeElementCatalog, submittedElementSchema,
  type ElementCatalog, type PackageDeviation, type SubmittedElement,
} from '../interfaces/catalog.js';
import { documentManifestSchema } from '../interfaces/contracts.js';

const hash = 'a'.repeat(64);
const document = (id: string, path: string, kind: 'plan' | 'principle') => ({
  id, path, kind, sha256: hash, bytes: 1, storedAt: `input/documents/${id}.bin`, revision: { commit: null, dirty: null },
});
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [document('doc-001', 'plans/example/plan.md', 'plan'), document('doc-002', 'docs/model/rules.principles.md', 'principle')],
  missing: [], principlesScan: { status: 'complete', unreadable: [] },
});

const element = (key: string, kind: SubmittedElement['kind'], documentId: string, text: string): SubmittedElement =>
  ({ key, kind, document: documentId, text, conditions: [], uncertainty: '' });

/** A whole-section element: an example, its qualifications and a heading of its own, some 1,400 characters. */
const section = [
  'An exposure statement has this interpretation:',
  '',
  '```ramify',
  'expose-src placeOrder from "place-order.ts" to parent',
  'expose-sub * from pricing to descendants',
  '```',
  '',
  '## Qualifications',
  '',
  ...Array.from({ length: 12 }, (_, index) => `Qualification ${index + 1}: each selection keeps its original ownership and tags, and no destination is implied.`),
].join('\n');

function sampleCatalog(): ElementCatalog {
  const intake = acceptElements(openElementCatalog(hash, manifest), [
    element('limit', 'non-functional', 'doc-001', 'Keep every package under the ledger line bound.'),
    element('prefer', 'recommendation', 'doc-001', 'Prefer pure functions for rendering.'),
    element('today', 'context', 'doc-001', 'Today every prompt quotes the plan its own way.'),
  ]);
  if (!intake.ok) throw new Error(intake.errors.join('\n'));
  const principles = acceptElements(intake.catalog, [
    { ...element('exposure', 'fixed', 'doc-002', section), conditions: [
      { text: 'Only parent and descendants are destinations.', source: 'stated' },
      { text: 'Order has no effect.', source: 'inferred' },
    ], uncertainty: 'Whether wildcard rules belong here.' },
    element('trap', 'recommendation', 'doc-002', 'Beware of re-exposing a symbol without its companions.'),
  ]);
  if (!principles.ok) throw new Error(principles.errors.join('\n'));
  const architect = acceptElements(principles.catalog, [
    element('render', 'functional', 'doc-001', 'Render packages from IDs.'),
    element('refuse', 'functional', 'doc-001', 'Refuse a partial package.'),
  ]);
  if (!architect.ok) throw new Error(architect.errors.join('\n'));
  return architect.catalog;
}

const planDeviations: PackageDeviation[] = [
  { id: 'pd-001', amends: ['fr-001'], authority: 'Recorded by the global architect for wi-001.', text: 'Render packages from IDs and a deviation list.' },
  { id: 'pd-002', amends: ['nfr-001', 'fr-002'], authority: 'Recorded by the global architect for wi-002.', text: 'Allow up to 8 MiB.' },
];

describe('element catalog', () => {
  it('assigns IDs per kind in acceptance order and maps submission-local keys to them', () => {
    const catalog = sampleCatalog();
    expect(catalog.elements.map(item => item.id)).toEqual(['nfr-001', 'rec-001', 'ctx-001', 'fix-001', 'rec-002', 'fr-001', 'fr-002']);
    const more = acceptElements(catalog, [element('again', 'functional', 'doc-001', 'Another requirement.')]);
    expect(more.ok && [...more.ids]).toEqual([['again', 'fr-003']]);
    expect(elementCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('never issues a retired ID again', () => {
    const catalog = sampleCatalog();
    const corrected = { ...catalog, elements: catalog.elements.filter(item => item.id !== 'fr-002'), retired: ['fr-002'] };
    const accepted = acceptElements(corrected, [element('split', 'functional', 'doc-001', 'Refuse a partial package.')]);
    expect(accepted.ok && accepted.ids.get('split')).toBe('fr-003');
    expect(elementCatalogSchema.safeParse({ ...catalog, retired: ['fr-002'] }).success).toBe(false);
  });

  it('revises a catalog: a rewrite keeps its ID, kind and document, a split retires the old ID and numbers past it', () => {
    const catalog = sampleCatalog();
    const revised = reviseCatalog(catalog, {
      rewrite: [{ id: 'nfr-001', text: 'Keep every package under 1 MiB.', conditions: [], uncertainty: '' }],
      retire: ['fr-002'],
      add: [element('refuse-missing', 'functional', 'doc-001', 'Refuse a package with a missing ID.'),
        element('refuse-partial', 'functional', 'doc-001', 'Never deliver a partial package.')],
    });
    if (!revised.ok) throw new Error(revised.errors.join('\n'));
    expect(revised.catalog.elements.find(item => item.id === 'nfr-001')).toMatchObject({ kind: 'non-functional', document: 'doc-001', text: 'Keep every package under 1 MiB.' });
    expect(revised.catalog.retired).toEqual(['fr-002']);
    expect([...revised.ids]).toEqual([['refuse-missing', 'fr-003'], ['refuse-partial', 'fr-004']]);
    const refused = reviseCatalog(catalog, {
      rewrite: [{ id: 'fr-009', text: 'x', conditions: [], uncertainty: '' }], retire: ['nfr-001', 'nfr-001'],
      add: [element('bad', 'fixed', 'doc-001', 'A fixed requirement from a plan.')],
    });
    expect(refused.ok ? [] : refused.errors).toEqual(['rewrite.0.id: unknown element fr-009', 'retire.1: nfr-001 is corrected twice']);
    const badAdd = reviseCatalog(catalog, { rewrite: [], retire: [], add: [element('bad', 'fixed', 'doc-001', 'A fixed requirement from a plan.')] });
    expect(badAdd.ok ? [] : badAdd.errors).toEqual(['add.0.document: a fixed element cannot be read from a plan document']);
  });

  it('rejects an element whose document is not captured or cannot supply its kind, with its path', () => {
    const catalog = openElementCatalog(hash, manifest);
    const result = acceptElements(catalog, [
      element('a', 'functional', 'doc-002', 'From a principle.'),
      element('b', 'fixed', 'doc-001', 'From the plan.'),
      element('c', 'non-functional', 'doc-002', 'From a principle.'),
      element('d', 'recommendation', 'doc-009', 'Unknown document.'),
      element('a', 'recommendation', 'doc-002', 'Duplicate key.'),
      element('e', 'context', 'doc-002', 'Rationale of a principle.'),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      '0.document: a functional element cannot be read from a principle document',
      '1.document: a fixed element cannot be read from a plan document',
      '2.document: a non-functional element cannot be read from a principle document',
      '3.document: doc-009 is not a captured document',
      '4.key: duplicate submission-local key a',
      '5.document: a context element cannot be read from a principle document',
    ]);
  });

  it('parses each submitted element itself, so an ID-shaped key or empty text is an error with its path', () => {
    const result = acceptElements(sampleCatalog(), [
      element('fr-002', 'functional', 'doc-001', 'Shadows an issued ID.'),
      element('empty', 'functional', 'doc-001', ''),
    ]);
    expect(result).toEqual({ ok: false, errors: [
      '0.key: a submission-local key cannot take the form of an element ID',
      '1.text: Too small: expected string to have >=1 characters',
    ] });
  });

  it('keeps element text unbounded and free of byte facts, and refuses keys shaped like IDs', () => {
    expect(submittedElementSchema.safeParse({ ...element('k', 'fixed', 'doc-002', 'x'.repeat(20_000)) }).success).toBe(true);
    expect(submittedElementSchema.safeParse({ ...element('k', 'fixed', 'doc-002', 'x'), start: 0, end: 1 }).success).toBe(false);
    expect(submittedElementSchema.safeParse(element('fr-001', 'functional', 'doc-001', 'x')).success).toBe(false);
  });

  it('resolves citations through submission keys and active IDs, rejecting unknown and retired ones with their paths', () => {
    const catalog = sampleCatalog();
    const elements = new Set(catalog.elements.map(item => item.id));
    expect(resolveCitations(['render', 'fix-001'], { keys: new Map([['render', 'fr-001']]), elements }, 'entries.0.requirementRefs'))
      .toEqual({ ok: true, ids: ['fr-001', 'fix-001'] });
    expect(resolveCitations(['fr-001', 'fr-009', 'render'], { elements }, 'citedElements'))
      .toEqual({ ok: false, errors: ['citedElements.1: unknown element fr-009', 'citedElements.2: unknown element render'] });
  });

  it('serializes deterministically and hashes the serialized bytes', () => {
    const catalog = sampleCatalog();
    const reordered = elementCatalogSchema.parse(Object.fromEntries(Object.entries(catalog).reverse()));
    expect(serializeElementCatalog(reordered)).toBe(serializeElementCatalog(catalog));
    expect(elementCatalogHash(catalog)).toBe(createHash('sha256').update(serializeElementCatalog(catalog)).digest('hex'));
    expect(serializeElementCatalog(catalog).endsWith('}\n')).toBe(true);
  });
});

describe('createPackage', () => {
  it('renders the five kinds in order, context first and recommendations last with their fixed sentences, and each element whole', () => {
    const catalog = sampleCatalog();
    const result = createPackage({ catalog, planDeviations, elements: ['rec-002', 'fr-002', 'fix-001', 'nfr-001', 'ctx-001', 'rec-001', 'fr-001'], deviations: [] });
    if (!('text' in result)) throw new Error('unavailable');
    const { text } = result;
    const headings = text.split('\n').filter(line => line.startsWith('## '));
    expect(headings).toEqual(['## Context', '## Functional requirements', '## Non-functional requirements of the plan', '## Fixed requirements', '## Recommendations']);
    expect(text).toContain(`## Recommendations\n\n${recommendationNotice}\n\n### rec-001: recommendation from plans/example/plan.md`);
    expect(text).toContain(`## Context\n\n${contextNotice}\n\n### ctx-001: context from plans/example/plan.md`);
    expect(text.indexOf('### rec-001')).toBeLessThan(text.indexOf('### rec-002'));
    expect(text).toContain(`Elements: ctx-001, fr-001, fr-002, nfr-001, fix-001, rec-001, rec-002\nDeviations: none\n`);
    expect(text).toContain(`Catalog: ${elementCatalogHash(catalog)}\n`);
    expect(text).toContain('### fix-001: fixed requirement from docs/model/rules.principles.md');
    expect(text).toContain('Conditions:\n- stated: Only parent and descendants are destinations.\n- inferred: Order has no effect.');
    expect(text).toContain('Uncertainty: Whether wildcard rules belong here.');
    expect(text).toContain('Conditions: none recorded.\n\nUncertainty: none recorded.');
  });

  it('renders a 1,400-character element whole, with its own headings quoted', () => {
    expect(section.length).toBeGreaterThan(1_400);
    const result = createPackage({ catalog: sampleCatalog(), planDeviations, elements: ['fix-001'], deviations: [] });
    if (!('text' in result)) throw new Error('unavailable');
    const quoted = result.text.split('\n').filter(line => line.startsWith('>')).map(line => line.replace(/^> ?/, '')).join('\n');
    expect(quoted).toBe(section);
    expect(result.text).toContain('> ## Qualifications');
  });

  it('gives the same bytes and hash for the same IDs, whatever their order or repetition', () => {
    const catalog = sampleCatalog();
    const first = createPackage({ catalog, planDeviations, elements: ['fr-001', 'nfr-001'], deviations: ['pd-002', 'pd-001'] });
    const second = createPackage({ catalog, planDeviations, elements: ['nfr-001', 'fr-001', 'nfr-001'], deviations: ['pd-001', 'pd-002'] });
    expect(second).toEqual(first);
    if (!('text' in first)) throw new Error('unavailable');
    expect(first.hash).toBe(createHash('sha256').update(first.text).digest('hex'));
    expect(first.bytes).toBe(Buffer.byteLength(first.text));
  });

  it('is unavailable, never partial, when an element or deviation is missing, and names every missing ID', () => {
    const catalog = { ...sampleCatalog(), retired: ['fr-009'] };
    expect(createPackage({ catalog, planDeviations, elements: ['fr-001', 'fr-009', 'nfr-404'], deviations: ['pd-001', 'pd-777'] }))
      .toEqual({ unavailable: { missing: ['fr-009', 'nfr-404', 'pd-777'] } });
  });

  it('is unavailable when a named deviation amends an unknown element, and refuses malformed or duplicate deviations', () => {
    const amendsUnknown = [...planDeviations, { ...planDeviations[0]!, id: 'pd-003', amends: ['nfr-999'] }];
    expect(createPackage({ catalog: sampleCatalog(), planDeviations: amendsUnknown, elements: ['fr-001'], deviations: ['pd-003'] }))
      .toEqual({ unavailable: { missing: ['nfr-999'] } });
    expect(() => createPackage({ catalog: sampleCatalog(), planDeviations: [...planDeviations, planDeviations[0]!], elements: [], deviations: [] }))
      .toThrow('Duplicate plan deviation ID');
    expect(() => createPackage({ catalog: sampleCatalog(), planDeviations: [{ ...planDeviations[0]!, authority: '' }], elements: [], deviations: [] }))
      .toThrow();
    expect(() => createPackage({ catalog: sampleCatalog(), planDeviations: [{ ...planDeviations[0]!, amends: ['ctx-001'] }], elements: [], deviations: [] }))
      .toThrow('a deviation cannot amend context');
  });

  it('renders only the named deviations, after the elements, in recorded order', () => {
    const result = createPackage({ catalog: sampleCatalog(), planDeviations, elements: ['fr-001', 'rec-001'], deviations: ['pd-002'] });
    if (!('text' in result)) throw new Error('unavailable');
    expect(result.text).not.toContain('pd-001');
    expect(result.text.indexOf('## Plan deviations')).toBeGreaterThan(result.text.indexOf('### rec-001'));
    expect(result.text.endsWith([
      '## Plan deviations', '', deviationNotice, '',
      '### pd-002 amends nfr-001, fr-002', '', 'Authority: Recorded by the global architect for wi-002.', '', '> Allow up to 8 MiB.', '',
    ].join('\n'))).toBe(true);
  });

  it('never renders a locator', () => {
    const catalog = sampleCatalog();
    const located = { ...catalog, elements: catalog.elements.map(item => ({ ...item, locator: 'Section: Constraints' })) };
    const result = createPackage({ catalog: located, planDeviations: [], elements: ['nfr-001'], deviations: [] });
    expect('text' in result && result.text.includes('Constraints')).toBe(false);
  });
});
