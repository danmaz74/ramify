import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { Catalog, DocumentManifest, PassageReference } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { ContextSelection } from '../context-selection/contracts.js';
import { assembleContextPackage, validateAssignmentContext, validateContextSelection } from '../context-selection/selection.js';

const source = new TextEncoder().encode('Keep latency under 10ms when warm.\nA cache could help.\n');
const sha256 = createHash('sha256').update(source).digest('hex');
const planHash = 'a'.repeat(64);
const manifest: DocumentManifest = {
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [
    { id: 'doc-001', path: 'plans/sample/plan.md', kind: 'plan', sha256, bytes: source.length, storedAt: 'input/plan.md', revision: { commit: null, dirty: null } },
  ],
  missing: [], principlesScan: { status: 'empty', unreadable: [] },
};
const first: PassageReference = { document: 'doc-001', sha256, start: 0, end: 34, quote: 'Keep latency under 10ms when warm.' };
const second: PassageReference = { document: 'doc-001', sha256, start: 35, end: 54, quote: 'A cache could help.' };
const catalog: Catalog = {
  schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: planHash,
  items: [
    { id: 'nfr-001', classification: 'non-functional-requirement', passage: first, conditions: [{ text: 'when warm', source: 'stated' }, { text: 'when the service is idle', source: 'inferred' }], uncertainty: '' },
    { id: 'adv-001', classification: 'advice', passage: second, conditions: [], uncertainty: 'Suggestion only' },
  ],
};
const bytes = new Map([['doc-001', source]]);
const principleText = 'Use bounded work.\nReview each source.\n';
const principleBytes = new TextEncoder().encode(principleText);
const principleHash = createHash('sha256').update(principleBytes).digest('hex');
const principleManifest: DocumentManifest = {
  ...manifest,
  documents: [...manifest.documents, {
    id: 'doc-002', path: 'docs/engineering.principles.md', kind: 'principle', sha256: principleHash,
    bytes: principleBytes.length, storedAt: 'input/documents/doc-002.bin', revision: { commit: 'b'.repeat(40), dirty: false },
  }],
  principlesScan: { status: 'complete', unreadable: [] },
};
const principleBytesMap = new Map([...bytes, ['doc-002', principleBytes]]);
const base: Omit<ContextSelection, 'packageHash'> = {
  schema: 'ramify-agent.context-selection/1', workItem: 'wi-001',
  orientationInvocation: 'inv-orient', orientationPoint: 'point-1', selectorInvocation: 'inv-select', degraded: false,
  examined: ['nfr-001', 'adv-001'],
  selected: [{ item: 'nfr-001', passage: first, reason: 'The assigned service has a warm path', conditions: ['warm path'], uncertainty: '' }],
  unavailable: [],
};

