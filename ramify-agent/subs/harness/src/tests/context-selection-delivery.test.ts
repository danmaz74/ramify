import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { ContextSelection } from '../context-selection/contracts.js';
import { assignmentDelivery, makeAssignmentContext } from '../context-selection/delivery.js';
import { assembleContextPackage } from '../context-selection/selection.js';

const digest = (input: string | Uint8Array): string => createHash('sha256').update(input).digest('hex');
const text = 'Keep latency under 10ms when warm.\nA cache could help.\n';
const source = new TextEncoder().encode(text);
const sourceHash = digest(source);
const first = { document: 'doc-001', sha256: sourceHash, start: 0, end: 34, quote: 'Keep latency under 10ms when warm.' };
const second = { document: 'doc-001', sha256: sourceHash, start: 35, end: 54, quote: 'A cache could help.' };
const manifest: DocumentManifest = {
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001', missing: [], principlesScan: { status: 'empty', unreadable: [] },
  documents: [{ id: 'doc-001', path: 'plans/sample/plan.md', kind: 'plan', sha256: sourceHash, bytes: source.length,
    storedAt: 'input/documents/doc-001.bin', revision: { commit: 'a'.repeat(40), dirty: false } }],
};
const catalog: Catalog = {
  schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: 'b'.repeat(64), items: [
    { id: 'nfr-001', classification: 'non-functional-requirement', passage: first,
      conditions: [{ text: 'when warm', source: 'stated' }, { text: 'under load', source: 'inferred' }], uncertainty: '' },
    { id: 'adv-001', classification: 'advice', passage: second, conditions: [], uncertainty: 'Only a suggestion' },
  ],
};
const bytes = new Map([['doc-001', source]]);
const selected = {
  schema: 'ramify-agent.context-selection/1' as const, workItem: 'wi-001', orientationInvocation: 'orient-1',
  orientationPoint: 'point-1', selectorInvocation: 'select-1', degraded: false, examined: ['nfr-001', 'adv-001'],
  selected: [
    { item: 'nfr-001', passage: first, reason: 'Applies to the warm path', conditions: ['warm requests'], uncertainty: '' },
    { item: 'adv-001', passage: second, reason: 'Possible optimization', conditions: [], uncertainty: 'Optional' },
  ], unavailable: [],
};
const full = assembleContextPackage(selected, catalog, manifest, bytes);
if (full.status !== 'available') throw new Error('invalid fixture');
const selection: ContextSelection = { ...selected, packageHash: full.hash };
const expected = { assignment: 'wi-001.i01', workItem: 'wi-001', selectionRef: 'work/wi-001/selection/record.json' };
const recorded = { selection, packageText: full.text };

describe('assignment source delivery', () => {
  test('binds only selected IDs and preserves the full source package hash', () => {
    const context = makeAssignmentContext(expected.assignment, expected.selectionRef, selection, ['nfr-001']);
    expect('errors' in context).toBe(false);
    if ('errors' in context) return;
    expect(context.packageHash).toBe(full.hash);
    const delivery = assignmentDelivery(context, expected, recorded, catalog, manifest, bytes);
    expect(delivery.status).toBe('available');
    if (delivery.status !== 'available') return;
    expect(delivery.text).toContain('Keep latency under 10ms when warm.');
    expect(delivery.text).toContain('non-functional-requirement');
    expect(delivery.text).toContain('stated: when warm');
    expect(delivery.text).toContain('inferred: under load');
    expect(delivery.text).toContain('plans/sample/plan.md');
    expect(delivery.text).toContain(`Full selection package SHA-256: ${full.hash}`);
    expect(delivery.text).not.toContain('A cache could help.');
    expect(assignmentDelivery(context, expected, recorded, catalog, manifest, bytes)).toEqual(delivery);
  });

  test('refuses unselected, duplicate, stale and cross-assignment citations', () => {
    expect(makeAssignmentContext(expected.assignment, expected.selectionRef, selection, ['nfr-002'])).toMatchObject({ errors: ['Assignment cites nfr-002, which was not selected'] });
    expect(makeAssignmentContext(expected.assignment, expected.selectionRef, selection, ['nfr-001', 'nfr-001'])).toMatchObject({ errors: ['Assignment cites nfr-001 twice'] });
    const context = makeAssignmentContext(expected.assignment, expected.selectionRef, selection, ['nfr-001']);
    if ('errors' in context) throw new Error('invalid fixture');
    expect(assignmentDelivery(context, { ...expected, assignment: 'wi-001.i02' }, recorded, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
    expect(assignmentDelivery(context, expected, { ...recorded, packageText: 'stale' }, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
    expect(assignmentDelivery({ ...context, selection: 'other' }, expected, recorded, catalog, manifest, bytes)).toMatchObject({ status: 'unavailable' });
    expect(assignmentDelivery(context, expected, recorded, catalog, manifest, new Map())).toMatchObject({ status: 'unavailable' });
  });
});
