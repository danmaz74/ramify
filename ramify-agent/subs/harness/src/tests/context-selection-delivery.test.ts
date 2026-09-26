import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  acceptElements, createPackage, openElementCatalog, type PackageDeviation, type SubmittedElement,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { ContextSelection } from '../context-selection/contracts.js';
import { citePackage, deliverPackage } from '../context-selection/delivery.js';
import { readRecordedContextSelection } from '../context-selection/recorded.js';
import type { RunEventOf } from '../run/log.js';
import { runLayout } from '../run/records.js';

const hash = 'a'.repeat(64);
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001', missing: [], principlesScan: { status: 'empty', unreadable: [] },
  documents: [{ id: 'doc-001', path: 'plans/sample/plan.md', kind: 'plan', sha256: hash, bytes: 1,
    storedAt: 'input/documents/doc-001.bin', revision: { commit: 'a'.repeat(40), dirty: false } }],
});
const element = (key: string, kind: SubmittedElement['kind'], text: string): SubmittedElement =>
  ({ key, kind, document: 'doc-001', text, conditions: [], uncertainty: '' });
const accepted = acceptElements(openElementCatalog(hash, manifest), [
  { ...element('latency', 'non-functional', 'Keep latency under 10ms when warm.'),
    conditions: [{ text: 'when warm', source: 'stated' }, { text: 'under load', source: 'inferred' }] },
  { ...element('cache', 'recommendation', 'A cache could help.'), uncertainty: 'Only a suggestion' },
  element('request', 'functional', 'Serve the lookup.'),
]);
if (!accepted.ok) throw new Error(accepted.errors.join('\n'));
const catalog = accepted.catalog;
const planDeviations: PackageDeviation[] = [
  { id: 'pd-001', amends: ['fr-001'], authority: 'The global architect, for wi-001', text: 'Serve the lookup from the cache.' },
];

describe('package citation and delivery', () => {
  test('a cited package renders again to the same bytes, in any request order', () => {
    const cited = citePackage(catalog, planDeviations, ['nfr-001', 'fr-001', 'nfr-001'], ['pd-001']);
    if ('missing' in cited) throw new Error('fixture did not cite');
    expect(cited.citation).toEqual({ elements: ['nfr-001', 'fr-001'], deviations: ['pd-001'], hash: createHash('sha256').update(cited.text).digest('hex') });
    for (const text of ['Keep latency under 10ms when warm.', 'stated: when warm', 'inferred: under load', 'plans/sample/plan.md', 'Serve the lookup from the cache.']) {
      expect(cited.text).toContain(text);
    }
    expect(cited.text).not.toContain('A cache could help.');
    expect(deliverPackage(catalog, planDeviations, cited.citation)).toEqual({ status: 'available', text: cited.text, hash: cited.citation.hash });
    expect(deliverPackage(catalog, planDeviations, { ...cited.citation, elements: ['fr-001', 'nfr-001'] })).toEqual({ status: 'available', text: cited.text, hash: cited.citation.hash });
  });

  test('a missing ID or a rendering that differs from the recorded hash is unavailable, never partial', () => {
    expect(citePackage(catalog, planDeviations, ['nfr-001', 'nfr-009'], [])).toEqual({ missing: ['nfr-009'] });
    expect(citePackage(catalog, planDeviations, ['nfr-001'], ['pd-002'])).toEqual({ missing: ['pd-002'] });
    const cited = citePackage(catalog, planDeviations, ['nfr-001', 'fr-001'], ['pd-001']);
    if ('missing' in cited) throw new Error('fixture did not cite');
    const missing = deliverPackage(catalog, planDeviations, { ...cited.citation, elements: ['nfr-001', 'fr-001', 'rec-009'] });
    expect(missing).toEqual({ status: 'unavailable', reason: expect.stringContaining('rec-009') });
    expect(missing).not.toHaveProperty('text');
    expect(deliverPackage(catalog, [], cited.citation)).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('pd-001') });
    expect(deliverPackage(catalog, planDeviations, { ...cited.citation, hash: '0'.repeat(64) }))
      .toEqual({ status: 'unavailable', reason: 'The package renders to other bytes than its citing record recorded' });
    const reworded = [{ ...planDeviations[0]!, text: 'Another amendment.' }];
    expect(deliverPackage(catalog, reworded, cited.citation)).toMatchObject({ status: 'unavailable' });
  });
});

describe('recorded context selection', () => {
  let directory: string | undefined;
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined; });

  async function recorded(selection: ContextSelection): Promise<RunEventOf<'context-selection-recorded'>> {
    directory = await mkdtemp(join(tmpdir(), 'ramify-selection-'));
    const bytes = `${JSON.stringify(selection)}\n`;
    const selectionHash = createHash('sha256').update(bytes).digest('hex');
    const path = runLayout.selectionVersion(selection.workItem, selectionHash);
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), bytes);
    return { sequence: 1, at: '2026-09-26T00:00:00.000Z', type: 'context-selection-recorded',
      data: { workItem: selection.workItem, selection: path, selectionHash, packageHash: selection.package.hash } } as RunEventOf<'context-selection-recorded'>;
  }

  const selection = (): ContextSelection => {
    const cited = citePackage(catalog, planDeviations, ['fr-001', 'nfr-001'], ['pd-001']);
    if ('missing' in cited) throw new Error('fixture did not cite');
    return {
      schema: 'ramify-agent.context-selection/2', workItem: 'wi-001', orientationInvocation: 'inv-0005', orientationPoint: 'point-1',
      selectorInvocation: 'inv-0006', degraded: false, selected: [{ id: 'nfr-001', reason: 'Warm path', conditions: [], uncertainty: '' }], package: cited.citation,
    };
  };

  test('reads the bound selection and renders its package again', async () => {
    const event = await recorded(selection());
    const read = await readRecordedContextSelection(directory!, event, catalog, planDeviations);
    const rendered = createPackage({ catalog, planDeviations, elements: ['fr-001', 'nfr-001'], deviations: ['pd-001'] });
    if ('unavailable' in rendered) throw new Error('fixture did not render');
    expect(read).toEqual({ status: 'available', selection: selection(), packageText: rendered.text });
  });

  test('a changed catalog, a missing deviation, a package hash mismatch or other bytes are unavailable', async () => {
    const event = await recorded(selection());
    expect(await readRecordedContextSelection(directory!, event, catalog, [])).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('pd-001') });
    const retired = { ...catalog, elements: catalog.elements.filter(item => item.id !== 'nfr-001'), retired: ['nfr-001'] };
    expect(await readRecordedContextSelection(directory!, event, retired, planDeviations)).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('nfr-001') });
    expect(await readRecordedContextSelection(directory!, { ...event, data: { ...event.data, packageHash: '0'.repeat(64) } }, catalog, planDeviations))
      .toEqual({ status: 'unavailable', reason: 'Selection record differs from committed event' });
    expect(await readRecordedContextSelection(directory!, { ...event, data: { ...event.data, selectionHash: '0'.repeat(64) } }, catalog, planDeviations))
      .toEqual({ status: 'unavailable', reason: 'Selection event names an invalid immutable path' });
    await writeFile(join(directory!, event.data.selection), '{}\n');
    expect(await readRecordedContextSelection(directory!, event, catalog, planDeviations)).toEqual({ status: 'unavailable', reason: 'Selection differs from committed hash' });
  });
});