describe('context selection package', () => {
  test('keeps exact source, classification, condition provenance, and stable bytes for reconstruction', () => {
    const assembled = assembleContextPackage(base, catalog, manifest, bytes);
    expect(assembled.status).toBe('available');
    if (assembled.status !== 'available') return;
    expect(assembled.text).toContain('Keep latency under 10ms when warm.');
    expect(assembled.text).toContain('non-functional-requirement');
    expect(assembled.text).toContain('stated: when warm');
    expect(assembled.text).toContain('inferred: when the service is idle');
    expect(assembled.text).toContain('Selection reason: The assigned service has a warm path');
    expect(assembled.text).not.toContain('A cache could help.');
    expect(assembleContextPackage(base, catalog, manifest, bytes)).toEqual(assembled);
    expect(validateContextSelection({ ...base, packageHash: assembled.hash }, catalog, manifest, bytes)).toEqual(assembled);
    expect(validateContextSelection({ ...base, packageHash: '0'.repeat(64) }, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
  });

  test('advice remains explicitly advice when selected', () => {
    const selected = { ...base, selected: [{ item: 'adv-001', passage: second, reason: 'May help', conditions: [], uncertainty: '' }] };
    const result = assembleContextPackage(selected, catalog, manifest, bytes);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.text).toContain('adv-001: advice');
      expect(result.text).toContain('A cache could help.');
      expect(result.text).not.toContain('Keep latency under 10ms when warm.');
    }
  });

  test('selects distinct exact passages from one captured principle with explicit scope judgment', () => {
    const selected = {
      ...base, examined: ['nfr-001', 'adv-001', 'doc-002'],
      selected: [
        ...base.selected,
        { item: 'doc-002', passage: { document: 'doc-002', sha256: principleHash, start: 0, end: 17, quote: 'Use bounded work.' }, reason: 'Applies to this work item', conditions: ['during preparation'], uncertainty: 'Scope inferred' },
        { item: 'doc-002', passage: { document: 'doc-002', sha256: principleHash, start: 18, end: 37, quote: 'Review each source.' }, reason: 'Applies to source review', conditions: [], uncertainty: '' },
      ],
    };
    const result = assembleContextPackage(selected, catalog, principleManifest, principleBytesMap);
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.text).toContain('doc-002: captured principle evidence');
    expect(result.text).toContain('Selector scope judgment: Applies to this work item');
    expect(result.text).toContain('Use bounded work.');
    expect(result.text).toContain('Review each source.');
    const context: ContextSelection = { ...selected, packageHash: result.hash };
    expect(validateAssignmentContext({ schema: 'ramify-agent.assignment-context/1', workItem: 'wi-001', assignment: 'as-001', selection: 'selection-1', citedItems: ['doc-002'], packageHash: result.hash }, context, 'selection-1')).toEqual([]);
    expect(assembleContextPackage({ ...selected, selected: [...selected.selected, selected.selected[1]!] }, catalog, principleManifest, principleBytesMap)).toMatchObject({ status: 'unavailable' });
    expect(assembleContextPackage({ ...selected, selected: [{ ...selected.selected[1]!, passage: first }] }, catalog, principleManifest, principleBytesMap)).toMatchObject({ status: 'unavailable' });
  });

  test('rejects a selected item outside the examined set or with a changed passage', () => {
    expect(assembleContextPackage({ ...base, examined: ['adv-001'] }, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
    expect(assembleContextPackage({ ...base, selected: [{ ...base.selected[0]!, passage: second }] }, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
    expect(assembleContextPackage({ ...base, examined: ['nfr-001', 'nfr-001'] }, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
  });

  test('missing source is unavailable, while a named unavailable item makes coverage incomplete', () => {
    expect(assembleContextPackage(base, catalog, manifest, new Map())).toMatchObject({ status: 'unavailable' });
    const partial = assembleContextPackage({ ...base, unavailable: [{ item: 'adv-001', reason: 'Captured file could not be read' }] }, catalog, manifest, bytes);
    expect(partial).toMatchObject({ status: 'available', complete: false });
    if (partial.status === 'available') expect(partial.text).toContain('adv-001: Captured file could not be read');
  });

  test('assignment citations must use selected IDs and the same package', () => {
    const built = assembleContextPackage(base, catalog, manifest, bytes);
    if (built.status !== 'available') throw new Error('fixture did not assemble');
    const selection: ContextSelection = { ...base, packageHash: built.hash };
    const assignment = { schema: 'ramify-agent.assignment-context/1', workItem: 'wi-001', assignment: 'as-001', selection: 'selection-1', citedItems: ['nfr-001'], packageHash: built.hash };
    expect(validateAssignmentContext(assignment, selection, 'selection-1')).toEqual([]);
    expect(validateAssignmentContext({ ...assignment, citedItems: ['adv-001'] }, selection, 'selection-1')).toContain('Assignment cites adv-001, which was not selected');
    expect(validateAssignmentContext({ ...assignment, packageHash: '0'.repeat(64) }, selection, 'selection-1')).toContain('Assignment names a different source package');
  });
});
