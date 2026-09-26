import { describe, expect, test } from 'vitest';
import {
  acceptElements, createPackage, openElementCatalog, type ElementCatalog, type PackageDeviation, type SubmittedElement,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { prepareContextSelection } from '../context-selection/submissions.js';

const hash = 'a'.repeat(64);
const document = (id: string, path: string, kind: 'plan' | 'principle') => ({
  id, path, kind, sha256: hash, bytes: 1, storedAt: `input/documents/${id}.bin`, revision: { commit: null, dirty: null },
});
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [document('doc-001', 'plans/sample/plan.md', 'plan'), document('doc-002', 'docs/engineering.principles.md', 'principle')],
  missing: [], principlesScan: { status: 'complete', unreadable: [] },
});
const element = (key: string, kind: SubmittedElement['kind'], documentId: string, text: string): SubmittedElement =>
  ({ key, kind, document: documentId, text, conditions: [], uncertainty: '' });

/** nfr-001, rec-001, fix-001, ctx-001, fr-001 and fr-002. */
function sampleCatalog(): ElementCatalog {
  const accepted = acceptElements(openElementCatalog(hash, manifest), [
    { ...element('latency', 'non-functional', 'doc-001', 'Keep latency under 10ms when warm.'),
      conditions: [{ text: 'when warm', source: 'stated' }, { text: 'when the service is idle', source: 'inferred' }] },
    element('cache', 'recommendation', 'doc-001', 'A cache could help.'),
    element('bounded', 'fixed', 'doc-002', 'Use bounded work.'),
    element('today', 'context', 'doc-001', 'Today every lookup is uncached.'),
    element('request', 'functional', 'doc-001', 'Serve the lookup.'),
    element('acceptance', 'functional', 'doc-001', 'A warm lookup answers.'),
  ]);
  if (!accepted.ok) throw new Error(accepted.errors.join('\n'));
  return accepted.catalog;
}

const catalog = sampleCatalog();
const planDeviations: PackageDeviation[] = [
  { id: 'pd-001', amends: ['fr-001'], authority: 'The global architect, for wi-001', text: 'Serve the lookup from the cache only.' },
];
const identity = { workItem: 'wi-001', orientationInvocation: 'inv-orient', orientationPoint: 'point-1', selectorInvocation: 'inv-select', degraded: false };
const source = { catalog, workItemElements: ['fr-001', 'fr-002', 'ctx-001'], planDeviations };
const choice = (id: string) => ({ id, reason: `Applies: ${id}`, conditions: ['warm path'], uncertainty: '' });

describe('context selection preparation', () => {
  test('records the selector judgments by ID and cites the entry elements, the selection and every deviation', () => {
    const prepared = prepareContextSelection({ selected: [choice('nfr-001'), choice('rec-001'), choice('fix-001')] }, identity, source);
    expect(prepared.status).toBe('available');
    if (prepared.status !== 'available') return;
    expect(prepared.selection).toEqual({
      schema: 'ramify-agent.context-selection/2', ...identity,
      selected: [choice('nfr-001'), choice('rec-001'), choice('fix-001')],
      package: { elements: ['fr-001', 'fr-002', 'ctx-001', 'nfr-001', 'rec-001', 'fix-001'], deviations: ['pd-001'], hash: prepared.selection.package.hash },
    });
    const rendered = createPackage({ catalog, planDeviations, elements: prepared.selection.package.elements, deviations: ['pd-001'] });
    if ('unavailable' in rendered) throw new Error('fixture did not render');
    expect(prepared.text).toBe(rendered.text);
    expect(prepared.selection.package.hash).toBe(rendered.hash);
    for (const text of ['Serve the lookup.', 'A warm lookup answers.', 'Today every lookup is uncached.', 'Keep latency under 10ms when warm.',
      'stated: when warm', 'inferred: when the service is idle', 'A cache could help.', 'Use bounded work.', '### pd-001 amends fr-001', 'Serve the lookup from the cache only.']) {
      expect(prepared.text).toContain(text);
    }
    expect(prepared.selection.selected[0]).not.toHaveProperty('passage');
    expect(prepareContextSelection({ selected: [choice('nfr-001'), choice('rec-001'), choice('fix-001')] }, identity, source)).toEqual(prepared);
  });

  test('an empty selection still cites the work item elements and deviations', () => {
    const prepared = prepareContextSelection({ selected: [] }, identity, source);
    expect(prepared).toMatchObject({ status: 'available', selection: { selected: [], package: { elements: ['fr-001', 'fr-002', 'ctx-001'], deviations: ['pd-001'] } } });
    if (prepared.status === 'available') expect(prepared.text).not.toContain('Keep latency under 10ms when warm.');
  });

  test('rejects an unknown ID, a functional or context ID and a duplicate, each at its path', () => {
    const prepared = prepareContextSelection({ selected: [choice('nfr-009'), choice('fr-001'), choice('ctx-001'), choice('rec-001'), choice('rec-001')] }, identity, source);
    expect(prepared.status).toBe('unavailable');
    if (prepared.status !== 'unavailable') return;
    expect(prepared.errors.map(error => error.path)).toEqual(['selected.0.id', 'selected.1.id', 'selected.2.id', 'selected.4.id']);
    expect(prepared.errors[0]).toMatchObject({ message: 'Unknown element nfr-009' });
    expect(prepared.errors[1]).toMatchObject({ message: expect.stringContaining('functional element'), expected: 'a non-functional, fixed or recommendation element' });
    expect(prepared.errors[2]).toMatchObject({ message: expect.stringContaining('context element') });
    expect(prepared.errors[3]).toMatchObject({ message: 'rec-001 is selected twice', expected: 'each element once' });
  });

  test('a work item element the catalog does not hold makes the whole package unavailable', () => {
    const prepared = prepareContextSelection({ selected: [choice('nfr-001')] }, identity, { ...source, workItemElements: ['fr-001', 'fr-009'] });
    expect(prepared).toMatchObject({ status: 'unavailable', errors: [{ path: 'selected', message: expect.stringContaining('fr-009') }] });
  });
});
