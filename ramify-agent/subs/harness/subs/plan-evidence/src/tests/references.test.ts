import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { documentManifestSchema } from '../interfaces/contracts.js';
import { resolvePlanReference } from '../references.js';

const text = '# Same\n  exact  words \n\n## Child\nKeep  spaces.\n';
const encoded = new TextEncoder().encode(text);
const digest = createHash('sha256').update(encoded).digest('hex');
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [{ id: 'doc-001', path: 'plans/p/plan.md', kind: 'plan', sha256: digest, bytes: encoded.length,
    storedAt: 'input/plan.md', revision: { commit: null, dirty: false } }],
  missing: [], principlesScan: { status: 'empty', unreadable: [] },
});
const bytes = new Map([['doc-001', encoded]]);

test('resolves exact whitespace in legacy root references and reports failures', () => {
  expect(resolvePlanReference(manifest, bytes, { lines: [2, 3] })).toMatchObject({ status: 'available', text: '  exact  words \n' });
  expect(resolvePlanReference(manifest, bytes, { anchor: 'same' })).toMatchObject({ status: 'available', text: '# Same\n  exact  words \n\n## Child\nKeep  spaces.\n' });
  expect(resolvePlanReference(manifest, bytes, { document: 'doc-002', lines: [2, 3] })).toMatchObject({ status: 'unavailable', reason: 'Unknown document doc-002' });
  expect(resolvePlanReference(manifest, bytes, { lines: [99, 100] }).status).toBe('unavailable');
  expect(resolvePlanReference(manifest, new Map(), { anchor: 'same' }).status).toBe('unavailable');
});
