import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { documentManifestSchema, verifyDocumentBytes } from '../interfaces/contracts.js';

const bytes = new TextEncoder().encode('# Plan\n  Keep spacing.\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const doc = { id: 'doc-001', path: 'plans/example/plan.md', kind: 'plan', sha256: hash, bytes: bytes.length,
  storedAt: 'input/documents/doc-001.bin', revision: { commit: null, dirty: true } };
const manifest = documentManifestSchema.parse({ schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [doc, { ...doc, id: 'doc-002', path: 'plans/example/notes.md', storedAt: 'input/documents/doc-002.bin' }], missing: [],
  principlesScan: { status: 'empty', unreadable: [] } });

describe('captured document contracts', () => {
  it('accepts a multi-document manifest and verifies captured bytes by size and hash', () => {
    expect(manifest.documents).toHaveLength(2);
    expect(verifyDocumentBytes(manifest.documents[0]!, bytes)).toBe(true);
    expect(verifyDocumentBytes(manifest.documents[0]!, new TextEncoder().encode('# Plan\n'))).toBe(false);
  });

  it('refuses two documents at one canonical path', () => {
    expect(documentManifestSchema.safeParse({ ...manifest, documents: [manifest.documents[0], { ...manifest.documents[1], path: doc.path }] }).success).toBe(false);
  });
});
