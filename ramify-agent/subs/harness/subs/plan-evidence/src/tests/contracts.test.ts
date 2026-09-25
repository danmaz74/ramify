import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { catalogSchema, documentManifestSchema, resolvePassage, validateCatalog, verifyDocumentBytes } from '../interfaces/contracts.js';

const bytes = new TextEncoder().encode('# Plan\n  Keep spacing.\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const doc = { id: 'doc-001', path: 'plans/example/plan.md', kind: 'plan', sha256: hash, bytes: bytes.length,
  storedAt: 'input/documents/doc-001.bin', revision: { commit: null, dirty: true } };
const manifest = documentManifestSchema.parse({ schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [doc, { ...doc, id: 'doc-002', path: 'plans/example/notes.md', storedAt: 'input/documents/doc-002.bin' }], missing: [],
  principlesScan: { status: 'empty', unreadable: [] } });

describe('captured document contracts', () => {
  it('accepts a multi-document manifest and retains exact whitespace in a cited byte span', () => {
    expect(manifest.documents).toHaveLength(2);
    const reference = { document: 'doc-001', sha256: hash, start: 7, end: 22, quote: '  Keep spacing.' };
    expect(resolvePassage(manifest, reference, bytes)).toEqual({ status: 'available', text: '  Keep spacing.' });
    expect(verifyDocumentBytes(manifest.documents[0]!, bytes)).toBe(true);
  });

  it('rejects changed hashes, invalid spans, and duplicate canonical paths', () => {
    expect(resolvePassage(manifest, { document: 'doc-001', sha256: 'b'.repeat(64), start: 7, end: 22, quote: '  Keep spacing.' }, bytes).status).toBe('unavailable');
    expect(resolvePassage(manifest, { document: 'doc-001', sha256: hash, start: 22, end: 7, quote: 'x' }, bytes).status).toBe('unavailable');
    expect(resolvePassage(manifest, { document: 'doc-001', sha256: hash, start: 7, end: 22, quote: 'Keep spacing.' }, bytes).status).toBe('unavailable');
    expect(documentManifestSchema.safeParse({ ...manifest, documents: [manifest.documents[0], { ...manifest.documents[1], path: doc.path }] }).success).toBe(false);
  });

  it('requires stable catalog IDs and every exact source passage', () => {
    const catalog = catalogSchema.parse({ schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: hash, items: [
      { id: 'nfr-001', classification: 'non-functional-requirement', passage: { document: 'doc-001', sha256: hash, start: 7, end: 22, quote: '  Keep spacing.' }, conditions: [], uncertainty: '' },
    ] });
    expect(validateCatalog(catalog, manifest, new Map([['doc-001', bytes]]))).toEqual([]);
    expect(validateCatalog({ ...catalog, items: [{ ...catalog.items[0]!, id: 'nfr-002' }] }, manifest, new Map([['doc-001', bytes]]))).toContain('nfr-002 must be nfr-001');
  });
});
