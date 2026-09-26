import { createHash } from 'node:crypto';
import { z } from 'zod';

const text = z.string().min(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const documentId = z.string().regex(/^doc-\d{3,}$/);
const projectPath = z.string().min(1).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/.test(path) &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
  'a canonical project-relative path is required');

/** The manifest names immutable byte files; no document bytes enter a ledger line. */
export const capturedDocumentSchema = z.object({
  id: documentId,
  path: projectPath,
  kind: z.enum(['plan', 'principle']),
  sha256,
  bytes: z.int().nonnegative(),
  /** Run-relative immutable file, written through the harness's ledger effect. */
  storedAt: projectPath,
  /** The source revision when captured; a dirty source retains its content hash. */
  /** `dirty: null` means Git status was not measured for this document. */
  revision: z.object({ commit: text.nullable(), dirty: z.boolean().nullable() }).strict(),
}).strict();
export type CapturedDocument = z.infer<typeof capturedDocumentSchema>;

export const missingDocumentSchema = z.object({
  from: documentId,
  target: projectPath,
  source: z.object({ start: z.int().nonnegative(), end: z.int().positive() }).strict(),
  reason: text,
  /** Only the architect decides whether the gap blocks acceptance. */
  judgment: z.enum(['unjudged', 'required', 'unclear', 'advisory']),
}).strict();

export const documentManifestSchema = z.object({
  schema: z.literal('ramify-agent.document-manifest/1'),
  root: documentId,
  documents: z.array(capturedDocumentSchema).min(1),
  missing: z.array(missingDocumentSchema),
  principlesScan: z.object({
    status: z.enum(['complete', 'partial', 'empty']),
    /** `.` identifies the project root if even its directory listing fails. */
    unreadable: z.array(z.object({ path: z.union([projectPath, z.literal('.')]), reason: text }).strict()),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  value.documents.forEach((document, index) => {
    if (ids.has(document.id)) ctx.addIssue({ code: 'custom', path: ['documents', index, 'id'], message: 'duplicate document ID' });
    if (paths.has(document.path)) ctx.addIssue({ code: 'custom', path: ['documents', index, 'path'], message: 'duplicate canonical path' });
    ids.add(document.id);
    paths.add(document.path);
  });
  if (value.documents[0]?.id !== value.root || !/^plans\/[^/]+\/plan\.md$/.test(value.documents[0]?.path ?? '')) {
    ctx.addIssue({ code: 'custom', path: ['root'], message: 'the root plan must be the first document at plans/<id>/plan.md' });
  }
  if (value.documents[0]?.kind !== 'plan') ctx.addIssue({ code: 'custom', path: ['documents', 0, 'kind'], message: 'the root document is a plan' });
  value.missing.forEach((gap, index) => {
    if (!ids.has(gap.from)) ctx.addIssue({ code: 'custom', path: ['missing', index, 'from'], message: 'missing reference source is not captured' });
  });
  const principles = value.documents.filter(document => document.kind === 'principle').length;
  if ((value.principlesScan.status === 'empty') !== (principles === 0 && value.principlesScan.unreadable.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'empty means no principle documents or unreadable candidates' });
  }
  if (value.principlesScan.status === 'complete' && value.principlesScan.unreadable.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'unreadable candidates require partial coverage' });
  }
  if (value.principlesScan.status === 'partial' && value.principlesScan.unreadable.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'partial coverage names unreadable candidates' });
  }
});
export type DocumentManifest = z.infer<typeof documentManifestSchema>;

/** Verify the captured document bytes independently of any agent excerpt. */
export function verifyDocumentBytes(document: CapturedDocument, bytes: Uint8Array): boolean {
  return bytes.length === document.bytes && createHash('sha256').update(bytes).digest('hex') === document.sha256;
}
