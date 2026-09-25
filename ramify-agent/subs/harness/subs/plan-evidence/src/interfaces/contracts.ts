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
  revision: z.object({ commit: text.nullable(), dirty: z.boolean() }).strict(),
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
    unreadable: z.array(z.object({ path: projectPath, reason: text }).strict()),
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

/** Byte offsets are half-open, over the exact captured UTF-8 source. */
export const passageReferenceSchema = z.object({
  document: documentId,
  sha256,
  start: z.int().nonnegative(),
  end: z.int().positive(),
  quote: text,
}).strict().refine(value => value.end > value.start, 'end must follow start');
export type PassageReference = z.infer<typeof passageReferenceSchema>;

const conditionSchema = z.object({ text, source: z.enum(['stated', 'inferred']) }).strict();
export const catalogItemSchema = z.object({
  id: z.string().regex(/^(nfr|adv)-\d{3,}$/),
  classification: z.enum(['non-functional-requirement', 'advice']),
  passage: passageReferenceSchema,
  conditions: z.array(conditionSchema),
  uncertainty: z.string(),
}).strict().superRefine((item, ctx) => {
  const prefix = item.classification === 'advice' ? 'adv-' : 'nfr-';
  if (!item.id.startsWith(prefix)) ctx.addIssue({ code: 'custom', path: ['id'], message: 'ID prefix disagrees with classification' });
});
export const catalogSchema = z.object({
  schema: z.literal('ramify-agent.nonfunctional-catalog/1'),
  manifestHash: sha256,
  items: z.array(catalogItemSchema),
}).strict();
export type Catalog = z.infer<typeof catalogSchema>;

/** Stable IDs follow captured document order, then byte position within each class. */
export function validateCatalog(catalog: Catalog, manifest: DocumentManifest, bytes: ReadonlyMap<string, Uint8Array>): string[] {
  const errors: string[] = [];
  const order = new Map(manifest.documents.map((document, index) => [document.id, index]));
  const sorted = [...catalog.items].sort((a, b) =>
    (order.get(a.passage.document) ?? Infinity) - (order.get(b.passage.document) ?? Infinity) ||
    a.passage.start - b.passage.start || a.passage.end - b.passage.end);
  if (sorted.some((item, index) => item !== catalog.items[index])) errors.push('catalog items are not in document and passage order');
  const counters = { 'non-functional-requirement': 0, advice: 0 };
  for (const item of catalog.items) {
    const next = ++counters[item.classification];
    const expected = `${item.classification === 'advice' ? 'adv' : 'nfr'}-${String(next).padStart(3, '0')}`;
    if (item.id !== expected) errors.push(`${item.id} must be ${expected}`);
    const resolved = resolvePassage(manifest, item.passage, bytes.get(item.passage.document));
    if (resolved.status === 'unavailable') errors.push(`${item.id}: ${resolved.reason}`);
  }
  return errors;
}

/** Verify a manifest against the immutable bytes before accepting any citation. */
export function verifyDocumentBytes(document: CapturedDocument, bytes: Uint8Array): boolean {
  return bytes.length === document.bytes && createHash('sha256').update(bytes).digest('hex') === document.sha256;
}

export type PassageResult = { readonly status: 'available'; readonly text: string } |
  { readonly status: 'unavailable'; readonly reason: string };

/** Preserve whitespace and report every absence or hash mismatch. */
export function resolvePassage(manifest: DocumentManifest, reference: PassageReference, bytes: Uint8Array | undefined): PassageResult {
  if (reference.start < 0 || reference.end <= reference.start) return { status: 'unavailable', reason: 'Invalid passage offsets' };
  const document = manifest.documents.find(item => item.id === reference.document);
  if (document === undefined) return { status: 'unavailable', reason: `Unknown document ${reference.document}` };
  if (document.sha256 !== reference.sha256) return { status: 'unavailable', reason: `Changed hash for ${document.path}` };
  if (bytes === undefined || !verifyDocumentBytes(document, bytes)) return { status: 'unavailable', reason: `Unavailable or changed bytes for ${document.path}` };
  if (reference.end > bytes.length) return { status: 'unavailable', reason: `Passage exceeds ${document.path}` };
  let quoted: string;
  try {
    quoted = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(reference.start, reference.end));
  } catch {
    return { status: 'unavailable', reason: `Passage cuts a UTF-8 sequence in ${document.path}` };
  }
  return quoted === reference.quote ? { status: 'available', text: quoted } :
    { status: 'unavailable', reason: `Passage quote differs from ${document.path}` };
}
