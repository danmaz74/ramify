import { describe, expect, test } from 'vitest';
import { acceptElements, openElementCatalog, reviseCatalog, serializeElementCatalog, validateElementReferences, type ElementReferenceList, type SubmittedElement } from '../interfaces/catalog.js';
import { documentManifestSchema } from '../interfaces/contracts.js';

const hash = 'a'.repeat(64);
const manifest = documentManifestSchema.parse({ schema: 'ramify-agent.document-manifest/1', root: 'doc-001', documents: [
  { id: 'doc-001', path: 'plans/example/plan.md', kind: 'plan', sha256: hash, bytes: 1, storedAt: 'input/documents/doc-001.bin', revision: { commit: null, dirty: null } },
], missing: [], principlesScan: { status: 'empty', unreadable: [] } });
const element = (key: string, kind: SubmittedElement['kind'] = 'functional'): SubmittedElement => ({ key, kind, document: 'doc-001', text: `Requirement ${key}`, conditions: [], uncertainty: '' });
const field = (citations: readonly string[], allowedKinds: ElementReferenceList['allowedKinds'] = ['functional']): ElementReferenceList => ({ path: 'entries.cap-a.requirementRefs', citations, allowedKinds });

describe('Plan 23 C01/C02 catalog local-key validation', () => {
  test('missing and wrong-kind references name submitted keys before IDs are allocated; retry keeps the same next ID', () => {
    const catalog = openElementCatalog(hash, manifest); const before = serializeElementCatalog(catalog);
    const rejected = acceptElements(catalog, [element('req-a'), element('hyp-a', 'context')], [field(['req-a', 'missing-key', 'hyp-a'])]);
    expect(rejected).toEqual({ ok: false, errors: [
      'entries.cap-a.requirementRefs.1: unknown element reference "missing-key"',
      'entries.cap-a.requirementRefs.2: reference "hyp-a" is context; expected functional',
    ] });
    expect(serializeElementCatalog(catalog)).toBe(before);
    const retry = acceptElements(catalog, [element('req-a'), element('hyp-a', 'context')], [field(['req-a']), field(['hyp-a'], ['context'])]);
    expect(retry.ok && [...retry.ids]).toEqual([['req-a', 'fr-001'], ['hyp-a', 'ctx-001']]);
    expect(retry).toEqual(acceptElements(catalog, [element('req-a'), element('hyp-a', 'context')], [field(['req-a']), field(['hyp-a'], ['context'])]));
  });
  test('duplicate and malformed submitted elements identify their original keys and leave issued IDs untouched', () => {
    const catalog = openElementCatalog(hash, manifest);
    const duplicate = acceptElements(catalog, [element('cap-a'), element('cap-a')]);
    expect(duplicate).toEqual({ ok: false, errors: ['1.key: duplicate submission-local key cap-a'] });
    const invalid = acceptElements(catalog, [{ ...element('req-a'), text: '' }]);
    expect(invalid.ok ? [] : invalid.errors).toEqual(['0.text: Too small: expected string to have >=1 characters (submitted key "req-a")']);
    expect(acceptElements(catalog, [element('cap-a')])).toMatchObject({ ok: true, ids: new Map([['cap-a', 'fr-001']]) });
    expect(catalog.elements).toEqual([]);
  });
  test('retire-only revisions succeed without additions and never reissue the retired identity', () => {
    const initial = acceptElements(openElementCatalog(hash, manifest), [element('req-a'), element('cap-a')]); if (!initial.ok) throw new Error('fixture');
    const retired = reviseCatalog(initial.catalog, { rewrite: [], retire: ['fr-002'], add: [], references: [field(['fr-001'])] });
    expect(retired).toMatchObject({ ok: true, ids: new Map(), catalog: { elements: [{ id: 'fr-001' }], retired: ['fr-002'] } });
    if (!retired.ok) throw new Error('retirement rejected');
    expect(acceptElements(retired.catalog, [element('next')])).toMatchObject({ ok: true, ids: new Map([['next', 'fr-003']]) });
  });
  test('revision references reject retired IDs/new wrong-kind keys atomically and retry does not advance IDs', () => {
    const initial = acceptElements(openElementCatalog(hash, manifest), [element('req-a')]); if (!initial.ok) throw new Error('fixture');
    const before = serializeElementCatalog(initial.catalog);
    expect(reviseCatalog(initial.catalog, { rewrite: [], retire: ['fr-001'], add: [element('replacement')], references: [field(['fr-001'])] }))
      .toEqual({ ok: false, errors: ['entries.cap-a.requirementRefs.0: unknown element reference "fr-001"'] });
    expect(serializeElementCatalog(initial.catalog)).toBe(before);
    expect(reviseCatalog(initial.catalog, { rewrite: [], retire: ['fr-001'], add: [element('replacement')], references: [field(['replacement'])] }))
      .toMatchObject({ ok: true, ids: new Map([['replacement', 'fr-002']]), catalog: { retired: ['fr-001'] } });
  });
  test('each list enforces its supplied kind set, including multiple legal kinds and no permitted kind', () => {
    const catalog = openElementCatalog(hash, manifest); const submitted = [element('req-a'), element('context-a', 'context'), element('recommend-a', 'recommendation')];
    expect(validateElementReferences([field(['req-a', 'recommend-a'], ['functional', 'recommendation']), field(['context-a'], ['context'])], catalog, submitted)).toEqual([]);
    expect(validateElementReferences([field(['context-a']), field(['req-a'], [])], catalog, submitted)).toEqual([
      'entries.cap-a.requirementRefs.0: reference "context-a" is context; expected functional',
      'entries.cap-a.requirementRefs.0: reference "req-a" is functional; expected no element kinds',
    ]);
  });
  test('scenario identities stay references, with Gherkin refused as an element field', () => {
    const catalog = openElementCatalog(hash, manifest);
    const rejected = acceptElements(catalog, [{ ...element('req-a'), gherkin: 'Scenario: duplicate\n Given something' }]);
    expect(rejected.ok).toBe(false); if (rejected.ok) return;
    expect(rejected.errors.join(' ')).toContain('gherkin'); expect(rejected.errors.join(' ')).toContain('req-a');
  });
});
